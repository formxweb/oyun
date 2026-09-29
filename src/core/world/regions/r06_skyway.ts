import { v3 } from '../../math';
import { RegionBuilder, quantYaw } from '../builder';
import { hangCable, helix, helixSpan, lamp, numeral, pillar, polar, type HelixDeck, type HelixStep } from '../kit';
import { Ability, Mat, SolidFlag, type RegionData } from '../types';
import type { Exit } from './r03_construction';

/**
 * REGION 06 — THE SKYWAY
 * Generations 11–13 reached the cloud sea and built outward across it: a suspension bridge to
 * the Outer Needle (a lesser spire they never finished descending), cable cars, and brass rings
 * set in the rock for the plumb-line swing that every child learned.
 *
 * Teaches: rope swing and bar (lesson), zip line (lesson), the plumb-line tether (lesson).
 * Memory: a cable snaps under you on the Long Bridge and its far half settles lower for good;
 * the cable cars start running once you pull the Needle station's lever.
 * Routes: SAFE the bridge and the cars / RISK the bridge cable zip / MASTER the Needle chimneys.
 */

const ATM = {
  skyTop: 0x2f6fc8,
  skyHorizon: 0xcfe2f4,
  fog: 0xd8e6f2,
  fogDensity: 0.0011,
  sunColor: 0xfff6e8,
  sunIntensity: 1.35,
  ambient: 0x7888a0,
  sunDir: v3(0.35, 0.72, 0.3),
  weather: 0,
  cloudColor: 0xffffff,
  exposure: 1.05,
};

const PR = 30;
const R = 50;
const STEEL = 0x8a949e;
const RED = 0xb0443a;
const BRASS = 0xc09a4a;
const rad = (d: number) => (d * Math.PI) / 180;
const radialYaw = (a: number) => quantYaw(rad(a + 90));
const deck = (x: number, z: number, top: number, a: number, len: number): HelixDeck => ({ x, z, top, a, yaw: 0, len });

export function region06(entry: Exit): { data: RegionData; exit: Exit } {
  const y0 = entry.y;
  const b = new RegionBuilder({ index: 5, id: 'skyway', baseY: y0 + 2, topY: y0 + 170, atmosphere: ATM, center: v3(0, 0, 0), radius: 170 });

  // ------------------------------------------------------------------ Section A: up to the Bridgehead
  b.zone('area', -140, y0 - 2, -140, 140, y0 + 20, 140, { key: 'area.r6.bridge' });
  const gw = polar(entry.a, 44);
  b.plat(gw.x, y0, gw.z, 8.4, 2.4, 0.3, { mat: Mat.Metal, tint: STEEL, yaw: radialYaw(entry.a) });
  b.route(gw.x, y0, gw.z, 'run');
  const a0p = polar(entry.a, R);
  b.plat(a0p.x, y0, a0p.z, 4, 4, 0.4, { mat: Mat.Concrete, tint: 0xd0ccc4, yaw: quantYaw(rad(entry.a)) });
  b.route(a0p.x, y0, a0p.z, 'run');
  const A = helix(
    b,
    0,
    R,
    0,
    -1,
    [
      { move: 'hop', mat: Mat.Concrete, tint: 0xd0ccc4 },
      { move: 'climb', mat: Mat.Metal, tint: STEEL },
      { move: 'walk', len: 5, wid: 4, mat: Mat.Concrete, tint: 0xd0ccc4 },
      { move: 'swing', len: 4, wid: 4, mat: Mat.Concrete, tint: 0xd0ccc4 },
      { move: 'walk', len: 4, wid: 3, mat: Mat.Metal, tint: STEEL },
      { move: 'bar', len: 4, wid: 3.4, mat: Mat.Metal, tint: STEEL },
      { move: 'climb', mat: Mat.Concrete, tint: 0xd0ccc4 },
      { move: 'tall', mat: Mat.Metal, tint: STEEL },
      { move: 'climb', mat: Mat.Concrete, tint: 0xd0ccc4 },
      { move: 'walk', len: 5, wid: 4, mat: Mat.Concrete, tint: 0xd0ccc4 },
      { move: 'zip', len: 8, wid: 5, mat: Mat.Concrete, tint: 0xd0ccc4 },
      { move: 'walk', len: 8, wid: 6, mat: Mat.Concrete, tint: 0xc8c4bc },
    ],
    { from: deck(a0p.x, a0p.z, y0, entry.a, 4), pillarR: PR, mat: Mat.Concrete },
  );
  const lSwing = A[3];
  b.collect('l.swing', 'lesson', lSwing.x, lSwing.top + 1.3, lSwing.z, Ability.Swing);
  b.trigger('t.r6.hint.swing', 'hint_swing', { type: 'enter', min: v3(lSwing.x - 2.5, lSwing.top - 1, lSwing.z - 2.5), max: v3(lSwing.x + 2.5, lSwing.top + 3, lSwing.z + 2.5) }, { textKey: 'hint.swing' });
  const lZip = A[10];
  b.collect('l.zip', 'lesson', lZip.x, lZip.top + 1.3, lZip.z, Ability.Zip);
  b.trigger('t.r6.hint.zip', 'hint_zip', { type: 'enter', min: v3(lZip.x - 2.5, lZip.top - 1, lZip.z - 2.5), max: v3(lZip.x + 2.5, lZip.top + 3, lZip.z + 2.5) }, { textKey: 'hint.zip' });
  numeral(b, 13, polar(A[7].a, PR + 0.06).x, A[7].top + 2, polar(A[7].a, PR + 0.06).z, rad(A[7].a), 1.4);
  const head = A[A.length - 1];
  b.anchor('r6.bridge', polar(head.a, R - 1.8).x, head.top, polar(head.a, R - 1.8).z, 0, 'anchor.r6.bridge', true);
  b.collect('rec.r6.bridge', 'record', polar(head.a + 3, R - 2).x, head.top + 1.2, polar(head.a + 3, R - 2).z);

  // ------------------------------------------------------------------ Section B: the Long Bridge
  const aBr = head.a;
  const bridgeY = head.top;
  const out = polar(aBr, 1);
  const along = (r: number) => ({ x: out.x * r, z: out.z * r });
  const segLen = 4;
  const segR = (i: number) => R + 3 + segLen / 2 + i * segLen;
  const SEGS = 13;
  const snapFrom = 8;
  const snapTo = 11;
  const drop = 5.5;
  for (let i = 0; i < SEGS; i++) {
    if (i >= snapFrom && i <= snapTo) continue;
    const p = along(segR(i));
    b.plat(p.x, bridgeY, p.z, segLen + 0.05, 2.6, 0.35, { mat: Mat.Wood, tint: 0xa88a60, yaw: radialYaw(aBr) });
  }
  // the half that will fall, hung from the cable that will snap
  const sp0 = along(segR(snapFrom));
  b.mover({ kind: 'transition', origin: v3(sp0.x, bridgeY, sp0.z), flag: 'r6_cable', toOff: v3(0, -drop, 0), dur: 2.2 }, () => {
    for (let i = snapFrom; i <= snapTo; i++) {
      const p = along(segR(i));
      b.plat(p.x - sp0.x, 0, p.z - sp0.z, segLen + 0.05, 2.6, 0.35, { mat: Mat.Wood, tint: 0x9a7e56, yaw: radialYaw(aBr) });
    }
  });
  // towers and suspension cables
  const side = polar(aBr + 90, 1);
  const tower = (r: number, h: number) => {
    for (const e of [-1.9, 1.9]) {
      const p = along(r);
      b.block(p.x + side.x * e, bridgeY - 30, p.z + side.z * e, 0.8, h + 30, 0.8, { mat: Mat.Metal, tint: RED, yaw: radialYaw(aBr), flags: SolidFlag.NoWallRun });
    }
    const p = along(r);
    b.dbox(p.x, bridgeY + h - 0.8, p.z, 0.6, 0.8, 4.6, { mat: Mat.Metal, tint: RED, yaw: radialYaw(aBr) });
  };
  const t1 = R + 3;
  const t2 = segR(SEGS - 1) + segLen / 2 - 0.4;
  tower(t1, 16);
  tower(t2, 16);
  for (const e of [-1.9, 1.9]) {
    const a = along(t1);
    const c = along(t2);
    const mid = along((t1 + t2) / 2);
    b.cable(v3(a.x + side.x * e, bridgeY + 16, a.z + side.z * e), v3(mid.x + side.x * e, bridgeY + 3, mid.z + side.z * e), 0, Mat.Metal, 0x3a3e44);
    b.cable(v3(mid.x + side.x * e, bridgeY + 3, mid.z + side.z * e), v3(c.x + side.x * e, bridgeY + 16, c.z + side.z * e), 0, Mat.Metal, 0x3a3e44);
    for (let i = 0; i < SEGS; i++) {
      const p = along(segR(i));
      const t = Math.abs(segR(i) - (t1 + t2) / 2) / ((t2 - t1) / 2);
      const hy = 3 + 13 * t * t;
      const snapped = e > 0 && i >= snapFrom - 1 && i <= snapTo;
      if (!snapped) b.cable(v3(p.x + side.x * e, bridgeY, p.z + side.z * e), v3(p.x + side.x * e, bridgeY + hy, p.z + side.z * e), 0, Mat.Metal, 0x5a5e62);
    }
  }
  // crosswinds over the open middle of the bridge
  const wm = along(segR(5));
  b.zone('wind', wm.x - 14, bridgeY - 1, wm.z - 14, wm.x + 14, bridgeY + 6, wm.z + 14, { dir: v3(side.x, 0, side.z), strength: 5, period: 6, phase: 0 });
  b.collect('e.r6.bridge', 'echo', wm.x, bridgeY - 28, wm.z);
  b.route(along(segR(2)).x, bridgeY, along(segR(2)).z, 'run');
  const trig = along(segR(snapFrom - 1));
  b.trigger('t.r6.cable', 'r6_cable', { type: 'enter', min: v3(trig.x - 2.2, bridgeY - 1, trig.z - 2.2), max: v3(trig.x + 2.2, bridgeY + 3, trig.z + 2.2) }, { textKey: 'mem.r6.cable', delay: 0.5, focus: v3(sp0.x, bridgeY - drop, sp0.z) });
  b.route(trig.x, bridgeY, trig.z, 'run', { expect: 'r6_cable' });
  b.routeFlags = ['r6_cable'];
  const f0 = along(segR(snapFrom) + 1);
  b.route(f0.x, bridgeY - drop, f0.z, 'drop');
  const f1 = along(segR(snapTo));
  b.route(f1.x, bridgeY - drop, f1.z, 'run');
  // the Needle end of the bridge: a pier with a ladder down to where the deck now lies
  const pierR = segR(SEGS - 1);
  const pier = along(pierR);
  b.block(pier.x, bridgeY - drop - 1, pier.z, segLen, drop + 0.65, 2.6, { mat: Mat.Stone, tint: 0xb8b0a4, yaw: radialYaw(aBr) });
  const ld = along(pierR - segLen / 2 - 0.02);
  b.ladder(ld.x, bridgeY - drop, ld.z, bridgeY, v3(-out.x, 0, -out.z));
  b.route(pier.x, bridgeY, pier.z, 'ladder');

  // ------------------------------------------------------------------ Section C: the Outer Needle
  const NR = 7;
  const nC = along(pierR + segLen / 2 + 0.4 + NR + 0.2);
  const needleTopY = bridgeY + 30;
  b.zone('area', nC.x - 30, bridgeY - 2, nC.z - 30, nC.x + 30, needleTopY + 8, nC.z + 30, { key: 'area.r6.needle' });
  b.cyl(nC.x, bridgeY - 140, nC.z, NR, needleTopY - (bridgeY - 140) - 3, { mat: Mat.Rock, tint: 0xa89c8a, flags: SolidFlag.NoWallRun });
  b.decor('cone', nC.x, needleTopY - 3, nC.z, NR * 0.9, 9, 0, { mat: Mat.Rock, tint: 0x9a8e7e, landmark: true });
  // the Needle's foot has no floors below it: bare rock all the way down into the cloud
  b.collect('e.r6.needle', 'echo', nC.x + out.x * 9, bridgeY - 45, nC.z + out.z * 9);
  const toPillar = aBr + 180;
  const baseA = toPillar;
  const nBase = { x: nC.x + polar(baseA, 8.6).x, z: nC.z + polar(baseA, 8.6).z };
  b.plat(nBase.x, bridgeY, nBase.z, 3.4, 3.2, 0.4, { mat: Mat.Stone, tint: 0xb8b0a4, yaw: quantYaw(rad(baseA)) });
  b.route(nBase.x, bridgeY, nBase.z, 'run');
  b.anchor('r6.needle', nBase.x, bridgeY, nBase.z, 0, 'anchor.r6.needle');
  const needleSteps: HelixStep[] = [
    { move: 'climb', len: 3, wid: 3, mat: Mat.Stone, tint: 0xb8b0a4 },
    { move: 'jump', len: 3, wid: 3, mat: Mat.Metal, tint: STEEL },
    { move: 'wallrun', len: 3, wid: 3, mat: Mat.Metal, tint: RED },
    { move: 'climb', len: 3, wid: 3, mat: Mat.Stone, tint: 0xb8b0a4 },
    { move: 'ladder', len: 3, wid: 3, mat: Mat.Stone, tint: 0xb8b0a4 },
    { move: 'hop', len: 3, wid: 3, mat: Mat.Metal, tint: STEEL },
    { move: 'chimney', len: 3, wid: 3, mat: Mat.Stone, tint: 0x9a8e7e },
    { move: 'jump', len: 3, wid: 3, mat: Mat.Metal, tint: STEEL },
    { move: 'scale', len: 3, wid: 3, mat: Mat.Stone, tint: 0xa89c8a },
    { move: 'climb', len: 3, wid: 3, mat: Mat.Stone, tint: 0xb8b0a4 },
    { move: 'tall', len: 3, wid: 3, mat: Mat.Stone, tint: 0xb8b0a4 },
    { move: 'walk', len: 5, wid: 4, mat: Mat.Concrete, tint: 0xd0ccc4 },
  ];
  // The spiral makes exactly one turn, so the top station faces the Pillar again.
  const turn = helixSpan(needleSteps, 8.6, 3.4);
  needleSteps[needleSteps.length - 1].gap = ((360 - turn) / 180) * Math.PI * 8.6;
  const N = helix(b, 0, 8.6, 0, -1, needleSteps, { from: deck(nBase.x, nBase.z, bridgeY, baseA, 3.4), center: nC, mat: Mat.Stone });
  b.collect('f13', 'fragment', N[6].x, N[6].top + 1, N[6].z);
  const nTop = N[N.length - 1];
  numeral(b, 12, nC.x + polar(nTop.a, NR + 0.06).x, nTop.top + 2, nC.z + polar(nTop.a, NR + 0.06).z, rad(nTop.a), 1.2);

  // MASTER: three chimneys stacked up the Needle's far face, then a plank to the top station.
  const mA0 = baseA + 40;
  const hopA = baseA + 22;
  const hop = { x: nC.x + polar(hopA, 10.6).x, z: nC.z + polar(hopA, 10.6).z };
  b.plat(hop.x, bridgeY, hop.z, 2, 2, 0.4, { mat: Mat.Stone, tint: 0x9a8e7e, yaw: quantYaw(rad(hopA)) });
  const mStart = { x: nC.x + polar(mA0, 13).x, z: nC.z + polar(mA0, 13).z };
  const M = helix(
    b,
    mA0,
    13,
    bridgeY,
    -1,
    [
      { move: 'start', len: 3, wid: 2.6, mat: Mat.Stone, tint: 0x9a8e7e },
      { move: 'chimney', len: 3, wid: 2.6, mat: Mat.Stone, tint: 0x8a7e6e },
      { move: 'chimney', len: 3, wid: 2.6, mat: Mat.Stone, tint: 0x8a7e6e },
      { move: 'chimney', len: 3, wid: 2.6, mat: Mat.Stone, tint: 0x8a7e6e },
      { move: 'tall', len: 3, wid: 2.6, mat: Mat.Stone, tint: 0x9a8e7e },
      { move: 'step', len: 3, wid: 2.6, dh: nTop.top - bridgeY - 24, mat: Mat.Stone, tint: 0x9a8e7e },
    ],
    { center: nC, route: false, mat: Mat.Stone },
  );
  const mEnd = M[M.length - 1];
  const plankA = mEnd.a;
  const plank = { x: nC.x + polar(plankA, 10.9).x, z: nC.z + polar(plankA, 10.9).z };
  b.plat(plank.x, mEnd.top, plank.z, 3.2, 1.4, 0.3, { mat: Mat.Wood, tint: 0xa88a60, yaw: radialYaw(plankA) });
  b.branch('master.r6.chimneys', 'master', () => {
    b.route(nBase.x, bridgeY, nBase.z, 'run');
    b.route(hop.x, bridgeY, hop.z, 'jump');
    b.route(mStart.x, bridgeY, mStart.z, 'jump');
    for (const d of M.slice(1)) b.route(d.x, d.top, d.z, d === M[1] || d === M[2] || d === M[3] ? 'walljump' : 'mantle');
    b.route(plank.x, mEnd.top, plank.z, 'run');
  });
  b.trigger('t.r6.master', 'master_r6_chimneys', { type: 'enter', min: v3(M[3].x - 1.5, M[3].top - 1, M[3].z - 1.5), max: v3(M[3].x + 1.5, M[3].top + 2, M[3].z + 1.5) });

  // ------------------------------------------------------------------ Section D: the Cable Cars
  b.zone('area', nC.x - 90, nTop.top - 2, nC.z - 90, nC.x + 90, nTop.top + 26, nC.z + 90, { key: 'area.r6.cars' });
  // The upper station on the Pillar, higher up and a quarter turn round.
  const upA = aBr - 30;
  const upY = nTop.top + 16;
  const up = polar(upA, R + 1);
  // the car departs from a platform just off the top deck, toward the upper station
  const nOut = polar(nTop.a, 1);
  const cs = { x: nC.x + nOut.x * (8.6 + 2 + 0.3 + 1.8), z: nC.z + nOut.z * (8.6 + 2 + 0.3 + 1.8) };
  const toUp = { x: up.x - cs.x, z: up.z - cs.z };
  const tul = Math.hypot(toUp.x, toUp.z);
  const ce = { x: up.x - (toUp.x / tul) * 6.4, z: up.z - (toUp.z / tul) * 6.4 };
  // The drive lever is in the car itself (as on the Ring Line): board, pull, ride. Nobody is
  // ever left watching the car leave without them.
  b.trigger('t.r6.cars', 'r6_cars', { type: 'interact', pos: v3(cs.x, nTop.top + 1, cs.z), radius: 2.0 }, { textKey: 'mem.r6.cars', delay: 1.0 });
  b.route(cs.x, nTop.top, cs.z, 'interact', { expect: 'r6_cars' });
  b.routeFlags = ['r6_cable', 'r6_cars'];
  // the car hangs from a cable between the stations
  const carYaw = radialYaw(nTop.a);
  b.mover(
    { kind: 'path', origin: v3(cs.x, nTop.top, cs.z), points: [v3(0, 0, 0), v3(ce.x - cs.x, upY - nTop.top, ce.z - cs.z)], segTime: [18], pause: 3.5, activeFlag: 'r6_cars' },
    () => {
      b.plat(0, 0, 0, 3.6, 3.6, 0.4, { mat: Mat.Metal, tint: RED, yaw: carYaw });
      b.decor('box', 1.2, 0.7, 1.2, 0.14, 1.4, 0.14, { mat: Mat.Brass, tint: BRASS });
      b.decor('box', 0, 2.6, 0, 3.6, 0.12, 3.6, { mat: Mat.Metal, tint: 0x7a2a24, yaw: carYaw });
      b.decor('box', 0, 3.6, 0, 0.12, 2.0, 0.12, { mat: Mat.Metal, tint: 0x3a3e44 });
      for (const [dx, dz] of [
        [-1.9, -1.5],
        [1.9, 1.5],
        [-1.9, 1.5],
        [1.9, -1.5],
      ]) b.decor('box', dx, 1.3, dz, 0.1, 2.6, 0.1, { mat: Mat.Metal, tint: 0x3a3e44 });
    },
  );
  b.cable(v3(cs.x, nTop.top + 4.6, cs.z), v3(ce.x, upY + 4.6, ce.z), 0.2, Mat.Metal, 0x2a2a2a);
  // the Pillar's upper station
  const upDeck = { x: up.x, z: up.z };
  b.plat(upDeck.x, upY, upDeck.z, 6, 5, 0.5, { mat: Mat.Concrete, tint: 0xd0ccc4, yaw: quantYaw(rad(upA)) });
  b.anchor('r6.cars', upDeck.x, upY, upDeck.z, 0, 'anchor.r6.cars');
  b.route(upDeck.x, upY, upDeck.z, 'ride', { note: 'ride the cable car back to the Pillar' });

  // ------------------------------------------------------------------ RISK: the cable walk
  // Up the bridgehead tower and along the top of the suspension cable itself: over the snap,
  // then a long drop onto the pier.
  const riskE = -1.9;
  const cableY = (r: number) => {
    const t = Math.abs(r - (t1 + t2) / 2) / ((t2 - t1) / 2);
    return bridgeY + 3 + 13 * t * t;
  };
  // a maintenance tower beside the bridgehead: ladder up its face, catwalk from its top
  const mt = { x: out.x * (t1 - 1.6) + side.x * (riskE - 1.5), z: out.z * (t1 - 1.6) + side.z * (riskE - 1.5) };
  const catY = bridgeY + 8;
  b.block(mt.x, bridgeY - 0.3, mt.z, 1.8, catY - bridgeY + 0.3, 1.8, { mat: Mat.Metal, tint: RED, yaw: radialYaw(aBr) });
  b.ladder(mt.x - out.x * 0.93, bridgeY, mt.z - out.z * 0.93, catY, v3(-out.x, 0, -out.z));
  const rA = (t1 + t2) / 2 - ((t2 - t1) / 2) * Math.sqrt(5 / 13);
  const rB = (t1 + t2) / 2 + ((t2 - t1) / 2) * Math.sqrt(5 / 13);
  const cat = (r: number) => ({ x: out.x * r + side.x * riskE, z: out.z * r + side.z * riskE });
  b.beamBetween(mt.x + out.x * 0.6, mt.z + out.z * 0.6, catY, cat(rA).x, cat(rA).z, catY, 0.6, { mat: Mat.Metal, tint: 0x5a5e62 });
  const cSteps = 10;
  for (let i = 0; i < cSteps; i++) {
    const ra = rA + ((rB - rA) * i) / cSteps;
    const rb = rA + ((rB - rA) * (i + 1)) / cSteps;
    const pa = cat(ra - 0.1);
    const pb = cat(rb + 0.1);
    b.beamBetween(pa.x, pa.z, cableY(ra - 0.1), pb.x, pb.z, cableY(rb + 0.1), 0.55, { mat: Mat.Metal, tint: 0x3a3e44 });
  }
  const catEnd = cat(rB + 3);
  b.plat(catEnd.x, catY, catEnd.z, 6, 0.8, 0.3, { mat: Mat.Metal, tint: 0x5a5e62, yaw: radialYaw(aBr) });
  b.branch('risk.r6.cable', 'risk', () => {
    b.route(head.x, bridgeY, head.z, 'run');
    b.route(mt.x - out.x * 1.8, bridgeY, mt.z - out.z * 1.8, 'run');
    b.route(mt.x, catY, mt.z, 'ladder');
    b.route(cat(rA).x, catY, cat(rA).z, 'run');
    for (let i = 1; i <= 4; i++) {
      const r = rA + ((rB - rA) * i) / 4;
      b.route(cat(r).x, cableY(r), cat(r).z, 'run');
    }
    b.route(catEnd.x, catY, catEnd.z, 'run');
    b.route(pier.x, bridgeY, pier.z, 'drop');
  });

  // ------------------------------------------------------------------ Section E: the Brass Rings
  b.zone('area', -140, upY - 2, -140, 140, upY + 24, 140, { key: 'area.r6.rings' });
  const E = helix(
    b,
    0,
    R + 1,
    0,
    -1,
    [
      { move: 'walk', len: 5, wid: 4, mat: Mat.Concrete, tint: 0xd0ccc4 },
      { move: 'tether', len: 4, wid: 3.4, mat: Mat.Stone, tint: 0xb8b0a4 },
      { move: 'climb', mat: Mat.Stone, tint: 0xb8b0a4 },
      { move: 'tether', len: 4, wid: 3.4, mat: Mat.Stone, tint: 0xb8b0a4 },
      { move: 'hop', mat: Mat.Metal, tint: STEEL },
      { move: 'line', len: 4, wid: 3, mat: Mat.Stone, tint: 0xb8b0a4 },
      { move: 'climb', mat: Mat.Stone, tint: 0xb8b0a4 },
      { move: 'tether', len: 5, wid: 4, mat: Mat.Stone, tint: 0xb8b0a4 },
      { move: 'walk', len: 5, wid: 4, mat: Mat.Concrete, tint: 0xd0ccc4 },
    ],
    { from: deck(upDeck.x, upDeck.z, upY, upA, 6), pillarR: PR, mat: Mat.Stone },
  );
  const lT = E[1];
  b.collect('l.tether', 'lesson', lT.x, lT.top + 1.3, lT.z, Ability.Tether);
  b.trigger('t.r6.hint.tether', 'hint_tether', { type: 'enter', min: v3(lT.x - 2.5, lT.top - 1, lT.z - 2.5), max: v3(lT.x + 2.5, lT.top + 3, lT.z + 2.5) }, { textKey: 'hint.tether' });
  b.collect('rec.r6.rings', 'record', E[3].x, E[3].top + 1.2, E[3].z);
  b.collect('e.r6.rings', 'echo', E[4].x, E[4].top - 30, E[4].z);
  b.collect('f12', 'fragment', E[6].x, E[6].top + 1.0, E[6].z);
  b.anchor('r6.rings', polar(E[5].a, R + 0.6).x, E[5].top, polar(E[5].a, R + 0.6).z, 0, 'anchor.r6.rings');
  const eTop = E[E.length - 1];

  // ------------------------------------------------------------------ Section F: the Wind Gate
  b.zone('area', -140, eTop.top - 2, -140, 140, eTop.top + 30, 140, { key: 'area.r6.windgate' });
  const F = helix(
    b,
    0,
    R + 1,
    0,
    -1,
    [
      { move: 'step', mat: Mat.Stone, tint: 0xb8b0a4 },
      { move: 'climb', mat: Mat.Stone, tint: 0xb8b0a4 },
      { move: 'walk', len: 8, wid: 4, mat: Mat.Concrete, tint: 0xd0ccc4 },
      { move: 'jump', mat: Mat.Metal, tint: STEEL },
      { move: 'scale', len: 4, wid: 4, mat: Mat.Stone, tint: 0xa89c8a },
      { move: 'bar', len: 4, wid: 3.4, mat: Mat.Metal, tint: STEEL },
      { move: 'tall', mat: Mat.Stone, tint: 0xb8b0a4 },
      { move: 'walk', len: 7, wid: 6, mat: Mat.Marble, tint: 0xe8e0d0 },
    ],
    { from: eTop, pillarR: PR, mat: Mat.Stone },
  );
  // a headwind blows through the long gallery toward the gate
  const wg = F[3];
  b.zone('wind', wg.x - 5, wg.top - 1, wg.z - 5, wg.x + 5, wg.top + 4, wg.z + 5, { dir: v3(-polar(wg.a - 90, 1).x, 0, -polar(wg.a - 90, 1).z), strength: 7, period: 3.5, phase: 1 });
  const gate = F[F.length - 1];
  for (const e of [-2.8, 2.8]) {
    const p = polar(gate.a, R + 1 + e);
    b.block(p.x, gate.top, p.z, 0.9, 7, 0.9, { mat: Mat.Marble, tint: 0xe8e0d0, yaw: quantYaw(rad(gate.a)), flags: SolidFlag.NoWallRun });
  }
  b.dbox(polar(gate.a, R + 1).x, gate.top + 7, polar(gate.a, R + 1).z, 1.2, 1.0, 7, { mat: Mat.Marble, tint: 0xe8e0d0, yaw: quantYaw(rad(gate.a)) });
  b.anchor('r6.windgate', polar(gate.a, R - 0.6).x, gate.top, polar(gate.a, R - 0.6).z, 0, 'anchor.r6.windgate');
  b.collect('f11', 'fragment', polar(gate.a, R + 1).x, gate.top + 1.2, polar(gate.a, R + 1).z);
  numeral(b, 11, polar(gate.a, PR + 0.06).x, gate.top + 3, polar(gate.a, PR + 0.06).z, rad(gate.a), 1.5);
  lamp(b, polar(gate.a, R + 1).x, gate.top + 6.2, polar(gate.a, R + 1).z, 0xfff0d0);
  // birds riding the thermals around the bridge
  b.decor('bird', along(80).x, bridgeY + 12, along(80).z, 20, 4, 20, {});

  // hanging cables from the city above, fading into the sky
  for (let i = 0; i < 16; i++) {
    const p = polar(i * 22.5 + 11, 58 + (i % 3) * 6);
    hangCable(b, p.x, y0 + 40 + (i % 4) * 20, p.z, y0 + 200, 0);
  }

  // ------------------------------------------------------------------ trial & daily
  b.trial({
    id: 'trial.r6',
    nameKey: 'trial.r6',
    start: v3(a0p.x, y0 + 0.05, a0p.z),
    startYaw: 0,
    gates: [
      { pos: v3(head.x, head.top + 1, head.z), r: 3.5 },
      { pos: v3(trig.x, bridgeY + 1, trig.z), r: 3 },
      { pos: v3(nTop.x, nTop.top + 1, nTop.z), r: 3 },
      { pos: v3(upDeck.x, upY + 1, upDeck.z), r: 4 },
      { pos: v3(eTop.x, eTop.top + 1, eTop.z), r: 3 },
    ],
    finish: { pos: v3(gate.x, gate.top + 1, gate.z), r: 3.5 },
    master: [{ pos: v3(M[2].x, M[2].top + 0.5, M[2].z), r: 2.5 }],
  });
  for (const d of [A[2], A[8], N[3], N[9], E[2], E[6], F[2], F[5]]) b.daily(d.x, d.top + 1, d.z);

  const topY = gate.top + 4;
  pillar(b, y0 - 1, topY + 1, PR, PR, 6);
  b.data.meta.topY = topY;
  return { data: b.build(), exit: { x: gate.x, y: gate.top, z: gate.z, a: gate.a } };
}
