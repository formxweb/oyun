import { hashString, v3, type V3 } from './math';
import { Rng } from './rng';
import { ALL_ABILITIES } from './world/types';
import type { World } from './world/world';

export type DailyModifier = 'none' | 'wind' | 'dusk' | 'nofall';

export interface DailyRoute {
  date: string;
  week: string;
  region: number;
  start: V3;
  startYaw: number;
  gates: { pos: V3; r: number }[];
  finish: { pos: V3; r: number };
  modifier: DailyModifier;
  abilities: number;
  flags: string[];
  par: number;
}

/** UTC date key YYYY-MM-DD. */
export function dateKey(d: Date): string {
  return d.toISOString().slice(0, 10);
}

/** ISO week key YYYY-Www. */
export function weekKey(d: Date): string {
  const t = new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate()));
  const day = t.getUTCDay() || 7;
  t.setUTCDate(t.getUTCDate() + 4 - day);
  const y0 = new Date(Date.UTC(t.getUTCFullYear(), 0, 1));
  const wk = Math.ceil(((t.getTime() - y0.getTime()) / 86400000 + 1) / 7);
  return `${t.getUTCFullYear()}-W${String(wk).padStart(2, '0')}`;
}

/**
 * The Daily Summit: every player gets the same authored gates, chosen deterministically
 * from the date. Gates always climb; the route stays inside one region so it is short and
 * replayable, and all techniques are available.
 */
export function dailyRoute(world: World, date: string, canonicalFlags: string[]): DailyRoute {
  const rng = new Rng(hashString('vertigo-daily:' + date));
  const candidates = world.dailyGates.map((g, i) => ({ g, i })).filter((x) => x.g.length >= 5);
  const pick = candidates[rng.int(0, candidates.length - 1)];
  const region = pick.i;
  const pool = [...pick.g].sort((a, b) => a.y - b.y);
  const count = Math.min(pool.length, rng.int(4, 6));
  // keep ordering by height but choose a spread: split pool in `count` bands, one from each
  const gates: V3[] = [];
  for (let b = 0; b < count; b++) {
    const lo = Math.floor((b * pool.length) / count);
    const hi = Math.max(lo, Math.floor(((b + 1) * pool.length) / count) - 1);
    gates.push(pool[rng.int(lo, hi)]);
  }
  const mods: DailyModifier[] = ['none', 'none', 'wind', 'dusk', 'nofall'];
  const modifier = mods[rng.int(0, mods.length - 1)];
  const anchors = world.anchors.filter((a) => a.region === region).sort((a, b) => a.pos.y - b.pos.y);
  const startA = anchors[0];
  const start = startA ? v3(startA.pos.x, startA.pos.y + 0.05, startA.pos.z) : world.regionData[region].spawn.pos;
  const last = gates.pop()!;
  let dist = 0;
  let prev = start;
  for (const g of [...gates, last]) {
    dist += Math.hypot(g.x - prev.x, g.y - prev.y, g.z - prev.z);
    prev = g;
  }
  return {
    date,
    week: weekKey(new Date(date + 'T12:00:00Z')),
    region,
    start,
    startYaw: startA?.yaw ?? 0,
    gates: gates.map((pos) => ({ pos, r: 3 })),
    finish: { pos: last, r: 3 },
    modifier,
    abilities: ALL_ABILITIES,
    flags: canonicalFlags,
    // rough par: 1.6 m/s along the straight-line route
    par: Math.max(30, Math.round(dist / 1.6)),
  };
}
