import { region01 } from './regions/r01_ground';
import type { RegionData } from './types';
import { World } from './world';

/** Build every region's data fresh (World mutates ids while assembling). */
export function buildRegions(): RegionData[] {
  return [region01().data];
}

export function buildWorld(): World {
  return new World(buildRegions());
}
