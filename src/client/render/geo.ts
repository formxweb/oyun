import * as THREE from 'three';

type P3 = [number, number, number];

/**
 * Accumulates world-material geometry (position, normal, colour tint, material id, face coords)
 * and emits a single indexed BufferGeometry.
 */
export class GeoBuilder {
  pos: number[] = [];
  nor: number[] = [];
  col: number[] = [];
  mat: number[] = [];
  face: number[] = [];
  idx: number[] = [];
  private r = 1;
  private g = 1;
  private b = 1;
  private m = 0;

  get vertexCount(): number {
    return this.pos.length / 3;
  }

  setStyle(tint: number, mat: number, shade = 1): void {
    this.r = (((tint >> 16) & 255) / 255) * shade;
    this.g = (((tint >> 8) & 255) / 255) * shade;
    this.b = ((tint & 255) / 255) * shade;
    // tints are authored in sRGB; convert to linear for lighting
    this.r = srgbToLinear(this.r);
    this.g = srgbToLinear(this.g);
    this.b = srgbToLinear(this.b);
    this.m = mat;
  }

  private vert(p: P3, n: P3, u: number, v: number, w: number, h: number): number {
    const i = this.pos.length / 3;
    this.pos.push(p[0], p[1], p[2]);
    this.nor.push(n[0], n[1], n[2]);
    this.col.push(this.r, this.g, this.b);
    this.mat.push(this.m);
    this.face.push(u, v, w, h);
    return i;
  }

  /** Quad p0..p3 where p0->p1 spans width w and p0->p3 spans height h. Winding auto-corrected. */
  quad(p0: P3, p1: P3, p2: P3, p3: P3, n: P3): void {
    const w = dist(p0, p1);
    const h = dist(p0, p3);
    const a = this.vert(p0, n, 0, 0, w, h);
    const b = this.vert(p1, n, w, 0, w, h);
    const c = this.vert(p2, n, w, h, w, h);
    const d = this.vert(p3, n, 0, h, w, h);
    const cr = cross(sub(p1, p0), sub(p2, p0));
    if (cr[0] * n[0] + cr[1] * n[1] + cr[2] * n[2] >= 0) this.idx.push(a, b, c, a, c, d);
    else this.idx.push(a, c, b, a, d, c);
  }

  tri(p0: P3, p1: P3, p2: P3, n: P3, f0: [number, number], f1: [number, number], f2: [number, number], w: number, h: number): void {
    const a = this.vert(p0, n, f0[0], f0[1], w, h);
    const b = this.vert(p1, n, f1[0], f1[1], w, h);
    const c = this.vert(p2, n, f2[0], f2[1], w, h);
    const cr = cross(sub(p1, p0), sub(p2, p0));
    if (cr[0] * n[0] + cr[1] * n[1] + cr[2] * n[2] >= 0) this.idx.push(a, b, c);
    else this.idx.push(a, c, b);
  }

  /** Box centred at c with half extents and yaw (three.js Y rotation). */
  box(cx: number, cy: number, cz: number, hx: number, hy: number, hz: number, yaw: number, skipBottom = false): void {
    const c = Math.cos(yaw);
    const s = Math.sin(yaw);
    const P = (x: number, y: number, z: number): P3 => [cx + x * c + z * s, cy + y, cz - x * s + z * c];
    const N = (x: number, y: number, z: number): P3 => [x * c + z * s, y, -x * s + z * c];
    // top
    this.quad(P(-hx, hy, -hz), P(hx, hy, -hz), P(hx, hy, hz), P(-hx, hy, hz), N(0, 1, 0));
    if (!skipBottom) this.quad(P(-hx, -hy, -hz), P(hx, -hy, -hz), P(hx, -hy, hz), P(-hx, -hy, hz), N(0, -1, 0));
    // sides: p0 bottom-left, p3 top-left so v = height above base
    this.quad(P(hx, -hy, -hz), P(hx, -hy, hz), P(hx, hy, hz), P(hx, hy, -hz), N(1, 0, 0));
    this.quad(P(-hx, -hy, hz), P(-hx, -hy, -hz), P(-hx, hy, -hz), P(-hx, hy, hz), N(-1, 0, 0));
    this.quad(P(-hx, -hy, hz), P(hx, -hy, hz), P(hx, hy, hz), P(-hx, hy, hz), N(0, 0, 1));
    this.quad(P(hx, -hy, -hz), P(-hx, -hy, -hz), P(-hx, hy, -hz), P(hx, hy, -hz), N(0, 0, -1));
  }

  /** Ramp (wedge). slope: 0 high at +x, 1 high at -x, 2 high at +z, 3 high at -z. */
  ramp(cx: number, cy: number, cz: number, hx: number, hy: number, hz: number, yaw: number, slope: number): void {
    const c = Math.cos(yaw);
    const s = Math.sin(yaw);
    const P = (x: number, y: number, z: number): P3 => [cx + x * c + z * s, cy + y, cz - x * s + z * c];
    const N = (x: number, y: number, z: number): P3 => {
      const l = Math.hypot(x, y, z);
      return [(x * c + z * s) / l, y / l, (-x * s + z * c) / l];
    };
    // Build in a canonical frame where the high side is +x, then map.
    let map: (x: number, y: number, z: number) => [number, number, number];
    let ex: number;
    let ez: number;
    switch (slope) {
      case 0:
        map = (x, y, z) => [x, y, z];
        ex = hx;
        ez = hz;
        break;
      case 1:
        map = (x, y, z) => [-x, y, -z];
        ex = hx;
        ez = hz;
        break;
      case 2:
        map = (x, y, z) => [-z, y, x];
        ex = hz;
        ez = hx;
        break;
      default:
        map = (x, y, z) => [z, y, -x];
        ex = hz;
        ez = hx;
        break;
    }
    const Q = (x: number, y: number, z: number): P3 => {
      const m = map(x, y, z);
      return P(m[0], m[1], m[2]);
    };
    const QN = (x: number, y: number, z: number): P3 => {
      const m = map(x, y, z);
      return N(m[0], m[1], m[2]);
    };
    const len = Math.hypot(2 * ex, 2 * hy);
    // sloped top
    this.quad(Q(-ex, -hy, -ez), Q(-ex, -hy, ez), Q(ex, hy, ez), Q(ex, hy, -ez), QN(-2 * hy, 2 * ex, 0));
    void len;
    // bottom
    this.quad(Q(-ex, -hy, -ez), Q(ex, -hy, -ez), Q(ex, -hy, ez), Q(-ex, -hy, ez), QN(0, -1, 0));
    // high end
    this.quad(Q(ex, -hy, -ez), Q(ex, -hy, ez), Q(ex, hy, ez), Q(ex, hy, -ez), QN(1, 0, 0));
    // sides
    const w = 2 * ex;
    const h = 2 * hy;
    this.tri(Q(-ex, -hy, ez), Q(ex, -hy, ez), Q(ex, hy, ez), QN(0, 0, 1), [0, 0], [w, 0], [w, h], w, h);
    this.tri(Q(-ex, -hy, -ez), Q(ex, -hy, -ez), Q(ex, hy, -ez), QN(0, 0, -1), [0, 0], [w, 0], [w, h], w, h);
  }

  /** Vertical cylinder centred at c. */
  cyl(cx: number, cy: number, cz: number, r: number, hy: number, seg = 16, capTop = true, capBottom = true): void {
    const circ = 2 * Math.PI * r;
    for (let i = 0; i < seg; i++) {
      const a0 = (i / seg) * Math.PI * 2;
      const a1 = ((i + 1) / seg) * Math.PI * 2;
      const x0 = Math.cos(a0) * r;
      const z0 = Math.sin(a0) * r;
      const x1 = Math.cos(a1) * r;
      const z1 = Math.sin(a1) * r;
      const am = (a0 + a1) / 2;
      const n: P3 = [Math.cos(am), 0, Math.sin(am)];
      const u0 = (i / seg) * circ;
      const u1 = ((i + 1) / seg) * circ;
      const base = this.pos.length / 3;
      const H = 2 * hy;
      this.pos.push(cx + x0, cy - hy, cz + z0, cx + x1, cy - hy, cz + z1, cx + x1, cy + hy, cz + z1, cx + x0, cy + hy, cz + z0);
      for (let k = 0; k < 4; k++) {
        this.nor.push(n[0], n[1], n[2]);
        this.col.push(this.r, this.g, this.b);
        this.mat.push(this.m);
      }
      this.face.push(u0 + 1, 0, circ + 2, H, u1 + 1, 0, circ + 2, H, u1 + 1, H, circ + 2, H, u0 + 1, H, circ + 2, H);
      this.idx.push(base, base + 2, base + 1, base, base + 3, base + 2);
      if (capTop) {
        const t0 = this.vert([cx, cy + hy, cz], [0, 1, 0], r, r, 2 * r, 2 * r);
        const t1 = this.vert([cx + x0, cy + hy, cz + z0], [0, 1, 0], 0, 0, 2 * r, 2 * r);
        const t2 = this.vert([cx + x1, cy + hy, cz + z1], [0, 1, 0], 0, 0, 2 * r, 2 * r);
        this.idx.push(t0, t2, t1);
      }
      if (capBottom) {
        const t0 = this.vert([cx, cy - hy, cz], [0, -1, 0], r, r, 2 * r, 2 * r);
        const t1 = this.vert([cx + x0, cy - hy, cz + z0], [0, -1, 0], 0, 0, 2 * r, 2 * r);
        const t2 = this.vert([cx + x1, cy - hy, cz + z1], [0, -1, 0], 0, 0, 2 * r, 2 * r);
        this.idx.push(t0, t1, t2);
      }
    }
  }

  /** Horizontal cylinder along local X (rotated by yaw), centred at c. */
  hcyl(cx: number, cy: number, cz: number, r: number, halfLen: number, yaw: number, seg = 10): void {
    const c = Math.cos(yaw);
    const s = Math.sin(yaw);
    const P = (x: number, y: number, z: number): P3 => [cx + x * c + z * s, cy + y, cz - x * s + z * c];
    const N = (x: number, y: number, z: number): P3 => [x * c + z * s, y, -x * s + z * c];
    for (let i = 0; i < seg; i++) {
      const a0 = (i / seg) * Math.PI * 2;
      const a1 = ((i + 1) / seg) * Math.PI * 2;
      const am = (a0 + a1) / 2;
      const y0 = Math.cos(a0) * r;
      const z0 = Math.sin(a0) * r;
      const y1 = Math.cos(a1) * r;
      const z1 = Math.sin(a1) * r;
      this.quad(P(-halfLen, y0, z0), P(halfLen, y0, z0), P(halfLen, y1, z1), P(-halfLen, y1, z1), N(0, Math.cos(am), Math.sin(am)));
      this.tri(P(halfLen, 0, 0), P(halfLen, y0, z0), P(halfLen, y1, z1), N(1, 0, 0), [r, r], [0, 0], [0, 0], 2 * r, 2 * r);
      this.tri(P(-halfLen, 0, 0), P(-halfLen, y1, z1), P(-halfLen, y0, z0), N(-1, 0, 0), [r, r], [0, 0], [0, 0], 2 * r, 2 * r);
    }
  }

  /** Low-poly sphere. */
  ball(cx: number, cy: number, cz: number, r: number, seg = 8, rings = 6): void {
    for (let j = 0; j < rings; j++) {
      const t0 = (j / rings) * Math.PI;
      const t1 = ((j + 1) / rings) * Math.PI;
      for (let i = 0; i < seg; i++) {
        const p0 = (i / seg) * Math.PI * 2;
        const p1 = ((i + 1) / seg) * Math.PI * 2;
        const v = (t: number, p: number): P3 => [Math.sin(t) * Math.cos(p), Math.cos(t), Math.sin(t) * Math.sin(p)];
        const a = v(t0, p0);
        const b = v(t0, p1);
        const cc = v(t1, p1);
        const d = v(t1, p0);
        const mid = norm(v((t0 + t1) / 2, (p0 + p1) / 2));
        const S = (q: P3): P3 => [cx + q[0] * r, cy + q[1] * r, cz + q[2] * r];
        this.quad(S(a), S(b), S(cc), S(d), mid);
      }
    }
  }

  /** Cone with base centre (cx, y0, cz). */
  cone(cx: number, y0: number, cz: number, r: number, h: number, seg = 10): void {
    for (let i = 0; i < seg; i++) {
      const a0 = (i / seg) * Math.PI * 2;
      const a1 = ((i + 1) / seg) * Math.PI * 2;
      const am = (a0 + a1) / 2;
      const sl = r / h;
      const nl = Math.hypot(1, sl);
      const n: P3 = [Math.cos(am) / nl, sl / nl, Math.sin(am) / nl];
      const p0: P3 = [cx + Math.cos(a0) * r, y0, cz + Math.sin(a0) * r];
      const p1: P3 = [cx + Math.cos(a1) * r, y0, cz + Math.sin(a1) * r];
      const tip: P3 = [cx, y0 + h, cz];
      this.tri(p0, p1, tip, n, [0, 0], [1, 0], [0.5, h], 1, h + 1);
    }
  }

  /** Oriented square tube from a to b (cables, rods). */
  tube(a: P3, b: P3, r: number): void {
    const d = sub(b, a);
    const l = Math.hypot(d[0], d[1], d[2]);
    if (l < 1e-5) return;
    const t: P3 = [d[0] / l, d[1] / l, d[2] / l];
    let up: P3 = Math.abs(t[1]) < 0.9 ? [0, 1, 0] : [1, 0, 0];
    const s1 = norm(cross(t, up));
    up = norm(cross(s1, t));
    const off = (p: P3, x: number, y: number): P3 => [p[0] + s1[0] * x + up[0] * y, p[1] + s1[1] * x + up[1] * y, p[2] + s1[2] * x + up[2] * y];
    const corners: [number, number][] = [
      [r, r],
      [-r, r],
      [-r, -r],
      [r, -r],
    ];
    for (let i = 0; i < 4; i++) {
      const [x0, y0] = corners[i];
      const [x1, y1] = corners[(i + 1) % 4];
      const mx = (x0 + x1) / 2;
      const my = (y0 + y1) / 2;
      const n = norm([s1[0] * mx + up[0] * my, s1[1] * mx + up[1] * my, s1[2] * mx + up[2] * my]);
      this.quad(off(a, x0, y0), off(a, x1, y1), off(b, x1, y1), off(b, x0, y0), n);
    }
  }

  build(): THREE.BufferGeometry {
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.Float32BufferAttribute(this.pos, 3));
    g.setAttribute('normal', new THREE.Float32BufferAttribute(this.nor, 3));
    g.setAttribute('color', new THREE.Float32BufferAttribute(this.col, 3));
    g.setAttribute('aMat', new THREE.Float32BufferAttribute(this.mat, 1));
    g.setAttribute('aFace', new THREE.Float32BufferAttribute(this.face, 4));
    const n = this.pos.length / 3;
    g.setIndex(n > 65535 ? new THREE.Uint32BufferAttribute(this.idx, 1) : new THREE.Uint16BufferAttribute(this.idx, 1));
    g.computeBoundingSphere();
    g.computeBoundingBox();
    return g;
  }

  get empty(): boolean {
    return this.idx.length === 0;
  }
}

function dist(a: P3, b: P3): number {
  return Math.hypot(a[0] - b[0], a[1] - b[1], a[2] - b[2]);
}
function sub(a: P3, b: P3): P3 {
  return [a[0] - b[0], a[1] - b[1], a[2] - b[2]];
}
function cross(a: P3, b: P3): P3 {
  return [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]];
}
function norm(a: P3): P3 {
  const l = Math.hypot(a[0], a[1], a[2]) || 1;
  return [a[0] / l, a[1] / l, a[2] / l];
}
export function srgbToLinear(c: number): number {
  return c <= 0.04045 ? c / 12.92 : Math.pow((c + 0.055) / 1.055, 2.4);
}
