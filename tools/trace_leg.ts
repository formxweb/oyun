/**
 * Debug aid for level designers: replays a region's verified route up to a leg, then traces
 * the player's state while walking/jumping that leg. Usage: npx tsx tools/trace_leg.ts <region> <leg> [strategy]
 */
import { approach, playLeg } from '../src/core/bot';
import { Btn, quantizeInput } from '../src/core/input';
import { datan2 } from '../src/core/math';
import { Simulation } from '../src/core/sim';
import { buildWorld } from '../src/core/world/index';
import { BASE_ABILITIES } from '../src/core/world/types';

const world = buildWorld();
const [riS, branchId] = process.argv[2].split(':');
const ri = Number(riS);
const leg = Number(process.argv[3]);
const jumpAt = process.argv[4] !== undefined ? Number(process.argv[4]) : -1;
const r = world.regionData[ri];
let abilities = BASE_ABILITIES;
for (const c of world.collectibles) if (c.kind === 'lesson' && c.region <= ri && c.ability) abilities |= c.ability;
const route = branchId ? r.branches.find((x) => x.id === branchId)!.route : r.route;
const sim = new Simulation(world, {
  mode: 'story', abilities, flags: [...(route[0].flags ?? [])], collected: [], litAnchors: [], lastAnchor: null,
  spawn: { pos: { x: route[0].p.x, y: route[0].p.y + 0.05, z: route[0].p.z }, yaw: 0 }, recallAnywhere: false, ngPlus: false,
});
for (let i = 0; i < 20; i++) sim.step(quantizeInput({ mx: 0, mz: 0, yaw: 0, btn: 0 }));
const out: never[] = [];
for (let i = 1; i < leg; i++) {
  for (const f of route[i].flags ?? []) if (!sim.st.flags.has(f)) sim.setFlag(f);
  approach(sim, route[i - 1].p, []);
  const res = playLeg(world, sim, route[i], out as never, { abilities, flags: [] });
  if (!res.ok) {
    sim.ctrl.place(sim.player, route[i].p.x, route[i].p.y + 0.05, route[i].p.z, 0);
    for (let k = 0; k < 10; k++) sim.step(quantizeInput({ mx: 0, mz: 0, yaw: 0, btn: 0 }));
  }
}
const step = route[leg];
for (const f of step.flags ?? []) if (!sim.st.flags.has(f)) sim.setFlag(f);
approach(sim, route[leg - 1].p, []);
if (process.argv[4] === 'bot') {
  const want = Number(process.argv[5] ?? 1);
  const res = playLeg(world, sim, step, [], {
    abilities,
    flags: [],
    onTick: (si, t, q) => {
      if (si === want && t % 10 === 0) console.log(si, t, 'mode', q.mode, q.x.toFixed(2), q.y.toFixed(2), q.z.toFixed(2), 'v', q.vx.toFixed(1), q.vy.toFixed(1), q.vz.toFixed(1), 'g', q.groundId);
    },
  });
  console.log('result', res);
  process.exit(0);
}
const p = sim.player;
console.log('leg', leg, step.a, 'from', p.x.toFixed(2), p.y.toFixed(2), p.z.toFixed(2), 'to', step.p, 'flags', [...sim.st.flags].join(','));
const sx = p.x, sz = p.z;
const hd = Math.hypot(step.p.x - sx, step.p.z - sz) || 1;
let jumped = false;
for (let t = 0; t < 900; t++) {
  const tx = step.p.x - p.x, tz = step.p.z - p.z, d = Math.hypot(tx, tz);
  const along = ((p.x - sx) * (step.p.x - sx) + (p.z - sz) * (step.p.z - sz)) / hd;
  let btn = Btn.Sprint;
  if (jumpAt >= 0 && along >= jumpAt && !jumped) jumped = true;
  if (jumped) btn |= Btn.Jump;
  if (step.a === 'interact' && t % 30 === 5) btn |= Btn.Interact;
  sim.step(quantizeInput({ mx: 0, mz: d < 0.4 ? 0 : 1, yaw: d > 0.3 ? datan2(-tx / d, -tz / d) : 0, btn }));
  if (t % 10 === 0) console.log(t, 'mode', p.mode, p.x.toFixed(2), p.y.toFixed(2), p.z.toFixed(2), 'v', p.vx.toFixed(1), p.vy.toFixed(1), p.vz.toFixed(1), 'g', p.groundId);
}
