import { v3 } from '../../math';
import { RegionBuilder, quantYaw } from '../builder';
import { helix, lamp, numeral, pillar, polar, sector, type HelixDeck } from '../kit';
import { Mat, SolidFlag, type RegionData } from '../types';
import type { Exit } from './r03_construction';

/**
 * REGION 10 — ABOVE
 * The summit of the Pillar, over a golden cloud sea. Stone islands, the First Garden grown from
 * seed carried in the first generation's pockets, and the Cradle: one room and a bench facing
 * the edge, where everyone once lived together.
 *
 * Memory: the garden blooms if you carried every letter up; sitting on the Cradle's bench
 * begins the Last Fall.
 * Routes: SAFE the islands and the bridge / RISK the old rope / MASTER the summit cliff.
 */

const ATM = {
  skyTop: 0x3a6ab8,
  skyHorizon: 0xffd8a0,
  fog: 0xf0c890,
  fogDensity: 0.001,
  sunColor: 0xfff0d0,
  sunIntensity: 1.4,
  ambient: 0x8a7a68,
  sunDir: v3(0.5, 0.35, -0.55),
  weather: 5,
  cloudColor: 0xffe6c0,
  exposure: 1.08,
};

const PR = 20;
const R = 66;
const ROCK = 0x9a8e7c;
const GOLD = 0xe8c070;
const rad = (d: number) => (d * Math.PI) / 180;
const radialYaw = (a: number) => quantYaw(rad(a + 90));
const deck = (x: number, z: number, top: number, a: number, len: number): HelixDeck => ({ x, z, top, a, yaw: 0, len });

export function region10(entry: Exit): { data: RegionData; exit: Exit } {
  const y0 = entry.y;
  const b = new RegionBuilder({ index: 9, id: 'above', baseY: y0 + 2, topY: y0 + 120, atmosphere: ATM, center: v3(0, 0, 0), radius: 160 });

  // ------------------------------------------------------------------ Section A: the Stone Islands
  b.zone('area', -160, y0 - 2, -160, 160, y0 + 22, 160, { key: 'area.r10.islands' });
  const i0 = polar(entry.a, R);
  b.plat(i0.x, y0, i0.z, 5, 5, 0.6, { mat: Mat.Rock, tint: ROCK, yaw: quantYaw(rad(entry.a)) });
  b.decor('cone', i0.x, y0 - 0.6, i0.z, 3, -7, 0, { mat: Mat.Rock, tint: 0x7a6e5e });
  b.route(i0.x, y0, i0.z, 'jump');
  b.anchor('r10.islands', i0.x, y0, i0.z, 0, 'anchor.r10.islands', true);
  const I = helix(
    b,
    0,
    R,
    0,
    -1,
    [
      { move: 'jump', len: 4, wid: 4, mat: Mat.Rock, tint: ROCK },
      { move: 'climb', len: 3, wid: 3, mat: Mat.Rock, tint: ROCK },
      { move: 'tether', len: 4, wid: 4, mat: Mat.Rock, tint: ROCK },
      { move: 'hop', len: 3, wid: 3, mat: Mat.Rock, tint: ROCK },
      { move: 'climb', len: 4, wid: 4, mat: Mat.Rock, tint: ROCK },
      { move: 'long', len: 3, wid: 3, mat: Mat.Rock, tint: ROCK },
      { move: 'tall', len: 4, wid: 4, mat: Mat.Rock, tint: ROCK },
      { move: 'bar', len: 4, wid: 4, mat: Mat.Rock, tint: ROCK },
      { move: 'climb', len: 5, wid: 5, mat: Mat.Moss, tint: 0x7a9a4a },
    ],
    { from: deck(i0.x, i0.z, y0, entry.a, 5), mat: Mat.Rock },
  );
  for (const d of I.slice(1)) {
    b.decor('cone', d.x, d.top - 0.25, d.z, d.len * 0.55, -(3 + d.len), 0, { mat: Mat.Rock, tint: 0x7a6e5e });
    if (d.len >= 4) b.decor('plant', polar(d.a, R + 1).x, d.top, polar(d.a, R + 1).z, 0.4, 0, 0, { tint: 0xe8c860 });
  }
  b.collect('e.r10.song', 'echo', I[4].x, I[4].top - 24, I[4].z);
  const iEnd = I[I.length - 1];

  // ------------------------------------------------------------------ Section B: the First Garden
  // The summit: a plateau of stone on the Pillar's crown, reached by a natural arch.
  const yG = iEnd.top + 2.2;
  const plateauR = 26;
  b.cyl(0, yG - 14, 0, plateauR, 14, { mat: Mat.Rock, tint: ROCK, flags: SolidFlag.NoWallRun });
  sector(b, 0, 359.9, 3, plateauR - 0.2, yG + 0.02, 0.1, { mat: Mat.Grass, tint: 0x8aa84e }, 12);
  b.zone('area', -plateauR - 8, yG - 2, -plateauR - 8, plateauR + 8, yG + 20, plateauR + 8, { key: 'area.r10.garden' });
  // the arch from the last island to the plateau's rim
  const aA = iEnd.a;
  const archIn = polar(aA, plateauR + 0.02);
  const archOut = polar(aA, R - 2.6);
  b.beamBetween(archOut.x, archOut.z, iEnd.top, archIn.x, archIn.z, yG, 2.6, { mat: Mat.Rock, tint: ROCK });
  b.route(polar(aA, (R + plateauR) / 2).x, (iEnd.top + yG) / 2, polar(aA, (R + plateauR) / 2).z, 'run');
  const gIn = polar(aA, plateauR - 4);
  b.route(gIn.x, yG, gIn.z, 'run');
  b.anchor('r10.garden', gIn.x, yG, gIn.z, 0, 'anchor.r10.garden');
  // trees and beds: bare-branched until the garden remembers the letters
  const beds: { x: number; z: number }[] = [];
  for (let i = 0; i < 9; i++) {
    const a = aA - 30 - i * 32;
    const r = 8 + (i % 3) * 5;
    beds.push(polar(a, r));
  }
  for (const [i, p] of beds.entries()) {
    b.block(p.x, yG, p.z, 3.2, 0.5, 2.2, { mat: Mat.Stone, tint: 0xb8ac94, yaw: quantYaw(rad(i * 40)) });
    b.unless('r10_bloom', () => b.decor('plant', p.x, yG + 0.5, p.z, 0.5, 0, 0, { tint: 0x6a8a4a }));
    b.when('r10_bloom', () => {
      b.decor('plant', p.x - 0.7, yG + 0.5, p.z, 0.7, 0, 0, { tint: [0xf0a0c0, 0xf8e070, 0xc0a0f0][i % 3] });
      b.decor('plant', p.x + 0.7, yG + 0.5, p.z, 0.6, 0, 0, { tint: [0xf8e070, 0xc0a0f0, 0xf0a0c0][i % 3] });
    });
  }
  for (let i = 0; i < 6; i++) {
    const p = polar(aA - 50 - i * 55, 19 + (i % 2) * 3);
    b.cyl(p.x, yG, p.z, 0.25, 2.4, { mat: Mat.Wood, tint: 0x6a5038 });
    b.unless('r10_bloom', () => b.decor('tree', p.x, yG, p.z, 2.2, 5.4, 0, { tint: 0x7a8a5a }));
    b.when('r10_bloom', () => b.decor('tree', p.x, yG, p.z, 2.6, 6.2, 0, { tint: 0xf4b8cc }));
  }
  // a still pool at the centre
  b.cyl(0, yG, 0, 3.4, 0.45, { mat: Mat.Stone, tint: 0xc8bca4 });
  b.decor('cyl', 0, yG + 0.38, 0, 3.1, 0.1, 0, { mat: Mat.Water, tint: 0x7ab8d8 });
  b.collect('rec.r10.garden', 'record', polar(aA - 20, 10).x, yG + 1.2, polar(aA - 20, 10).z);
  // every letter carried up: the garden blooms (30 generations less the first, still to be found)
  b.trigger('t.r10.bloom', 'r10_bloom', { type: 'collect', kind: 'fragment', region: -1, count: 29 }, { textKey: 'mem.r10.bloom', delay: 1.5 });
  numeral(b, 1, polar(aA - 10, PR - 0.2).x, yG + 1.2, polar(aA - 10, PR - 0.2).z, rad(aA - 10), 1.1);
  b.route(polar(aA - 25, 12).x, yG, polar(aA - 25, 12).z, 'run');

  // ------------------------------------------------------------------ Section C: the Cradle
  const cA = aA - 180;
  const cr = polar(cA, 17);
  const cy = yG;
  b.zone('area', cr.x - 12, cy - 2, cr.z - 12, cr.x + 12, cy + 10, cr.z + 12, { key: 'area.r10.cradle' });
  // one room of stone; its door faces the garden, its bench faces the edge
  const cyaw = quantYaw(rad(cA));
  const cc = Math.cos(rad(cA));
  const cs = Math.sin(rad(cA));
  const L = (lx: number, lz: number) => ({ x: cr.x + lx * cc + lz * cs, z: cr.z - lx * cs + lz * cc });
  // local z runs outward (toward the edge) along the radial; local x along the tangent
  const wallH = 3.2;
  for (const [lx, lz, w, d] of [
    [-2.6, 0, 0.5, 5.8],
    [2.6, 0, 0.5, 5.8],
    [0, 2.7, 5.7, 0.5],
  ] as const) {
    const p = L(lx, lz);
    b.block(p.x, cy, p.z, w, wallH, d, { mat: Mat.Stone, tint: 0xc8bca4, yaw: cyaw, flags: SolidFlag.NoWallRun });
  }
  // the garden-side wall has the door
  for (const lx of [-1.8, 1.8]) {
    const p = L(lx, -2.7);
    b.block(p.x, cy, p.z, 2.1, wallH, 0.5, { mat: Mat.Stone, tint: 0xc8bca4, yaw: cyaw, flags: SolidFlag.NoWallRun });
  }
  const roof = L(0, 0);
  b.block(roof.x, cy + wallH, roof.z, 6.2, 0.5, 6.2, { mat: Mat.Stone, tint: 0xb0a48c, yaw: cyaw });
  // the window in the edge-side wall and the bench before it
  const win = L(0, 2.7);
  b.decor('window', win.x, cy + 1.6, win.z, 1.4, 1.2, 0.6, { mat: Mat.Glow, tint: 0xffe6b0, yaw: rad(cA) });
  const bench = L(0, 1.6);
  b.block(bench.x, cy, bench.z, 2.4, 0.45, 0.6, { mat: Mat.Wood, tint: 0x8a6a48, yaw: cyaw });
  b.collect('f1', 'fragment', L(-1.9, -0.6).x, cy + 1.1, L(-1.9, -0.6).z);
  b.collect('f0', 'fragment', bench.x, cy + 0.9, bench.z);
  b.collect('rec.r10.cradle', 'record', L(1.9, -0.6).x, cy + 1.2, L(1.9, -0.6).z);
  lamp(b, roof.x, cy + wallH - 0.4, roof.z, 0xffe0a0);
  b.anchor('r10.cradle', L(0, -4.2).x, cy, L(0, -4.2).z, 0, 'anchor.r10.cradle');
  b.route(L(0, -4.4).x, cy, L(0, -4.4).z, 'run');
  b.route(L(0, -0.6).x, cy, L(0, -0.6).z, 'run');
  const sit = L(0, 0.9);
  // sitting down in the Cradle ends every journey, New Game+ included
  b.trigger('t.r10.cradle', 'r10_cradle', { type: 'enter', min: v3(sit.x - 1.2, cy - 0.2, sit.z - 1.2), max: v3(sit.x + 1.2, cy + 2, sit.z + 1.2) });
  b.route(sit.x, cy, sit.z, 'run', { expect: 'r10_cradle' });
  // beyond the window, the edge — and far below, the cloud sea
  b.collect('e.r10.last', 'echo', L(0, 16).x, cy - 30, L(0, 16).z);

  // ------------------------------------------------------------------ RISK: the high stones
  // From the third island, small stones straight in across the gap to the garden's rim, each a
  // little higher than the last: faster than the islands and the arch, and nothing to catch you.
  const rFrom = I[3];
  const rTo = polar(rFrom.a - 4, plateauR - 1);
  b.plat(rTo.x, yG, rTo.z, 3, 3, 0.4, { mat: Mat.Rock, tint: ROCK, yaw: radialYaw(rFrom.a - 4) });
  const hs: { x: number; z: number; y: number }[] = [];
  const hsN = Math.ceil(Math.hypot(rTo.x - rFrom.x, rTo.z - rFrom.z) / 4.4);
  for (let i = 1; i < hsN; i++) {
    const t = i / hsN;
    const x = rFrom.x + (rTo.x - rFrom.x) * t;
    const z = rFrom.z + (rTo.z - rFrom.z) * t;
    const y = rFrom.top + (yG - rFrom.top) * t;
    b.plat(x, y, z, 1.4, 1.4, 0.4, { mat: Mat.Rock, tint: 0xb0a48c });
    b.decor('cone', x, y - 0.4, z, 0.8, -1.8, 0, { mat: Mat.Rock, tint: 0x7a6e5e });
    hs.push({ x, z, y });
  }
  b.branch('risk.r10.stones', 'risk', () => {
    b.route(rFrom.x, rFrom.top, rFrom.z, 'run');
    for (const h of hs) b.route(h.x, h.y, h.z, 'jump');
    b.route(rTo.x, yG, rTo.z, 'jump');
  });

  // ------------------------------------------------------------------ MASTER: the summit cliff
  // From the first island, three chimneys straight up a cleft in the summit rock.
  const mA = entry.a + 40;
  const M = helix(
    b,
    mA,
    plateauR + 1.6,
    y0 + 3,
    -1,
    [
      { move: 'start', len: 3, wid: 2.6, mat: Mat.Rock, tint: ROCK },
      { move: 'chimney', len: 3, wid: 2.6, mat: Mat.Rock, tint: 0x8a7e6c },
      { move: 'chimney', len: 3, wid: 2.6, mat: Mat.Rock, tint: 0x8a7e6c },
      { move: 'climb', len: 3, wid: 2.6, dh: yG - (y0 + 3) - 14, mat: Mat.Rock, tint: ROCK },
    ],
    { route: false, mat: Mat.Rock },
  );
  const mTop = M[M.length - 1];
  const mBridge = polar(mTop.a, plateauR + 0.2);
  b.plat(mBridge.x, yG, mBridge.z, 2.2, 3, 0.3, { mat: Mat.Rock, tint: ROCK, yaw: radialYaw(mTop.a) });
  const mStart = M[0];
  // stepping stones from the first island in to the foot of the cleft
  // (they arrive from behind the cleft, along the rock, not through its outer wall)
  const mBehind = polar(mA + ((4.6 / (plateauR + 1.6)) * 180) / Math.PI, plateauR + 1.6);
  const ms: { x: number; z: number; y: number }[] = [];
  const msN = Math.ceil(Math.hypot(mBehind.x - i0.x, mBehind.z - i0.z) / 4.4);
  for (let i = 1; i <= msN; i++) {
    const t = i / msN;
    const x = i0.x + (mBehind.x - i0.x) * t;
    const z = i0.z + (mBehind.z - i0.z) * t;
    const y = y0 + (mStart.top - y0) * t;
    b.plat(x, y, z, 1.4, 1.4, 0.4, { mat: Mat.Rock, tint: 0xb0a48c });
    ms.push({ x, z, y });
  }
  b.branch('master.r10.cliff', 'master', () => {
    b.route(i0.x, y0, i0.z, 'run');
    for (const m of ms) b.route(m.x, m.y, m.z, 'jump');
    b.route(mStart.x, mStart.top, mStart.z, 'jump');
    b.route(M[1].x, M[1].top, M[1].z, 'walljump');
    b.route(M[2].x, M[2].top, M[2].z, 'walljump');
    b.route(mTop.x, mTop.top, mTop.z, 'mantle');
    b.route(mBridge.x, yG, mBridge.z, 'run');
  });
  b.trigger('t.r10.master', 'master_r10_cliff', { type: 'enter', min: v3(M[2].x - 1.5, M[2].top - 0.5, M[2].z - 1.5), max: v3(M[2].x + 1.5, M[2].top + 2, M[2].z + 1.5) });

  // ------------------------------------------------------------------ trial & daily
  b.trial({
    id: 'trial.r10',
    nameKey: 'trial.r10',
    start: v3(i0.x, y0 + 0.05, i0.z),
    startYaw: 0,
    gates: [
      { pos: v3(I[3].x, I[3].top + 1, I[3].z), r: 3 },
      { pos: v3(I[6].x, I[6].top + 1, I[6].z), r: 3 },
      { pos: v3(iEnd.x, iEnd.top + 1, iEnd.z), r: 3 },
      { pos: v3(gIn.x, yG + 1, gIn.z), r: 4 },
    ],
    finish: { pos: v3(L(0, -4.4).x, cy + 1, L(0, -4.4).z), r: 3.5 },
    master: [{ pos: v3(M[2].x, M[2].top + 0.5, M[2].z), r: 2.5 }],
  });
  for (const d of [I[2], I[5], I[8]]) b.daily(d.x, d.top + 1, d.z);
  b.daily(gIn.x, yG + 1, gIn.z);

  // the golden sea below, and the summit's crown of old stone
  for (let i = 0; i < 12; i++) {
    const p = polar(i * 30 + 12, plateauR - 1.2);
    b.dbox(p.x, yG, p.z, 0.6, 1 + (i % 3) * 0.6, 0.6, { mat: Mat.Stone, tint: 0xd0c4a8 });
  }
  b.decor('glyph', 0, yG + 0.08, 0, 5, 5, 1, { key: 'plumb', tint: GOLD, mat: Mat.Paint });

  const topY = yG + 12;
  pillar(b, y0 + 2, yG - 14, PR, PR, 10);
  b.data.meta.topY = topY;
  return { data: b.build(), exit: { x: cr.x, y: cy, z: cr.z, a: cA } };
}
