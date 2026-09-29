import { v3 } from '../../math';
import { RegionBuilder, quantYaw } from '../builder';
import { hangCable, helix, lamp, numeral, pillar, polar, type HelixDeck } from '../kit';
import { Ability, Mat, SolidFlag, type RegionData } from '../types';
import type { Exit } from './r03_construction';

/**
 * REGION 09 — THE VOID
 * Above the storm, generations 2–4 found that the rock pulls where it wants. They built the
 * Turning Stair across walls and beneath ledges, and a tower that hangs downward from the
 * underside of an overhang. It is silent, and full of stars.
 *
 * Teaches: gravity shift (lesson) — touch marked stone and it becomes the floor.
 * Memory: reaching the top of the Inverted Tower (its lowest floor) lets you fall back into the
 * world; the Pivot turns when you pull its lever, and carries you across the dark.
 * Routes: SAFE the Turning Stair / RISK the stepping stones / MASTER the rings over the Pivot.
 */

const ATM = {
  skyTop: 0x06081a,
  skyHorizon: 0x262a48,
  fog: 0x14172a,
  fogDensity: 0.0014,
  sunColor: 0xc8d4ff,
  sunIntensity: 0.62,
  ambient: 0x3a3e5e,
  sunDir: v3(-0.35, 0.7, 0.4),
  weather: 4,
  cloudColor: 0x8a92b4,
  exposure: 0.96,
};

const PR = 24;
const OBS = 0x2a2c3a;
const STONE = 0x8a8ca0;
const GLYPH = 0x9ab8ff;
const rad = (d: number) => (d * Math.PI) / 180;
const arc = (m: number, r: number) => (m / r) * (180 / Math.PI);
const deck = (x: number, z: number, top: number, a: number, len: number): HelixDeck => ({ x, z, top, a, yaw: 0, len });
const SHIFT = SolidFlag.Shift | SolidFlag.NoWallRun;

export function region09(entry: Exit): { data: RegionData; exit: Exit } {
  const y0 = entry.y;
  const b = new RegionBuilder({ index: 8, id: 'void', baseY: y0 + 2, topY: y0 + 170, atmosphere: ATM, center: v3(0, 0, 0), radius: 160 });

  // A frame on the world grid (gravity walls must be grid-aligned): U is the grid axis nearest
  // the direction of travel, V the one nearest outward.
  const ea = rad(entry.a);
  const tu = { x: -Math.cos(ea), z: Math.sin(ea) };
  const U = Math.abs(tu.x) > Math.abs(tu.z) ? { x: Math.sign(tu.x), z: 0 } : { x: 0, z: Math.sign(tu.z) };
  const V = U.x !== 0 ? { x: 0, z: Math.sign(Math.cos(ea)) || 1 } : { x: Math.sign(Math.sin(ea)) || 1, z: 0 };
  const G = (u: number, v: number) => ({ x: entry.x + U.x * u + V.x * v, z: entry.z + U.z * u + V.z * v });
  /** Grid block: from (u0,v0) to (u1,v1), bottom y0, height h. */
  const gBlock = (u0: number, v0: number, u1: number, v1: number, yb: number, h: number, o: { mat?: Mat; tint?: number; flags?: number; tag?: string } = {}) => {
    const c = G((u0 + u1) / 2, (v0 + v1) / 2);
    const lu = Math.abs(u1 - u0);
    const lv = Math.abs(v1 - v0);
    const w = U.x !== 0 ? lu : lv;
    const d = U.x !== 0 ? lv : lu;
    return b.block(c.x, yb, c.z, w, h, d, { mat: o.mat ?? Mat.Stone, tint: o.tint ?? STONE, flags: o.flags, tag: o.tag, yaw: 0 });
  };
  const gZone = (kind: 'shift' | 'gravityReset', u0: number, v0: number, u1: number, v1: number, ylo: number, yhi: number, active = 0) => {
    const a = G(u0, v0);
    const c = G(u1, v1);
    b.zone(kind, a.x, ylo, a.z, c.x, yhi, c.z, { active });
  };
  const gRoute = (u: number, v: number, y: number, act: Parameters<RegionBuilder['route']>[3], extra: Parameters<RegionBuilder['route']>[4] = {}) => {
    const p = G(u, v);
    b.route(p.x, y, p.z, act, extra);
  };
  const glyphs = (u: number, v0: number, v1: number, y0g: number, y1g: number, faceU: number) => {
    // marked stone: plumb glyphs on the face
    const n = Math.max(1, Math.round((y1g - y0g) / 3.5));
    for (let k = 0; k < n; k++) {
      const p = G(u + faceU * 0.03, (v0 + v1) / 2);
      const yaw = Math.atan2(U.x * faceU, U.z * faceU);
      b.glyph('plumb', p.x, y0g + ((k + 0.5) * (y1g - y0g)) / n, p.z, 1.5, yaw, { tint: GLYPH });
    }
  };

  // ------------------------------------------------------------------ Section A: the Turning Stair
  b.zone('area', -160, y0 - 2, -160, 160, y0 + 34, 160, { key: 'area.r9.stair' });
  gBlock(3, -3, 10, 3, y0 - 1.5, 1.5, { mat: Mat.Stone, tint: STONE });
  gRoute(7, 0, y0, 'run');
  b.anchor('r9.stair', G(6, -1.5).x, y0, G(6, -1.5).z, 0, 'anchor.r9.stair', true);
  b.collect('l.gravity', 'lesson', G(7, 0).x, y0 + 1.3, G(7, 0).z, Ability.GravityShift);
  b.trigger('t.r9.hint.gravity', 'hint_gravity', { type: 'enter', min: v3(Math.min(G(4, -3).x, G(10, 3).x), y0 - 1, Math.min(G(4, -3).z, G(10, 3).z)), max: v3(Math.max(G(4, -3).x, G(10, 3).x), y0 + 3, Math.max(G(4, -3).z, G(10, 3).z)) }, { textKey: 'hint.gravity' });
  b.collect('rec.r9.stair', 'record', G(5, 2).x, y0 + 1.2, G(5, 2).z);
  numeral(b, 4, polar(entry.a, PR + 0.06).x, y0 + 3, polar(entry.a, PR + 0.06).z, ea, 1.5);
  // W1: a marked wall twelve metres high; its top is the next floor.
  const w1Top = y0 + 12;
  gBlock(10, -3, 16, 3, y0 - 1.5, w1Top - (y0 - 1.5), { mat: Mat.Obsidian, tint: OBS, flags: SHIFT });
  glyphs(10, -3, 3, y0 + 1, w1Top - 1, -1);
  gZone('shift', 3, -4, 11, 4, y0 - 1, w1Top + 1.5, 10);
  gZone('gravityReset', 10.2, -2.8, 16, 2.8, w1Top - 0.1, w1Top + 3.5);
  gRoute(13, 0, w1Top, 'shift');
  b.collect('f4', 'fragment', G(14.5, 2).x, w1Top + 1, G(14.5, 2).z);
  // a gap, a ledge, then W2: fourteen metres
  gBlock(18.5, -2, 22.5, 2, w1Top - 1.2, 1.2, { mat: Mat.Stone, tint: STONE });
  gRoute(20.5, 0, w1Top, 'jump');
  const w2Top = w1Top + 14;
  gBlock(22.5, -3, 28.5, 3, w1Top - 1.2, w2Top - (w1Top - 1.2), { mat: Mat.Obsidian, tint: OBS, flags: SHIFT });
  glyphs(22.5, -3, 3, w1Top + 1, w2Top - 1, -1);
  gZone('shift', 17.5, -4, 23.5, 4, w1Top - 1, w2Top + 1.5, 10);
  gZone('gravityReset', 22.7, -2.8, 28.5, 2.8, w2Top - 0.1, w2Top + 3.5);
  gRoute(25.5, 0, w2Top, 'shift');
  b.collect('e.r9.turn', 'echo', G(20, -6).x, w1Top - 8, G(20, -6).z);
  // Beneath the ledge: a marked overhang. Jump into it and walk under it, upside down.
  const ovB = w2Top + 3.0;
  gBlock(26, -3, 46, 3, ovB, 1.5, { mat: Mat.Obsidian, tint: OBS, flags: SHIFT });
  gZone('shift', 25, -4, 47, 4, w2Top - 1, ovB + 2, 12);
  gRoute(33, 0, ovB, 'shift', { frame: 1 });
  gRoute(42.5, 0, ovB, 'shift', { frame: 1 });
  // at the far end the pull lets go; you drop to a landing
  const p3Top = w2Top - 2;
  gZone('gravityReset', 43.8, -3, 46.5, 3, ovB - 2.6, ovB - 0.2);
  gBlock(42, -3, 52, 3, p3Top - 1.2, 1.2, { mat: Mat.Stone, tint: STONE });
  gRoute(45, 0, p3Top, 'drop');
  for (const u of [30, 38]) {
    const g = G(u, 0);
    b.glyph('plumb', g.x, ovB - 0.04, g.z, 2.2, 0, { tint: GLYPH, up: true });
  }

  // ------------------------------------------------------------------ Section B: the Inverted Tower
  b.zone('area', -160, p3Top - 30, -160, 160, p3Top + 6, 160, { key: 'area.r9.tower' });
  b.anchor('r9.tower', G(45, -1.5).x, p3Top, G(45, -1.5).z, 0, 'anchor.r9.tower');
  // The Root: a vast marked overhang; the tower hangs from its underside.
  const rootB = p3Top + 3.0;
  gBlock(48, -8, 76, 8, rootB, 2.5, { mat: Mat.Obsidian, tint: OBS, flags: SHIFT });
  gZone('shift', 47, -9, 77, 9, p3Top - 22, rootB + 3, 14);
  gRoute(51, 0, rootB, 'shift', { frame: 1 });
  // floors hanging below, each a storey further down (which is up, for you)
  const floors: { u: number; v: number; bot: number }[] = [
    { u: 58, v: 0, bot: rootB - 3 },
    { u: 62.2, v: 0, bot: rootB - 6 },
    { u: 62.2, v: 4.2, bot: rootB - 9 },
    { u: 58, v: 4.2, bot: rootB - 12 },
  ];
  for (const f of floors) {
    gBlock(f.u - 2, f.v - 2, f.u + 2, f.v + 2, f.bot, 0.6, { mat: Mat.Obsidian, tint: 0x34364a, flags: SHIFT });
    // hangers up to the floor above
    for (const [du, dv] of [
      [-1.8, -1.8],
      [1.8, 1.8],
      [-1.8, 1.8],
      [1.8, -1.8],
    ]) {
      const g = G(f.u + du, f.v + dv);
      b.dbox(g.x, f.bot + 0.6, g.z, 0.18, 2.4, 0.18, { mat: Mat.Metal, tint: 0x5a5e7a });
    }
    if (f !== floors[floors.length - 1]) gRoute(f.u, f.v, f.bot, 'shift', { frame: 1 });
  }
  // The record and the letter wait on the third floor, "above" you as you stand there.
  const f3 = floors[2];
  b.collect('rec.r9.tower', 'record', G(f3.u - 1.2, f3.v).x, f3.bot - 1.2, G(f3.u - 1.2, f3.v).z);
  b.collect('f3', 'fragment', G(f3.u + 1.2, f3.v + 1).x, f3.bot - 1.0, G(f3.u + 1.2, f3.v + 1).z);
  // The tower's top — its lowest floor. Standing there, the pull lets go: you fall into the Drift.
  const top = floors[3];
  const tp = G(top.u, top.v);
  b.trigger('t.r9.tower', 'r9_tower_top', { type: 'enter', min: v3(tp.x - 2.2, top.bot - 0.6, tp.z - 2.2), max: v3(tp.x + 2.2, top.bot + 0.3, tp.z + 2.2) });
  gZone('gravityReset', top.u - 2, top.v - 2, top.u + 2, top.v + 2, top.bot - 3, top.bot - 0.3);
  b.collect('e.r9.pell', 'echo', tp.x, top.bot - 7, tp.z);

  // ------------------------------------------------------------------ Section C: the Drift
  const driftTop = top.bot - 13;
  b.zone('area', -160, driftTop - 4, -160, 160, driftTop + 24, 160, { key: 'area.r9.drift' });
  const dR = Math.hypot(tp.x, tp.z);
  const dA = Math.atan2(tp.x, tp.z) * (180 / Math.PI);
  const D0 = deck(tp.x, tp.z, driftTop, dA, 8);
  b.cyl(tp.x, driftTop - 3, tp.z, 5.2, 3, { mat: Mat.Rock, tint: 0x5a5c70 });
  b.decor('cone', tp.x, driftTop - 3, tp.z, 5.2, -6, 0, { mat: Mat.Rock, tint: 0x4a4c60 });
  b.route(tp.x, driftTop, tp.z, 'drop', { note: 'the tower lets go of you' });
  b.anchor('r9.drift', tp.x + 1.5, driftTop, tp.z + 1.5, 0, 'anchor.r9.drift');
  const D = helix(
    b,
    0,
    dR,
    0,
    -1,
    [
      { move: 'jump', len: 3, wid: 3, mat: Mat.Rock, tint: 0x5a5c70 },
      { move: 'tether', len: 4, wid: 4, mat: Mat.Rock, tint: 0x5a5c70 },
      { move: 'hop', len: 3, wid: 3, mat: Mat.Rock, tint: 0x6a6c80 },
      { move: 'climb', len: 3, wid: 3, mat: Mat.Rock, tint: 0x5a5c70 },
      { move: 'bar', len: 4, wid: 3.4, mat: Mat.Rock, tint: 0x6a6c80 },
      { move: 'tall', len: 3, wid: 3, mat: Mat.Rock, tint: 0x5a5c70 },
      { move: 'long', len: 3, wid: 3, mat: Mat.Rock, tint: 0x6a6c80 },
      { move: 'climb', len: 4, wid: 4, mat: Mat.Rock, tint: 0x5a5c70 },
      { move: 'walk', len: 5, wid: 5, mat: Mat.Rock, tint: 0x6a6c80 },
    ],
    { from: D0, mat: Mat.Rock },
  );
  // every island has a stone keel beneath it
  for (const d of D.slice(1)) b.decor('cone', d.x, d.top - 0.25, d.z, d.len * 0.55, -(2 + d.len), 0, { mat: Mat.Rock, tint: 0x4a4c60 });
  const dEnd = D[D.length - 1];
  numeral(b, 3, polar(dEnd.a, PR + 0.06).x, dEnd.top + 2.5, polar(dEnd.a, PR + 0.06).z, rad(dEnd.a), 1.5);

  // ------------------------------------------------------------------ Section D: the Pivot
  b.zone('area', -160, dEnd.top - 4, -160, 160, dEnd.top + 20, 160, { key: 'area.r9.pivot' });
  const armLen = 12;
  const pvA = dEnd.a - arc(dEnd.len / 2 + 0.3 + armLen, dR);
  const PV = polar(pvA, dR);
  b.cyl(PV.x, dEnd.top - 30, PV.z, 1.2, 29.4, { mat: Mat.Obsidian, tint: OBS, flags: SolidFlag.NoWallRun });
  const toNear = { x: dEnd.x - PV.x, z: dEnd.z - PV.z };
  const tnl = Math.hypot(toNear.x, toNear.z);
  const nearDir = { x: toNear.x / tnl, z: toNear.z / tnl };
  const armYaw = quantYaw(Math.atan2(-nearDir.z, nearDir.x));
  b.mover({ kind: 'transition', origin: v3(PV.x, dEnd.top, PV.z), flag: 'r9_pivot', toYaw: Math.PI, dur: 9 }, () => {
    b.cyl(0, -0.5, 0, 1.6, 0.5, { mat: Mat.Obsidian, tint: OBS });
    b.plat(nearDir.x * (armLen / 2 + 0.6), 0, nearDir.z * (armLen / 2 + 0.6), armLen - 1, 2.4, 0.5, { mat: Mat.Stone, tint: STONE, yaw: armYaw });
    b.decor('box', nearDir.x * (armLen - 0.4), 0.7, nearDir.z * (armLen - 0.4), 0.2, 1.4, 0.2, { mat: Mat.Brass, tint: 0xd8b04a });
  });
  const lever = { x: PV.x + nearDir.x * (armLen - 0.4), z: PV.z + nearDir.z * (armLen - 0.4) };
  b.trigger('t.r9.pivot', 'r9_pivot', { type: 'interact', pos: v3(lever.x, dEnd.top + 1, lever.z), radius: 2.2 }, { textKey: 'mem.r9.pivot', delay: 0.6 });
  b.route(PV.x + nearDir.x * (armLen - 1.6), dEnd.top, PV.z + nearDir.z * (armLen - 1.6), 'interact', { expect: 'r9_pivot' });
  b.routeFlags = ['r9_tower_top', 'r9_pivot'];
  const farTip = { x: PV.x - nearDir.x * (armLen - 1.6), z: PV.z - nearDir.z * (armLen - 1.6) };
  b.route(farTip.x, dEnd.top, farTip.z, 'wait', { note: 'the Pivot turns' });
  b.anchor('r9.pivot', dEnd.x, dEnd.top, dEnd.z, 0, 'anchor.r9.pivot');

  // ------------------------------------------------------------------ Section E: the Silence
  const s0 = { x: PV.x - nearDir.x * (armLen + 0.6 + 2.5), z: PV.z - nearDir.z * (armLen + 0.6 + 2.5) };
  const s0A = Math.atan2(s0.x, s0.z) * (180 / Math.PI);
  b.zone('area', -160, dEnd.top - 2, -160, 160, dEnd.top + 30, 160, { key: 'area.r9.silence' });
  b.plat(s0.x, dEnd.top, s0.z, 5, 5, 0.6, { mat: Mat.Marble, tint: 0xd0d0dc, yaw: armYaw });
  b.route(s0.x, dEnd.top, s0.z, 'run');
  const S = helix(
    b,
    0,
    Math.hypot(s0.x, s0.z),
    0,
    -1,
    [
      { move: 'climb', len: 3, wid: 3, mat: Mat.Marble, tint: 0xd0d0dc },
      { move: 'jump', len: 3, wid: 3, mat: Mat.Marble, tint: 0xc0c0cc },
      { move: 'tall', len: 3, wid: 3, mat: Mat.Marble, tint: 0xd0d0dc },
      { move: 'chimney', len: 3, wid: 3, mat: Mat.Marble, tint: 0xb0b0bc },
      { move: 'hop', len: 3, wid: 3, mat: Mat.Marble, tint: 0xd0d0dc },
      { move: 'climb', len: 4, wid: 4, mat: Mat.Marble, tint: 0xc0c0cc },
      { move: 'walk', len: 7, wid: 6, mat: Mat.Marble, tint: 0xe0e0ea },
    ],
    { from: deck(s0.x, s0.z, dEnd.top, s0A, 5), mat: Mat.Marble },
  );
  const sTop = S[S.length - 1];
  b.anchor('r9.silence', polar(sTop.a, Math.hypot(sTop.x, sTop.z) - 1.8).x, sTop.top, polar(sTop.a, Math.hypot(sTop.x, sTop.z) - 1.8).z, 0, 'anchor.r9.silence');
  b.collect('f2', 'fragment', S[5].x, S[5].top + 1, S[5].z);
  b.collect('e.r9.silence', 'echo', S[3].x, S[3].top - 20, S[3].z);
  numeral(b, 2, polar(sTop.a, PR + 0.06).x, sTop.top + 2.5, polar(sTop.a, PR + 0.06).z, rad(sTop.a), 1.5);
  lamp(b, sTop.x, sTop.top + 3, sTop.z, 0xc8d4ff);

  // ------------------------------------------------------------------ RISK: the stepping stones
  // Skip the Inverted Tower: small floating stones from the landing down and out to the Drift.
  const stones: { x: number; z: number; y: number }[] = [];
  const p3 = G(45, 0);
  // leave the landing from its outer side, well clear of it
  const r0p = G(45, -5.5);
  const n = Math.max(4, Math.ceil(Math.hypot(D[2].x - r0p.x, D[2].z - r0p.z) / 4.2));
  for (let i = 0; i < n; i++) {
    const t = i / n;
    const x = r0p.x + (D[2].x - r0p.x) * t;
    const z = r0p.z + (D[2].z - r0p.z) * t;
    const y = p3Top - 1.2 + (D[2].top - (p3Top - 1.2)) * t;
    b.plat(x, y, z, 1.6, 1.6, 0.4, { mat: Mat.Rock, tint: 0x6a6c80 });
    stones.push({ x, z, y });
  }
  b.branch('risk.r9.stones', 'risk', () => {
    b.route(p3.x, p3Top, p3.z, 'run');
    for (const st of stones) b.route(st.x, st.y, st.z, 'jump');
    b.route(D[2].x, D[2].top, D[2].z, 'jump');
  });

  // ------------------------------------------------------------------ MASTER: rings over the Pivot
  for (const t of [0.34, 0.68]) {
    const p = { x: dEnd.x + (s0.x - dEnd.x) * t, z: dEnd.z + (s0.z - dEnd.z) * t };
    b.hook(p.x, dEnd.top + 9, p.z);
    b.cable(v3(p.x, dEnd.top + 9, p.z), v3(p.x, dEnd.top + 40, p.z), 0, Mat.Brass, 0x9a7a3a);
  }
  b.branch('master.r9.rings', 'master', () => {
    b.route(dEnd.x, dEnd.top, dEnd.z, 'run');
    b.route(s0.x, dEnd.top, s0.z, 'tether');
  });
  b.trigger('t.r9.master', 'master_r9_rings', { type: 'enter', min: v3(s0.x - 2.5, dEnd.top - 0.5, s0.z - 2.5), max: v3(s0.x + 2.5, dEnd.top + 3, s0.z + 2.5) });

  // drifting stones and far lights in the dark
  for (let i = 0; i < 18; i++) {
    const p = polar(i * 20 + 7, 80 + (i % 4) * 12);
    const y = y0 + 10 + ((i * 17) % 50);
    b.decor('sphere', p.x, y, p.z, 1.5 + (i % 3), 0, 0, { mat: Mat.Rock, tint: 0x4a4c60 });
  }
  hangCable(b, entry.x, y0 + 60, entry.z, y0 + 160, 0);

  // ------------------------------------------------------------------ trial & daily
  b.trial({
    id: 'trial.r9',
    nameKey: 'trial.r9',
    start: v3(G(7, 0).x, y0 + 0.05, G(7, 0).z),
    startYaw: 0,
    gates: [
      { pos: v3(G(13, 0).x, w1Top + 1, G(13, 0).z), r: 3 },
      { pos: v3(G(25.5, 0).x, w2Top + 1, G(25.5, 0).z), r: 3 },
      { pos: v3(G(45, 0).x, p3Top + 1, G(45, 0).z), r: 3 },
      { pos: v3(tp.x, driftTop + 1, tp.z), r: 4 },
      { pos: v3(dEnd.x, dEnd.top + 1, dEnd.z), r: 3 },
    ],
    finish: { pos: v3(sTop.x, sTop.top + 1, sTop.z), r: 4 },
    master: [{ pos: v3((dEnd.x + s0.x) / 2, dEnd.top + 4, (dEnd.z + s0.z) / 2), r: 6 }],
  });
  for (const d of [D[2], D[5], S[2], S[5]]) b.daily(d.x, d.top + 1, d.z);
  b.daily(G(13, 0).x, w1Top + 1, G(13, 0).z);
  b.daily(G(25.5, 0).x, w2Top + 1, G(25.5, 0).z);

  const topY = sTop.top + 4;
  pillar(b, y0 - 1, topY + 1, PR, PR, 9);
  b.data.meta.topY = topY;
  return { data: b.build(), exit: { x: sTop.x, y: sTop.top, z: sTop.z, a: sTop.a } };
}
