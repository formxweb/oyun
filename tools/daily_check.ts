/**
 * Proves upcoming Daily Summit routes can be finished: for each day, the route bot runs the
 * day's course in daily mode (its weather, all techniques, the region as first climbed) and the run is
 * re-verified exactly as the server verifies a submission.
 * Usage: npx tsx tools/daily_check.ts [days=30] [startDate=today]
 */
import { runCourse } from '../src/core/bot';
import { dailyRoute, dateKey } from '../src/core/daily';
import { parseReplay, serializeReplay, SIM_VERSION, verifyDaily, worldHash } from '../src/core/replay';
import { buildWorld } from '../src/core/world/index';

const days = Number(process.argv[2] ?? 30);
const start = process.argv[3] ? new Date(process.argv[3] + 'T12:00:00Z') : new Date();
const world = buildWorld();
const hash = worldHash(world);
let bad = 0;
const perRegion = new Map<number, number>();
for (let i = 0; i < days; i++) {
  const date = dateKey(new Date(start.getTime() + i * 86400_000));
  const d = dailyRoute(world, date);
  perRegion.set(d.region, (perRegion.get(d.region) ?? 0) + 1);
  const route = world.regionData[d.region].route;
  // gates must come in the order a climber meets them
  const idx = [...d.gates, d.finish].map((g) => {
    let best = 0;
    let bd = Infinity;
    route.forEach((s, k) => {
      const dd = Math.hypot(s.p.x - g.pos.x, s.p.y - g.pos.y, s.p.z - g.pos.z);
      if (dd < bd) {
        bd = dd;
        best = k;
      }
    });
    return best;
  });
  const ordered = idx.every((v, k) => k === 0 || v > idx[k - 1]);
  const r = runCourse(world, { id: 'daily:' + date, mode: 'daily', start: d.start, startYaw: d.startYaw, flags: d.flags, abilities: d.abilities, gates: d.gates, finish: d.finish, wind: d.wind }, route);
  let verdict = r.finished ? 'ok' : 'NOT FINISHED ' + JSON.stringify(r.failed);
  if (r.finished) {
    const replay = parseReplay(
      serializeReplay({
        header: { simVersion: SIM_VERSION, worldHash: hash, mode: 'daily', track: 'daily:' + date, abilities: d.abilities, flags: d.flags, spawn: { pos: d.start, yaw: d.startYaw }, wind: d.wind, ticks: r.inputs.length },
        inputs: r.inputs,
      }),
    );
    const v = verifyDaily(world, replay, d);
    if (!v.ok) verdict = 'REPLAY ' + v.reason;
    else verdict = `ok ${v.seconds.toFixed(1)}s (par ${d.par}s) score ${v.score}`;
  }
  if (!verdict.startsWith('ok') || !ordered) bad++;
  console.log(`${date} region ${d.region + 1} ${d.modifier.padEnd(6)} gates ${d.gates.length + 1} ${ordered ? '' : 'OUT OF ORDER ' + idx.join(',') + ' '}${verdict}`);
}
console.log('regions used:', [...perRegion.entries()].sort((a, b) => a[0] - b[0]).map(([r, n]) => `${r + 1}:${n}`).join(' '));
if (bad) {
  console.log(`${bad} day(s) with problems`);
  process.exit(1);
}
