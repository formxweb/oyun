import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { ACHIEVEMENTS } from '../src/core/catalog/achievements';
import { allMemoryFlags } from '../src/core/world/memory';
import { EN } from '../src/client/i18n/en';
import { TR } from '../src/client/i18n/tr';
import { dailyRoute } from '../src/core/daily';
import { buildWorld } from '../src/core/world/index';

/**
 * Every piece of text the world can show must exist in every language, and the two languages
 * must cover the same keys (no hard-coded strings, no half-translated screens).
 */
const world = buildWorld();

function worldKeys(): string[] {
  const keys = new Set<string>();
  world.regions.forEach((_, i) => {
    keys.add(`region.${i}`);
    keys.add(`region.${i}.sub`);
  });
  for (const c of world.collectibles) {
    if (c.kind === 'fragment' || c.kind === 'record') {
      keys.add(`${c.id}.title`);
      keys.add(`${c.id}.body`);
    } else if (c.kind === 'echo') keys.add(c.id);
    else if (c.kind === 'lesson') {
      keys.add(`lesson.${c.id}`);
      keys.add(`ability.${c.ability ?? 0}`);
    }
  }
  for (const a of world.anchors) keys.add(a.nameKey);
  for (const z of world.zones) if (z.kind === 'area' && z.key) keys.add(z.key);
  for (const tr of world.triggers) if (tr.textKey) keys.add(tr.textKey);
  for (const t of world.trials) keys.add(t.nameKey);
  return [...keys];
}

describe('localization', () => {
  it('English and Turkish cover exactly the same keys', () => {
    const en = Object.keys(EN).sort();
    const tr = Object.keys(TR).sort();
    expect(en.filter((k) => !(k in TR))).toEqual([]);
    expect(tr.filter((k) => !(k in EN))).toEqual([]);
  });

  it('no text is empty', () => {
    expect(Object.entries(EN).filter(([, v]) => !v.trim()).map(([k]) => k)).toEqual([]);
    expect(Object.entries(TR).filter(([, v]) => !v.trim()).map(([k]) => k)).toEqual([]);
  });

  it('every key the world refers to has text in both languages', () => {
    const missing = worldKeys().filter((k) => !(k in EN) || !(k in TR));
    expect(missing).toEqual([]);
  });

  it('placeholders match between languages', () => {
    const ph = (s: string) => (s.match(/\{[a-zA-Z]+\}/g) ?? []).sort().join(',');
    const bad = Object.keys(EN).filter((k) => k in TR && ph(EN[k]) !== ph(TR[k]));
    expect(bad).toEqual([]);
  });
});

describe('world content', () => {
  it('has thirty letters plus the letter at the Cradle, one per generation', () => {
    const frags = world.collectibles.filter((c) => c.kind === 'fragment').map((c) => c.id);
    expect(new Set(frags).size).toBe(frags.length);
    for (let g = 0; g <= 30; g++) expect(frags).toContain(`f${g}`);
  });

  it('every collectible id is unique', () => {
    const ids = world.collectibles.map((c) => c.id);
    expect(new Set(ids).size).toBe(ids.length);
  });

  it('every region has anchors, a trial, a master route and daily gates', () => {
    world.regionData.forEach((r) => {
      expect(r.anchors.length).toBeGreaterThan(1);
      expect(r.trials.length).toBe(1);
      expect(r.trials[0].master.length).toBeGreaterThan(0);
      expect(r.dailyGates.length).toBeGreaterThanOrEqual(4);
      expect(r.route.length).toBeGreaterThan(10);
    });
  });

  it('every ability is taught by a lesson somewhere', () => {
    const taught = world.collectibles.filter((c) => c.kind === 'lesson').reduce((m, c) => m | (c.ability ?? 0), 0);
    // Sprint and Mantle are known from the start
    expect(taught | 1 | 2).toBe(16383);
  });

  it('the Cradle ends the journey', () => {
    expect(world.triggers.some((t) => t.flag === 'r10_cradle')).toBe(true);
  });
});

describe('Daily Summit', () => {
  const along = (region: number, p: { x: number; y: number; z: number }) => {
    let best = 0;
    let bd = Infinity;
    world.regionData[region].route.forEach((s, k) => {
      const d = Math.hypot(s.p.x - p.x, s.p.y - p.y, s.p.z - p.z);
      if (d < bd) {
        bd = d;
        best = k;
      }
    });
    return { k: best, d: bd };
  };

  it('is the same route for everyone on a given day', () => {
    expect(JSON.stringify(dailyRoute(world, '2026-03-14'))).toBe(JSON.stringify(dailyRoute(buildWorld(), '2026-03-14')));
  });

  it('puts every gate on the route, ahead of the start, in climbing order', () => {
    for (let i = 0; i < 120; i++) {
      const date = new Date(Date.UTC(2026, 0, 1) + i * 86400_000).toISOString().slice(0, 10);
      const d = dailyRoute(world, date);
      const rings = [...d.gates, d.finish];
      expect(rings.length).toBeGreaterThanOrEqual(4);
      let prev = along(d.region, d.start).k;
      for (const g of rings) {
        const a = along(d.region, g.pos);
        expect(a.d).toBeLessThanOrEqual(1.6);
        expect(a.k).toBeGreaterThan(prev);
        prev = a.k;
      }
      expect(d.flags.every((f) => !f.startsWith(`r${d.region + 1}_`))).toBe(true);
    }
  });
});

describe('achievements', () => {
  const src = ['src/client/services/profile.ts', 'src/client/app.ts'].map((f) => readFileSync(f, 'utf8')).join('\n');
  const count = (kind: string) => world.collectibles.filter((c) => c.kind === kind && c.id !== 'f0').length;

  it('every achievement can be earned: something unlocks it', () => {
    const missing = ACHIEVEMENTS.map((a) => a.id).filter((id) => !src.includes(`unlock('${id}')`));
    expect(missing).toEqual([]);
  });

  it('memory flags that unlock achievements exist in the world', () => {
    const flags = new Set(allMemoryFlags(world));
    const used = [...src.matchAll(/flag === '([a-z0-9_]+)'\) this\.unlock/g)].map((m) => m[1]);
    expect(used.length).toBeGreaterThan(3);
    expect(used.filter((f) => !flags.has(f))).toEqual([]);
  });

  it('collection targets match the world', () => {
    const target = (id: string) => ACHIEVEMENTS.find((a) => a.id === id)!.target;
    expect(target('complete_journey')).toBe(count('fragment'));
    expect(target('archivist')).toBe(count('record'));
    expect(target('echo_hunter')).toBe(count('echo'));
    expect(target('all_lessons')).toBe(count('lesson'));
    expect(target('gold_standard')).toBe(world.trials.length);
  });
});
