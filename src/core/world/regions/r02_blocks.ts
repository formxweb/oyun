import { datan2, dcos, dsin, v3 } from '../../math';
import { RegionBuilder, quantYaw } from '../builder';
import { facadeRot, hangCable, helix, lamp, numeral, pillar, polar, type HelixStep } from '../kit';
import { Ability, Mat, SolidFlag, type RegionData } from '../types';

/**
 * REGION 02 — THE BLOCKS (100–330 m)
 * Four generations of apartments stacked while families waited for the floors below.
 * A street-canyon ring runs between the Pillar and a ring of stacked towers; the climb
 * threads balconies, fire escapes, washing lines and rooftops.
 *
 * Teaches: vault (lesson), ledge grab (lesson), rope traversal (lesson).
 * Memory: the courtyard awning tears on a fall (secret apartment); the Stacked Tower's top
 * settles when you stand on it (new balcony alignment); the Cistern valve drains the tank.
 * Routes: SAFE fire escapes and balconies / RISK washing lines over the canyon /
 * MASTER the AC-unit ladder up the Stacked Tower.
 */

const ATM = {
  skyTop: 0x4d86c8,
  skyHorizon: 0xe9d9b8,
  fog: 0xd8cbb0,
  fogDensity: 0.0016,
  sunColor: 0xfff2dc,
  sunIntensity: 1.1,
  ambient: 0x7d705c,
  sunDir: v3(0.45, 0.6, 0.35),
  weather: 1,
  cloudColor: 0xfffaf0,
  exposure: 1.0,
};

const PR = 38;
const WALLS = [0xc9a88a, 0xb8826a, 0xd6c3a0, 0x9a6a58, 0xcdb99a, 0xa87c62, 0xe0cfb0, 0x8a6a5a];

const rad = (deg: number) => (deg * Math.PI) / 180;

export function region02(gate: { x: number; y: number; z: number }): { data: RegionData; exit: { x: number; y: number; z: number; a: number } } {
  const b = new RegionBuilder({ index: 1, id: 'blocks', baseY: 100, topY: 330, atmosphere: ATM, center: v3(0, 0, 0), radius: 150 });

  // ------------------------------------------------------------------ the Undercroft (foundation)
  // A heavy slab ring hung from the towers above; the Underside Gate opens through it.
  const hx0 = gate.x - 1.7;
  const hx1 = gate.x + 1.7;
  const hz0 = gate.z - 1.7;
  const hz1 = gate.z + 1.7;
  const slab = { mat: Mat.Concrete, tint: 0x9c9384 };
  b.aabb(-96, 100, -96, hx0, 104, 96, slab);
  b.aabb(hx1, 100, -96, 96, 104, 96, slab);
  b.aabb(hx0, 100, -96, hx1, 104, hz0, slab);
  b.aabb(hx0, 100, hz1, hx1, 104, 96, slab);
  // underside ribs (seen from Lowmark)
  for (let i = -3; i <= 3; i++) {
    b.dbox(i * 26, 98.6, 0, 1.6, 1.4, 190, { mat: Mat.Concrete, tint: 0x7f776a });
    b.dbox(0, 98.6, i * 26, 190, 1.4, 1.6, { mat: Mat.Concrete, tint: 0x7f776a });
  }
  // The builders' sign painted under the foundation, facing the ground: visible from Lowmark.
  b.decor('glyph', 0, 99.95, 60, 14, 14, -1, { key: 'plumb', tint: 0xf2e6c8, mat: Mat.Paint });
  b.zone('area', -100, 103, -100, 100, 118, 100, { key: 'area.r2.undercroft' });
  b.spawn(gate.x + 1.2, 104.05, gate.z, 0);
  b.anchor('r2.undercroft', gate.x + 2.6, 104, gate.z + 2.2, 0, 'anchor.r2.undercroft', true);
  b.route(gate.x, 104, gate.z, 'ladder');
  numeral(b, 29, polar(236, PR + 0.06).x, 107, polar(236, PR + 0.06).z, rad(236), 1.4);

  // ------------------------------------------------------------------ the tower ring
  // Stacked apartment towers around the canyon. Each is several blocks set slightly askew,
  // because each was lowered into place separately.
  const towers: { a: number; r: number; segs: [number, number, number, number][] }[] = [
    { a: 200, r: 74, segs: [[18, 16, 22, 0], [16, 15, 20, 4], [22, 14, 18, -3], [20, 13, 17, 6]] },
    { a: 228, r: 78, segs: [[14, 18, 16, 0], [24, 16, 15, -5], [18, 15, 14, 3]] },
    { a: 256, r: 72, segs: [[26, 16, 20, 0], [20, 14, 18, 5], [30, 14, 16, -2], [28, 12, 14, 4]] },
    { a: 284, r: 76, segs: [[16, 20, 16, 0], [18, 18, 15, -4], [22, 16, 14, 2], [18, 15, 13, -6]] },
    { a: 312, r: 74, segs: [[20, 15, 20, 0], [26, 14, 18, 3], [34, 13, 16, -3], [30, 12, 15, 5]] },
    { a: 340, r: 78, segs: [[22, 17, 17, 0], [22, 16, 16, -4], [26, 15, 15, 4], [34, 14, 14, -2]] },
    { a: 8, r: 74, segs: [[24, 16, 18, 0], [28, 15, 17, 5], [34, 14, 16, -4], [36, 13, 14, 2]] },
    { a: 36, r: 78, segs: [[30, 18, 16, 0], [26, 16, 15, -3], [34, 14, 14, 5], [30, 13, 13, -4]] },
    { a: 64, r: 74, segs: [[26, 15, 20, 0], [30, 14, 18, 4], [30, 13, 17, -3], [36, 12, 15, 2]] },
    { a: 92, r: 76, segs: [[28, 18, 16, 0], [30, 16, 15, -5], [34, 15, 14, 3], [34, 14, 13, -2]] },
    { a: 120, r: 74, segs: [[24, 16, 18, 0], [30, 15, 17, 3], [36, 14, 16, -4], [34, 13, 14, 5]] },
    { a: 150, r: 78, segs: [[20, 17, 17, 0], [26, 16, 16, 4], [30, 15, 15, -3], [36, 14, 14, 2]] },
    { a: 176, r: 72, segs: [[16, 16, 18, 0], [22, 15, 16, -3], [26, 14, 15, 4], [32, 13, 14, -5]] },
  ];
  towers.forEach((tw, ti) => {
    let y = 104;
    const p = polar(tw.a, tw.r);
    tw.segs.forEach(([h, w, d, rot], si) => {
      const yaw = quantYaw(rad(tw.a + rot));
      const tint = WALLS[(ti * 3 + si) % WALLS.length];
      facadeRot(b, p.x, y, p.z, w, h, d, yaw, tint, si % 2 ? Mat.Brick : Mat.Plaster, (ti + si) % 3 === 0 ? 0.04 : 0.015);
      y += h;
    });
    // rooftop clutter: water tank, antenna
    b.cyl(p.x + 2, y, p.z - 2, 1.6, 3.2, { mat: Mat.Wood, tint: 0x7a5a3c });
    b.decor('cone', p.x + 2, y + 3.2, p.z - 2, 1.8, 1.2, 0, { mat: Mat.Metal, tint: 0x5a5a5a });
    b.dbox(p.x - 3, y, p.z + 2, 0.1, 6, 0.1, { mat: Mat.Metal, tint: 0x444444 });
    hangCable(b, p.x, y, p.z, 330 + 8, 0);
  });

  // Washing lines across the canyon (decor), strung pillar-side to towers.
  for (let i = 0; i < 26; i++) {
    const a = i * 13.8 + 5;
    const y = 112 + ((i * 37) % 200);
    const inner = polar(a, PR + 0.5);
    const outer = polar(a + 4, 64);
    b.decor('laundry', inner.x, y, inner.z, 0, 0, 0, { q: v3(outer.x, y - 0.8, outer.z) });
  }

  // ------------------------------------------------------------------ Section A: Undercroft street (vault lesson)
  // A lane across the slab toward the courtyard, crossed by low walls, carts and railings.
  b.collect('l.vault', 'lesson', gate.x + 6, 105.3, gate.z - 3.5, Ability.Vault);
  const laneA = 243;
  for (let i = 0; i < 5; i++) {
    const p = polar(laneA - i * 5.5, 50);
    const yaw = quantYaw(rad(laneA - i * 5.5));
    if (i % 2 === 0) b.block(p.x, 104, p.z, 0.4, 1.0, 5, { mat: Mat.Brick, tint: 0x9a6a58, yaw: quantYaw(yaw + Math.PI / 2) });
    else b.block(p.x, 104, p.z, 1.2, 0.9, 1.8, { mat: Mat.Wood, tint: 0x7a5a3c, yaw });
  }
  b.trigger('t.r2.hint.vault', 'hint_vault', { type: 'enter', min: v3(gate.x - 4, 103, gate.z - 8), max: v3(gate.x + 8, 108, gate.z + 4) }, { textKey: 'hint.vault' });

  // ------------------------------------------------------------------ Section B: Washing-Line Court
  // Balconies and fire escapes spiral up between the Pillar and the towers.
  b.zone('area', -100, 118, -100, 100, 160, 100, { key: 'area.r2.courtyard' });
  const secB: HelixStep[] = [
    { move: 'start', len: 4, wid: 3, mat: Mat.Concrete, tint: 0xa89c88 },
    { move: 'hop', mat: Mat.Metal, tint: 0x4a5058 },
    { move: 'climb', mat: Mat.Plaster, tint: 0xcdb99a },
    { move: 'step', mat: Mat.Metal, tint: 0x4a5058 },
    { move: 'climb', mat: Mat.Plaster, tint: 0xd6c3a0 },
    { move: 'jump', mat: Mat.Plaster, tint: 0xc9a88a },
    { move: 'ramp', mat: Mat.Metal, tint: 0x4a5058 },
    { move: 'climb', mat: Mat.Brick, tint: 0x9a6a58 },
    { move: 'hop', mat: Mat.Concrete, tint: 0xa89c88, len: 4, wid: 3.4 },
  ];
  const b1 = helix(b, laneA - 32, 52, 104.3, -1, secB, { pillarR: PR, mat: Mat.Plaster });
  railings(b, b1);
  // Ledge lesson before the first tall wall.
  const ledgeSpot = b1[b1.length - 1];
  b.collect('l.ledge', 'lesson', ledgeSpot.x, ledgeSpot.top + 1.3, ledgeSpot.z, Ability.LedgeGrab);
  b.anchor('r2.courtyard', polar(ledgeSpot.a, 50.5).x, ledgeSpot.top, polar(ledgeSpot.a, 50.5).z, 0, 'anchor.r2.courtyard');
  const secB2: HelixStep[] = [
    { move: 'tall', mat: Mat.Brick, tint: 0xb8826a },
    { move: 'hop', mat: Mat.Plaster, tint: 0xe0cfb0 },
    { move: 'tall', mat: Mat.Plaster, tint: 0xcdb99a },
    { move: 'jump', mat: Mat.Metal, tint: 0x4a5058 },
    { move: 'ladder', mat: Mat.Concrete, tint: 0xa89c88 },
    { move: 'hop', mat: Mat.Plaster, tint: 0xd6c3a0 },
    { move: 'tall', mat: Mat.Brick, tint: 0x8a6a5a },
    { move: 'walk', len: 4, wid: 3.2, mat: Mat.Concrete, tint: 0xa89c88 },
  ];
  const b2 = helix(b, ledgeSpot.a - (4.5 / 52) * (180 / Math.PI), 52, ledgeSpot.top, -1, secB2, { pillarR: PR, mat: Mat.Plaster, route: true });
  railings(b, b2);
  b.trigger('t.r2.hint.ledge', 'hint_ledge', { type: 'enter', min: v3(ledgeSpot.x - 3, ledgeSpot.top - 1, ledgeSpot.z - 3), max: v3(ledgeSpot.x + 3, ledgeSpot.top + 3, ledgeSpot.z + 3) }, { textKey: 'hint.ledge' });

  // Rope lesson and the first washing line across a courtyard gap.
  const r0 = b2[b2.length - 1];
  b.collect('l.rope', 'lesson', r0.x, r0.top + 1.3, r0.z, Ability.Rope);
  const lineEndA = r0.a - (14 / 52) * (180 / Math.PI);
  const lineEnd = polar(lineEndA, 52);
  const lineStart = polar(r0.a - (2.3 / 52) * (180 / Math.PI), 52);
  b.rope('line', v3(lineStart.x, r0.top + 2.6, lineStart.z), v3(lineEnd.x, r0.top + 2.3, lineEnd.z));
  b.decor('laundry', lineStart.x, r0.top + 2.6, lineStart.z, 0, 0, 0, { q: v3(lineEnd.x, r0.top + 2.3, lineEnd.z) });
  const afterLine = polar(lineEndA - (2.2 / 52) * (180 / Math.PI), 52);
  b.plat(afterLine.x, r0.top, afterLine.z, 4, 3.2, 0.3, { mat: Mat.Concrete, tint: 0xa89c88, yaw: quantYaw(rad(lineEndA)) });
  b.route(afterLine.x, r0.top, afterLine.z, 'rope');
  b.trigger('t.r2.hint.rope', 'hint_rope', { type: 'enter', min: v3(r0.x - 3, r0.top - 1, r0.z - 3), max: v3(r0.x + 3, r0.top + 3, r0.z + 3) }, { textKey: 'hint.rope' });

  // The awning below the washing line: falling onto it tears it and reveals a window.
  const lineMidA = (r0.a - (2.3 / 52) * (180 / Math.PI) + lineEndA) / 2;
  const awn = polar(lineMidA, 52.5);
  b.unless('r2_awning', () => {
    b.plat(awn.x, 108.5, awn.z, 8, 8, 0.2, { mat: Mat.Cloth, tint: 0xc0442a, flags: SolidFlag.Bounce | SolidFlag.Soft, bounce: 11, tag: 'r2_awning', yaw: quantYaw(rad(lineMidA)) });
    for (const sgn of [-1, 1]) b.dbox(awn.x + sgn * 3.6, 104, awn.z, 0.15, 4.5, 0.15, { mat: Mat.Metal, tint: 0x444444 });
  });
  b.trigger('t.r2.awning', 'r2_awning', { type: 'land', tag: 'r2_awning', minFall: 8 }, { textKey: 'mem.r2.awning', delay: 0.6 });
  b.collect('e.r2.awning', 'echo', awn.x, 118, awn.z);
  // The hidden apartment behind the torn awning: generation 29's letter.
  const apt = polar(lineMidA, 60.5);
  b.when('r2_awning', () => {
    b.plat(apt.x, 104.6, apt.z, 5, 5, 0.6, { mat: Mat.Wood, tint: 0x8a6a46 });
    b.decor('box', apt.x, 106, apt.z, 1.6, 0.8, 0.8, { mat: Mat.Wood, tint: 0x6a4e34 });
    b.collect('f29', 'fragment', apt.x, 105.8, apt.z);
  });

  // ------------------------------------------------------------------ Section C: the Stacked Tower
  b.zone('area', -100, 160, -100, 100, 232, 100, { key: 'area.r2.stack' });
  const secC: HelixStep[] = [
    { move: 'hop', mat: Mat.Metal, tint: 0x4a5058 },
    { move: 'tall', mat: Mat.Plaster, tint: 0xcdb99a },
    { move: 'jump', mat: Mat.Plaster, tint: 0xe0cfb0 },
    { move: 'climb', mat: Mat.Metal, tint: 0x4a5058 },
    { move: 'ladder', mat: Mat.Concrete },
    { move: 'hop', mat: Mat.Brick, tint: 0x9a6a58 },
    { move: 'long', mat: Mat.Plaster, tint: 0xd6c3a0 },
    { move: 'tall', mat: Mat.Plaster, tint: 0xc9a88a },
    { move: 'climb', mat: Mat.Metal, tint: 0x4a5058 },
    { move: 'ramp', mat: Mat.Metal, tint: 0x4a5058 },
    { move: 'jump', mat: Mat.Plaster, tint: 0xb8826a },
    { move: 'tall', mat: Mat.Brick, tint: 0x8a6a5a },
    { move: 'walk', len: 5, wid: 3.4, mat: Mat.Concrete, tint: 0xa89c88 },
    { move: 'ladder', mat: Mat.Concrete },
    { move: 'hop', mat: Mat.Plaster, tint: 0xcdb99a },
    { move: 'tall', mat: Mat.Plaster, tint: 0xd6c3a0 },
    { move: 'jump', mat: Mat.Metal, tint: 0x4a5058 },
    { move: 'climb', mat: Mat.Brick, tint: 0x9a6a58 },
    { move: 'tall', mat: Mat.Plaster, tint: 0xe0cfb0 },
    { move: 'ramp', mat: Mat.Metal, tint: 0x4a5058 },
    { move: 'ladder', mat: Mat.Concrete },
    { move: 'walk', len: 5, wid: 3.4, mat: Mat.Concrete, tint: 0xa89c88 },
  ];
  const cAng = lineEndA - (4.4 / 52) * (180 / Math.PI) - (4 / 52) * (180 / Math.PI);
  const c1 = helix(b, cAng, 52, r0.top + 0.3, -1, secC, { pillarR: PR, mat: Mat.Plaster });
  railings(b, c1);
  const stackBal = c1[12];
  b.anchor('r2.stack', polar(stackBal.a, 50.6).x, stackBal.top, polar(stackBal.a, 50.6).z, 0, 'anchor.r2.stack');
  lamp(b, stackBal.x, stackBal.top + 2.4, stackBal.z);
  numeral(b, 28, polar(stackBal.a, PR + 0.06).x, stackBal.top + 2, polar(stackBal.a, PR + 0.06).z, rad(stackBal.a), 1.3);
  // The kitchen door: a balcony apartment with generations of height marks (record + letter).
  const kd = c1[6];
  const kdOut = polar(kd.a, 57.5);
  b.plat(kdOut.x, kd.top - 0.2, kdOut.z, 3.4, 4, 0.3, { mat: Mat.Tile, tint: 0xb89a78, yaw: quantYaw(rad(kd.a)) });
  b.dbox(kdOut.x, kd.top - 0.2, kdOut.z, 0.2, 2.2, 1.0, { mat: Mat.Wood, tint: 0xe8dcc0, yaw: quantYaw(rad(kd.a)) });
  b.collect('rec.r2.doorframe', 'record', kdOut.x, kd.top + 1.1, kdOut.z);
  b.collect('f27', 'fragment', kdOut.x + 0.8, kd.top + 0.9, kdOut.z + 0.8);

  // MASTER: the AC-unit ladder straight up the Stacked Tower's inner face.
  const mA = c1[3];
  let my = mA.top + 2.0;
  let k = 0;
  const mEnd = c1[11];
  const acs: { x: number; y: number; z: number }[] = [];
  while (my < mEnd.top - 1) {
    const p = polar(mA.a - 3 + (k % 2 ? 1.4 : -1.4), 58.5);
    b.block(p.x, my - 0.55, p.z, 0.9, 0.55, 0.7, { mat: Mat.Metal, tint: 0xb8b8b0, yaw: quantYaw(rad(mA.a)) });
    b.dbox(p.x, my - 0.55, p.z, 0.7, 0.4, 0.05, { mat: Mat.Metal, tint: 0x333333, yaw: quantYaw(rad(mA.a)) });
    acs.push({ x: p.x, y: my, z: p.z });
    my += 2.05;
    k++;
  }
  // the column tops out on a roof ledge; a scaffold plank runs straight back to the balcony path
  const acTop = polar(mA.a - 3, 58.5);
  b.plat(acTop.x, mEnd.top, acTop.z, 2.4, 2.4, 0.3, { mat: Mat.Metal, tint: 0x4a5058, yaw: quantYaw(rad(mA.a)) });
  const plankDx = mEnd.x - acTop.x;
  const plankDz = mEnd.z - acTop.z;
  const plankLen = Math.hypot(plankDx, plankDz);
  b.plat((acTop.x + mEnd.x) / 2, mEnd.top, (acTop.z + mEnd.z) / 2, plankLen - 1.2, 0.55, 0.25, { mat: Mat.Wood, tint: 0x9a7e56, yaw: quantYaw(datan2(-plankDz, plankDx)) });
  b.branch('master.r2.ac', 'master', () => {
    b.route(mA.x, mA.top, mA.z, 'run');
    for (const p of acs) b.route(p.x, p.y, p.z, 'mantle');
    b.route(acTop.x, mEnd.top, acTop.z, 'mantle');
    b.route(mEnd.x, mEnd.top, mEnd.z, 'run');
  });
  b.trigger('t.r2.master', 'master_r2_ac', { type: 'enter', min: v3(polar(mA.a - 3, 58.5).x - 4, mEnd.top - 3, polar(mA.a - 3, 58.5).z - 4), max: v3(polar(mA.a - 3, 58.5).x + 4, mEnd.top + 2, polar(mA.a - 3, 58.5).z + 4) });

  // The top block of the Stacked Tower settles when you stand on it: it slides and sinks
  // toward the rooftops, closing a gap that was too wide to jump (Vertical Memory).
  const top = c1[c1.length - 1];
  const settleA = top.a - (6 / 52) * (180 / Math.PI);
  const settleP = polar(settleA, 53);
  const dAng = settleA - (9.5 / 54) * (180 / Math.PI);
  const d0 = polar(dAng, 54);
  const tdx = d0.x - settleP.x;
  const tdz = d0.z - settleP.z;
  const tl = Math.hypot(tdx, tdz);
  const slide = 2.6;
  b.mover(
    {
      kind: 'transition',
      origin: v3(settleP.x, top.top, settleP.z),
      flag: 'r2_stack',
      fromOff: v3(0, 0, 0),
      toOff: v3((tdx / tl) * slide, -0.25, (tdz / tl) * slide),
      dur: 3.2,
    },
    () => {
      b.plat(0, 0, 0, 5, 3, 0.4, { mat: Mat.Concrete, tint: 0xa89c88, tag: 'r2_stack_top', yaw: quantYaw(datan2(-tdz, tdx)) });
      b.block(0, -6.4, 0, 4.6, 6, 2.6, { mat: Mat.Brick, tint: 0x9a6a58, yaw: quantYaw(datan2(-tdz, tdx)) });
    },
  );
  b.trigger('t.r2.stack', 'r2_stack', { type: 'stand', tag: 'r2_stack_top', seconds: 1.0 }, { textKey: 'mem.r2.stack', delay: 0.4, focus: v3(settleP.x, top.top, settleP.z) });
  b.route(settleP.x, top.top, settleP.z, 'jump', { expect: 'r2_stack' });
  b.routeFlags = ['r2_stack'];

  // ------------------------------------------------------------------ Section D: the Rooftops
  b.zone('area', -100, 232, -100, 100, 282, 100, { key: 'area.r2.roofs' });
  const secD: HelixStep[] = [
    { move: 'start', len: 5, wid: 4.5, mat: Mat.Tile, tint: 0x9a5a44 },
    { move: 'long', len: 5, wid: 4.5, mat: Mat.Tile, tint: 0xa86a4a },
    { move: 'hop', len: 4, wid: 4, mat: Mat.Concrete, tint: 0xb0a490 },
    { move: 'tall', mat: Mat.Brick, tint: 0x9a6a58 },
    { move: 'jump', len: 5, wid: 4, mat: Mat.Tile, tint: 0x8a4a38 },
    { move: 'climb', mat: Mat.Concrete, tint: 0xb0a490 },
    { move: 'long', len: 4, wid: 4, mat: Mat.Tile, tint: 0xa86a4a },
    { move: 'drop', len: 5, wid: 4.5, mat: Mat.Tile, tint: 0x9a5a44 },
    { move: 'tall', mat: Mat.Brick, tint: 0xb8826a },
    { move: 'ladder', mat: Mat.Concrete },
    { move: 'jump', len: 4, wid: 4, mat: Mat.Tile, tint: 0x8a4a38 },
    { move: 'tall', mat: Mat.Plaster, tint: 0xcdb99a },
    { move: 'walk', len: 6, wid: 5, mat: Mat.Concrete, tint: 0xb0a490 },
  ];
  const d1 = helix(b, dAng, 54, top.top + 0.4, -1, secD, { pillarR: PR, mat: Mat.Tile });
  const roofA = d1[d1.length - 1];
  b.anchor('r2.roofs', polar(roofA.a, 52.4).x, roofA.top, polar(roofA.a, 52.4).z, 0, 'anchor.r2.roofs');
  // pigeon coop and the children's rooftop (fragment 26)
  b.decor('crate', roofA.x + 1.5, roofA.top, roofA.z, 1.4, 1.2, 1.2, { tint: 0x8a6a46 });
  b.decor('bird', roofA.x, roofA.top + 6, roofA.z, 10, 3, 10, {});
  b.collect('f26', 'fragment', d1[4].x, d1[4].top + 1.0, d1[4].z);
  b.collect('rec.r2.blocks', 'record', d1[7].x, d1[7].top + 1.1, d1[7].z);
  // RISK: a washing line straight across the canyon from the Rooftops to the Cistern level.
  const riskA = d1[5];
  const riskEndA = riskA.a - 20;
  const riskEnd = polar(riskEndA, 52);
  b.rope('line', v3(riskA.x, riskA.top + 2.6, riskA.z), v3(riskEnd.x, riskA.top + 2.8, riskEnd.z));
  b.decor('laundry', riskA.x, riskA.top + 2.6, riskA.z, 0, 0, 0, { q: v3(riskEnd.x, riskA.top + 2.8, riskEnd.z) });
  b.plat(riskEnd.x, riskA.top + 0.5, riskEnd.z, 3, 3, 0.3, { mat: Mat.Metal, tint: 0x4a5058 });

  // ------------------------------------------------------------------ Section E: the Flue and the Cistern
  b.zone('area', -100, 282, -100, 100, 318, 100, { key: 'area.r2.cistern' });
  const eAng = roofA.a - (3 + 1.8 + 2) / 54 * (180 / Math.PI);
  const secE: HelixStep[] = [
    { move: 'start', mat: Mat.Metal, tint: 0x4a5058 },
    { move: 'tall', mat: Mat.Brick, tint: 0x7a4a3a },
    { move: 'climb', mat: Mat.Brick, tint: 0x7a4a3a },
    { move: 'jump', mat: Mat.Metal, tint: 0x4a5058 },
    { move: 'ladder', mat: Mat.Brick, tint: 0x7a4a3a },
    { move: 'tall', mat: Mat.Brick, tint: 0x7a4a3a },
    { move: 'hop', mat: Mat.Wood, tint: 0x7a5a3c },
    { move: 'climb', mat: Mat.Wood, tint: 0x7a5a3c },
    { move: 'walk', len: 6, wid: 5, mat: Mat.Wood, tint: 0x8a6a46 },
  ];
  const e1 = helix(b, eAng, 50, roofA.top + 0.3, -1, secE, { pillarR: PR, mat: Mat.Brick });
  const cis = e1[e1.length - 1];
  const cisC = polar(cis.a - 3, 61);
  // the Cistern: a wooden water tower. Its valve drains it and opens the chamber beneath.
  b.cyl(cisC.x, cis.top, cisC.z, 5, 7, { mat: Mat.Wood, tint: 0x7a5a3c, flags: SolidFlag.NoWallRun });
  b.unless('r2_cistern', () => b.dbox(cisC.x, cis.top + 7, cisC.z, 9.4, 0.1, 9.4, { mat: Mat.Water, tint: 0x4d7d93 }));
  b.anchor('r2.cistern', polar(cis.a, 48.8).x, cis.top, polar(cis.a, 48.8).z, 0, 'anchor.r2.cistern');
  const valve = polar(cis.a - 1.5, 55.2);
  b.decor('gear', valve.x, cis.top + 1.2, valve.z, 0.4, 0.1, 0.4, { mat: Mat.Rust, tint: 0x8a4a2a });
  b.trigger('t.r2.cistern', 'r2_cistern', { type: 'interact', pos: v3(valve.x, cis.top + 1.2, valve.z), radius: 2.6 }, { textKey: 'mem.r2.cistern', delay: 1.0 });
  b.when('r2_cistern', () => {
    const ch = polar(cis.a - 3, 55.5);
    b.plat(ch.x, cis.top - 3, ch.z, 3, 3, 0.3, { mat: Mat.Wood, tint: 0x6a4e34 });
    b.collect('e.r2.courtyard', 'echo', polar(cis.a - 3, 58).x, cis.top - 30, polar(cis.a - 3, 58).z);
  });
  numeral(b, 27, polar(cis.a, PR + 0.06).x, cis.top + 2.2, polar(cis.a, PR + 0.06).z, rad(cis.a), 1.3);

  // ------------------------------------------------------------------ Section F: Crown Row (exit)
  b.zone('area', -100, 318, -100, 100, 340, 100, { key: 'area.r2.crown' });
  const fAng = cis.a - (3 + 1.8 + 1.5) / 50 * (180 / Math.PI);
  const secF: HelixStep[] = [
    { move: 'start', mat: Mat.Tile, tint: 0x8a4a38 },
    { move: 'tall', mat: Mat.Plaster, tint: 0xe0cfb0 },
    { move: 'jump', mat: Mat.Tile, tint: 0x9a5a44 },
    { move: 'tall', mat: Mat.Plaster, tint: 0xd6c3a0 },
    { move: 'climb', mat: Mat.Tile, tint: 0x8a4a38 },
    { move: 'walk', len: 7, wid: 5, mat: Mat.Marble, tint: 0xd8d0c0 },
  ];
  const f1 = helix(b, fAng, 50, cis.top, -1, secF, { pillarR: PR, mat: Mat.Plaster });
  const crown = f1[f1.length - 1];
  b.anchor('r2.crown', polar(crown.a, 48.2).x, crown.top, polar(crown.a, 48.2).z, 0, 'anchor.r2.crown');
  b.collect('f28', 'fragment', polar(crown.a, 52.4).x, crown.top + 1, polar(crown.a, 52.4).z);
  lamp(b, crown.x, crown.top + 2.6, crown.z);

  // ------------------------------------------------------------------ trial & daily
  const all = [...b1, ...b2, ...c1, ...d1, ...e1, ...f1];
  b.trial({
    id: 'trial.r2',
    nameKey: 'trial.r2',
    start: v3(gate.x + 1.2, 104.05, gate.z),
    startYaw: 0,
    gates: [
      { pos: v3(b2[3].x, b2[3].top + 1, b2[3].z), r: 3 },
      { pos: v3(afterLine.x, r0.top + 1, afterLine.z), r: 3 },
      { pos: v3(c1[12].x, c1[12].top + 1, c1[12].z), r: 3 },
      { pos: v3(d1[6].x, d1[6].top + 1, d1[6].z), r: 3 },
      { pos: v3(cis.x, cis.top + 1, cis.z), r: 3.5 },
    ],
    finish: { pos: v3(crown.x, crown.top + 1, crown.z), r: 3.5 },
    medals: { bronze: 240, silver: 190, gold: 150, perfect: 125 },
    flags: ['r2_stack'],
    abilities: Ability.Sprint | Ability.Mantle | Ability.Slide | Ability.Vault | Ability.LedgeGrab | Ability.Rope,
    master: [{ pos: v3(polar(mA.a - 3, 58.5).x, (mA.top + mEnd.top) / 2, polar(mA.a - 3, 58.5).z), r: 3 }],
  });
  for (let i = 3; i < all.length; i += 8) b.daily(all[i].x, all[i].top + 1, all[i].z);

  const topY = crown.top + 6;
  pillar(b, 100, topY + 40, PR, PR, 2);
  b.data.meta.topY = topY;
  return { data: b.build(), exit: { x: crown.x, y: crown.top, z: crown.z, a: crown.a } };
}

/** Low railings on the outer edge of balcony decks (vaultable, never walls). */
function railings(b: RegionBuilder, decks: { x: number; z: number; top: number; a: number; len: number }[]): void {
  for (const d of decks) {
    const dir = { x: dsin(rad(d.a)), z: dcos(rad(d.a)) };
    const px = d.x + dir.x * 1.35;
    const pz = d.z + dir.z * 1.35;
    b.dbox(px, d.top, pz, 0.06, 1.0, 0.06, { mat: Mat.Metal, tint: 0x3a3e44 });
    b.decor('box', px, d.top + 1.0, pz, d.len * 0.9, 0.05, 0.05, { mat: Mat.Metal, tint: 0x3a3e44, yaw: quantYaw(rad(d.a)) });
  }
}
