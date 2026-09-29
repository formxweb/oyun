import * as THREE from 'three';

/**
 * Pooled CPU particles rendered as a single Points draw call, plus pooled ring meshes.
 * Budget scales with the quality preset.
 */
export class Particles {
  readonly points: THREE.Points;
  private readonly max: number;
  private readonly pos: Float32Array;
  private readonly col: Float32Array;
  private readonly size: Float32Array;
  private readonly alpha: Float32Array;
  private readonly vel: Float32Array;
  private readonly life: Float32Array;
  private readonly maxLife: Float32Array;
  private readonly grav: Float32Array;
  private readonly drag: Float32Array;
  private readonly baseSize: Float32Array;
  private next = 0;
  budget = 1;

  constructor(max = 2400) {
    this.max = max;
    this.pos = new Float32Array(max * 3);
    this.col = new Float32Array(max * 3);
    this.size = new Float32Array(max);
    this.alpha = new Float32Array(max);
    this.vel = new Float32Array(max * 3);
    this.life = new Float32Array(max);
    this.maxLife = new Float32Array(max);
    this.grav = new Float32Array(max);
    this.drag = new Float32Array(max);
    this.baseSize = new Float32Array(max);
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.BufferAttribute(this.pos, 3));
    g.setAttribute('color', new THREE.BufferAttribute(this.col, 3));
    g.setAttribute('aSize', new THREE.BufferAttribute(this.size, 1));
    g.setAttribute('aAlpha', new THREE.BufferAttribute(this.alpha, 1));
    const mat = new THREE.ShaderMaterial({
      uniforms: { uScale: { value: 600 } },
      vertexShader: /* glsl */ `
        attribute float aSize; attribute float aAlpha; attribute vec3 color;
        varying vec3 vCol; varying float vA; uniform float uScale;
        void main(){ vCol = color; vA = aAlpha; vec4 mv = modelViewMatrix*vec4(position,1.0);
          gl_PointSize = aSize * uScale / max(0.1, -mv.z); gl_Position = projectionMatrix*mv; }`,
      fragmentShader: /* glsl */ `
        varying vec3 vCol; varying float vA;
        void main(){ vec2 d = gl_PointCoord-0.5; float r = dot(d,d); if (r>0.25) discard; gl_FragColor = vec4(vCol, vA*(1.0-r*4.0)); }`,
      transparent: true,
      depthWrite: false,
    });
    this.points = new THREE.Points(g, mat);
    this.points.frustumCulled = false;
    this.points.renderOrder = 8;
  }

  setViewportScale(h: number): void {
    (this.points.material as THREE.ShaderMaterial).uniforms.uScale.value = h * 0.9;
  }

  emit(x: number, y: number, z: number, vx: number, vy: number, vz: number, color: number, size: number, life: number, gravity = 0, drag = 0.5): void {
    const i = this.next;
    this.next = (this.next + 1) % this.max;
    this.pos[i * 3] = x;
    this.pos[i * 3 + 1] = y;
    this.pos[i * 3 + 2] = z;
    this.vel[i * 3] = vx;
    this.vel[i * 3 + 1] = vy;
    this.vel[i * 3 + 2] = vz;
    this.col[i * 3] = ((color >> 16) & 255) / 255;
    this.col[i * 3 + 1] = ((color >> 8) & 255) / 255;
    this.col[i * 3 + 2] = (color & 255) / 255;
    this.baseSize[i] = size;
    this.size[i] = size;
    this.life[i] = life;
    this.maxLife[i] = life;
    this.grav[i] = gravity;
    this.drag[i] = drag;
    this.alpha[i] = 1;
  }

  burst(p: THREE.Vector3, n: number, speed: number, color: number, size: number, life: number, gravity = 4, up = 0.5): void {
    const count = Math.max(1, Math.round(n * this.budget));
    for (let k = 0; k < count; k++) {
      const a = Math.random() * Math.PI * 2;
      const s = speed * (0.4 + Math.random() * 0.6);
      this.emit(p.x, p.y, p.z, Math.cos(a) * s, (Math.random() * 0.6 + up) * s, Math.sin(a) * s, color, size * (0.6 + Math.random() * 0.8), life * (0.6 + Math.random() * 0.6), gravity, 2);
    }
  }

  ring(p: THREE.Vector3, n: number, speed: number, color: number, size: number, life: number): void {
    const count = Math.max(4, Math.round(n * this.budget));
    for (let k = 0; k < count; k++) {
      const a = (k / count) * Math.PI * 2 + Math.random() * 0.2;
      this.emit(p.x, p.y + 0.05, p.z, Math.cos(a) * speed, 0.3 + Math.random() * 0.4, Math.sin(a) * speed, color, size * (0.7 + Math.random() * 0.6), life, 0.5, 3.5);
    }
  }

  update(dt: number): void {
    for (let i = 0; i < this.max; i++) {
      if (this.life[i] <= 0) {
        if (this.alpha[i] !== 0) {
          this.alpha[i] = 0;
          this.size[i] = 0;
        }
        continue;
      }
      this.life[i] -= dt;
      const d = Math.exp(-this.drag[i] * dt);
      this.vel[i * 3] *= d;
      this.vel[i * 3 + 1] = this.vel[i * 3 + 1] * d - this.grav[i] * dt;
      this.vel[i * 3 + 2] *= d;
      this.pos[i * 3] += this.vel[i * 3] * dt;
      this.pos[i * 3 + 1] += this.vel[i * 3 + 1] * dt;
      this.pos[i * 3 + 2] += this.vel[i * 3 + 2] * dt;
      const t = Math.max(0, this.life[i] / this.maxLife[i]);
      this.alpha[i] = Math.min(1, t * 2.5) * 0.9;
      this.size[i] = this.baseSize[i] * (0.6 + 0.4 * t);
    }
    const g = this.points.geometry;
    (g.getAttribute('position') as THREE.BufferAttribute).needsUpdate = true;
    (g.getAttribute('color') as THREE.BufferAttribute).needsUpdate = true;
    (g.getAttribute('aSize') as THREE.BufferAttribute).needsUpdate = true;
    (g.getAttribute('aAlpha') as THREE.BufferAttribute).needsUpdate = true;
  }
}

/**
 * Weather volume that follows the camera: rain streaks, dust, void motes, petals.
 * Kinds match Atmosphere.weather.
 */
export class Weather {
  readonly mesh: THREE.LineSegments;
  private readonly count: number;
  private readonly pos: Float32Array;
  private readonly seeds: Float32Array;
  private kind = 0;
  intensity = 0;
  private readonly mat: THREE.LineBasicMaterial;

  constructor(count = 1400) {
    this.count = count;
    this.pos = new Float32Array(count * 6);
    this.seeds = new Float32Array(count * 3);
    for (let i = 0; i < count * 3; i++) this.seeds[i] = Math.random();
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.BufferAttribute(this.pos, 3));
    this.mat = new THREE.LineBasicMaterial({ color: 0xaabbcc, transparent: true, opacity: 0.5, depthWrite: false });
    this.mesh = new THREE.LineSegments(g, this.mat);
    this.mesh.frustumCulled = false;
    this.mesh.renderOrder = 9;
  }

  update(kind: number, intensity: number, cam: THREE.Vector3, wind: THREE.Vector3, time: number, budget: number): void {
    this.kind = kind;
    this.intensity += (intensity - this.intensity) * 0.05;
    const n = Math.floor(this.count * Math.min(1, budget) * this.intensity);
    this.mesh.visible = n > 10 && kind > 0;
    if (!this.mesh.visible) return;
    const box = kind === 2 || kind === 3 ? 26 : 40;
    const color = kind === 2 || kind === 3 ? 0x9fb0c8 : kind === 4 ? 0xcfe0ff : kind === 5 ? 0xffc8d8 : 0xe8dcc0;
    this.mat.color.setHex(color);
    this.mat.opacity = kind === 3 ? 0.55 : kind === 2 ? 0.4 : 0.55;
    for (let i = 0; i < this.count; i++) {
      const o = i * 6;
      if (i >= n) {
        this.pos[o] = this.pos[o + 3] = cam.x;
        this.pos[o + 1] = this.pos[o + 4] = cam.y - 1000;
        this.pos[o + 2] = this.pos[o + 5] = cam.z;
        continue;
      }
      const sx = this.seeds[i * 3];
      const sy = this.seeds[i * 3 + 1];
      const sz = this.seeds[i * 3 + 2];
      let x: number;
      let y: number;
      let z: number;
      let dx = 0;
      let dy = 0;
      let dz = 0;
      if (kind === 2 || kind === 3) {
        const fall = kind === 3 ? 34 : 22;
        const t = time * fall + sy * box * 7;
        x = cam.x + (((sx * box + wind.x * time * 0.6) % box) + box) % box - box / 2;
        z = cam.z + (((sz * box + wind.z * time * 0.6) % box) + box) % box - box / 2;
        y = cam.y + box / 2 - (t % box);
        const k = kind === 3 ? 0.07 : 0.045;
        dx = -wind.x * k * 0.5;
        dy = fall * k;
        dz = -wind.z * k * 0.5;
      } else {
        const t = time * (kind === 4 ? 0.35 : 0.6);
        x = cam.x + ((((sx * box + Math.sin(t + sy * 20) * 2 + wind.x * t) % box) + box) % box) - box / 2;
        y = cam.y + ((((sy * box + (kind === 5 ? -t * 1.5 : Math.sin(t * 0.7 + sz * 9) * 1.5)) % box) + box) % box) - box / 2;
        z = cam.z + ((((sz * box + Math.cos(t + sx * 20) * 2 + wind.z * t) % box) + box) % box) - box / 2;
        const l = kind === 5 ? 0.06 : 0.035;
        dx = l;
        dy = l * 0.5;
        dz = l * 0.3;
      }
      this.pos[o] = x;
      this.pos[o + 1] = y;
      this.pos[o + 2] = z;
      this.pos[o + 3] = x + dx;
      this.pos[o + 4] = y + dy;
      this.pos[o + 5] = z + dz;
    }
    (this.mesh.geometry.getAttribute('position') as THREE.BufferAttribute).needsUpdate = true;
  }

  get currentKind(): number {
    return this.kind;
  }
}

/** Expanding shockwave rings for heavy landings and discoveries. */
export class Rings {
  readonly group = new THREE.Group();
  private readonly pool: { mesh: THREE.Mesh; t: number; dur: number; max: number }[] = [];

  constructor(n = 12) {
    const geo = new THREE.RingGeometry(0.85, 1, 48);
    geo.rotateX(-Math.PI / 2);
    for (let i = 0; i < n; i++) {
      const mat = new THREE.MeshBasicMaterial({ color: 0xffffff, transparent: true, opacity: 0, depthWrite: false, side: THREE.DoubleSide });
      const mesh = new THREE.Mesh(geo, mat);
      mesh.visible = false;
      mesh.renderOrder = 7;
      this.group.add(mesh);
      this.pool.push({ mesh, t: 0, dur: 1, max: 1 });
    }
  }

  spawn(p: THREE.Vector3, up: THREE.Vector3, color: number, size: number, dur: number): void {
    const r = this.pool.find((x) => !x.mesh.visible) ?? this.pool[0];
    r.mesh.visible = true;
    r.mesh.position.copy(p).addScaledVector(up, 0.06);
    r.mesh.quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0), up);
    (r.mesh.material as THREE.MeshBasicMaterial).color.setHex(color);
    r.t = 0;
    r.dur = dur;
    r.max = size;
  }

  update(dt: number): void {
    for (const r of this.pool) {
      if (!r.mesh.visible) continue;
      r.t += dt;
      const k = r.t / r.dur;
      if (k >= 1) {
        r.mesh.visible = false;
        continue;
      }
      const s = 0.2 + (1 - Math.pow(1 - k, 3)) * r.max;
      r.mesh.scale.set(s, 1, s);
      (r.mesh.material as THREE.MeshBasicMaterial).opacity = (1 - k) * 0.55;
    }
  }
}
