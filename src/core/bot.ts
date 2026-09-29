import { Btn, quantizeInput, type InputFrame } from './input';
import { datan2, type V3 } from './math';
import { Mode, type PlayerState } from './player';
import { Simulation, type SimConfig } from './sim';
import { Shape, type RouteStep, type Solid } from './world/types';
import type { World } from './world/world';

/**
 * Route bot: proves with the real simulation that an authored route can be climbed.
 *
 * The route is played as ONE continuous simulation — memory triggers fire, cranes swing,
 * lifts run — exactly as for a player. For each leg the bot snapshots the simulation and
 * searches a small space of human-like input strategies (run-up, jump timing, sprint, slide,
 * steering toward walls, waiting for movers, pressing levers). Successful inputs are kept, so
 * the concatenation is a replayable reference run used for time-trial par times.
 */

export interface LegResult {
  ok: boolean;
  ticks: number;
  tried: number;
}

export interface BotOptions {
  abilities: number;
  flags: string[];
  maxTicks?: number;
  /** Debug hook: called every tick of every attempted strategy. */
  onTick?: (strategy: number, tick: number, p: PlayerState) => void;
}

function containsXZ(so: Solid, x: number, z: number, margin: number): boolean {
  const dx = x - so.x;
  const dz = z - so.z;
  if (so.shape === Shape.Cyl) return dx * dx + dz * dz <= (so.hx + margin) * (so.hx + margin);
  const lx = dx * so.c - dz * so.s;
  const lz = dx * so.s + dz * so.c;
  return Math.abs(lx) <= so.hx + margin && Math.abs(lz) <= so.hz + margin;
}

/** Solids whose top surface is at y (±tol) and whose footprint contains (x,z). */
export function solidsAt(world: World, p: V3, tol = 0.25, margin = 0.05): Solid[] {
  const ids: number[] = [];
  world.querySolids(p.x - 0.5, p.y - 2, p.z - 0.5, p.x + 0.5, p.y + 0.5, p.z + 0.5, ids);
  return ids.map((i) => world.solids[i]).filter((so) => Math.abs(so.maxY - p.y) <= tol && containsXZ(so, p.x, p.z, margin));
}

interface Strategy {
  runup: number;
  jumpAt: number; // metres along the leg when we jump; -1 = no jump
  sprint: boolean;
  slide: boolean;
  wait: number; // ticks standing still before moving (movers)
  hold: number; // ticks to hold jump
  rejump: number; // ticks between extra jump presses (wall jumps, chimneys), 0 = none
  aim: number; // yaw offset (radians)
  alternate: boolean; // chimney: face alternately left/right of travel
  wall: number; // wall run: metres short of the wall face to aim at after take-off (0 = off)
}

const STRATS: Strategy[] = (() => {
  const out: Strategy[] = [];
  const base: Strategy = { runup: 0, jumpAt: -1, sprint: true, slide: false, wait: 0, hold: 40, rejump: 0, aim: 0, alternate: false, wall: 0 };
  out.push({ ...base, sprint: false });
  out.push({ ...base });
  for (const runup of [0, 3, 6])
    for (const jumpAt of [0.2, 0.9, 1.6, 2.4, 3.2])
      for (const sprint of [true, false]) out.push({ ...base, runup, jumpAt, sprint });
  for (let wait = 30; wait <= 990; wait += 60) out.push({ ...base, wait }, { ...base, wait, jumpAt: 1.2 });
  for (const rejump of [14, 24, 36]) for (const aim of [0, 0.35, -0.35]) out.push({ ...base, runup: 4, jumpAt: 1.0, rejump, aim });
  for (const jumpAt of [-1, 1.5, 2.5, 3.5]) out.push({ ...base, runup: 6, jumpAt, slide: true });
  out.push({ ...base, sprint: false, slide: true });
  for (const aim of [0.5, -0.5, 0.25, -0.25]) for (const jumpAt of [0.6, 1.4]) out.push({ ...base, runup: 6, jumpAt, aim });
  // chimneys: kick between two walls; `aim` picks the first wall (left/right)
  for (const jumpAt of [0.2, 1.0, 1.8, 2.6]) for (const aim of [1, -1]) for (const sprint of [false, true]) out.push({ ...base, jumpAt, aim, sprint, alternate: true, hold: 6 });
  // wall runs: take off, then steer at a point just short of the wall's face at mid-gap
  for (const wall of [0.3, 0.7, 1.1]) for (const jumpAt of [0.4, 1.2, 2.0]) for (const runup of [3, 6]) out.push({ ...base, runup, jumpAt, wall });
  return out;
})();

/** Lateral offset (signed, metres) of a wall beside the middle of a leg, or null if none. */
function findWallSide(world: World, from: V3, to: V3): number | null {
  const mx = (from.x + to.x) / 2;
  const mz = (from.z + to.z) / 2;
  const dx = to.x - from.x;
  const dz = to.z - from.z;
  const l = Math.hypot(dx, dz) || 1;
  const lx = -dz / l;
  const lz = dx / l;
  const y = Math.max(from.y, to.y) + 1.0;
  const ids: number[] = [];
  for (let k = 0.4; k <= 4; k += 0.2) {
    for (const sgn of [1, -1]) {
      const px = mx + lx * k * sgn;
      const pz = mz + lz * k * sgn;
      world.querySolids(px - 0.05, y - 0.05, pz - 0.05, px + 0.05, y + 0.05, pz + 0.05, ids);
      for (const i of ids) {
        const so = world.solids[i];
        if (so.minY <= y && so.maxY >= y && containsXZ(so, px, pz, 0)) return k * sgn;
      }
    }
  }
  return null;
}

function findLadderFoot(world: World, from: V3, to: V3): { x: number; z: number; yaw: number } | null {
  let best = Infinity;
  let foot: { x: number; z: number; yaw: number } | null = null;
  for (const r of world.ropes) {
    if (r.kind !== 'ladder' || Math.abs(r.b.y - to.y) > 1.5) continue;
    const d = Math.hypot(r.a.x - to.x, r.a.z - to.z) + Math.abs(r.a.y - from.y) * 0.5;
    if (d < best && d < 9) {
      best = d;
      foot = { x: r.a.x + r.n.x * 0.75, z: r.a.z + r.n.z * 0.75, yaw: datan2(r.n.x, r.n.z) };
    }
  }
  return foot;
}

const idle = (yaw: number): InputFrame => quantizeInput({ mx: 0, mz: 0, yaw, btn: 0 });

/** Play one leg from the simulation's current state. On success the sim holds the new state. */
export function playLeg(world: World, sim: Simulation, step: RouteStep, out: InputFrame[], opts: BotOptions): LegResult {
  const to = step.p;
  const targets = new Set(solidsAt(world, to).map((s) => s.id));
  const snap = sim.snapshot();
  const start = { x: sim.player.x, y: sim.player.y, z: sim.player.z };
  const dx = to.x - start.x;
  const dz = to.z - start.z;
  const hd = Math.hypot(dx, dz) || 1;
  const dirx = dx / hd;
  const dirz = dz / hd;
  const baseYaw = datan2(-dirx, -dirz);
  const fromSolids = solidsAt(world, start, 0.3);
  const riding = step.a === 'ride' || step.a === 'wait' || step.a === 'interact';
  const maxTicks = opts.maxTicks ?? (riding ? 3600 : 1500);
  const ladderFoot = step.a === 'ladder' ? findLadderFoot(world, start, to) : null;
  const wallSide = step.a === 'wallrunL' || step.a === 'wallrunR' ? findWallSide(world, start, to) : null;
  const lat = { x: -dz / hd, z: dx / hd };
  let tried = 0;
  for (const s of STRATS) {
    if (s.wait > 0 && !riding) continue;
    if (s.alternate && step.a !== 'walljump') continue;
    if (s.wall > 0 && wallSide === null) continue;
    tried++;
    sim.restore(snap);
    const inputs: InputFrame[] = [];
    // Run-up: back up along the starting platform (a player would walk back; we place to save time).
    if (s.runup > 0 && sim.player.grounded) {
      let bx = start.x;
      let bz = start.z;
      for (let back = 0.25; back <= s.runup; back += 0.25) {
        const nx = start.x - dirx * back;
        const nz = start.z - dirz * back;
        if (!fromSolids.some((so) => containsXZ(so, nx, nz, -0.35))) break;
        bx = nx;
        bz = nz;
      }
      if (bx !== start.x || bz !== start.z) {
        sim.ctrl.place(sim.player, bx, start.y + 0.02, bz, baseYaw);
        for (let i = 0; i < 3; i++) {
          const f = idle(baseYaw);
          sim.step(f);
          inputs.push(f);
        }
      }
    }
    const sx = sim.player.x;
    const sz = sim.player.z;
    let jumped = false;
    let jumpTick = -1;
    let slideTick = -1;
    let ok = false;
    let onSurfaceTicks = 0;
    const minY = Math.min(start.y, to.y) - (step.a === 'drop' ? 120 : 6);
    for (let tick = 0; tick < maxTicks; tick++) {
      const p = sim.player;
      const along = (p.x - sx) * dirx + (p.z - sz) * dirz;
      const tx = to.x - p.x;
      const tz = to.z - p.z;
      const dist = Math.hypot(tx, tz);
      let yaw = dist > 0.3 ? datan2(-tx / dist, -tz / dist) : baseYaw;
      if (!s.alternate) yaw += s.aim * (jumped ? 1 : 0.3);
      let mz = tick < s.wait ? 0 : 1;
      if (dist < 0.5 && p.grounded) mz = 0;
      // Riding a moving platform: stand still until it brings the destination within reach.
      if (riding && p.grounded && p.groundId >= 0 && world.solids[p.groundId].mover >= 0 && dist > 4.5 && tick >= s.wait) mz = 0;
      let btn = s.sprint ? Btn.Sprint : 0;
      if (!jumped && s.jumpAt >= 0 && tick >= s.wait && along >= s.jumpAt && (p.grounded || p.mode === Mode.Slide)) {
        jumped = true;
        jumpTick = tick;
      }
      if (s.slide && !jumped && slideTick < 0 && tick >= s.wait + (s.sprint ? 30 : 0) && p.grounded) slideTick = tick;
      if (slideTick >= 0 && !jumped) btn |= Btn.Crouch;
      if (jumped && tick - jumpTick < s.hold) btn |= Btn.Jump;
      if (jumped && s.rejump > 0 && tick > jumpTick + s.hold && (tick - jumpTick) % s.rejump < 4) btn |= Btn.Jump;
      if (s.wall > 0 && wallSide !== null && jumped && p.mode === Mode.Air) {
        // steer for the wall at mid-gap until we are running on it
        const off = wallSide - Math.sign(wallSide) * s.wall;
        const ax = (start.x + to.x) / 2 + lat.x * off - p.x;
        const az = (start.z + to.z) / 2 + lat.z * off - p.z;
        const ad = Math.hypot(ax, az);
        if (ad > 0.4 && (ax * dirx + az * dirz) > 0) yaw = datan2(-ax / ad, -az / ad);
      }
      if (s.alternate && jumped && p.mode === Mode.Air && p.y < to.y - 0.4) {
        // Move away from the wall we last kicked off (toward the opposite wall) and keep tapping jump.
        let nx = -dirz * s.aim;
        let nz = dirx * s.aim;
        if (p.hasLastWJ && tick > jumpTick + 2) {
          nx = p.lastWJNx;
          nz = p.lastWJNz;
        }
        yaw = datan2(-nx, -nz);
        btn = (btn & ~Btn.Jump) | ((tick - jumpTick) % 6 < 2 ? Btn.Jump : 0);
      }
      if (ladderFoot) {
        const fx = ladderFoot.x - p.x;
        const fz = ladderFoot.z - p.z;
        const fd = Math.hypot(fx, fz);
        if (p.mode === Mode.Ladder || fd < 0.35 || tick > 220) yaw = ladderFoot.yaw;
        else if (p.mode !== Mode.Mantle) yaw = datan2(-fx / fd, -fz / fd);
        mz = 1;
      }
      if (step.a === 'interact' && tick % 30 === 5) btn |= Btn.Interact;
      // Throw the plumb line at a ring once airborne.
      if (step.a === 'tether' && jumped && p.mode === Mode.Air && tick % 4 < 2) btn |= Btn.Interact;
      if (p.mode === Mode.Line || p.mode === Mode.Zip) {
        const rope = world.ropes[p.ropeId];
        if (rope && Math.hypot(p.x - rope.b.x, p.z - rope.b.z) < 0.7) btn |= Btn.Jump;
      }
      if (p.mode === Mode.Swing && Math.hypot(p.vx, p.vz) > 6 && p.vx * tx + p.vz * tz > 0) btn |= Btn.Jump;
      const f = quantizeInput({ mx: 0, mz, yaw, btn });
      sim.step(f);
      inputs.push(f);
      const q = sim.player;
      opts.onTick?.(tried, tick, q);
      // Arrive at the route point itself (not merely somewhere on a large target surface), so the
      // next leg starts where the level designer intended; give up on precision after a while.
      const near = Math.hypot(q.x - to.x, q.z - to.z);
      const onSurface = q.grounded && Math.abs(q.y - to.y) < 0.35 && (targets.has(q.groundId) || near < 1.2);
      onSurfaceTicks = onSurface ? onSurfaceTicks + 1 : 0;
      if (onSurface && (near < 0.8 || (onSurfaceTicks > 150 && near < 3)) && (!step.expect || sim.st.flags.has(step.expect))) {
        ok = true;
        break;
      }
      if (q.y < minY) break;
    }
    if (ok) {
      for (let i = 0; i < 6; i++) {
        const f = idle(baseYaw);
        sim.step(f);
        inputs.push(f);
      }
      for (const f of inputs) out.push(f);
      return { ok: true, ticks: inputs.length, tried };
    }
  }
  sim.restore(snap);
  return { ok: false, ticks: 0, tried };
}

/** Walk precisely onto a route point on the current surface (a player lining up a jump). */
export function approach(sim: Simulation, at: V3, out: InputFrame[]): void {
  const g = sim.player.groundId;
  if (!sim.player.grounded || (g >= 0 && sim.world.solids[g].mover >= 0)) return;
  const snap = sim.snapshot();
  const inputs: InputFrame[] = [];
  for (let t = 0; t < 360; t++) {
    const p = sim.player;
    const dx = at.x - p.x;
    const dz = at.z - p.z;
    const d = Math.hypot(dx, dz);
    if (d < 0.2 && Math.hypot(p.vx, p.vz) < 0.5) break;
    if (!p.grounded || Math.abs(p.y - at.y) > 0.4) {
      sim.restore(snap);
      return;
    }
    const f = d > 0.2 ? quantizeInput({ mx: 0, mz: Math.min(1, d * 1.5 + 0.15), yaw: datan2(-dx / d, -dz / d), btn: 0 }) : idle(datan2(-p.fx, -p.fz));
    sim.step(f);
    inputs.push(f);
  }
  const q = sim.player;
  if (!q.grounded || Math.abs(q.y - at.y) > 0.4) {
    sim.restore(snap);
    return;
  }
  for (const f of inputs) out.push(f);
}

export interface RouteReport {
  region: number;
  legs: number;
  failed: { index: number; from: V3; to: V3; action: string }[];
  /** memory flags the route expected but the run had not triggered by then (forced to continue) */
  forced: { index: number; flag: string }[];
  ticks: number;
  inputs: InputFrame[];
}

/** Verify a whole route as one continuous run. Failed legs are reported and skipped by placement. */
export function verifyRoute(world: World, region: number, route: RouteStep[], opts: BotOptions, onLeg?: (i: number, ok: boolean) => void): RouteReport {
  const rep: RouteReport = { region, legs: 0, failed: [], forced: [], ticks: 0, inputs: [] };
  const first = route[0];
  const cfg: SimConfig = {
    mode: 'story',
    abilities: opts.abilities,
    flags: [...opts.flags, ...(first.flags ?? [])],
    collected: [],
    litAnchors: [],
    lastAnchor: null,
    spawn: { pos: { x: first.p.x, y: first.p.y + 0.05, z: first.p.z }, yaw: 0 },
    recallAnywhere: false,
    ngPlus: false,
  };
  const sim = new Simulation(world, cfg);
  for (let i = 0; i < 20; i++) sim.step(idle(0));
  for (let i = 1; i < route.length; i++) {
    const step = route[i];
    for (const f of step.flags ?? []) {
      for (let k = 0; k < 1200 && sim.isPending(f); k++) {
        const fr = idle(0);
        sim.step(fr);
        rep.inputs.push(fr);
      }
      if (sim.st.flags.has(f) || cfg.flags.includes(f)) continue;
      rep.forced.push({ index: i, flag: f });
      sim.setFlag(f);
    }
    approach(sim, route[i - 1].p, rep.inputs);
    const from = { x: sim.player.x, y: sim.player.y, z: sim.player.z };
    const r = playLeg(world, sim, step, rep.inputs, opts);
    rep.legs++;
    if (!r.ok) {
      rep.failed.push({ index: i, from, to: step.p, action: step.a });
      sim.ctrl.place(sim.player, step.p.x, step.p.y + 0.05, step.p.z, 0);
      for (let k = 0; k < 10; k++) sim.step(idle(0));
    } else rep.ticks += r.ticks;
    onLeg?.(i, r.ok);
  }
  return rep;
}
