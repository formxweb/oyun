import * as THREE from 'three';
import { Mode } from '../../core/player';

export interface Look {
  jacket: number;
  pants: number;
  shoes: number;
  gloves: number;
  scarf: number;
  hood: number;
  skin: number;
  /** 0 hood, 1 cap, 2 bare */
  headwear: number;
  scarfLength: number;
}

export const DEFAULT_LOOK: Look = {
  jacket: 0x8a6a3a,
  pants: 0x2d3440,
  shoes: 0xe8e0d0,
  gloves: 0x3a2e28,
  scarf: 0xd8431f,
  hood: 0x6e5530,
  skin: 0xc8946c,
  headwear: 0,
  scarfLength: 10,
};

export interface PoseInput {
  pos: THREE.Vector3;
  /** facing direction in local frame (x,z) */
  fx: number;
  fz: number;
  up: THREE.Vector3;
  mode: Mode;
  modeT: number;
  vel: THREE.Vector3;
  grounded: boolean;
  crouch: boolean;
  majorFall: boolean;
  wallSide: number;
  animU: number;
  /** swing pivot (world) when on rope/bar/hook */
  pivot: THREE.Vector3 | null;
  wind: THREE.Vector3;
  dt: number;
}

interface Joint {
  g: THREE.Group;
  x: number;
  y: number;
  z: number;
  tx: number;
  ty: number;
  tz: number;
}

const SCARF_SEG = 12;

/** Procedurally built and animated climber. No skinned assets: every pose is computed. */
export class Character {
  readonly root = new THREE.Group();
  private readonly body = new THREE.Group();
  private readonly j: Record<string, Joint> = {};
  private readonly mats: THREE.MeshLambertMaterial[] = [];
  private phase = 0;
  private bob = 0;
  private lean = 0;
  private rootRoll = 0;
  private rootPitch = 0;
  private rootDrop = 0;
  private scarfPts: THREE.Vector3[] = [];
  private scarfPrev: THREE.Vector3[] = [];
  private readonly scarfGeo = new THREE.BufferGeometry();
  private readonly scarfMesh: THREE.Mesh;
  private readonly scarfMat: THREE.MeshLambertMaterial;
  private scarfInit = false;
  private look: Look = DEFAULT_LOOK;
  private readonly neckWorld = new THREE.Vector3();
  private readonly qFrame = new THREE.Quaternion();
  private readonly ghost: boolean;

  constructor(look: Look = DEFAULT_LOOK, ghost = false, ghostColor = 0x9fd8ff) {
    this.ghost = ghost;
    this.look = look;
    this.root.add(this.body);
    const M = (c: number) => {
      const m = ghost
        ? new THREE.MeshLambertMaterial({ color: ghostColor, transparent: true, opacity: 0.35, depthWrite: false, emissive: ghostColor, emissiveIntensity: 0.4 })
        : new THREE.MeshLambertMaterial({ color: c });
      this.mats.push(m);
      return m;
    };
    const box = (w: number, h: number, d: number, m: THREE.Material, y = -h / 2) => {
      const mesh = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), m);
      mesh.position.y = y;
      mesh.castShadow = !ghost;
      return mesh;
    };
    const joint = (name: string, parent: THREE.Object3D, x: number, y: number, z: number): THREE.Group => {
      const g = new THREE.Group();
      g.position.set(x, y, z);
      parent.add(g);
      this.j[name] = { g, x: 0, y: 0, z: 0, tx: 0, ty: 0, tz: 0 };
      return g;
    };
    const jacket = M(look.jacket);
    const pants = M(look.pants);
    const shoes = M(look.shoes);
    const gloves = M(look.gloves);
    const hood = M(look.hood);
    const skin = M(look.skin);

    const hips = joint('hips', this.body, 0, 0.95, 0);
    hips.add(box(0.34, 0.2, 0.2, pants, 0));
    const torso = joint('torso', hips, 0, 0.05, 0);
    const chest = box(0.4, 0.52, 0.24, jacket, 0.27);
    torso.add(chest);
    const pack = box(0.28, 0.3, 0.1, hood, 0.33);
    pack.position.z = 0.17;
    torso.add(pack);
    const neck = joint('neck', torso, 0, 0.56, 0);
    const head = new THREE.Mesh(new THREE.SphereGeometry(0.125, 12, 10), skin);
    head.position.y = 0.14;
    head.castShadow = !ghost;
    neck.add(head);
    if (look.headwear === 0) {
      const hd = new THREE.Mesh(new THREE.SphereGeometry(0.145, 12, 10, 0, Math.PI * 2, 0, Math.PI * 0.62), hood);
      hd.position.set(0, 0.155, 0.02);
      hd.castShadow = !ghost;
      neck.add(hd);
    } else if (look.headwear === 1) {
      const cap = box(0.26, 0.08, 0.28, hood, 0.25);
      neck.add(cap);
      const brim = box(0.22, 0.02, 0.12, hood, 0.22);
      brim.position.z = -0.18;
      neck.add(brim);
    }
    // goggles band
    const gog = box(0.2, 0.05, 0.05, M(0x1a1d22), 0.17);
    gog.position.z = -0.11;
    neck.add(gog);

    for (const side of [-1, 1]) {
      const s = side < 0 ? 'L' : 'R';
      const sh = joint('sh' + s, torso, side * 0.24, 0.48, 0);
      sh.add(box(0.12, 0.3, 0.12, jacket));
      const el = joint('el' + s, sh, 0, -0.3, 0);
      el.add(box(0.1, 0.27, 0.1, jacket));
      const hand = box(0.09, 0.1, 0.1, gloves, -0.32);
      el.add(hand);
      const hp = joint('hp' + s, hips, side * 0.1, -0.06, 0);
      hp.add(box(0.15, 0.44, 0.16, pants));
      const kn = joint('kn' + s, hp, 0, -0.44, 0);
      kn.add(box(0.13, 0.42, 0.13, pants));
      const foot = box(0.13, 0.08, 0.26, shoes, -0.44);
      foot.position.z = -0.05;
      kn.add(foot);
    }

    this.scarfMat = ghost
      ? new THREE.MeshLambertMaterial({ color: ghostColor, transparent: true, opacity: 0.35, side: THREE.DoubleSide, depthWrite: false })
      : new THREE.MeshLambertMaterial({ color: look.scarf, side: THREE.DoubleSide });
    this.scarfGeo.setAttribute('position', new THREE.Float32BufferAttribute(new Float32Array(SCARF_SEG * 2 * 3), 3));
    this.scarfGeo.setAttribute('normal', new THREE.Float32BufferAttribute(new Float32Array(SCARF_SEG * 2 * 3), 3));
    const idx: number[] = [];
    for (let i = 0; i < SCARF_SEG - 1; i++) {
      const a = i * 2;
      idx.push(a, a + 1, a + 2, a + 1, a + 3, a + 2);
    }
    this.scarfGeo.setIndex(idx);
    this.scarfMesh = new THREE.Mesh(this.scarfGeo, this.scarfMat);
    this.scarfMesh.frustumCulled = false;
    this.scarfMesh.castShadow = !ghost;
    for (let i = 0; i < SCARF_SEG; i++) {
      this.scarfPts.push(new THREE.Vector3());
      this.scarfPrev.push(new THREE.Vector3());
    }
  }

  /** The scarf lives in world space; add it to the scene separately. */
  get scarf(): THREE.Mesh {
    return this.scarfMesh;
  }

  setLook(look: Look): void {
    this.look = look;
    if (this.ghost) return;
    const [jacket, pants, shoes, gloves, hood, skin] = this.mats;
    jacket.color.setHex(look.jacket);
    pants.color.setHex(look.pants);
    shoes.color.setHex(look.shoes);
    gloves.color.setHex(look.gloves);
    hood.color.setHex(look.hood);
    skin.color.setHex(look.skin);
    this.scarfMat.color.setHex(look.scarf);
  }

  setOpacity(o: number): void {
    for (const m of this.mats) {
      m.transparent = o < 1 || this.ghost;
      if (!this.ghost) m.opacity = o;
    }
  }

  private set(name: string, x: number, y = 0, z = 0): void {
    const jj = this.j[name];
    jj.tx = x;
    jj.ty = y;
    jj.tz = z;
  }

  update(p: PoseInput): void {
    const dt = Math.min(0.05, p.dt);
    const hs = Math.hypot(p.vel.x, p.vel.z);
    const u = p.animU;
    let rate = 16;
    let rootRoll = 0;
    let rootPitch = 0;
    let drop = 0;
    let lean = 0;
    // defaults: relaxed standing
    for (const k of Object.keys(this.j)) this.set(k, 0, 0, 0);
    this.set('hips', 0);
    this.set('shL', 0.05, 0, 0.12);
    this.set('shR', 0.05, 0, -0.12);
    this.set('elL', -0.15);
    this.set('elR', -0.15);

    const cycle = (speed: number, stride: number) => {
      this.phase += (speed * dt * Math.PI * 2) / stride;
      return this.phase;
    };

    switch (p.mode) {
      case Mode.Ground: {
        if (p.crouch) {
          drop = 0.42;
          const ph = cycle(hs, 1.0);
          const a = hs > 0.3 ? 0.35 : 0;
          this.set('hpL', 1.2 + Math.sin(ph) * a);
          this.set('hpR', 1.2 - Math.sin(ph) * a);
          this.set('knL', -2.0);
          this.set('knR', -2.0);
          this.set('torso', 0.5);
          this.set('shL', 0.6, 0, 0.2);
          this.set('shR', 0.6, 0, -0.2);
          this.set('elL', -0.8);
          this.set('elR', -0.8);
        } else if (hs > 0.25) {
          const sprint = hs > 7;
          const stride = 1.15 + hs * 0.13;
          const ph = cycle(hs, stride);
          const amp = Math.min(1.05, 0.35 + hs * 0.09);
          const s = Math.sin(ph);
          const c = Math.cos(ph);
          this.set('hpL', s * amp);
          this.set('hpR', -s * amp);
          this.set('knL', -Math.max(0, -c) * amp * 1.7 - 0.15);
          this.set('knR', -Math.max(0, c) * amp * 1.7 - 0.15);
          this.set('shL', -s * amp * 0.9, 0, 0.1);
          this.set('shR', s * amp * 0.9, 0, -0.1);
          this.set('elL', -0.5 - (sprint ? 0.6 : 0.3));
          this.set('elR', -0.5 - (sprint ? 0.6 : 0.3));
          lean = Math.min(0.42, hs * 0.045);
          this.bob = Math.abs(Math.sin(ph)) * 0.05 * amp;
          rate = 22;
        } else {
          const t = performance.now() / 1000;
          this.set('torso', Math.sin(t * 1.6) * 0.02);
          this.set('neck', Math.sin(t * 0.7) * 0.05, Math.sin(t * 0.4) * 0.15);
          this.bob = 0;
        }
        break;
      }
      case Mode.Air: {
        if (p.majorFall) {
          // Skydiver: open body, looking down at the world.
          rootPitch = 1.15;
          this.set('shL', -1.9, 0, 0.9);
          this.set('shR', -1.9, 0, -0.9);
          this.set('elL', -0.3);
          this.set('elR', -0.3);
          this.set('hpL', 0.25, 0, 0.25);
          this.set('hpR', 0.25, 0, -0.25);
          this.set('knL', -0.6);
          this.set('knR', -0.6);
          this.set('neck', -0.6);
          rate = 6;
        } else {
          const rising = p.vel.y > 0;
          const tuck = rising ? 0.9 : 0.35;
          this.set('hpL', tuck + 0.2);
          this.set('hpR', tuck * 0.4 - 0.15);
          this.set('knL', -tuck * 1.6);
          this.set('knR', -0.5);
          this.set('shL', rising ? -0.5 : -1.3, 0, 0.45);
          this.set('shR', rising ? 0.6 : -1.3, 0, -0.45);
          this.set('elL', -0.6);
          this.set('elR', -0.6);
          lean = Math.min(0.3, hs * 0.03);
          rate = 12;
        }
        break;
      }
      case Mode.Slide:
        drop = 0.5;
        rootPitch = -0.35;
        this.set('hpL', 1.35);
        this.set('knL', -0.15);
        this.set('hpR', 0.5);
        this.set('knR', -1.9);
        this.set('torso', -0.2);
        this.set('shL', -0.9, 0, 0.3);
        this.set('shR', 0.7, 0, -0.5);
        this.set('elL', -0.4);
        rate = 20;
        break;
      case Mode.Hang: {
        const t = performance.now() / 1000;
        this.set('shL', -2.95, 0, 0.12);
        this.set('shR', -2.95, 0, -0.12);
        this.set('elL', -0.2);
        this.set('elR', -0.2);
        this.set('hpL', 0.15 + Math.sin(t * 2) * 0.08);
        this.set('hpR', 0.05 - Math.sin(t * 2) * 0.08);
        this.set('knL', -0.3);
        this.set('knR', -0.5);
        this.set('neck', -0.35);
        break;
      }
      case Mode.Mantle: {
        const k = u;
        this.set('shL', -2.9 + k * 2.7, 0, 0.2);
        this.set('shR', -2.9 + k * 2.7, 0, -0.2);
        this.set('elL', -0.3 - Math.sin(k * Math.PI) * 1.2);
        this.set('elR', -0.3 - Math.sin(k * Math.PI) * 1.2);
        this.set('hpL', Math.sin(k * Math.PI) * 1.6);
        this.set('knL', -Math.sin(k * Math.PI) * 2.0);
        this.set('hpR', Math.sin(Math.min(1, k * 1.3) * Math.PI) * 0.6);
        this.set('knR', -Math.sin(k * Math.PI) * 0.9);
        this.set('torso', 0.2 + Math.sin(k * Math.PI) * 0.6);
        rate = 30;
        break;
      }
      case Mode.Vault:
        this.set('torso', 0.45);
        this.set('shL', -0.9, 0, 0.1);
        this.set('shR', -1.3, 0, -0.2);
        this.set('hpL', 1.1, 0, 0.6);
        this.set('hpR', 0.9, 0, 0.6);
        this.set('knL', -1.4);
        this.set('knR', -1.0);
        rootRoll = -0.25;
        rate = 30;
        break;
      case Mode.WallRun: {
        const ph = cycle(Math.max(hs, 6), 1.9);
        const s = Math.sin(ph);
        const c = Math.cos(ph);
        this.set('hpL', s * 1.0);
        this.set('hpR', -s * 1.0);
        this.set('knL', -Math.max(0, -c) * 1.7 - 0.2);
        this.set('knR', -Math.max(0, c) * 1.7 - 0.2);
        this.set('shL', -s * 0.8, 0, p.wallSide > 0 ? 0.2 : 1.2);
        this.set('shR', s * 0.8, 0, p.wallSide > 0 ? -1.2 : -0.2);
        this.set('elL', -0.9);
        this.set('elR', -0.9);
        rootRoll = 0.38 * p.wallSide;
        lean = 0.25;
        rate = 24;
        break;
      }
      case Mode.WallClimb: {
        const ph = cycle(7, 1.4);
        const s = Math.sin(ph);
        this.set('hpL', 0.9 + s * 0.6);
        this.set('hpR', 0.9 - s * 0.6);
        this.set('knL', -1.2 - s * 0.4);
        this.set('knR', -1.2 + s * 0.4);
        this.set('shL', -2.6 + s * 0.5, 0, 0.2);
        this.set('shR', -2.6 - s * 0.5, 0, -0.2);
        this.set('torso', -0.15);
        rate = 24;
        break;
      }
      case Mode.Roll:
        drop = 0.45;
        rootPitch = u * Math.PI * 2;
        this.set('hpL', 1.9);
        this.set('hpR', 1.9);
        this.set('knL', -2.3);
        this.set('knR', -2.3);
        this.set('torso', 0.9);
        this.set('shL', -0.6, 0, 0.3);
        this.set('shR', -0.6, 0, -0.3);
        this.set('neck', 0.5);
        rate = 40;
        break;
      case Mode.Stagger:
        drop = 0.35;
        this.set('hpL', 1.1);
        this.set('hpR', 0.6);
        this.set('knL', -1.8);
        this.set('knR', -1.2);
        this.set('torso', 0.75);
        this.set('shL', -0.7, 0, 0.3);
        this.set('shR', -0.4, 0, -0.3);
        this.set('elL', -0.6);
        this.set('elR', -0.6);
        rate = 20;
        break;
      case Mode.Line: {
        const ph = cycle(hs + 2.8 * (hs > 0.1 ? 1 : 0), 1.2);
        const s = Math.sin(ph);
        this.set('shL', -3.0 + s * 0.2, 0, 0.1);
        this.set('shR', -3.0 - s * 0.2, 0, -0.1);
        this.set('hpL', 0.3 + s * 0.25);
        this.set('hpR', 0.3 - s * 0.25);
        this.set('knL', -0.5);
        this.set('knR', -0.5);
        break;
      }
      case Mode.Zip:
        this.set('shL', -2.9, 0, 0.12);
        this.set('shR', -2.9, 0, -0.12);
        this.set('hpL', 0.9);
        this.set('hpR', 0.8);
        this.set('knL', -0.4);
        this.set('knR', -0.6);
        lean = -0.25;
        break;
      case Mode.Swing: {
        this.set('shL', -3.05, 0, 0.1);
        this.set('shR', -3.05, 0, -0.1);
        const fwd = p.vel.x * p.fx + p.vel.z * p.fz;
        this.set('hpL', 0.3 + Math.max(-0.4, Math.min(0.8, fwd * 0.12)));
        this.set('hpR', 0.2 + Math.max(-0.4, Math.min(0.8, fwd * 0.12)));
        this.set('knL', -0.6);
        this.set('knR', -0.3);
        break;
      }
      case Mode.Ladder: {
        const ph = cycle(Math.abs(p.vel.y) * 1.8, 1.0);
        const s = Math.sin(ph);
        this.set('shL', -2.4 + s * 0.4, 0, 0.1);
        this.set('shR', -2.4 - s * 0.4, 0, -0.1);
        this.set('elL', -0.9);
        this.set('elR', -0.9);
        this.set('hpL', 0.8 + s * 0.4);
        this.set('hpR', 0.8 - s * 0.4);
        this.set('knL', -1.3);
        this.set('knR', -1.3);
        break;
      }
    }

    // Smoothly approach targets.
    const k = 1 - Math.exp(-rate * dt);
    for (const name in this.j) {
      const jj = this.j[name];
      jj.x += (jj.tx - jj.x) * k;
      jj.y += (jj.ty - jj.y) * k;
      jj.z += (jj.tz - jj.z) * k;
      jj.g.rotation.set(-jj.x, jj.y, jj.z, 'YXZ');
    }
    const kr = 1 - Math.exp(-(p.mode === Mode.Roll ? 60 : 14) * dt);
    this.lean += (lean - this.lean) * kr;
    this.rootRoll += (rootRoll - this.rootRoll) * kr;
    if (p.mode === Mode.Roll) this.rootPitch = rootPitch;
    else this.rootPitch += (rootPitch - this.rootPitch) * kr;
    this.rootDrop += (drop - this.rootDrop) * kr;

    // Root transform: gravity frame, then facing.
    this.qFrame.setFromUnitVectors(new THREE.Vector3(0, 1, 0), p.up);
    this.root.position.copy(p.pos);
    this.root.quaternion.copy(this.qFrame);
    const yaw = Math.atan2(-p.fx, -p.fz);
    this.body.rotation.set(0, 0, 0);
    this.body.rotateY(yaw);
    if (p.mode === Mode.Swing && p.pivot) {
      // Hang along the rope: align body up with the rope direction.
      const dir = p.pivot.clone().sub(p.pos.clone().add(p.up.clone().multiplyScalar(1.0))).normalize();
      const q = new THREE.Quaternion().setFromUnitVectors(p.up, dir);
      this.root.quaternion.premultiply(q);
      this.root.position.copy(p.pos).add(p.up.clone().multiplyScalar(1.0)).sub(dir.clone().multiplyScalar(1.0));
    }
    // Roll pivots around the body centre.
    this.body.position.set(0, -this.rootDrop + this.bob, 0);
    this.body.rotateX(-this.lean - this.rootPitch);
    this.body.rotateZ(this.rootRoll);
    if (Math.abs(this.rootPitch) > 0.01 && p.mode === Mode.Roll) {
      this.body.position.y += 0.5 * (1 - Math.cos(this.rootPitch)) * 0.4;
    }

    this.updateScarf(p, dt);
  }

  private updateScarf(p: PoseInput, dt: number): void {
    this.root.updateMatrixWorld(true);
    this.j.neck.g.getWorldPosition(this.neckWorld);
    // anchor a little behind the neck
    const back = new THREE.Vector3(0, 0.02, 0.1).applyQuaternion(this.j.neck.g.getWorldQuaternion(new THREE.Quaternion()));
    const anchor = this.neckWorld.clone().add(back);
    const seg = (this.look.scarfLength / 10) * 0.13;
    if (!this.scarfInit) {
      for (let i = 0; i < SCARF_SEG; i++) {
        this.scarfPts[i].copy(anchor).addScaledVector(p.up, -i * seg);
        this.scarfPrev[i].copy(this.scarfPts[i]);
      }
      this.scarfInit = true;
    }
    const g = p.up.clone().multiplyScalar(-9.8 * dt * dt);
    const wind = p.wind.clone().multiplyScalar(dt * dt);
    const drag = 0.9;
    this.scarfPts[0].copy(anchor);
    for (let i = 1; i < SCARF_SEG; i++) {
      const pt = this.scarfPts[i];
      const pv = this.scarfPrev[i];
      const vx = (pt.x - pv.x) * drag;
      const vy = (pt.y - pv.y) * drag;
      const vz = (pt.z - pv.z) * drag;
      pv.copy(pt);
      pt.x += vx + g.x + wind.x;
      pt.y += vy + g.y + wind.y;
      pt.z += vz + g.z + wind.z;
    }
    for (let it = 0; it < 4; it++) {
      this.scarfPts[0].copy(anchor);
      for (let i = 1; i < SCARF_SEG; i++) {
        const a = this.scarfPts[i - 1];
        const b = this.scarfPts[i];
        const d = b.clone().sub(a);
        const l = d.length() || 1e-6;
        const diff = (l - seg) / l;
        if (i === 1) b.addScaledVector(d, -diff);
        else {
          a.addScaledVector(d, diff * 0.5);
          b.addScaledVector(d, -diff * 0.5);
        }
      }
    }
    // teleport guard
    if (this.scarfPts[SCARF_SEG - 1].distanceTo(anchor) > seg * SCARF_SEG * 3) this.scarfInit = false;
    const pos = this.scarfGeo.getAttribute('position') as THREE.BufferAttribute;
    const nor = this.scarfGeo.getAttribute('normal') as THREE.BufferAttribute;
    const side = new THREE.Vector3(p.fz, 0, -p.fx).applyQuaternion(this.qFrame).normalize();
    for (let i = 0; i < SCARF_SEG; i++) {
      const w = 0.075 * (1 - (i / SCARF_SEG) * 0.3);
      const pt = this.scarfPts[i];
      pos.setXYZ(i * 2, pt.x + side.x * w, pt.y + side.y * w, pt.z + side.z * w);
      pos.setXYZ(i * 2 + 1, pt.x - side.x * w, pt.y - side.y * w, pt.z - side.z * w);
      const n = new THREE.Vector3().crossVectors(side, i > 0 ? pt.clone().sub(this.scarfPts[i - 1]) : p.up).normalize();
      nor.setXYZ(i * 2, n.x, n.y, n.z);
      nor.setXYZ(i * 2 + 1, n.x, n.y, n.z);
    }
    pos.needsUpdate = true;
    nor.needsUpdate = true;
  }

  handWorld(side: 'L' | 'R', out: THREE.Vector3): THREE.Vector3 {
    const el = this.j['el' + side].g;
    return out.set(0, -0.32, 0).applyMatrix4(el.matrixWorld);
  }

  dispose(): void {
    this.root.traverse((o) => {
      const m = o as THREE.Mesh;
      if (m.isMesh) m.geometry.dispose();
    });
    for (const m of this.mats) m.dispose();
    this.scarfGeo.dispose();
    this.scarfMat.dispose();
  }
}
