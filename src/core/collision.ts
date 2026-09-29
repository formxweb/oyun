import { clamp } from './math';
import { Shape, Slope, SolidFlag, type Solid } from './world/types';
import type { World, WorldState } from './world/world';

/**
 * Gravity frames. Index = frame id. Rows are the local axes expressed in world space.
 * world -> local: l = M * w ; local -> world: w = M^T * l.
 * Frame 0 is normal gravity (identity). The others are used by Gravity Shift.
 */
export const FRAMES: readonly (readonly number[])[] = [
  [1, 0, 0, 0, 1, 0, 0, 0, 1],
  [1, 0, 0, 0, -1, 0, 0, 0, -1],
  [0, -1, 0, 1, 0, 0, 0, 0, 1],
  [0, 1, 0, -1, 0, 0, 0, 0, 1],
  [1, 0, 0, 0, 0, 1, 0, -1, 0],
  [1, 0, 0, 0, 0, -1, 0, 1, 0],
];

/** Frame whose local up equals the given world axis vector (components in -1,0,1). */
export function frameForUp(ux: number, uy: number, uz: number): number {
  for (let f = 0; f < FRAMES.length; f++) {
    const m = FRAMES[f];
    if (m[3] === ux && m[4] === uy && m[5] === uz) return f;
  }
  return 0;
}

export function toLocal(f: number, x: number, y: number, z: number): [number, number, number] {
  if (f === 0) return [x, y, z];
  const m = FRAMES[f];
  return [m[0] * x + m[1] * y + m[2] * z, m[3] * x + m[4] * y + m[5] * z, m[6] * x + m[7] * y + m[8] * z];
}

export function toWorld(f: number, x: number, y: number, z: number): [number, number, number] {
  if (f === 0) return [x, y, z];
  const m = FRAMES[f];
  return [m[0] * x + m[3] * y + m[6] * z, m[1] * x + m[4] * y + m[7] * z, m[2] * x + m[5] * y + m[8] * z];
}

/** A solid expressed in the player's current gravity frame. */
export interface LBox {
  id: number;
  so: Solid;
  shape: Shape;
  cx: number;
  cy: number;
  cz: number;
  hx: number;
  hy: number;
  hz: number;
  c: number;
  s: number;
  slope: Slope;
  flags: number;
  bottom: number;
  top: number;
}

const newLBox = (): LBox => ({
  id: 0,
  so: null as unknown as Solid,
  shape: Shape.Box,
  cx: 0,
  cy: 0,
  cz: 0,
  hx: 0,
  hy: 0,
  hz: 0,
  c: 1,
  s: 0,
  slope: Slope.PosX,
  flags: 0,
  bottom: 0,
  top: 0,
});

export class Collider {
  readonly boxes: LBox[] = [];
  count = 0;
  private readonly pool: LBox[] = [];
  private readonly ids: number[] = [];

  constructor(private readonly world: World) {}

  /** Gather active solids in a local-frame AABB. */
  gather(
    frame: number,
    minX: number,
    minY: number,
    minZ: number,
    maxX: number,
    maxY: number,
    maxZ: number,
    st: WorldState,
    tick: number,
  ): void {
    let wminX = minX;
    let wminY = minY;
    let wminZ = minZ;
    let wmaxX = maxX;
    let wmaxY = maxY;
    let wmaxZ = maxZ;
    if (frame !== 0) {
      const a = toWorld(frame, minX, minY, minZ);
      const b = toWorld(frame, maxX, maxY, maxZ);
      wminX = Math.min(a[0], b[0]);
      wmaxX = Math.max(a[0], b[0]);
      wminY = Math.min(a[1], b[1]);
      wmaxY = Math.max(a[1], b[1]);
      wminZ = Math.min(a[2], b[2]);
      wmaxZ = Math.max(a[2], b[2]);
    }
    this.world.querySolids(wminX, wminY, wminZ, wmaxX, wmaxY, wmaxZ, this.ids);
    this.boxes.length = 0;
    this.count = 0;
    for (const id of this.ids) {
      const so = this.world.solids[id];
      if (!this.world.isSolidActive(so, st, tick)) continue;
      let b = this.pool[this.count];
      if (!b) {
        b = newLBox();
        this.pool.push(b);
      }
      b.id = id;
      b.so = so;
      b.flags = so.flags;
      if (frame === 0) {
        b.shape = so.shape;
        b.cx = so.x;
        b.cy = so.y;
        b.cz = so.z;
        b.hx = so.hx;
        b.hy = so.hy;
        b.hz = so.hz;
        b.c = so.c;
        b.s = so.s;
        b.slope = so.slope;
      } else {
        // In shifted frames every solid is treated as its axis-aligned bounds.
        const cw = toLocal(frame, (so.minX + so.maxX) / 2, (so.minY + so.maxY) / 2, (so.minZ + so.maxZ) / 2);
        const hw = toLocal(frame, (so.maxX - so.minX) / 2, (so.maxY - so.minY) / 2, (so.maxZ - so.minZ) / 2);
        b.shape = Shape.Box;
        b.cx = cw[0];
        b.cy = cw[1];
        b.cz = cw[2];
        b.hx = Math.abs(hw[0]);
        b.hy = Math.abs(hw[1]);
        b.hz = Math.abs(hw[2]);
        b.c = 1;
        b.s = 0;
        b.slope = Slope.PosX;
      }
      b.bottom = b.cy - b.hy;
      b.top = b.cy + b.hy;
      this.boxes.push(b);
      this.count++;
    }
  }
}

/** Point in the box's local horizontal frame. */
export function toBoxLocal(b: LBox, px: number, pz: number): [number, number] {
  const dx = px - b.cx;
  const dz = pz - b.cz;
  return [dx * b.c - dz * b.s, dx * b.s + dz * b.c];
}

/** Box-local horizontal vector back to frame space. */
export function fromBoxLocal(b: LBox, lx: number, lz: number): [number, number] {
  return [lx * b.c + lz * b.s, -lx * b.s + lz * b.c];
}

/** Does a circle at (px,pz) radius r overlap the solid's footprint? */
export function footOverlap(b: LBox, px: number, pz: number, r: number): boolean {
  if (b.shape === Shape.Cyl) {
    const dx = px - b.cx;
    const dz = pz - b.cz;
    const rr = b.hx + r;
    return dx * dx + dz * dz < rr * rr;
  }
  const [lx, lz] = toBoxLocal(b, px, pz);
  const qx = clamp(lx, -b.hx, b.hx);
  const qz = clamp(lz, -b.hz, b.hz);
  const ex = lx - qx;
  const ez = lz - qz;
  return ex * ex + ez * ez < r * r;
}

/** Height of the top surface at the footprint point closest to (px,pz). */
export function topAt(b: LBox, px: number, pz: number): number {
  if (b.shape !== Shape.Ramp) return b.top;
  const [lx, lz] = toBoxLocal(b, px, pz);
  let u: number;
  let h: number;
  switch (b.slope) {
    case Slope.PosX:
      u = clamp(lx, -b.hx, b.hx);
      h = b.hx;
      break;
    case Slope.NegX:
      u = -clamp(lx, -b.hx, b.hx);
      h = b.hx;
      break;
    case Slope.PosZ:
      u = clamp(lz, -b.hz, b.hz);
      h = b.hz;
      break;
    default:
      u = -clamp(lz, -b.hz, b.hz);
      h = b.hz;
      break;
  }
  return b.bottom + (2 * b.hy * (u + h)) / (2 * h);
}

/** Downhill direction (frame space, unit) and slope ratio rise/run for a ramp. */
export function rampDownhill(b: LBox): [number, number, number] {
  let lx = 0;
  let lz = 0;
  let run = 1;
  switch (b.slope) {
    case Slope.PosX:
      lx = -1;
      run = b.hx * 2;
      break;
    case Slope.NegX:
      lx = 1;
      run = b.hx * 2;
      break;
    case Slope.PosZ:
      lz = -1;
      run = b.hz * 2;
      break;
    default:
      lz = 1;
      run = b.hz * 2;
      break;
  }
  const [dx, dz] = fromBoxLocal(b, lx, lz);
  return [dx, dz, (b.hy * 2) / run];
}

export interface Push {
  nx: number;
  nz: number;
  depth: number;
  /** closest point on the solid boundary (frame space) */
  qx: number;
  qz: number;
}

/**
 * Horizontal separation of a circle from a solid footprint. Returns null when not overlapping.
 * Normal points from the solid toward the circle.
 */
export function circlePush(b: LBox, px: number, pz: number, r: number, out: Push): Push | null {
  if (b.shape === Shape.Cyl) {
    const dx = px - b.cx;
    const dz = pz - b.cz;
    const d2 = dx * dx + dz * dz;
    const rr = b.hx + r;
    if (d2 >= rr * rr) return null;
    const d = Math.sqrt(d2);
    if (d < 1e-6) {
      out.nx = 1;
      out.nz = 0;
      out.depth = rr;
    } else {
      out.nx = dx / d;
      out.nz = dz / d;
      out.depth = rr - d;
    }
    out.qx = b.cx + out.nx * b.hx;
    out.qz = b.cz + out.nz * b.hx;
    return out;
  }
  const [lx, lz] = toBoxLocal(b, px, pz);
  const qx = clamp(lx, -b.hx, b.hx);
  const qz = clamp(lz, -b.hz, b.hz);
  const ex = lx - qx;
  const ez = lz - qz;
  const d2 = ex * ex + ez * ez;
  if (d2 >= r * r) return null;
  let nlx: number;
  let nlz: number;
  let depth: number;
  let bqx = qx;
  let bqz = qz;
  if (d2 > 1e-12) {
    const d = Math.sqrt(d2);
    nlx = ex / d;
    nlz = ez / d;
    depth = r - d;
  } else {
    // Centre inside the footprint: push out along the shallowest axis.
    const px1 = b.hx - Math.abs(lx);
    const pz1 = b.hz - Math.abs(lz);
    if (px1 < pz1) {
      nlx = lx >= 0 ? 1 : -1;
      nlz = 0;
      depth = px1 + r;
      bqx = nlx * b.hx;
    } else {
      nlx = 0;
      nlz = lz >= 0 ? 1 : -1;
      depth = pz1 + r;
      bqz = nlz * b.hz;
    }
  }
  const [nx, nz] = fromBoxLocal(b, nlx, nlz);
  const [wqx, wqz] = fromBoxLocal(b, bqx, bqz);
  out.nx = nx;
  out.nz = nz;
  out.depth = depth;
  out.qx = b.cx + wqx;
  out.qz = b.cz + wqz;
  return out;
}

/**
 * Distance a ray travels inside the footprint starting at (px,pz) moving along (dx,dz).
 * Used to measure obstacle depth for vaulting.
 */
export function footprintDepth(b: LBox, px: number, pz: number, dx: number, dz: number): number {
  if (b.shape === Shape.Cyl) {
    // chord length through circle along ray from px,pz
    const ox = px - b.cx;
    const oz = pz - b.cz;
    const bq = ox * dx + oz * dz;
    const c = ox * ox + oz * oz - b.hx * b.hx;
    const disc = bq * bq - c;
    if (disc <= 0) return 0;
    const sq = Math.sqrt(disc);
    const t0 = -bq - sq;
    const t1 = -bq + sq;
    return Math.max(0, t1 - Math.max(0, t0));
  }
  const [lx, lz] = toBoxLocal(b, px, pz);
  const [ldx, ldz] = [dx * b.c - dz * b.s, dx * b.s + dz * b.c];
  let tmin = -1e9;
  let tmax = 1e9;
  if (Math.abs(ldx) < 1e-9) {
    if (lx < -b.hx || lx > b.hx) return 0;
  } else {
    let t1 = (-b.hx - lx) / ldx;
    let t2 = (b.hx - lx) / ldx;
    if (t1 > t2) [t1, t2] = [t2, t1];
    tmin = Math.max(tmin, t1);
    tmax = Math.min(tmax, t2);
  }
  if (Math.abs(ldz) < 1e-9) {
    if (lz < -b.hz || lz > b.hz) return 0;
  } else {
    let t1 = (-b.hz - lz) / ldz;
    let t2 = (b.hz - lz) / ldz;
    if (t1 > t2) [t1, t2] = [t2, t1];
    tmin = Math.max(tmin, t1);
    tmax = Math.min(tmax, t2);
  }
  if (tmax <= Math.max(0, tmin)) return 0;
  return tmax - Math.max(0, tmin);
}

/**
 * Segment vs solids ray test (world frame 0 only). Returns hit distance fraction or 1.
 * Used for tether line of sight and camera collision.
 */
export function raycastSolids(
  world: World,
  st: WorldState,
  tick: number,
  ax: number,
  ay: number,
  az: number,
  bx: number,
  by: number,
  bz: number,
  ids: number[],
  pad = 0,
): number {
  world.querySolids(
    Math.min(ax, bx) - pad,
    Math.min(ay, by) - pad,
    Math.min(az, bz) - pad,
    Math.max(ax, bx) + pad,
    Math.max(ay, by) + pad,
    Math.max(az, bz) + pad,
    ids,
  );
  let best = 1;
  const dx = bx - ax;
  const dy = by - ay;
  const dz = bz - az;
  for (const id of ids) {
    const so = world.solids[id];
    if (!world.isSolidActive(so, st, tick)) continue;
    const t = raySolid(so, ax, ay, az, dx, dy, dz, pad);
    if (t < best) best = t;
  }
  return best;
}

/** Ray (origin + t*d, t in [0,1]) against a solid (box/ramp treated as box, cyl as cylinder). */
export function raySolid(so: Solid, ax: number, ay: number, az: number, dx: number, dy: number, dz: number, pad: number): number {
  const hy = so.hy + pad;
  let tmin = 0;
  let tmax = 1;
  // vertical slab
  const oy = ay - so.y;
  if (Math.abs(dy) < 1e-12) {
    if (oy < -hy || oy > hy) return 1;
  } else {
    let t1 = (-hy - oy) / dy;
    let t2 = (hy - oy) / dy;
    if (t1 > t2) [t1, t2] = [t2, t1];
    tmin = Math.max(tmin, t1);
    tmax = Math.min(tmax, t2);
    if (tmin > tmax) return 1;
  }
  const ox = ax - so.x;
  const oz = az - so.z;
  if (so.shape === Shape.Cyl) {
    const r = so.hx + pad;
    const a = dx * dx + dz * dz;
    const b = ox * dx + oz * dz;
    const c = ox * ox + oz * oz - r * r;
    if (a < 1e-12) {
      if (c > 0) return 1;
    } else {
      const disc = b * b - a * c;
      if (disc < 0) return 1;
      const sq = Math.sqrt(disc);
      tmin = Math.max(tmin, (-b - sq) / a);
      tmax = Math.min(tmax, (-b + sq) / a);
    }
    return tmin <= tmax ? tmin : 1;
  }
  const lx = ox * so.c - oz * so.s;
  const lz = ox * so.s + oz * so.c;
  const ldx = dx * so.c - dz * so.s;
  const ldz = dx * so.s + dz * so.c;
  const hx = so.hx + pad;
  const hz = so.hz + pad;
  if (Math.abs(ldx) < 1e-12) {
    if (lx < -hx || lx > hx) return 1;
  } else {
    let t1 = (-hx - lx) / ldx;
    let t2 = (hx - lx) / ldx;
    if (t1 > t2) [t1, t2] = [t2, t1];
    tmin = Math.max(tmin, t1);
    tmax = Math.min(tmax, t2);
  }
  if (Math.abs(ldz) < 1e-12) {
    if (lz < -hz || lz > hz) return 1;
  } else {
    let t1 = (-hz - lz) / ldz;
    let t2 = (hz - lz) / ldz;
    if (t1 > t2) [t1, t2] = [t2, t1];
    tmin = Math.max(tmin, t1);
    tmax = Math.min(tmax, t2);
  }
  if (tmin > tmax) return 1;
  // Starting inside: ignore (camera may start inside thin decor-like solids)
  if (tmin <= 0) return tmax > 0 && tmin < 0 ? 1 : tmin;
  return tmin;
}

export const isWallRunnable = (b: LBox): boolean => (b.flags & SolidFlag.NoWallRun) === 0;
export const isGrabbable = (b: LBox): boolean => (b.flags & SolidFlag.NoGrab) === 0;
