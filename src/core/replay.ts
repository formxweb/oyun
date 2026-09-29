import { inputEquals, packInput, unpackInput, type InputFrame } from './input';
import { hashString, type V3 } from './math';
import { Simulation, type SimConfig, type SimMode } from './sim';
import { trialScore, medalFor, type Medal } from './scoring';
import { T } from './tuning';
import type { DailyRoute } from './daily';
import { BASE_ABILITIES, type TrialDef } from './world/types';
import type { World } from './world/world';

/**
 * Physics version. Bump whenever movement or collision changes; replays and leaderboard
 * entries from other versions are not comparable.
 */
export const SIM_VERSION = 'sim-11';

export interface ReplayHeader {
  simVersion: string;
  worldHash: string;
  mode: SimMode;
  /** trial id, or 'daily:YYYY-MM-DD', or 'speedrun' */
  track: string;
  abilities: number;
  flags: string[];
  spawn: { pos: V3; yaw: number };
  /** Daily Summit crosswind, when the day has one */
  wind?: { x: number; z: number };
  ticks: number;
}

export interface Replay {
  header: ReplayHeader;
  inputs: InputFrame[];
}

/** Stable hash of the world geometry that matters to physics. */
export function worldHash(world: World): string {
  let h = 2166136261 >>> 0;
  const mix = (n: number) => {
    // quantize to mm to be robust against print differences
    const q = Math.round(n * 1000) | 0;
    h ^= q;
    h = Math.imul(h, 16777619) >>> 0;
  };
  for (const s of world.solids) {
    mix(s.lx);
    mix(s.ly);
    mix(s.lz);
    mix(s.hx);
    mix(s.hy);
    mix(s.hz);
    mix(s.lyaw);
    mix(s.shape);
    mix(s.flags);
    mix(s.mover);
  }
  for (const m of world.movers) {
    mix(m.origin.x);
    mix(m.origin.y);
    mix(m.origin.z);
    for (const p of m.points) {
      mix(p.x);
      mix(p.y);
      mix(p.z);
    }
    for (const t of m.segTime) mix(t);
    mix(m.angVel);
    mix(m.period);
  }
  for (const r of world.ropes) {
    mix(r.a.x);
    mix(r.a.y);
    mix(r.a.z);
    mix(r.b.x);
    mix(r.b.y);
    mix(r.b.z);
  }
  for (const z of world.zones) {
    mix(z.min.x);
    mix(z.min.y);
    mix(z.min.z);
    mix(z.max.x);
    mix(z.max.y);
    mix(z.max.z);
    mix(z.strength);
    mix(z.period);
  }
  return (h >>> 0).toString(16) + ':' + hashString(SIM_VERSION).toString(16);
}

/** Run-length encoded binary: [count varint][5-byte frame]... then base64. */
export function encodeInputs(inputs: InputFrame[]): Uint8Array {
  const out: number[] = [];
  const buf = new Uint8Array(5);
  let i = 0;
  while (i < inputs.length) {
    let n = 1;
    while (i + n < inputs.length && n < 0x3fff_ffff && inputEquals(inputs[i + n], inputs[i])) n++;
    let v = n;
    while (v >= 0x80) {
      out.push((v & 0x7f) | 0x80);
      v >>>= 7;
    }
    out.push(v);
    packInput(inputs[i], buf, 0);
    for (let k = 0; k < 5; k++) out.push(buf[k]);
    i += n;
  }
  return Uint8Array.from(out);
}

export function decodeInputs(bytes: Uint8Array, maxFrames = 1_000_000): InputFrame[] {
  const out: InputFrame[] = [];
  let p = 0;
  while (p < bytes.length) {
    let n = 0;
    let shift = 0;
    for (;;) {
      if (p >= bytes.length) throw new Error('truncated replay');
      const b = bytes[p++];
      n |= (b & 0x7f) << shift;
      if (!(b & 0x80)) break;
      shift += 7;
      if (shift > 28) throw new Error('bad varint');
    }
    if (p + 5 > bytes.length) throw new Error('truncated frame');
    const f = unpackInput(bytes, p);
    p += 5;
    if (out.length + n > maxFrames) throw new Error('replay too long');
    for (let k = 0; k < n; k++) out.push(f);
  }
  return out;
}

const B64 = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/';

export function toBase64(bytes: Uint8Array): string {
  let s = '';
  for (let i = 0; i < bytes.length; i += 3) {
    const a = bytes[i];
    const b = i + 1 < bytes.length ? bytes[i + 1] : 0;
    const c = i + 2 < bytes.length ? bytes[i + 2] : 0;
    const n = (a << 16) | (b << 8) | c;
    s += B64[(n >> 18) & 63] + B64[(n >> 12) & 63] + (i + 1 < bytes.length ? B64[(n >> 6) & 63] : '=') + (i + 2 < bytes.length ? B64[n & 63] : '=');
  }
  return s;
}

export function fromBase64(s: string): Uint8Array {
  const clean = s.replace(/[^A-Za-z0-9+/=]/g, '');
  const out: number[] = [];
  for (let i = 0; i < clean.length; i += 4) {
    const v = (k: number) => (clean[i + k] === '=' || clean[i + k] === undefined ? 0 : B64.indexOf(clean[i + k]));
    const n = (v(0) << 18) | (v(1) << 12) | (v(2) << 6) | v(3);
    out.push((n >> 16) & 255);
    if (clean[i + 2] !== '=' && clean[i + 2] !== undefined) out.push((n >> 8) & 255);
    if (clean[i + 3] !== '=' && clean[i + 3] !== undefined) out.push(n & 255);
  }
  return Uint8Array.from(out);
}

export function serializeReplay(r: Replay): string {
  return JSON.stringify({ h: r.header, i: toBase64(encodeInputs(r.inputs)) });
}

export function parseReplay(s: string, maxFrames?: number): Replay {
  const o = JSON.parse(s) as { h: ReplayHeader; i: string };
  if (!o || typeof o.i !== 'string' || !o.h || typeof o.h !== 'object') throw new Error('bad replay');
  const h = o.h;
  const num = (n: unknown) => typeof n === 'number' && isFinite(n);
  const vec = (v: unknown) => !!v && num((v as V3).x) && num((v as V3).y) && num((v as V3).z);
  if (typeof h.simVersion !== 'string' || typeof h.worldHash !== 'string' || typeof h.track !== 'string' || typeof h.mode !== 'string') throw new Error('bad replay header');
  if (!num(h.abilities) || !Array.isArray(h.flags) || h.flags.some((f) => typeof f !== 'string')) throw new Error('bad replay header');
  if (!h.spawn || !vec(h.spawn.pos) || !num(h.spawn.yaw)) throw new Error('bad replay header');
  if (h.wind !== undefined && h.wind !== null && !(num(h.wind.x) && num(h.wind.z))) throw new Error('bad replay header');
  return { header: h, inputs: decodeInputs(fromBase64(o.i), maxFrames) };
}

export function configFromHeader(h: ReplayHeader, trial?: TrialDef, gates?: { pos: V3; r: number }[], finish?: { pos: V3; r: number }): SimConfig {
  return {
    mode: h.mode,
    abilities: h.abilities,
    flags: h.flags,
    collected: [],
    litAnchors: [],
    lastAnchor: null,
    spawn: h.spawn,
    recallAnywhere: false,
    ngPlus: false,
    trial,
    gates,
    finish,
    wind: h.wind ?? undefined,
  };
}

export interface VerifyResult {
  ok: boolean;
  reason?: string;
  finishTick: number;
  seconds: number;
  falls: number;
  maxMult: number;
  efficiency: number;
  style: number;
  score: number;
  medal: Medal;
  splits: number[];
  masterGates: number;
}

/**
 * Re-simulate a replay and report the authoritative result. Used by the server to verify
 * leaderboard submissions and by clients to build ghosts.
 */
export function verifyReplay(world: World, r: Replay, trial: TrialDef | undefined, gates?: { pos: V3; r: number }[], finish?: { pos: V3; r: number }, par?: number): VerifyResult {
  const fail = (reason: string): VerifyResult => ({ ok: false, reason, finishTick: 0, seconds: 0, falls: 0, maxMult: 1, efficiency: 0, style: 0, score: 0, medal: 'none', splits: [], masterGates: 0 });
  if (r.header.simVersion !== SIM_VERSION) return fail('version');
  if (r.header.worldHash !== worldHash(world)) return fail('world');
  if (trial) {
    if (r.header.mode !== 'trial' || r.header.track !== trial.id) return fail('track');
    if (r.header.wind) return fail('wind');
    if (r.header.abilities !== trial.abilities) return fail('abilities');
    if ([...r.header.flags].sort().join(',') !== [...trial.flags].sort().join(',')) return fail('flags');
    const d = Math.hypot(r.header.spawn.pos.x - trial.start.x, r.header.spawn.pos.y - trial.start.y, r.header.spawn.pos.z - trial.start.z);
    if (d > 0.01) return fail('spawn');
  }
  const sim = new Simulation(world, configFromHeader(r.header, trial, gates, finish));
  let falls = 0;
  for (let i = 0; i < r.inputs.length; i++) {
    sim.step(r.inputs[i]);
    for (const e of sim.events) if (e.k === 'fallEnd' && e.dist > T.majorFallDrop && !e.caught) falls++;
    if (sim.trial?.finished) break;
  }
  const tr = sim.trial;
  if (!tr || !tr.finished) return fail('unfinished');
  const seconds = tr.finishTick / 120;
  let ideal = 0;
  let prev = trial ? trial.start : r.header.spawn.pos;
  for (const g of [...tr.gates, tr.finish]) {
    ideal += Math.hypot(g.pos.x - prev.x, g.pos.y - prev.y, g.pos.z - prev.z);
    prev = g.pos;
  }
  const efficiency = Math.min(1, ideal / Math.max(1, sim.stats.distance));
  const style = Math.round(sim.risk.styleMoves * 5);
  const p = par ?? trial?.medals.gold ?? seconds;
  const score = trialScore(seconds, p, falls, sim.risk.maxMult, efficiency, style);
  const medal = trial ? medalFor(seconds, falls, trial.medals) : 'none';
  return { ok: true, finishTick: tr.finishTick, seconds, falls, maxMult: sim.risk.maxMult, efficiency, style, score, medal, splits: tr.splits, masterGates: tr.masterHit.size };
}

/**
 * Verify a Daily Summit run against the route the server itself derives for that date: same
 * start, techniques, memory state and weather, and no major fall on a no-fall day.
 */
export function verifyDaily(world: World, r: Replay, route: DailyRoute): VerifyResult {
  const h = r.header;
  const bad = (reason: string) => ({ ...verifyFail, reason });
  if (h.mode !== 'daily' || h.track !== 'daily:' + route.date) return bad('track');
  if (h.abilities !== route.abilities) return bad('abilities');
  if ([...h.flags].sort().join(',') !== [...route.flags].sort().join(',')) return bad('flags');
  if (Math.hypot(h.spawn.pos.x - route.start.x, h.spawn.pos.y - route.start.y, h.spawn.pos.z - route.start.z) > 0.01) return bad('spawn');
  const w = route.wind;
  if (!!w !== !!h.wind || (w && h.wind && (w.x !== h.wind.x || w.z !== h.wind.z))) return bad('wind');
  const v = verifyReplay(world, r, undefined, route.gates, route.finish, route.par);
  if (v.ok && route.modifier === 'nofall' && v.falls > 0) return bad('nofall');
  return v;
}

export interface SpeedrunResult {
  ok: boolean;
  reason?: string;
  seconds: number;
  ticks: number;
}

/**
 * Verify a full-journey speedrun: a fresh Standard journey from the Ground, simulated until
 * the Cradle ends the journey. A journey is long, so the check advances in slices and a server
 * can interleave it with other work.
 */
export class SpeedrunCheck {
  private readonly sim: Simulation | null = null;
  private i = 0;
  result: SpeedrunResult | null = null;

  constructor(
    world: World,
    private readonly r: Replay,
  ) {
    const h = r.header;
    const fail = (reason: string) => {
      this.result = { ok: false, reason, seconds: 0, ticks: 0 };
    };
    const s0 = world.regionData[0].spawn;
    if (h.simVersion !== SIM_VERSION) fail('version');
    else if (h.worldHash !== worldHash(world)) fail('world');
    else if (h.mode !== 'story' || h.track !== 'speedrun') fail('track');
    else if (h.abilities !== BASE_ABILITIES || h.flags.length || h.wind) fail('start');
    else if (Math.hypot(h.spawn.pos.x - s0.pos.x, h.spawn.pos.y - s0.pos.y, h.spawn.pos.z - s0.pos.z) > 0.01) fail('spawn');
    else
      this.sim = new Simulation(world, {
        mode: 'story',
        abilities: BASE_ABILITIES,
        flags: [],
        collected: [],
        litAnchors: [],
        lastAnchor: null,
        spawn: s0,
        recallAnywhere: false,
        ngPlus: false,
      });
  }

  /** Simulate up to `budget` more ticks. Returns the result once known, else null. */
  advance(budget: number): SpeedrunResult | null {
    if (this.result || !this.sim) return this.result;
    const sim = this.sim;
    const end = Math.min(this.r.inputs.length, this.i + budget);
    for (; this.i < end; this.i++) {
      sim.step(this.r.inputs[this.i]);
      if (sim.st.flags.has(SPEEDRUN_END_FLAG)) {
        this.result = { ok: true, seconds: sim.tick / 120, ticks: sim.tick };
        return this.result;
      }
    }
    if (this.i >= this.r.inputs.length) this.result = { ok: false, reason: 'unfinished', seconds: 0, ticks: 0 };
    return this.result;
  }

  get progress(): number {
    return this.r.inputs.length ? this.i / this.r.inputs.length : 1;
  }
}

export function verifySpeedrun(world: World, r: Replay): SpeedrunResult {
  const c = new SpeedrunCheck(world, r);
  return c.advance(Infinity)!;
}

/** The memory flag set when the player enters the Cradle: the journey's (and a speedrun's) end. */
export const SPEEDRUN_END_FLAG = 'r10_cradle';

const verifyFail: VerifyResult = { ok: false, finishTick: 0, seconds: 0, falls: 0, maxMult: 1, efficiency: 0, style: 0, score: 0, medal: 'none', splits: [], masterGates: 0 };

/** Ghost track: positions and facing sampled every tick from a replay. */
export interface GhostTrack {
  x: Float32Array;
  y: Float32Array;
  z: Float32Array;
  fx: Float32Array;
  fz: Float32Array;
  mode: Uint8Array;
  frame: Uint8Array;
  length: number;
}

export function buildGhost(world: World, r: Replay, trial?: TrialDef, gates?: { pos: V3; r: number }[], finish?: { pos: V3; r: number }): GhostTrack {
  const n = r.inputs.length;
  const g: GhostTrack = {
    x: new Float32Array(n + 1),
    y: new Float32Array(n + 1),
    z: new Float32Array(n + 1),
    fx: new Float32Array(n + 1),
    fz: new Float32Array(n + 1),
    mode: new Uint8Array(n + 1),
    frame: new Uint8Array(n + 1),
    length: 0,
  };
  const sim = new Simulation(world, configFromHeader(r.header, trial, gates, finish));
  const put = (i: number) => {
    const p = sim.player;
    g.x[i] = p.x;
    g.y[i] = p.y;
    g.z[i] = p.z;
    g.fx[i] = p.fx;
    g.fz[i] = p.fz;
    g.mode[i] = p.mode;
    g.frame[i] = p.frame;
  };
  put(0);
  let i = 0;
  for (; i < n; i++) {
    sim.step(r.inputs[i]);
    put(i + 1);
    if (sim.trial?.finished) {
      i++;
      break;
    }
  }
  g.length = i + 1;
  return g;
}
