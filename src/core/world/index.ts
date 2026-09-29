import { region01 } from './regions/r01_ground';
import { region02 } from './regions/r02_blocks';
import { region03 } from './regions/r03_construction';
import { region04 } from './regions/r04_machine';
import { region05 } from './regions/r05_city';
import { region06 } from './regions/r06_skyway';
import { region07 } from './regions/r07_abandoned';
import type { RegionData } from './types';
import { World } from './world';

/**
 * Build every region's data fresh (World mutates ids while assembling). Regions are chained:
 * each begins where the previous region's route ends.
 */
export function buildRegions(): RegionData[] {
  const r1 = region01();
  const r2 = region02(r1.gate);
  const r3 = region03(r2.exit);
  const r4 = region04(r3.exit);
  const r5 = region05(r4.exit);
  const r6 = region06(r5.exit);
  const r7 = region07(r6.exit);
  return [r1.data, r2.data, r3.data, r4.data, r5.data, r6.data, r7.data];
}

export function buildWorld(): World {
  return new World(buildRegions());
}
