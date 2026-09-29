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

function clean(out: Set<string>): string[] {
  return [...out].filter((f) => !f.startsWith('hint_')).sort();
}

/** All flags a finished journey leaves in the world: New Game+ and the Daily Summit start from it. */
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
