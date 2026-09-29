/**
 * Deterministic math for the simulation core.
 *
 * The simulation must produce bit-identical results on every platform
 * (browser, Android WebView, Electron, Node server) so that replays,
 * ghosts and server-side leaderboard verification agree. IEEE-754
 * guarantees correctly rounded + - * / and sqrt, but NOT Math.sin/cos/atan2/pow,
 * so the core only uses the functions defined here.
 */

export interface V3 {
  x: number;
  y: number;
  z: number;
}

export const v3 = (x = 0, y = 0, z = 0): V3 => ({ x, y, z });
export const vclone = (a: V3): V3 => ({ x: a.x, y: a.y, z: a.z });
export const vset = (o: V3, x: number, y: number, z: number): V3 => {
  o.x = x;
  o.y = y;
  o.z = z;
  return o;
};
export const vcopy = (o: V3, a: V3): V3 => {
  o.x = a.x;
  o.y = a.y;
  o.z = a.z;
  return o;
};
export const vadd = (a: V3, b: V3): V3 => ({ x: a.x + b.x, y: a.y + b.y, z: a.z + b.z });
export const vsub = (a: V3, b: V3): V3 => ({ x: a.x - b.x, y: a.y - b.y, z: a.z - b.z });
export const vscale = (a: V3, s: number): V3 => ({ x: a.x * s, y: a.y * s, z: a.z * s });
export const vdot = (a: V3, b: V3): number => a.x * b.x + a.y * b.y + a.z * b.z;
export const vlen = (a: V3): number => Math.sqrt(a.x * a.x + a.y * a.y + a.z * a.z);
export const vlenh = (a: V3): number => Math.sqrt(a.x * a.x + a.z * a.z);
export const vdist = (a: V3, b: V3): number => {
  const dx = a.x - b.x;
  const dy = a.y - b.y;
  const dz = a.z - b.z;
  return Math.sqrt(dx * dx + dy * dy + dz * dz);
};
export const vnorm = (a: V3): V3 => {
  const l = vlen(a);
  return l > 1e-9 ? { x: a.x / l, y: a.y / l, z: a.z / l } : { x: 0, y: 0, z: 0 };
};
export const vcross = (a: V3, b: V3): V3 => ({
  x: a.y * b.z - a.z * b.y,
  y: a.z * b.x - a.x * b.z,
  z: a.x * b.y - a.y * b.x,
});
export const vlerp = (a: V3, b: V3, t: number): V3 => ({
  x: a.x + (b.x - a.x) * t,
  y: a.y + (b.y - a.y) * t,
  z: a.z + (b.z - a.z) * t,
});

export const clamp = (v: number, lo: number, hi: number): number => (v < lo ? lo : v > hi ? hi : v);
export const lerp = (a: number, b: number, t: number): number => a + (b - a) * t;
export const sign = (v: number): number => (v > 0 ? 1 : v < 0 ? -1 : 0);
/** Move `v` toward `target` by at most `maxDelta`. */
export const approach = (v: number, target: number, maxDelta: number): number =>
  v < target ? Math.min(v + maxDelta, target) : Math.max(v - maxDelta, target);
export const smoothstep = (e0: number, e1: number, x: number): number => {
  const t = clamp((x - e0) / (e1 - e0), 0, 1);
  return t * t * (3 - 2 * t);
};

export const PI = 3.141592653589793;
export const TAU = 6.283185307179586;
export const HALF_PI = 1.5707963267948966;

const S3 = -1 / 6;
const S5 = 1 / 120;
const S7 = -1 / 5040;
const S9 = 1 / 362880;
const S11 = -1 / 39916800;
const S13 = 1 / 6227020800;

/** Deterministic sine (max abs error ~1e-10). */
export function dsin(x: number): number {
  x = x - TAU * Math.floor((x + PI) / TAU);
  if (x > HALF_PI) x = PI - x;
  else if (x < -HALF_PI) x = -PI - x;
  const x2 = x * x;
  return x * (1 + x2 * (S3 + x2 * (S5 + x2 * (S7 + x2 * (S9 + x2 * (S11 + x2 * S13))))));
}

/** Deterministic cosine. */
export function dcos(x: number): number {
  return dsin(x + HALF_PI);
}

/** Deterministic atan (polynomial + range reduction), used rarely in sim. */
export function datan(x: number): number {
  let inv = false;
  let neg = false;
  if (x < 0) {
    x = -x;
    neg = true;
  }
  if (x > 1) {
    x = 1 / x;
    inv = true;
  }
  // reduce further: atan(x) = atan(c) + atan((x-c)/(1+xc)) with c = 0.5
  let off = 0;
  if (x > 0.4142135623730951) {
    off = 0.4636476090008061; // atan(0.5)
    x = (x - 0.5) / (1 + x * 0.5);
  }
  const x2 = x * x;
  let r = x * (1 + x2 * (-1 / 3 + x2 * (1 / 5 + x2 * (-1 / 7 + x2 * (1 / 9 + x2 * (-1 / 11 + x2 * (1 / 13 + x2 * (-1 / 15))))))));
  r += off;
  if (inv) r = HALF_PI - r;
  return neg ? -r : r;
}

export function datan2(y: number, x: number): number {
  if (x > 0) return datan(y / x);
  if (x < 0) return y >= 0 ? datan(y / x) + PI : datan(y / x) - PI;
  return y > 0 ? HALF_PI : y < 0 ? -HALF_PI : 0;
}

/** Wrap an angle to [-PI, PI). */
export const wrapAngle = (a: number): number => a - TAU * Math.floor((a + PI) / TAU);

/** Forward vector for a camera yaw (three.js convention: yaw 0 looks toward -Z). */
export function yawForward(yaw: number): V3 {
  return { x: -dsin(yaw), y: 0, z: -dcos(yaw) };
}

/** Right vector for a camera yaw. */
export function yawRight(yaw: number): V3 {
  return { x: dcos(yaw), y: 0, z: -dsin(yaw) };
}

/** Yaw that faces a horizontal direction (inverse of yawForward). */
export function yawOf(dx: number, dz: number): number {
  return datan2(-dx, -dz);
}

/** Integer hash used for deterministic variation in authored content. */
export function hash32(n: number): number {
  n = Math.imul(n ^ (n >>> 16), 0x7feb352d);
  n = Math.imul(n ^ (n >>> 15), 0x846ca68b);
  return (n ^ (n >>> 16)) >>> 0;
}

export function hashString(s: string): number {
  let h = 2166136261 >>> 0;
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i);
    h = Math.imul(h, 16777619) >>> 0;
  }
  return h >>> 0;
}
