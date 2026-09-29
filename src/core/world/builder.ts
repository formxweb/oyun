import { datan2, v3, type V3 } from '../math';
import {
  Mat,
  Shape,
  Slope,
  SolidFlag,
  type Ability,
  type Atmosphere,
  type CollectibleKind,
  type Decor,
  type DecorKind,
  type MemoryTrigger,
  type Mover,
  type RegionData,
  type RegionMeta,
  type RopeKind,
  type RouteAction,
  type Solid,
  type TriggerCond,
  type TrialDef,
  type ZoneKind,
} from './types';

export interface SolidOpts {
  mat?: Mat;
  tint?: number;
  flags?: number;
  yaw?: number;
  tag?: string;
  bounce?: number;
  conv?: [number, number];
}

export interface MoverOpts {
  kind: Mover['kind'];
  origin: V3;
  points?: V3[];
  segTime?: number[];
  pause?: number;
  loop?: boolean;
  ease?: boolean;
  phase?: number;
  angVel?: number;
  amp?: number;
  period?: number;
  axisAmp?: V3;
  flag?: string;
  fromYaw?: number;
  toYaw?: number;
  fromOff?: V3;
  toOff?: V3;
  dur?: number;
  activeFlag?: string;
}

export interface ZoneOpts {
  dir?: V3;
  strength?: number;
  period?: number;
  phase?: number;
  active?: number;
  key?: string;
}

/**
 * Authoring toolkit for regions. Coordinates are metres, Y up.
 * All placement is explicit — the builder never invents layout.
 */
export class RegionBuilder {
  readonly data: RegionData;
  private moverStack: number[] = [];
  private showStack: (string | null)[] = [];
  private hideStack: (string | null)[] = [];
  private defMat: Mat = Mat.Concrete;
  private defTint = 0xffffff;
  /** Offset applied to all placements (lets sections be authored in local coordinates). */
  private ox = 0;
  private oy = 0;
  private oz = 0;
  private offStack: [number, number, number][] = [];

  constructor(meta: Omit<RegionMeta, 'atmosphere'> & { atmosphere: Atmosphere }) {
    this.data = {
      meta,
      solids: [],
      movers: [],
      ropes: [],
      zones: [],
      anchors: [],
      collectibles: [],
      triggers: [],
      decor: [],
      trials: [],
      dailyGates: [],
      route: [],
      spawn: { pos: v3(meta.center.x, meta.baseY + 1, meta.center.z), yaw: 0 },
    };
  }

  get region(): number {
    return this.data.meta.index;
  }

  // ---------------------------------------------------------------- context

  material(m: Mat, tint = 0xffffff): this {
    this.defMat = m;
    this.defTint = tint;
    return this;
  }

  /** Author a section in local coordinates relative to (x,y,z). */
  at(x: number, y: number, z: number, fn: () => void): void {
    this.offStack.push([this.ox, this.oy, this.oz]);
    this.ox += x;
    this.oy += y;
    this.oz += z;
    try {
      fn();
    } finally {
      [this.ox, this.oy, this.oz] = this.offStack.pop()!;
    }
  }

  /** Geometry that only exists once a memory flag is set. */
  when(flag: string, fn: () => void): void {
    this.showStack.push(flag);
    try {
      fn();
    } finally {
      this.showStack.pop();
    }
  }

  /** Geometry that disappears once a memory flag is set. */
  unless(flag: string, fn: () => void): void {
    this.hideStack.push(flag);
    try {
      fn();
    } finally {
      this.hideStack.pop();
    }
  }

  private get show(): string | null {
    return this.showStack.length ? this.showStack[this.showStack.length - 1] : null;
  }
  private get hide(): string | null {
    return this.hideStack.length ? this.hideStack[this.hideStack.length - 1] : null;
  }
  private get curMover(): number {
    return this.moverStack.length ? this.moverStack[this.moverStack.length - 1] : -1;
  }

  /**
   * Create a mover. Geometry authored inside `fn` is relative to the mover origin
   * (the origin itself is given in the current offset frame).
   */
  mover(o: MoverOpts, fn: () => void): number {
    const id = this.data.movers.length;
    const m: Mover = {
      id,
      kind: o.kind,
      origin: v3(o.origin.x + this.ox, o.origin.y + this.oy, o.origin.z + this.oz),
      region: this.region,
      points: o.points ?? [],
      segTime: o.segTime ?? [4],
      pause: o.pause ?? 0,
      loop: o.loop ?? false,
      ease: o.ease ?? true,
      phase: o.phase ?? 0,
      angVel: o.angVel ?? 0,
      amp: o.amp ?? 0,
      period: o.period ?? 4,
      axisAmp: o.axisAmp ?? v3(),
      flag: o.flag ?? null,
      fromYaw: o.fromYaw ?? 0,
      toYaw: o.toYaw ?? 0,
      fromOff: o.fromOff ?? v3(),
      toOff: o.toOff ?? v3(),
      dur: o.dur ?? 3,
      activeFlag: o.activeFlag ?? null,
      ox: 0,
      oy: 0,
      oz: 0,
      oyaw: 0,
      vx: 0,
      vy: 0,
      vz: 0,
      vyaw: 0,
      solids: [],
    };
    this.data.movers.push(m);
    this.moverStack.push(id);
    this.offStack.push([this.ox, this.oy, this.oz]);
    this.ox = this.oy = this.oz = 0;
    try {
      fn();
    } finally {
      [this.ox, this.oy, this.oz] = this.offStack.pop()!;
      this.moverStack.pop();
    }
    return id;
  }

  // ---------------------------------------------------------------- solids

  private solid(shape: Shape, cx: number, cy: number, cz: number, hx: number, hy: number, hz: number, o: SolidOpts, slope = Slope.PosX): Solid {
    const mover = this.curMover;
    const s: Solid = {
      id: this.data.solids.length,
      shape,
      lx: cx + this.ox,
      ly: cy + this.oy,
      lz: cz + this.oz,
      hx,
      hy,
      hz,
      lyaw: o.yaw ?? 0,
      slope,
      mat: o.mat ?? this.defMat,
      tint: o.tint ?? this.defTint,
      flags: o.flags ?? 0,
      mover,
      region: this.region,
      show: this.show,
      hide: this.hide,
      tag: o.tag ?? null,
      bounce: o.bounce ?? 0,
      convX: o.conv ? o.conv[0] : 0,
      convZ: o.conv ? o.conv[1] : 0,
      x: 0,
      y: 0,
      z: 0,
      yaw: 0,
      c: 1,
      s: 0,
      minX: 0,
      maxX: 0,
      minY: 0,
      maxY: 0,
      minZ: 0,
      maxZ: 0,
    };
    if (hx <= 0 || hy <= 0 || hz <= 0) throw new Error(`Degenerate solid at ${cx},${cy},${cz}`);
    this.data.solids.push(s);
    if (mover >= 0) this.data.movers[mover].solids.push(s.id);
    return s;
  }

  /** Box by bottom-centre (x, y0, z) and full size. */
  block(x: number, y0: number, z: number, w: number, h: number, d: number, o: SolidOpts = {}): Solid {
    return this.solid(Shape.Box, x, y0 + h / 2, z, w / 2, h / 2, d / 2, o);
  }

  /** Platform whose TOP surface is at `top`. */
  plat(x: number, top: number, z: number, w: number, d: number, thick = 0.5, o: SolidOpts = {}): Solid {
    return this.solid(Shape.Box, x, top - thick / 2, z, w / 2, thick / 2, d / 2, o);
  }

  /** Box by min/max corners. */
  aabb(x0: number, y0: number, z0: number, x1: number, y1: number, z1: number, o: SolidOpts = {}): Solid {
    return this.solid(Shape.Box, (x0 + x1) / 2, (y0 + y1) / 2, (z0 + z1) / 2, Math.abs(x1 - x0) / 2, Math.abs(y1 - y0) / 2, Math.abs(z1 - z0) / 2, o);
  }

  /** Wall segment between two XZ points. */
  wall(x1: number, z1: number, x2: number, z2: number, y0: number, h: number, thick = 0.4, o: SolidOpts = {}): Solid {
    const dx = x2 - x1;
    const dz = z2 - z1;
    const len = Math.sqrt(dx * dx + dz * dz);
    const yaw = datan2(-dz, dx);
    return this.solid(Shape.Box, (x1 + x2) / 2, y0 + h / 2, (z1 + z2) / 2, len / 2, h / 2, thick / 2, { ...o, yaw: o.yaw ?? quantYaw(yaw) });
  }

  /** Horizontal beam between two XZ points at a given top height. */
  beam(x1: number, z1: number, x2: number, z2: number, top: number, width = 0.5, thick = 0.4, o: SolidOpts = {}): Solid {
    const dx = x2 - x1;
    const dz = z2 - z1;
    const len = Math.sqrt(dx * dx + dz * dz);
    const yaw = datan2(-dz, dx);
    return this.solid(Shape.Box, (x1 + x2) / 2, top - thick / 2, (z1 + z2) / 2, len / 2, thick / 2, width / 2, { ...o, yaw: o.yaw ?? quantYaw(yaw) });
  }

  /**
   * Walkable slope from (x1,z1) at height y1 to (x2,z2) at height y2, `width` wide.
   * The wedge's flat bottom sits at the lower height.
   */
  rampBetween(x1: number, z1: number, y1: number, x2: number, z2: number, y2: number, width: number, o: SolidOpts = {}): Solid {
    const dx = x2 - x1;
    const dz = z2 - z1;
    const len = Math.sqrt(dx * dx + dz * dz);
    const up = y2 >= y1;
    const yaw = quantYaw(datan2(-dz, dx));
    const lo = Math.min(y1, y2);
    const h = Math.max(0.05, Math.abs(y2 - y1));
    return this.solid(Shape.Ramp, (x1 + x2) / 2, lo + h / 2, (z1 + z2) / 2, len / 2, h / 2, width / 2, { ...o, yaw }, up ? Slope.PosX : Slope.NegX);
  }

  /** Ramp: bottom-centre, size, and which side is high. */
  ramp(x: number, y0: number, z: number, w: number, h: number, d: number, slope: Slope, o: SolidOpts = {}): Solid {
    return this.solid(Shape.Ramp, x, y0 + h / 2, z, w / 2, h / 2, d / 2, o, slope);
  }

  /** Vertical cylinder by bottom-centre. */
  cyl(x: number, y0: number, z: number, r: number, h: number, o: SolidOpts = {}): Solid {
    return this.solid(Shape.Cyl, x, y0 + h / 2, z, r, h / 2, r, o);
  }

  /** Straight staircase from (x,y0,z) rising `rise` over `run` in direction `dir` (0:+x 1:-x 2:+z 3:-z). */
  stairs(x: number, y0: number, z: number, width: number, rise: number, run: number, dir: 0 | 1 | 2 | 3, o: SolidOpts = {}): void {
    const steps = Math.max(1, Math.round(rise / 0.3));
    const sh = rise / steps;
    const sd = run / steps;
    for (let i = 0; i < steps; i++) {
      const along = sd * (i + 0.5);
      const top = y0 + sh * (i + 1);
      const px = dir === 0 ? x + along : dir === 1 ? x - along : x;
      const pz = dir === 2 ? z + along : dir === 3 ? z - along : z;
      const w = dir < 2 ? sd : width;
      const d = dir < 2 ? width : sd;
      this.block(px, top - Math.min(top - y0, 0.6), pz, w, Math.min(top - y0, 0.6), d, o);
    }
  }

  // ---------------------------------------------------------------- traversal objects

  rope(kind: RopeKind, a: V3, b: V3, n: V3 = v3(0, 0, 1), mat: Mat = Mat.Cloth): number {
    const id = this.data.ropes.length;
    this.data.ropes.push({
      id,
      kind,
      a: v3(a.x + this.ox, a.y + this.oy, a.z + this.oz),
      b: v3(b.x + this.ox, b.y + this.oy, b.z + this.oz),
      n,
      region: this.region,
      mover: this.curMover,
      show: this.show,
      hide: this.hide,
      mat,
    });
    return id;
  }

  /** Ladder on a wall: bottom point, top height, outward normal of the wall. */
  ladder(x: number, y0: number, z: number, top: number, n: V3): number {
    return this.rope('ladder', v3(x, y0, z), v3(x, top, z), n, Mat.Metal);
  }

  hook(x: number, y: number, z: number): number {
    return this.rope('hook', v3(x, y, z), v3(x, y, z), v3(0, 1, 0), Mat.Brass);
  }

  zone(kind: ZoneKind, x0: number, y0: number, z0: number, x1: number, y1: number, z1: number, o: ZoneOpts = {}): number {
    const id = this.data.zones.length;
    this.data.zones.push({
      id,
      kind,
      min: v3(Math.min(x0, x1) + this.ox, Math.min(y0, y1) + this.oy, Math.min(z0, z1) + this.oz),
      max: v3(Math.max(x0, x1) + this.ox, Math.max(y0, y1) + this.oy, Math.max(z0, z1) + this.oz),
      region: this.region,
      dir: o.dir ?? v3(),
      strength: o.strength ?? 0,
      period: o.period ?? 0,
      phase: o.phase ?? 0,
      active: o.active ?? 0,
      key: o.key ?? null,
      show: this.show,
      hide: this.hide,
    });
    return id;
  }

  anchor(id: string, x: number, y: number, z: number, yaw: number, nameKey: string, major = false): void {
    this.data.anchors.push({ id, pos: v3(x + this.ox, y + this.oy, z + this.oz), yaw, region: this.region, nameKey, major });
  }

  collect(id: string, kind: CollectibleKind, x: number, y: number, z: number, ability?: Ability): void {
    this.data.collectibles.push({
      id,
      kind,
      pos: v3(x + this.ox, y + this.oy, z + this.oz),
      region: this.region,
      show: this.show,
      hide: this.hide,
      ability,
    });
  }

  trigger(id: string, flag: string, cond: TriggerCond, o: { textKey?: string; delay?: number; focus?: V3; ngPlusOnly?: boolean; storyOnly?: boolean } = {}): void {
    const c = this.offsetCond(cond);
    const t: MemoryTrigger = {
      id,
      flag,
      cond: c,
      region: this.region,
      textKey: o.textKey ?? null,
      ngPlusOnly: o.ngPlusOnly ?? false,
      storyOnly: o.storyOnly ?? false,
      delay: o.delay ?? 0,
      focus: o.focus ? v3(o.focus.x + this.ox, o.focus.y + this.oy, o.focus.z + this.oz) : null,
    };
    this.data.triggers.push(t);
  }

  private offsetCond(c: TriggerCond): TriggerCond {
    const off = (p: V3): V3 => v3(p.x + this.ox, p.y + this.oy, p.z + this.oz);
    switch (c.type) {
      case 'enter':
        return { type: 'enter', min: off(c.min), max: off(c.max) };
      case 'fallPass':
        return { type: 'fallPass', pos: off(c.pos), radius: c.radius };
      case 'interact':
        return { type: 'interact', pos: off(c.pos), radius: c.radius };
      case 'height':
        return { type: 'height', y: c.y + this.oy };
      default:
        return c;
    }
  }

  // ---------------------------------------------------------------- decor

  decor(kind: DecorKind, x: number, y: number, z: number, sx: number, sy: number, sz: number, o: { mat?: Mat; tint?: number; yaw?: number; q?: V3; key?: string; fallOnly?: boolean; landmark?: boolean } = {}): Decor {
    const d: Decor = {
      kind,
      p: v3(x + this.ox, y + this.oy, z + this.oz),
      s: v3(sx, sy, sz),
      yaw: o.yaw ?? 0,
      mat: o.mat ?? this.defMat,
      tint: o.tint ?? this.defTint,
      region: this.region,
      mover: this.curMover,
      show: this.show,
      hide: this.hide,
      q: o.q ? v3(o.q.x + this.ox, o.q.y + this.oy, o.q.z + this.oz) : undefined,
      key: o.key,
      fallOnly: o.fallOnly,
      landmark: o.landmark,
    };
    this.data.decor.push(d);
    return d;
  }

  /** Render-only box by bottom-centre. */
  dbox(x: number, y0: number, z: number, w: number, h: number, d: number, o: { mat?: Mat; tint?: number; yaw?: number; landmark?: boolean; fallOnly?: boolean } = {}): Decor {
    return this.decor('box', x, y0 + h / 2, z, w, h, d, o);
  }

  cable(a: V3, b: V3, sag = 0.3, mat: Mat = Mat.Metal, tint = 0x333333): Decor {
    return this.decor('cable', a.x, a.y, a.z, sag, 0, 0, { q: b, mat, tint });
  }

  glyph(key: string, x: number, y: number, z: number, size: number, yaw: number, o: { fallOnly?: boolean; tint?: number; up?: boolean } = {}): Decor {
    return this.decor('glyph', x, y, z, size, size, o.up ? 1 : 0, { key, yaw, fallOnly: o.fallOnly, tint: o.tint ?? 0xf2e6c8, mat: Mat.Paint });
  }

  // ---------------------------------------------------------------- modes

  trial(t: Omit<TrialDef, 'region'>): void {
    const off = (p: V3): V3 => v3(p.x + this.ox, p.y + this.oy, p.z + this.oz);
    this.data.trials.push({
      ...t,
      region: this.region,
      start: off(t.start),
      gates: t.gates.map((g) => ({ pos: off(g.pos), r: g.r })),
      finish: { pos: off(t.finish.pos), r: t.finish.r },
      master: t.master.map((g) => ({ pos: off(g.pos), r: g.r })),
    });
  }

  daily(x: number, y: number, z: number): void {
    this.data.dailyGates.push(v3(x + this.ox, y + this.oy, z + this.oz));
  }

  route(x: number, y: number, z: number, a: RouteAction, extra: { t?: number; m?: number; note?: string } = {}): void {
    this.data.route.push({ p: v3(x + this.ox, y + this.oy, z + this.oz), a, ...extra });
  }

  spawn(x: number, y: number, z: number, yaw: number): void {
    this.data.spawn = { pos: v3(x + this.ox, y + this.oy, z + this.oz), yaw };
  }

  build(): RegionData {
    return this.data;
  }
}

/** Snap yaw to 1/65536 of a turn so authoring is exactly reproducible. */
export function quantYaw(y: number): number {
  const steps = 65536;
  const tau = 6.283185307179586;
  return (Math.round((y / tau) * steps) * tau) / steps;
}

export { Mat, Slope, SolidFlag };
