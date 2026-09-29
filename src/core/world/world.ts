import { dcos, dsin, smoothstep, type V3 } from '../math';
import {
  Shape,
  SolidFlag,
  type Anchor,
  type Collectible,
  type Decor,
  type MemoryTrigger,
  type Mover,
  type RegionData,
  type RegionMeta,
  type Rope,
  type Solid,
  type TrialDef,
  type Zone,
} from './types';

export const TICK_RATE = 120;
export const DT = 1 / TICK_RATE;

const CELL = 8;
const INV_CELL = 1 / CELL;
const cellKey = (ix: number, iy: number, iz: number): number => ix + 2048 + (iz + 2048) * 4096 + (iy + 64) * 16777216;

/** Rotate (x, z) by yaw using precomputed cos/sin (three.js Y-rotation convention). */
export function rotY(x: number, z: number, c: number, s: number): [number, number] {
  return [x * c + z * s, -x * s + z * c];
}

export function computeSolidBounds(so: Solid): void {
  let ex: number;
  let ez: number;
  if (so.shape === Shape.Cyl) {
    ex = so.hx;
    ez = so.hx;
  } else {
    const ac = Math.abs(so.c);
    const as = Math.abs(so.s);
    ex = ac * so.hx + as * so.hz;
    ez = as * so.hx + ac * so.hz;
  }
  so.minX = so.x - ex;
  so.maxX = so.x + ex;
  so.minY = so.y - so.hy;
  so.maxY = so.y + so.hy;
  so.minZ = so.z - ez;
  so.maxZ = so.z + ez;
}

/**
 * Per-simulation mutable world state. Static geometry lives in {@link World} and is shared.
 */
export interface WorldState {
  flags: Set<string>;
  /** tick at which a flag became set (for transition movers) */
  flagTick: Map<string, number>;
  /** crumble solid id -> tick when it started crumbling */
  crumble: Map<number, number>;
  /** true while the player is in a major fall (fall-only geometry is solid) */
  fallActive: boolean;
}

export function newWorldState(flags: Iterable<string> = []): WorldState {
  const s: WorldState = { flags: new Set(flags), flagTick: new Map(), crumble: new Map(), fallActive: false };
  for (const f of s.flags) s.flagTick.set(f, -1e9);
  return s;
}

export const CRUMBLE_DELAY = Math.round(0.65 * TICK_RATE);
export const CRUMBLE_RESPAWN = Math.round(4.5 * TICK_RATE);

export class World {
  readonly regions: RegionMeta[] = [];
  readonly solids: Solid[] = [];
  readonly movers: Mover[] = [];
  readonly ropes: Rope[] = [];
  readonly zones: Zone[] = [];
  readonly anchors: Anchor[] = [];
  readonly anchorById = new Map<string, Anchor>();
  readonly collectibles: Collectible[] = [];
  readonly collectibleById = new Map<string, Collectible>();
  readonly triggers: MemoryTrigger[] = [];
  readonly decor: Decor[] = [];
  readonly trials: TrialDef[] = [];
  readonly dailyGates: V3[][] = [];
  readonly regionData: RegionData[] = [];
  private readonly grid = new Map<number, number[]>();
  private readonly dynamicSolids: number[] = [];
  private readonly ropeGrid = new Map<number, number[]>();
  private readonly dynamicRopes: number[] = [];
  private stamp = 1;
  private readonly marks: Uint32Array;

  constructor(regions: RegionData[]) {
    let solidBase = 0;
    let moverBase = 0;
    let ropeBase = 0;
    let zoneBase = 0;
    for (const r of regions) {
      this.regionData.push(r);
      this.regions.push(r.meta);
      for (const m of r.movers) {
        m.id += moverBase;
        m.solids = m.solids.map((i) => i + solidBase);
        this.movers.push(m);
      }
      for (const so of r.solids) {
        so.id += solidBase;
        if (so.mover >= 0) so.mover += moverBase;
        this.solids.push(so);
      }
      for (const ro of r.ropes) {
        ro.id += ropeBase;
        if (ro.mover >= 0) ro.mover += moverBase;
        this.ropes.push(ro);
      }
      for (const z of r.zones) {
        z.id += zoneBase;
        this.zones.push(z);
      }
      for (const d of r.decor) {
        if (d.mover >= 0) d.mover += moverBase;
        this.decor.push(d);
      }
      for (const a of r.anchors) {
        this.anchors.push(a);
        this.anchorById.set(a.id, a);
      }
      for (const c of r.collectibles) {
        this.collectibles.push(c);
        this.collectibleById.set(c.id, c);
      }
      this.triggers.push(...r.triggers);
      this.trials.push(...r.trials);
      this.dailyGates.push(r.dailyGates);
      solidBase += r.solids.length;
      moverBase += r.movers.length;
      ropeBase += r.ropes.length;
      zoneBase += r.zones.length;
    }
    this.marks = new Uint32Array(this.solids.length + 1);
    // Static solids: compute transform and insert in grid.
    for (const so of this.solids) {
      if (so.mover >= 0) {
        this.dynamicSolids.push(so.id);
        continue;
      }
      so.x = so.lx;
      so.y = so.ly;
      so.z = so.lz;
      so.yaw = so.lyaw;
      so.c = dcos(so.yaw);
      so.s = dsin(so.yaw);
      computeSolidBounds(so);
      const x0 = Math.floor(so.minX * INV_CELL);
      const x1 = Math.floor(so.maxX * INV_CELL);
      const y0 = Math.floor(so.minY * INV_CELL);
      const y1 = Math.floor(so.maxY * INV_CELL);
      const z0 = Math.floor(so.minZ * INV_CELL);
      const z1 = Math.floor(so.maxZ * INV_CELL);
      for (let ix = x0; ix <= x1; ix++)
        for (let iy = y0; iy <= y1; iy++)
          for (let iz = z0; iz <= z1; iz++) {
            const k = cellKey(ix, iy, iz);
            let list = this.grid.get(k);
            if (!list) {
              list = [];
              this.grid.set(k, list);
            }
            list.push(so.id);
          }
    }
    for (const ro of this.ropes) {
      if (ro.mover >= 0) {
        this.dynamicRopes.push(ro.id);
        continue;
      }
      const minX = Math.min(ro.a.x, ro.b.x) - 2;
      const maxX = Math.max(ro.a.x, ro.b.x) + 2;
      const minY = Math.min(ro.a.y, ro.b.y) - 3;
      const maxY = Math.max(ro.a.y, ro.b.y) + 3;
      const minZ = Math.min(ro.a.z, ro.b.z) - 2;
      const maxZ = Math.max(ro.a.z, ro.b.z) + 2;
      const reach = ro.kind === 'hook' ? 10 : 0;
      for (let ix = Math.floor((minX - reach) * INV_CELL); ix <= Math.floor((maxX + reach) * INV_CELL); ix++)
        for (let iy = Math.floor((minY - reach) * INV_CELL); iy <= Math.floor((maxY + reach) * INV_CELL); iy++)
          for (let iz = Math.floor((minZ - reach) * INV_CELL); iz <= Math.floor((maxZ + reach) * INV_CELL); iz++) {
            const k = cellKey(ix, iy, iz);
            let list = this.ropeGrid.get(k);
            if (!list) {
              list = [];
              this.ropeGrid.set(k, list);
            }
            list.push(ro.id);
          }
    }
    this.applyMovers(0, newWorldState());
  }

  regionAt(y: number): number {
    for (let i = this.regions.length - 1; i >= 0; i--) if (y >= this.regions[i].baseY - 0.01) return i;
    return 0;
  }

  /** Evaluate every mover at `tick` and update attached solid transforms. */
  applyMovers(tick: number, st: WorldState): void {
    const t = tick / TICK_RATE;
    for (const m of this.movers) {
      const px = m.ox;
      const py = m.oy;
      const pz = m.oz;
      const pyaw = m.oyaw;
      evalMover(m, t, tick, st);
      m.vx = (m.ox - px) * TICK_RATE;
      m.vy = (m.oy - py) * TICK_RATE;
      m.vz = (m.oz - pz) * TICK_RATE;
      m.vyaw = (m.oyaw - pyaw) * TICK_RATE;
      const c = dcos(m.oyaw);
      const s = dsin(m.oyaw);
      for (const sid of m.solids) {
        const so = this.solids[sid];
        const [rx, rz] = rotY(so.lx, so.lz, c, s);
        so.x = m.origin.x + m.ox + rx;
        so.y = m.origin.y + m.oy + so.ly;
        so.z = m.origin.z + m.oz + rz;
        so.yaw = so.lyaw + m.oyaw;
        so.c = dcos(so.yaw);
        so.s = dsin(so.yaw);
        computeSolidBounds(so);
      }
    }
  }

  /** Mover pose at an arbitrary tick without touching runtime state (for prediction). */
  moverPoseAt(m: Mover, tick: number, st: WorldState): { x: number; y: number; z: number; yaw: number } {
    const save = [m.ox, m.oy, m.oz, m.oyaw];
    evalMover(m, tick / TICK_RATE, tick, st);
    const r = { x: m.ox, y: m.oy, z: m.oz, yaw: m.oyaw };
    [m.ox, m.oy, m.oz, m.oyaw] = save;
    return r;
  }

  isSolidActive(so: Solid, st: WorldState, tick: number): boolean {
    if (so.flags & SolidFlag.Decor) return false;
    if (so.show !== null && !st.flags.has(so.show)) return false;
    if (so.hide !== null && st.flags.has(so.hide)) return false;
    // Fall lines: only solid during a major fall, or once the player has landed on them (remembered).
    if (so.flags & SolidFlag.FallOnly && !st.fallActive && !(so.tag !== null && st.flags.has(so.tag))) return false;
    if (so.flags & SolidFlag.Crumble) {
      const t0 = st.crumble.get(so.id);
      if (t0 !== undefined) {
        const e = tick - t0;
        if (e >= CRUMBLE_DELAY && e < CRUMBLE_DELAY + CRUMBLE_RESPAWN) return false;
      }
    }
    return true;
  }

  isRopeActive(ro: Rope, st: WorldState): boolean {
    if (ro.show !== null && !st.flags.has(ro.show)) return false;
    if (ro.hide !== null && st.flags.has(ro.hide)) return false;
    return true;
  }

  isZoneActive(z: Zone, st: WorldState): boolean {
    if (z.show !== null && !st.flags.has(z.show)) return false;
    if (z.hide !== null && st.flags.has(z.hide)) return false;
    return true;
  }

  /** Collect candidate solid ids overlapping an AABB into `out`. Returns count. */
  querySolids(minX: number, minY: number, minZ: number, maxX: number, maxY: number, maxZ: number, out: number[]): number {
    out.length = 0;
    this.stamp++;
    if (this.stamp === 0xffffffff) {
      this.marks.fill(0);
      this.stamp = 1;
    }
    const x0 = Math.floor(minX * INV_CELL);
    const x1 = Math.floor(maxX * INV_CELL);
    const y0 = Math.floor(minY * INV_CELL);
    const y1 = Math.floor(maxY * INV_CELL);
    const z0 = Math.floor(minZ * INV_CELL);
    const z1 = Math.floor(maxZ * INV_CELL);
    for (let ix = x0; ix <= x1; ix++)
      for (let iy = y0; iy <= y1; iy++)
        for (let iz = z0; iz <= z1; iz++) {
          const list = this.grid.get(cellKey(ix, iy, iz));
          if (!list) continue;
          for (let i = 0; i < list.length; i++) {
            const id = list[i];
            if (this.marks[id] === this.stamp) continue;
            this.marks[id] = this.stamp;
            const so = this.solids[id];
            if (so.maxX < minX || so.minX > maxX || so.maxY < minY || so.minY > maxY || so.maxZ < minZ || so.minZ > maxZ) continue;
            out.push(id);
          }
        }
    for (let i = 0; i < this.dynamicSolids.length; i++) {
      const so = this.solids[this.dynamicSolids[i]];
      if (so.maxX < minX || so.minX > maxX || so.maxY < minY || so.minY > maxY || so.maxZ < minZ || so.minZ > maxZ) continue;
      out.push(so.id);
    }
    return out.length;
  }

  queryRopes(x: number, y: number, z: number, out: number[]): number {
    out.length = 0;
    const list = this.ropeGrid.get(cellKey(Math.floor(x * INV_CELL), Math.floor(y * INV_CELL), Math.floor(z * INV_CELL)));
    if (list) for (const id of list) out.push(id);
    for (const id of this.dynamicRopes) out.push(id);
    return out.length;
  }

  /** World position of a rope endpoint (ropes can ride movers). */
  ropePoint(ro: Rope, which: 'a' | 'b'): V3 {
    const p = ro[which];
    if (ro.mover < 0) return p;
    const m = this.movers[ro.mover];
    const c = dcos(m.oyaw);
    const s = dsin(m.oyaw);
    const [rx, rz] = rotY(p.x, p.z, c, s);
    return { x: m.origin.x + m.ox + rx, y: m.origin.y + m.oy + p.y, z: m.origin.z + m.oz + rz };
  }
}

function easeT(u: number, ease: boolean): number {
  return ease ? smoothstep(0, 1, u) : u;
}

export function evalMover(m: Mover, t: number, tick: number, st: WorldState): void {
  if (m.activeFlag !== null && !st.flags.has(m.activeFlag)) {
    // Parked at its initial pose.
    if (m.kind === 'path' && m.points.length) {
      m.ox = m.points[0].x;
      m.oy = m.points[0].y;
      m.oz = m.points[0].z;
    } else {
      m.ox = m.oy = m.oz = 0;
    }
    m.oyaw = m.kind === 'rotate' ? m.phase : 0;
    return;
  }
  if (m.activeFlag !== null) {
    // Woken this session: run from the moment it was woken, starting at its parked pose.
    const t0 = st.flagTick.get(m.activeFlag);
    if (t0 !== undefined && t0 > -1e8) t = Math.max(0, tick - t0) / TICK_RATE;
  }
  switch (m.kind) {
    case 'path': {
      const n = m.points.length;
      if (n < 2) {
        m.ox = n ? m.points[0].x : 0;
        m.oy = n ? m.points[0].y : 0;
        m.oz = n ? m.points[0].z : 0;
        m.oyaw = 0;
        return;
      }
      // Build the sequence of segments for loop or ping-pong.
      const segs = m.loop ? n : (n - 1) * 2;
      let cycle = 0;
      for (let i = 0; i < segs; i++) cycle += segDuration(m, i, n) + m.pause;
      let u = (t + m.phase) % cycle;
      if (u < 0) u += cycle;
      for (let i = 0; i < segs; i++) {
        const d = segDuration(m, i, n);
        const [ia, ib] = segEnds(m, i, n);
        if (u < m.pause) {
          const p = m.points[ia];
          m.ox = p.x;
          m.oy = p.y;
          m.oz = p.z;
          m.oyaw = 0;
          return;
        }
        u -= m.pause;
        if (u < d) {
          const k = easeT(u / d, m.ease);
          const a = m.points[ia];
          const b = m.points[ib];
          m.ox = a.x + (b.x - a.x) * k;
          m.oy = a.y + (b.y - a.y) * k;
          m.oz = a.z + (b.z - a.z) * k;
          m.oyaw = 0;
          return;
        }
        u -= d;
      }
      const p = m.points[0];
      m.ox = p.x;
      m.oy = p.y;
      m.oz = p.z;
      m.oyaw = 0;
      return;
    }
    case 'rotate':
      m.ox = m.oy = m.oz = 0;
      m.oyaw = m.phase + m.angVel * t;
      return;
    case 'oscillate':
    case 'pendulum': {
      const w = dsin(((t + m.phase) / m.period) * 6.283185307179586);
      m.ox = m.axisAmp.x * w;
      m.oy = m.axisAmp.y * w;
      m.oz = m.axisAmp.z * w;
      m.oyaw = m.amp * w;
      return;
    }
    case 'transition': {
      let k = 0;
      if (m.flag !== null && st.flags.has(m.flag)) {
        const t0 = st.flagTick.get(m.flag) ?? -1e9;
        k = smoothstep(0, 1, (tick - t0) / TICK_RATE / m.dur);
      }
      m.ox = m.fromOff.x + (m.toOff.x - m.fromOff.x) * k;
      m.oy = m.fromOff.y + (m.toOff.y - m.fromOff.y) * k;
      m.oz = m.fromOff.z + (m.toOff.z - m.fromOff.z) * k;
      m.oyaw = m.fromYaw + (m.toYaw - m.fromYaw) * k;
      return;
    }
  }
}

function segEnds(m: Mover, i: number, n: number): [number, number] {
  if (m.loop) return [i, (i + 1) % n];
  if (i < n - 1) return [i, i + 1];
  const j = i - (n - 1);
  return [n - 1 - j, n - 2 - j];
}

function segDuration(m: Mover, i: number, n: number): number {
  if (m.loop) return m.segTime[i % m.segTime.length];
  const [a, b] = segEnds(m, i, n);
  return m.segTime[Math.min(a, b) % m.segTime.length];
}
