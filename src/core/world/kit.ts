import { datan2, dcos, dsin, v3, type V3 } from '../math';
import { quantYaw } from './builder';
import type { RegionBuilder, SolidOpts } from './builder';
import { Mat, Slope, SolidFlag } from './types';

/**
 * Shared architecture kit. These helpers only save typing: every call site chooses the
 * exact position, size and purpose of what it builds.
 */

/** The Pillar: the natural stone spire the whole city hangs from. */
export function pillar(b: RegionBuilder, y0: number, y1: number, r0: number, r1: number, seed: number): void {
  const segH = 25;
  for (let y = y0; y < y1; y += segH) {
    const h = Math.min(segH, y1 - y);
    const t = (y - y0) / Math.max(1, y1 - y0);
    const r = r0 + (r1 - r0) * t;
    b.cyl(0, y, 0, r, h, { mat: Mat.Rock, tint: 0x9a8a76, flags: SolidFlag.NoWallRun });
    // Buttresses and bulges break the silhouette so the spire reads as rock, not a silo.
    const k = Math.floor(y / segH) + seed;
    for (let j = 0; j < 3; j++) {
      const ang = (((k * 137.5 + j * 121) % 360) * Math.PI) / 180;
      const rr = r - 1.5 - ((k + j) % 3);
      const w = 5 + ((k * 3 + j) % 4) * 2;
      b.decor('cyl', dcos(ang) * rr, y + h * 0.5, dsin(ang) * rr, w, h * (0.7 + ((k + j) % 3) * 0.15), 0, { mat: Mat.Rock, tint: j % 2 ? 0x8c7e6c : 0xa39480 });
    }
  }
}

/** Decorative support cables going up from a point (the city hangs from above). */
export function hangCable(b: RegionBuilder, x: number, y: number, z: number, topY: number, lean = 0): void {
  b.cable(v3(x, y, z), v3(x * (1 - lean), topY, z * (1 - lean)), 0, Mat.Metal, 0x2e3035);
}

/** Generation numeral carved into a surface. */
export function numeral(b: RegionBuilder, gen: number, x: number, y: number, z: number, yaw: number, size = 1.2): void {
  b.glyph('n' + gen, x, y, z, size, yaw, { tint: 0xf1e3c2 });
}

/** A cottage with a pitched (walkable) roof. Door faces +z before yaw (yaw only 0 or PI supported). */
export function cottage(
  b: RegionBuilder,
  x: number,
  y: number,
  z: number,
  w: number,
  d: number,
  h: number,
  o: { wall?: number; roof?: number; roofH?: number; flip?: boolean } = {},
): void {
  const wall = o.wall ?? 0xd8c8a8;
  const roof = o.roof ?? 0xa84a32;
  const rh = o.roofH ?? w * 0.35;
  b.block(x, y, z, w, h, d, { mat: Mat.Plaster, tint: wall });
  // Two roof ramps meeting at a ridge along z.
  b.ramp(x - w / 4 - 0.15, y + h, z, w / 2 + 0.3, rh, d + 0.6, Slope.PosX, { mat: Mat.Tile, tint: roof });
  b.ramp(x + w / 4 + 0.15, y + h, z, w / 2 + 0.3, rh, d + 0.6, Slope.NegX, { mat: Mat.Tile, tint: roof });
  // Door, windows, chimney.
  const f = o.flip ? -1 : 1;
  b.dbox(x, y, z + (d / 2) * f, 1.0, 2.0, 0.1, { mat: Mat.Wood, tint: 0x5a3c26 });
  b.dbox(x - w * 0.3, y + h * 0.45, z + (d / 2) * f, 0.8, 0.8, 0.08, { mat: Mat.Glass, tint: 0x334455 });
  b.dbox(x + w * 0.3, y + h * 0.45, z + (d / 2) * f, 0.8, 0.8, 0.08, { mat: Mat.Glass, tint: 0x334455 });
  b.block(x + w * 0.28, y + h + rh * 0.3, z - d * 0.25, 0.6, rh * 0.9, 0.6, { mat: Mat.Brick, tint: 0x8a5a44 });
}

/** Wooden fence between two points: low, vaultable. */
export function fence(b: RegionBuilder, x1: number, z1: number, x2: number, z2: number, y: number, h = 0.95): void {
  b.wall(x1, z1, x2, z2, y, h, 0.12, { mat: Mat.Wood, tint: 0x8a6a48 });
  const len = Math.hypot(x2 - x1, z2 - z1);
  const n = Math.max(1, Math.round(len / 2));
  for (let i = 0; i <= n; i++) {
    const t = i / n;
    b.dbox(x1 + (x2 - x1) * t, y, z1 + (z2 - z1) * t, 0.18, h + 0.15, 0.18, { mat: Mat.Wood, tint: 0x6e5238 });
  }
}

/** A tree (decor) with a solid trunk. */
export function tree(b: RegionBuilder, x: number, y: number, z: number, s = 1, tint = 0x5f8a3a): void {
  b.cyl(x, y, z, 0.22 * s, 2.2 * s, { mat: Mat.Wood, tint: 0x5a4030 });
  b.decor('tree', x, y, z, 2.2 * s, 6 * s, 0, { tint });
}

/** Scaffold deck: plank floor on four posts, with cross-braces. Top of planks at `top`. */
export function scaffoldDeck(b: RegionBuilder, x: number, top: number, z: number, w: number, d: number, postDown = 3, o: SolidOpts = {}): void {
  b.plat(x, top, z, w, d, 0.2, { mat: Mat.Wood, tint: 0xa88a60, ...o });
  const px = w / 2 - 0.12;
  const pz = d / 2 - 0.12;
  for (const [sx, sz] of [
    [-1, -1],
    [1, -1],
    [-1, 1],
    [1, 1],
  ]) {
    b.dbox(x + sx * px, top - postDown - 0.2, z + sz * pz, 0.14, postDown, 0.14, { mat: Mat.Wood, tint: 0x7a6040 });
  }
}

/** Numbered stair flight rising along a direction. */
export function flight(b: RegionBuilder, x: number, y0: number, z: number, width: number, rise: number, run: number, dir: 0 | 1 | 2 | 3, mat = Mat.Wood, tint = 0xa0825a): void {
  b.stairs(x, y0, z, width, rise, run, dir, { mat, tint });
}

/** Horizontal position on a circle around the Pillar. */
export function polar(angleDeg: number, r: number): { x: number; z: number } {
  const a = (angleDeg * Math.PI) / 180;
  return { x: dsin(a) * r, z: dcos(a) * r };
}

/** Hanging sign / lamp etc. */
export function lamp(b: RegionBuilder, x: number, y: number, z: number, tint = 0xffc070): void {
  b.decor('lamp', x, y, z, 0.3, 0.3, 0.3, { tint });
}

/** Box that is a building facade with a window grid (decor windows on the given face). */
export function facade(
  b: RegionBuilder,
  x: number,
  y0: number,
  z: number,
  w: number,
  h: number,
  d: number,
  o: { mat?: Mat; tint?: number; windows?: 'n' | 's' | 'e' | 'w' | 'all' | 'none'; floorH?: number; lit?: number; winTint?: number; flags?: number },
): void {
  b.block(x, y0, z, w, h, d, { mat: o.mat ?? Mat.Plaster, tint: o.tint ?? 0xcbb89a, flags: o.flags });
  const fh = o.floorH ?? 3;
  const sides = o.windows === 'all' ? ['n', 's', 'e', 'w'] : o.windows && o.windows !== 'none' ? [o.windows] : [];
  for (const side of sides) {
    const along = side === 'n' || side === 's' ? w : d;
    const nx = Math.max(1, Math.floor(along / 2.6));
    const ny = Math.max(1, Math.floor((h - 1) / fh));
    for (let iy = 0; iy < ny; iy++) {
      for (let ix = 0; ix < nx; ix++) {
        const u = -along / 2 + (ix + 0.5) * (along / nx);
        const wy = y0 + 1 + iy * fh + fh * 0.2;
        const lit = ((ix * 7 + iy * 13 + Math.floor(x + z)) % 11) / 11 < (o.lit ?? 0);
        const tint = lit ? 0xffd89a : (o.winTint ?? 0x39424c);
        const mat = lit ? Mat.Glow : Mat.Glass;
        if (side === 'n') b.dbox(x + u, wy, z - d / 2 - 0.03, 1.0, 1.4, 0.06, { mat, tint });
        if (side === 's') b.dbox(x + u, wy, z + d / 2 + 0.03, 1.0, 1.4, 0.06, { mat, tint });
        if (side === 'e') b.dbox(x + w / 2 + 0.03, wy, z + u, 0.06, 1.4, 1.0, { mat, tint });
        if (side === 'w') b.dbox(x - w / 2 - 0.03, wy, z + u, 0.06, 1.4, 1.0, { mat, tint });
      }
    }
  }
}

export { v3 };
export type { V3 };

export type HelixMove = 'start' | 'walk' | 'step' | 'hop' | 'jump' | 'long' | 'climb' | 'ramp' | 'ladder' | 'drop' | 'tall';

export interface HelixStep {
  move: HelixMove;
  /** deck length along the path (default 3) */
  len?: number;
  /** deck width across the path (default 2.6) */
  wid?: number;
  /** override rise for this move */
  dh?: number;
  /** override gap for this move */
  gap?: number;
  mat?: Mat;
  tint?: number;
  tag?: string;
  flags?: number;
  /** support style: 'post' timber posts, 'beam' beam to pillar, 'none' */
  support?: 'post' | 'beam' | 'none';
}

export interface HelixDeck {
  x: number;
  z: number;
  top: number;
  a: number;
  yaw: number;
  len: number;
}

const MOVE: Record<HelixMove, { gap: number; dh: number }> = {
  start: { gap: 0, dh: 0 },
  walk: { gap: 0, dh: 0 },
  step: { gap: 0.9, dh: 0.9 },
  hop: { gap: 1.8, dh: 0.3 },
  jump: { gap: 2.6, dh: 0 },
  long: { gap: 4.0, dh: -0.3 },
  climb: { gap: 0.25, dh: 2.2 },
  tall: { gap: 0.25, dh: 3.0 },
  ramp: { gap: 4.0, dh: 2.2 },
  ladder: { gap: 0.2, dh: 4.5 },
  drop: { gap: 1.8, dh: -1.5 },
};

/**
 * Lays an authored sequence of decks along a helix around the Pillar. The sequence of moves
 * (and so the rhythm and the skills tested) is chosen explicitly per call site; this helper
 * only converts that list to coordinates.
 * Angles in degrees; `dir` -1 walks clockwise (decreasing angle) when seen from above.
 */
export function helix(b: RegionBuilder, a0: number, r: number, y0: number, dir: 1 | -1, steps: HelixStep[], o: { mat?: Mat; tint?: number; pillarR?: number } = {}): HelixDeck[] {
  const out: HelixDeck[] = [];
  let a = a0;
  let top = y0;
  let prevLen = 0;
  for (let i = 0; i < steps.length; i++) {
    const s = steps[i];
    const m = MOVE[s.move];
    const len = s.len ?? 3;
    const wid = s.wid ?? 2.6;
    const gap = s.gap ?? m.gap;
    const dh = s.dh ?? m.dh;
    if (i > 0) {
      const arc = prevLen / 2 + gap + len / 2;
      a += dir * (arc / r) * (180 / Math.PI);
      top += dh;
    }
    const p = polar(a, r);
    // tangent direction of travel
    const ar = (a * Math.PI) / 180;
    const tx = dcos(ar) * dir;
    const tz = -dsin(ar) * dir;
    const yaw = quantYaw(datan2(-tz, tx));
    const mat = s.mat ?? o.mat ?? Mat.Wood;
    const tint = s.tint ?? o.tint ?? 0xa88a60;
    b.plat(p.x, top, p.z, len, wid, 0.25, { mat, tint, yaw, tag: s.tag, flags: s.flags });
    const prev = out[out.length - 1];
    if (prev && s.move === 'ramp') {
      const sx = prev.x + tx * (prev.len / 2);
      const sz = prev.z + tz * (prev.len / 2);
      const ex = p.x - tx * (len / 2);
      const ez = p.z - tz * (len / 2);
      b.rampBetween(sx, sz, prev.top, ex, ez, top, Math.min(wid, 1.8), { mat, tint });
    }
    if (prev && s.move === 'ladder') {
      // ladder on the near face of this deck's support block
      const lx = p.x - tx * (len / 2 + 0.05);
      const lz = p.z - tz * (len / 2 + 0.05);
      b.block(p.x, top - (dh + 0.25), p.z, len, dh, wid * 0.6, { mat, tint: 0x8a7050, yaw });
      b.ladder(lx - tx * 0.0, prev.top, lz, top, v3(-tx, 0, -tz));
    }
    const sup = s.support ?? 'beam';
    if (sup === 'beam' && o.pillarR) {
      // timber strut back to the rock
      const inner = polar(a, o.pillarR);
      b.cable(v3(p.x, top - 0.3, p.z), v3(inner.x, top - 2.5, inner.z), 0, Mat.Wood, 0x6e5238);
    } else if (sup === 'post') {
      b.dbox(p.x, top - 6, p.z, 0.2, 5.8, 0.2, { mat: Mat.Wood, tint: 0x6e5238 });
    }
    out.push({ x: p.x, z: p.z, top, a, yaw, len });
    prevLen = len;
  }
  return out;
}
