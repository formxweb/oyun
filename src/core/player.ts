import {
  Collider,
  circlePush,
  footOverlap,
  footprintDepth,
  frameForUp,
  fromBoxLocal,
  isGrabbable,
  isWallRunnable,
  rampDownhill,
  toBoxLocal,
  toLocal,
  toWorld,
  topAt,
  bottomAt,
  raycastSolids,
  type LBox,
  type Push,
} from './collision';
import type { EventSink } from './events';
import { Btn, type InputFrame } from './input';
import { clamp, dcos, dsin, smoothstep, yawForward, yawRight } from './math';
import { T, ticks } from './tuning';
import { Ability, Shape, SolidFlag, type Rope } from './world/types';
import { DT, TICK_RATE, type World, type WorldState } from './world/world';

export const enum Mode {
  Ground = 0,
  Air = 1,
  Slide = 2,
  Hang = 3,
  Mantle = 4,
  Vault = 5,
  WallRun = 6,
  WallClimb = 7,
  Roll = 8,
  Stagger = 9,
  Line = 10,
  Zip = 11,
  Swing = 12,
  Ladder = 13,
}

export const MODE_NAMES = [
  'ground',
  'air',
  'slide',
  'hang',
  'mantle',
  'vault',
  'wallrun',
  'wallclimb',
  'roll',
  'stagger',
  'line',
  'zip',
  'swing',
  'ladder',
] as const;

export interface PlayerState {
  /** Feet position and velocity. World space between ticks. */
  x: number;
  y: number;
  z: number;
  vx: number;
  vy: number;
  vz: number;
  frame: number;
  mode: Mode;
  modeT: number;
  crouch: boolean;
  fx: number;
  fz: number;
  grounded: boolean;
  groundId: number;
  groundMat: number;
  groundFlags: number;
  platVx: number;
  platVy: number;
  platVz: number;
  coyote: number;
  jumpBuf: number;
  crouchBuf: number;
  canCut: boolean;
  prevBtn: number;
  peakY: number;
  majorFall: boolean;
  slideCool: number;
  stepAcc: number;
  // wall memory (local frame)
  lastRunNx: number;
  lastRunNz: number;
  hasLastRun: boolean;
  lastWJNx: number;
  lastWJNz: number;
  hasLastWJ: boolean;
  wallClimbUsed: boolean;
  wrNx: number;
  wrNz: number;
  wrTx: number;
  wrTz: number;
  wrSpeed: number;
  wrSide: number;
  // ledge
  ledgeId: number;
  ledgeLx: number;
  ledgeLz: number;
  ledgeNlx: number;
  ledgeNlz: number;
  ledgeIgnoreId: number;
  ledgeIgnore: number;
  // mantle / vault animation (local frame)
  ax0: number;
  ay0: number;
  az0: number;
  ax1: number;
  ay1: number;
  az1: number;
  aPeak: number;
  aDur: number;
  aExitVx: number;
  aExitVz: number;
  aExitAir: boolean;
  aCrouch: boolean;
  // ropes (local frame)
  ropeId: number;
  ropeT: number;
  ropeLen: number;
  ropeSpeed: number;
  pivX: number;
  pivY: number;
  pivZ: number;
  ropeIgnoreId: number;
  ropeIgnore: number;
  // gravity shift
  gravTimer: number;
  shiftGrace: number;
  // misc
  staggerDur: number;
  lastFall: number;
  squish: number;
}

export function newPlayer(x: number, y: number, z: number, yaw: number): PlayerState {
  const f = yawForward(yaw);
  return {
    x,
    y,
    z,
    vx: 0,
    vy: 0,
    vz: 0,
    frame: 0,
    mode: Mode.Air,
    modeT: 0,
    crouch: false,
    fx: f.x,
    fz: f.z,
    grounded: false,
    groundId: -1,
    groundMat: 0,
    groundFlags: 0,
    platVx: 0,
    platVy: 0,
    platVz: 0,
    coyote: 0,
    jumpBuf: 0,
    crouchBuf: 0,
    canCut: false,
    prevBtn: 0,
    peakY: y,
    majorFall: false,
    slideCool: 0,
    stepAcc: 0,
    lastRunNx: 0,
    lastRunNz: 0,
    hasLastRun: false,
    lastWJNx: 0,
    lastWJNz: 0,
    hasLastWJ: false,
    wallClimbUsed: false,
    wrNx: 0,
    wrNz: 0,
    wrTx: 0,
    wrTz: 0,
    wrSpeed: 0,
    wrSide: 0,
    ledgeId: -1,
    ledgeLx: 0,
    ledgeLz: 0,
    ledgeNlx: 0,
    ledgeNlz: 0,
    ledgeIgnoreId: -1,
    ledgeIgnore: 0,
    ax0: 0,
    ay0: 0,
    az0: 0,
    ax1: 0,
    ay1: 0,
    az1: 0,
    aPeak: 0,
    aDur: 1,
    aExitVx: 0,
    aExitVz: 0,
    aExitAir: false,
    aCrouch: false,
    ropeId: -1,
    ropeT: 0,
    ropeLen: 0,
    ropeSpeed: 0,
    pivX: 0,
    pivY: 0,
    pivZ: 0,
    ropeIgnoreId: -1,
    ropeIgnore: 0,
    gravTimer: 0,
    shiftGrace: 0,
    staggerDur: 0,
    lastFall: 0,
    squish: 0,
  };
}

/** External influences computed by the simulation from zones (world space). */
export interface ExtForces {
  ax: number;
  ay: number;
  az: number;
  /** if > 0, launch upward (world up) to at least this speed */
  launch: number;
  shiftAllowed: boolean;
  shiftDuration: number;
  gravReset: boolean;
  /** knockback impulse (world) */
  kx: number;
  ky: number;
  kz: number;
}

export const newExt = (): ExtForces => ({ ax: 0, ay: 0, az: 0, launch: 0, shiftAllowed: false, shiftDuration: 0, gravReset: false, kx: 0, ky: 0, kz: 0 });

interface Contact {
  b: LBox;
  nx: number;
  nz: number;
  qx: number;
  qz: number;
}

interface LedgeHit {
  b: LBox;
  top: number;
  nx: number;
  nz: number;
  qx: number;
  qz: number;
  tx: number;
  tz: number;
  standRoom: boolean;
}

interface WallHit {
  b: LBox;
  nx: number;
  nz: number;
  dist: number;
}

const has = (abil: number, a: Ability): boolean => (abil & a) !== 0;
const COYOTE = ticks(T.coyoteTime);
const JUMP_BUF = ticks(T.jumpBuffer);

export class PlayerController {
  private readonly col: Collider;
  private readonly push: Push = { nx: 0, nz: 0, depth: 0, qx: 0, qz: 0 };
  private readonly contacts: Contact[] = [];
  private ncontacts = 0;
  private ceilingBox: LBox | null = null;
  private readonly ropeIds: number[] = [];
  private readonly rayIds: number[] = [];
  private tick = 0;
  private st!: WorldState;
  private ev!: EventSink;
  private abil = 0;
  // wish direction (local frame)
  private wx = 0;
  private wz = 0;
  private wmag = 0;
  private sprint = false;
  private mz = 0;
  private pressed = 0;
  private btn = 0;
  private shiftUp: [number, number, number] | null = null;
  private ext: ExtForces = newExt();

  constructor(private readonly world: World) {
    this.col = new Collider(world);
  }

  bodyH(p: PlayerState): number {
    return p.crouch || p.mode === Mode.Slide || p.mode === Mode.Roll ? T.crouchHeight : T.height;
  }

  step(p: PlayerState, inp: InputFrame, st: WorldState, tick: number, abil: number, ext: ExtForces, ev: EventSink): void {
    this.tick = tick;
    this.st = st;
    this.ev = ev;
    this.abil = abil;
    this.ext = ext;
    this.shiftUp = null;
    this.btn = inp.btn;
    this.pressed = inp.btn & ~p.prevBtn;
    p.prevBtn = inp.btn;
    if (this.pressed & Btn.Jump) p.jumpBuf = JUMP_BUF;
    else if (p.jumpBuf > 0) p.jumpBuf--;
    if (this.pressed & Btn.Crouch) p.crouchBuf = ticks(0.28);
    else if (p.crouchBuf > 0) p.crouchBuf--;
    if (p.ledgeIgnore > 0) p.ledgeIgnore--;
    if (p.ropeIgnore > 0) p.ropeIgnore--;
    if (p.slideCool > 0) p.slideCool--;
    if (p.squish > 0) p.squish--;
    p.modeT++;

    // Carry with moving platforms (world space).
    this.carry(p);

    // To the gravity frame.
    const f = p.frame;
    if (f !== 0) {
      [p.x, p.y, p.z] = toLocal(f, p.x, p.y, p.z);
      [p.vx, p.vy, p.vz] = toLocal(f, p.vx, p.vy, p.vz);
    }
    // External forces into local frame.
    const [eax, eay, eaz] = toLocal(f, ext.ax, ext.ay, ext.az);
    const [ekx, eky, ekz] = toLocal(f, ext.kx, ext.ky, ext.kz);

    // Wish direction.
    const fw = yawForward(inp.yaw);
    const rt = yawRight(inp.yaw);
    let wx = fw.x * inp.mz + rt.x * inp.mx;
    let wz = fw.z * inp.mz + rt.z * inp.mx;
    let wm = Math.sqrt(wx * wx + wz * wz);
    if (wm > 1) {
      wx /= wm;
      wz /= wm;
      wm = 1;
    }
    this.wmag = wm;
    if (wm > 1e-6) {
      this.wx = wx / wm;
      this.wz = wz / wm;
    } else {
      this.wx = 0;
      this.wz = 0;
    }
    this.sprint = (inp.btn & Btn.Sprint) !== 0 && has(abil, Ability.Sprint);
    this.mz = inp.mz;

    // Gather nearby solids.
    const spd = Math.abs(p.vx) + Math.abs(p.vy) + Math.abs(p.vz);
    const m = 3.2 + spd * DT * 2;
    this.col.gather(f, p.x - m, p.y - m - 1, p.z - m, p.x + m, p.y + T.height + m + 1, p.z + m, st, tick);

    // Knockback / launch
    if (ekx !== 0 || eky !== 0 || ekz !== 0) {
      this.detach(p);
      p.vx += ekx;
      p.vy += eky;
      p.vz += ekz;
      this.enterStagger(p, 0.3);
      p.mode = Mode.Air;
      p.grounded = false;
      p.peakY = p.y;
    }
    if (ext.launch > 0) {
      const ly = toLocal(f, 0, ext.launch, 0)[1];
      if (ly > 0 && p.vy < ly) {
        this.detach(p);
        p.vy = ly;
        p.grounded = false;
        p.mode = Mode.Air;
        p.modeT = 0;
        p.peakY = p.y;
        if (p.majorFall) {
          p.majorFall = false;
          st.fallActive = false;
          ev.push({ k: 'fallEnd', dist: 0, caught: true, tag: null });
        }
      }
    }

    // External acceleration (wind etc.) scaled by mode.
    if (eax !== 0 || eay !== 0 || eaz !== 0) {
      const k =
        p.mode === Mode.Air || p.mode === Mode.Swing
          ? 1
          : p.mode === Mode.WallRun
            ? 0.5
            : p.mode === Mode.Ground || p.mode === Mode.Slide
              ? 0.3
              : 0;
      p.vx += eax * DT * k;
      p.vz += eaz * DT * k;
      if (p.mode === Mode.Air) p.vy += eay * DT;
    }

    switch (p.mode) {
      case Mode.Ground:
        this.ground(p);
        break;
      case Mode.Air:
        this.air(p);
        break;
      case Mode.Slide:
        this.slide(p);
        break;
      case Mode.Hang:
        this.hang(p);
        break;
      case Mode.Mantle:
      case Mode.Vault:
        this.anim(p);
        break;
      case Mode.WallRun:
        this.wallRun(p);
        break;
      case Mode.WallClimb:
        this.wallClimb(p);
        break;
      case Mode.Roll:
        this.roll(p);
        break;
      case Mode.Stagger:
        this.stagger(p);
        break;
      case Mode.Line:
        this.line(p);
        break;
      case Mode.Zip:
        this.zip(p);
        break;
      case Mode.Swing:
        this.swing(p);
        break;
      case Mode.Ladder:
        this.ladder(p);
        break;
    }

    // Major-fall tracking (local frame up).
    if (p.mode === Mode.Air) {
      if (p.y > p.peakY) p.peakY = p.y;
      if (!p.majorFall && p.peakY - p.y > T.majorFallDrop && p.vy < -T.majorFallSpeed) {
        p.majorFall = true;
        st.fallActive = true;
        ev.push({ k: 'fallStart', from: p.peakY });
      }
    }

    // Gravity shift timer.
    if (p.frame !== 0) {
      if (p.gravTimer > 0) p.gravTimer--;
      if (ext.gravReset) this.endShift(p, 'reset');
      else if (p.gravTimer <= 0) this.endShift(p, 'timer');
    }

    // Back to world.
    const f2 = p.frame;
    if (f2 !== 0) {
      [p.x, p.y, p.z] = toWorld(f2, p.x, p.y, p.z);
      [p.vx, p.vy, p.vz] = toWorld(f2, p.vx, p.vy, p.vz);
    }
    if (this.shiftUp) this.applyShift(p, this.shiftUp);
  }

  // ---------------------------------------------------------------- helpers

  private carry(p: PlayerState): void {
    let sid = -1;
    if (p.grounded && (p.mode === Mode.Ground || p.mode === Mode.Slide || p.mode === Mode.Roll || p.mode === Mode.Stagger)) sid = p.groundId;
    else if (p.mode === Mode.Hang) sid = p.ledgeId;
    p.platVx = p.platVy = p.platVz = 0;
    if (sid < 0) return;
    const so = this.world.solids[sid];
    if (!so) return;
    if (so.flags & SolidFlag.Conveyor && p.grounded) {
      p.x += so.convX * DT;
      p.z += so.convZ * DT;
      p.platVx = so.convX;
      p.platVz = so.convZ;
    }
    if (so.mover < 0 || p.mode === Mode.Hang) return;
    const mv = this.world.movers[so.mover];
    const ox = mv.origin.x + mv.ox;
    const oy = mv.origin.y + mv.oy;
    const oz = mv.origin.z + mv.oz;
    const pox = ox - mv.vx * DT;
    const poy = oy - mv.vy * DT;
    const poz = oz - mv.vz * DT;
    const dyaw = mv.vyaw * DT;
    let rx = p.x - pox;
    let rz = p.z - poz;
    if (dyaw !== 0) {
      const c = dcos(dyaw);
      const s = dsin(dyaw);
      const nx = rx * c + rz * s;
      const nz = -rx * s + rz * c;
      rx = nx;
      rz = nz;
      const fx = p.fx * c + p.fz * s;
      const fz = -p.fx * s + p.fz * c;
      p.fx = fx;
      p.fz = fz;
    }
    const nx = ox + rx;
    const ny = p.y + (oy - poy);
    const nz = oz + rz;
    p.platVx += (nx - p.x) * TICK_RATE;
    p.platVy = (ny - p.y) * TICK_RATE;
    p.platVz += (nz - p.z) * TICK_RATE;
    p.x = nx;
    p.y = ny;
    p.z = nz;
  }

  private setMode(p: PlayerState, m: Mode): void {
    if (p.mode === m) return;
    if (p.mode === Mode.WallRun) this.ev.push({ k: 'wallrun', start: false, side: p.wrSide });
    if (p.mode === Mode.Slide) this.ev.push({ k: 'slide', start: false });
    p.mode = m;
    p.modeT = 0;
  }

  private detach(p: PlayerState): void {
    if (p.mode === Mode.Line || p.mode === Mode.Zip || p.mode === Mode.Swing || p.mode === Mode.Ladder) {
      const ro = this.world.ropes[p.ropeId];
      if (ro) this.ev.push({ k: 'release', rope: ro.kind });
      p.ropeIgnoreId = p.ropeId;
      p.ropeIgnore = ticks(0.4);
      p.ropeId = -1;
    }
    if (p.mode === Mode.Hang) {
      p.ledgeIgnoreId = p.ledgeId;
      p.ledgeIgnore = ticks(0.3);
      p.ledgeId = -1;
    }
  }

  private hspeed(p: PlayerState): number {
    return Math.sqrt(p.vx * p.vx + p.vz * p.vz);
  }

  /** Preferred horizontal movement direction: wish, else velocity, else facing. */
  private moveDir(p: PlayerState): [number, number] {
    if (this.wmag > 0.2) return [this.wx, this.wz];
    const hs = this.hspeed(p);
    if (hs > 0.6) return [p.vx / hs, p.vz / hs];
    return [p.fx, p.fz];
  }

  private faceToward(p: PlayerState, dx: number, dz: number, rate: number): void {
    const l = Math.sqrt(dx * dx + dz * dz);
    if (l < 1e-6) return;
    dx /= l;
    dz /= l;
    const k = Math.min(1, rate * DT);
    let fx = p.fx + (dx - p.fx) * k;
    let fz = p.fz + (dz - p.fz) * k;
    const fl = Math.sqrt(fx * fx + fz * fz);
    if (fl < 1e-4) {
      fx = dx;
      fz = dz;
    } else {
      fx /= fl;
      fz /= fl;
    }
    p.fx = fx;
    p.fz = fz;
  }

  private canStand(p: PlayerState): boolean {
    const r = T.radius * 0.95;
    const y0 = p.y + T.crouchHeight - 0.01;
    const y1 = p.y + T.height;
    for (const b of this.col.boxes) {
      if (bottomAt(b, p.x, p.z) >= y1 || b.top <= y0) continue;
      if (b.shape === Shape.Ramp && topAt(b, p.x, p.z) <= y0) continue;
      if (footOverlap(b, p.x, p.z, r)) return false;
    }
    return true;
  }

  private spaceFree(x: number, y: number, z: number, h: number, r: number, ignore = -1): boolean {
    for (const b of this.col.boxes) {
      if (b.id === ignore) continue;
      if (bottomAt(b, x, z) >= y + h - 0.01) continue;
      const top = b.shape === Shape.Ramp ? topAt(b, x, z) : b.top;
      if (top <= y + 0.02) continue;
      if (footOverlap(b, x, z, r)) return false;
    }
    return true;
  }

  /** Integrate position with collision. Returns the solid landed on (if any). */
  private moveBody(p: PlayerState, grounded: boolean): LBox | null {
    const h = this.bodyH(p);
    let landed: LBox | null = null;
    this.ceilingBox = null;
    this.ncontacts = 0;
    const dy = p.vy * DT;
    if (dy < 0) {
      const ny = p.y + dy;
      let best = -Infinity;
      let bb: LBox | null = null;
      for (const b of this.col.boxes) {
        if (b.top < ny - 0.01 || bottomAt(b, p.x, p.z) > p.y + 0.01) continue;
        if (!footOverlap(b, p.x, p.z, T.footRadius)) continue;
        const top = topAt(b, p.x, p.z);
        if (top <= p.y + 0.001 && top >= ny - 0.001 && top > best) {
          best = top;
          bb = b;
        }
      }
      if (bb) {
        p.y = best;
        landed = bb;
      } else p.y = ny;
    } else if (dy > 0) {
      const head = p.y + h;
      let lim = head + dy;
      let hit: LBox | null = null;
      for (const b of this.col.boxes) {
        const bot = bottomAt(b, p.x, p.z);
        if (bot < head - 0.02 || bot >= lim) continue;
        if (!footOverlap(b, p.x, p.z, T.radius * 0.85)) continue;
        lim = bot;
        hit = b;
      }
      if (hit) {
        p.y = lim - h;
        p.vy = 0;
        this.ceilingBox = hit;
      } else p.y += dy;
    }

    // Horizontal, sub-stepped.
    const ddx = p.vx * DT;
    const ddz = p.vz * DT;
    const dist = Math.sqrt(ddx * ddx + ddz * ddz);
    const n = Math.max(1, Math.ceil(dist / 0.1));
    const onGround = grounded || landed !== null;
    const stepAllow = onGround ? T.stepUp : p.vy <= 0.5 ? T.airStepUp : 0.03;
    for (let i = 0; i < n; i++) {
      p.x += (p.vx * DT) / n;
      p.z += (p.vz * DT) / n;
      this.resolveH(p, h, stepAllow);
    }
    // Ground probe / step-up / step-down.
    if (onGround || p.vy <= 0.5) {
      const up = onGround ? T.stepUp : T.airStepUp;
      const down = onGround && p.vy <= 0 ? T.stepDown : 0;
      let best = -Infinity;
      let bb: LBox | null = null;
      for (const b of this.col.boxes) {
        if (b.top < p.y - down - 0.01 || bottomAt(b, p.x, p.z) > p.y + up) continue;
        if (!footOverlap(b, p.x, p.z, T.footRadius)) continue;
        const top = topAt(b, p.x, p.z);
        if (top <= p.y + up && top >= p.y - down && top > best) {
          best = top;
          bb = b;
        }
      }
      if (bb) {
        if (best > p.y + 0.001) {
          // step-up needs headroom
          if (this.spaceFree(p.x, best, p.z, h, T.radius * 0.9, bb.id)) {
            p.y = best;
            landed = bb;
          } else if (!onGround) {
            bb = null;
          } else {
            landed = null;
          }
        } else {
          p.y = best;
          landed = bb;
        }
      } else if (onGround) {
        landed = null;
      }
    }
    return landed;
  }

  private resolveH(p: PlayerState, h: number, stepAllow: number): void {
    const r = T.radius;
    for (let pass = 0; pass < 3; pass++) {
      let any = false;
      for (const b of this.col.boxes) {
        if (bottomAt(b, p.x, p.z) >= p.y + h - 0.001) continue;
        if (b.top <= p.y + stepAllow) continue;
        // Ramps are only walls where their surface (under our centre, clamped) is above our feet.
        if (b.shape === Shape.Ramp && topAt(b, p.x, p.z) <= p.y + stepAllow) continue;
        const ps = circlePush(b, p.x, p.z, r, this.push);
        if (!ps) continue;
        p.x += ps.nx * ps.depth;
        p.z += ps.nz * ps.depth;
        const vn = p.vx * ps.nx + p.vz * ps.nz;
        if (vn < 0) {
          p.vx -= vn * ps.nx;
          p.vz -= vn * ps.nz;
        }
        any = true;
        if (this.ncontacts < 8) {
          let c = this.contacts[this.ncontacts];
          if (!c) {
            c = { b, nx: 0, nz: 0, qx: 0, qz: 0 };
            this.contacts.push(c);
          }
          c.b = b;
          c.nx = ps.nx;
          c.nz = ps.nz;
          c.qx = ps.qx;
          c.qz = ps.qz;
          this.ncontacts++;
        }
        if (b.flags & SolidFlag.Hazard) this.hazardHit(p, ps.nx, ps.nz);
        if (b.flags & SolidFlag.Shift) this.touchShift(p, ps.nx, 0, ps.nz);
      }
      if (!any) break;
    }
  }

  private hazardHit(p: PlayerState, nx: number, nz: number): void {
    if (p.mode === Mode.Stagger) return;
    p.vx = nx * 6;
    p.vz = nz * 6;
    p.vy = 4;
    this.ev.push({ k: 'hazard' });
    this.enterStagger(p, 0.35);
  }

  /** Nearest wall within reach in a horizontal direction whose face spans [yLo, yHi]. */
  private probeWall(p: PlayerState, dx: number, dz: number, reach: number, yLo: number, yHi: number): WallHit | null {
    let best: WallHit | null = null;
    const r = T.radius + reach;
    for (const b of this.col.boxes) {
      if (bottomAt(b, p.x, p.z) > yLo || b.top < yHi) continue;
      const ps = circlePush(b, p.x, p.z, r, this.push);
      if (!ps) continue;
      if (ps.nx * dx + ps.nz * dz > -0.5) continue;
      if (b.shape === Shape.Ramp && topAt(b, ps.qx, ps.qz) < yHi) continue;
      const d = r - ps.depth;
      if (!best || d < best.dist) best = { b, nx: ps.nx, nz: ps.nz, dist: d };
    }
    return best;
  }

  /** Find a ledge ahead in direction (dx,dz) with top between 0.25 and maxAbove above feet. */
  private findLedge(p: PlayerState, dx: number, dz: number, maxAbove: number, minAbove = 0.25): LedgeHit | null {
    let best: LedgeHit | null = null;
    const reach = T.radius + 0.3;
    for (const b of this.col.boxes) {
      if (!isGrabbable(b)) continue;
      if (b.id === p.ledgeIgnoreId && p.ledgeIgnore > 0) continue;
      if (b.top < p.y + minAbove || bottomAt(b, p.x, p.z) > p.y + maxAbove) continue;
      const ps = circlePush(b, p.x, p.z, reach, this.push);
      if (!ps) continue;
      if (ps.nx * dx + ps.nz * dz > -0.45) continue;
      const top = topAt(b, ps.qx, ps.qz);
      const rel = top - p.y;
      if (rel < minAbove || rel > maxAbove) continue;
      // Stand point on top of the solid.
      const depth = footprintDepth(b, ps.qx - ps.nx * 0.001, ps.qz - ps.nz * 0.001, -ps.nx, -ps.nz);
      if (depth < 0.12) continue;
      const inset = Math.min(T.radius + 0.12, depth * 0.5);
      const tx = ps.qx - ps.nx * inset;
      const tz = ps.qz - ps.nz * inset;
      const ttop = topAt(b, tx, tz);
      if (Math.abs(ttop - top) > 0.35) continue;
      if (!this.spaceFree(tx, ttop, tz, T.crouchHeight, T.radius * 0.85, b.id)) continue;
      // Nothing blocking the hands right above the edge.
      if (!this.spaceFree(ps.qx + ps.nx * 0.1, ttop, ps.qz + ps.nz * 0.1, 0.4, 0.12, b.id)) continue;
      const standRoom = this.spaceFree(tx, ttop, tz, T.height, T.radius * 0.85, b.id);
      const cand: LedgeHit = { b, top: ttop, nx: ps.nx, nz: ps.nz, qx: ps.qx, qz: ps.qz, tx, tz, standRoom };
      if (!best || rel < best.top - p.y) best = cand;
    }
    return best;
  }

  // ---------------------------------------------------------------- modes

  private ground(p: PlayerState): void {
    const abil = this.abil;
    // Crouch
    const wantCrouch = (this.btn & Btn.Crouch) !== 0;
    if (wantCrouch) p.crouch = true;
    else if (p.crouch && this.canStand(p)) p.crouch = false;

    const hs = this.hspeed(p);
    // Slide
    if (this.pressed & Btn.Crouch && has(abil, Ability.Slide) && hs > T.slideMinSpeed) {
      this.startSlide(p);
      this.slide(p);
      return;
    }
    // Jump
    if (p.jumpBuf > 0) {
      this.doJump(p, 'ground');
      this.air(p);
      return;
    }

    const slip = (p.groundFlags & SolidFlag.Slippery) !== 0;
    let target = 0;
    if (this.wmag > 0.05) {
      if (p.crouch) target = T.crouchSpeed * Math.min(1, this.wmag / 0.55);
      else if (this.wmag < 0.55) target = T.walkSpeed * (this.wmag / 0.55);
      else if (this.sprint) target = T.sprintSpeed;
      else target = T.walkSpeed + (T.runSpeed - T.walkSpeed) * Math.min(1, (this.wmag - 0.55) / 0.4);
    }
    const tvx = this.wx * target;
    const tvz = this.wz * target;
    const dvx = tvx - p.vx;
    const dvz = tvz - p.vz;
    const dl = Math.sqrt(dvx * dvx + dvz * dvz);
    const speeding = target * target > p.vx * p.vx + p.vz * p.vz;
    const rate = (speeding ? (slip ? T.slipAccel : T.groundAccel) : slip ? T.slipDecel : T.groundDecel) * DT;
    if (dl > rate) {
      p.vx += (dvx / dl) * rate;
      p.vz += (dvz / dl) * rate;
    } else {
      p.vx = tvx;
      p.vz = tvz;
    }
    p.vy = 0;
    if (this.wmag > 0.1) this.faceToward(p, this.wx, this.wz, 18);

    const preSpeed = this.hspeed(p);
    const landed = this.moveBody(p, true);
    this.footsteps(p);
    if (!landed) {
      this.leaveGround(p, true);
      return;
    }
    this.setGround(p, landed);

    // Walking into a ladder takes hold of it.
    if (this.wmag > 0.3 && this.tryGrabRope(p, true)) return;
    // Vault / mantle on obstacles we run into.
    if (this.ncontacts > 0 && this.wmag > 0.3) this.tryVault(p, preSpeed);
  }

  private footsteps(p: PlayerState): void {
    const hs = this.hspeed(p);
    if (hs < 0.4) return;
    p.stepAcc += hs * DT;
    const stride = 0.55 + hs * 0.11;
    if (p.stepAcc >= stride) {
      p.stepAcc -= stride;
      this.ev.push({ k: 'step', mat: p.groundMat, speed: hs, x: p.x, y: p.y, z: p.z });
    }
  }

  private setGround(p: PlayerState, b: LBox): void {
    p.grounded = true;
    p.groundId = b.id;
    p.groundMat = b.so.mat;
    p.groundFlags = b.flags;
    p.coyote = COYOTE;
    p.peakY = p.y;
    if (b.flags & SolidFlag.Crumble && !this.st.crumble.has(b.id)) {
      this.st.crumble.set(b.id, this.tick);
      this.ev.push({ k: 'crumble', solid: b.id });
    }
    if (b.flags & SolidFlag.Shift) this.touchShift(p, 0, 1, 0);
  }

  private leaveGround(p: PlayerState, allowCoyote: boolean): void {
    p.grounded = false;
    p.coyote = allowCoyote ? COYOTE : 0;
    p.vx += p.platVx;
    p.vy += p.platVy > 0 ? p.platVy : 0;
    p.vz += p.platVz;
    p.peakY = p.y;
    p.canCut = false;
    if (p.mode !== Mode.Slide) this.setMode(p, Mode.Air);
    else this.setMode(p, Mode.Air);
    if (p.crouch && this.canStand(p)) p.crouch = false;
  }

  private doJump(p: PlayerState, kind: 'ground' | 'coyote' | 'slide' | 'roll'): void {
    const wasGrounded = p.grounded;
    if (p.crouch && this.canStand(p)) p.crouch = false;
    p.jumpBuf = 0;
    p.coyote = 0;
    p.grounded = false;
    if (wasGrounded) {
      p.vx += p.platVx;
      p.vz += p.platVz;
      p.vy = T.jumpVel * (kind === 'slide' ? T.slideJumpFactor : 1) + Math.max(0, p.platVy);
    } else {
      p.vy = T.jumpVel;
    }
    p.canCut = true;
    p.peakY = p.y;
    this.setMode(p, Mode.Air);
    this.ev.push({ k: 'jump', kind, x: p.x, y: p.y, z: p.z });
  }

  private startSlide(p: PlayerState): void {
    const hs = this.hspeed(p);
    let dx = p.vx / hs;
    let dz = p.vz / hs;
    if (this.wmag > 0.3 && dx * this.wx + dz * this.wz > 0.2) {
      dx = this.wx;
      dz = this.wz;
    }
    const sp = p.slideCool > 0 ? hs : Math.max(hs, T.slideBoostSpeed);
    p.vx = dx * sp;
    p.vz = dz * sp;
    p.crouch = true;
    this.setMode(p, Mode.Slide);
    this.ev.push({ k: 'slide', start: true });
  }

  private endSlide(p: PlayerState): void {
    p.slideCool = ticks(T.slideCooldown);
    const stand = (this.btn & Btn.Crouch) === 0 && this.canStand(p);
    p.crouch = !stand;
    this.setMode(p, Mode.Ground);
  }

  private slide(p: PlayerState): void {
    if (p.jumpBuf > 0 && p.modeT > 2) {
      p.slideCool = ticks(T.slideCooldown);
      this.doJump(p, 'slide');
      this.air(p);
      return;
    }
    let hs = this.hspeed(p);
    let dx = hs > 1e-4 ? p.vx / hs : p.fx;
    let dz = hs > 1e-4 ? p.vz / hs : p.fz;
    // Ramp acceleration
    let accel = -T.slideDecel;
    const gb = this.col.boxes.find((b) => b.id === p.groundId);
    if (gb && gb.shape === Shape.Ramp) {
      const [ddx, ddz, slope] = rampDownhill(gb);
      const along = dx * ddx + dz * ddz;
      const g = T.gravityDown * (slope / Math.sqrt(1 + slope * slope));
      accel += g * along;
      // Pull the slide direction downhill slightly.
      dx += ddx * 0.6 * DT;
      dz += ddz * 0.6 * DT;
    }
    // Steering
    if (this.wmag > 0.2) {
      const k = T.slideSteer * DT;
      dx += this.wx * k;
      dz += this.wz * k;
    }
    const dl = Math.sqrt(dx * dx + dz * dz) || 1;
    dx /= dl;
    dz /= dl;
    hs = Math.max(0, Math.min(hs + accel * DT, 16));
    p.vx = dx * hs;
    p.vz = dz * hs;
    p.vy = 0;
    this.faceToward(p, dx, dz, 12);
    const landed = this.moveBody(p, true);
    if (!landed) {
      this.leaveGround(p, true);
      return;
    }
    this.setGround(p, landed);
    const minT = ticks(T.slideMinTime);
    const held = (this.btn & Btn.Crouch) !== 0;
    if (this.hspeed(p) < T.slideEndSpeed || (p.modeT > minT && !held)) this.endSlide(p);
  }

  private air(p: PlayerState): void {
    const abil = this.abil;
    // Jump cut (variable height)
    if (p.canCut && p.vy > 0 && (this.btn & Btn.Jump) === 0) {
      p.vy *= T.jumpCutFactor;
      p.canCut = false;
    }
    if (p.vy <= 0) p.canCut = false;

    // Coyote jump
    if (p.jumpBuf > 0 && p.coyote > 0) {
      p.grounded = true;
      this.doJump(p, 'coyote');
      p.grounded = false;
    }
    if (p.coyote > 0) p.coyote--;

    // Gravity
    let g: number = p.vy > 0 ? T.gravityUp : T.gravityDown;
    if (Math.abs(p.vy) < T.apexHangBand && (this.btn & Btn.Jump) !== 0) g = T.apexHangGravity;
    p.vy = Math.max(p.vy - g * DT, -T.terminalVel);

    // Air control: redirect without exceeding max(current, run speed).
    const hs0 = this.hspeed(p);
    if (this.wmag > 0.05) {
      const a = T.airAccel * this.wmag * DT;
      p.vx += this.wx * a;
      p.vz += this.wz * a;
      const cap = Math.max(hs0, T.runSpeed);
      const hs1 = this.hspeed(p);
      if (hs1 > cap) {
        p.vx *= cap / hs1;
        p.vz *= cap / hs1;
      }
      this.faceToward(p, this.wx, this.wz, 6);
    }

    // Wall jump on a buffered jump
    if (p.jumpBuf > 0 && has(abil, Ability.WallJump)) {
      const [dx, dz] = this.moveDir(p);
      const w = this.probeWall(p, dx, dz, 0.45, p.y + 0.3, p.y + 1.4);
      if (w && !(p.hasLastWJ && w.nx * p.lastWJNx + w.nz * p.lastWJNz > 0.7)) {
        this.wallJump(p, w.nx, w.nz, 'wall');
      }
    }

    // Tether
    if (this.pressed & Btn.Interact && has(abil, Ability.Tether)) {
      if (this.tryHook(p)) return;
    }

    const landed = this.moveBody(p, false);
    if (landed) {
      this.land(p, landed);
      return;
    }
    if (this.ceilingBox && this.ceilingBox.flags & SolidFlag.Shift) this.touchShift(p, 0, -1, 0);

    // Ropes / ladders
    if (this.tryGrabRope(p)) return;

    const fallingTooFast = p.vy < -T.maxGrabFallSpeed;
    // Ledges
    if (!fallingTooFast && has(abil, Ability.Mantle)) {
      const [dx, dz] = this.moveDir(p);
      const toward = this.wmag > 0.2 || this.hspeed(p) > 0.6;
      if (toward) {
        const maxAbove = has(abil, Ability.LedgeGrab) ? T.hangMax : T.mantleMax;
        const lh = this.findLedge(p, dx, dz, maxAbove);
        if (lh) {
          const rel = lh.top - p.y;
          if (rel <= T.mantleMax) {
            this.startMantle(p, lh, rel);
            return;
          }
          if (p.vy < 3) {
            this.startHang(p, lh);
            return;
          }
        }
      }
    }

    // Wall climb (head-on run up)
    if (has(abil, Ability.WallClimb) && !p.wallClimbUsed && p.vy > -2 && this.wmag > 0.5) {
      const hs = this.hspeed(p);
      const [dx, dz] = this.moveDir(p);
      if (hs > 3.5 || p.modeT < 20) {
        const w = this.probeWall(p, dx, dz, 0.3, p.y + 0.2, p.y + 2.2);
        if (w && w.nx * dx + w.nz * dz < -0.75 && isWallRunnable(w.b)) {
          p.wallClimbUsed = true;
          p.vx = -w.nx * 0.5;
          p.vz = -w.nz * 0.5;
          p.vy = T.wallClimbVel;
          p.wrNx = w.nx;
          p.wrNz = w.nz;
          this.setMode(p, Mode.WallClimb);
          this.ev.push({ k: 'wallclimb' });
          return;
        }
      }
    }

    // Wall run
    if (has(abil, Ability.WallRun) && p.modeT > 2 && p.vy > -7) {
      const hs = this.hspeed(p);
      if (hs >= T.wallRunMinSpeed) {
        const dx = p.vx / hs;
        const dz = p.vz / hs;
        const along = this.wmag > 0.2 ? this.wx * dx + this.wz * dz : 0;
        if (along > 0.3) {
          for (const side of [1, -1]) {
            // right = (-dz, dx)
            const sx = -dz * side;
            const sz = dx * side;
            const w = this.probeWall(p, sx, sz, 0.35, p.y + 0.35, p.y + 1.5);
            if (!w || !isWallRunnable(w.b)) continue;
            if (Math.abs(w.nx * dx + w.nz * dz) > 0.6) continue;
            if (p.hasLastRun && w.nx * p.lastRunNx + w.nz * p.lastRunNz > 0.8) continue;
            this.startWallRun(p, w, side);
            return;
          }
        }
      }
    }
  }

  private wallJump(p: PlayerState, nx: number, nz: number, kind: 'wall' | 'wallrun'): void {
    const out = kind === 'wall' ? T.wallJumpOut : T.wallRunJumpOut;
    const up = kind === 'wall' ? T.wallJumpUp : T.wallRunJumpUp;
    // keep tangent momentum
    const vn = p.vx * nx + p.vz * nz;
    const tx = p.vx - vn * nx;
    const tz = p.vz - vn * nz;
    const keep = kind === 'wall' ? 0.5 : 0.95;
    p.vx = tx * keep + nx * out;
    p.vz = tz * keep + nz * out;
    p.vy = up;
    p.jumpBuf = 0;
    p.canCut = false;
    p.hasLastWJ = true;
    p.lastWJNx = nx;
    p.lastWJNz = nz;
    p.peakY = p.y;
    p.fx = p.vx;
    p.fz = p.vz;
    const fl = Math.sqrt(p.fx * p.fx + p.fz * p.fz) || 1;
    p.fx /= fl;
    p.fz /= fl;
    this.setMode(p, Mode.Air);
    this.ev.push({ k: 'jump', kind, x: p.x, y: p.y, z: p.z });
  }

  private land(p: PlayerState, b: LBox): void {
    const fall = p.peakY - p.y;
    p.lastFall = fall;
    const hs = this.hspeed(p);
    const soft = (b.flags & SolidFlag.Soft) !== 0;
    if (p.majorFall) {
      p.majorFall = false;
      this.ev.push({ k: 'fallEnd', dist: fall, caught: false, tag: b.so.tag });
    }
    if (b.flags & SolidFlag.FallOnly && b.so.tag) this.ev.push({ k: 'netFound', tag: b.so.tag });
    this.st.fallActive = false;
    p.hasLastRun = false;
    p.hasLastWJ = false;
    p.wallClimbUsed = false;
    p.vy = 0;
    this.setGround(p, b);
    const heavy = fall > T.staggerFall && !soft;
    this.ev.push({ k: 'land', fall, mat: b.so.mat, speed: hs, heavy, soft, x: p.x, y: p.y, z: p.z });

    if (b.flags & SolidFlag.Bounce && b.so.bounce > 0) {
      p.vy = b.so.bounce;
      p.grounded = false;
      p.peakY = p.y;
      p.canCut = false;
      this.setMode(p, Mode.Air);
      this.ev.push({ k: 'bounce', x: p.x, y: p.y, z: p.z });
      return;
    }
    const crouchTimed = p.crouchBuf > 0 || (this.btn & Btn.Crouch) !== 0;
    if (fall > T.rollMinFall && crouchTimed && has(this.abil, Ability.Roll) && hs > 1.5) {
      const sp = Math.max(hs, 5.0);
      p.vx = (p.vx / hs) * sp;
      p.vz = (p.vz / hs) * sp;
      p.crouch = true;
      this.setMode(p, Mode.Roll);
      this.ev.push({ k: 'roll' });
      return;
    }
    if ((this.btn & Btn.Crouch) !== 0 && has(this.abil, Ability.Slide) && hs > T.slideMinSpeed && !heavy) {
      this.setMode(p, Mode.Ground);
      this.startSlide(p);
      return;
    }
    if (heavy) {
      this.enterStagger(p, fall > T.heavyFall ? 0.62 : 0.34);
      this.ev.push({ k: 'stagger', fall });
      return;
    }
    if (fall > 3 && !soft) {
      p.vx *= 0.85;
      p.vz *= 0.85;
    }
    this.setMode(p, Mode.Ground);
    // Buffered jump on landing
    if (p.jumpBuf > 0) {
      this.doJump(p, 'ground');
    }
  }

  private enterStagger(p: PlayerState, seconds: number): void {
    p.staggerDur = ticks(seconds);
    this.setMode(p, Mode.Stagger);
  }

  private stagger(p: PlayerState): void {
    if (p.grounded) {
      const k = Math.max(0, 1 - 14 * DT);
      p.vx *= k;
      p.vz *= k;
      p.vy = 0;
    } else {
      p.vy = Math.max(p.vy - T.gravityDown * DT, -T.terminalVel);
    }
    const landed = this.moveBody(p, p.grounded);
    if (landed) {
      if (!p.grounded) {
        const fall = p.peakY - p.y;
        if (p.majorFall) {
          p.majorFall = false;
          this.ev.push({ k: 'fallEnd', dist: fall, caught: false, tag: landed.so.tag });
        }
        this.st.fallActive = false;
        this.ev.push({ k: 'land', fall, mat: landed.so.mat, speed: this.hspeed(p), heavy: fall > T.staggerFall, soft: false, x: p.x, y: p.y, z: p.z });
      }
      this.setGround(p, landed);
    } else if (p.grounded) {
      p.grounded = false;
      p.peakY = p.y;
    } else if (p.y > p.peakY) p.peakY = p.y;
    if (p.modeT >= p.staggerDur) {
      if (p.grounded) this.setMode(p, Mode.Ground);
      else this.setMode(p, Mode.Air);
    }
  }

  private roll(p: PlayerState): void {
    const hs = this.hspeed(p);
    if (p.jumpBuf > 0 && p.modeT > ticks(0.12)) {
      this.doJump(p, 'roll');
      this.air(p);
      return;
    }
    if (this.wmag > 0.2 && hs > 0.1) {
      let dx = p.vx / hs + this.wx * 2.5 * DT;
      let dz = p.vz / hs + this.wz * 2.5 * DT;
      const l = Math.sqrt(dx * dx + dz * dz);
      dx /= l;
      dz /= l;
      p.vx = dx * hs;
      p.vz = dz * hs;
    }
    p.vy = 0;
    const landed = this.moveBody(p, true);
    if (!landed) {
      p.crouch = !this.canStand(p);
      this.leaveGround(p, true);
      return;
    }
    this.setGround(p, landed);
    if (p.modeT >= ticks(T.rollTime)) {
      p.crouch = !this.canStand(p) || (this.btn & Btn.Crouch) !== 0;
      this.setMode(p, Mode.Ground);
    }
  }

  // ---------------------------------------------------------------- ledges, mantles, vaults

  private startMantle(p: PlayerState, lh: LedgeHit, rel: number): void {
    const adv = has(this.abil, Ability.WallClimb);
    const hs = this.hspeed(p);
    p.ax0 = p.x;
    p.ay0 = p.y;
    p.az0 = p.z;
    p.ax1 = lh.tx;
    p.ay1 = lh.top;
    p.az1 = lh.tz;
    p.aPeak = lh.top;
    p.aDur = Math.max(6, Math.round((0.16 + 0.14 * rel) * (adv ? 0.75 : 1) * TICK_RATE));
    const exit = Math.min(hs, adv ? 6.5 : 3.5);
    p.aExitVx = -lh.nx * exit;
    p.aExitVz = -lh.nz * exit;
    p.aExitAir = false;
    p.aCrouch = !lh.standRoom;
    p.ledgeId = lh.b.id;
    this.faceToward(p, -lh.nx, -lh.nz, 1000);
    if (p.majorFall) {
      p.majorFall = false;
      this.ev.push({ k: 'fallEnd', dist: p.peakY - p.y, caught: true, tag: null });
    }
    this.st.fallActive = false;
    p.vx = p.vy = p.vz = 0;
    p.grounded = false;
    this.setMode(p, Mode.Mantle);
    this.ev.push({ k: 'mantle', height: rel });
  }

  private startHang(p: PlayerState, lh: LedgeHit): void {
    if (!has(this.abil, Ability.LedgeGrab)) return;
    const b = lh.b;
    // Store hand point & normal in the solid's local frame so moving ledges carry us.
    const [lx, lz] = toBoxLocal(b, lh.qx, lh.qz);
    const nlx = lh.nx * b.c - lh.nz * b.s;
    const nlz = lh.nx * b.s + lh.nz * b.c;
    p.ledgeId = b.id;
    p.ledgeLx = lx;
    p.ledgeLz = lz;
    p.ledgeNlx = nlx;
    p.ledgeNlz = nlz;
    if (p.majorFall) {
      p.majorFall = false;
      this.ev.push({ k: 'fallEnd', dist: p.peakY - p.y, caught: true, tag: null });
    }
    this.st.fallActive = false;
    p.vx = p.vy = p.vz = 0;
    p.grounded = false;
    p.hasLastRun = false;
    p.hasLastWJ = false;
    p.wallClimbUsed = false;
    this.setMode(p, Mode.Hang);
    this.placeOnLedge(p, b);
    this.ev.push({ k: 'hang' });
  }

  private placeOnLedge(p: PlayerState, b: LBox): [number, number, number] {
    const [qx, qz] = fromBoxLocal(b, p.ledgeLx, p.ledgeLz);
    const [nx, nz] = fromBoxLocal(b, p.ledgeNlx, p.ledgeNlz);
    const hx = b.cx + qx;
    const hz = b.cz + qz;
    const top = topAt(b, hx - nx * 0.05, hz - nz * 0.05);
    p.x = hx + nx * (T.radius + 0.02);
    p.z = hz + nz * (T.radius + 0.02);
    p.y = top - T.hangHandOffset;
    p.fx = -nx;
    p.fz = -nz;
    return [nx, nz, top];
  }

  private hang(p: PlayerState): void {
    const b = this.col.boxes.find((x) => x.id === p.ledgeId);
    if (!b) {
      this.detach(p);
      this.setMode(p, Mode.Air);
      p.peakY = p.y;
      return;
    }
    const [nx, nz, top] = this.placeOnLedge(p, b);
    const intoWall = this.wmag > 0.2 ? -(this.wx * nx + this.wz * nz) : 0;
    const climbReq = p.jumpBuf > 0 && intoWall > -0.4;
    const autoClimb = intoWall > 0.7 && p.modeT > ticks(0.25);
    if (climbReq || autoClimb) {
      const tx = p.x - nx * (T.radius * 2 + 0.15);
      const tz = p.z - nz * (T.radius * 2 + 0.15);
      if (this.spaceFree(tx, top, tz, T.crouchHeight, T.radius * 0.85, b.id)) {
        p.jumpBuf = 0;
        const adv = has(this.abil, Ability.WallClimb);
        p.ax0 = p.x;
        p.ay0 = p.y;
        p.az0 = p.z;
        p.ax1 = tx;
        p.ay1 = top;
        p.az1 = tz;
        p.aPeak = top;
        p.aDur = Math.round((adv ? 0.32 : 0.44) * TICK_RATE);
        p.aExitVx = -nx * (adv ? 3.5 : 1.5);
        p.aExitVz = -nz * (adv ? 3.5 : 1.5);
        p.aExitAir = false;
        p.aCrouch = !this.spaceFree(tx, top, tz, T.height, T.radius * 0.85, b.id);
        this.setMode(p, Mode.Mantle);
        this.ev.push({ k: 'climb' });
        return;
      }
    }
    if (p.jumpBuf > 0 && intoWall <= -0.4) {
      // Jump away from the wall.
      this.detach(p);
      if (has(this.abil, Ability.WallJump)) this.wallJump(p, nx, nz, 'wall');
      else {
        p.vx = nx * 3;
        p.vz = nz * 3;
        p.vy = 4;
        p.jumpBuf = 0;
        this.setMode(p, Mode.Air);
        this.ev.push({ k: 'jump', kind: 'ledge', x: p.x, y: p.y, z: p.z });
      }
      return;
    }
    if (this.pressed & Btn.Crouch) {
      this.detach(p);
      p.vx = nx * 0.8;
      p.vz = nz * 0.8;
      p.vy = 0;
      p.peakY = p.y;
      this.setMode(p, Mode.Air);
      return;
    }
    // Shimmy along the edge.
    if (this.wmag > 0.2) {
      const tx = -nz;
      const tz = nx;
      const along = this.wx * tx + this.wz * tz;
      if (Math.abs(along) > 0.35) {
        const d = Math.sign(along) * T.shimmySpeed * DT;
        // move hand point in solid-local coordinates
        const tlx = tx * b.c - tz * b.s;
        const tlz = tx * b.s + tz * b.c;
        const nlx = p.ledgeLx + tlx * d;
        const nlz = p.ledgeLz + tlz * d;
        if (b.shape === Shape.Cyl) {
          const l = Math.sqrt(nlx * nlx + nlz * nlz) || 1;
          p.ledgeLx = (nlx / l) * b.hx;
          p.ledgeLz = (nlz / l) * b.hx;
          p.ledgeNlx = nlx / l;
          p.ledgeNlz = nlz / l;
        } else if (Math.abs(nlx) <= b.hx - 0.2 + 1e-6 || Math.abs(p.ledgeNlx) > 0.5) {
          if (Math.abs(nlz) <= b.hz - 0.2 + 1e-6 || Math.abs(p.ledgeNlz) > 0.5) {
            const ox = p.x;
            const oz = p.z;
            const sx = p.ledgeLx;
            const sz = p.ledgeLz;
            p.ledgeLx = clamp(nlx, -b.hx, b.hx);
            p.ledgeLz = clamp(nlz, -b.hz, b.hz);
            this.placeOnLedge(p, b);
            // blocked by something beside us?
            let blocked = false;
            for (const o of this.col.boxes) {
              if (o.id === b.id) continue;
              if (bottomAt(o, p.x, p.z) >= p.y + T.height || o.top <= p.y + 0.1) continue;
              if (footOverlap(o, p.x, p.z, T.radius * 0.9)) {
                blocked = true;
                break;
              }
            }
            if (blocked) {
              p.ledgeLx = sx;
              p.ledgeLz = sz;
              p.x = ox;
              p.z = oz;
            }
          }
        }
      }
    }
  }

  private anim(p: PlayerState): void {
    const u = Math.min(1, p.modeT / p.aDur);
    if (p.mode === Mode.Vault) {
      const k = u;
      p.x = p.ax0 + (p.ax1 - p.ax0) * k;
      p.z = p.az0 + (p.az1 - p.az0) * k;
      const base = p.ay0 + (p.ay1 - p.ay0) * k;
      const arc = 4 * k * (1 - k);
      p.y = Math.max(base, base + (p.aPeak - Math.max(p.ay0, p.ay1)) * arc);
    } else {
      const ku = smoothstep(0, 1, Math.min(1, u * 1.7));
      const kf = smoothstep(0, 1, Math.max(0, (u - 0.3) / 0.7));
      p.y = p.ay0 + (p.ay1 - p.ay0) * ku;
      p.x = p.ax0 + (p.ax1 - p.ax0) * kf;
      p.z = p.az0 + (p.az1 - p.az0) * kf;
    }
    p.vx = p.vy = p.vz = 0;
    if (u >= 1) {
      p.crouch = p.aCrouch;
      p.vx = p.aExitVx;
      p.vz = p.aExitVz;
      p.ledgeId = -1;
      if (p.aExitAir) {
        p.grounded = false;
        p.peakY = p.y;
        this.setMode(p, Mode.Air);
        return;
      }
      // Confirm ground under us.
      const landed = this.moveBody(p, true);
      if (landed) {
        this.setGround(p, landed);
        p.hasLastRun = false;
        p.hasLastWJ = false;
        p.wallClimbUsed = false;
        this.setMode(p, Mode.Ground);
        if (p.jumpBuf > 0) this.doJump(p, 'ground');
      } else {
        p.grounded = false;
        p.peakY = p.y;
        this.setMode(p, Mode.Air);
      }
    }
  }

  private tryVault(p: PlayerState, hs: number): void {
    const [dx, dz] = this.moveDir(p);
    for (let i = 0; i < this.ncontacts; i++) {
      const c = this.contacts[i];
      if (c.nx * dx + c.nz * dz > -0.6) continue;
      const b = c.b;
      const top = topAt(b, c.qx, c.qz);
      const rel = top - p.y;
      if (rel <= T.stepUp || rel > T.vaultMaxHeight) continue;
      if (!isGrabbable(b)) continue;
      const depth = footprintDepth(b, c.qx - c.nx * 0.001, c.qz - c.nz * 0.001, -c.nx, -c.nz);
      const canVault = has(this.abil, Ability.Vault) && hs > 3.5 && depth <= T.vaultMaxDepth;
      if (canVault) {
        const fx = c.qx - c.nx * (depth + T.radius + 0.2);
        const fz = c.qz - c.nz * (depth + T.radius + 0.2);
        // clearance over the obstacle and at the far side
        if (!this.spaceFree(c.qx - c.nx * depth * 0.5, top, c.qz - c.nz * depth * 0.5, T.crouchHeight, T.radius * 0.8, b.id)) continue;
        if (!this.spaceFree(fx, p.y, fz, T.height, T.radius * 0.9)) {
          // maybe lands on something higher? fall back to mantle
        } else {
          // Find landing height at far side (within 1.2 m below current feet).
          let land = -Infinity;
          for (const o of this.col.boxes) {
            if (!footOverlap(o, fx, fz, T.footRadius)) continue;
            const t = topAt(o, fx, fz);
            if (t <= p.y + 0.3 && t >= p.y - 1.2 && t > land) land = t;
          }
          const exit = Math.max(hs, 5.5) * 0.97;
          p.ax0 = p.x;
          p.ay0 = p.y;
          p.az0 = p.z;
          p.ax1 = fx;
          p.az1 = fz;
          p.aPeak = top + 0.2;
          p.aExitAir = land === -Infinity;
          p.ay1 = land === -Infinity ? p.y : land;
          p.aDur = Math.round(T.vaultTime * TICK_RATE);
          p.aExitVx = -c.nx * exit;
          p.aExitVz = -c.nz * exit;
          p.aCrouch = false;
          p.grounded = false;
          this.faceToward(p, -c.nx, -c.nz, 1000);
          this.setMode(p, Mode.Vault);
          this.ev.push({ k: 'vault' });
          return;
        }
      }
      // Auto step-mantle onto waist-high obstacles.
      if (has(this.abil, Ability.Mantle) && rel <= 1.0 && hs > 1.5) {
        const lh = this.findLedge(p, -c.nx, -c.nz, 1.0);
        if (lh) {
          this.startMantle(p, lh, lh.top - p.y);
          return;
        }
      }
    }
  }

  // ---------------------------------------------------------------- walls

  private startWallRun(p: PlayerState, w: WallHit, side: number): void {
    const hs = this.hspeed(p);
    const dx = p.vx / hs;
    const dz = p.vz / hs;
    let tx = dx - w.nx * (dx * w.nx + dz * w.nz);
    let tz = dz - w.nz * (dx * w.nx + dz * w.nz);
    const tl = Math.sqrt(tx * tx + tz * tz) || 1;
    tx /= tl;
    tz /= tl;
    p.wrNx = w.nx;
    p.wrNz = w.nz;
    p.wrTx = tx;
    p.wrTz = tz;
    p.wrSpeed = Math.max(hs * (dx * tx + dz * tz), T.wallRunSpeed);
    p.wrSide = side;
    p.vy = clamp(p.vy + 2.5, 2.0, 4.5);
    p.hasLastRun = true;
    p.lastRunNx = w.nx;
    p.lastRunNz = w.nz;
    if (p.majorFall) {
      p.majorFall = false;
      this.ev.push({ k: 'fallEnd', dist: p.peakY - p.y, caught: true, tag: null });
      this.st.fallActive = false;
    }
    this.setMode(p, Mode.WallRun);
    this.ev.push({ k: 'wallrun', start: true, side });
  }

  private wallRun(p: PlayerState): void {
    // Jump off
    if (p.jumpBuf > 0) {
      p.vx = p.wrTx * p.wrSpeed;
      p.vz = p.wrTz * p.wrSpeed;
      this.wallJump(p, p.wrNx, p.wrNz, 'wallrun');
      p.hasLastWJ = false;
      this.air(p);
      return;
    }
    const along = this.wmag > 0.2 ? this.wx * p.wrTx + this.wz * p.wrTz : 0;
    const t = p.modeT / TICK_RATE;
    const g = t < T.wallRunEarlyTime ? T.wallRunGravityEarly : T.wallRunGravityLate;
    p.vy -= g * DT;
    p.vx = p.wrTx * p.wrSpeed - p.wrNx * 1.2;
    p.vz = p.wrTz * p.wrSpeed - p.wrNz * 1.2;
    this.faceToward(p, p.wrTx, p.wrTz, 20);
    const landed = this.moveBody(p, false);
    if (landed) {
      this.setMode(p, Mode.Air);
      this.land(p, landed);
      return;
    }
    const w = this.probeWall(p, -p.wrNx, -p.wrNz, 0.3, p.y + 0.35, p.y + 1.4);
    const ended = !w || t > T.wallRunTime || along < 0.1 || p.vy < -7;
    if (ended) {
      p.vx = p.wrTx * p.wrSpeed + p.wrNx * 1.5;
      p.vz = p.wrTz * p.wrSpeed + p.wrNz * 1.5;
      p.peakY = Math.max(p.peakY, p.y);
      this.setMode(p, Mode.Air);
      return;
    }
    // Follow curved walls / adjacent faces.
    if (w && (w.nx !== p.wrNx || w.nz !== p.wrNz)) {
      const dot = w.nx * p.wrNx + w.nz * p.wrNz;
      if (dot > 0.7) {
        let tx = p.wrTx - w.nx * (p.wrTx * w.nx + p.wrTz * w.nz);
        let tz = p.wrTz - w.nz * (p.wrTx * w.nx + p.wrTz * w.nz);
        const tl = Math.sqrt(tx * tx + tz * tz) || 1;
        tx /= tl;
        tz /= tl;
        p.wrNx = w.nx;
        p.wrNz = w.nz;
        p.wrTx = tx;
        p.wrTz = tz;
      }
    }
    // Ledge above while wall running (grab the top of the wall).
    if (has(this.abil, Ability.LedgeGrab) && p.vy < 2) {
      const lh = this.findLedge(p, p.wrTx, p.wrTz, T.hangMax, 1.5);
      if (lh && lh.nx * p.wrTx + lh.nz * p.wrTz < -0.6) {
        this.startHang(p, lh);
      }
    }
  }

  private wallClimb(p: PlayerState): void {
    const w = this.probeWall(p, -p.wrNx, -p.wrNz, 0.35, p.y + 0.2, p.y + 1.6);
    if (p.jumpBuf > 0 && has(this.abil, Ability.WallJump)) {
      this.wallJump(p, p.wrNx, p.wrNz, 'wall');
      this.air(p);
      return;
    }
    p.vx = -p.wrNx * 0.6;
    p.vz = -p.wrNz * 0.6;
    this.moveBody(p, false);
    if (this.ceilingBox) {
      this.setMode(p, Mode.Air);
      return;
    }
    const lh = this.findLedge(p, -p.wrNx, -p.wrNz, T.hangMax);
    if (lh) {
      const rel = lh.top - p.y;
      if (rel <= T.mantleMax) this.startMantle(p, lh, rel);
      else this.startHang(p, lh);
      return;
    }
    if (!w || p.modeT >= ticks(T.wallClimbTime) || this.wmag < 0.3) {
      p.vy = Math.min(p.vy, 2.5);
      p.peakY = p.y;
      this.setMode(p, Mode.Air);
    }
  }

  // ---------------------------------------------------------------- ropes

  private ropeLocal(ro: Rope, which: 'a' | 'b', f: number): [number, number, number] {
    const w = this.world.ropePoint(ro, which);
    return toLocal(f, w.x, w.y, w.z);
  }

  private tryGrabRope(p: PlayerState, laddersOnly = false): boolean {
    const abil = this.abil;
    const f = p.frame;
    const [wx, wy, wz] = toWorld(f, p.x, p.y + 1.2, p.z);
    this.world.queryRopes(wx, wy, wz, this.ropeIds);
    if (this.ropeIds.length === 0) return false;
    const handY = p.y + 2.0;
    for (const id of this.ropeIds) {
      const ro = this.world.ropes[id];
      if (!this.world.isRopeActive(ro, this.st)) continue;
      if (id === p.ropeIgnoreId && p.ropeIgnore > 0) continue;
      if (ro.kind === 'hook' || (laddersOnly && ro.kind !== 'ladder')) continue;
      const [ax, ay, az] = this.ropeLocal(ro, 'a', f);
      const [bx, by, bz] = this.ropeLocal(ro, 'b', f);
      if (ro.kind === 'ladder') {
        const [nx, , nz] = toLocal(f, ro.n.x, ro.n.y, ro.n.z);
        const ox = p.x - ax;
        const oz = p.z - az;
        const front = ox * nx + oz * nz;
        const lat = Math.abs(-ox * nz + oz * nx);
        if (front < 0 || front > T.radius + 0.45 || lat > 0.55) continue;
        if (p.y < ay - 0.8 || p.y > by - 0.3) continue;
        const [dx, dz] = this.moveDir(p);
        if (dx * -nx + dz * -nz < 0.3 && this.wmag < 0.2) continue;
        this.enterRope(p, ro, 0);
        this.setMode(p, Mode.Ladder);
        p.ropeT = clamp((p.y - ay) / Math.max(0.01, by - ay), 0, 1);
        this.ev.push({ k: 'grab', rope: ro.kind });
        return true;
      }
      // closest point on segment
      const sx = bx - ax;
      const sy = by - ay;
      const sz = bz - az;
      const len2 = sx * sx + sy * sy + sz * sz;
      if (len2 < 1e-6) continue;
      const py = ro.kind === 'swing' ? p.y + 1.2 : handY;
      let t = ((p.x - ax) * sx + (py - ay) * sy + (p.z - az) * sz) / len2;
      t = clamp(t, 0, 1);
      const cx = ax + sx * t;
      const cy = ay + sy * t;
      const cz = az + sz * t;
      const ddx = p.x - cx;
      const ddy = py - cy;
      const ddz = p.z - cz;
      const d2 = ddx * ddx + ddy * ddy + ddz * ddz;
      const rad = ro.kind === 'swing' ? 0.75 : T.ropeGrabRadius;
      if (d2 > rad * rad) continue;
      if (ro.kind === 'line' && !has(abil, Ability.Rope)) continue;
      if (ro.kind === 'swing' && !has(abil, Ability.Rope)) continue;
      if (ro.kind === 'bar' && !has(abil, Ability.Swing)) continue;
      if (ro.kind === 'zip' && !has(abil, Ability.Zip)) continue;
      this.enterRope(p, ro, t);
      const len = Math.sqrt(len2);
      if (ro.kind === 'line') {
        this.setMode(p, Mode.Line);
      } else if (ro.kind === 'zip') {
        const along = (p.vx * sx + p.vy * sy + p.vz * sz) / len;
        p.ropeSpeed = Math.max(4, along);
        this.setMode(p, Mode.Zip);
      } else if (ro.kind === 'swing') {
        p.pivX = ax;
        p.pivY = ay;
        p.pivZ = az;
        const mx = p.x;
        const my = p.y + 1.0;
        const mz = p.z;
        const dl = Math.sqrt((mx - ax) ** 2 + (my - ay) ** 2 + (mz - az) ** 2);
        p.ropeLen = clamp(dl, 1.5, len + 0.5);
        this.setMode(p, Mode.Swing);
      } else if (ro.kind === 'bar') {
        p.pivX = cx;
        p.pivY = cy;
        p.pivZ = cz;
        p.ropeLen = T.barLength;
        this.setMode(p, Mode.Swing);
      }
      this.ev.push({ k: 'grab', rope: ro.kind });
      return true;
    }
    return false;
  }

  private enterRope(p: PlayerState, ro: Rope, t: number): void {
    if (p.majorFall) {
      p.majorFall = false;
      this.ev.push({ k: 'fallEnd', dist: p.peakY - p.y, caught: true, tag: null });
    }
    this.st.fallActive = false;
    p.ropeId = ro.id;
    p.ropeT = t;
    p.grounded = false;
    p.hasLastRun = false;
    p.hasLastWJ = false;
    p.wallClimbUsed = false;
    p.crouch = false;
  }

  private tryHook(p: PlayerState): boolean {
    const f = p.frame;
    const [wx, wy, wz] = toWorld(f, p.x, p.y + 1.2, p.z);
    this.world.queryRopes(wx, wy, wz, this.ropeIds);
    let best: Rope | null = null;
    let bestScore = -Infinity;
    const [dx, dz] = this.moveDir(p);
    for (const id of this.ropeIds) {
      const ro = this.world.ropes[id];
      if (ro.kind !== 'hook' || !this.world.isRopeActive(ro, this.st)) continue;
      const [hx, hy, hz] = this.ropeLocal(ro, 'a', f);
      const ox = hx - p.x;
      const oy = hy - (p.y + 1.6);
      const oz = hz - p.z;
      const d = Math.sqrt(ox * ox + oy * oy + oz * oz);
      if (d > T.hookRange || d < 1.5 || oy < -0.5) continue;
      const hd = Math.sqrt(ox * ox + oz * oz) || 1;
      const facing = (ox * dx + oz * dz) / hd;
      if (facing < 0.1 && hd > 2) continue;
      // line of sight (world space)
      const pw = ro.mover >= 0 ? this.world.ropePoint(ro, 'a') : ro.a;
      const hit = raycastSolids(this.world, this.st, this.tick, wx, wy + 0.4, wz, pw.x, pw.y - 0.3, pw.z, this.rayIds);
      if (hit < 0.97) continue;
      const score = facing * 2 - d * 0.1;
      if (score > bestScore) {
        bestScore = score;
        best = ro;
      }
    }
    if (!best) return false;
    const [hx, hy, hz] = this.ropeLocal(best, 'a', f);
    this.enterRope(p, best, 0);
    p.pivX = hx;
    p.pivY = hy;
    p.pivZ = hz;
    const mx = p.x - hx;
    const my = p.y + 1.0 - hy;
    const mz = p.z - hz;
    p.ropeLen = Math.min(Math.sqrt(mx * mx + my * my + mz * mz), T.hookMaxLength);
    this.setMode(p, Mode.Swing);
    this.ev.push({ k: 'grab', rope: 'hook' });
    return true;
  }

  private line(p: PlayerState): void {
    const ro = this.world.ropes[p.ropeId];
    const f = p.frame;
    const [ax, ay, az] = this.ropeLocal(ro, 'a', f);
    const [bx, by, bz] = this.ropeLocal(ro, 'b', f);
    const sx = bx - ax;
    const sy = by - ay;
    const sz = bz - az;
    const len = Math.sqrt(sx * sx + sy * sy + sz * sz) || 1;
    const hl = Math.sqrt(sx * sx + sz * sz) || 1;
    const along = this.wmag > 0.2 ? (this.wx * sx + this.wz * sz) / hl : 0;
    if (p.jumpBuf > 0) {
      const [dx, dz] = this.moveDir(p);
      this.detach(p);
      p.vx = dx * 3.8;
      p.vz = dz * 3.8;
      p.vy = 6.2;
      p.jumpBuf = 0;
      p.peakY = p.y;
      this.setMode(p, Mode.Air);
      this.ev.push({ k: 'jump', kind: 'rope', x: p.x, y: p.y, z: p.z });
      return;
    }
    if (this.pressed & Btn.Crouch) {
      this.detach(p);
      p.vx = p.vy = p.vz = 0;
      p.peakY = p.y;
      this.setMode(p, Mode.Air);
      return;
    }
    const nt = clamp(p.ropeT + (along * T.lineSpeed * DT) / len, 0, 1);
    const hx = ax + sx * nt;
    const hy = ay + sy * nt;
    const hz = az + sz * nt;
    const fx = hx;
    const fy = hy - T.hangHandOffset;
    const fz = hz;
    let blocked = false;
    for (const b of this.col.boxes) {
      if (bottomAt(b, fx, fz) >= fy + T.height - 0.25 || b.top <= fy + 0.05) continue;
      if (footOverlap(b, fx, fz, T.radius * 0.8)) {
        blocked = true;
        break;
      }
    }
    if (!blocked) p.ropeT = nt;
    const k = p.ropeT;
    p.x = ax + sx * k;
    p.y = ay + sy * k - T.hangHandOffset;
    p.z = az + sz * k;
    p.vx = p.vy = p.vz = 0;
    if (Math.abs(along) > 0.2) this.faceToward(p, sx * Math.sign(along), sz * Math.sign(along), 10);
  }

  private zip(p: PlayerState): void {
    const ro = this.world.ropes[p.ropeId];
    const f = p.frame;
    const [ax, ay, az] = this.ropeLocal(ro, 'a', f);
    const [bx, by, bz] = this.ropeLocal(ro, 'b', f);
    const sx = bx - ax;
    const sy = by - ay;
    const sz = bz - az;
    const len = Math.sqrt(sx * sx + sy * sy + sz * sz) || 1;
    const dx = sx / len;
    const dy = sy / len;
    const dz = sz / len;
    const acc = -dy * T.gravityDown - 1.0;
    p.ropeSpeed = clamp(p.ropeSpeed + acc * DT, 2, T.zipMaxSpeed);
    p.ropeT += (p.ropeSpeed * DT) / len;
    const release = p.jumpBuf > 0 || p.ropeT >= 1 || this.pressed & Btn.Crouch;
    const k = Math.min(1, p.ropeT);
    p.x = ax + sx * k;
    p.y = ay + sy * k - T.hangHandOffset;
    p.z = az + sz * k;
    this.faceToward(p, dx, dz, 20);
    if (release) {
      const jumped = p.jumpBuf > 0;
      this.detach(p);
      p.vx = dx * p.ropeSpeed;
      p.vy = dy * p.ropeSpeed + (jumped ? 6 : 1.5);
      p.vz = dz * p.ropeSpeed;
      p.jumpBuf = 0;
      p.peakY = p.y;
      this.setMode(p, Mode.Air);
      if (jumped) this.ev.push({ k: 'jump', kind: 'rope', x: p.x, y: p.y, z: p.z });
      return;
    }
    p.vx = dx * p.ropeSpeed;
    p.vy = dy * p.ropeSpeed;
    p.vz = dz * p.ropeSpeed;
    // Collision with anything along the cable ends the ride.
    for (const b of this.col.boxes) {
      if (bottomAt(b, p.x, p.z) >= p.y + T.height - 0.3 || b.top <= p.y + 0.3) continue;
      if (footOverlap(b, p.x, p.z, T.radius * 0.7)) {
        this.detach(p);
        p.vx *= 0.3;
        p.vz *= 0.3;
        p.vy = 0;
        p.peakY = p.y;
        this.setMode(p, Mode.Air);
        return;
      }
    }
  }

  private swing(p: PlayerState): void {
    const ro = this.world.ropes[p.ropeId];
    const f = p.frame;
    // Moving pivots (ropes on movers)
    if (ro.kind === 'swing' || ro.kind === 'hook') {
      const [ax, ay, az] = this.ropeLocal(ro, 'a', f);
      p.pivX = ax;
      p.pivY = ay;
      p.pivZ = az;
    }
    const isBar = ro.kind === 'bar';
    const isHook = ro.kind === 'hook';
    if (p.jumpBuf > 0 || (isHook && this.pressed & Btn.Interact && p.modeT > 3)) {
      const boost = isBar ? 1.12 : T.swingReleaseBoost;
      this.detach(p);
      p.vx *= boost;
      p.vz *= boost;
      p.vy = p.vy * boost + (isBar ? 3.2 : 2.6);
      p.jumpBuf = 0;
      p.peakY = p.y;
      p.canCut = false;
      this.setMode(p, Mode.Air);
      this.ev.push({ k: 'jump', kind: 'rope', x: p.x, y: p.y, z: p.z });
      return;
    }
    // Mass point = body centre
    let mx = p.x;
    let my = p.y + 1.0;
    let mz = p.z;
    p.vy -= 30 * DT;
    if (this.wmag > 0.2) {
      const pump = (isBar ? 10 : T.swingPump) * DT;
      p.vx += this.wx * pump;
      p.vz += this.wz * pump;
    }
    if (isBar) {
      // restrict to the plane perpendicular to the bar
      const [ax, , az] = this.ropeLocal(ro, 'a', f);
      const [bx, , bz] = this.ropeLocal(ro, 'b', f);
      let ux = bx - ax;
      let uz = bz - az;
      const ul = Math.sqrt(ux * ux + uz * uz) || 1;
      ux /= ul;
      uz /= ul;
      const va = p.vx * ux + p.vz * uz;
      p.vx -= va * ux;
      p.vz -= va * uz;
    }
    const damp = 1 - 0.12 * DT;
    p.vx *= damp;
    p.vy *= damp;
    p.vz *= damp;
    // Hook reel-in / rope slide down
    if (isHook && p.ropeLen > 3) p.ropeLen = Math.max(3, p.ropeLen - 1.2 * DT);
    if (ro.kind === 'swing' && (this.btn & Btn.Crouch) !== 0) {
      const [ax, ay, az] = this.ropeLocal(ro, 'a', f);
      const [bx, by, bz] = this.ropeLocal(ro, 'b', f);
      const full = Math.sqrt((bx - ax) ** 2 + (by - ay) ** 2 + (bz - az) ** 2);
      p.ropeLen = Math.min(p.ropeLen + 2.2 * DT, full + 0.5);
    }
    mx += p.vx * DT;
    my += p.vy * DT;
    mz += p.vz * DT;
    let ox = mx - p.pivX;
    let oy = my - p.pivY;
    let oz = mz - p.pivZ;
    const d = Math.sqrt(ox * ox + oy * oy + oz * oz) || 1;
    if (d > p.ropeLen || !isHook) {
      ox *= p.ropeLen / d;
      oy *= p.ropeLen / d;
      oz *= p.ropeLen / d;
      const nx = ox / p.ropeLen;
      const ny = oy / p.ropeLen;
      const nz = oz / p.ropeLen;
      const vr = p.vx * nx + p.vy * ny + p.vz * nz;
      if (vr > 0 || !isHook) {
        p.vx -= vr * nx;
        p.vy -= vr * ny;
        p.vz -= vr * nz;
      }
    }
    mx = p.pivX + ox;
    my = p.pivY + oy;
    mz = p.pivZ + oz;
    // Collide the hanging body.
    p.x = mx;
    p.y = my - 1.0;
    p.z = mz;
    this.ncontacts = 0;
    this.resolveH(p, T.height, 0.1);
    if (this.ncontacts > 0) {
      p.vx *= 0.6;
      p.vz *= 0.6;
    }
    // Landing on something while swinging low
    for (const b of this.col.boxes) {
      if (!footOverlap(b, p.x, p.z, T.footRadius)) continue;
      const top = topAt(b, p.x, p.z);
      if (top > p.y && top < p.y + 0.5 && p.vy <= 0) {
        this.detach(p);
        p.y = top;
        this.setMode(p, Mode.Air);
        this.land(p, b);
        return;
      }
    }
    const hs = this.hspeed(p);
    if (hs > 0.5) this.faceToward(p, p.vx, p.vz, 6);
  }

  private ladder(p: PlayerState): void {
    const ro = this.world.ropes[p.ropeId];
    const f = p.frame;
    const [ax, ay, az] = this.ropeLocal(ro, 'a', f);
    const [, by] = this.ropeLocal(ro, 'b', f);
    const [nx, , nz] = toLocal(f, ro.n.x, ro.n.y, ro.n.z);
    const h = by - ay;
    if (p.jumpBuf > 0) {
      this.detach(p);
      p.vx = nx * 4.5;
      p.vz = nz * 4.5;
      p.vy = 6.0;
      p.jumpBuf = 0;
      p.peakY = p.y;
      p.fx = nx;
      p.fz = nz;
      this.setMode(p, Mode.Air);
      this.ev.push({ k: 'jump', kind: 'ladder', x: p.x, y: p.y, z: p.z });
      return;
    }
    const climb = Math.abs(this.mz) > 0.2 ? this.mz : 0;
    const speed = T.ladderSpeed * (this.sprint ? 1.35 : 1);
    p.ropeT = p.ropeT + (climb * speed * DT) / Math.max(0.01, h);
    p.x = ax + nx * (T.radius + 0.18);
    p.z = az + nz * (T.radius + 0.18);
    p.y = ay + h * p.ropeT;
    p.fx = -nx;
    p.fz = -nz;
    p.vx = p.vz = 0;
    p.vy = climb * speed;
    if (p.ropeT >= 1) {
      // climb onto the top
      const tx = ax - nx * (T.radius + 0.35);
      const tz = az - nz * (T.radius + 0.35);
      p.ax0 = p.x;
      p.ay0 = p.y;
      p.az0 = p.z;
      p.ax1 = tx;
      p.ay1 = by;
      p.az1 = tz;
      p.aPeak = by;
      p.aDur = Math.round(0.3 * TICK_RATE);
      p.aExitVx = -nx * 1.5;
      p.aExitVz = -nz * 1.5;
      p.aExitAir = false;
      p.aCrouch = false;
      p.ropeId = -1;
      this.setMode(p, Mode.Mantle);
      this.ev.push({ k: 'climb' });
      return;
    }
    if (p.ropeT <= 0) {
      p.ropeT = 0;
      if (climb < 0) {
        this.detach(p);
        p.peakY = p.y;
        this.setMode(p, Mode.Air);
      }
    }
    if (this.pressed & Btn.Crouch) {
      this.detach(p);
      p.peakY = p.y;
      this.setMode(p, Mode.Air);
    }
  }

  // ---------------------------------------------------------------- gravity shift

  private touchShift(p: PlayerState, nx: number, ny: number, nz: number): void {
    if (!this.ext.shiftAllowed || !has(this.abil, Ability.GravityShift)) return;
    // Surface normal in world space becomes the new up.
    const [ux, uy, uz] = toWorld(p.frame, nx, ny, nz);
    const ax = Math.abs(ux);
    const ay = Math.abs(uy);
    const az = Math.abs(uz);
    let r: [number, number, number];
    if (ax >= ay && ax >= az) r = [Math.sign(ux), 0, 0];
    else if (ay >= az) r = [0, Math.sign(uy), 0];
    else r = [0, 0, Math.sign(uz)];
    const nf = frameForUp(r[0], r[1], r[2]);
    if (nf === p.frame) {
      if (nf !== 0) p.gravTimer = ticks(this.ext.shiftDuration);
      return;
    }
    if (p.shiftGrace > 0 && this.tick - p.shiftGrace < ticks(0.25)) return;
    this.shiftUp = r;
  }

  private applyShift(p: PlayerState, up: [number, number, number]): void {
    const nf = frameForUp(up[0], up[1], up[2]);
    if (nf === p.frame) return;
    this.changeFrame(p, nf);
    p.gravTimer = ticks(Math.max(1, this.ext.shiftDuration));
    p.shiftGrace = this.tick;
    this.ev.push({ k: 'shift', frame: nf });
  }

  private endShift(p: PlayerState, reason: 'timer' | 'reset'): void {
    // p is in local coordinates here: convert to world, switch, convert to new local (frame 0 = world)
    const [wx, wy, wz] = toWorld(p.frame, p.x, p.y, p.z);
    const [vx, vy, vz] = toWorld(p.frame, p.vx, p.vy, p.vz);
    p.x = wx;
    p.y = wy;
    p.z = wz;
    p.vx = vx;
    p.vy = vy;
    p.vz = vz;
    const cur = p.frame;
    p.frame = 0;
    this.recentre(p, cur, 0);
    this.ev.push({ k: 'shiftEnd', reason });
  }

  /** Switch frames keeping the body centre fixed (p in world coordinates). */
  private changeFrame(p: PlayerState, nf: number): void {
    const cur = p.frame;
    p.frame = nf;
    this.recentre(p, cur, nf);
  }

  private recentre(p: PlayerState, from: number, to: number): void {
    const h = this.bodyH(p) * 0.5;
    const oldUp = toWorld(from, 0, 1, 0);
    const newUp = toWorld(to, 0, 1, 0);
    // centre = feet + oldUp*h ; new feet = centre - newUp*h
    p.x += (oldUp[0] - newUp[0]) * h;
    p.y += (oldUp[1] - newUp[1]) * h;
    p.z += (oldUp[2] - newUp[2]) * h;
    if (p.mode !== Mode.Air) {
      this.detach(p);
      p.mode = Mode.Air;
      p.modeT = 0;
    }
    p.grounded = false;
    p.hasLastRun = false;
    p.hasLastWJ = false;
    p.wallClimbUsed = false;
    p.majorFall = false;
    this.st.fallActive = false;
    // Facing: keep it horizontal in the new frame.
    const fw = toWorld(from, p.fx, 0, p.fz);
    const fl = toLocal(to, fw[0], fw[1], fw[2]);
    const l = Math.sqrt(fl[0] * fl[0] + fl[2] * fl[2]);
    if (l > 0.1) {
      p.fx = fl[0] / l;
      p.fz = fl[2] / l;
    }
    // Remove velocity into the new floor, keep the rest (world).
    const vUp = p.vx * newUp[0] + p.vy * newUp[1] + p.vz * newUp[2];
    if (vUp < 0) {
      p.vx -= vUp * newUp[0];
      p.vy -= vUp * newUp[1];
      p.vz -= vUp * newUp[2];
    }
    // peakY in new local frame
    const pl = toLocal(to, p.x, p.y, p.z);
    p.peakY = pl[1];
  }

  /** Force-place the player (respawn). */
  place(p: PlayerState, x: number, y: number, z: number, yaw: number): void {
    const f = yawForward(yaw);
    p.x = x;
    p.y = y;
    p.z = z;
    p.vx = p.vy = p.vz = 0;
    p.frame = 0;
    p.mode = Mode.Air;
    p.modeT = 0;
    p.fx = f.x;
    p.fz = f.z;
    p.grounded = false;
    p.crouch = false;
    p.majorFall = false;
    p.peakY = y;
    p.ropeId = -1;
    p.ledgeId = -1;
    p.gravTimer = 0;
    p.hasLastRun = false;
    p.hasLastWJ = false;
    p.wallClimbUsed = false;
    p.jumpBuf = 0;
    p.coyote = 0;
  }

  /** True if the body currently overlaps solid geometry deeply (crushed). */
  isCrushed(p: PlayerState): boolean {
    const f = p.frame;
    const [x, y, z] = toLocal(f, p.x, p.y, p.z);
    const h = this.bodyH(p);
    this.col.gather(f, x - 1, y - 1, z - 1, x + 1, y + h + 1, z + 1, this.st, this.tick);
    for (const b of this.col.boxes) {
      if (bottomAt(b, x, z) >= y + h - 0.35 || b.top <= y + 0.35) continue;
      const ps = circlePush(b, x, z, T.radius, this.push);
      if (!ps || ps.depth <= 0.22) continue;
      if (b.shape === Shape.Ramp && topAt(b, x, z) <= y + 0.35) continue;
      return true;
    }
    return false;
  }
}
