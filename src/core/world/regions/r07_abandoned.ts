import { v3 } from '../../math';
import { RegionBuilder, quantYaw } from '../builder';
import { facadeRot, hangCable, helix, lamp, numeral, pillar, polar, type HelixDeck } from '../kit';
import { Mat, SolidFlag, type RegionData } from '../types';
import type { Exit } from './r03_construction';

/**
 * REGION 07 — THE ABANDONED
 * Generations 8–10 left in a single winter when the storm above grew. Streets half fallen away,
 * a cathedral with no roof, houses leaning together, terraces gone to moss and a belltower
 * whose bells were carried down — all but one.
 *
 * Teaches: nothing new — it tests everything, on surfaces that crumble.
 * Memory: the cathedral's west wall comes down behind you and the nave is changed for good; the
 * last bell falls when you pull its rope and lodges across the tower shaft as a bridge.
 * Routes: SAFE the nave / RISK the cathedral wall-top / MASTER the belltower's outside.
 */

const ATM = {
  skyTop: 0x4e5e6e,
  skyHorizon: 0xb4b8a8,
  fog: 0x9aa294,
  fogDensity: 0.0021,
  sunColor: 0xe8e0c8,
  sunIntensity: 0.85,
  ambient: 0x5a6258,
  sunDir: v3(-0.3, 0.6, -0.55),
  weather: 1,
  cloudColor: 0xd8dcd4,
  exposure: 0.98,
};

const PR = 28;
const R = 51;
const STONE = 0xa8a294;
const DARK = 0x6e6a60;
const MOSS = 0x5a6e3e;
const rad = (d: number) => (d * Math.PI) / 180;
const arc = (m: number, r = R) => (m / r) * (180 / Math.PI);
const deck = (x: number, z: number, top: number, a: number, len: number): HelixDeck => ({ x, z, top, a, yaw: 0, len });

/** A straight local frame on the path: s along the direction of travel, t outward from the Pillar. */
function frame(center: { x: number; z: number }, a: number) {
  const ar = rad(a);
  const u = { x: -Math.cos(ar), z: Math.sin(ar) };
  const w = { x: Math.sin(ar), z: Math.cos(ar) };
  const at = (s: number, t: number) => ({ x: center.x + u.x * s + w.x * t, z: center.z + u.z * s + w.z * t });
  const yaw = quantYaw(Math.atan2(-u.z, u.x));
  return { u, w, at, yaw };
}

export function region07(entry: Exit): { data: RegionData; exit: Exit } {
  const y0 = entry.y;
  const b = new RegionBuilder({ index: 6, id: 'abandoned', baseY: y0 + 2, topY: y0 + 170, atmosphere: ATM, center: v3(0, 0, 0), radius: 150 });

  // ------------------------------------------------------------------ Section A: the Sunken Streets
  b.zone('area', -140, y0 - 2, -140, 140, y0 + 16, 140, { key: 'area.r7.streets' });
  const S = helix(
    b,
    0,
    R,
    0,
    -1,
    [
      { move: 'walk', len: 6, wid: 5, mat: Mat.Stone, tint: STONE },
      { move: 'jump', len: 5, wid: 5, mat: Mat.Stone, tint: STONE },
      { move: 'hop', len: 3, wid: 3, mat: Mat.Stone, tint: DARK, flags: SolidFlag.Crumble },
      { move: 'hop', len: 3, wid: 3, mat: Mat.Stone, tint: DARK, flags: SolidFlag.Crumble },
      { move: 'jump', len: 5, wid: 5, mat: Mat.Stone, tint: STONE },
      { move: 'climb', len: 4, wid: 4, mat: Mat.Stone, tint: STONE },
      { move: 'long', len: 4, wid: 4, mat: Mat.Stone, tint: STONE },
      { move: 'step', len: 3, wid: 3, mat: Mat.Stone, tint: DARK, flags: SolidFlag.Crumble },
      { move: 'climb', len: 7, wid: 5, mat: Mat.Stone, tint: STONE },
    ],
    { from: deck(entry.x, entry.z, entry.y, entry.a, 7), pillarR: PR, mat: Mat.Stone },
  );
  b.anchor('r7.streets', polar(S[1].a, R - 1.4).x, S[1].top, polar(S[1].a, R - 1.4).z, 0, 'anchor.r7.streets', true);
  numeral(b, 10, polar(S[2].a, PR + 0.06).x, S[2].top + 2.5, polar(S[2].a, PR + 0.06).z, rad(S[2].a), 1.5);
  // Ruined house fronts along the street, windows dark.
  for (let i = 1; i < S.length; i += 2) {
    const p = polar(S[i].a, R + 7.5);
    facadeRot(b, p.x, S[i].top - 12, p.z, 7, 16 + (i % 3) * 3, 5, quantYaw(rad(S[i].a)), [0x8a8274, 0x7a7466, 0x9a9282][i % 3], Mat.Plaster, 0);
    b.decor('vines', p.x, S[i].top + 3, p.z, 5, 8, 0.5, { tint: MOSS, yaw: rad(S[i].a) });
  }

  // ------------------------------------------------------------------ Section B: the Hollow Cathedral
  const sEnd = S[S.length - 1];
  const yC = sEnd.top;
  const aC = sEnd.a - arc(sEnd.len / 2 + 25);
  const C = frame(polar(aC, R), aC);
  b.zone('area', -140, yC - 2, -140, 140, yC + 20, 140, { key: 'area.r7.cathedral' });
  const P = (s: number, t: number) => C.at(s, t);
  // approach causeway into the west door
  const cw0 = P(-22, 0);
  b.plat(cw0.x, yC, cw0.z, 6.2, 3, 0.4, { mat: Mat.Stone, tint: STONE, yaw: C.yaw });
  b.route(cw0.x, yC, cw0.z, 'run');
  // floor, long walls, columns
  const cc = P(0, 0);
  b.plat(cc.x, yC, cc.z, 38, 13, 0.8, { mat: Mat.Marble, tint: 0xb8b0a0, yaw: C.yaw });
  for (const t of [-6.9, 6.9]) {
    const p = P(0, t);
    b.block(p.x, yC - 0.8, p.z, 38, 17, 0.9, { mat: Mat.Stone, tint: STONE, yaw: C.yaw, flags: SolidFlag.NoWallRun });
    for (let s = -15; s <= 15; s += 6) {
      const q = P(s, t * 0.99);
      b.decor('window', q.x, yC + 10, q.z, 2.2, 4.4, 1.0, { mat: Mat.Glass, tint: 0x3a4450, yaw: C.yaw });
    }
  }
  for (let s = -15; s <= 15; s += 6) {
    for (const t of [-4, 4]) {
      const q = P(s, t);
      if (s === 3 && t > 0) {
        // this one has fallen: its drum lies across the nave
        b.block(P(s - 1, 0).x, yC, P(s - 1, 0).z, 1.2, 0.9, 7, { mat: Mat.Stone, tint: DARK, yaw: C.yaw });
        continue;
      }
      b.cyl(q.x, yC, q.z, 0.7, 12, { mat: Mat.Stone, tint: 0xb8b0a0, flags: SolidFlag.NoWallRun });
      b.dbox(q.x, yC + 12, q.z, 1.8, 0.7, 1.8, { mat: Mat.Stone, tint: 0xc8c0b0, yaw: C.yaw });
    }
  }
  // fallen column drums to vault on the way in
  for (const s of [-13, -7]) {
    const p = P(s, 0);
    b.block(p.x, yC, p.z, 1.3, 0.9, 6, { mat: Mat.Stone, tint: DARK, yaw: C.yaw });
  }
  // The west wall with its door — until it comes down.
  b.unless('r7_collapse', () => {
    for (const t of [-4.25, 4.25]) {
      const p = P(-19, t);
      b.block(p.x, yC - 0.8, p.z, 0.9, 17, 4.5, { mat: Mat.Stone, tint: STONE, yaw: C.yaw, flags: SolidFlag.NoWallRun });
    }
    const l = P(-19, 0);
    b.block(l.x, yC + 4.2, l.z, 0.9, 12, 4.1, { mat: Mat.Stone, tint: STONE, yaw: C.yaw });
  });
  b.when('r7_collapse', () => {
    // rubble heaped across the west end: a ramp out over the causeway
    for (let k = 0; k < 5; k++) {
      const p = P(-19.5 + (k % 2) * 1.5, -4 + k * 2);
      b.ramp(p.x, yC, p.z, 3.2, 1.2 + (k % 3) * 0.6, 2.2, 0, { mat: Mat.Stone, tint: DARK, yaw: quantYaw(rad(aC + k * 23)) });
    }
    b.decor('box', P(-24, 2).x, yC - 1, P(-24, 2).z, 3, 1.4, 2, { mat: Mat.Stone, tint: DARK, yaw: rad(aC + 40) });
  });
  b.anchor('r7.cathedral', P(-12, -2.5).x, yC, P(-12, -2.5).z, 0, 'anchor.r7.cathedral');
  b.collect('rec.r7.cathedral', 'record', P(-9, 0).x, yC + 1.2, P(-9, 0).z);
  b.route(P(-17, 0).x, yC, P(-17, 0).z, 'run');
  b.route(P(-10, 0).x, yC, P(-10, 0).z, 'run');
  b.route(P(-3, 1).x, yC, P(-3, 1).z, 'run');
  // the collapsed-column pile up to the clerestory arcade
  const pile: [number, number][] = [
    [0.3, 1.2],
    [2.5, 2.4],
    [4.75, 4.6],
  ];
  for (const [s, top] of pile) {
    const p = P(s, 4.9);
    b.block(p.x, yC, p.z, 2, top, 2, { mat: Mat.Stone, tint: DARK, yaw: C.yaw });
    b.route(p.x, yC + top, p.z, 'mantle');
  }
  const walkY = yC + 9;
  const arcadeA = P(7.5, 5.35);
  b.block(arcadeA.x, yC, arcadeA.z, 3, 9, 1.3, { mat: Mat.Stone, tint: STONE, yaw: C.yaw });
  b.route(arcadeA.x, walkY, arcadeA.z, 'climb');
  // two crumbling planks across the gap in the arcade, then solid stone to the apse
  for (const s of [10.5, 13.5]) {
    const p = P(s, 5.35);
    b.plat(p.x, walkY, p.z, 3, 1.3, 0.3, { mat: Mat.Wood, tint: 0x6a5a44, yaw: C.yaw, flags: SolidFlag.Crumble });
  }
  const arcadeB = P(16.2, 5.35);
  b.block(arcadeB.x, yC, arcadeB.z, 2.4, 9, 1.3, { mat: Mat.Stone, tint: STONE, yaw: C.yaw });
  b.route(arcadeB.x, walkY, arcadeB.z, 'run');
  const apse = P(17.9, 2.2);
  b.plat(apse.x, walkY, apse.z, 1.4, 7.6, 0.4, { mat: Mat.Stone, tint: STONE, yaw: C.yaw });
  b.route(P(17.9, 0.5).x, walkY, P(17.9, 0.5).z, 'run');
  b.collect('f10', 'fragment', P(17.9, -1).x, walkY + 1, P(17.9, -1).z);
  b.trigger('t.r7.collapse', 'r7_collapse', { type: 'enter', min: v3(apse.x - 2, walkY - 0.5, apse.z - 2), max: v3(apse.x + 2, walkY + 3, apse.z + 2) }, { textKey: 'mem.r7.collapse', delay: 0.4, focus: v3(P(-19, 0).x, yC + 6, P(-19, 0).z) });
  // The east wall with its tall window: the way out.
  const ew = P(19, 0);
  b.block(ew.x, yC - 0.8, ew.z, 0.9, walkY - 0.2 - (yC - 0.8), 13, { mat: Mat.Stone, tint: STONE, yaw: C.yaw, flags: SolidFlag.NoWallRun });
  for (const t of [-4.2, 4.2]) {
    const p = P(19, t);
    b.block(p.x, walkY - 0.2, p.z, 0.9, 7.2, 5.6, { mat: Mat.Stone, tint: STONE, yaw: C.yaw, flags: SolidFlag.NoWallRun });
  }
  const lin = P(19, 0);
  b.block(lin.x, walkY + 2.9, lin.z, 0.9, 4.1, 2.8, { mat: Mat.Stone, tint: STONE, yaw: C.yaw });
  const sill = P(22, 0);
  b.plat(sill.x, walkY, sill.z, 5.4, 2, 0.35, { mat: Mat.Wood, tint: 0x7a6a50, yaw: C.yaw });
  b.route(sill.x, walkY, sill.z, 'run');
  b.collect('e.r7.cathedral', 'echo', P(23, 0).x, yC - 16, P(23, 0).z);

  // RISK: along the top of the nave's outer wall, from a buttress outside the door.
  const buttress = P(-17.5, 8.9);
  b.block(buttress.x, yC - 0.8, buttress.z, 2.4, 9.2, 2.4, { mat: Mat.Stone, tint: STONE, yaw: C.yaw });
  const btop = yC + 8.4;
  const buttress2 = P(-15, 8.9);
  b.block(buttress2.x, yC - 0.8, buttress2.z, 2.4, 13.7, 2.4, { mat: Mat.Stone, tint: STONE, yaw: C.yaw });
  const bstep = P(-20.5, 8.9);
  b.block(bstep.x, yC - 0.8, bstep.z, 2.4, 4.9, 2.4, { mat: Mat.Stone, tint: DARK, yaw: C.yaw });
  b.branch('risk.r7.walltop', 'risk', () => {
    b.route(cw0.x, yC, cw0.z, 'run');
    const side = P(-21.5, 4);
    b.plat(side.x, yC, side.z, 3, 6, 0.4, { mat: Mat.Stone, tint: STONE, yaw: C.yaw });
    b.route(side.x, yC, side.z, 'run');
    b.route(bstep.x, yC + 4.1, bstep.z, 'climb');
    b.route(buttress.x, btop, buttress.z, 'climb');
    b.route(buttress2.x, yC + 12.9, buttress2.z, 'climb');
    b.route(P(-13, 6.9).x, yC + 16.2, P(-13, 6.9).z, 'climb');
    b.route(P(0, 6.9).x, yC + 16.2, P(0, 6.9).z, 'run');
    b.route(P(16, 6.9).x, yC + 16.2, P(16, 6.9).z, 'run');
    b.route(arcadeB.x, walkY, arcadeB.z, 'drop');
  });

  // ------------------------------------------------------------------ Section C: the Leaning Quarter
  b.zone('area', -140, walkY - 12, -140, 140, walkY + 20, 140, { key: 'area.r7.quarter' });
  const qA = Math.atan2(sill.x + C.u.x * 3.4, sill.z + C.u.z * 3.4) * (180 / Math.PI);
  const qR = Math.hypot(sill.x + C.u.x * 3.4, sill.z + C.u.z * 3.4);
  const Q = helix(
    b,
    0,
    qR,
    0,
    -1,
    [
      { move: 'drop', len: 5, wid: 4, dh: -3.5, gap: 1.2, mat: Mat.Tile, tint: 0x7a4a3a },
      { move: 'ramp', len: 4, wid: 4, mat: Mat.Tile, tint: 0x8a5040 },
      { move: 'jump', len: 3, wid: 3, mat: Mat.Tile, tint: 0x7a4a3a, flags: SolidFlag.Crumble },
      { move: 'hop', len: 4, wid: 4, mat: Mat.Tile, tint: 0x8a5040 },
      { move: 'wallrun', len: 4, wid: 4, mat: Mat.Plaster, tint: 0x8a8274 },
      { move: 'climb', len: 4, wid: 4, mat: Mat.Tile, tint: 0x7a4a3a },
      { move: 'long', len: 4, wid: 3, mat: Mat.Tile, tint: 0x8a5040 },
      { move: 'scale', len: 4, wid: 4, mat: Mat.Plaster, tint: 0x8a8274 },
      { move: 'walk', len: 6, wid: 5, mat: Mat.Tile, tint: 0x7a4a3a },
    ],
    { from: deck(sill.x + C.u.x * 3.4, sill.z + C.u.z * 3.4, walkY, qA, 0.1), mat: Mat.Tile },
  );
  // the houses beneath the roofs, leaning on each other
  for (let i = 1; i < Q.length; i++) {
    const d = Q[i];
    const lean = ((i % 3) - 1) * 6;
    const p = polar(d.a, qR + 0.4);
    facadeRot(b, p.x, d.top - 14, p.z, d.len - 0.2, 13.7, 3.6, quantYaw(rad(d.a + lean)), [0x9a8a74, 0x8a7e6c, 0xa89a84][i % 3], Mat.Plaster, 0);
  }
  b.anchor('r7.quarter', polar(Q[4].a, qR).x, Q[4].top, polar(Q[4].a, qR).z, 0, 'anchor.r7.quarter');
  b.collect('rec.r7.houses', 'record', Q[5].x, Q[5].top + 1.2, Q[5].z);
  b.collect('e.r7.quarter', 'echo', polar(Q[3].a, qR + 4).x, Q[3].top - 22, polar(Q[3].a, qR + 4).z);
  b.collect('f9', 'fragment', Q[8].x, Q[8].top + 1, Q[8].z);
  numeral(b, 9, polar(Q[6].a, PR + 0.06).x, Q[6].top + 2.5, polar(Q[6].a, PR + 0.06).z, rad(Q[6].a), 1.4);

  // ------------------------------------------------------------------ Section D: the Overgrown Terraces
  const qTop = Q[Q.length - 1];
  b.zone('area', -140, qTop.top - 2, -140, 140, qTop.top + 24, 140, { key: 'area.r7.terraces' });
  const T = helix(
    b,
    0,
    qR,
    0,
    -1,
    [
      { move: 'step', len: 4, wid: 4, mat: Mat.Moss, tint: MOSS },
      { move: 'step', len: 3, wid: 3, mat: Mat.Moss, tint: 0x4e6234, flags: SolidFlag.Crumble },
      { move: 'climb', len: 4, wid: 4, mat: Mat.Moss, tint: MOSS },
      { move: 'jump', len: 3, wid: 3, mat: Mat.Stone, tint: DARK },
      { move: 'tall', len: 4, wid: 4, mat: Mat.Moss, tint: MOSS },
      { move: 'chimney', len: 3, wid: 3, mat: Mat.Stone, tint: DARK },
      { move: 'hop', len: 3, wid: 3, mat: Mat.Moss, tint: 0x4e6234, flags: SolidFlag.Crumble },
      { move: 'climb', len: 4, wid: 4, mat: Mat.Moss, tint: MOSS },
      { move: 'walk', len: 7, wid: 6, mat: Mat.Moss, tint: MOSS },
    ],
    { from: qTop, pillarR: PR, mat: Mat.Moss },
  );
  for (const d of T.slice(1)) {
    b.decor('vines', polar(d.a, qR + 1.6).x, d.top - 3, polar(d.a, qR + 1.6).z, d.len, 4, 0.4, { tint: MOSS, yaw: rad(d.a) });
    if (d.len >= 4) b.decor('plant', polar(d.a, qR - 1.2).x, d.top, polar(d.a, qR - 1.2).z, 0.5, 0, 0, { tint: 0x6a8a4a });
  }
  b.anchor('r7.terraces', polar(T[3].a, qR - 0.8).x, T[3].top, polar(T[3].a, qR - 0.8).z, 0, 'anchor.r7.terraces');
  b.collect('e.r7.terraces', 'echo', polar(T[5].a, qR + 3).x, T[5].top - 25, polar(T[5].a, qR + 3).z);
  b.collect('f8', 'fragment', T[7].x, T[7].top + 1, T[7].z);
  numeral(b, 8, polar(T[8].a, PR + 0.06).x, T[8].top + 2.5, polar(T[8].a, PR + 0.06).z, rad(T[8].a), 1.4);

  // ------------------------------------------------------------------ Section E: the Empty Belltower
  const tTop = T[T.length - 1];
  const yB = tTop.top;
  const aB = tTop.a - arc(tTop.len / 2 + 1 + 5.4, qR);
  const Bf = frame(polar(aB, qR), aB);
  const Bp = (s: number, t: number) => Bf.at(s, t);
  b.zone('area', -140, yB - 2, -140, 140, yB + 30, 140, { key: 'area.r7.belltower' });
  const bc = Bp(0, 0);
  b.plat(bc.x, yB, bc.z, 10.8, 10, 0.6, { mat: Mat.Stone, tint: STONE, yaw: Bf.yaw });
  // two standing walls (inner and outer); the other two have fallen
  for (const t of [-5, 5]) {
    const p = Bp(0, t);
    b.block(p.x, yB - 0.6, p.z, 10.8, t > 0 ? 17.6 : 25.6, 0.8, { mat: Mat.Stone, tint: DARK, yaw: Bf.yaw, flags: SolidFlag.NoWallRun });
  }
  // the outer wall above the window
  const ow = Bp(0, 5);
  b.block(ow.x, yB + 20.6, ow.z, 10.8, 4.4, 0.8, { mat: Mat.Stone, tint: DARK, yaw: Bf.yaw, flags: SolidFlag.NoWallRun });
  for (const s of [-3.85, 3.85]) {
    const p = Bp(s, 5);
    b.block(p.x, yB + 17, p.z, 3.1, 3.6, 0.8, { mat: Mat.Stone, tint: DARK, yaw: Bf.yaw, flags: SolidFlag.NoWallRun });
  }
  b.anchor('r7.belltower', Bp(-3.5, 0).x, yB, Bp(-3.5, 0).z, 0, 'anchor.r7.belltower');
  b.route(Bp(-2, -1).x, yB, Bp(-2, -1).z, 'run');
  // stone corbels up the inner wall, zig-zagging
  const corbelT = -3.8;
  let cy = yB + 2.2;
  let k = 0;
  const corbels: { x: number; z: number; y: number }[] = [];
  while (cy < yB + 17.6 - 0.1) {
    const s = k % 2 ? 1.5 : -1.5;
    const p = Bp(s, corbelT);
    b.plat(p.x, cy, p.z, 1.6, 1.6, 0.4, { mat: Mat.Stone, tint: STONE, yaw: Bf.yaw });
    corbels.push({ x: p.x, z: p.z, y: cy });
    cy += 2.2;
    k++;
  }
  for (const c of corbels) b.route(c.x, c.y, c.z, 'mantle');
  // the landing at the top of the inner wall
  const landY = yB + 17.6;
  const land = Bp(2.8, -3.7);
  b.plat(land.x, landY, land.z, 4.2, 1.8, 0.4, { mat: Mat.Stone, tint: STONE, yaw: Bf.yaw });
  b.route(land.x, landY, land.z, 'mantle');
  // The last bell hangs over the shaft from a rotten beam.
  const beamTop0 = yB + 23;
  const fall = 9.6;
  b.mover({ kind: 'transition', origin: v3(bc.x, beamTop0, bc.z), flag: 'r7_bell', toOff: v3(0, -fall, 0), dur: 1.4 }, () => {
    // beam from the inner wall to the sill's stonework, the bell hanging from its middle
    const mid = { x: Bf.w.x * -0.9, z: Bf.w.z * -0.9 };
    b.block(mid.x, -0.8, mid.z, 1.2, 0.8, 7.2, { mat: Mat.Wood, tint: 0x5a4632, yaw: Bf.yaw, flags: SolidFlag.NoWallRun });
    b.cyl(mid.x, -4.0, mid.z, 2.0, 3.2, { mat: Mat.Brass, tint: 0x8a6a3a, flags: SolidFlag.NoWallRun | SolidFlag.NoGrab });
    b.decor('cone', mid.x, -1.6, mid.z, 1.2, 0.9, 0, { mat: Mat.Brass, tint: 0x8a6a3a });
  });
  // the bell rope hangs down to the landing
  b.cable(v3(Bp(0, -2).x, beamTop0 - 1.2, Bp(0, -2).z), v3(Bp(0, -2.4).x, landY + 1.2, Bp(0, -2.4).z), 0.1, Mat.Cloth, 0xb8a888);
  b.trigger('t.r7.bell', 'r7_bell', { type: 'interact', pos: v3(Bp(0.6, -2.6).x, landY + 1.2, Bp(0.6, -2.6).z), radius: 2.2 }, { textKey: 'mem.r7.bell', delay: 0.6, focus: v3(bc.x, landY - 4, bc.z) });
  b.route(Bp(1.2, -3.4).x, landY, Bp(1.2, -3.4).z, 'interact', { expect: 'r7_bell' });
  b.routeFlags = ['r7_collapse', 'r7_bell'];
  const beamY = beamTop0 - fall;
  b.route(Bp(0, -1.2).x, beamY, Bp(0, -1.2).z, 'drop');
  b.route(Bp(0, 2.2).x, beamY, Bp(0, 2.2).z, 'run');
  // the sill on the outer wall, reached by running up the stone beneath it
  const sillB = Bp(0, 3.7);
  b.block(sillB.x, beamY - 0.4, sillB.z, 2.6, landY - 0.25 - (beamY - 0.4), 1.8, { mat: Mat.Stone, tint: STONE, yaw: Bf.yaw, flags: SolidFlag.NoGrab });
  b.plat(sillB.x, landY, sillB.z, 2.6, 1.8, 0.25, { mat: Mat.Stone, tint: STONE, yaw: Bf.yaw });
  b.route(sillB.x, landY, sillB.z, 'climb');
  // through the window to a balcony outside: the way on.
  const balc = Bp(0, 7.2);
  b.plat(balc.x, landY, balc.z, 5, 3.4, 0.5, { mat: Mat.Stone, tint: STONE, yaw: Bf.yaw });
  b.route(balc.x, landY, balc.z, 'run');
  lamp(b, balc.x, landY + 3, balc.z, 0xffd8a0);

  // MASTER: kick up between the tower's inner wall and a leaning chimney stack, cross the tower
  // top on a fallen timber and drop to the balcony — the bell never rings.
  const gapFloor = Bp(-6.2, -6.55);
  b.plat(gapFloor.x, yB, gapFloor.z, 3, 2.2, 0.5, { mat: Mat.Stone, tint: STONE, yaw: Bf.yaw });
  const stack = Bp(-6.2, -8.3);
  b.block(stack.x, yB - 6, stack.z, 3, 30, 1.2, { mat: Mat.Brick, tint: 0x7a5a48, yaw: Bf.yaw, flags: SolidFlag.NoWallRun | SolidFlag.NoGrab });
  const wallTopY = yB + 25;
  const topW = Bp(-4.2, -5);
  const timber = Bp(4, 0);
  b.plat(timber.x, wallTopY, timber.z, 0.9, 10.6, 0.4, { mat: Mat.Wood, tint: 0x5a4632, yaw: Bf.yaw });
  b.branch('master.r7.stack', 'master', () => {
    b.route(tTop.x, tTop.top, tTop.z, 'run');
    b.route(gapFloor.x, yB, gapFloor.z, 'jump');
    b.route(topW.x, wallTopY, topW.z, 'walljump');
    b.route(Bp(4, -5).x, wallTopY, Bp(4, -5).z, 'run');
    b.route(Bp(4, 5).x, wallTopY, Bp(4, 5).z, 'run');
    b.route(balc.x, landY, balc.z, 'drop');
  });
  b.trigger('t.r7.master', 'master_r7_stack', { type: 'enter', min: v3(timber.x - 2, wallTopY - 0.5, timber.z - 2), max: v3(timber.x + 2, wallTopY + 3, timber.z + 2) });

  // hanging ruin: cables with nothing on them any more
  for (let i = 0; i < 12; i++) {
    const p = polar(i * 30 + 15, 62 + (i % 3) * 5);
    hangCable(b, p.x, y0 + 10 + (i % 4) * 14, p.z, y0 + 150, 0);
  }

  // ------------------------------------------------------------------ trial & daily
  b.trial({
    id: 'trial.r7',
    nameKey: 'trial.r7',
    start: v3(S[1].x, S[1].top + 0.05, S[1].z),
    startYaw: 0,
    gates: [
      { pos: v3(cw0.x, yC + 1, cw0.z), r: 3 },
      { pos: v3(arcadeA.x, walkY + 1, arcadeA.z), r: 2.5 },
      { pos: v3(Q[4].x, Q[4].top + 1, Q[4].z), r: 3 },
      { pos: v3(T[4].x, T[4].top + 1, T[4].z), r: 3 },
      { pos: v3(land.x, landY + 1, land.z), r: 3 },
    ],
    finish: { pos: v3(balc.x, landY + 1, balc.z), r: 3 },
    master: [{ pos: v3(timber.x, wallTopY + 1, timber.z), r: 2.5 }],
  });
  for (const d of [S[2], S[6], Q[2], Q[6], T[2], T[6]]) b.daily(d.x, d.top + 1, d.z);
  b.daily(P(0, 0).x, yC + 1, P(0, 0).z);
  b.daily(corbels[3].x, corbels[3].y + 1, corbels[3].z);

  const topY = landY + 4;
  pillar(b, y0 - 1, topY + 1, PR, PR, 7);
  b.data.meta.topY = topY;
  const exitA = Math.atan2(balc.x, balc.z) * (180 / Math.PI);
  return { data: b.build(), exit: { x: balc.x, y: landY, z: balc.z, a: exitA } };
}
