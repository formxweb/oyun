import type { AddressInfo } from 'node:net';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { createGameServer, type GameServer } from '../server/app';
import { Db } from '../server/db';
import type { GoogleApi, GoogleProductPurchase, SteamApi, SteamTxnItem, SteamUser } from '../server/platforms';
import { runTrial } from '../src/core/bot';
import { parseReplay, serializeReplay, SIM_VERSION, worldHash } from '../src/core/replay';

/**
 * Backend behaviour through its real HTTP interface, with the platform services (Steam,
 * Google) replaced by fakes that behave like them.
 */

class FakeSteam implements SteamApi {
  currency = 'USD';
  txns = new Map<string, string>();
  items = new Map<string, SteamTxnItem>();
  refunded: string[] = [];
  async authenticate(ticket: string): Promise<SteamUser | null> {
    if (ticket === 'aa11') return { steamId: '76561198000000001', banned: false };
    if (ticket === 'bb22') return { steamId: '76561198000000002', banned: true };
    return null;
  }
  async userInfo() {
    return { currency: this.currency, country: 'US' };
  }
  async initTxn(orderId: string, _steamId: string, _lang: string, _cur: string, item: SteamTxnItem) {
    this.txns.set(orderId, 'Init');
    this.items.set(orderId, item);
    return { ok: true };
  }
  /** what the Steam overlay does when the user clicks Authorize */
  authorize(orderId: string): void {
    this.txns.set(orderId, 'Approved');
  }
  async finalizeTxn(orderId: string) {
    if (this.txns.get(orderId) !== 'Approved') return { ok: false, error: 'not approved' };
    this.txns.set(orderId, 'Succeeded');
    return { ok: true };
  }
  async queryTxn(orderId: string) {
    return this.txns.get(orderId) ?? null;
  }
  async report() {
    return this.refunded.map((orderId) => ({ orderId, status: 'Refunded' }));
  }
}

class FakeGoogle implements GoogleApi {
  purchases = new Map<string, GoogleProductPurchase>();
  acks: string[] = [];
  voidedTokens: string[] = [];
  async playerFromAuthCode(code: string) {
    return code === 'good-code' ? { playerId: 'g-123', name: 'Play Player' } : null;
  }
  async getPurchase(_sku: string, token: string) {
    return this.purchases.get(token) ?? null;
  }
  async acknowledge(_sku: string, token: string) {
    this.acks.push(token);
    const p = this.purchases.get(token);
    if (p) p.acknowledgementState = 1;
  }
  async voided() {
    return this.voidedTokens;
  }
}

const steam = new FakeSteam();
const google = new FakeGoogle();
let app: GameServer;
let base = '';

async function call<T = Record<string, unknown>>(method: string, path: string, body?: unknown, token?: string): Promise<{ status: number; body: T }> {
  const r = await fetch(base + path, {
    method,
    headers: { 'Content-Type': 'application/json', ...(token ? { Authorization: 'Bearer ' + token } : {}) },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  return { status: r.status, body: (await r.json()) as T };
}

async function guest(name = 'Tester'): Promise<{ token: string; playerId: string; friendCode: string }> {
  const r = await call<{ token: string; playerId: string; friendCode: string }>('POST', '/v1/auth/login', { platform: 'guest', proof: null, deviceId: 'd', name });
  expect(r.status).toBe(200);
  return r.body;
}

// A real run of the shortest time trial, recorded by the route bot.
let trialReplay = '';
let trialSeconds = 0;

beforeAll(async () => {
  app = createGameServer({ db: new Db(null), steam, google, jobs: false, limits: { login: 1000, runs: 1000 }, log: () => undefined });
  await new Promise<void>((r) => app.server.listen(0, '127.0.0.1', () => r()));
  base = `http://127.0.0.1:${(app.server.address() as AddressInfo).port}`;
  const world = app.world;
  const trial = world.trials.find((t) => t.id === 'trial.r10')!;
  const run = runTrial(world, trial, world.regionData[trial.region].route);
  expect(run.finished).toBe(true);
  trialSeconds = run.seconds;
  trialReplay = serializeReplay({
    header: { simVersion: SIM_VERSION, worldHash: worldHash(world), mode: 'trial', track: trial.id, abilities: trial.abilities, flags: trial.flags, spawn: { pos: trial.start, yaw: trial.startYaw }, ticks: run.inputs.length },
    inputs: run.inputs,
  });
}, 120_000);

afterAll(async () => {
  await app.close();
});

describe('accounts', () => {
  it('limits sign-in attempts per address', async () => {
    const limited = createGameServer({ db: new Db(null), steam: null, google: null, jobs: false, limits: { login: 3 }, log: () => undefined });
    await new Promise<void>((r) => limited.server.listen(0, '127.0.0.1', () => r()));
    const url = `http://127.0.0.1:${(limited.server.address() as AddressInfo).port}/v1/auth/login`;
    const codes: number[] = [];
    for (let i = 0; i < 5; i++) codes.push((await fetch(url, { method: 'POST', body: JSON.stringify({ platform: 'guest' }) })).status);
    await limited.close();
    expect(codes).toEqual([200, 200, 200, 429, 429]);
  });

  it('reports health with the physics version', async () => {
    const r = await call('GET', '/v1/health');
    expect(r.body.ok).toBe(true);
    expect(r.body.sim).toBe(SIM_VERSION);
  });

  it('a guest is identified by its token, never by a device id', async () => {
    const a = await guest();
    const b = await guest();
    expect(a.playerId).not.toBe(b.playerId);
    const again = await call<{ playerId: string }>('POST', '/v1/auth/login', { platform: 'guest', deviceId: 'd', name: 'x' }, a.token);
    expect(again.body.playerId).toBe(a.playerId);
  });

  it('cleans names', async () => {
    const r = await call<{ name: string }>('POST', '/v1/auth/login', { platform: 'guest', name: '  <b>Ali\u0000ce</b>   the   climber of many towers ' });
    expect(r.body.name).toBe('bAlice/b the climber');
  });

  it('Steam sign-in is verified by the server and upgrades the guest account', async () => {
    const g = await guest();
    const bad = await call('POST', '/v1/auth/login', { platform: 'steam', proof: 'ffff', name: 'S' }, g.token);
    expect(bad.status).toBe(401);
    const banned = await call('POST', '/v1/auth/login', { platform: 'steam', proof: 'bb22', name: 'S' });
    expect(banned.status).toBe(403);
    const ok = await call<{ playerId: string }>('POST', '/v1/auth/login', { platform: 'steam', proof: 'aa11', name: 'Steamer' }, g.token);
    expect(ok.status).toBe(200);
    expect(ok.body.playerId).toBe(g.playerId);
    // the same Steam account from another machine reaches the same player
    const other = await call<{ playerId: string }>('POST', '/v1/auth/login', { platform: 'steam', proof: 'aa11', name: 'Steamer' });
    expect(other.body.playerId).toBe(g.playerId);
  });

  it('Google sign-in exchanges a server auth code', async () => {
    const bad = await call('POST', '/v1/auth/login', { platform: 'google', proof: 'nope' });
    expect(bad.status).toBe(401);
    const ok = await call<{ name: string }>('POST', '/v1/auth/login', { platform: 'google', proof: 'good-code' });
    expect(ok.status).toBe(200);
    expect(ok.body.name).toBe('Play Player');
  });

  it('refuses requests without a valid token', async () => {
    expect((await call('GET', '/v1/save')).status).toBe(401);
    expect((await call('GET', '/v1/save', undefined, 'forged')).status).toBe(401);
  });
});

describe('cloud save', () => {
  it('never loses a version', async () => {
    const g = await guest();
    const save = (progress: number, updatedAt: number, force?: boolean) =>
      call<{ status: string }>('PUT', '/v1/save', { data: JSON.stringify({ profileId: 'p', progress }), progress, updatedAt, force }, g.token);
    expect((await call<{ data: null }>('GET', '/v1/save', undefined, g.token)).body.data).toBeNull();
    expect((await save(100, 2000)).body.status).toBe('ok');
    // an older save with less progress does not replace it...
    expect((await save(40, 1000)).body.status).toBe('conflict');
    expect(JSON.parse((await call<{ data: string }>('GET', '/v1/save', undefined, g.token)).body.data).progress).toBe(100);
    // ...unless the player chose it, and then the replaced one is kept
    expect((await save(40, 1000, true)).body.status).toBe('ok');
    const hist = await call<{ versions: { progress: number }[] }>('GET', '/v1/save/history', undefined, g.token);
    expect(hist.body.versions.map((v) => v.progress)).toEqual([100]);
    const back = await call<{ progress: number }>('POST', '/v1/save/restore', { index: 0 }, g.token);
    expect(back.body.progress).toBe(100);
    const hist2 = await call<{ versions: { progress: number }[] }>('GET', '/v1/save/history', undefined, g.token);
    expect(hist2.body.versions.map((v) => v.progress)).toEqual([40]);
  });

  it('rejects data that is not a save', async () => {
    const g = await guest();
    expect((await call('PUT', '/v1/save', { data: 'not json', progress: 1, updatedAt: 1 }, g.token)).status).toBe(400);
    expect((await call('PUT', '/v1/save', { data: '{"x":1}', progress: 1, updatedAt: 1 }, g.token)).status).toBe(400);
  });
});

describe('verified runs and leaderboards', () => {
  it('ranks a trial by the server’s own re-simulation', async () => {
    const g = await guest('Runner');
    // the claimed time is ignored: the server's result counts
    const r = await call<{ accepted: boolean; seconds: number; rank: number }>('POST', '/v1/runs', { kind: 'trial', track: 'trial.r10', replay: trialReplay, claimedSeconds: 1 }, g.token);
    expect(r.body.accepted).toBe(true);
    expect(r.body.seconds).toBeCloseTo(trialSeconds, 6);
    expect(r.body.rank).toBe(1);
    const lb = await call<{ entries: { name: string; value: number; replayId: string }[] }>('GET', '/v1/leaderboards/trial/trial.r10?scope=global');
    expect(lb.body.entries[0].name).toBe('Runner');
    // its ghost can be raced
    const rep = await call<{ replay: string }>('GET', '/v1/replays/' + lb.body.entries[0].replayId);
    expect(rep.body.replay).toBe(trialReplay);
  });

  it('rejects doctored replays', async () => {
    const g = await guest();
    const r = parseReplay(trialReplay);
    // skip the first second of inputs: the run no longer reaches the finish
    const cut = serializeReplay({ header: r.header, inputs: r.inputs.slice(120) });
    const a = await call<{ accepted: boolean; reason: string }>('POST', '/v1/runs', { kind: 'trial', track: 'trial.r10', replay: cut, claimedSeconds: 10 }, g.token);
    expect(a.body.accepted).toBe(false);
    // extra techniques or a changed world state are not allowed
    const cheat = serializeReplay({ header: { ...r.header, flags: [...r.header.flags, 'r10_bloom'] }, inputs: r.inputs });
    const b = await call<{ accepted: boolean; reason: string }>('POST', '/v1/runs', { kind: 'trial', track: 'trial.r10', replay: cheat }, g.token);
    expect(b.body).toMatchObject({ accepted: false, reason: 'flags' });
    // a run of one trial cannot be filed under another
    const c = await call<{ accepted: boolean; reason: string }>('POST', '/v1/runs', { kind: 'trial', track: 'trial.r9', replay: trialReplay }, g.token);
    expect(c.body.accepted).toBe(false);
    expect((await call('POST', '/v1/runs', { kind: 'trial', track: 'trial.r10', replay: '{garbage' }, g.token)).status).toBe(422);
    expect((await call('POST', '/v1/runs', { kind: 'trial', track: 'nope', replay: trialReplay }, g.token)).status).toBe(400);
  });

  it('keeps each player’s best only', async () => {
    const g = await guest('Twice');
    await call('POST', '/v1/runs', { kind: 'trial', track: 'trial.r10', replay: trialReplay }, g.token);
    const r = parseReplay(trialReplay);
    // the same run with two idle seconds at the start is slower
    const slow = serializeReplay({ header: r.header, inputs: [...new Array(240).fill(r.inputs[0]), ...r.inputs] });
    const s = await call<{ accepted: boolean; seconds: number }>('POST', '/v1/runs', { kind: 'trial', track: 'trial.r10', replay: slow }, g.token);
    if (s.body.accepted) expect(s.body.seconds).toBeGreaterThan(trialSeconds);
    const lb = await call<{ entries: { name: string; value: number }[] }>('GET', '/v1/leaderboards/trial/trial.r10');
    const mine = lb.body.entries.filter((e) => e.name === 'Twice');
    expect(mine.length).toBe(1);
    expect(mine[0].value).toBeCloseTo(trialSeconds, 6);
  });

  it('closes Daily Summit boards after a day, and checks the day’s conditions', async () => {
    const g = await guest();
    const r = parseReplay(trialReplay);
    const old = serializeReplay({ header: { ...r.header, mode: 'daily', track: 'daily:2020-01-01' }, inputs: r.inputs });
    expect((await call<{ reason: string }>('POST', '/v1/runs', { kind: 'daily', track: 'daily:2020-01-01', replay: old }, g.token)).body.reason).toBe('closed');
    const today = new Date().toISOString().slice(0, 10);
    const wrong = serializeReplay({ header: { ...r.header, mode: 'daily', track: 'daily:' + today }, inputs: r.inputs });
    const res = await call<{ accepted: boolean }>('POST', '/v1/runs', { kind: 'daily', track: 'daily:' + today, replay: wrong }, g.token);
    expect(res.body.accepted).toBe(false);
  });

  it('speedruns must start a fresh journey', async () => {
    const g = await guest();
    const res = await call<{ accepted: boolean; reason: string }>('POST', '/v1/runs', { kind: 'speedrun', track: 'speedrun', replay: trialReplay }, g.token);
    expect(res.body.accepted).toBe(false);
  });

  it('friends boards show only friends', async () => {
    const a = await guest('Friend A');
    const b = await guest('Friend B');
    await guest('Stranger');
    expect((await call('POST', '/v1/friends', { code: 'ZZZZZZZZ' }, a.token)).status).toBe(404);
    expect((await call('POST', '/v1/friends', { code: a.friendCode }, a.token)).status).toBe(404);
    expect((await call<{ name: string }>('POST', '/v1/friends', { code: b.friendCode.toLowerCase() }, a.token)).body.name).toBe('Friend B');
    await call('POST', '/v1/runs', { kind: 'trial', track: 'trial.r10', replay: trialReplay }, b.token);
    const lb = await call<{ entries: { name: string }[] }>('GET', '/v1/leaderboards/trial/trial.r10?scope=friends', undefined, a.token);
    expect(lb.body.entries.map((e) => e.name)).toEqual(['Friend B']);
    expect((await call('GET', '/v1/leaderboards/trial/trial.r10?scope=friends')).status).toBe(401);
  });
});

describe('Google Play purchases', () => {
  it('grants only what Play confirms, once, and acknowledges it', async () => {
    const g = await guest();
    const sku = 'vertigo.outfit.night';
    google.purchases.set('tok-paid', { purchaseState: 0, acknowledgementState: 0, orderId: 'GPA.1' });
    const v = await call<{ status: string; cosmetics: string[] }>('POST', '/v1/purchases/google/verify', { sku, purchaseToken: 'tok-paid', orderId: 'GPA.1' }, g.token);
    expect(v.body.status).toBe('granted');
    expect(v.body.cosmetics).toContain('outfit.night');
    expect(google.acks).toEqual(['tok-paid']);
    // verifying the same token again changes nothing
    const again = await call<{ status: string }>('POST', '/v1/purchases/google/verify', { sku, purchaseToken: 'tok-paid', orderId: 'GPA.1' }, g.token);
    expect(again.body.status).toBe('granted');
    expect(google.acks.length).toBe(1);
    const ent = await call<{ cosmetics: string[] }>('GET', '/v1/entitlements', undefined, g.token);
    expect(ent.body.cosmetics).toEqual(['outfit.night']);
  });

  it('pending, cancelled and unknown purchases grant nothing', async () => {
    const g = await guest();
    google.purchases.set('tok-pending', { purchaseState: 2, acknowledgementState: 0, orderId: 'GPA.2' });
    google.purchases.set('tok-cancel', { purchaseState: 1, acknowledgementState: 0, orderId: 'GPA.3' });
    const sku = 'vertigo.scarf.ember';
    expect((await call<{ status: string }>('POST', '/v1/purchases/google/verify', { sku, purchaseToken: 'tok-pending', orderId: '' }, g.token)).body.status).toBe('pending');
    expect((await call<{ status: string }>('POST', '/v1/purchases/google/verify', { sku, purchaseToken: 'tok-cancel', orderId: '' }, g.token)).body.status).toBe('invalid');
    expect((await call<{ status: string }>('POST', '/v1/purchases/google/verify', { sku, purchaseToken: 'made-up', orderId: '' }, g.token)).body.status).toBe('invalid');
    expect((await call('POST', '/v1/purchases/google/verify', { sku: 'vertigo.jetpack', purchaseToken: 'x', orderId: '' }, g.token)).status).toBe(400);
    expect((await call<{ cosmetics: string[] }>('GET', '/v1/entitlements', undefined, g.token)).body.cosmetics).toEqual([]);
    // the pending purchase completes later
    google.purchases.get('tok-pending')!.purchaseState = 0;
    expect((await call<{ status: string }>('POST', '/v1/purchases/google/verify', { sku, purchaseToken: 'tok-pending', orderId: '' }, g.token)).body.status).toBe('granted');
  });

  it('a purchase follows the Play account to a new install, and refunds revoke it', async () => {
    const first = await guest();
    const second = await guest();
    google.purchases.set('tok-move', { purchaseState: 0, acknowledgementState: 1, orderId: 'GPA.4' });
    const sku = 'vertigo.shoes.neon';
    await call('POST', '/v1/purchases/google/verify', { sku, purchaseToken: 'tok-move', orderId: '' }, first.token);
    await call('POST', '/v1/purchases/google/verify', { sku, purchaseToken: 'tok-move', orderId: '' }, second.token);
    expect((await call<{ cosmetics: string[] }>('GET', '/v1/entitlements', undefined, first.token)).body.cosmetics).toEqual([]);
    expect((await call<{ cosmetics: string[] }>('GET', '/v1/entitlements', undefined, second.token)).body.cosmetics).toEqual(['shoes.neon']);
    google.voidedTokens = ['tok-move'];
    await app.runJobs();
    expect((await call<{ cosmetics: string[] }>('GET', '/v1/entitlements', undefined, second.token)).body.cosmetics).toEqual([]);
    expect((await call<{ status: string }>('POST', '/v1/purchases/google/verify', { sku, purchaseToken: 'tok-move', orderId: '' }, second.token)).body.status).toBe('invalid');
  });
});

describe('Steam purchases', () => {
  async function steamPlayer(): Promise<string> {
    const r = await call<{ token: string }>('POST', '/v1/auth/login', { platform: 'steam', proof: 'aa11', name: 'Steamer' });
    return r.body.token;
  }

  it('prices come from the server in the wallet currency', async () => {
    const tok = await steamPlayer();
    steam.currency = 'EUR';
    const p = await call<Record<string, string>>('GET', '/v1/store/prices?platform=steam', undefined, tok);
    expect(p.body['vertigo.outfit.night']).toMatch(/2,99/);
    steam.currency = 'USD';
    const q = await call<Record<string, string>>('GET', '/v1/store/prices?platform=steam', undefined, tok);
    expect(q.body['vertigo.outfit.night']).toBe('$2.99');
    // a guest (no Steam wallet) gets no prices
    const g = await guest();
    expect(Object.keys((await call<Record<string, string>>('GET', '/v1/store/prices?platform=steam', undefined, g.token)).body)).toEqual([]);
  });

  it('InitTxn → user authorizes in the overlay → FinalizeTxn grants once', async () => {
    const tok = await steamPlayer();
    const init = await call<{ orderId: string }>('POST', '/v1/purchases/steam/init', { sku: 'vertigo.bundle.night', language: 'turkish' }, tok);
    expect(init.status).toBe(200);
    const orderId = init.body.orderId;
    expect(steam.items.get(orderId)!.amount).toBe(599);
    // finalizing before the user authorized grants nothing
    expect((await call<{ status: string }>('POST', '/v1/purchases/steam/finalize', { orderId }, tok)).body.status).toBe('pending');
    steam.authorize(orderId);
    const fin = await call<{ status: string; cosmetics: string[] }>('POST', '/v1/purchases/steam/finalize', { orderId }, tok);
    expect(fin.body.status).toBe('granted');
    expect(fin.body.cosmetics).toEqual(['banner.nightsky', 'outfit.night', 'scarf.aurora', 'trail.aurora']);
    expect((await call<{ status: string }>('POST', '/v1/purchases/steam/finalize', { orderId }, tok)).body.status).toBe('granted');
    // buying what you own is refused before any money moves
    expect((await call('POST', '/v1/purchases/steam/init', { sku: 'vertigo.outfit.night' }, tok)).status).toBe(409);
    // another player cannot finalize this order
    const g = await guest();
    expect((await call('POST', '/v1/purchases/steam/finalize', { orderId }, g.token)).status).toBe(404);
    // refunds revoke
    steam.refunded = [orderId];
    await app.runJobs();
    expect((await call<{ cosmetics: string[] }>('GET', '/v1/entitlements', undefined, tok)).body.cosmetics).toEqual([]);
  });

  it('needs a Steam account and a supported currency', async () => {
    const g = await guest();
    expect((await call('POST', '/v1/purchases/steam/init', { sku: 'vertigo.emote.dance' }, g.token)).status).toBe(403);
    const tok = await steamPlayer();
    steam.currency = 'XXX';
    expect((await call('POST', '/v1/purchases/steam/init', { sku: 'vertigo.emote.dance' }, tok)).status).toBe(409);
    steam.currency = 'USD';
  });
});
