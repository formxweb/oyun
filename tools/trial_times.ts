/**
 * Proves every time trial can be finished — a trial-mode run from the trial start with the
 * trial's own memory state and techniques, nothing forced — checks that the recorded run
 * verifies as a replay exactly like a leaderboard submission would, and writes each trial's
 * par time (the bot's time) to src/core/world/par.ts.
 * Usage: npx tsx tools/trial_times.ts [trialId]
 */
import { runTrial } from '../src/core/bot';
import { SIM_VERSION, parseReplay, serializeReplay, verifyReplay, worldHash } from '../src/core/replay';
import { buildWorld } from '../src/core/world/index';
import { PAR_TIMES } from '../src/core/world/par';
import { writeParFile } from './par_file';

const only = process.argv[2];
const world = buildWorld();
const hash = worldHash(world);
const par: Record<string, number> = {};
let bad = 0;
for (const trial of world.trials) {
  if (only && trial.id !== only) continue;
  const t0 = Date.now();
  const r = runTrial(world, trial, world.regionData[trial.region].route);
  const tag = `${trial.id.padEnd(10)}`;
  if (!r.finished) {
    bad++;
    console.log(`${tag} NOT FINISHED  failed legs ${JSON.stringify(r.failed)} missing flags ${JSON.stringify(r.missingFlags)}`);
    continue;
  }
  const replay = parseReplay(
    serializeReplay({
      header: { simVersion: SIM_VERSION, worldHash: hash, mode: 'trial', track: trial.id, abilities: trial.abilities, flags: trial.flags, spawn: { pos: trial.start, yaw: trial.startYaw }, ticks: r.inputs.length },
      inputs: r.inputs,
    }),
  );
  const v = verifyReplay(world, replay, trial);
  if (!v.ok || Math.abs(v.seconds - r.seconds) > 1e-9) {
    bad++;
    console.log(`${tag} REPLAY MISMATCH ${JSON.stringify(v)}`);
    continue;
  }
  par[trial.id] = Math.round(r.seconds * 10) / 10;
  console.log(`${tag} ok ${r.seconds.toFixed(1)}s  falls ${v.falls}  x${v.maxMult.toFixed(2)}  eff ${v.efficiency.toFixed(2)}  score ${v.score}  (${((Date.now() - t0) / 1000).toFixed(0)}s)${r.missingFlags.length ? '  flags waited: ' + r.missingFlags.join(',') : ''}`);
}
if (bad) {
  console.log(`${bad} trial(s) failed`);
  process.exit(1);
}
if (!only) writeParFile(PAR_TIMES, par);
