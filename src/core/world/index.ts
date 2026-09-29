import { region01 } from './regions/r01_ground';
import { region02 } from './regions/r02_blocks';
import { region03 } from './regions/r03_construction';
import { region04 } from './regions/r04_machine';
import { region05 } from './regions/r05_city';
import { region06 } from './regions/r06_skyway';
import { region07 } from './regions/r07_abandoned';
import { region08 } from './regions/r08_storm';
import { region09 } from './regions/r09_void';
import { region10 } from './regions/r10_above';
import { memoryFlagsBelow } from './memory';
import { PAR_TIMES, TRIAL_PAR } from './par';
import { BASE_ABILITIES, type RegionData } from './types';
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
  const r8 = region08(r7.exit);
  const r9 = region09(r8.exit);
  const r10 = region10(r9.exit);
  return [r1.data, r2.data, r3.data, r4.data, r5.data, r6.data, r7.data, r8.data, r9.data, r10.data];
}

/**
 * Time-trial rules, derived from the world rather than authored per trial so they cannot drift:
 *  - memory: the regions below remember the player; this region is as found on the first climb,
 *    and its mechanisms (levers, counterweights, winches) are worked during the run as in the story
 *  - techniques: everything learned up to and including this region
 *  - medals: from the bot's verified trial run (Perfect is close to it, Bronze a steady climb)
 */
export function applyTrialRules(regions: RegionData[]): RegionData[] {
  let abilities = BASE_ABILITIES;
  regions.forEach((r, i) => {
    for (const c of r.collectibles) if (c.kind === 'lesson' && c.ability) abilities |= c.ability;
    const flags = memoryFlagsBelow(regions, i);
    for (const t of r.trials) {
      t.flags = flags;
      t.abilities = abilities;
      const par = TRIAL_PAR[t.id] ?? PAR_TIMES[i];
      if (par) t.medals = { perfect: Math.ceil(par * 1.15), gold: Math.ceil(par * 1.45), silver: Math.ceil(par * 1.9), bronze: Math.ceil(par * 2.6) };
    }
  });
  return regions;
}

export function buildWorld(): World {
  return new World(applyTrialRules(buildRegions()));
}
