import { datan2, dcos, dsin, v3 } from '../../math';
import { RegionBuilder, quantYaw } from '../builder';
import { hangCable, helix, lamp, numeral, pillar, polar, type HelixStep } from '../kit';
import { Ability, Mat, SolidFlag, type RegionData } from '../types';

/**
 * REGION 03 — THE CONSTRUCTION
 * The long building front of generations 22–25. Every scaffold hangs from the floor above.
 * Orange girders, timber planks, tarps snapping in the wind, and two tower cranes that only
 * ever lowered loads.
 *
 * Teaches: wall run (lesson, tarp walls), balance on narrow girders.
 * Memory: your weight on Crane A's counterweight swings the whole crane into a bridge to
 * Crane B; the Long Hook starts climbing once its lever is thrown; a fall past the hanging
 * scaffolds reveals that they hang from above (record + echo).
 * Routes: SAFE scaffold stairs / RISK girder wall-runs / MASTER the jib-tip leap.
 */

const ATM = {
  skyTop: 0x4a7fc0,
  skyHorizon: 0xe6d3b0,
  fog: 0xd2c2a4,
  fogDensity: 0.0015,
  sunColor: 0xfff0d6,
  sunIntensity: 1.15,
  ambient: 0x7a6c58,
  sunDir: v3(0.3, 0.7, 0.45),
  weather: 1,
  cloudColor: 0xfff8ee,
  exposure: 1.0,
};

const PR = 36;
const ORANGE = 0xd8742a;
const rad = (d: number) => (d * Math.PI) / 180;
const deg = (r: number) => (r * 180) / Math.PI;

export interface Exit {
  x: number;
  y: number;
  z: number;
  a: number;
}

export function region03(entry: Exit): { data: RegionData; exit: Exit } {
  const y0 = entry.y;
  const b = new RegionBuilder({ index: 2, id: 'construction', baseY: y0 + 2, topY: y0 + 200, atmosphere: ATM, center: v3(0, 0, 0), radius: 150 });

  // ------------------------------------------------------------------ the underside: scaffolds hang from above
  // The Construction's lowest deck is a ring of formwork slabs; below it everything hangs.
  const baseTop = y0 + 22;
  for (let i = 0; i < 12; i++) {
    const a = i * 30;
    const p = polar(a, 70);
    b.block(p.x, baseTop - 3, p.z, 30, 3, 26, { mat: Mat.Concrete, tint: 0xa8a090, yaw: quantYaw(rad(a)) });
    // rebar stubs and formwork edges
    b.dbox(p.x, baseTop, p.z, 28, 0.25, 0.25, { mat: Mat.Rust, tint: 0x7a4a30, yaw: quantYaw(rad(a)) });
    // hanging scaffold towers below the slab (the story's clue)
    const q = polar(a + 12, 62);
    for (let h = 0; h < 3; h++) {
      b.dbox(q.x, baseTop - 3 - (h + 1) * 5, q.z, 4, 0.2, 4, { mat: Mat.Wood, tint: 0xa88a60 });
    }
    for (const [dx, dz] of [
      [-1.9, -1.9],
      [1.9, 1.9],
      [-1.9, 1.9],
      [1.9, -1.9],
    ]) {
      b.cable(v3(q.x + dx, baseTop - 3, q.z + dz), v3(q.x + dx, baseTop - 18, q.z + dz), 0, Mat.Metal, 0x33312e);
    }
  }

  // ------------------------------------------------------------------ Section A: the Building Front
  // Scaffold stairs from Crown Row up through a gap in the formwork.
  b.zone('area', -120, y0 - 2, -120, 120, baseTop + 20, 120, { key: 'area.r3.front' });
  const a0 = entry.a - (6 / 50) * (180 / Math.PI);
  const secA: HelixStep[] = [
    { move: 'start', mat: Mat.Wood, tint: 0xa88a60, support: 'post' },
    { move: 'ramp', mat: Mat.Wood, tint: 0xa88a60 },
    { move: 'ladder', mat: Mat.Wood, tint: 0x9a7a54 },
    { move: 'hop', mat: Mat.Wood, tint: 0xa88a60 },
    { move: 'ramp', mat: Mat.Metal, tint: 0x5a6068 },
    { move: 'climb', mat: Mat.Wood, tint: 0xa88a60 },
    { move: 'ladder', mat: Mat.Wood, tint: 0x9a7a54 },
    { move: 'walk', len: 5, wid: 4, mat: Mat.Concrete, tint: 0xb0a898 },
  ];
  const A = helix(b, a0, 50, y0 + 0.5, -1, secA, { pillarR: PR, mat: Mat.Wood });
  const aTop = A[A.length - 1];
  b.anchor('r3.front', polar(aTop.a, 48.6).x, aTop.top, polar(aTop.a, 48.6).z, 0, 'anchor.r3.front', true);
  numeral(b, 25, polar(aTop.a, PR + 0.06).x, aTop.top + 2.2, polar(aTop.a, PR + 0.06).z, rad(aTop.a), 1.4);
  // A fall from the front past the hanging scaffolds: the architecture record hangs there.
  b.collect('rec.r3.hanging', 'record', polar(aTop.a + 8, 60).x, aTop.top - 12, polar(aTop.a + 8, 60).z);
  b.collect('e.r3.girders', 'echo', polar(aTop.a - 4, 58).x, aTop.top - 20, polar(aTop.a - 4, 58).z);

  // ------------------------------------------------------------------ Section B: tarp walls (wall-run lesson)
  b.collect('l.wallrun', 'lesson', aTop.x, aTop.top + 1.3, aTop.z, Ability.WallRun);
  b.trigger('t.r3.hint.wallrun', 'hint_wallrun', { type: 'enter', min: v3(aTop.x - 3, aTop.top - 1, aTop.z - 3), max: v3(aTop.x + 3, aTop.top + 3, aTop.z + 3) }, { textKey: 'hint.wallrun' });
  const secB: HelixStep[] = [
    { move: 'start', len: 6, wid: 3, mat: Mat.Concrete, tint: 0xb0a898 },
    { move: 'wallrun', len: 4, mat: Mat.Cloth, tint: 0x3a6a8a },
    { move: 'climb', mat: Mat.Wood, tint: 0xa88a60 },
    { move: 'jump', mat: Mat.Girder, tint: ORANGE, wid: 1.4 },
    { move: 'wallrun', len: 4, mat: Mat.Cloth, tint: 0x3a6a8a },
    { move: 'hop', mat: Mat.Wood, tint: 0xa88a60 },
    { move: 'tall', mat: Mat.Concrete, tint: 0xb0a898 },
    { move: 'wallrun', len: 5, mat: Mat.Cloth, tint: 0xa84a2a },
    { move: 'walk', len: 5, wid: 4, mat: Mat.Concrete, tint: 0xb0a898 },
  ];
  const B = helix(b, aTop.a - ((aTop.len / 2 + 1.5 + 3) / 50) * (180 / Math.PI), 50, aTop.top, -1, secB, { pillarR: PR, mat: Mat.Wood });
  const bTop = B[B.length - 1];
  // Echoing the letter from Mira (age eleven): the ninth-step mark on a tarp wall.
  b.collect('f23', 'fragment', polar(B[4].a, 53.2).x, B[4].top + 2.6, polar(B[4].a, 53.2).z);

  // ------------------------------------------------------------------ Section C: the Twin Cranes
  b.zone('area', -120, bTop.top - 1, -120, 120, bTop.top + 60, 120, { key: 'area.r3.cranes' });
  // Crane A stands just outside the path; a plank leads to its mast foot.
  const cAa = bTop.a - 9;
  const cA = polar(cAa, 62);
  const mastH = 34;
  const mastBase = bTop.top;
  const mastTop = mastBase + mastH;
  b.rampBetween(bTop.x, bTop.z, bTop.top, cA.x, cA.z, mastBase, 1.4, { mat: Mat.Wood, tint: 0xa88a60 });
  b.plat(cA.x, mastBase, cA.z, 5, 5, 0.6, { mat: Mat.Concrete, tint: 0xb0a898 });
  // ladder up the mast's face toward the path
  const toPath = { x: bTop.x - cA.x, z: bTop.z - cA.z };
  const tpl = Math.hypot(toPath.x, toPath.z);
  const nA = v3(toPath.x / tpl, 0, toPath.z / tpl);
  mast(b, cA.x, mastBase, cA.z, mastH, faceYaw(nA));
  b.ladder(cA.x + nA.x * 1.26, mastBase, cA.z + nA.z * 1.26, mastTop, nA);
  b.route(cA.x + nA.x * 2.2, mastBase, cA.z + nA.z * 2.2, 'run');
  b.route(cA.x, mastTop, cA.z, 'ladder');
  b.anchor('r3.cranes', cA.x, mastTop, cA.z, 0, 'anchor.r3.cranes');
  // Crane B: 60 degrees further round, a little higher.
  const jibLen = 30;
  // Before it swings the jib reaches across toward the Pillar (35 degrees off square, so its tip
  // stops four metres short of the rock); the swing carries it out to crane B.
  const jibYaw0 = datan2(-(0 - cA.z), 0 - cA.x) + rad(35);
  const swing = rad(40);
  // position B so the swung jib tip meets B's mast top
  const yawAfter = jibYaw0 + swing;
  const tipX = cA.x + dcos(yawAfter) * (jibLen + 2.6);
  const tipZ = cA.z - dsin(yawAfter) * (jibLen + 2.6);
  const cB = { x: tipX, z: tipZ };
  const cBBase = bTop.top + 10;
  const mastBH = mastTop - cBBase + 0.4;
  b.cyl(cB.x, bTop.top - 3, cB.z, 3.2, 13, { mat: Mat.Concrete, tint: 0xa8a090 });
  mast(b, cB.x, cBBase, cB.z, mastBH);
  b.plat(cB.x, mastTop + 0.4, cB.z, 4.2, 4.2, 0.5, { mat: Mat.Metal, tint: 0x5a6068 });
  // Crane A's slewing top: cab, jib, counter-jib and counterweight turn together.
  b.mover(
    { kind: 'transition', origin: v3(cA.x, mastTop, cA.z), flag: 'r3_crane', fromYaw: 0, toYaw: swing, dur: 5.5 },
    () => {
      const jy = quantYaw(jibYaw0);
      const c = dcos(jibYaw0);
      const s = dsin(jibYaw0);
      const at = (lx: number) => ({ x: lx * c, z: -lx * s });
      // the slewing platform matches the mast so the ladder tops out beside it, not under it
      b.plat(0, 0.0, 0, 2.2, 2.2, 0.5, { mat: Mat.Metal, tint: 0x5a6068, yaw: jy });
      // operator's cab hangs off the side away from the ladder
      const side = s * nA.x + c * nA.z > 0 ? -2.3 : 2.3;
      b.block(s * side, -0.6, c * side, 2.2, 2.4, 2.4, { mat: Mat.Glass, tint: 0xd8742a, yaw: jy, flags: SolidFlag.NoWallRun });
      const jm = at(1.4 + jibLen / 2);
      b.plat(jm.x, 0, jm.z, jibLen + 0.6, 1.1, 0.5, { mat: Mat.Girder, tint: ORANGE, yaw: jy });
      b.decor('box', jm.x, 1.2, jm.z, jibLen, 0.08, 0.08, { mat: Mat.Girder, tint: ORANGE, yaw: jy });
      const cj = at(-1.1 - 5.8);
      b.plat(cj.x, 0, cj.z, 11.6, 1.6, 0.5, { mat: Mat.Girder, tint: ORANGE, yaw: jy });
      // the counterweight hangs below the end of the counter-jib
      // the counterweight hangs just beyond the end of the counter-jib, a hang-climb below it
      const cw = at(-14.2);
      b.block(cw.x, -2.2 - 2.4, cw.z, 2.6, 2.4, 2.6, { mat: Mat.Concrete, tint: 0x8a8274, yaw: jy, tag: 'r3_cw' });
      for (const k of [-0.9, 0.9]) {
        const e = at(-12.6);
        b.cable(v3(cw.x + s * k, -2.2, cw.z + c * k), v3(e.x + s * k, 0.1, e.z + c * k), 0, Mat.Metal, 0x2a2a2a);
      }
      // hook hanging off the jib tip
      const tip = at(1.7 + jibLen - 1);
      b.cable(v3(tip.x, 0, tip.z), v3(tip.x, -10, tip.z), 0, Mat.Metal, 0x2a2a2a);
      b.decor('box', tip.x, -10.4, tip.z, 0.5, 0.8, 0.3, { mat: Mat.Metal, tint: 0xd8b04a });
    },
  );
  b.trigger('t.r3.crane', 'r3_crane', { type: 'land', tag: 'r3_cw', minFall: 1.6 }, { textKey: 'mem.r3.crane', delay: 1.2, focus: v3(cB.x, mastTop, cB.z) });
  // Route: out the counter-jib, drop onto the weight (crane swings), climb back, cross the jib.
  const c = dcos(jibYaw0);
  const s = dsin(jibYaw0);
  b.route(cA.x - 12.1 * c, mastTop, cA.z + 12.1 * s, 'run');
  b.route(cA.x - 14.2 * c, mastTop - 2.2, cA.z + 14.2 * s, 'drop', { expect: 'r3_crane' });
  b.routeFlags = ['r3_crane'];
  const cwAfter = rot(cA, -14.2, jibYaw0 + swing);
  b.route(cwAfter.x, mastTop - 2.2, cwAfter.z, 'wait', { note: 'ride the counterweight round' });
  const cw2 = rot(cA, -12.1, jibYaw0 + swing);
  b.route(cw2.x, mastTop, cw2.z, 'mantle');
  const tip2 = rot(cA, 1.7 + jibLen - 1.5, jibYaw0 + swing);
  b.route(tip2.x, mastTop, tip2.z, 'run');
  b.route(cB.x, mastTop + 0.4, cB.z, 'jump');
  b.collect('rec.r3.cranes', 'record', cA.x - 2.4 * c, mastTop + 1.3, cA.z + 2.4 * s);
  b.collect('e.r3.counterweight', 'echo', cA.x - 14 * c, mastTop - 22, cA.z + 14 * s);
  b.collect('f24', 'fragment', cB.x, mastTop + 1.6, cB.z);
  // MASTER: from the jib tip BEFORE it swings, a leap onto a girder hanging off the Pillar.
  const preTip = rot(cA, 1.7 + jibLen, jibYaw0);
  const tipR = Math.hypot(preTip.x, preTip.z);
  const mPos = { x: (preTip.x / tipR) * (PR + 1.5), z: (preTip.z / tipR) * (PR + 1.5) };
  b.plat(mPos.x, mastTop - 0.6, mPos.z, 2.2, 2.2, 0.4, { mat: Mat.Girder, tint: ORANGE });
  hangCable(b, mPos.x, mastTop - 0.6, mPos.z, mastTop + 30, 0);
  b.branch('master.r3.jib', 'master', () => {
    b.route(cA.x, mastTop, cA.z, 'run');
    const onJib = rot(cA, 1.7 + jibLen - 1.2, jibYaw0);
    b.route(onJib.x, mastTop, onJib.z, 'run');
    b.route(mPos.x, mastTop - 0.6, mPos.z, 'longjump');
  });
  b.trigger('t.r3.master', 'master_r3_jib', { type: 'enter', min: v3(mPos.x - 1.2, mastTop - 1, mPos.z - 1.2), max: v3(mPos.x + 1.2, mastTop + 2, mPos.z + 1.2) });

  // ------------------------------------------------------------------ Section D: the Girder Forest
  b.zone('area', -120, mastTop + 1, -120, 120, mastTop + 45, 120, { key: 'area.r3.girders' });
  const bApex = mastTop + 0.4 + 7;
  const bDir = { x: cB.x, z: cB.z };
  const bAng = deg(datan2(bDir.x, bDir.z));
  const nB = v3(-cB.x / Math.hypot(cB.x, cB.z), 0, -cB.z / Math.hypot(cB.x, cB.z));
  b.block(cB.x, mastTop + 0.4, cB.z, 1.2, 7, 1.2, { mat: Mat.Girder, tint: ORANGE, flags: SolidFlag.NoWallRun, yaw: faceYaw(nB) });
  b.ladder(cB.x + nB.x * 0.66, mastTop + 0.4, cB.z + nB.z * 0.66, bApex, nB);
  // the apex deck sits back from the ladder so the climb tops out at its edge
  b.plat(cB.x - nB.x * 0.9, bApex, cB.z - nB.z * 0.9, 3, 3, 0.4, { mat: Mat.Metal, tint: 0x5a6068, yaw: faceYaw(nB) });
  b.route(cB.x, bApex, cB.z, 'ladder');
  b.anchor('r3.girders', cB.x + 0.8, bApex, cB.z + 0.8, 0, 'anchor.r3.girders');
  const r = Math.hypot(cB.x, cB.z);
  const secD: HelixStep[] = [
    { move: 'start', len: 3, wid: 3, mat: Mat.Metal, tint: 0x5a6068 },
    { move: 'beam', len: 6, wid: 0.9, mat: Mat.Girder, tint: ORANGE, gap: 0.2 },
    { move: 'jump', len: 3, wid: 1.2, mat: Mat.Girder, tint: ORANGE },
    { move: 'climb', len: 3, wid: 1.2, mat: Mat.Girder, tint: ORANGE },
    { move: 'wallrun', len: 4, wid: 1.4, mat: Mat.Girder, tint: 0xc8662a },
    { move: 'beam', len: 7, wid: 0.8, mat: Mat.Girder, tint: ORANGE, gap: 0.2 },
    { move: 'tall', len: 3, wid: 2, mat: Mat.Concrete, tint: 0xb0a898 },
    { move: 'jump', len: 3, wid: 1.2, mat: Mat.Girder, tint: ORANGE },
    { move: 'climb', len: 3, wid: 1.2, mat: Mat.Girder, tint: ORANGE },
    { move: 'wallrun', len: 4, wid: 1.4, mat: Mat.Girder, tint: 0xc8662a },
    { move: 'hop', len: 3, wid: 1.2, mat: Mat.Girder, tint: ORANGE },
    { move: 'tall', len: 3, wid: 2, mat: Mat.Concrete, tint: 0xb0a898 },
    { move: 'beam', len: 6, wid: 0.8, mat: Mat.Girder, tint: ORANGE, gap: 0.2 },
    { move: 'climb', len: 4, wid: 3, mat: Mat.Concrete, tint: 0xb0a898 },
    { move: 'walk', len: 5, wid: 4, mat: Mat.Concrete, tint: 0xb0a898 },
  ];
  const D = helix(b, bAng - ((1.5 + 0.3 + 1.5) / r) * (180 / Math.PI), r, bApex, -1, secD, { mat: Mat.Girder });
  for (const d of D) {
    // girders hang from above on rods
    hangCable(b, d.x, d.top - 0.2, d.z, d.top + 18, 0);
  }
  const dTop = D[D.length - 1];

  // ------------------------------------------------------------------ Section E: the Long Hook
  b.zone('area', -120, dTop.top - 1, -120, 120, dTop.top + 50, 120, { key: 'area.r3.hook' });
  const hookRise = 40;
  const hA = dTop.a - ((dTop.len / 2 + 0.6 + 1.6) / r) * (180 / Math.PI);
  const hp = polar(hA, r);
  const lever = polar(dTop.a, r + 1.9);
  b.decor('box', lever.x, dTop.top + 0.6, lever.z, 0.2, 1.2, 0.2, { mat: Mat.Metal, tint: 0xd8b04a });
  b.trigger('t.r3.hook', 'r3_hook', { type: 'interact', pos: v3(lever.x, dTop.top + 1, lever.z), radius: 2.8 }, { textKey: 'mem.r3.hook', delay: 0.8 });
  b.mover(
    { kind: 'path', origin: v3(hp.x, dTop.top, hp.z), points: [v3(0, 0, 0), v3(0, hookRise, 0)], segTime: [14], pause: 3, activeFlag: 'r3_hook' },
    () => {
      b.plat(0, 0, 0, 3.2, 3.2, 0.4, { mat: Mat.Metal, tint: 0x5a6068 });
      b.decor('box', 0, 0.3, 0, 0.6, 1.8, 0.4, { mat: Mat.Brass, tint: 0xd8b04a });
    },
  );
  b.cable(v3(hp.x, dTop.top + hookRise + 30, hp.z), v3(hp.x, dTop.top + 2, hp.z), 0, Mat.Metal, 0x2a2a2a);
  b.anchor('r3.hook', polar(dTop.a, r - 1.4).x, dTop.top, polar(dTop.a, r - 1.4).z, 0, 'anchor.r3.hook');
  const leverStand = polar(dTop.a, r + 0.6);
  b.route(leverStand.x, dTop.top, leverStand.z, 'interact', { expect: 'r3_hook' });
  b.routeFlags = ['r3_crane', 'r3_hook'];
  b.route(hp.x, dTop.top + hookRise, hp.z, 'ride');
  numeral(b, 24, polar(hA, PR + 0.06).x, dTop.top + 6, polar(hA, PR + 0.06).z, rad(hA), 1.6);
  numeral(b, 23, polar(hA, PR + 0.06).x, dTop.top + 26, polar(hA, PR + 0.06).z, rad(hA), 1.6);
  // ------------------------------------------------------------------ Section F: the Unfinished Floor
  b.zone('area', -120, dTop.top + hookRise - 2, -120, 120, dTop.top + hookRise + 40, 120, { key: 'area.r3.unfinished' });
  const fTop0 = dTop.top + hookRise;
  const fAng = hA - ((1.6 + 0.4 + 2.5) / r) * (180 / Math.PI);
  const secF: HelixStep[] = [
    { move: 'start', len: 5, wid: 5, mat: Mat.Concrete, tint: 0xb0a898 },
    { move: 'jump', len: 4, wid: 4, mat: Mat.Concrete, tint: 0xa8a090 },
    { move: 'wallrun', len: 4, wid: 3, mat: Mat.Concrete, tint: 0x9a9284 },
    { move: 'tall', len: 4, wid: 4, mat: Mat.Concrete, tint: 0xb0a898 },
    { move: 'long', len: 4, wid: 4, mat: Mat.Concrete, tint: 0xa8a090 },
    { move: 'climb', len: 5, wid: 5, mat: Mat.Concrete, tint: 0xb0a898 },
    { move: 'walk', len: 7, wid: 6, mat: Mat.Concrete, tint: 0xb8b0a0 },
  ];
  const F = helix(b, fAng, r, fTop0, -1, secF, { mat: Mat.Concrete });
  const fTop = F[F.length - 1];
  b.anchor('r3.unfinished', polar(fTop.a, r - 2).x, fTop.top, polar(fTop.a, r - 2).z, 0, 'anchor.r3.unfinished');
  b.collect('f25', 'fragment', polar(fTop.a, r + 2.2).x, fTop.top + 1, polar(fTop.a, r + 2.2).z);
  b.collect('f22', 'fragment', F[3].x, F[3].top + 1, F[3].z);
  // rebar forest and formwork on the unfinished slab
  for (let i = 0; i < 14; i++) {
    const p = polar(fTop.a + (i - 7) * 1.6, r + ((i * 7) % 5) - 2);
    b.dbox(p.x, fTop.top, p.z, 0.05, 1.4 + (i % 3) * 0.5, 0.05, { mat: Mat.Rust, tint: 0x7a4a30 });
  }
  lamp(b, fTop.x, fTop.top + 3, fTop.z, 0xffd080);

  // ------------------------------------------------------------------ trial & daily
  b.trial({
    id: 'trial.r3',
    nameKey: 'trial.r3',
    start: v3(A[0].x, A[0].top + 0.05, A[0].z),
    startYaw: 0,
    gates: [
      { pos: v3(aTop.x, aTop.top + 1, aTop.z), r: 3 },
      { pos: v3(bTop.x, bTop.top + 1, bTop.z), r: 3 },
      { pos: v3(cB.x, mastTop + 1.4, cB.z), r: 3 },
      { pos: v3(D[7].x, D[7].top + 1, D[7].z), r: 3 },
      { pos: v3(hp.x, fTop0 + 1, hp.z), r: 3.5 },
    ],
    finish: { pos: v3(fTop.x, fTop.top + 1, fTop.z), r: 3.5 },
    medals: { bronze: 260, silver: 205, gold: 165, perfect: 140 },
    flags: ['r3_crane', 'r3_hook'],
    abilities: Ability.Sprint | Ability.Mantle | Ability.Slide | Ability.Vault | Ability.LedgeGrab | Ability.Rope | Ability.WallRun,
    master: [{ pos: v3(mPos.x, mastTop + 0.5, mPos.z), r: 2.5 }],
  });
  for (const d of [A[2], B[2], B[6], D[2], D[6], D[10], F[1], F[4]]) b.daily(d.x, d.top + 1, d.z);

  const topY = fTop.top + 4;
  pillar(b, y0 + 2, topY + 40, PR, PR, 3);
  b.data.meta.topY = topY;
  return { data: b.build(), exit: { x: fTop.x, y: fTop.top, z: fTop.z, a: fTop.a } };
}

/** Lattice crane mast: solid core for collision, corner posts and bracing as detail. */
/** Lattice crane mast; `yaw` turns it so one face looks along the ladder's normal. */
function mast(b: RegionBuilder, x: number, y0: number, z: number, h: number, yaw = 0): void {
  const c = dcos(yaw);
  const s = dsin(yaw);
  const L = (lx: number, lz: number) => ({ x: x + lx * c + lz * s, z: z - lx * s + lz * c });
  b.block(x, y0, z, 2.2, h, 2.2, { mat: Mat.Girder, tint: 0x9a5a28, flags: SolidFlag.NoWallRun | SolidFlag.NoGrab, yaw });
  for (const [dx, dz] of [
    [-1.2, -1.2],
    [1.2, -1.2],
    [-1.2, 1.2],
    [1.2, 1.2],
  ]) {
    const p = L(dx, dz);
    b.dbox(p.x, y0, p.z, 0.22, h, 0.22, { mat: Mat.Girder, tint: ORANGE, yaw });
  }
  for (let yy = y0 + 2; yy < y0 + h; yy += 3) {
    for (const sgn of [-1, 1]) {
      const pz = L(0, 1.2 * sgn);
      b.dbox(pz.x, yy, pz.z, 2.4, 0.12, 0.12, { mat: Mat.Girder, tint: ORANGE, yaw });
      const px = L(1.2 * sgn, 0);
      b.dbox(px.x, yy + 1.5, px.z, 0.12, 0.12, 2.4, { mat: Mat.Girder, tint: ORANGE, yaw });
    }
  }
}

/** Box yaw that turns a box's local +x face to look along horizontal normal n. */
function faceYaw(n: { x: number; z: number }): number {
  return quantYaw(datan2(-n.z, n.x));
}

/** Point at local distance `l` along a yaw from a centre (three.js yaw convention). */
function rot(c: { x: number; z: number }, l: number, yaw: number): { x: number; z: number } {
  return { x: c.x + l * dcos(yaw), z: c.z - l * dsin(yaw) };
}
