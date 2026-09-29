import * as THREE from 'three';
import { Shape, SolidFlag, type Decor, type Mover, type Solid } from '../../core/world/types';
import { CRUMBLE_DELAY, CRUMBLE_RESPAWN, TICK_RATE, type World, type WorldState } from '../../core/world/world';
import { GeoBuilder } from './geo';
import { getGlyphAtlas, glyphUV } from './glyphs';
import { createWorldMaterial, type WorldUniforms } from './materials';

const CHUNK_H = 48;

interface Chunk {
  region: number;
  center: THREE.Vector3;
  radius: number;
  detail: THREE.Mesh;
  lod: THREE.Mesh | null;
  glyphs: THREE.Mesh | null;
}

interface Conditional {
  show: string | null;
  hide: string | null;
  fallOnly: boolean;
  tag: string | null;
  obj: THREE.Object3D;
}

interface MoverView {
  mover: Mover;
  group: THREE.Group;
  conds: Conditional[];
}

interface CrumbleView {
  solid: Solid;
  mesh: THREE.Mesh;
  base: THREE.Vector3;
}

export interface WorldViewOptions {
  drawDistance: number;
  lodDistance: number;
  detail: number;
}

type Key = string;
const condKey = (show: string | null, hide: string | null, fall: boolean, tag: string | null): Key => `${show ?? ''}|${hide ?? ''}|${fall ? 1 : 0}|${tag ?? ''}`;

/** Builds and manages all static and dynamic world geometry. */
export class WorldView {
  readonly group = new THREE.Group();
  private chunks: Chunk[] = [];
  private conds: Conditional[] = [];
  private movers: MoverView[] = [];
  private crumbles: CrumbleView[] = [];
  private readonly mat: THREE.MeshLambertMaterial;
  private readonly fallMat: THREE.MeshLambertMaterial;
  private readonly glyphMat: THREE.ShaderMaterial;
  private readonly glyphFallMat: THREE.ShaderMaterial;
  private fallFade = 0;
  readonly lampPositions: THREE.Vector3[] = [];

  constructor(
    private readonly world: World,
    u: WorldUniforms,
    private opts: WorldViewOptions,
  ) {
    this.mat = createWorldMaterial(u);
    this.fallMat = createWorldMaterial(u, { transparent: true });
    this.fallMat.opacity = 0;
    this.fallMat.depthWrite = false;
    this.fallMat.emissive = new THREE.Color(0xffd89a);
    this.fallMat.emissiveIntensity = 0.9;
    this.glyphMat = makeGlyphMaterial(u, 0.92);
    this.glyphFallMat = makeGlyphMaterial(u, 0);
    this.build();
  }

  setOptions(o: WorldViewOptions): void {
    this.opts = o;
  }

  private build(): void {
    const w = this.world;
    const chunkBuilders = new Map<string, { gb: GeoBuilder; lod: GeoBuilder; gl: GlyphBuilder; region: number; min: THREE.Vector3; max: THREE.Vector3 }>();
    const condBuilders = new Map<Key, { gb: GeoBuilder; gl: GlyphBuilder; show: string | null; hide: string | null; fall: boolean; tag: string | null }>();
    const moverBuilders = new Map<number, Map<Key, { gb: GeoBuilder; gl: GlyphBuilder; show: string | null; hide: string | null; fall: boolean; tag: string | null }>>();

    const chunkFor = (region: number, x: number, y: number, z: number) => {
      const k = `${region}:${Math.floor(y / CHUNK_H)}:${Math.floor(x / 160)}:${Math.floor(z / 160)}`;
      let c = chunkBuilders.get(k);
      if (!c) {
        c = { gb: new GeoBuilder(), lod: new GeoBuilder(), gl: new GlyphBuilder(), region, min: new THREE.Vector3(Infinity, Infinity, Infinity), max: new THREE.Vector3(-Infinity, -Infinity, -Infinity) };
        chunkBuilders.set(k, c);
      }
      return c;
    };
    const condFor = (show: string | null, hide: string | null, fall: boolean, tag: string | null) => {
      const k = condKey(show, hide, fall, tag);
      let c = condBuilders.get(k);
      if (!c) {
        c = { gb: new GeoBuilder(), gl: new GlyphBuilder(), show, hide, fall, tag };
        condBuilders.set(k, c);
      }
      return c;
    };
    const moverFor = (mid: number, show: string | null, hide: string | null, fall: boolean, tag: string | null) => {
      let mm = moverBuilders.get(mid);
      if (!mm) {
        mm = new Map();
        moverBuilders.set(mid, mm);
      }
      const k = condKey(show, hide, fall, tag);
      let c = mm.get(k);
      if (!c) {
        c = { gb: new GeoBuilder(), gl: new GlyphBuilder(), show, hide, fall, tag };
        mm.set(k, c);
      }
      return c;
    };

    for (const so of w.solids) {
      if (so.flags & SolidFlag.Crumble) {
        const gb = new GeoBuilder();
        addSolid(gb, so, true);
        const mesh = new THREE.Mesh(gb.build(), this.mat);
        mesh.castShadow = true;
        mesh.receiveShadow = true;
        this.group.add(mesh);
        this.crumbles.push({ solid: so, mesh, base: new THREE.Vector3() });
        continue;
      }
      const fall = (so.flags & SolidFlag.FallOnly) !== 0;
      if (so.mover >= 0) {
        const b = moverFor(so.mover, so.show, so.hide, fall, fall ? so.tag : null);
        addSolid(b.gb, so, false);
        continue;
      }
      if (so.show !== null || so.hide !== null || fall) {
        const b = condFor(so.show, so.hide, fall, fall ? so.tag : null);
        addSolid(b.gb, so, true);
        continue;
      }
      const c = chunkFor(so.region, so.x, so.y, so.z);
      addSolid(c.gb, so, true);
      const big = Math.max(so.hx, so.hy, so.hz) * 2;
      if (big >= 5 || so.hx * so.hz * so.hy * 8 > 60) addSolid(c.lod, so, true);
      c.min.min(new THREE.Vector3(so.minX, so.minY, so.minZ));
      c.max.max(new THREE.Vector3(so.maxX, so.maxY, so.maxZ));
    }
    for (const d of w.decor) {
      if (d.kind === 'bird') continue;
      const fall = d.fallOnly === true;
      let gb: GeoBuilder;
      let gl: GlyphBuilder;
      let lodB: GeoBuilder | null = null;
      if (d.mover >= 0) {
        const b = moverFor(d.mover, d.show, d.hide, fall, null);
        gb = b.gb;
        gl = b.gl;
      } else if (d.show !== null || d.hide !== null || fall) {
        const b = condFor(d.show, d.hide, fall, null);
        gb = b.gb;
        gl = b.gl;
      } else {
        const c = chunkFor(d.region, d.p.x, d.p.y, d.p.z);
        gb = c.gb;
        gl = c.gl;
        if (d.landmark) lodB = c.lod;
        c.min.min(new THREE.Vector3(d.p.x - 1, d.p.y - 1, d.p.z - 1));
        c.max.max(new THREE.Vector3(d.p.x + 1, d.p.y + 1, d.p.z + 1));
      }
      addDecor(gb, gl, d);
      if (lodB) addDecor(lodB, new GlyphBuilder(), d);
      if (d.kind === 'lamp' && d.mover < 0) this.lampPositions.push(new THREE.Vector3(d.p.x, d.p.y, d.p.z));
    }

    for (const c of chunkBuilders.values()) {
      if (c.gb.empty && c.gl.empty) continue;
      const detail = new THREE.Mesh(c.gb.build(), this.mat);
      detail.castShadow = true;
      detail.receiveShadow = true;
      this.group.add(detail);
      let lod: THREE.Mesh | null = null;
      if (!c.lod.empty) {
        lod = new THREE.Mesh(c.lod.build(), this.mat);
        lod.visible = false;
        this.group.add(lod);
      }
      let glyphs: THREE.Mesh | null = null;
      if (!c.gl.empty) {
        glyphs = new THREE.Mesh(c.gl.build(), this.glyphMat);
        glyphs.renderOrder = 2;
        this.group.add(glyphs);
      }
      const center = c.min.clone().add(c.max).multiplyScalar(0.5);
      const radius = c.max.clone().sub(c.min).length() / 2;
      this.chunks.push({ region: c.region, center, radius, detail, lod, glyphs });
    }
    for (const c of condBuilders.values()) {
      const obj = new THREE.Group();
      if (!c.gb.empty) {
        const m = new THREE.Mesh(c.gb.build(), c.fall ? this.fallMat : this.mat);
        m.castShadow = !c.fall;
        m.receiveShadow = !c.fall;
        obj.add(m);
      }
      if (!c.gl.empty) {
        const m = new THREE.Mesh(c.gl.build(), c.fall ? this.glyphFallMat : this.glyphMat);
        m.renderOrder = 2;
        obj.add(m);
      }
      this.group.add(obj);
      this.conds.push({ show: c.show, hide: c.hide, fallOnly: c.fall, tag: c.tag, obj });
    }
    for (const [mid, mm] of moverBuilders) {
      const mover = w.movers[mid];
      const group = new THREE.Group();
      group.position.set(mover.origin.x, mover.origin.y, mover.origin.z);
      const conds: Conditional[] = [];
      for (const c of mm.values()) {
        const obj = new THREE.Group();
        if (!c.gb.empty) {
          const m = new THREE.Mesh(c.gb.build(), c.fall ? this.fallMat : this.mat);
          m.castShadow = true;
          m.receiveShadow = true;
          obj.add(m);
        }
        if (!c.gl.empty) obj.add(new THREE.Mesh(c.gl.build(), this.glyphMat));
        group.add(obj);
        conds.push({ show: c.show, hide: c.hide, fallOnly: c.fall, tag: c.tag, obj });
      }
      this.group.add(group);
      this.movers.push({ mover, group, conds });
    }
  }

  /** Update visibility, mover transforms and fall-only fades. */
  update(st: WorldState, tickF: number, cam: THREE.Vector3, fallActive: boolean, dt: number): void {
    const o = this.opts;
    this.fallFade += ((fallActive ? 1 : 0) - this.fallFade) * Math.min(1, dt * (fallActive ? 3 : 1.5));
    this.fallMat.opacity = this.fallFade * 0.85;
    this.fallMat.visible = this.fallFade > 0.01;
    (this.glyphFallMat.uniforms.uOpacity as { value: number }).value = this.fallFade;
    for (const c of this.chunks) {
      const d = c.center.distanceTo(cam) - c.radius;
      const near = d < o.lodDistance;
      const far = d < o.drawDistance;
      c.detail.visible = near;
      if (c.lod) c.lod.visible = !near && far;
      if (c.glyphs) c.glyphs.visible = d < Math.min(o.lodDistance, 260);
    }
    const flagOk = (c: Conditional): boolean => {
      if (c.show !== null && !st.flags.has(c.show)) return false;
      if (c.hide !== null && st.flags.has(c.hide)) return false;
      return true;
    };
    for (const c of this.conds) {
      let vis = flagOk(c);
      if (vis && c.fallOnly) {
        const remembered = c.tag !== null && st.flags.has(c.tag);
        vis = remembered || this.fallFade > 0.01;
        if (remembered) {
          // remembered fall lines render as solid architecture
          c.obj.traverse((m) => {
            if ((m as THREE.Mesh).isMesh && (m as THREE.Mesh).material === this.fallMat) (m as THREE.Mesh).material = this.mat;
          });
        }
      }
      c.obj.visible = vis;
    }
    for (const mv of this.movers) {
      const pose = this.world.moverPoseAt(mv.mover, tickF, st);
      mv.group.position.set(mv.mover.origin.x + pose.x, mv.mover.origin.y + pose.y, mv.mover.origin.z + pose.z);
      mv.group.rotation.y = pose.yaw;
      const d = mv.group.position.distanceTo(cam);
      mv.group.visible = d < o.drawDistance;
      for (const c of mv.conds) {
        let vis = flagOk(c);
        if (vis && c.fallOnly) vis = (c.tag !== null && st.flags.has(c.tag)) || this.fallFade > 0.01;
        c.obj.visible = vis;
      }
    }
    const tick = Math.floor(tickF);
    for (const cv of this.crumbles) {
      const so = cv.solid;
      const t0 = st.crumble.get(so.id);
      cv.mesh.visible = so.show === null || st.flags.has(so.show);
      if (so.hide !== null && st.flags.has(so.hide)) cv.mesh.visible = false;
      if (t0 === undefined) {
        cv.mesh.position.set(0, 0, 0);
        (cv.mesh.material as THREE.Material).opacity = 1;
        continue;
      }
      const e = tick - t0;
      if (e < CRUMBLE_DELAY) {
        const k = e / CRUMBLE_DELAY;
        cv.mesh.position.set(Math.sin(e * 1.7) * 0.03 * k, -0.02 * k, Math.cos(e * 2.3) * 0.03 * k);
      } else if (e < CRUMBLE_DELAY + CRUMBLE_RESPAWN) {
        const fall = (e - CRUMBLE_DELAY) / TICK_RATE;
        cv.mesh.position.set(0, -0.5 * 20 * fall * fall, 0);
        cv.mesh.visible = cv.mesh.visible && fall < 1.4;
        if (e > CRUMBLE_DELAY + CRUMBLE_RESPAWN - 30) {
          cv.mesh.position.set(0, 0, 0);
          cv.mesh.visible = (e - (CRUMBLE_DELAY + CRUMBLE_RESPAWN - 30)) % 8 < 4;
        }
      } else {
        cv.mesh.position.set(0, 0, 0);
      }
    }
  }

  dispose(): void {
    this.group.traverse((o) => {
      const m = o as THREE.Mesh;
      if (m.isMesh) m.geometry.dispose();
    });
    this.mat.dispose();
    this.fallMat.dispose();
    this.glyphMat.dispose();
    this.glyphFallMat.dispose();
  }
}

function addSolid(gb: GeoBuilder, so: Solid, world: boolean): void {
  gb.setStyle(so.tint, so.mat);
  const x = world ? so.x : so.lx;
  const y = world ? so.y : so.ly;
  const z = world ? so.z : so.lz;
  const yaw = world ? so.yaw : so.lyaw;
  if (so.shape === Shape.Box) gb.box(x, y, z, so.hx, so.hy, so.hz, yaw);
  else if (so.shape === Shape.Ramp) gb.ramp(x, y, z, so.hx, so.hy, so.hz, yaw, so.slope);
  else gb.cyl(x, y, z, so.hx, so.hy, so.hx > 3 ? 28 : so.hx > 1 ? 18 : 12);
}

function hashf(n: number): number {
  const s = Math.sin(n * 127.1) * 43758.5453;
  return s - Math.floor(s);
}

const LAUNDRY = [0xd9534f, 0xf0ad4e, 0xf7f1e3, 0x5bc0de, 0x9b59b6, 0x2e86ab, 0xe8d8b0, 0x6ab04c];

function addDecor(gb: GeoBuilder, gl: GlyphBuilder, d: Decor): void {
  const { p, s } = d;
  gb.setStyle(d.tint, d.mat);
  switch (d.kind) {
    case 'box':
    case 'window':
    case 'sign':
      gb.box(p.x, p.y, p.z, s.x / 2, s.y / 2, s.z / 2, d.yaw);
      break;
    case 'crate':
      gb.setStyle(d.tint, 5);
      gb.box(p.x, p.y + s.y / 2, p.z, s.x / 2, s.y / 2, s.z / 2, d.yaw);
      break;
    case 'cyl':
      gb.cyl(p.x, p.y, p.z, s.x, s.y / 2, s.x > 2 ? 20 : 10);
      break;
    case 'hcyl':
      gb.hcyl(p.x, p.y, p.z, s.y, s.x / 2, d.yaw, s.y > 0.5 ? 14 : 8);
      break;
    case 'cone':
      gb.cone(p.x, p.y, p.z, s.x, s.y, 10);
      break;
    case 'sphere':
      gb.ball(p.x, p.y, p.z, s.x);
      break;
    case 'cable': {
      if (!d.q) break;
      const sag = s.x;
      const r = s.y > 0 ? s.y : 0.025;
      const n = 8;
      let prev: [number, number, number] = [p.x, p.y, p.z];
      for (let i = 1; i <= n; i++) {
        const t = i / n;
        const cur: [number, number, number] = [p.x + (d.q.x - p.x) * t, p.y + (d.q.y - p.y) * t - sag * 4 * t * (1 - t), p.z + (d.q.z - p.z) * t];
        gb.tube(prev, cur, r);
        prev = cur;
      }
      break;
    }
    case 'glyph':
      gl.add(d);
      break;
    case 'lamp':
      // hanging lantern: bracket, cage, warm core
      gb.setStyle(0x2a2622, 3);
      gb.box(p.x, p.y + 0.32, p.z, 0.02, 0.18, 0.02, 0);
      gb.box(p.x, p.y + 0.12, p.z, 0.11, 0.02, 0.11, d.yaw);
      gb.box(p.x, p.y - 0.14, p.z, 0.11, 0.02, 0.11, d.yaw);
      gb.setStyle(d.tint, 19);
      gb.box(p.x, p.y - 0.01, p.z, 0.075, 0.12, 0.075, d.yaw);
      break;
    case 'tree': {
      const h = s.y;
      gb.setStyle(0x5a4030, 5);
      gb.cyl(p.x, p.y + h * 0.2, p.z, s.x * 0.12, h * 0.2, 7);
      gb.setStyle(d.tint, 15);
      gb.cone(p.x, p.y + h * 0.3, p.z, s.x, h * 0.45, 9);
      gb.cone(p.x, p.y + h * 0.55, p.z, s.x * 0.72, h * 0.45, 9);
      break;
    }
    case 'plant':
      gb.setStyle(0x8a5a3a, 1);
      gb.cyl(p.x, p.y + 0.2, p.z, 0.22, 0.2, 8);
      gb.setStyle(d.tint, 15);
      gb.ball(p.x, p.y + 0.65, p.z, s.x || 0.4, 6, 4);
      break;
    case 'vines': {
      const n = Math.max(3, Math.round(s.x * 3));
      for (let i = 0; i < n; i++) {
        const h = s.y * (0.4 + 0.6 * hashf(p.x * 3 + i * 7.1 + p.z));
        const c = Math.cos(d.yaw);
        const sn = Math.sin(d.yaw);
        const off = (i / (n - 1) - 0.5) * s.x;
        gb.box(p.x + off * c, p.y - h / 2, p.z - off * sn, 0.05, h / 2, 0.05, d.yaw);
      }
      break;
    }
    case 'laundry': {
      if (!d.q) break;
      gb.setStyle(0x444444, 3);
      gb.tube([p.x, p.y, p.z], [d.q.x, d.q.y, d.q.z], 0.012);
      const len = Math.hypot(d.q.x - p.x, d.q.z - p.z);
      const n = Math.max(2, Math.floor(len / 0.9));
      const yaw = Math.atan2(-(d.q.z - p.z), d.q.x - p.x);
      for (let i = 1; i < n; i++) {
        if (hashf(i * 13.7 + p.x) < 0.25) continue;
        const t = i / n;
        const x = p.x + (d.q.x - p.x) * t;
        const z = p.z + (d.q.z - p.z) * t;
        const y = p.y + (d.q.y - p.y) * t - 0.15 * 4 * t * (1 - t);
        const col = LAUNDRY[Math.floor(hashf(i * 3.3 + p.z) * LAUNDRY.length)];
        gb.setStyle(col, 9);
        const h = 0.45 + hashf(i + p.y) * 0.4;
        gb.box(x, y - h / 2, z, 0.3, h / 2, 0.01, yaw);
      }
      break;
    }
    case 'flag': {
      gb.setStyle(0x777777, 3);
      gb.cyl(p.x, p.y + s.y / 2, p.z, 0.04, s.y / 2, 6);
      gb.setStyle(d.tint, 9);
      const c = Math.cos(d.yaw);
      const sn = Math.sin(d.yaw);
      gb.box(p.x + c * s.x * 0.5, p.y + s.y - 0.35, p.z - sn * s.x * 0.5, s.x / 2, 0.3, 0.01, d.yaw);
      break;
    }
    case 'gear': {
      const r = s.x;
      const h = s.y;
      gb.cyl(p.x, p.y, p.z, r * 0.88, h / 2, 20);
      const teeth = Math.max(8, Math.round(r * 5));
      for (let i = 0; i < teeth; i++) {
        const a = (i / teeth) * Math.PI * 2;
        gb.box(p.x + Math.cos(a) * r * 0.94, p.y, p.z + Math.sin(a) * r * 0.94, r * 0.08, h / 2, r * 0.12, -a);
      }
      break;
    }
  }
}

/** Collects textured glyph quads. */
export class GlyphBuilder {
  private pos: number[] = [];
  private uv: number[] = [];
  private col: number[] = [];
  private idx: number[] = [];

  get empty(): boolean {
    return this.idx.length === 0;
  }

  add(d: Decor): void {
    const [u0, v0, u1, v1] = glyphUV(d.key ?? 'plumb');
    const h = d.s.x / 2;
    const mode = d.s.z; // 0 wall, 1 facing up, -1 facing down
    const c = Math.cos(d.yaw);
    const s = Math.sin(d.yaw);
    const corners: [number, number][] = [
      [-h, -h],
      [h, -h],
      [h, h],
      [-h, h],
    ];
    const base = this.pos.length / 3;
    for (const [a, b] of corners) {
      let x: number;
      let y: number;
      let z: number;
      if (mode === 0) {
        // plane faces +z rotated by yaw; offset slightly off the wall
        x = d.p.x + a * c + 0.02 * s;
        y = d.p.y + b;
        z = d.p.z - a * s + 0.02 * c;
      } else {
        x = d.p.x + a * c + b * s;
        y = d.p.y + (mode > 0 ? 0.02 : -0.02);
        z = d.p.z - a * s + b * c;
      }
      this.pos.push(x, y, z);
    }
    this.uv.push(u0, v0, u1, v0, u1, v1, u0, v1);
    const r = ((d.tint >> 16) & 255) / 255;
    const g = ((d.tint >> 8) & 255) / 255;
    const bl = (d.tint & 255) / 255;
    for (let i = 0; i < 4; i++) this.col.push(r, g, bl);
    if (mode < 0) this.idx.push(base, base + 2, base + 1, base, base + 3, base + 2);
    else this.idx.push(base, base + 1, base + 2, base, base + 2, base + 3);
  }

  build(): THREE.BufferGeometry {
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.Float32BufferAttribute(this.pos, 3));
    g.setAttribute('uv', new THREE.Float32BufferAttribute(this.uv, 2));
    g.setAttribute('color', new THREE.Float32BufferAttribute(this.col, 3));
    g.setIndex(this.idx);
    g.computeBoundingSphere();
    return g;
  }
}

function makeGlyphMaterial(u: WorldUniforms, opacity: number): THREE.ShaderMaterial {
  return new THREE.ShaderMaterial({
    uniforms: {
      uMap: { value: getGlyphAtlas() },
      uOpacity: { value: opacity },
      uFogColor: u.uFogColor,
      uFogDensity: u.uFogDensity,
      uHeightFogColor: u.uHeightFogColor,
      uCamY: u.uCamY,
    },
    vertexShader: /* glsl */ `
      attribute vec3 color;
      varying vec2 vUv; varying vec3 vCol; varying vec3 vW;
      void main(){ vUv = uv; vCol = color; vec4 w = modelMatrix*vec4(position,1.0); vW = w.xyz; gl_Position = projectionMatrix*viewMatrix*w; }`,
    fragmentShader: /* glsl */ `
      uniform sampler2D uMap; uniform float uOpacity; uniform vec3 uFogColor; uniform float uFogDensity; uniform vec3 uHeightFogColor; uniform float uCamY;
      varying vec2 vUv; varying vec3 vCol; varying vec3 vW;
      void main(){
        float a = texture2D(uMap, vUv).a * uOpacity;
        if (a < 0.02) discard;
        float dist = length(vW - cameraPosition);
        float fogF = 1.0 - exp(-pow(dist*uFogDensity, 1.35));
        vec3 c = mix(vCol, uFogColor, fogF);
        gl_FragColor = vec4(c, a*(1.0-fogF*0.8));
      }`,
    transparent: true,
    depthWrite: false,
    polygonOffset: true,
    polygonOffsetFactor: -2,
    side: THREE.DoubleSide,
  });
}
