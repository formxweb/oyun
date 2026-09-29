import { dcos, dsin, v3 } from '../../math';
import { RegionBuilder } from '../builder';
import { beamArc, cottage, fence, hangCable, helix, lamp, numeral, pillar, polar, tree, type HelixDeck } from '../kit';
import { Ability, Mat, Slope, SolidFlag, type RegionData } from '../types';

/**
 * REGION 01 — THE GROUND
 * Lowmark, the village at the foot of the Pillar, and the Last Floor: the lowest platform of
 * the city, hanging just above the grass. The Hanging Stair climbs the rock; near its top it
 * gives way and the first Fall Line catches the climber, revealing the hidden Crevice.
 *
 * Teaches: move, sprint, jump (terraces), mantle, slide (lesson), the fall camera, fall echoes,
 * fall lines, Vertical Memory (bell -> lift; collapse -> debris & crevice).
 * Routes: SAFE the Hanging Stair / RISK the Anchor Chain / MASTER the Pegs.
 */

const ATM = {
  skyTop: 0x4f86c6,
  skyHorizon: 0xf3d9a8,
  fog: 0xe6cfa2,
  fogDensity: 0.0017,
  sunColor: 0xfff0d2,
  sunIntensity: 1.1,
  ambient: 0x8a7656,
  sunDir: v3(0.55, 0.42, 0.4),
  weather: 1,
  cloudColor: 0xfff6ea,
  exposure: 1.02,
};

const PR = 40; // pillar radius here

export interface R1Out {
  data: RegionData;
  gate: { x: number; z: number; y: number };
}

export function region01(): R1Out {
  const b = new RegionBuilder({ index: 0, id: 'ground', baseY: -60, topY: 100, atmosphere: ATM, center: v3(0, 0, 30), radius: 215 });

  // ------------------------------------------------------------------ terrain
  pillar(b, -3, 100, PR, PR, 1);
  b.aabb(-260, -3, 94, 260, 0, 290, { mat: Mat.Grass, tint: 0x7c9a52 });
  b.aabb(-260, -3, -250, 260, 0, 88, { mat: Mat.Grass, tint: 0x789650 });
  b.aabb(-260, -3, 88, 260, -0.9, 94, { mat: Mat.Dirt, tint: 0x6b5a44 });
  b.dbox(0, -0.9, 91, 520, 0.52, 6, { mat: Mat.Water, tint: 0x4d7d93 });
  for (const x of [-64, 64]) {
    b.ramp(x, -0.9, 89.6, 4, 0.9, 3.2, Slope.NegZ, { mat: Mat.Dirt, tint: 0x7a6a52 });
    b.ramp(x, -0.9, 92.4, 4, 0.9, 3.2, Slope.PosZ, { mat: Mat.Dirt, tint: 0x7a6a52 });
  }
  // the valley floor runs to the horizon, ringed by distant ridges
  b.decor('cyl', 0, -1.6, 0, 5200, 0.8, 0, { mat: Mat.Grass, tint: 0x6f8a4c, landmark: true });
  const ridges = [
    [8, 1200, 520, 210],
    [31, 1500, 700, 300],
    [55, 1100, 480, 170],
    [83, 1650, 820, 360],
    [118, 1300, 600, 240],
    [147, 1750, 900, 420],
    [176, 1250, 540, 200],
    [205, 1600, 760, 330],
    [238, 1150, 520, 190],
    [262, 1850, 980, 460],
    [291, 1400, 640, 260],
    [322, 1700, 820, 380],
    [345, 1250, 560, 220],
  ];
  for (const [a, r, rad, h] of ridges) {
    // each ridge is a cluster of peaks, not a single cone
    for (let j = -1; j <= 1; j++) {
      const p = polar(a + j * 4.5, r + Math.abs(j) * 90);
      const k = j === 0 ? 1 : 0.62 + 0.1 * j;
      b.decor('cone', p.x, -2, p.z, rad * (j === 0 ? 0.8 : 0.65), h * k, 0, { mat: Mat.Rock, tint: j === 0 ? 0x7a8a82 : 0x6f8078, landmark: true });
    }
  }
  // dirt paths
  b.dbox(14, 0, 110, 2.4, 0.02, 36, { mat: Mat.Dirt, tint: 0x9a8260 });
  b.dbox(8, 0, 76, 2.4, 0.02, 20, { mat: Mat.Dirt, tint: 0x9a8260 });

  // ------------------------------------------------------------------ Lowmark
  b.zone('area', -120, -5, 96, 120, 40, 290, { key: 'area.r1.lowmark' });
  cottage(b, 18, 0, 131, 8, 6, 3.4, { flip: true, wall: 0xe0d0b0, roof: 0xa64a30 });
  // playful roof access behind home: crate -> barrel -> roof
  b.block(23.3, 0, 126.4, 1.1, 1.0, 1.1, { mat: Mat.Wood, tint: 0x8a6a46 });
  b.cyl(23.4, 0, 128.4, 0.5, 1.9, { mat: Mat.Wood, tint: 0x6a4e34 });
  cottage(b, -6, 0, 142, 7, 6, 3.2, { flip: true, roof: 0x9a4a36 });
  cottage(b, -24, 0, 127, 9, 7, 3.6, { flip: true, wall: 0xd6c4a2 });
  cottage(b, 38, 0, 144, 6, 6, 3.0, { flip: true, roof: 0x8c4a38 });
  cottage(b, 46, 0, 117, 8, 6, 3.4, { flip: false, wall: 0xcdbb96 });
  cottage(b, -36, 0, 152, 6, 5, 3.0, { flip: true });
  cottage(b, -54, 0, 131, 10, 7, 4.2, { flip: false, wall: 0xc8b28e, roof: 0x7a3a2a });
  // well
  b.cyl(4, 0, 117, 1.1, 0.9, { mat: Mat.Stone, tint: 0x9d9586 });
  b.dbox(3.1, 0.9, 117, 0.15, 1.8, 0.15, { mat: Mat.Wood, tint: 0x6a4e34 });
  b.dbox(4.9, 0.9, 117, 0.15, 1.8, 0.15, { mat: Mat.Wood, tint: 0x6a4e34 });
  b.dbox(4, 2.7, 117, 2.4, 0.15, 1.2, { mat: Mat.Tile, tint: 0x9a4a36 });
  fence(b, 10, 124, 10, 104, 0);
  fence(b, 26, 122, 26, 100, 0);
  // the low stone wall across the lane: first obstacle, auto-climbed
  b.block(13, 0, 108, 26, 0.8, 0.5, { mat: Mat.Stone, tint: 0x9a917e });
  // fields & trees
  for (let i = 0; i < 6; i++) b.dbox(-40 - i * 4, 0, 108, 2.6, 0.5, 14, { mat: Mat.Grass, tint: i % 2 ? 0x8aa650 : 0xa8b060 });
  tree(b, 30, 0, 104, 1.1);
  tree(b, -14, 0, 112, 1.3, 0x57803a);
  tree(b, 56, 0, 134, 1.2);
  tree(b, -66, 0, 150, 1.4, 0x4f7a34);
  tree(b, 62, 0, 100, 1.0);
  lamp(b, 10.2, 2.6, 118);
  lamp(b, 25.8, 2.6, 106);
  // windmill: ladder to the top, view of the whole valley
  b.cyl(-44, 0, 104, 3.2, 13, { mat: Mat.Stone, tint: 0xcfc2a6 });
  // the gallery stops short of the ladder side so the climb tops out through its hatch
  b.plat(-44, 13.2, 103.5, 7.4, 6.4, 0.4, { mat: Mat.Wood, tint: 0x8a6a46 });
  b.decor('cone', -44, 13.2, 104, 3.4, 4.2, 0, { mat: Mat.Tile, tint: 0x8a4a36 });
  b.dbox(-44, 3.5, 107.9, 0.35, 16, 0.12, { mat: Mat.Wood, tint: 0xe8dcc0 });
  b.dbox(-44, 11.3, 107.9, 16, 0.35, 0.12, { mat: Mat.Wood, tint: 0xe8dcc0 });
  b.ladder(-44, 0, 107.2, 13.2, v3(0, 0, 1));
  b.collect('rec.r1.lowmark', 'record', -45.5, 14.3, 102.5);
  b.branch('secret.r1.windmill', 'secret', () => {
    b.route(-44, 0, 109, 'run');
    b.route(-44, 13.2, 104, 'ladder');
  });

  // spawn in front of home, facing the Pillar
  b.spawn(18, 0, 125.2, 0);
  b.route(18, 0, 125.2, 'run');
  b.route(14, 0, 111, 'run');
  b.route(13, 0.8, 108, 'mantle');
  b.route(9, 0, 100, 'run');
  b.route(8, 0.15, 91, 'jump');
  b.route(8, 0, 86, 'jump');
  b.route(8, 1.1, 80.5, 'mantle');
  b.route(8, 2.2, 73, 'mantle');
  b.route(8, 3.3, 68, 'mantle');
  b.route(-6, 3.6, 57, 'run');
  b.anchor('r1.home', 12.5, 0, 125.5, 0, 'anchor.r1.home', true);
  b.trigger('t.r1.hint.move', 'hint_move', { type: 'enter', min: v3(10, -1, 118), max: v3(26, 4, 126) }, { textKey: 'hint.move' });

  // ------------------------------------------------------------------ the creek
  b.cyl(8, -0.9, 91, 0.75, 1.05, { mat: Mat.Stone, tint: 0x8d877a });
  b.plat(22, 0.25, 91, 2.2, 8.4, 0.3, { mat: Mat.Wood, tint: 0x8a6a46 });
  b.trigger('t.r1.hint.jump', 'hint_jump', { type: 'enter', min: v3(0, -1, 94), max: v3(30, 4, 100) }, { textKey: 'hint.jump' });

  // ------------------------------------------------------------------ orchard terraces (jump + mantle)
  b.zone('area', -60, -5, 60, 60, 30, 88, { key: 'area.r1.orchard' });
  b.aabb(-30, -1, 76, 30, 1.1, 84, { mat: Mat.Stone, tint: 0x9c8f76 });
  b.aabb(-30, -1, 70, 30, 2.2, 76, { mat: Mat.Stone, tint: 0x958870 });
  b.aabb(-30, -1, 66, 30, 3.3, 70, { mat: Mat.Stone, tint: 0x8e826c });
  for (const [x, y, z] of [
    [-22, 1.1, 80],
    [-9, 1.1, 81],
    [13, 1.1, 79],
    [25, 1.1, 81],
    [-16, 2.2, 73],
    [7, 2.2, 72.5],
    [19, 2.2, 74],
  ]) {
    b.decor('tree', x, y, z, 1.6, 4.2, 0, { tint: 0x6d9a3a });
    b.decor('sphere', x + 0.6, y + 2.2, z + 0.4, 0.12, 0, 0, { mat: Mat.Paint, tint: 0xc83a28 });
  }
  b.dbox(0, 1.1, 80, 60, 0.03, 8, { mat: Mat.Grass, tint: 0x7aa64c });
  b.dbox(0, 2.2, 73, 60, 0.03, 6, { mat: Mat.Grass, tint: 0x74a048 });
  // accessible stair on the east side
  b.stairs(28.5, 0, 84.5, 2.4, 1.1, 2, 3, { mat: Mat.Stone, tint: 0xa09680 });
  b.trigger('t.r1.hint.mantle', 'hint_mantle', { type: 'enter', min: v3(-30, -1, 84), max: v3(30, 4, 88) }, { textKey: 'hint.mantle' });

  // ------------------------------------------------------------------ the Last Floor
  b.zone('area', -30, 2, 38, 26, 30, 66, { key: 'area.r1.lastfloor' });
  b.aabb(-26, 2.4, 40, 22, 3.6, 66, { mat: Mat.Wood, tint: 0x9a7a54 });
  // underside beams and the hanging chains: the city hangs from above
  for (const x of [-22, -10, 2, 14]) b.dbox(x, 1.7, 53, 0.8, 0.7, 26, { mat: Mat.Wood, tint: 0x6e5238 });
  for (const [x, z] of [
    [-24, 42],
    [20, 42],
    [-24, 64],
    [20, 64],
  ]) {
    hangCable(b, x, 3.6, z, 100, 0.15);
    b.decor('hcyl', x, 3.2, z, 1.2, 0.35, 0, { mat: Mat.Rust, tint: 0x6e4a38 });
  }
  // underside record: only found by walking beneath the floor and looking up
  b.collect('rec.r1.lastfloor', 'record', 8, 1.25, 56);
  b.glyph('plumb', 8, 2.37, 53.5, 1.6, 0, { up: false });
  // market stalls
  for (const [x, z, c] of [
    [-12, 60, 0xb8502e],
    [-4, 61, 0x2e6e8a],
    [4, 60, 0xd89a2e],
    [14, 61, 0x6a8a3a],
  ] as const) {
    b.block(x, 3.6, z, 3.2, 0.95, 1.6, { mat: Mat.Wood, tint: 0x7a5a3c });
    b.dbox(x, 5.6, z - 0.4, 3.6, 0.1, 2.6, { mat: Mat.Cloth, tint: c });
    b.dbox(x - 1.6, 3.6, z - 1.4, 0.12, 2.0, 0.12, { mat: Mat.Wood, tint: 0x5a4030 });
    b.dbox(x + 1.6, 3.6, z - 1.4, 0.12, 2.0, 0.12, { mat: Mat.Wood, tint: 0x5a4030 });
  }
  b.decor('crate', -18, 3.6, 62, 1.0, 1.0, 1.0, { tint: 0x8a6a46 });
  // generation numeral 30 on a stone post
  b.block(-4, 3.6, 50, 0.9, 3.0, 0.9, { mat: Mat.Stone, tint: 0xb4aa98 });
  numeral(b, 30, -4, 5.6, 50.46, 0, 0.9);
  b.anchor('r1.lastfloor', -8, 3.6, 57, 0, 'anchor.r1.lastfloor', true);

  // The Descent Bell. Ringing it wakes the counterweight lift (Vertical Memory).
  b.block(8.5, 3.6, 47, 0.4, 3.8, 0.4, { mat: Mat.Wood, tint: 0x6a4e34 });
  b.block(11.5, 3.6, 47, 0.4, 3.8, 0.4, { mat: Mat.Wood, tint: 0x6a4e34 });
  b.block(10, 7.4, 47, 3.8, 0.4, 0.5, { mat: Mat.Wood, tint: 0x6a4e34 });
  b.decor('cone', 10, 5.6, 47, 0.7, 1.4, 0, { mat: Mat.Brass, tint: 0xb8923a });
  b.block(13.2, 3.6, 48.6, 1.2, 1.2, 1.2, { mat: Mat.Wood, tint: 0x8a6a46 });
  b.block(13.4, 4.8, 47.2, 1.2, 1.2, 1.2, { mat: Mat.Wood, tint: 0x7e6040 });
  b.collect('f30', 'fragment', 10, 8.6, 47);
  b.trigger('t.r1.bell', 'r1_bell', { type: 'interact', pos: v3(10, 5.2, 47), radius: 3.2 }, { textKey: 'mem.r1.bell', delay: 1.2 });

  // Slide lesson and the Low Gate (a collapsed awning: faster to slide under than crouch).
  b.collect('l.slide', 'lesson', -12, 4.9, 49, Ability.Slide);
  b.aabb(-22, 4.7, 44, -15, 5.3, 48, { mat: Mat.Cloth, tint: 0x9a4a2e });
  b.wall(-22, 48.3, -15, 48.3, 3.6, 2.6, 0.3, { mat: Mat.Wood, tint: 0x6e5238 });
  b.dbox(-18.5, 5.3, 46, 7.4, 0.12, 4.2, { mat: Mat.Wood, tint: 0x5a4030 });
  b.trigger('t.r1.hint.slide', 'hint_slide', { type: 'enter', min: v3(-15, 3, 42), max: v3(-9, 7, 50) }, { textKey: 'hint.slide' });
  // The Stair Foot: a timber landing at the corner where the Hanging Stair begins.
  b.plat(-27.2, 3.6, 41.2, 5.2, 4.4, 0.4, { mat: Mat.Wood, tint: 0x9a7a54 });
  b.route(-12, 3.6, 46, 'run');
  b.route(-24, 3.6, 46, 'slide');
  b.route(-27.4, 3.6, 40.2, 'run');

  // ------------------------------------------------------------------ the Hanging Stair (SAFE)
  b.zone('area', -80, 3, -80, 80, 46, 80, { key: 'area.r1.stair' });
  const stair = helix(
    b,
    322,
    46,
    4.0,
    -1,
    [
      { move: 'start' },
      { move: 'ramp' },
      { move: 'hop' },
      { move: 'hop' },
      { move: 'ramp' },
      { move: 'jump' },
      { move: 'climb' },
      { move: 'step' },
      { move: 'step' },
      { move: 'ramp', len: 4.5, wid: 3.4 },
      { move: 'jump' },
      { move: 'hop' },
      { move: 'ladder' },
      { move: 'hop' },
      { move: 'drop' },
      { move: 'jump' },
      { move: 'climb' },
      { move: 'climb' },
      { move: 'ramp', len: 4, wid: 3.2 },
      { move: 'hop' },
      { move: 'jump' },
      { move: 'climb' },
      { move: 'step' },
      { move: 'ladder' },
      { move: 'jump' },
      { move: 'long' },
      { move: 'climb' },
      { move: 'ramp' },
      { move: 'hop' },
      { move: 'climb' },
      { move: 'step' },
      { move: 'ramp', len: 4.5, wid: 3.4 },
    ],
    { pillarR: PR, mat: Mat.Wood, tint: 0xa88a60 },
  );
  const stairAnchor = stair[9];
  const sa = polar(stairAnchor.a, 45);
  b.anchor('r1.stair', sa.x, stairAnchor.top, sa.z, 0, 'anchor.r1.stair');
  lamp(b, stair[4].x, stair[4].top + 2.4, stair[4].z);
  lamp(b, stair[18].x, stair[18].top + 2.4, stair[18].z);
  lamp(b, stair[27].x, stair[27].top + 2.4, stair[27].z);
  numeral(b, 30, polar(stair[12].a, PR + 0.05).x, stair[12].top + 2, polar(stair[12].a, PR + 0.05).z, ((stair[12].a) * Math.PI) / 180, 1.6);

  // The counterweight lift beside the stair: asleep until the Descent Bell is rung.
  const liftDeck = stair[18];
  const liftPos = polar(liftDeck.a, 52.5);
  const liftBottom = 3.6;
  b.plat(liftPos.x, liftBottom - 0.3, liftPos.z, 3.2, 3.2, 0.6, { mat: Mat.Stone, tint: 0x7a7266 });
  b.mover(
    {
      kind: 'path',
      origin: v3(liftPos.x, 0, liftPos.z),
      points: [v3(0, liftBottom, 0), v3(0, liftDeck.top, 0)],
      segTime: [9],
      pause: 2.5,
      activeFlag: 'r1_bell',
    },
    () => {
      b.plat(0, 0, 0, 2.8, 2.8, 0.3, { mat: Mat.Wood, tint: 0xb89a68 });
      b.dbox(-1.3, 0, -1.3, 0.12, 1.1, 0.12, { mat: Mat.Metal, tint: 0x555555 });
      b.dbox(1.3, 0, 1.3, 0.12, 1.1, 0.12, { mat: Mat.Metal, tint: 0x555555 });
    },
  );
  b.cable(v3(liftPos.x, liftDeck.top + 20, liftPos.z), v3(liftPos.x, liftBottom, liftPos.z), 0, Mat.Metal, 0x2a2a2a);
  // the lift's lower landing reached from the Last Floor's west edge by a short gangway
  b.rampBetween(-26, 58, 3.6, liftPos.x + 1.6 * Math.sign(-26 - liftPos.x), liftPos.z, liftBottom, 1.6, { mat: Mat.Wood, tint: 0x9a7a54 });

  // ------------------------------------------------------------------ RISK: the Anchor Chain
  // The stair was hung from one great chain wrapped round its outside. It is still taut: a
  // 60 cm wide iron path that climbs twice as steeply as the stair and skips fourteen decks.
  const chainFrom = stair[4];
  const chainTo = stair[18];
  const CR = 49.6;
  const plate = (d: HelixDeck, a: number): void => {
    const pa = polar(a, (47 + CR) / 2);
    b.plat(pa.x, d.top, pa.z, CR - 46.2, 1.3, 0.3, { mat: Mat.Rust, tint: 0x5e4436, yaw: quant(((a + 90) * Math.PI) / 180) });
  };
  plate(chainFrom, chainFrom.a);
  plate(chainTo, chainTo.a);
  beamArc(b, chainFrom.a, chainTo.a, CR, chainFrom.top, chainTo.top, 0.6, { mat: Mat.Rust, tint: 0x6e5040 });
  for (let a = chainFrom.a - 6; a > chainTo.a + 3; a -= 12) {
    // the chain's hangers: rods up to the deck above
    const t = (a - chainFrom.a) / (chainTo.a - chainFrom.a);
    const p = polar(a, CR);
    b.cable(v3(p.x, chainFrom.top + (chainTo.top - chainFrom.top) * t, p.z), v3(polar(a, 46).x, chainFrom.top + (chainTo.top - chainFrom.top) * t + 9, polar(a, 46).z), 0, Mat.Rust, 0x4a3a30);
  }
  const cm = polar((chainFrom.a + chainTo.a) / 2, CR);
  b.zone('area', cm.x - 30, chainFrom.top - 2, cm.z - 30, cm.x + 30, chainTo.top + 3, cm.z + 30, { key: 'area.r1.chain' });
  b.branch('risk.r1.chain', 'risk', () => {
    b.route(chainFrom.x, chainFrom.top, chainFrom.z, 'run');
    const pp = polar(chainFrom.a, CR);
    b.route(pp.x, chainFrom.top, pp.z, 'run');
    const steps = Math.ceil(Math.abs(chainTo.a - chainFrom.a) / 5);
    for (let i = 1; i <= steps; i++) {
      const t = i / steps;
      const p = polar(chainFrom.a + (chainTo.a - chainFrom.a) * t, CR);
      b.route(p.x, chainFrom.top + (chainTo.top - chainFrom.top) * t, p.z, 'run');
    }
    b.route(chainTo.x, chainTo.top, chainTo.z, 'run');
  });

  // ------------------------------------------------------------------ the collapse
  const last = stair[stair.length - 1];
  const collapseStart = last.a - ((last.len / 2 + 2.6 + 1.5) / 47.5) * (180 / Math.PI);
  const walk: HelixDeck[] = [];
  b.unless('r1_collapse', () => {
    for (let i = 0; i < 4; i++) {
      const a = collapseStart - ((i * 3) / 47.5) * (180 / Math.PI);
      const p = polar(a, 47.5);
      const yaw = (a * Math.PI) / 180;
      b.plat(p.x, last.top, p.z, 3.05, 2.4, 0.2, { mat: Mat.Wood, tint: 0x9a7e56, tag: 'r1_plank', yaw: quant(yaw) });
      b.cable(v3(p.x, last.top - 0.1, p.z), v3(polar(a, PR).x, last.top - 3, polar(a, PR).z), 0, Mat.Wood, 0x6e5238);
      walk.push({ x: p.x, z: p.z, top: last.top, a, yaw, len: 3 });
    }
  });
  // jump from the last safe deck onto the walkway
  const midA = collapseStart - (4.5 / 47.5) * (180 / Math.PI);
  const mid = polar(midA, 47.5);
  b.trigger('t.r1.collapse', 'r1_collapse', { type: 'stand', tag: 'r1_plank', seconds: 0.25 }, { textKey: 'mem.r1.collapse', delay: 0.85, focus: v3(mid.x, last.top, mid.z) });
  // debris on the ground once it has fallen
  b.when('r1_collapse', () => {
    const d = polar(midA, 50);
    b.ramp(d.x, 0, d.z, 7, 1.6, 3.2, Slope.PosX, { mat: Mat.Wood, tint: 0x7a6040, yaw: quant((midA * Math.PI) / 180) });
    b.decor('crate', d.x + 2, 0, d.z + 2, 1.2, 0.6, 2.6, { tint: 0x7a6040 });
  });
  // First Fall Line: invisible until you fall past it; once caught, it stays.
  b.plat(mid.x, 13.5, mid.z, 13, 13, 0.15, { mat: Mat.Cloth, tint: 0xffe3b0, flags: SolidFlag.FallOnly | SolidFlag.Soft, tag: 'net_r1' });
  b.collect('e.r1.first', 'echo', mid.x, 27, mid.z);
  b.trigger('t.r1.hint.fall', 'hint_fall', { type: 'fallPass', pos: v3(mid.x, 36, mid.z), radius: 8 }, { textKey: 'hint.fall' });

  b.route(mid.x, 13.5, mid.z, 'drop', { note: 'the stair gives way; the first Fall Line catches you', expect: 'r1_collapse' });
  // ------------------------------------------------------------------ the Crevice (revealed by the fall)
  const fa = midA;
  const radial = (a: number, r: number) => polar(a, r);
  const tang = (a: number) => {
    const ar = (a * Math.PI) / 180;
    return { x: dcos(ar), z: -dsin(ar) };
  };
  const flakeYaw = quant((fa * Math.PI) / 180);
  const fc = radial(fa, 43.6);
  const t = tang(fa);
  // flake: lower block, two door jambs, upper block
  b.block(fc.x, -2, fc.z, 16, 15.5, 2.4, { mat: Mat.Rock, tint: 0x9d9486, yaw: flakeYaw, flags: SolidFlag.NoWallRun });
  b.block(fc.x - t.x * 4.5, 13.5, fc.z - t.z * 4.5, 7, 3.0, 2.4, { mat: Mat.Rock, tint: 0x9d9486, yaw: flakeYaw });
  b.block(fc.x + t.x * 4.5, 13.5, fc.z + t.z * 4.5, 7, 3.0, 2.4, { mat: Mat.Rock, tint: 0x9d9486, yaw: flakeYaw });
  b.block(fc.x, 16.5, fc.z, 16, 24.5, 2.4, { mat: Mat.Rock, tint: 0x9d9486, yaw: flakeYaw, flags: SolidFlag.NoWallRun });
  numeral(b, 30, fc.x + radial(fa, 1).x * 1.25, 18, fc.z + radial(fa, 1).z * 1.25, (fa * Math.PI) / 180, 1.4);
  b.glyph('chalk', fc.x + radial(fa, 1).x * 1.25, 12.2, fc.z + radial(fa, 1).z * 1.25, 1.2, (fa * Math.PI) / 180, { tint: 0xffffff });
  // crevice floor and the stepped climb inside
  const cf = radial(fa, 41.2);
  b.plat(cf.x, 13.5, cf.z, 10, 2.6, 0.5, { mat: Mat.Rock, tint: 0x8e8578, yaw: flakeYaw });
  const blkA = { x: cf.x - t.x * 2.2 + radial(fa, 1).x * 0.7, z: cf.z - t.z * 2.2 + radial(fa, 1).z * 0.7 };
  b.block(blkA.x, 13.5, blkA.z, 3.0, 13.5, 1.0, { mat: Mat.Rock, tint: 0x958c7e, yaw: flakeYaw });
  const inward = { x: -radial(fa, 1).x, z: -radial(fa, 1).z };
  b.ladder(blkA.x + inward.x * 0.52, 13.5, blkA.z + inward.z * 0.52, 27, v3(inward.x, 0, inward.z));
  const blkB = { x: cf.x + t.x * 1.8 + radial(fa, 1).x * 0.7, z: cf.z + t.z * 1.8 + radial(fa, 1).z * 0.7 };
  b.block(blkB.x, 13.5, blkB.z, 3.0, 27.5, 1.0, { mat: Mat.Rock, tint: 0x958c7e, yaw: flakeYaw });
  b.ladder(blkB.x - t.x * 1.52, 27, blkB.z - t.z * 1.52, 41, v3(-t.x, 0, -t.z));
  b.anchor('r1.crevice', fc.x + t.x * 5, 41, fc.z + t.z * 5, 0, 'anchor.r1.crevice');
  b.routeFlags = ['r1_collapse', 'net_r1'];
  b.route(cf.x, 13.5, cf.z, 'run');
  b.route(blkA.x, 27, blkA.z, 'ladder');
  b.route(blkB.x, 41, blkB.z, 'ladder');
  b.route(fc.x + t.x * 1.0, 41, fc.z + t.z * 1.0, 'run');
  b.route(fc.x - t.x * 6.8, 41, fc.z - t.z * 6.8, 'run');
  b.zone('area', Math.min(fc.x, cf.x) - 9, 12, Math.min(fc.z, cf.z) - 9, Math.max(fc.x, cf.x) + 9, 41, Math.max(fc.z, cf.z) + 9, { key: 'area.r1.crevice' });

  // ------------------------------------------------------------------ the Pillar Shelf
  // A broad landing where the walkway (before the collapse) and the flake top (after it) meet.
  const landA = fa - ((8 + 0.4 + 2) / 44) * (180 / Math.PI);
  const land = polar(landA, 45.6);
  b.plat(land.x, 43.2, land.z, 4, 5.6, 0.6, { mat: Mat.Rock, tint: 0xa39988, yaw: quant((landA * Math.PI) / 180) });
  b.route(land.x, 43.2, land.z, 'mantle');
  const shelfA0 = landA - ((2 + 1.8 + 1.75) / 44) * (180 / Math.PI);
  const shelf = helix(
    b,
    shelfA0,
    44,
    43.5,
    -1,
    [
      { move: 'start', len: 3.5, wid: 4.4 },
      { move: 'climb', wid: 4 },
      { move: 'jump', wid: 4 },
      { move: 'climb', wid: 4 },
      { move: 'step', wid: 4 },
      { move: 'long', wid: 4 },
      { move: 'climb', wid: 4 },
      { move: 'climb', wid: 4 },
      { move: 'hop', wid: 4 },
      { move: 'ramp', wid: 4 },
      { move: 'jump', wid: 4 },
      { move: 'jump', dh: 0.8, wid: 4 },
      { move: 'climb', wid: 4 },
      { move: 'walk', len: 6, wid: 5.4 },
      { move: 'climb', wid: 4 },
      { move: 'step', wid: 4 },
      { move: 'climb', wid: 4 },
      { move: 'hop', wid: 4 },
      { move: 'jump', wid: 4 },
      { move: 'climb', wid: 4 },
      { move: 'climb', wid: 4 },
      { move: 'long', wid: 4 },
      { move: 'climb', wid: 4 },
      { move: 'step', wid: 4 },
      { move: 'climb', wid: 4 },
      { move: 'hop', wid: 4 },
      { move: 'ramp', wid: 4 },
      { move: 'jump', wid: 4 },
      { move: 'climb', wid: 4 },
      { move: 'climb', wid: 4 },
      { move: 'step', wid: 4 },
      { move: 'jump', wid: 4 },
      { move: 'climb', wid: 4 },
      { move: 'climb', wid: 4 },
      { move: 'hop', wid: 4 },
      { move: 'ramp', wid: 4 },
      { move: 'climb', wid: 4 },
      { move: 'walk', len: 5, wid: 5 },
    ],
    { mat: Mat.Rock, tint: 0xa39988 },
  );
  b.routeFlags = null;
  // Flake top links to the first shelf.
  b.zone('area', -80, 43, -80, 80, 100, 80, { key: 'area.r1.shelf' });
  const overlook = shelf[14];
  const oa = polar(overlook.a, 42.2);
  b.anchor('r1.shelf', oa.x, overlook.top, oa.z, 0, 'anchor.r1.shelf');
  const out = polar(overlook.a, 54);
  b.collect('e.r1.shelf', 'echo', out.x, overlook.top - 20, out.z);
  lamp(b, overlook.x, overlook.top + 2.5, overlook.z);
  numeral(b, 30, polar(overlook.a, PR + 0.05).x, overlook.top + 2.4, polar(overlook.a, PR + 0.05).z, (overlook.a * Math.PI) / 180, 1.8);
  // a view that makes you look up: the Blocks hang overhead
  b.trigger('t.r1.lookup', 'hint_lookup', { type: 'enter', min: v3(overlook.x - 3, overlook.top - 1, overlook.z - 3), max: v3(overlook.x + 3, overlook.top + 3, overlook.z + 3) }, { textKey: 'hint.lookup' });

  // The final ladder up through the Blocks' foundation (the Underside Gate).
  const end = shelf[shelf.length - 1];
  const gp = polar(end.a - (4.2 / 44) * (180 / Math.PI), 44);
  b.block(gp.x, end.top, gp.z, 1.4, 104 - end.top - 0.02, 1.4, { mat: Mat.Stone, tint: 0x8a8274 });
  const tEnd = tang(end.a);
  b.ladder(gp.x + tEnd.x * 0.72, end.top, gp.z + tEnd.z * 0.72, 104, v3(tEnd.x, 0, tEnd.z));
  const gate = { x: gp.x, z: gp.z, y: 104 };
  const ga = polar(end.a, 42.4);
  b.anchor('r1.gate', ga.x, end.top, ga.z, 0, 'anchor.r1.gate');

  // ------------------------------------------------------------------ MASTER: the Pegs
  // Tiny timber pegs straight up the south face of the rock. Precise jump-mantles, no rest.
  let best = shelf[0];
  for (const d of shelf) if (Math.abs(((d.a % 360) + 360) % 360 - 8) < Math.abs(((best.a % 360) + 360) % 360 - 8)) best = d;
  const pegA = best.a + (3.2 / 44) * (180 / Math.PI);
  let py = 5.8;
  let k = 0;
  const pegs: { x: number; y: number; z: number }[] = [];
  while (py < best.top - 0.5) {
    const a = pegA + (k % 2 ? 1.3 : -1.3);
    const p = polar(a, 41.0);
    b.plat(p.x, py, p.z, 0.7, 0.7, 0.35, { mat: Mat.Wood, tint: 0x7e6040 });
    pegs.push({ x: p.x, y: py, z: p.z });
    py += 2.1;
    k++;
  }
  b.branch('master.r1.pegs', 'master', () => {
    const foot = polar(pegA - 1.3, 42.6);
    b.route(foot.x, 3.6, foot.z, 'run');
    for (const p of pegs) b.route(p.x, p.y, p.z, 'mantle');
    b.route(best.x, best.top, best.z, 'mantle');
  });
  b.zone('area', polar(pegA, 41).x - 4, 4, polar(pegA, 41).z - 4, polar(pegA, 41).x + 4, best.top, polar(pegA, 41).z + 4, { key: 'area.r1.pegs' });

  // ------------------------------------------------------------------ the underside overhead (scale)
  // A few hanging structures from the Blocks visible from below.
  for (let i = 0; i < 6; i++) {
    const p = polar(i * 60 + 30, 70);
    b.dbox(p.x, 88, p.z, 8, 12, 8, { mat: Mat.Brick, tint: 0x8a6a58, landmark: true });
    hangCable(b, p.x, 88, p.z, 100);
  }

  // ------------------------------------------------------------------ trial, daily, route
  b.trial({
    id: 'trial.r1',
    nameKey: 'trial.r1',
    start: v3(14, 0, 112),
    startYaw: 0,
    gates: [
      { pos: v3(8, 1.2, 91), r: 3 },
      { pos: v3(-6, 4.6, 57), r: 3.5 },
      { pos: v3(stair[9].x, stair[9].top + 1, stair[9].z), r: 3 },
      { pos: v3(stair[25].x, stair[25].top + 1, stair[25].z), r: 3 },
      { pos: v3(overlook.x, overlook.top + 1, overlook.z), r: 3.5 },
    ],
    finish: { pos: v3(end.x, end.top + 1, end.z), r: 3 },
    master: [{ pos: v3(polar(pegA, 41).x, 20, polar(pegA, 41).z), r: 3 }],
  });
  for (const d of [stair[3], stair[11], stair[20], stair[29], shelf[6], shelf[20], shelf[30]]) b.daily(d.x, d.top + 1, d.z);

  return { data: b.build(), gate };
}

function quant(y: number): number {
  const steps = 65536;
  const tau = 6.283185307179586;
  return (Math.round((y / tau) * steps) * tau) / steps;
}
