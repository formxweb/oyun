import * as THREE from 'three';
import { FRAMES } from '../../core/collision';
import { raycastSolids } from '../../core/collision';
import type { World, WorldState } from '../../core/world/world';

export interface CameraSettings {
  fov: number;
  sensitivity: number;
  invertY: boolean;
  reducedMotion: boolean;
  cameraShake: boolean;
  autoCenter: boolean;
  distance: number;
}

export interface CameraTarget {
  pos: THREE.Vector3;
  vel: THREE.Vector3;
  frame: number;
  crouch: boolean;
  majorFall: boolean;
  fallTime: number;
  speed: number;
  moving: boolean;
  moveYaw: number;
}

const tmp = new THREE.Vector3();

function frameQuat(f: number): THREE.Quaternion {
  const m = FRAMES[f];
  // rows are local axes in world space -> the matrix whose columns are those axes maps local to world
  const mat = new THREE.Matrix4().set(m[0], m[3], m[6], 0, m[1], m[4], m[7], 0, m[2], m[5], m[8], 0, 0, 0, 0, 1);
  return new THREE.Quaternion().setFromRotationMatrix(mat);
}
const FRAME_Q = FRAMES.map((_, i) => frameQuat(i));

/**
 * Third-person camera: orbit around the climber with collision, speed FOV, landing dips,
 * gravity-frame rotation and the Fall Camera, which pulls out so the world is visible
 * while you fall.
 */
export class CameraRig {
  readonly camera: THREE.PerspectiveCamera;
  yaw = 0;
  pitch = -0.18;
  private dist = 4.4;
  private pivot = new THREE.Vector3();
  private pivotInit = false;
  private q = new THREE.Quaternion();
  private fall = 0;
  private dip = 0;
  private dipV = 0;
  private shake = 0;
  private idleLook = 0;
  private orbit = 0;
  private readonly ids: number[] = [];
  focus: THREE.Vector3 | null = null;
  private focusT = 0;
  /** Yaw the player actually sees (includes the fall-camera orbit); used for movement input. */
  viewYaw = 0;

  constructor(aspect: number) {
    this.camera = new THREE.PerspectiveCamera(70, aspect, 0.08, 6000);
  }

  get localUp(): THREE.Vector3 {
    return new THREE.Vector3(0, 1, 0).applyQuaternion(this.q);
  }

  look(dx: number, dy: number, s: CameraSettings): void {
    this.yaw -= dx * s.sensitivity;
    this.pitch -= dy * s.sensitivity * (s.invertY ? -1 : 1);
    this.pitch = Math.max(-1.45, Math.min(1.2, this.pitch));
    if (Math.abs(dx) + Math.abs(dy) > 0.0005) this.idleLook = 0;
  }

  /** Shake impulse (landing, lightning). Ignored when disabled. */
  impulse(strength: number, s: CameraSettings): void {
    if (s.cameraShake && !s.reducedMotion) this.shake = Math.max(this.shake, strength);
  }

  landDip(amount: number, s: CameraSettings): void {
    if (s.reducedMotion) amount *= 0.3;
    this.dipV -= amount * 6;
  }

  setFocus(p: THREE.Vector3, seconds: number): void {
    this.focus = p.clone();
    this.focusT = seconds;
  }

  snapBehind(yaw: number): void {
    this.yaw = yaw;
    this.pitch = -0.18;
  }

  update(t: CameraTarget, dt: number, s: CameraSettings, world: World, st: WorldState, tick: number): void {
    dt = Math.min(dt, 0.05);
    this.q.slerp(FRAME_Q[t.frame], 1 - Math.exp(-7 * dt));
    const up = this.localUp;
    const headH = t.crouch ? 1.05 : 1.55;
    const target = tmp.copy(t.pos).addScaledVector(up, headH);
    if (!this.pivotInit || this.pivot.distanceTo(target) > 25) {
      this.pivot.copy(target);
      this.pivotInit = true;
    }
    const follow = t.majorFall ? 9 : 18;
    this.pivot.lerp(target, 1 - Math.exp(-follow * dt));

    // Fall camera blend
    this.fall += ((t.majorFall ? 1 : 0) - this.fall) * (1 - Math.exp(-(t.majorFall ? 2.2 : 3.5) * dt));
    this.idleLook += dt;
    if (s.autoCenter && t.moving && this.idleLook > 1.2 && this.fall < 0.1) {
      let d = t.moveYaw - this.yaw;
      d = Math.atan2(Math.sin(d), Math.cos(d));
      this.yaw += d * (1 - Math.exp(-1.2 * dt)) * Math.min(1, t.speed / 6);
    }
    if (t.majorFall) this.orbit += dt * (s.reducedMotion ? 0.03 : 0.12);
    else if (this.orbit !== 0) {
      // Fold the fall orbit into the player's yaw so nothing snaps back after landing.
      this.yaw += this.orbit * this.fall;
      this.orbit = 0;
    }
    const baseDist = s.distance;
    const fallDist = Math.min(18, 10 + t.fallTime * 2.2);
    let dist = baseDist + (fallDist - baseDist) * this.fall;
    const pitch = this.pitch + (Math.min(this.pitch, -0.55) - this.pitch) * this.fall * 0.85;
    const yaw = this.yaw + this.orbit * this.fall;
    this.viewYaw = yaw;

    // Orbit offset in the local frame.
    const cp = Math.cos(pitch);
    const off = new THREE.Vector3(Math.sin(yaw) * cp, -Math.sin(pitch), Math.cos(yaw) * cp);
    const shoulder = new THREE.Vector3(Math.cos(yaw), 0, -Math.sin(yaw)).multiplyScalar(0.32 * (1 - this.fall));
    off.applyQuaternion(this.q);
    shoulder.applyQuaternion(this.q);
    const pivot = this.pivot.clone().add(shoulder);

    // Collision
    const desired = pivot.clone().addScaledVector(off, dist);
    const hit = raycastSolids(world, st, tick, pivot.x, pivot.y, pivot.z, desired.x, desired.y, desired.z, this.ids, 0.22);
    if (hit < 1) dist = Math.max(0.55, dist * hit - 0.15);
    this.dist += (dist - this.dist) * (dist < this.dist ? 1 : 1 - Math.exp(-4 * dt));
    const camPos = pivot.clone().addScaledVector(off, this.dist);

    // Landing dip (spring)
    this.dipV += (-this.dip * 90 - this.dipV * 14) * dt;
    this.dip += this.dipV * dt;
    camPos.addScaledVector(up, this.dip);
    if (this.shake > 0.001) {
      const k = this.shake;
      camPos.x += (Math.random() - 0.5) * k * 0.2;
      camPos.y += (Math.random() - 0.5) * k * 0.2;
      camPos.z += (Math.random() - 0.5) * k * 0.2;
      this.shake *= Math.exp(-8 * dt);
    }
    this.camera.position.copy(camPos);
    this.camera.up.copy(up);
    let lookAt = this.pivot.clone().addScaledVector(up, this.dip * 0.5);
    if (this.fall > 0.01) lookAt.addScaledVector(up, -3 * this.fall);
    if (this.focus && this.focusT > 0) {
      this.focusT -= dt;
      const k = Math.min(1, this.focusT) * 0.6;
      lookAt = lookAt.lerp(this.focus, k);
    }
    this.camera.lookAt(lookAt);

    // FOV
    const kick = s.reducedMotion ? 0 : Math.max(0, Math.min(10, (t.speed - 6) * 1.6)) + this.fall * 8;
    const fov = s.fov + kick;
    this.camera.fov += (fov - this.camera.fov) * (1 - Math.exp(-5 * dt));
    this.camera.updateProjectionMatrix();
  }
}
