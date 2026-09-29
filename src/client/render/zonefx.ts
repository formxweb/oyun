import * as THREE from 'three';
import type { Zone } from '../../core/world/types';
import type { World, WorldState } from '../../core/world/world';
import type { Particles } from './fx';

/**
 * Makes invisible forces visible: steam from vents (with a hiss-up before each burst), motes
 * rising in updrafts, streaks in wind, sparks gathering on a rod before a strike, and the bolt
 * itself. Everything is derived from the same zone timing the simulation uses, so what you see
 * is what will happen.
 */
export class ZoneFx {
  readonly group = new THREE.Group();
  private readonly acc = new Map<number, number>();
  private readonly bolts: { line: THREE.Line; t: number }[] = [];

  constructor(
    private readonly world: World,
    private readonly particles: Particles,
  ) {
    for (let i = 0; i < 4; i++) {
      const g = new THREE.BufferGeometry();
      g.setAttribute('position', new THREE.BufferAttribute(new Float32Array(3 * 14), 3));
      const line = new THREE.Line(g, new THREE.LineBasicMaterial({ color: 0xe8f0ff, transparent: true, opacity: 1 }));
      line.visible = false;
      line.frustumCulled = false;
      this.group.add(line);
      this.bolts.push({ line, t: 0 });
    }
  }

  /** @param t simulation time in seconds (tick / TICK_RATE) */
  update(dt: number, cam: THREE.Vector3, t: number, st: WorldState, budget: number): void {
    for (const b of this.bolts) {
      if (!b.line.visible) continue;
      b.t -= dt;
      (b.line.material as THREE.LineBasicMaterial).opacity = Math.max(0, b.t / 0.18);
      if (b.t <= 0) b.line.visible = false;
    }
    if (budget <= 0) return;
    for (const z of this.world.zones) {
      if (z.kind !== 'vent' && z.kind !== 'updraft' && z.kind !== 'wind' && z.kind !== 'lightning' && z.kind !== 'shift') continue;
      if (!this.world.isZoneActive(z, st)) continue;
      const d = distToBox(cam, z);
      if (d > (z.kind === 'wind' ? 20 : 90)) continue;
      const rate = this.rate(z, t) * budget * (d > 45 ? 0.4 : 1);
      if (rate <= 0) continue;
      let a = (this.acc.get(z.id) ?? 0) + rate * dt;
      let n = Math.floor(a);
      a -= n;
      this.acc.set(z.id, a);
      n = Math.min(n, 12);
      for (let i = 0; i < n; i++) this.emit(z, cam);
    }
  }

  private rate(z: Zone, t: number): number {
    const sx = z.max.x - z.min.x;
    const sz = z.max.z - z.min.z;
    switch (z.kind) {
      case 'vent': {
        if (z.period <= 0) return 45;
        const u = (((t + z.phase) % z.period) + z.period) % z.period;
        if (u < z.active) return 70;
        // a thin hiss in the last moments before the burst
        return z.period - u < 0.7 ? 18 : 3;
      }
      case 'updraft':
        return Math.min(40, sx * sz * 1.2);
      case 'wind':
        return 26;
      case 'lightning': {
        const u = (((t + z.phase) % z.period) + z.period) % z.period;
        const left = z.period - u;
        return left < 1.2 ? 10 + (1.2 - left) * 50 : 0;
      }
      case 'shift':
        return Math.min(14, (sx * sz) / 12);
      default:
        return 0;
    }
  }

  private emit(z: Zone, cam: THREE.Vector3): void {
    const r = Math.random;
    const x = z.min.x + (z.max.x - z.min.x) * r();
    const zz = z.min.z + (z.max.z - z.min.z) * r();
    switch (z.kind) {
      case 'vent': {
        const up = Math.min(12, z.strength) * (0.55 + r() * 0.45);
        this.particles.emit(x, z.min.y + 0.2, zz, (r() - 0.5) * 0.6, up, (r() - 0.5) * 0.6, 0xe8ecef, 0.28 + r() * 0.2, 0.9 + r() * 0.5, -2, 1.4);
        break;
      }
      case 'updraft': {
        const y = z.min.y + (z.max.y - z.min.y) * r() * 0.8;
        this.particles.emit(x, y, zz, (r() - 0.5) * 0.4, 7 + r() * 5, (r() - 0.5) * 0.4, 0xdfe8f0, 0.06, 1.2 + r() * 0.6, 0, 0.2);
        break;
      }
      case 'wind': {
        // streaks only near the camera (the wind is everywhere inside a large zone)
        const px = cam.x + (r() - 0.5) * 30;
        const py = cam.y + (r() - 0.3) * 10;
        const pz = cam.z + (r() - 0.5) * 30;
        if (px < z.min.x || px > z.max.x || py < z.min.y || py > z.max.y || pz < z.min.z || pz > z.max.z) return;
        const s = Math.max(4, z.strength * 2.2);
        this.particles.emit(px, py, pz, z.dir.x * s, z.dir.y * s, z.dir.z * s, 0xf4f6f8, 0.05, 0.7, 0, 0);
        break;
      }
      case 'lightning': {
        this.particles.emit(x, z.min.y + 0.6, zz, (r() - 0.5) * 1.2, 2 + r() * 3, (r() - 0.5) * 1.2, 0xbcd4ff, 0.08, 0.35, 0, 0.5);
        break;
      }
      case 'shift': {
        const y = z.min.y + (z.max.y - z.min.y) * r();
        this.particles.emit(x, y, zz, (r() - 0.5) * 0.3, (r() - 0.5) * 0.3, (r() - 0.5) * 0.3, 0x9ab8ff, 0.07, 2.2, 0, 0.1);
        break;
      }
    }
  }

  /** A strike: a jagged bolt from high above down onto the zone. */
  bolt(z: Zone): void {
    const b = this.bolts.find((x) => !x.line.visible) ?? this.bolts[0];
    const pos = b.line.geometry.getAttribute('position') as THREE.BufferAttribute;
    const cx = (z.min.x + z.max.x) / 2;
    const cz = (z.min.z + z.max.z) / 2;
    const y0 = z.min.y + 60;
    const y1 = z.min.y + 0.2;
    const n = pos.count;
    for (let i = 0; i < n; i++) {
      const k = i / (n - 1);
      const j = i === 0 || i === n - 1 ? 0 : (Math.random() - 0.5) * 2.2 * (1 - k * 0.6);
      pos.setXYZ(i, cx + j, y0 + (y1 - y0) * k, cz + (Math.random() - 0.5) * 2.2 * (1 - k * 0.6) * (j === 0 ? 0 : 1));
    }
    pos.needsUpdate = true;
    b.t = 0.18;
    b.line.visible = true;
    (b.line.material as THREE.LineBasicMaterial).opacity = 1;
  }

  dispose(): void {
    for (const b of this.bolts) {
      b.line.geometry.dispose();
      (b.line.material as THREE.Material).dispose();
    }
  }
}

function distToBox(p: THREE.Vector3, z: Zone): number {
  const dx = Math.max(z.min.x - p.x, 0, p.x - z.max.x);
  const dy = Math.max(z.min.y - p.y, 0, p.y - z.max.y);
  const dz = Math.max(z.min.z - p.z, 0, p.z - z.max.z);
  return Math.sqrt(dx * dx + dy * dy + dz * dz);
}
