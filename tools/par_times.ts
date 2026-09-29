/**
 * Computes each region's par time (the route bot's verified time for the main route) and writes
 * src/core/world/par.ts, from which time-trial medal thresholds are derived.
 * Usage: npx tsx tools/par_times.ts
 */
import { verifyRoute } from '../src/core/bot';
import { buildWorld } from '../src/core/world/index';
import { TRIAL_PAR } from '../src/core/world/par';
import { BASE_ABILITIES } from '../src/core/world/types';
import { writeParFile } from './par_file';

const world = buildWorld();
const par: number[] = [];
for (const r of world.regionData) {
  const idx = r.meta.index;
  let abilities = BASE_ABILITIES;
  for (const c of world.collectibles) if (c.kind === 'lesson' && c.region <= idx && c.ability) abilities |= c.ability;
  const rep = verifyRoute(world, idx, r.route, { abilities, flags: [] });
  if (rep.failed.length) throw new Error(`region ${idx}: route not verified (${rep.failed.length} failed legs)`);
  // route time plus the settling the bot does between legs (inputs recorded)
  const secs = rep.inputs.length / 120;
  par.push(Math.round(secs * 10) / 10);
  console.log(`region ${idx} ${r.meta.id}: par ${secs.toFixed(1)}s`);
}
writeParFile(par, TRIAL_PAR);
