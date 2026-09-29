import { dcos, dsin, v3 } from '../../math';
import { RegionBuilder, quantYaw } from '../builder';
import { beamArc, hangCable, helix, lamp, numeral, pillar, polar, type HelixDeck, type HelixStep } from '../kit';
import { Ability, Mat, type RegionData } from '../types';
import type { Exit } from './r03_construction';

/**
 * REGION 04 — THE MACHINE
 * Generations 18–21 built the engine that lowered everything: gear houses, a piston hall, the
 * Belts that carried stone down, and the Great Winch with its flyweight Governor. It has been
 * silent since the last floor went down.
 *
 * Teaches: wall jump (lesson, the gear-house chimneys), wall climb (lesson, the Belts).
 * Memory: throwing the steam valve wakes the piston hall; releasing the Great Winch's brake
 * lifts its cage and wakes the service lifts in every region below.
 * Routes: SAFE the gangways and piston stair / RISK the drive belt / MASTER the swinging
 * counterweights.
 */

const ATM = {
  skyTop: 0x3a4a62,
  skyHorizon: 0xd6ae7c,
  fog: 0xb4926c,
  fogDensity: 0.0024,
  sunColor: 0xffd49a,
  sunIntensity: 1.0,
  ambient: 0x6a5642,
  sunDir: v3(-0.45, 0.55, 0.5),
  weather: 1,
  cloudColor: 0xf6e2c4,
  exposure: 1.02,
};

const PR = 34;
const R = 52;
const IRON = 0x4a4e54;
const BRASS = 0xb08a3e;
const COPPER = 0xa8643a;
const SOOT = 0x2e2a26;
const rad = (d: number) => (d * Math.PI) / 180;
const arc = (m: number, r = R) => (m / r) * (180 / Math.PI);
/** Angle of a new deck of length `len` placed `gap` metres past deck `d` (walking clockwise). */
const past = (d: HelixDeck, gap: number, len: number, r = R) => d.a - arc(d.len / 2 + gap + len / 2, r);
const radialYaw = (a: number) => quantYaw(rad(a + 90));

export function region04(entry: Exit): { data: RegionData; exit: Exit } {
  const y0 = entry.y;
  const b = new RegionBuilder({ index: 3, id: 'machine', baseY: y0 + 2, topY: y0 + 170, atmosphere: ATM, center: v3(0, 0, 0), radius: 150 });

  // ------------------------------------------------------------------ the underside: the drive shafts
  // Seen from the Construction below: the Machine's floor is a ring of iron with shafts and
  // chains hanging from it, all running DOWN.
  const floorY = y0 + 10;
  for (let i = 0; i < 10; i++) {
    const a = i * 36 + 18;
    const p = polar(a, 74);
    b.block(p.x, floorY - 2.5, p.z, 24, 2.5, 20, { mat: Mat.Metal, tint: IRON, yaw: quantYaw(rad(a)) });
    const q = polar(a + 9, 66);
    b.decor('hcyl', q.x, floorY - 5, q.z, 14, 0.6, 0, { mat: Mat.Metal, tint: SOOT, yaw: rad(a + 90) });
    hangCable(b, q.x, floorY - 30, q.z, floorY - 2.5, 0);
    b.decor('vgear', polar(a - 8, 70).x, floorY - 6, polar(a - 8, 70).z, 3.2, 0.5, 0, { mat: Mat.Brass, tint: BRASS, yaw: rad(a), spin: i % 2 ? 0.2 : -0.2 });
  }

  // ------------------------------------------------------------------ Section A: the Gearhouse
  b.zone('area', -120, y0 - 2, -120, 120, y0 + 26, 120, { key: 'area.r4.gearhouse' });
  // A brass gangway from the Unfinished Floor into the Gearhouse ring.
  const gw = polar(entry.a, 56.4);
  b.plat(gw.x, y0, gw.z, 6.6, 2.4, 0.3, { mat: Mat.Brass, tint: BRASS, yaw: radialYaw(entry.a) });
  for (const k of [-1.1, 1.1]) {
    const t = { x: dcos(rad(entry.a)) * k, z: -dsin(rad(entry.a)) * k };
    b.dbox(gw.x + t.x, y0, gw.z + t.z, 6.6, 1.0, 0.06, { mat: Mat.Metal, tint: IRON, yaw: radialYaw(entry.a) });
  }
  b.route(gw.x, y0, gw.z, 'run');
  const secA1: HelixStep[] = [
    { move: 'start', len: 4, wid: 4, mat: Mat.Metal, tint: IRON },
    { move: 'step', mat: Mat.Metal, tint: IRON },
    { move: 'hop', mat: Mat.Brass, tint: BRASS },
    { move: 'climb', mat: Mat.Metal, tint: IRON },
    { move: 'jump', mat: Mat.Metal, tint: COPPER },
    { move: 'ramp', mat: Mat.Metal, tint: IRON },
    { move: 'walk', len: 4, wid: 4, mat: Mat.Brass, tint: BRASS },
  ];
  const A1 = helix(b, entry.a, R, y0, -1, secA1, { pillarR: PR, mat: Mat.Metal });
  const gIn = A1[A1.length - 1];
  b.anchor('r4.gearhouse', polar(A1[0].a, R - 1).x, A1[0].top, polar(A1[0].a, R - 1).z, 0, 'anchor.r4.gearhouse', true);
  numeral(b, 21, polar(A1[3].a, PR + 0.06).x, A1[3].top + 2, polar(A1[3].a, PR + 0.06).z, rad(A1[3].a), 1.4);
  // Wall gears turning in the Pillar face (landmarks; purely mechanical scenery).
  for (let i = 0; i < 4; i++) {
    const a = A1[1 + i].a;
    const p = polar(a, PR + 0.7);
    b.decor('vgear', p.x, A1[1 + i].top + 5, p.z, 2.2 + (i % 2) * 1.4, 0.6, 0, { mat: Mat.Brass, tint: i % 2 ? BRASS : COPPER, yaw: rad(a + 90), spin: i % 2 ? 0.35 : -0.5 });
  }

  // The great horizontal gear: its teeth are platforms. Ride half a turn to cross the gap.
  const gearR = 7;
  const aG = past(gIn, 0.5, 17);
  const G = polar(aG, R);
  const gearTop = gIn.top;
  b.mover({ kind: 'rotate', origin: v3(G.x, gearTop, G.z), angVel: 0.3, phase: 0 }, () => {
    b.cyl(0, -0.6, 0, 2.2, 0.6, { mat: Mat.Brass, tint: BRASS });
    for (let k = 0; k < 4; k++) {
      const ca = (k * Math.PI) / 2;
      const cx = Math.cos(ca);
      const sz = Math.sin(ca);
      b.plat(cx * 3.9, 0, sz * 3.9, 3.4, 0.9, 0.35, { mat: Mat.Metal, tint: IRON, yaw: quantYaw(-ca) });
      b.plat(cx * gearR, 0, sz * gearR, 3, 3, 0.5, { mat: Mat.Metal, tint: COPPER, yaw: quantYaw(-ca) });
    }
    b.decor('gear', 0, -1.2, 0, 8.8, 0.5, 0, { mat: Mat.Brass, tint: BRASS });
  });
  // the drive shaft under the gear
  b.decor('cyl', G.x, gearTop - 14, G.z, 0.8, 26, 0, { mat: Mat.Metal, tint: SOOT });
  b.collect('e.r4.belts', 'echo', G.x, gearTop - 20, G.z);

  const aA2 = aG - arc(gearR + 1.5 + 0.5 + 2);
  const secA2: HelixStep[] = [
    { move: 'start', len: 4, wid: 4, mat: Mat.Metal, tint: IRON, action: 'ride' },
    { move: 'jump', mat: Mat.Metal, tint: COPPER },
    { move: 'climb', mat: Mat.Metal, tint: IRON },
    { move: 'step', mat: Mat.Brass, tint: BRASS },
    { move: 'walk', len: 5, wid: 4, mat: Mat.Metal, tint: IRON },
    { move: 'chimney', len: 3, wid: 3, mat: Mat.Brick, tint: 0x6a4a3a },
    { move: 'hop', mat: Mat.Metal, tint: IRON },
    { move: 'chimney', len: 3, wid: 3, mat: Mat.Brick, tint: 0x6a4a3a },
    { move: 'jump', mat: Mat.Metal, tint: COPPER },
    { move: 'tall', mat: Mat.Metal, tint: IRON },
    { move: 'walk', len: 6, wid: 4.5, mat: Mat.Brass, tint: BRASS },
  ];
  const A2 = helix(b, aA2, R, gearTop, -1, secA2, { pillarR: PR, mat: Mat.Metal });
  // Wall-jump lesson on the deck before the first chimney.
  const lj = A2[4];
  b.collect('l.walljump', 'lesson', lj.x, lj.top + 1.3, lj.z, Ability.WallJump);
  b.trigger('t.r4.hint.walljump', 'hint_walljump', { type: 'enter', min: v3(lj.x - 2.5, lj.top - 1, lj.z - 2.5), max: v3(lj.x + 2.5, lj.top + 3, lj.z + 2.5) }, { textKey: 'hint.walljump' });
  b.collect('f21', 'fragment', polar(A2[6].a, R + 1.4).x, A2[6].top + 1.0, polar(A2[6].a, R + 1.4).z);
  numeral(b, 20, polar(A2[8].a, PR + 0.06).x, A2[8].top + 2, polar(A2[8].a, PR + 0.06).z, rad(A2[8].a), 1.4);

  // ------------------------------------------------------------------ Section B: the Piston Hall
  const V = A2[A2.length - 1];
  b.zone('area', -120, V.top - 2, -120, 120, V.top + 22, 120, { key: 'area.r4.pistons' });
  b.anchor('r4.pistons', polar(V.a, R - 1.4).x, V.top, polar(V.a, R - 1.4).z, 0, 'anchor.r4.pistons');
  // The steam valve: a brass wheel on a pipe at the outer rail.
  const vw = polar(V.a, R + 2.0);
  b.decor('vgear', vw.x, V.top + 1.2, vw.z, 0.55, 0.12, 0, { mat: Mat.Brass, tint: 0xd8b04a, yaw: rad(V.a + 90) });
  b.decor('hcyl', polar(V.a, R + 2.3).x, V.top + 1.2, polar(V.a, R + 2.3).z, 0.8, 0.12, 0, { mat: Mat.Metal, tint: COPPER, yaw: rad(V.a + 90) });
  b.decor('cyl', polar(V.a, R + 2.6).x, V.top - 6, polar(V.a, R + 2.6).z, 0.2, 14, 0, { mat: Mat.Metal, tint: COPPER });
  b.trigger('t.r4.valve', 'r4_valve', { type: 'interact', pos: v3(vw.x, V.top + 1.2, vw.z), radius: 2.6 }, { textKey: 'mem.r4.valve', delay: 0.8 });
  const vStand = polar(V.a, R + 0.9);
  b.route(vStand.x, V.top, vStand.z, 'interact', { expect: 'r4_valve' });
  b.routeFlags = ['r4_valve'];
  // Three pistons, each lifting you to a gallery ledge from which the next one starts.
  const lift = 5.6;
  let base: HelixDeck = V;
  const galleries: HelixDeck[] = [];
  for (let i = 0; i < 3; i++) {
    const pa = past(base, 0.3, 2.6);
    const pp = polar(pa, R);
    b.mover(
      { kind: 'path', origin: v3(pp.x, base.top, pp.z), points: [v3(0, 0, 0), v3(0, lift, 0)], segTime: [2.4], pause: 1.6, phase: i * 1.3, activeFlag: 'r4_valve' },
      () => {
        b.plat(0, 0, 0, 2.6, 2.6, 0.5, { mat: Mat.Metal, tint: COPPER, yaw: quantYaw(rad(pa)) });
        b.decor('cyl', 0, -3.5, 0, 0.45, 6, 0, { mat: Mat.Metal, tint: 0xc8c8c0 });
      },
    );
    // the cylinder the piston rises out of
    b.decor('cyl', pp.x, base.top - 7, pp.z, 1.5, 12, 0, { mat: Mat.Metal, tint: SOOT });
    const ga = pa - arc(1.3 + 0.15 + 1.6);
    const gp = polar(ga, R);
    const gTop = base.top + lift;
    b.plat(gp.x, gTop, gp.z, 3.2, 3.4, 0.4, { mat: Mat.Metal, tint: IRON, yaw: quantYaw(rad(ga)) });
    b.block(gp.x, base.top - 2, gp.z, 3.2, gTop - 0.4 - (base.top - 2), 3.4, { mat: Mat.Brick, tint: 0x7a5646, yaw: quantYaw(rad(ga)) });
    b.route(gp.x, gTop, gp.z, 'ride', { note: 'ride the piston up' });
    const g: HelixDeck = { x: gp.x, z: gp.z, top: gTop, a: ga, yaw: quantYaw(rad(ga)), len: 3.2 };
    galleries.push(g);
    base = g;
  }
  // Steam vents between the piston pits hiss on a cycle: a boost if you time it.
  for (let i = 0; i < 2; i++) {
    const g = galleries[i];
    const vp = polar(g.a - arc(0.9), R + 1.0);
    b.zone('vent', vp.x - 0.6, g.top - 0.2, vp.z - 0.6, vp.x + 0.6, g.top + 1.0, vp.z + 0.6, { strength: 13, period: 4, active: 0.8, phase: i * 2 });
    b.dbox(vp.x, g.top, vp.z, 1.1, 0.04, 1.1, { mat: Mat.Brass, tint: 0x9a7a3a });
  }
  b.collect('rec.r4.counterweights', 'record', galleries[1].x, galleries[1].top + 1.1, galleries[1].z);
  const hallTop = galleries[2];

  // ------------------------------------------------------------------ Section C: the Belts
  b.zone('area', -120, hallTop.top - 2, -120, 120, hallTop.top + 30, 120, { key: 'area.r4.belts' });
  const secC: HelixStep[] = [
    { move: 'hop', len: 8, wid: 2.2, mat: Mat.Asphalt, tint: 0x2a2826, conv: -2.2 },
    { move: 'climb', mat: Mat.Metal, tint: IRON },
    { move: 'walk', len: 5, wid: 3.4, mat: Mat.Metal, tint: IRON },
    { move: 'scale', len: 4, wid: 4, mat: Mat.Brick, tint: 0x7a5646 },
    { move: 'jump', len: 7, wid: 2.2, mat: Mat.Asphalt, tint: 0x2a2826, conv: 2.6 },
    { move: 'long', mat: Mat.Metal, tint: COPPER },
    { move: 'climb', mat: Mat.Metal, tint: IRON },
    { move: 'hop', len: 9, wid: 2.2, mat: Mat.Asphalt, tint: 0x2a2826, conv: -2.8 },
    { move: 'scale', len: 4, wid: 4, mat: Mat.Brick, tint: 0x7a5646 },
    { move: 'jump', mat: Mat.Metal, tint: IRON },
    { move: 'vent', len: 4, wid: 4, mat: Mat.Metal, tint: IRON },
    { move: 'walk', len: 5, wid: 4.5, mat: Mat.Brass, tint: BRASS },
  ];
  const C = helix(b, 0, R, 0, -1, secC, { pillarR: PR, mat: Mat.Metal, from: hallTop });
  const beltLoft = C[3];
  b.anchor('r4.belts', polar(beltLoft.a, R - 1.2).x, beltLoft.top, polar(beltLoft.a, R - 1.2).z, 0, 'anchor.r4.belts');
  b.collect('l.wallclimb', 'lesson', beltLoft.x, beltLoft.top + 1.3, beltLoft.z, Ability.WallClimb);
  b.trigger('t.r4.hint.wallclimb', 'hint_wallclimb', { type: 'enter', min: v3(beltLoft.x - 2.5, beltLoft.top - 1, beltLoft.z - 2.5), max: v3(beltLoft.x + 2.5, beltLoft.top + 3, beltLoft.z + 2.5) }, { textKey: 'hint.wallclimb' });
  b.collect('f20', 'fragment', C[7].x, C[7].top + 1.0, C[7].z);
  numeral(b, 19, polar(C[5].a, PR + 0.06).x, C[5].top + 2.5, polar(C[5].a, PR + 0.06).z, rad(C[5].a), 1.5);
  // Belt rollers at the ends of every conveyor, and hanging counterweights along the hall.
  for (const i of [1, 5, 8]) {
    const d = C[i];
    for (const e of [-1, 1]) {
      const ra = d.a + e * arc(d.len / 2);
      const rp = polar(ra, R);
      b.decor('hcyl', rp.x, d.top - 0.35, rp.z, 2.4, 0.3, 0, { mat: Mat.Metal, tint: 0x8a8a84, yaw: rad(ra + 90) });
    }
  }
  // MASTER: stone counterweights hanging outside the Belts, each a little higher than the last,
  // straight from the first belt to the upper loft — skipping the belts, the wall and the gap.
  const cwTop: HelixDeck[] = [];
  const mFrom = C[1];
  const mTo = C[7];
  const mR = R + 6;
  const mSpan = mFrom.a - mTo.a;
  const mN = Math.ceil(mSpan / 4.0);
  for (let i = 1; i <= mN; i++) {
    const t = i / mN;
    const a = mFrom.a - mSpan * t;
    const p = polar(a, mR);
    const top = mFrom.top + (mTo.top - mFrom.top) * t;
    b.block(p.x, top - 3.2, p.z, 2.6, 3.2, 2.6, { mat: Mat.Stone, tint: 0x8e8474, yaw: quantYaw(rad(a)) });
    hangCable(b, p.x, top, p.z, top + 40, 0);
    cwTop.push({ x: p.x, z: p.z, top, a, yaw: 0, len: 2.6 });
  }
  b.branch('master.r4.weights', 'master', () => {
    b.route(mFrom.x, mFrom.top, mFrom.z, 'run');
    for (const w of cwTop) b.route(w.x, w.top, w.z, 'jump');
    b.route(mTo.x, mTo.top, mTo.z, 'jump');
  });
  const mMid = cwTop[Math.floor(cwTop.length / 2)];
  b.trigger('t.r4.master', 'master_r4_weights', { type: 'enter', min: v3(mMid.x - 1.5, mMid.top - 0.5, mMid.z - 1.5), max: v3(mMid.x + 1.5, mMid.top + 2, mMid.z + 1.5) });
  // RISK: the drive belt — a narrow conveyor running uphill round the outside of the hall at
  // speed, from the belt loft straight to the Winch deck.
  const driveFrom = C[3];
  const cTop = C[C.length - 1];
  const dR = R + 3.2;
  const dA0 = driveFrom.a;
  const dA1 = cTop.a;
  beamArc(b, dA0, dA1, dR, driveFrom.top, cTop.top, 0.8, { mat: Mat.Asphalt, tint: 0x2a2826 }, 4, 3.4);
  for (const [a, top] of [
    [dA0, driveFrom.top],
    [dA1, cTop.top],
  ] as const) {
    const pp = polar(a, (R + dR) / 2 + 0.3);
    b.plat(pp.x, top, pp.z, dR - R + 0.9, 1.6, 0.3, { mat: Mat.Metal, tint: IRON, yaw: radialYaw(a) });
  }
  b.branch('risk.r4.drive', 'risk', () => {
    b.route(driveFrom.x, driveFrom.top, driveFrom.z, 'run');
    const n = Math.ceil((dA0 - dA1) / 4);
    for (let i = 0; i <= n; i++) {
      const t = i / n;
      const p = polar(dA0 + (dA1 - dA0) * t, dR);
      b.route(p.x, driveFrom.top + (cTop.top - driveFrom.top) * t, p.z, 'run');
    }
    b.route(cTop.x, cTop.top, cTop.z, 'run');
  });

  // ------------------------------------------------------------------ Section D: the Great Winch
  b.zone('area', -120, cTop.top - 2, -120, 120, cTop.top + 40, 120, { key: 'area.r4.winch' });
  // The drum: a horizontal cylinder the size of a house lying along the Pillar face.
  const drumA = cTop.a - arc(14);
  const drumP = polar(drumA, R + 11);
  const drumY = cTop.top + 9;
  b.decor('hcyl', drumP.x, drumY, drumP.z, 26, 8, 0, { mat: Mat.Metal, tint: 0x3e3a36, yaw: rad(drumA), landmark: true });
  for (let k = -3; k <= 3; k++) {
    const t = { x: dcos(rad(drumA)) * k * 3.6, z: -dsin(rad(drumA)) * k * 3.6 };
    b.decor('vgear', drumP.x + t.x, drumY, drumP.z + t.z, 8.3, 0.3, 0, { mat: Mat.Brass, tint: k % 2 ? BRASS : COPPER, yaw: rad(drumA), spin: 0 });
  }
  for (const e of [-1, 1]) {
    const t = { x: dcos(rad(drumA)) * e * 14, z: -dsin(rad(drumA)) * e * 14 };
    b.block(drumP.x + t.x, cTop.top - 6, drumP.z + t.z, 2.2, drumY - cTop.top + 6 + 1.5, 6, { mat: Mat.Brick, tint: 0x6a4a3a, yaw: quantYaw(rad(drumA)) });
  }
  b.collect('rec.r4.winch', 'record', drumP.x, drumY + 9, drumP.z);
  b.collect('e.r4.winch', 'echo', drumP.x, cTop.top - 24, drumP.z);
  const secD: HelixStep[] = [
    { move: 'jump', mat: Mat.Metal, tint: IRON },
    { move: 'scale', len: 4, wid: 3.4, mat: Mat.Brick, tint: 0x6a4a3a },
    { move: 'wallrun', len: 4, mat: Mat.Metal, tint: COPPER },
    { move: 'chimney', len: 3, wid: 3, mat: Mat.Brick, tint: 0x6a4a3a },
    { move: 'jump', mat: Mat.Metal, tint: IRON },
    { move: 'walk', len: 7, wid: 5, mat: Mat.Brass, tint: BRASS },
  ];
  const D = helix(b, 0, R, 0, -1, secD, { pillarR: PR, mat: Mat.Metal, from: cTop });
  const winchDeck = D[D.length - 1];
  b.anchor('r4.winch', polar(winchDeck.a, R - 1.6).x, winchDeck.top, polar(winchDeck.a, R - 1.6).z, 0, 'anchor.r4.winch');
  b.collect('f19', 'fragment', D[3].x, D[3].top + 1.0, D[3].z);
  numeral(b, 18, polar(winchDeck.a, PR + 0.06).x, winchDeck.top + 2.5, polar(winchDeck.a, PR + 0.06).z, rad(winchDeck.a), 1.6);
  // The brake lever at the head of the winch deck.
  const brake = polar(winchDeck.a - arc(2.4), R + 1.8);
  b.dbox(brake.x, winchDeck.top, brake.z, 0.25, 1.6, 0.25, { mat: Mat.Metal, tint: 0xa8322a });
  b.decor('sphere', brake.x, winchDeck.top + 1.7, brake.z, 0.2, 0, 0, { mat: Mat.Brass, tint: 0xd8b04a });
  b.trigger('t.r4.winch', 'r4_winch', { type: 'interact', pos: v3(brake.x, winchDeck.top + 1, brake.z), radius: 2.6 }, { textKey: 'mem.r4.winch', delay: 1.4 });
  const bStand = polar(winchDeck.a - arc(2.4), R + 0.6);
  b.route(bStand.x, winchDeck.top, bStand.z, 'interact', { expect: 'r4_winch' });
  b.routeFlags = ['r4_valve', 'r4_winch'];
  // The winch cage: once the brake is off it climbs to the Governor and back, forever.
  const cageA = past(winchDeck, 0.5, 3.4);
  const cage = polar(cageA, R);
  const cageRise = 26;
  b.mover(
    { kind: 'path', origin: v3(cage.x, winchDeck.top, cage.z), points: [v3(0, 0, 0), v3(0, cageRise, 0)], segTime: [10], pause: 3, activeFlag: 'r4_winch' },
    () => {
      b.plat(0, 0, 0, 3.4, 3.4, 0.4, { mat: Mat.Metal, tint: IRON, yaw: quantYaw(rad(cageA)) });
      for (const [dx, dz] of [
        [-1.6, -1.6],
        [1.6, 1.6],
        [-1.6, 1.6],
        [1.6, -1.6],
      ]) b.decor('box', dx, 1.4, dz, 0.1, 2.8, 0.1, { mat: Mat.Brass, tint: BRASS });
      b.decor('box', 0, 2.85, 0, 3.4, 0.1, 3.4, { mat: Mat.Metal, tint: IRON });
    },
  );
  b.cable(v3(cage.x, winchDeck.top + cageRise + 20, cage.z), v3(cage.x, winchDeck.top + 2.9, cage.z), 0, Mat.Metal, 0x2a2a2a);
  b.route(cage.x, winchDeck.top + cageRise, cage.z, 'ride');

  // ------------------------------------------------------------------ Section E: the Governor
  const govBase = winchDeck.top + cageRise;
  b.zone('area', -120, govBase - 2, -120, 120, govBase + 40, 120, { key: 'area.r4.governor' });
  const E0a = past({ x: cage.x, z: cage.z, top: govBase, a: cageA, yaw: 0, len: 3.4 }, 0.4, 4);
  const secE: HelixStep[] = [
    { move: 'start', len: 4, wid: 4, mat: Mat.Metal, tint: IRON },
    { move: 'hop', mat: Mat.Brass, tint: BRASS },
    { move: 'walk', len: 4, wid: 4, mat: Mat.Metal, tint: IRON },
  ];
  const E = helix(b, E0a, R, govBase, -1, secE, { pillarR: PR, mat: Mat.Metal });
  const govIn = E[E.length - 1];
  b.anchor('r4.governor', polar(govIn.a, R - 1.2).x, govIn.top, polar(govIn.a, R - 1.2).z, 0, 'anchor.r4.governor');
  // The flyweight governor: a spindle with two arms and iron balls, turning. Its arms are
  // walkways; ride one round to the far landing.
  const gvR = 6.5;
  const aGv = past(govIn, 0.5, 2 * (gvR + 1.4));
  const GV = polar(aGv, R);
  b.mover({ kind: 'rotate', origin: v3(GV.x, govIn.top, GV.z), angVel: -0.42, phase: 1.2 }, () => {
    b.cyl(0, -0.5, 0, 1.4, 0.5, { mat: Mat.Brass, tint: BRASS });
    for (const e of [-1, 1]) {
      b.plat(e * 3.6, 0, 0, 4.4, 1.0, 0.35, { mat: Mat.Metal, tint: IRON });
      b.plat(e * gvR, 0, 0, 2.8, 2.8, 0.5, { mat: Mat.Metal, tint: COPPER });
      b.decor('sphere', e * gvR, -1.8, 0, 1.3, 0, 0, { mat: Mat.Metal, tint: 0x3a3634 });
    }
    b.decor('cyl', 0, 4, 0, 0.35, 8, 0, { mat: Mat.Brass, tint: BRASS });
  });
  b.decor('cyl', GV.x, govIn.top - 12, GV.z, 0.6, 22, 0, { mat: Mat.Metal, tint: SOOT });
  const aF = aGv - arc(gvR + 1.4 + 0.5 + 2.5);
  const secF: HelixStep[] = [
    { move: 'start', len: 5, wid: 4, mat: Mat.Metal, tint: IRON, action: 'ride' },
    { move: 'chimney', len: 3, wid: 3, mat: Mat.Brick, tint: 0x6a4a3a },
    { move: 'jump', mat: Mat.Metal, tint: COPPER },
    { move: 'scale', len: 4, wid: 4, mat: Mat.Brick, tint: 0x6a4a3a },
    { move: 'hop', mat: Mat.Brass, tint: BRASS },
    { move: 'climb', mat: Mat.Metal, tint: IRON },
    { move: 'walk', len: 7, wid: 6, mat: Mat.Brass, tint: BRASS },
  ];
  const F = helix(b, aF, R, govIn.top, -1, secF, { pillarR: PR, mat: Mat.Metal });
  const fTop = F[F.length - 1];
  b.collect('f18', 'fragment', polar(fTop.a, R + 2.2).x, fTop.top + 1, polar(fTop.a, R + 2.2).z);
  lamp(b, fTop.x, fTop.top + 3, fTop.z, 0xffc070);
  for (const d of [...A1, ...A2, ...C, ...D, ...E, ...F]) if (d.len >= 4 && d.top > y0 + 3) lamp(b, polar(d.a, R + 1.9).x, d.top + 2.6, polar(d.a, R + 1.9).z, 0xffb060);

  // ------------------------------------------------------------------ trial & daily
  b.trial({
    id: 'trial.r4',
    nameKey: 'trial.r4',
    start: v3(A1[0].x, A1[0].top + 0.05, A1[0].z),
    startYaw: 0,
    gates: [
      { pos: v3(gIn.x, gIn.top + 1, gIn.z), r: 3 },
      { pos: v3(V.x, V.top + 1, V.z), r: 3 },
      { pos: v3(hallTop.x, hallTop.top + 1, hallTop.z), r: 3 },
      { pos: v3(cTop.x, cTop.top + 1, cTop.z), r: 3 },
      { pos: v3(cage.x, govBase + 1, cage.z), r: 3.5 },
    ],
    finish: { pos: v3(fTop.x, fTop.top + 1, fTop.z), r: 3.5 },
    medals: { bronze: 330, silver: 260, gold: 205, perfect: 175 },
    flags: ['r4_valve', 'r4_winch'],
    abilities: Ability.Sprint | Ability.Mantle | Ability.Slide | Ability.Vault | Ability.LedgeGrab | Ability.Rope | Ability.WallRun | Ability.WallJump | Ability.WallClimb,
    master: [{ pos: v3(cwTop[2].x, cwTop[2].top + 0.5, cwTop[2].z), r: 2.5 }],
  });
  for (const d of [A1[3], A2[2], A2[8], C[2], C[7], C[10], D[2], F[2]]) b.daily(d.x, d.top + 1, d.z);

  const topY = fTop.top + 4;
  pillar(b, y0 + 2, topY + 40, PR, PR, 4);
  b.data.meta.topY = topY;
  return { data: b.build(), exit: { x: fTop.x, y: fTop.top, z: fTop.z, a: fTop.a } };
}
