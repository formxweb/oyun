/**
 * Par times (seconds), generated — do not edit by hand; regenerate after changing a region.
 *  - PAR_TIMES: the route bot's time over each region's main route (tools/par_times.ts)
 *  - TRIAL_PAR: the bot's verified trial-mode run of each time trial (tools/trial_times.ts);
 *    medal thresholds are derived from it
 */
export const PAR_TIMES: readonly number[] = [111.9, 107.9, 111.8, 122, 101, 112.8, 61.8, 86.2, 59.7, 34.5];

export const TRIAL_PAR: Readonly<Record<string, number>> = {
  'trial.r1': 109.1,
  'trial.r2': 107.9,
  'trial.r3': 111.3,
  'trial.r4': 121.7,
  'trial.r5': 100.6,
  'trial.r6': 111.1,
  'trial.r7': 61.4,
  'trial.r8': 83.7,
  'trial.r9': 59.1,
  'trial.r10': 32.8,
};
