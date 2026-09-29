import { v3 } from '../../math';
import { RegionBuilder, quantYaw } from '../builder';
import { facadeRot, hangCable, helix, lamp, numeral, pillar, polar, sector, tree, type HelixDeck } from '../kit';
import { Ability, Mat, type RegionData } from '../types';
import type { Exit } from './r03_construction';

/**
 * REGION 05 — THE CITY
 * Generations 14–17: the golden age. A civic plaza, a library of every floor's records, a ring
 * railway circling the Pillar, a quarter of glass towers, a clock that counted the descent and
 * gardens on the roofs. It was the only time the builders stopped to live.
 *
 * Teaches: roll (lesson, the Council Hall roof).
 * Memory: the Ring Line's train starts when you pull the driver's lever; your weight on the Clock
 * Spire's hand moves it back one mark, and the hand becomes a bridge to the Roof Gardens.
 * Routes: SAFE the Library galleries / RISK the rooftop line / MASTER the spire's face.
 */

const ATM = {
  skyTop: 0x3f78c0,
  skyHorizon: 0xf2d6a8,
  fog: 0xe0c8a0,
  fogDensity: 0.0014,
  sunColor: 0xffe2b0,
  sunIntensity: 1.25,
  ambient: 0x7c6c5a,
  sunDir: v3(0.55, 0.5, -0.4),
  weather: 5,
  cloudColor: 0xfff4e4,
  exposure: 1.04,
};

const PR = 32;
const R = 54;
const MARBLE = 0xe8e0d0;
const CREAM = 0xe6d2ae;
const TERRA = 0xb8643e;
const GOLD = 0xd8b04a;
const GREEN = 0x6a8a4a;
const rad = (d: number) => (d * Math.PI) / 180;
const arc = (m: number, r = R) => (m / r) * (180 / Math.PI);
const past = (d: HelixDeck, gap: number, len: number, r = R) => d.a - arc(d.len / 2 + gap + len / 2, r);
const radialYaw = (a: number) => quantYaw(rad(a + 90));
const deck = (x: number, z: number, top: number, a: number, len: number): HelixDeck => ({ x, z, top, a, yaw: 0, len });

/** Ring Line geometry: the track circles the whole Pillar at this radius. */
const RING_R = 66;

export function region05(entry: Exit): { data: RegionData; exit: Exit } {
  const y0 = entry.y;
  const b = new RegionBuilder({ index: 4, id: 'city', baseY: y0 + 2, topY: y0 + 150, atmosphere: ATM, center: v3(0, 0, 0), radius: 150 });

  // ------------------------------------------------------------------ Section A: Council Plaza
  b.zone('area', -120, y0 - 2, -120, 120, y0 + 14, 120, { key: 'area.r5.plaza' });
  const start = deck(entry.x, entry.z, entry.y, entry.a, 7);
  const A = helix(
    b,
    0,
    52,
    0,
    -1,
    [
      { move: 'ramp', len: 4, wid: 4, mat: Mat.Marble, tint: MARBLE },
      { move: 'ramp', len: 4, wid: 4, mat: Mat.Marble, tint: MARBLE },
    ],
    { from: start, pillarR: PR, mat: Mat.Marble },
  );
  const plazaY = A[A.length - 1].top;
  const pA0 = A[A.length - 1].a - arc(2, 52);
  const pA1 = pA0 - 34;
  sector(b, pA0, pA1, 44, 63, plazaY, 0.8, { mat: Mat.Marble, tint: 0xd8cfbe });
  // plaza edge: a low balustrade on the outer rim (vaultable), benches, lamps and trees
  for (let a = pA0 - 2; a > pA1 + 1; a -= 4) {
    const p = polar(a, 62.6);
    b.dbox(p.x, plazaY, p.z, 3.6, 0.9, 0.3, { mat: Mat.Marble, tint: MARBLE, yaw: quantYaw(rad(a)) });
  }
  const pMid = (pA0 + pA1) / 2;
  const fountain = polar(pMid, 54);
  b.cyl(fountain.x, plazaY, fountain.z, 3.4, 0.7, { mat: Mat.Marble, tint: MARBLE });
  b.decor('cyl', fountain.x, plazaY + 0.62, fountain.z, 3.1, 0.12, 0, { mat: Mat.Water, tint: 0x6aa6c8 });
  b.cyl(fountain.x, plazaY + 0.7, fountain.z, 0.6, 1.8, { mat: Mat.Marble, tint: MARBLE });
  b.decor('cone', fountain.x, plazaY + 2.5, fountain.z, 1.4, 0.6, 0, { mat: Mat.Brass, tint: GOLD });
  b.decor('glyph', fountain.x, plazaY + 3.2, fountain.z, 1.4, 1.4, 1, { key: 'plumb', tint: GOLD, mat: Mat.Paint });
  for (const [da, r] of [
    [4, 47],
    [12, 60],
    [-10, 47.5],
    [-4, 60.5],
    [16, 48],
  ]) {
    const p = polar(pMid + da, r);
    tree(b, p.x, plazaY, p.z, 1.1, GREEN);
  }
  for (let a = pA0 - 5; a > pA1 + 2; a -= 9) {
    const p = polar(a, 45.4);
    lamp(b, p.x, plazaY + 3.2, p.z, 0xffd490);
    b.dbox(p.x, plazaY, p.z, 0.12, 3.2, 0.12, { mat: Mat.Metal, tint: 0x3a3a3a });
  }
  b.anchor('r5.plaza', fountain.x + 3, plazaY, fountain.z + 3, 0, 'anchor.r5.plaza', true);
  b.route(polar(pA0 - 3, 52).x, plazaY, polar(pA0 - 3, 52).z, 'run');
  b.route(polar(pMid, 50).x, plazaY, polar(pMid, 50).z, 'run');
  b.collect('f17', 'fragment', fountain.x, plazaY + 1.3, fountain.z);
  numeral(b, 17, polar(pMid, PR + 0.06).x, plazaY + 3, polar(pMid, PR + 0.06).z, rad(pMid), 1.6);

  // The Council Hall: balconies up its face to the roof, where the roll lesson waits.
  const hStart = deck(polar(pA1 + 3, 52).x, polar(pA1 + 3, 52).z, plazaY, pA1 + 3, 4);
  b.route(hStart.x, plazaY, hStart.z, 'run');
  const H = helix(
    b,
    0,
    52,
    0,
    -1,
    [
      { move: 'step', mat: Mat.Marble, tint: MARBLE },
      { move: 'step', mat: Mat.Marble, tint: MARBLE },
      { move: 'climb', len: 3, wid: 3, mat: Mat.Plaster, tint: CREAM },
      { move: 'jump', len: 3, wid: 2.6, mat: Mat.Tile, tint: TERRA },
      { move: 'tall', len: 3, wid: 3, mat: Mat.Plaster, tint: CREAM },
      { move: 'walk', len: 7, wid: 5, mat: Mat.Tile, tint: TERRA },
    ],
    { from: hStart, pillarR: PR, mat: Mat.Marble },
  );
  const hallRoof = H[H.length - 1];
  const hallFace = polar((hStart.a + hallRoof.a) / 2, 46.5);
  facadeRot(b, hallFace.x, plazaY, hallFace.z, (hStart.a - hallRoof.a) * (Math.PI / 180) * 46.5 + 6, hallRoof.top - plazaY - 0.3, 6, quantYaw(rad((hStart.a + hallRoof.a) / 2)), CREAM, Mat.Plaster, 0.25);
  b.collect('l.roll', 'lesson', hallRoof.x, hallRoof.top + 1.3, hallRoof.z, Ability.Roll);
  b.trigger('t.r5.hint.roll', 'hint_roll', { type: 'enter', min: v3(hallRoof.x - 3, hallRoof.top - 1, hallRoof.z - 3), max: v3(hallRoof.x + 3, hallRoof.top + 3, hallRoof.z + 3) }, { textKey: 'hint.roll' });
  // Beyond the roof: a ten-metre drop to the Library's terrace. Roll or stumble.
  const libTerrace = helix(
    b,
    0,
    R,
    0,
    -1,
    [{ move: 'drop', len: 6, wid: 5, gap: 2.4, dh: -10.5, mat: Mat.Tile, tint: TERRA }],
    { from: { ...hallRoof, x: polar(hallRoof.a, R).x, z: polar(hallRoof.a, R).z }, pillarR: PR, mat: Mat.Tile },
  )[1];

  // ------------------------------------------------------------------ Section B: the Library of Floors
  b.zone('area', -120, libTerrace.top - 1, -120, 120, libTerrace.top + 24, 120, { key: 'area.r5.library' });
  b.anchor('r5.library', polar(libTerrace.a, R - 1.6).x, libTerrace.top, polar(libTerrace.a, R - 1.6).z, 0, 'anchor.r5.library');
  const L = helix(
    b,
    0,
    R,
    0,
    -1,
    [
      { move: 'ladder', len: 3, wid: 3, mat: Mat.Wood, tint: 0x8a5a3a },
      { move: 'hop', mat: Mat.Wood, tint: 0xa06a44 },
      { move: 'climb', mat: Mat.Wood, tint: 0x8a5a3a },
      { move: 'jump', mat: Mat.Wood, tint: 0xa06a44 },
      { move: 'tall', mat: Mat.Wood, tint: 0x8a5a3a },
      { move: 'walk', len: 4, wid: 3, mat: Mat.Wood, tint: 0xa06a44 },
      { move: 'chimney', len: 3, wid: 3, mat: Mat.Wood, tint: 0x6a4a30 },
      { move: 'walk', len: 5, wid: 4, mat: Mat.Marble, tint: MARBLE },
    ],
    { from: libTerrace, pillarR: PR, mat: Mat.Wood },
  );
  // The library itself: a tall hall whose outer galleries are the path; shelves of records inside.
  const libMid = (libTerrace.a + L[L.length - 1].a) / 2;
  const libCore = polar(libMid, 45);
  const libW = (libTerrace.a - L[L.length - 1].a) * (Math.PI / 180) * 45 + 4;
  facadeRot(b, libCore.x, libTerrace.top - 14, libCore.z, libW, L[L.length - 1].top - libTerrace.top + 18, 9, quantYaw(rad(libMid)), 0xcaa47a, Mat.Plaster, 0.4);
  for (const d of L.slice(1)) {
    // stacked books along each gallery's inner edge
    const p = polar(d.a, R - 1.6);
    for (let k = 0; k < 3; k++) b.dbox(p.x, d.top, p.z, 0.5 + (k % 2) * 0.3, 0.35 + k * 0.12, 0.35, { mat: Mat.Cloth, tint: [0x8a3a2a, 0x2a4a6a, 0x5a6a2a][k], yaw: quantYaw(rad(d.a + k * 20)) });
  }
  const libTop = L[L.length - 1];

  // ------------------------------------------------------------------ Section C: the Ring Line
  const yRing = libTop.top;
  b.zone('area', -120, yRing - 2, -120, 120, yRing + 14, 120, { key: 'area.r5.ring' });
  // a gangway out from the library balcony to the station
  const stA = libTop.a - arc(1.0);
  const gwy = polar(stA, 59.2);
  b.plat(gwy.x, yRing, gwy.z, 6.4, 2.4, 0.3, { mat: Mat.Metal, tint: 0x5a5e62, yaw: radialYaw(stA) });
  const stationR = 62;
  const stSpan = 16;
  sector(b, stA + stSpan / 2, stA - stSpan / 2, 59.7, 64.3, yRing, 0.5, { mat: Mat.Concrete, tint: 0xc8bca8 }, 4);
  b.anchor('r5.ring', polar(stA + 3, stationR).x, yRing, polar(stA + 3, stationR).z, 0, 'anchor.r5.ring');
  b.collect('rec.r5.ringline', 'record', polar(stA + 5, 61).x, yRing + 1.2, polar(stA + 5, 61).z);
  b.route(polar(stA, 58).x, yRing, polar(stA, 58).z, 'run');
  b.route(polar(stA, stationR).x, yRing, polar(stA, stationR).z, 'run');
  // Station canopy and the signal mast.
  for (let a = stA + 6; a >= stA - 6; a -= 6) {
    const p = polar(a, 60.2);
    b.dbox(p.x, yRing, p.z, 0.16, 3.4, 0.16, { mat: Mat.Metal, tint: 0x3a3e44 });
  }
  const canopy = polar(stA, 61.5);
  b.dbox(canopy.x, yRing + 3.4, canopy.z, 13, 0.15, 4.4, { mat: Mat.Metal, tint: 0x6a2a24, yaw: quantYaw(rad(stA)) });
  // The track: two rails on a ring of sleepers, hung from the floors above.
  for (let a = 0; a < 360; a += 5) {
    for (const rr of [65.1, 66.9]) {
      const p = polar(a + 2.5, rr);
      b.dbox(p.x, yRing - 0.6, p.z, 2 * rr * Math.sin(rad(2.6)), 0.12, 0.12, { mat: Mat.Metal, tint: 0x6a6660, yaw: quantYaw(rad(a + 2.5)) });
    }
    const s = polar(a, RING_R);
    b.dbox(s.x, yRing - 0.8, s.z, 0.35, 0.2, 3.2, { mat: Mat.Wood, tint: 0x5a4030, yaw: quantYaw(rad(a)) });
    if (a % 15 === 0) hangCable(b, s.x, yRing - 0.8, s.z, yRing + 26, 0);
  }
  // The train: three cars parked at the station. It circles the whole Pillar once started.
  const carLen = 7.2;
  const carA = (i: number) => stA + arc(4.2 - i * (carLen + 0.6), RING_R);
  b.mover({ kind: 'rotate', origin: v3(0, yRing, 0), angVel: -0.075, phase: 0, activeFlag: 'r5_ring' }, () => {
    for (let i = 0; i < 3; i++) {
      const a = carA(i);
      const p = polar(a, RING_R);
      const yaw = quantYaw(rad(a));
      b.plat(p.x, 0, p.z, carLen, 3, 0.5, { mat: Mat.Metal, tint: 0x7a2e28, yaw });
      b.decor('box', p.x, 2.7, p.z, carLen, 0.12, 3.1, { mat: Mat.Metal, tint: 0x5a1e1a, yaw });
      const outer = polar(a, RING_R + 1.45);
      b.decor('box', outer.x, 1.35, outer.z, carLen, 2.7, 0.1, { mat: Mat.Glass, tint: 0x9ab4c4, yaw });
      for (const e of [-1, 1]) {
        const c = polar(a + e * arc(carLen / 2 - 0.1, RING_R), RING_R);
        b.decor('box', c.x, 1.35, c.z, 0.12, 2.7, 3, { mat: Mat.Metal, tint: 0x7a2e28, yaw });
      }
      if (i === 0) {
        const lv = polar(a + arc(2.4, RING_R), RING_R + 0.6);
        b.decor('box', lv.x, 0.6, lv.z, 0.12, 1.2, 0.12, { mat: Mat.Brass, tint: GOLD, yaw });
      }
    }
  });
  const lever = polar(carA(0) + arc(2.4, RING_R), RING_R + 0.6);
  b.trigger('t.r5.ring', 'r5_ring', { type: 'interact', pos: v3(lever.x, yRing + 1, lever.z), radius: 2.4 }, { textKey: 'mem.r5.ring', delay: 1.0 });
  const cab = polar(carA(0), RING_R);
  b.route(cab.x, yRing, cab.z, 'interact', { expect: 'r5_ring' });
  b.routeFlags = ['r5_ring'];
  b.collect('e.r5.ring', 'echo', polar(stA - 50, RING_R).x, yRing - 30, polar(stA - 50, RING_R).z);
  // The second station, a third of the way round: the Glass Quarter.
  const st2A = stA - 112;
  sector(b, st2A + stSpan / 2, st2A - stSpan / 2, 59.7, 64.3, yRing, 0.5, { mat: Mat.Concrete, tint: 0xc8bca8 }, 4);
  const canopy2 = polar(st2A, 61.5);
  b.dbox(canopy2.x, yRing + 3.4, canopy2.z, 13, 0.15, 4.4, { mat: Mat.Metal, tint: 0x2a4a6a, yaw: quantYaw(rad(st2A)) });
  b.route(polar(st2A, stationR).x, yRing, polar(st2A, stationR).z, 'ride', { note: 'ride the Ring Line to the Glass Quarter' });
  const gw2 = polar(st2A, 58.4);
  b.plat(gw2.x, yRing, gw2.z, 3.2, 2.4, 0.3, { mat: Mat.Metal, tint: 0x5a5e62, yaw: radialYaw(st2A) });

  // ------------------------------------------------------------------ Section D: the Glass Quarter
  b.zone('area', -120, yRing - 2, -120, 120, yRing + 30, 120, { key: 'area.r5.glass' });
  const g0 = deck(polar(st2A, R).x, polar(st2A, R).z, yRing, st2A, 4);
  b.plat(g0.x, yRing, g0.z, 4, 4, 0.4, { mat: Mat.Marble, tint: MARBLE, yaw: quantYaw(rad(st2A)) });
  b.route(g0.x, yRing, g0.z, 'run');
  b.anchor('r5.glass', polar(st2A, R - 1.2).x, yRing, polar(st2A, R - 1.2).z, 0, 'anchor.r5.glass');
  const G = helix(
    b,
    0,
    R,
    0,
    -1,
    [
      { move: 'jump', mat: Mat.Glass, tint: 0x9ab4c4 },
      { move: 'wallrun', len: 4, mat: Mat.Glass, tint: 0x8aa8c0 },
      { move: 'climb', mat: Mat.Marble, tint: MARBLE },
      { move: 'long', mat: Mat.Glass, tint: 0x9ab4c4 },
      { move: 'scale', len: 4, wid: 4, mat: Mat.Glass, tint: 0x7a98b0 },
      { move: 'wallrun', len: 4, mat: Mat.Glass, tint: 0x8aa8c0 },
      { move: 'hop', mat: Mat.Marble, tint: MARBLE },
      { move: 'tall', mat: Mat.Glass, tint: 0x9ab4c4 },
      { move: 'walk', len: 6, wid: 4.5, mat: Mat.Marble, tint: MARBLE },
    ],
    { from: g0, pillarR: PR, mat: Mat.Glass },
  );
  b.collect('f16', 'fragment', G[4].x, G[4].top + 1.0, G[4].z);
  b.collect('e.r5.glass', 'echo', G[3].x, G[3].top - 26, G[3].z);
  // Glass towers beyond the Ring Line.
  for (let i = 0; i < 7; i++) {
    const a = st2A - 4 - i * 9;
    const p = polar(a, 74 + (i % 3) * 3);
    const h = 36 + ((i * 11) % 5) * 6;
    facadeRot(b, p.x, yRing - 30, p.z, 8, h, 8, quantYaw(rad(a)), 0x8aa8c0, Mat.Glass, 0.15);
  }
  const gTop = G[G.length - 1];

  // ------------------------------------------------------------------ Section E: the Clock Spire
  b.zone('area', -120, gTop.top - 2, -120, 120, gTop.top + 40, 120, { key: 'area.r5.clock' });
  const spA = past(gTop, 3, 8);
  const S = polar(spA, R + 1);
  // A spiral stair of ledges round the spire itself.
  const bridgeLen = 3;
  const bridge = polar(spA + arc(4 + bridgeLen / 2, R + 1), R + 1);
  b.plat(bridge.x, gTop.top, bridge.z, bridgeLen + 0.6, 2.2, 0.3, { mat: Mat.Marble, tint: MARBLE, yaw: quantYaw(rad(spA)) });
  // the spiral's own frame: angles round the spire, starting on the face toward the approach
  const faceIn = Math.atan2(bridge.x - S.x, bridge.z - S.z) * (180 / Math.PI);
  const SP = helix(
    b,
    faceIn,
    6.2,
    gTop.top,
    -1,
    [
      { move: 'start', len: 2.6, wid: 2.2, mat: Mat.Stone, tint: 0xd8c8a8 },
      { move: 'climb', len: 2.6, wid: 2.2, mat: Mat.Stone, tint: 0xd8c8a8 },
      { move: 'climb', len: 2.6, wid: 2.2, mat: Mat.Stone, tint: 0xd8c8a8 },
      { move: 'hop', len: 2.6, wid: 2.2, mat: Mat.Stone, tint: 0xd8c8a8, gap: 1.2 },
      { move: 'climb', len: 2.6, wid: 2.2, mat: Mat.Stone, tint: 0xd8c8a8 },
      { move: 'ladder', len: 2.6, wid: 2.2, mat: Mat.Stone, tint: 0xd8c8a8 },
      { move: 'climb', len: 2.6, wid: 2.2, mat: Mat.Stone, tint: 0xd8c8a8 },
      { move: 'hop', len: 2.6, wid: 2.2, mat: Mat.Stone, tint: 0xd8c8a8, gap: 1.2 },
      { move: 'climb', len: 2.6, wid: 2.2, mat: Mat.Stone, tint: 0xd8c8a8 },
      { move: 'tall', len: 2.6, wid: 2.2, mat: Mat.Stone, tint: 0xd8c8a8 },
    ],
    { center: S, mat: Mat.Stone },
  );
  const spLast = SP[SP.length - 1];
  b.anchor('r5.clock', spLast.x, spLast.top, spLast.z, 0, 'anchor.r5.clock');
  b.collect('f15', 'fragment', SP[5].x, SP[5].top + 1, SP[5].z);
  // The clock face lies on the spire's top, open to the sky, read from the floors above.
  const faceY = spLast.top + 2.2;
  // the spire's shaft stops under the face
  b.block(S.x, gTop.top - 40, S.z, 7, faceY - 0.8 - (gTop.top - 40), 7, { mat: Mat.Stone, tint: 0xd8c8a8, yaw: quantYaw(rad(spA)) });
  b.cyl(S.x, faceY - 0.8, S.z, 5.0, 0.8, { mat: Mat.Marble, tint: 0xf0e8d8 });
  // corner pilasters
  for (const [lx, lz] of [
    [-3.6, -3.6],
    [3.6, -3.6],
    [-3.6, 3.6],
    [3.6, 3.6],
  ]) {
    const c = Math.cos(rad(spA));
    const s = Math.sin(rad(spA));
    b.dbox(S.x + lx * c + lz * s, gTop.top - 40, S.z - lx * s + lz * c, 0.9, faceY - 0.8 - (gTop.top - 40), 0.9, { mat: Mat.Stone, tint: 0xc8b898, yaw: quantYaw(rad(spA)) });
  }

  for (let m = 0; m < 30; m++) {
    const p = polar(m * 12, 4.6);
    b.dbox(S.x + p.x, faceY, S.z + p.z, m % 5 === 0 ? 0.9 : 0.5, 0.05, 0.14, { mat: Mat.Paint, tint: 0x2a2622, yaw: quantYaw(rad(m * 12)) });
  }
  b.glyph('n17', S.x + polar(17 * 12, 3.5).x, faceY + 0.02, S.z + polar(17 * 12, 3.5).z, 1.0, rad(17 * 12), { up: true, tint: 0x2a2622 });
  b.route(S.x + polar(faceIn - 90, 3).x, faceY, S.z + polar(faceIn - 90, 3).z, 'mantle');
  b.collect('rec.r5.clock', 'record', S.x, faceY + 1.2, S.z);
  // The hand: points at seventeen, and reaches far out over the void.
  const handLen = 15;
  const handA0 = 17 * 12;
  const handStep = -12;
  b.mover({ kind: 'transition', origin: v3(S.x, faceY, S.z), flag: 'r5_clock', fromYaw: 0, toYaw: rad(handStep), dur: 2.6 }, () => {
    const mid = polar(handA0, handLen / 2);
    b.plat(mid.x, 0.35, mid.z, handLen, 1.1, 0.35, { mat: Mat.Brass, tint: GOLD, yaw: radialYaw(handA0), tag: 'r5_hand' });
    const tip = polar(handA0, handLen - 0.6);
    b.decor('cone', tip.x, 0.2, tip.z, 0.9, 0.5, 0, { mat: Mat.Brass, tint: GOLD });
    b.decor('cyl', 0, 0.55, 0, 0.7, 0.4, 0, { mat: Mat.Brass, tint: GOLD });
  });
  b.trigger('t.r5.clock', 'r5_clock', { type: 'stand', tag: 'r5_hand', seconds: 0.8 }, { textKey: 'mem.r5.clock', delay: 0.9 });
  const tipBefore = polar(handA0, handLen - 1.2);
  b.route(S.x + tipBefore.x, faceY + 0.35, S.z + tipBefore.z, 'run', { expect: 'r5_clock' });
  b.routeFlags = ['r5_ring', 'r5_clock'];
  const tipAfter = polar(handA0 + handStep, handLen - 1.2);
  b.route(S.x + tipAfter.x, faceY + 0.35, S.z + tipAfter.z, 'wait');
  b.collect('e.r5.clock', 'echo', S.x + polar(handA0, handLen).x, faceY - 30, S.z + polar(handA0, handLen).z);

  // ------------------------------------------------------------------ Section F: the Roof Gardens
  // The hand, moved back one mark, reaches the gardens' first terrace.
  const handDir = polar(handA0 + handStep, 1);
  const gard0 = { x: S.x + handDir.x * (handLen + 0.5 + 2.5), z: S.z + handDir.z * (handLen + 0.5 + 2.5) };
  const gardA = Math.atan2(gard0.x, gard0.z) * (180 / Math.PI);
  const gardR = Math.hypot(gard0.x, gard0.z);
  b.zone('area', -120, faceY - 2, -120, 120, faceY + 30, 120, { key: 'area.r5.gardens' });
  const F0 = deck(gard0.x, gard0.z, faceY + 0.35, gardA, 5);
  b.plat(F0.x, F0.top, F0.z, 5, 5, 0.6, { mat: Mat.Moss, tint: 0x5a7a3a, yaw: radialYaw(handA0 + handStep) });
  b.route(F0.x, F0.top, F0.z, 'run');
  b.anchor('r5.gardens', F0.x, F0.top, F0.z, 0, 'anchor.r5.gardens');
  const Fg = helix(
    b,
    0,
    gardR,
    0,
    -1,
    [
      { move: 'hop', len: 4, wid: 4, mat: Mat.Moss, tint: 0x5f7f3e },
      { move: 'step', len: 4, wid: 4, mat: Mat.Moss, tint: 0x5a7a3a },
      { move: 'climb', len: 4, wid: 4, mat: Mat.Moss, tint: 0x648444 },
      { move: 'jump', len: 3, wid: 3, mat: Mat.Wood, tint: 0x9a7a54 },
      { move: 'climb', len: 5, wid: 5, mat: Mat.Moss, tint: 0x5a7a3a },
      { move: 'walk', len: 7, wid: 6, mat: Mat.Moss, tint: 0x60803f },
    ],
    { from: F0, mat: Mat.Moss },
  );
  for (const d of Fg.slice(1)) {
    const p = polar(d.a, gardR + 1.2);
    if (d.len >= 4) tree(b, p.x, d.top, p.z, 0.9, 0x6a9a4a);
    b.decor('plant', polar(d.a, gardR - 1.3).x, d.top, polar(d.a, gardR - 1.3).z, 0.45, 0, 0, { tint: [0xc84a6a, 0xe8c040, 0x9a5ac8][Math.floor(d.top) % 3] });
  }
  const fTop = Fg[Fg.length - 1];
  b.collect('f14', 'fragment', polar(fTop.a, gardR + 2).x, fTop.top + 1, polar(fTop.a, gardR + 2).z);
  lamp(b, fTop.x, fTop.top + 3, fTop.z, 0xffd490);
  numeral(b, 14, polar(fTop.a, PR + 0.06).x, fTop.top + 2.5, polar(fTop.a, PR + 0.06).z, rad(fTop.a), 1.4);

  // ------------------------------------------------------------------ RISK: the rooftop line
  // From the plaza's edge, a run across the roofs of the outer ring straight to the Ring Line
  // station, skipping the Hall and the Library.
  const roofs: HelixDeck[] = [];
  const rkA0 = pA1 - 2;
  const rkSpan = rkA0 - (stA + stSpan / 2 + 1);
  const rkN = Math.ceil((rkSpan * Math.PI * 60) / 180 / 5.4) - 1;
  for (let i = 0; i < rkN; i++) {
    const t = (i + 1) / (rkN + 1);
    const a = rkA0 - rkSpan * t;
    const top = plazaY + (yRing - plazaY) * ((i + 1) / rkN);
    const p = polar(a, 60);
    b.block(p.x, top - 30, p.z, 4.2, 30, 4, { mat: Mat.Tile, tint: i % 2 ? TERRA : 0xa8543a, yaw: quantYaw(rad(a)) });
    roofs.push(deck(p.x, p.z, top, a, 4));
  }
  b.branch('risk.r5.roofs', 'risk', () => {
    b.route(polar(pA1 + 1, 60).x, plazaY, polar(pA1 + 1, 60).z, 'run');
    for (const r of roofs) b.route(r.x, r.top, r.z, 'jump');
    b.route(polar(stA + stSpan / 2 - 1, stationR).x, yRing, polar(stA + stSpan / 2 - 1, stationR).z, 'jump');
  });

  // ------------------------------------------------------------------ MASTER: the spire's face
  // Carved numerals on the spire's outward face double as holds, straight up to the clock.
  const outDir = polar(spA, 1);
  const faceP = { x: S.x + outDir.x * 4.1, z: S.z + outDir.z * 4.1 };
  const holds: HelixDeck[] = [];
  for (let y = gTop.top + 2.1, k = 0; y < faceY - 1; y += 2.1, k++) {
    const side = k % 2 ? 1.2 : -1.2;
    const t = polar(spA + 90, side);
    b.plat(faceP.x + t.x, y, faceP.z + t.z, 0.8, 0.8, 0.3, { mat: Mat.Stone, tint: 0xb8a888, yaw: quantYaw(rad(spA)) });
    holds.push(deck(faceP.x + t.x, faceP.z + t.z, y, spA, 0.8));
  }
  b.branch('master.r5.spire', 'master', () => {
    const foot = polar(spA, R + 1 + 6.2);
    b.route(gTop.x, gTop.top, gTop.z, 'run');
    b.route(foot.x, gTop.top, foot.z, 'run');
    for (const h of holds) b.route(h.x, h.top, h.z, 'mantle');
    b.route(S.x + outDir.x * 3, faceY, S.z + outDir.z * 3, 'mantle');
  });
  // the foot of the master route: a ledge off the outward face
  const footP = polar(spA, R + 1 + 6.2);
  b.plat(footP.x, gTop.top, footP.z, 3, 4.4, 0.4, { mat: Mat.Stone, tint: 0xc8b898, yaw: quantYaw(rad(spA)) });
  b.plat(polar(spA - 6, R + 4).x, gTop.top, polar(spA - 6, R + 4).z, 6, 2.2, 0.3, { mat: Mat.Marble, tint: MARBLE, yaw: radialYaw(spA - 6) });
  b.trigger('t.r5.master', 'master_r5_spire', { type: 'enter', min: v3(faceP.x - 3, faceY - 8, faceP.z - 3), max: v3(faceP.x + 3, faceY - 2, faceP.z + 3) });

  // ------------------------------------------------------------------ the skyline
  // Towers of the golden age all round, clear of the Ring Line.
  for (let i = 0; i < 26; i++) {
    const a = i * (360 / 26) + 7;
    const r = 76 + ((i * 7) % 4) * 4;
    const h = 30 + ((i * 13) % 7) * 7;
    const base = y0 - 20 + ((i * 5) % 3) * 6;
    facadeRot(b, polar(a, r).x, base, polar(a, r).z, 9, h, 8, quantYaw(rad(a)), [CREAM, 0xd8b890, 0xc8a078, MARBLE][i % 4], Mat.Plaster, 0.35);
    b.ramp(polar(a, r).x, base + h, polar(a, r).z, 9.4, 2.2, 8.4, 0, { mat: Mat.Tile, tint: TERRA, yaw: quantYaw(rad(a)) });
  }

  // ------------------------------------------------------------------ trial & daily
  b.trial({
    id: 'trial.r5',
    nameKey: 'trial.r5',
    start: v3(A[1].x, A[1].top + 0.05, A[1].z),
    startYaw: 0,
    gates: [
      { pos: v3(fountain.x, plazaY + 1.5, fountain.z), r: 5 },
      { pos: v3(hallRoof.x, hallRoof.top + 1, hallRoof.z), r: 3 },
      { pos: v3(libTop.x, libTop.top + 1, libTop.z), r: 3 },
      { pos: v3(polar(st2A, stationR).x, yRing + 1, polar(st2A, stationR).z), r: 4 },
      { pos: v3(spLast.x, spLast.top + 1, spLast.z), r: 3 },
    ],
    finish: { pos: v3(fTop.x, fTop.top + 1, fTop.z), r: 3.5 },
    medals: { bronze: 300, silver: 240, gold: 195, perfect: 165 },
    flags: ['r4_winch', 'r5_ring', 'r5_clock'],
    abilities: Ability.Sprint | Ability.Mantle | Ability.Slide | Ability.Vault | Ability.LedgeGrab | Ability.Rope | Ability.WallRun | Ability.WallJump | Ability.WallClimb | Ability.Roll,
    master: [{ pos: v3(holds[3].x, holds[3].top + 0.5, holds[3].z), r: 2.5 }],
  });
  for (const d of [H[2], L[2], L[5], G[2], G[6], SP[4], Fg[2], Fg[4]]) b.daily(d.x, d.top + 1, d.z);

  const topY = fTop.top + 4;
  pillar(b, y0 + 2, topY + 40, PR, PR, 5);
  b.data.meta.topY = topY;
  return { data: b.build(), exit: { x: fTop.x, y: fTop.top, z: fTop.z, a: fTop.a } };
}
