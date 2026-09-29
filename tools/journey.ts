/**
 * End-to-end playthrough: one continuous story simulation from the Ground to the Cradle.
 * Techniques come only from lessons actually picked up, memory only from triggers actually
 * fired — nothing is preset or forced. The recorded inputs are then verified exactly as the
 * server verifies a speedrun submission.
 * Usage: npx tsx tools/journey.ts [--ngplus]
 *   --ngplus: New Game+ — every technique known, the world remembered (no speedrun check)
 */
import { approach, playLeg } from '../src/core/bot';
import { quantizeInput, type InputFrame } from '../src/core/input';
import { SIM_VERSION, SpeedrunCheck, worldHash } from '../src/core/replay';
import { Simulation } from '../src/core/sim';
import { buildWorld } from '../src/core/world/index';
import { JOURNEY_END_FLAG, newGamePlusFlags } from '../src/core/world/memory';
import { ALL_ABILITIES, BASE_ABILITIES } from '../src/core/world/types';

const ngPlus = process.argv.includes('--ngplus');
const world = buildWorld();
const spawn = world.regionData[0].spawn;
const sim = new Simulation(world, {
  mode: 'story',
  abilities: ngPlus ? ALL_ABILITIES : BASE_ABILITIES,
  flags: ngPlus ? newGamePlusFlags(world) : [],
  collected: [],
  litAnchors: [],
  lastAnchor: null,
  spawn,
  recallAnywhere: false,
  ngPlus,
});
const inputs: InputFrame[] = [];
const idle = quantizeInput({ mx: 0, mz: 0, yaw: 0, btn: 0 });
const step = (f: InputFrame) => {
  sim.step(f);
  inputs.push(f);
};
for (let i = 0; i < 20; i++) step(idle);

let failed = 0;
const t0 = Date.now();
for (const r of world.regionData) {
  const route = r.route;
  const ri = r.meta.index;
  const tStart = sim.tick;
  // walk from wherever the previous region ended onto this region's first point
  approach(sim, route[0].p, inputs);
  for (let i = 1; i < route.length; i++) {
    const s = route[i];
    for (const f of s.flags ?? []) for (let k = 0; k < 1200 && sim.isPending(f); k++) step(idle);
    const missing = (s.flags ?? []).filter((f) => !sim.st.flags.has(f));
    approach(sim, route[i - 1].p, inputs);
    const res = playLeg(world, sim, s, inputs, { abilities: sim.abilities, flags: [] });
    if (!res.ok) {
      failed++;
      const p = sim.player;
      console.log(`  FAIL region ${ri + 1} leg ${i} [${s.a}] at (${p.x.toFixed(1)},${p.y.toFixed(1)},${p.z.toFixed(1)}) abilities ${sim.abilities} missing flags ${missing.join(',') || '-'}`);
      break;
    }
  }
  const lessons = world.collectibles.filter((c) => c.kind === 'lesson' && c.region === ri);
  const got = lessons.filter((c) => sim.collected.has(c.id)).length;
  console.log(`region ${ri + 1} ${r.meta.id}: ${((sim.tick - tStart) / 120).toFixed(1)}s  lessons ${got}/${lessons.length}  collected ${[...sim.collected].length}  y=${sim.player.y.toFixed(0)}`);
  if (failed) break;
}
const end = sim.st.flags.has(JOURNEY_END_FLAG);
console.log(`journey ${end ? 'reached the Cradle' : 'DID NOT FINISH'} in ${(sim.tick / 120 / 60).toFixed(1)} min of game time (${((Date.now() - t0) / 1000).toFixed(0)}s to compute); ${inputs.length} inputs`);
if (!end) process.exit(1);
if (ngPlus) process.exit(0);

// the same run as a speedrun submission
const check = new SpeedrunCheck(world, { header: { simVersion: SIM_VERSION, worldHash: worldHash(world), mode: 'story', track: 'speedrun', abilities: BASE_ABILITIES, flags: [], spawn, ticks: inputs.length }, inputs });
const res = check.advance(Infinity)!;
console.log(`speedrun verification: ${res.ok ? `ok, ${(res.seconds / 60).toFixed(2)} min` : 'REJECTED ' + res.reason}`);
if (!res.ok) process.exit(1);
