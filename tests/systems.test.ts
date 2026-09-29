import { afterEach, describe, expect, it, vi } from 'vitest';
import { MockStoreService } from '../src/client/platform/store/MockStoreService';
import { migrate, newSave, SaveManager, validate } from '../src/client/services/save';
import { MemoryKV } from '../src/client/services/storage';
import { quantizeInput, type InputFrame } from '../src/core/input';
import { decodeInputs, encodeInputs, fromBase64, parseReplay, serializeReplay, toBase64 } from '../src/core/replay';

describe('local saves never silently lose progress', () => {
  const withProgress = (n: number) => {
    const d = newSave();
    d.regionsReached = n;
    d.everCollected = ['f30', 'f29'].slice(0, n);
    return d;
  };

  it('round-trips a save', () => {
    const kv = new MemoryKV();
    const m = new SaveManager(kv);
    const d = withProgress(2);
    expect(m.save(d, true)).toBe(true);
    const r = new SaveManager(kv).load();
    expect(r.source).toBe('main');
    expect(r.corrupt).toBe(false);
    expect(r.data.regionsReached).toBe(2);
  });

  it('a damaged save falls back to the newest good backup, and the damaged file is kept', () => {
    const kv = new MemoryKV();
    const m = new SaveManager(kv);
    m.save(withProgress(1), true);
    m.save(withProgress(2), true); // the save with progress 1 becomes a backup
    kv.set('vertigo.save', kv.get('vertigo.save')!.slice(0, 40)); // truncated write
    const r = new SaveManager(kv).load();
    expect(r.corrupt).toBe(true);
    expect(r.source).toBe('backup');
    expect(r.data.regionsReached).toBe(1);
    expect(kv.keys('vertigo.save.corrupt.').length).toBe(1);
    // the recovered save is written back as the main save
    expect(new SaveManager(kv).load().source).toBe('main');
  });

  it('a tampered save fails its checksum like a damaged one', () => {
    const kv = new MemoryKV();
    new SaveManager(kv).save(withProgress(1), true);
    const env = JSON.parse(kv.get('vertigo.save')!);
    env.data = env.data.replace('"regionsReached":1', '"regionsReached":9');
    kv.set('vertigo.save', JSON.stringify(env));
    const r = new SaveManager(kv).load();
    expect(r.corrupt).toBe(true);
    expect(r.data.regionsReached).not.toBe(9);
  });

  it('with nothing to recover it starts fresh but keeps the damaged file for support', () => {
    const kv = new MemoryKV();
    kv.set('vertigo.save', 'not a save at all');
    const r = new SaveManager(kv).load();
    expect(r.source).toBe('fresh');
    expect(r.corrupt).toBe(true);
    expect(kv.get(kv.keys('vertigo.save.corrupt.')[0])).toBe('not a save at all');
  });

  it('when storage is full the write fails loudly and the previous save survives', () => {
    const kv = new MemoryKV();
    const m = new SaveManager(kv);
    m.save(withProgress(1), true);
    kv.quota = 10;
    const d = withProgress(2);
    d.lettersRead = new Array(500).fill('f1');
    expect(m.save(d)).toBe(false);
    expect(m.lastError).toBeTruthy();
    kv.quota = Infinity;
    expect(new SaveManager(kv).load().data.regionsReached).toBe(1);
  });

  it('upgrades old saves without dropping what it does not know', () => {
    const v1 = { ...newSave(), version: 1, equipped: ['outfit.lowmark'], futureField: 42 } as unknown as Record<string, unknown>;
    delete v1.outbox;
    const d = migrate(v1);
    expect(d.version).toBeGreaterThan(1);
    expect(Array.isArray(d.outbox)).toBe(true);
    expect(d.equipped.outfit).toBe('outfit.lowmark');
    expect((d as unknown as Record<string, unknown>).futureField).toBe(42);
  });

  it('rejects saves that parse but are nonsense', () => {
    expect(validate({ ...newSave(), profileId: '' })).toBe(false);
    expect(validate({ ...newSave(), everCollected: 'x' } as never)).toBe(false);
    expect(validate(newSave())).toBe(true);
  });

  it('exports and imports a save as text', () => {
    const m = new SaveManager(new MemoryKV());
    const d = withProgress(2);
    const back = m.importString(m.exportString(d));
    expect(back?.regionsReached).toBe(2);
    expect(m.importString('garbage')).toBeNull();
  });
});

describe('test store behaves like a real store', () => {
  afterEach(() => vi.useRealTimers());

  it('buys once, refuses duplicates, restores after restart', async () => {
    vi.useFakeTimers();
    const kv = new MemoryKV();
    const s = new MockStoreService(kv);
    await s.init();
    const changed: string[][] = [];
    s.onEntitlementsChanged((ids) => changed.push(ids));
    const p = s.purchase('vertigo.outfit.night');
    await vi.advanceTimersByTimeAsync(500);
    expect(await p).toMatchObject({ status: 'success', grants: ['outfit.night'] });
    const again = s.purchase('vertigo.outfit.night');
    await vi.advanceTimersByTimeAsync(500);
    expect(await again).toMatchObject({ status: 'failed', error: 'already-owned' });
    expect(changed.length).toBe(1);
    const s2 = new MockStoreService(kv);
    await s2.init();
    expect(await s2.restore()).toEqual(['outfit.night']);
  });

  it('failed, cancelled and unknown purchases grant nothing', async () => {
    vi.useFakeTimers();
    for (const [forced, status] of [
      ['fail', 'failed'],
      ['cancel', 'cancelled'],
    ] as const) {
      const s = new MockStoreService(new MemoryKV(), forced);
      await s.init();
      const p = s.purchase('vertigo.scarf.ember');
      await vi.advanceTimersByTimeAsync(500);
      expect((await p).status).toBe(status);
      expect(s.entitlements()).toEqual([]);
    }
    const s = new MockStoreService(new MemoryKV());
    expect(await s.purchase('vertigo.double.jump')).toMatchObject({ status: 'failed', error: 'unknown-sku' });
  });

  it('a pending purchase completes later, even across a restart', async () => {
    vi.useFakeTimers();
    const kv = new MemoryKV();
    const s = new MockStoreService(kv, 'pending');
    await s.init();
    const p = s.purchase('vertigo.gloves.lantern');
    await vi.advanceTimersByTimeAsync(500);
    expect((await p).status).toBe('pending');
    expect(s.pending()).toEqual(['vertigo.gloves.lantern']);
    // the app closes before the store confirms; on the next launch it resolves
    const s2 = new MockStoreService(kv);
    await s2.init();
    const got: string[][] = [];
    s2.onEntitlementsChanged((ids) => got.push(ids));
    await vi.advanceTimersByTimeAsync(2000);
    expect(got.at(-1)).toEqual(['gloves.lantern']);
  });
});

describe('replays', () => {
  const rnd = (seed: number) => () => {
    seed = (seed * 1103515245 + 12345) & 0x7fffffff;
    return seed / 0x7fffffff;
  };

  it('encode and decode exactly, including long runs of one input', () => {
    const r = rnd(7);
    const inputs: InputFrame[] = [];
    for (let i = 0; i < 4000; i++) {
      // include values that round to zero from below (a stick resting just off centre)
      const axis = () => (r() < 0.2 ? -r() * 0.003 : r() * 2 - 1);
      const f = quantizeInput({ mx: axis(), mz: axis(), yaw: r() * 6.28, btn: Math.floor(r() * 64) });
      const n = r() < 0.05 ? Math.floor(r() * 300) : 1;
      for (let k = 0; k < n; k++) inputs.push(f);
    }
    const back = decodeInputs(fromBase64(toBase64(encodeInputs(inputs))));
    expect(back.length).toBe(inputs.length);
    // bit-exact, signed zeros included
    const same = (a: InputFrame, b: InputFrame) => Object.is(a.mx, b.mx) && Object.is(a.mz, b.mz) && Object.is(a.yaw, b.yaw) && a.btn === b.btn;
    expect(back.findIndex((f, i) => !same(f, inputs[i]))).toBe(-1);
  });

  it('refuse malformed or oversized data', () => {
    const header = { simVersion: 'x', worldHash: 'y', mode: 'trial', track: 't', abilities: 3, flags: [], spawn: { pos: { x: 0, y: 0, z: 0 }, yaw: 0 }, ticks: 1 };
    const ok = serializeReplay({ header: header as never, inputs: new Array(10).fill(quantizeInput({ mx: 0, mz: 1, yaw: 0, btn: 0 })) });
    expect(parseReplay(ok).inputs.length).toBe(10);
    expect(() => parseReplay(ok, 5)).toThrow();
    expect(() => parseReplay(JSON.stringify({ h: { ...header, spawn: { pos: { x: 'a' } } }, i: '' }))).toThrow();
    expect(() => parseReplay(JSON.stringify({ h: { ...header, flags: [1] }, i: '' }))).toThrow();
    expect(() => parseReplay('{')).toThrow();
  });
});
