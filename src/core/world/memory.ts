import type { RegionData } from './types';
import type { World } from './world';

/**
 * Vertical Memory flags: every change the player can cause in the world. Collected from the
 * memory triggers, the Fall Line nets they reveal and trigger zones. Hints are not memory.
 */
function flagsOf(r: Pick<RegionData, 'triggers' | 'solids' | 'zones'>, out: Set<string>): void {
  for (const t of r.triggers) out.add(t.flag);
  for (const s of r.solids) if (s.tag && s.tag.startsWith('net_')) out.add(s.tag);
  for (const z of r.zones) if (z.kind === 'trigger' && z.key) out.add(z.key);
}

/** Sitting down in the Cradle: the end of a journey, an event rather than something remembered. */
export const JOURNEY_END_FLAG = 'r10_cradle';

function clean(out: Set<string>): string[] {
  return [...out].filter((f) => !f.startsWith('hint_') && f !== JOURNEY_END_FLAG).sort();
}

/** All flags a finished journey leaves in the world: New Game+ starts from it. */
export function allMemoryFlags(world: World): string[] {
  const out = new Set<string>();
  flagsOf({ triggers: world.triggers, solids: world.solids, zones: world.zones }, out);
  return clean(out);
}

/** Flags the regions below `region` hold once a player has climbed through them. */
export function memoryFlagsBelow(regions: RegionData[], region: number): string[] {
  const out = new Set<string>();
  for (let i = 0; i < region && i < regions.length; i++) flagsOf(regions[i], out);
  return clean(out);
}

/**
 * New Game+ — the Remembered City. Everything the climber changed is still changed: collapses,
 * revealed Fall Lines, the Garden in bloom. Only the machines the climb itself works (a lever
 * pulled, a counterweight ridden round — the route's own mechanisms) stand ready to be worked
 * again, because the way up passes through them.
 */
export function newGamePlusFlags(world: World): string[] {
  const mechanisms = new Set<string>();
  for (const r of world.regionData) for (const s of r.route) if (s.expect) mechanisms.add(s.expect);
  return allMemoryFlags(world).filter((f) => !mechanisms.has(f));
}
