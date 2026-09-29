import { hashString, v3, type V3 } from './math';
import { Rng } from './rng';
import { memoryFlagsBelow } from './world/memory';
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
  /** crosswind on 'wind' days (part of the simulation config, so part of every replay) */
  wind?: { x: number; z: number };
  abilities: number;
  flags: string[];
  par: number;
}

/**
 * A region's Daily Summit material: its start (the lowest anchor) and the authored gates that
 * lie on the route ahead of it, in the order a climber meets them.
 */
function dailyCourse(world: World, region: number): { region: number; pool: V3[]; startA: World['anchors'][number] | undefined } {
  const route = world.regionData[region].route;
  const along = (p: V3) => {
    let best = 0;
    let bd = Infinity;
    route.forEach((s, k) => {
      const d = Math.hypot(s.p.x - p.x, s.p.y - p.y, s.p.z - p.z);
      if (d < bd) {
        bd = d;
        best = k;
      }
    });
    return { k: best, d: bd };
  };
  const startA = world.anchors.filter((a) => a.region === region).sort((a, b) => a.pos.y - b.pos.y)[0];
  const k0 = startA ? along(startA.pos).k : 0;
  const pool = world.dailyGates[region]
    .map((p) => ({ p, ...along(p) }))
    // a gate is a ring over a route point (1 m up); anything off the route or behind the start is skipped
    .filter((g) => g.d <= 1.6 && g.k > k0)
    .sort((a, b) => a.k - b.k || a.p.y - b.p.y)
    .map((g) => g.p);
  return { region, pool, startA };
}

/** A steady crosswind (m/s²): enough to have to lean into on long jumps, never enough to decide one. */
export const DAILY_WIND = { x: 1.6, z: 1.0 };

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
 * from the date. The route stays inside one region so it is short and replayable; the gates
 * come in the order a climber meets them on the way up. The region is as first climbed (the
 * regions below remember you; its own levers and counterweights are yours to work), with every
 * technique available.
 */
export function dailyRoute(world: World, date: string): DailyRoute {
  const rng = new Rng(hashString('vertigo-daily:' + date));
  const courses = world.dailyGates.map((_, i) => dailyCourse(world, i)).filter((c) => c.pool.length >= 5);
  const course = courses[rng.int(0, courses.length - 1)];
  const { region, pool, startA } = course;
  const count = Math.min(pool.length, rng.int(4, 6));
  // keep route order but choose a spread: split the pool in `count` bands, one from each
  const gates: V3[] = [];
  for (let b = 0; b < count; b++) {
    const lo = Math.floor((b * pool.length) / count);
    const hi = Math.max(lo, Math.floor(((b + 1) * pool.length) / count) - 1);
    gates.push(pool[rng.int(lo, hi)]);
  }
  const mods: DailyModifier[] = ['none', 'none', 'wind', 'dusk', 'nofall'];
  const modifier = mods[rng.int(0, mods.length - 1)];
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
    wind: modifier === 'wind' ? { ...DAILY_WIND } : undefined,
    abilities: ALL_ABILITIES,
    flags: memoryFlagsBelow(world.regionData, region),
    // rough par: 1.6 m/s along the straight-line route
    par: Math.max(30, Math.round(dist / 1.6)),
  };
}
