import { v3 } from '../../math';
import { RegionBuilder, quantYaw } from '../builder';
import { hangCable, helix, lamp, numeral, pillar, polar, sector, type HelixDeck } from '../kit';
import { Ability, Mat, SolidFlag, type RegionData } from '../types';
import type { Exit } from './r03_construction';

/**
 * REGION 08 — THE STORM
 * Generations 5–7 lived inside a storm that never ended. The Keepers built lighthouses whose
 * lamps shine DOWN, so builders on the floors below could see where the next floor would go,
 * and planted iron rods to draw the lightning off the path.
 *
 * Teaches: reading hazards — strikes on a rhythm, wet slippery iron, updrafts, gusts.
 * Memory: lighting the Keepers' lamps makes the Fall Lines under the Rod Field shine for good;
 * lightning breaks the crown off the Keepers' tower and it falls across the gap as a bridge.
 * Routes: SAFE the lighthouse stairs / RISK the lamp-wire zip / MASTER the rod tops.
 */

const ATM = {
  skyTop: 0x1e2430,
  skyHorizon: 0x4a5262,
  fog: 0x3e4654,
  fogDensity: 0.0034,
  sunColor: 0xb8c4d8,
  sunIntensity: 0.55,
  ambient: 0x3a4250,
  sunDir: v3(0.2, 0.8, 0.35),
  weather: 3,
  cloudColor: 0x5a6272,
  exposure: 0.92,
};

const PR = 26;
const R = 66;
const IRON = 0x4a4e56;
const WET = 0x5a6068;
const WHITE = 0xd8d4c8;
const RED = 0x9a3a32;
const rad = (d: number) => (d * Math.PI) / 180;
const arc = (m: number, r = R) => (m / r) * (180 / Math.PI);
const past = (d: HelixDeck, gap: number, len: number, r = R) => d.a - arc(d.len / 2 + gap + len / 2, r);
const radialYaw = (a: number) => quantYaw(rad(a + 90));
const deck = (x: number, z: number, top: number, a: number, len: number): HelixDeck => ({ x, z, top, a, yaw: 0, len });

/** A lighthouse: white tower, red bands, glass lamp room with a lamp that points down. */
function lighthouse(b: RegionBuilder, c: { x: number; z: number }, y0: number, h: number, flag: string): void {
  b.cyl(c.x, y0 - 40, c.z, 4.2, h + 40, { mat: Mat.Plaster, tint: WHITE, flags: SolidFlag.NoWallRun });
  for (let y = y0 + 4; y < y0 + h; y += 8) b.decor('cyl', c.x, y, c.z, 4.28, 1.4, 0, { mat: Mat.Paint, tint: RED });
  b.decor('cyl', c.x, y0 + h + 1.6, c.z, 3.0, 3.2, 0, { mat: Mat.Glass, tint: 0x9ab0c0 });
  b.decor('cone', c.x, y0 + h + 3.2, c.z, 3.4, 2.2, 0, { mat: Mat.Metal, tint: RED });
  // the lamp: dark until the Keepers' lamps are lit, then burning, aimed down
  b.unless(flag, () => b.decor('cone', c.x, y0 + h + 0.6, c.z, 1.1, -1.4, 0, { mat: Mat.Metal, tint: 0x3a3a3a }));
  b.when(flag, () => {
    b.decor('cone', c.x, y0 + h + 0.6, c.z, 1.1, -1.4, 0, { mat: Mat.Glow, tint: 0xfff0b0 });
    b.decor('lamp', c.x, y0 + h + 0.2, c.z, 0.6, 0.6, 0.6, { tint: 0xfff0b0 });
  });
}

export function region08(entry: Exit): { data: RegionData; exit: Exit } {
  const y0 = entry.y;
  const b = new RegionBuilder({ index: 7, id: 'storm', baseY: y0 + 2, topY: y0 + 170, atmosphere: ATM, center: v3(0, 0, 0), radius: 150 });

  // ------------------------------------------------------------------ Section A: the Lighthouses
  b.zone('area', -140, y0 - 2, -140, 140, y0 + 34, 140, { key: 'area.r8.lighthouses' });
  // off the belltower balcony and along the outside of the tower
  const a0A = entry.a - arc(4.8);
  const a0 = polar(a0A, R);
  b.plat(a0.x, y0, a0.z, 4, 4, 0.4, { mat: Mat.Stone, tint: 0x6a6a6a, yaw: quantYaw(rad(a0A)) });
  b.route(a0.x, y0, a0.z, 'run');
  const A = helix(
    b,
    0,
    R,
    0,
    -1,
    [
      { move: 'hop', mat: Mat.Metal, tint: WET, flags: SolidFlag.Slippery },
      { move: 'jump', mat: Mat.Stone, tint: 0x6a6a6a },
      { move: 'climb', mat: Mat.Metal, tint: WET, flags: SolidFlag.Slippery },
      { move: 'walk', len: 5, wid: 4, mat: Mat.Stone, tint: 0x6a6a6a },
    ],
    { from: deck(a0.x, a0.z, y0, a0A, 4), pillarR: PR, mat: Mat.Stone },
  );
  const aEnd = A[A.length - 1];
  b.anchor('r8.lighthouses', polar(aEnd.a, R - 1.2).x, aEnd.top, polar(aEnd.a, R - 1.2).z, 0, 'anchor.r8.lighthouses', true);
  numeral(b, 7, polar(aEnd.a, PR + 0.06).x, aEnd.top + 2.5, polar(aEnd.a, PR + 0.06).z, rad(aEnd.a), 1.5);
  // Lighthouse one: a stair round the outside to the lamp gallery.
  const h1A = past(aEnd, 1.2, 9);
  const H1 = polar(h1A, R);
  const lhH = 24;
  lighthouse(b, H1, aEnd.top, lhH, 'r8_lamps');
  const toH1 = Math.atan2(aEnd.x - H1.x, aEnd.z - H1.z) * (180 / Math.PI);
  const L1 = helix(
    b,
    toH1,
    6.2,
    aEnd.top,
    -1,
    [
      { move: 'start', len: 3, wid: 2.4, mat: Mat.Stone, tint: 0x7a7a78 },
      { move: 'climb', len: 3, wid: 2.4, mat: Mat.Stone, tint: 0x7a7a78 },
      { move: 'step', len: 3, wid: 2.4, mat: Mat.Metal, tint: WET, flags: SolidFlag.Slippery },
      { move: 'climb', len: 3, wid: 2.4, mat: Mat.Stone, tint: 0x7a7a78 },
      { move: 'hop', len: 3, wid: 2.4, mat: Mat.Metal, tint: WET, flags: SolidFlag.Slippery },
      { move: 'climb', len: 3, wid: 2.4, mat: Mat.Stone, tint: 0x7a7a78 },
      { move: 'ladder', len: 3, wid: 2.4, mat: Mat.Stone, tint: 0x7a7a78 },
      { move: 'climb', len: 3, wid: 2.4, mat: Mat.Stone, tint: 0x7a7a78 },
      { move: 'step', len: 3, wid: 2.4, mat: Mat.Metal, tint: WET },
      { move: 'climb', len: 3, wid: 2.4, mat: Mat.Stone, tint: 0x7a7a78 },
      { move: 'tall', len: 3, wid: 2.4, mat: Mat.Stone, tint: 0x7a7a78 },
    ],
    { center: H1, mat: Mat.Stone },
  );
  const g1 = L1[L1.length - 1];
  // the gallery ring round the lamp room
  b.cyl(H1.x, g1.top - 0.4, H1.z, 5.4, 0.4, { mat: Mat.Metal, tint: IRON });
  b.collect('f7', 'fragment', H1.x + polar(g1.a + 90, 4.6).x, g1.top + 1, H1.z + polar(g1.a + 90, 4.6).z);
  b.collect('rec.r8.lighthouse', 'record', H1.x + polar(g1.a - 90, 4.6).x, g1.top + 1.2, H1.z + polar(g1.a - 90, 4.6).z);

  // A long wet plank to the second lighthouse, in the gusts.
  const h2A = h1A - arc(34);
  const H2 = polar(h2A, R + 2);
  lighthouse(b, H2, g1.top - 24 + 3, lhH, 'r8_lamps');
  const g2Top = g1.top + 3;
  b.cyl(H2.x, g2Top - 0.4, H2.z, 5.4, 0.4, { mat: Mat.Metal, tint: IRON });
  const dxp = H2.x - H1.x;
  const dzp = H2.z - H1.z;
  const dl = Math.hypot(dxp, dzp);
  const ux = dxp / dl;
  const uz = dzp / dl;
  const pA = { x: H1.x + ux * 5.2, z: H1.z + uz * 5.2 };
  const pB = { x: H2.x - ux * 5.2, z: H2.z - uz * 5.2 };
  b.beamBetween(pA.x, pA.z, g1.top, pB.x, pB.z, g2Top, 1.0, { mat: Mat.Wood, tint: 0x5a4a3a, flags: SolidFlag.Slippery });
  const mid = { x: (pA.x + pB.x) / 2, z: (pA.z + pB.z) / 2 };
  b.zone('wind', mid.x - 14, g1.top - 2, mid.z - 14, mid.x + 14, g2Top + 6, mid.z + 14, { dir: v3(-uz, 0, ux), strength: 4.5, period: 5, phase: 0 });
  b.route(pA.x, g1.top, pA.z, 'run');
  b.route(mid.x, (g1.top + g2Top) / 2, mid.z, 'run');
  b.route(pB.x, g2Top, pB.z, 'run');
  // The Keepers' lamp switch on lighthouse two.
  const sw = { x: H2.x - ux * 4.6 + -uz * 1.5, z: H2.z - uz * 4.6 + ux * 1.5 };
  b.decor('box', sw.x, g2Top + 0.8, sw.z, 0.2, 1.6, 0.2, { mat: Mat.Brass, tint: 0xd8b04a });
  b.trigger('t.r8.lamps', 'r8_lamps', { type: 'interact', pos: v3(sw.x, g2Top + 1, sw.z), radius: 2.4 }, { textKey: 'mem.r8.lamps', delay: 1.0 });
  b.route(H2.x - ux * 4.4 + -uz * 0.6, g2Top, H2.z - uz * 4.4 + ux * 0.6, 'interact', { expect: 'r8_lamps' });
  b.routeFlags = ['r8_lamps'];

  // ------------------------------------------------------------------ Section B: the Rod Field
  // A zip line down from the gallery to the field.
  const fieldA0 = h2A - arc(10);
  const fieldY = g2Top - 9;
  b.zone('area', -140, fieldY - 14, -140, 140, fieldY + 12, 140, { key: 'area.r8.rods' });
  const R2 = R + 2;
  const F0 = polar(fieldA0, R2);
  b.plat(F0.x, fieldY, F0.z, 7, 6, 0.5, { mat: Mat.Stone, tint: 0x5a5a5a, yaw: quantYaw(rad(fieldA0)) });
  const zipFrom = { x: H2.x + polar(fieldA0 + 60, 5.2).x, z: H2.z + polar(fieldA0 + 60, 5.2).z };
  const zdx = F0.x - zipFrom.x;
  const zdz = F0.z - zipFrom.z;
  const zl = Math.hypot(zdx, zdz);
  const zEnd = { x: F0.x - (zdx / zl) * 1.8, z: F0.z - (zdz / zl) * 1.8 };
  b.rope('zip', v3(zipFrom.x, g2Top + 2.4, zipFrom.z), v3(zEnd.x, fieldY + 2.9, zEnd.z), v3(0, 1, 0), Mat.Metal);
  b.route(zipFrom.x, g2Top, zipFrom.z, 'run');
  b.route(F0.x, fieldY, F0.z, 'zip');
  b.anchor('r8.rods', F0.x, fieldY, F0.z, 0, 'anchor.r8.rods');
  // plates over the void, rods between them; some plates take the lightning on a rhythm
  const plates = helix(
    b,
    0,
    R2,
    0,
    -1,
    [
      { move: 'jump', len: 3.4, wid: 3.4, mat: Mat.Metal, tint: IRON },
      { move: 'hop', len: 3.4, wid: 3.4, mat: Mat.Metal, tint: IRON, action: 'wait' },
      { move: 'jump', len: 3.4, wid: 3.4, mat: Mat.Metal, tint: IRON },
      { move: 'climb', len: 3.4, wid: 3.4, mat: Mat.Metal, tint: IRON, action: 'wait' },
      { move: 'jump', len: 3.4, wid: 3.4, mat: Mat.Metal, tint: IRON },
      { move: 'long', len: 3.4, wid: 3.4, mat: Mat.Metal, tint: IRON, action: 'wait' },
      { move: 'climb', len: 3.4, wid: 3.4, mat: Mat.Metal, tint: IRON },
      { move: 'walk', len: 6, wid: 5, mat: Mat.Stone, tint: 0x5a5a5a },
    ],
    { from: deck(F0.x, F0.z, fieldY, fieldA0, 7), mat: Mat.Metal },
  );
  plates.forEach((p, i) => {
    if (i === 0) return;
    const strike = i % 2 === 0;
    if (strike) {
      // the plate takes the strike: a rod beside it and a lightning zone over it
      b.zone('lightning', p.x - 2, p.top - 0.5, p.z - 2, p.x + 2, p.top + 3, p.z + 2, { strength: 9, period: 4, phase: i * 1.3 });
      b.dbox(p.x, p.top, p.z, 2.4, 0.06, 2.4, { mat: Mat.Brass, tint: 0x9a7a3a, yaw: quantYaw(rad(p.a)) });
    }
  });
  // The Fall Lines under the field: seen only while falling, until the lamps are lit.
  const fieldMidA = (fieldA0 + plates[plates.length - 1].a) / 2;
  const span = fieldA0 - plates[plates.length - 1].a;
  sector(b, fieldMidA + span / 2 + 2, fieldMidA - span / 2 - 2, R2 - 5, R2 + 5, fieldY - 12, 0.15, { mat: Mat.Cloth, tint: 0xffe3b0, flags: SolidFlag.FallOnly | SolidFlag.Soft, tag: 'r8_lamps' }, 6);
  b.collect('e.r8.strike', 'echo', plates[3].x, fieldY - 6, plates[3].z);
  b.collect('rec.r8.rods', 'record', plates[plates.length - 1].x, plates[plates.length - 1].top + 1.2, plates[plates.length - 1].z);
  b.collect('f6', 'fragment', plates[4].x, plates[4].top + 1.2, plates[4].z);
  const fEnd = plates[plates.length - 1];

  // ------------------------------------------------------------------ Section C: the Updraft
  b.zone('area', -140, fEnd.top - 2, -140, 140, fEnd.top + 30, 140, { key: 'area.r8.updraft' });
  const upA = past(fEnd, 0, 7, R2);
  const U = polar(upA, R2);
  const upH = 24;
  b.zone('updraft', U.x - 2.6, fEnd.top - 10, U.z - 2.6, U.x + 2.6, fEnd.top + upH + 2.5, U.z + 2.6, { strength: 48 });
  // the shaft's rock walls either side
  for (const e of [-1, 1]) {
    const w = polar(upA, R2 + e * 3.6);
    b.block(w.x, fEnd.top - 30, w.z, 6, upH + 34, 1.2, { mat: Mat.Rock, tint: 0x4a4a4e, yaw: quantYaw(rad(upA)), flags: SolidFlag.NoWallRun });
  }
  b.anchor('r8.updraft', polar(fEnd.a, R2 - 1.6).x, fEnd.top, polar(fEnd.a, R2 - 1.6).z, 0, 'anchor.r8.updraft');
  const upTop = fEnd.top + upH;
  const lip = polar(upA - arc(3 + 2.5, R2), R2);
  b.plat(lip.x, upTop, lip.z, 5, 5, 0.5, { mat: Mat.Stone, tint: 0x5a5a5a, yaw: quantYaw(rad(upA)) });
  b.route(lip.x, upTop, lip.z, 'updraft');
  // swirling rain in the column
  b.decor('bird', U.x, fEnd.top + 12, U.z, 3, 10, 3, {});

  // ------------------------------------------------------------------ Section D: the Keepers' Walk
  b.zone('area', -140, upTop - 2, -140, 140, upTop + 26, 140, { key: 'area.r8.walk' });
  const W = helix(
    b,
    0,
    R2,
    0,
    -1,
    [
      { move: 'hop', len: 4, wid: 1.6, mat: Mat.Metal, tint: WET, flags: SolidFlag.Slippery },
      { move: 'beam', len: 6, wid: 1.2, mat: Mat.Metal, tint: WET, flags: SolidFlag.Slippery },
      { move: 'climb', len: 3, wid: 2.4, mat: Mat.Stone, tint: 0x6a6a6a },
      { move: 'wallrun', len: 3, wid: 2.4, mat: Mat.Stone, tint: 0x6a6a6a },
      { move: 'scale', len: 4, wid: 3, mat: Mat.Stone, tint: 0x6a6a6a },
      { move: 'beam', len: 7, wid: 1.2, mat: Mat.Metal, tint: WET, flags: SolidFlag.Slippery },
      { move: 'walk', len: 4, wid: 3, mat: Mat.Stone, tint: 0x6a6a6a },
    ],
    { from: deck(lip.x, lip.z, upTop, upA - arc(3 + 2.5, R2), 5), pillarR: PR, mat: Mat.Metal },
  );
  b.zone('wind', -140, upTop - 1, -140, 140, upTop + 12, 140, { dir: v3(0.6, 0, -0.8), strength: 2.4, period: 7, phase: 2 });
  b.anchor('r8.walk', polar(W[3].a, R2 - 0.6).x, W[3].top, polar(W[3].a, R2 - 0.6).z, 0, 'anchor.r8.walk');
  b.collect('e.r8.lamp', 'echo', polar(W[2].a, R2 + 4).x, W[2].top - 20, polar(W[2].a, R2 + 4).z);
  const wEnd = W[W.length - 1];
  // The Keepers' tower beyond a gap too wide to jump. Its crown hangs over the gap on chains;
  // lightning takes the tower and the crown drops into the gap, wedged across it.
  const gapLen = 9;
  const twA = past(wEnd, gapLen, 5, R2);
  const TW = polar(twA, R2);
  const twTop = wEnd.top;
  b.block(TW.x, twTop - 40, TW.z, 5, 40, 5, { mat: Mat.Stone, tint: 0x6a6660, yaw: quantYaw(rad(twA)) });
  b.plat(TW.x, twTop, TW.z, 5.4, 5.4, 0.4, { mat: Mat.Stone, tint: 0x7a7670, yaw: quantYaw(rad(twA)) });
  const tower = polar(twA + arc(1, R2), R2 + 6.2);
  b.block(tower.x, twTop - 40, tower.z, 4.4, 58, 4.4, { mat: Mat.Stone, tint: 0x5e5a54, yaw: quantYaw(rad(twA)), flags: SolidFlag.NoWallRun });
  b.decor('cone', tower.x, twTop + 18, tower.z, 3.4, 4.4, 0, { mat: Mat.Metal, tint: 0x3a3a3a });
  const gapA = wEnd.a - arc(wEnd.len / 2 + gapLen / 2, R2);
  const gapMid = polar(gapA, R2);
  const crownLift = 9;
  b.mover({ kind: 'transition', origin: v3(gapMid.x, twTop + crownLift, gapMid.z), flag: 'r8_strike', toOff: v3(0, -crownLift, 0), dur: 1.3 }, () => {
    b.plat(0, 0, 0, gapLen - 0.8, 2.4, 0.9, { mat: Mat.Stone, tint: 0x8a8680, yaw: quantYaw(rad(gapA)) });
    b.decor('cone', 0, 0.2, 0, 1.2, 1.8, 0, { mat: Mat.Metal, tint: 0x3a3a3a });
  });
  b.unless('r8_strike', () => {
    for (const e of [-3.4, 3.4]) {
      const c = polar(gapA + arc(e, R2), R2);
      b.cable(v3(c.x, twTop + crownLift, c.z), v3(tower.x, twTop + 17, tower.z), 0.4, Mat.Metal, 0x2a2a2a);
    }
  });
  b.trigger('t.r8.strike', 'r8_strike', { type: 'enter', min: v3(wEnd.x - 2, wEnd.top - 1, wEnd.z - 2), max: v3(wEnd.x + 2, wEnd.top + 3, wEnd.z + 2) }, { textKey: 'mem.r8.strike', delay: 0.9, focus: v3(gapMid.x, twTop + crownLift, gapMid.z) });
  b.route(wEnd.x, wEnd.top, wEnd.z, 'run', { expect: 'r8_strike' });
  b.routeFlags = ['r8_lamps', 'r8_strike'];
  b.route(gapMid.x, twTop, gapMid.z, 'wait');
  b.route(TW.x, twTop, TW.z, 'run');

  // ------------------------------------------------------------------ Section E: the Eye
  b.zone('area', -140, twTop - 2, -140, 140, twTop + 30, 140, { key: 'area.r8.eye' });
  const E = helix(
    b,
    0,
    R2,
    0,
    -1,
    [
      { move: 'climb', len: 3, wid: 3, mat: Mat.Stone, tint: 0x7a7670 },
      { move: 'jump', len: 3, wid: 3, mat: Mat.Stone, tint: 0x7a7670 },
      { move: 'tall', len: 3, wid: 3, mat: Mat.Stone, tint: 0x7a7670 },
      { move: 'bar', len: 4, wid: 3, mat: Mat.Metal, tint: IRON },
      { move: 'climb', len: 4, wid: 4, mat: Mat.Stone, tint: 0x8a8680 },
      { move: 'walk', len: 8, wid: 6, mat: Mat.Marble, tint: 0xc8c4bc },
    ],
    { from: deck(TW.x, TW.z, twTop, twA, 5.4), pillarR: PR, mat: Mat.Stone },
  );
  const eye = E[E.length - 1];
  b.anchor('r8.eye', polar(eye.a, R2 - 1.8).x, eye.top, polar(eye.a, R2 - 1.8).z, 0, 'anchor.r8.eye');
  b.collect('f5', 'fragment', polar(eye.a, R2 + 2).x, eye.top + 1.2, polar(eye.a, R2 + 2).z);
  b.collect('e.r8.eye', 'echo', polar(eye.a, R2 + 5).x, eye.top - 18, polar(eye.a, R2 + 5).z);
  numeral(b, 5, polar(eye.a, PR + 0.06).x, eye.top + 2.5, polar(eye.a, PR + 0.06).z, rad(eye.a), 1.5);
  lamp(b, polar(eye.a, R2 + 2.6).x, eye.top + 2.4, polar(eye.a, R2 + 2.6).z, 0xfff0c0);

  // ------------------------------------------------------------------ RISK: the lamp wire
  // From lighthouse one's gallery, the old lamp wire zips straight down past lighthouse two to
  // the far end of the Rod Field.
  const rwA = g1.a + 60;
  const rw = { x: H1.x + polar(rwA, 5.0).x, z: H1.z + polar(rwA, 5.0).z };
  const rwEnd = plates[6];
  const rdx = rwEnd.x - rw.x;
  const rdz = rwEnd.z - rw.z;
  const rl = Math.hypot(rdx, rdz);
  b.rope('zip', v3(rw.x, g1.top + 2.4, rw.z), v3(rwEnd.x - (rdx / rl) * 1.4, rwEnd.top + 2.9, rwEnd.z - (rdz / rl) * 1.4), v3(0, 1, 0), Mat.Metal);
  b.branch('risk.r8.wire', 'risk', () => {
    b.route(g1.x, g1.top, g1.z, 'run');
    b.route(rw.x, g1.top, rw.z, 'run');
    b.route(rwEnd.x, rwEnd.top, rwEnd.z, 'zip');
  });

  // ------------------------------------------------------------------ MASTER: the rod tops
  // Up the field's first mast and from rod cap to rod cap above the strikes.
  const capY = fieldY + 9;
  const rodR = R2 + 3.4;
  const capA0 = fieldA0 - arc(1, rodR);
  const capA1 = fEnd.a + arc(1.5, rodR);
  const nCaps = Math.max(2, Math.round(((capA0 - capA1) * Math.PI * rodR) / 180 / 3.2));
  const caps: HelixDeck[] = [];
  for (let i = 0; i <= nCaps; i++) {
    const a = capA0 - ((capA0 - capA1) * i) / nCaps;
    const cp = polar(a, rodR);
    const top = capY + i * 0.15;
    b.cyl(cp.x, fieldY - 4, cp.z, 0.18, top - 0.3 - (fieldY - 4), { mat: Mat.Metal, tint: 0x3a3a3a, flags: SolidFlag.NoWallRun | SolidFlag.NoGrab });
    b.plat(cp.x, top, cp.z, 1.3, 1.3, 0.3, { mat: Mat.Metal, tint: 0x3a3a3a, yaw: quantYaw(rad(a)) });
    b.decor('sphere', cp.x, top + 0.25, cp.z, 0.22, 0, 0, { mat: Mat.Brass, tint: 0xb8923a });
    caps.push(deck(cp.x, cp.z, top, a, 1.3));
  }
  // the first mast has a ladder; its cap is the first stepping stone
  const m0 = caps[0];
  const inward = polar(m0.a, 1);
  b.block(m0.x, fieldY - 4, m0.z, 0.9, capY - 0.3 - (fieldY - 4), 0.9, { mat: Mat.Metal, tint: 0x3a3a3a, yaw: radialYaw(m0.a), flags: SolidFlag.NoWallRun });
  b.ladder(m0.x - inward.x * 0.47, fieldY, m0.z - inward.z * 0.47, capY, v3(-inward.x, 0, -inward.z));
  b.branch('master.r8.rods', 'master', () => {
    b.route(F0.x, fieldY, F0.z, 'run');
    b.route(m0.x - inward.x * 1.6, fieldY, m0.z - inward.z * 1.6, 'run');
    b.route(m0.x, m0.top, m0.z, 'ladder');
    for (const c of caps.slice(1)) b.route(c.x, c.top, c.z, 'jump');
    b.route(fEnd.x, fEnd.top, fEnd.z, 'drop');
  });
  const cm = caps[Math.floor(caps.length / 2)];
  b.trigger('t.r8.master', 'master_r8_rods', { type: 'enter', min: v3(cm.x - 1, cm.top - 0.5, cm.z - 1), max: v3(cm.x + 1, cm.top + 2, cm.z + 1) });

  // storm-torn cables hanging from above
  for (let i = 0; i < 14; i++) {
    const p = polar(i * 25.7 + 5, 64 + (i % 3) * 6);
    hangCable(b, p.x, y0 + 20 + (i % 4) * 16, p.z, y0 + 150, 0.4);
  }

  // ------------------------------------------------------------------ trial & daily
  b.trial({
    id: 'trial.r8',
    nameKey: 'trial.r8',
    start: v3(a0.x, y0 + 0.05, a0.z),
    startYaw: 0,
    gates: [
      { pos: v3(g1.x, g1.top + 1, g1.z), r: 3 },
      { pos: v3(mid.x, (g1.top + g2Top) / 2 + 1, mid.z), r: 3 },
      { pos: v3(F0.x, fieldY + 1, F0.z), r: 3.5 },
      { pos: v3(lip.x, upTop + 1, lip.z), r: 3 },
      { pos: v3(TW.x, twTop + 1, TW.z), r: 3 },
    ],
    finish: { pos: v3(eye.x, eye.top + 1, eye.z), r: 4 },
    medals: { bronze: 330, silver: 265, gold: 215, perfect: 185 },
    flags: ['r8_lamps', 'r8_strike'],
    abilities: Ability.Sprint | Ability.Mantle | Ability.Slide | Ability.Vault | Ability.LedgeGrab | Ability.Rope | Ability.WallRun | Ability.WallJump | Ability.WallClimb | Ability.Roll | Ability.Swing | Ability.Zip | Ability.Tether,
    master: [{ pos: v3(cm.x, cm.top + 0.5, cm.z), r: 2 }],
  });
  for (const d of [A[2], L1[4], L1[8], plates[2], plates[5], W[2], W[5], E[3]]) b.daily(d.x, d.top + 1, d.z);

  const topY = eye.top + 4;
  pillar(b, y0 + 2, topY + 40, PR, PR, 8);
  b.data.meta.topY = topY;
  return { data: b.build(), exit: { x: eye.x, y: eye.top, z: eye.z, a: eye.a } };
}
