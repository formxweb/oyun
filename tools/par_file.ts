import { writeFileSync } from 'node:fs';

/** Writes src/core/world/par.ts (shared by tools/par_times.ts and tools/trial_times.ts). */
export function writeParFile(regionPar: readonly number[], trialPar: Readonly<Record<string, number>>): void {
  const out = `/**
 * Par times (seconds), generated — do not edit by hand; regenerate after changing a region.
 *  - PAR_TIMES: the route bot's time over each region's main route (tools/par_times.ts)
 *  - TRIAL_PAR: the bot's verified trial-mode run of each time trial (tools/trial_times.ts);
 *    medal thresholds are derived from it
 */
export const PAR_TIMES: readonly number[] = [${regionPar.join(', ')}];

export const TRIAL_PAR: Readonly<Record<string, number>> = {${Object.keys(trialPar).length ? '\n' + Object.entries(trialPar).map(([k, v]) => `  '${k}': ${v},`).join('\n') + '\n' : ''}};
`;
  writeFileSync(new URL('../src/core/world/par.ts', import.meta.url), out);
  console.log('wrote src/core/world/par.ts');
}
