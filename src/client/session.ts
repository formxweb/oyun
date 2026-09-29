import * as THREE from 'three';
import { toWorld } from '../core/collision';
import type { SimEvent } from '../core/events';
import { quantizeInput, type InputFrame } from '../core/input';
import { Mode } from '../core/player';
import { Simulation, type SimConfig } from '../core/sim';
import { DT, TICK_RATE, type World } from '../core/world/world';
import type { InputManager } from './input/input';
import type { CameraRig, CameraSettings } from './render/camera';
import type { PoseInput } from './render/character';
import type { RenderSystem } from './render/renderer';

export interface SessionHooks {
  /** Called for every simulation event, in order. */
  onEvent?: (e: SimEvent, s: Session) => void;
  /** Called after every simulation tick. */
  onTick?: (s: Session, input: InputFrame) => void;
  /** Called once per rendered frame after the camera update. */
  onFrame?: (s: Session, dt: number) => void;
}

const MAX_STEPS_PER_FRAME = 24;

/**
 * A running game: the fixed-timestep loop that drives one Simulation from player input and
 * presents it through the RenderSystem. Rendering interpolates between the last two ticks.
 */
export class Session {
  readonly sim: Simulation;
  private acc = 0;
  private readonly prev = new THREE.Vector3();
  private readonly cur = new THREE.Vector3();
  private readonly renderPos = new THREE.Vector3();
  private fallTime = 0;
  private lastInput: InputFrame = { mx: 0, mz: 0, yaw: 0, btn: 0 };
  paused = false;
  /** Presentation time scale (slow motion during the opening of a major fall). */
  timeScale = 1;
  slowMoEnabled = true;
  /** Recorded inputs for replay/ghosts. */
  readonly inputs: InputFrame[] = [];
  recording = true;
  frozen = false;
  private readonly hooks: SessionHooks;
  time = 0;

  constructor(
    readonly world: World,
    cfg: SimConfig,
    readonly rs: RenderSystem,
    readonly rig: CameraRig,
    readonly input: InputManager,
    readonly camSettings: () => CameraSettings,
    hooks: SessionHooks = {},
  ) {
    this.hooks = hooks;
    this.sim = new Simulation(world, cfg);
    const p = this.sim.player;
    this.prev.set(p.x, p.y, p.z);
    this.cur.copy(this.prev);
    this.rig.snapBehind(cfg.spawn.yaw);
  }

  get player() {
    return this.sim.player;
  }

  get fallSeconds(): number {
    return this.fallTime;
  }

  /** Advance by real time `dt` seconds and render. */
  frame(dt: number): void {
    const inp = this.input;
    const s = this.camSettings();
    inp.pollPad();
    const look = inp.lookDelta(dt);
    if (!this.paused) this.rig.look(look.dx, look.dy, s);

    const p = this.sim.player;
    // Slow motion at the start of a major fall: the moment the world opens up.
    let target = 1;
    if (p.majorFall && this.slowMoEnabled && this.fallTime < 1.6) target = 0.55;
    this.timeScale += (target - this.timeScale) * Math.min(1, dt * 6);

    if (!this.paused && !this.frozen) {
      this.acc += Math.min(dt, 0.1) * this.timeScale;
      let steps = 0;
      while (this.acc >= DT && steps < MAX_STEPS_PER_FRAME) {
        const raw = inp.sample();
        const frame = quantizeInput({ mx: raw.mx, mz: raw.mz, yaw: this.rig.viewYaw, btn: raw.btn });
        inp.consumeLatches();
        this.step(frame);
        this.acc -= DT;
        steps++;
      }
      if (steps === MAX_STEPS_PER_FRAME) this.acc = 0;
      if (p.majorFall) this.fallTime += dt * this.timeScale;
      else this.fallTime = 0;
    }
    this.time += dt;
    this.present(dt, s);
  }

  /** Run one simulation tick with a given input (also used by replays). */
  step(frame: InputFrame): void {
    const p = this.sim.player;
    this.prev.copy(this.cur);
    this.sim.step(frame);
    this.cur.set(p.x, p.y, p.z);
    if (this.recording) this.inputs.push(frame);
    this.lastInput = frame;
    for (const e of this.sim.events) {
      if (e.k === 'respawn' || e.k === 'shift') this.prev.copy(this.cur);
      this.hooks.onEvent?.(e, this);
    }
    this.hooks.onTick?.(this, frame);
  }

  private present(dt: number, s: CameraSettings): void {
    const p = this.sim.player;
    const alpha = this.paused ? 1 : Math.min(1, this.acc / DT);
    this.renderPos.copy(this.prev).lerp(this.cur, alpha);
    const [ux, uy, uz] = toWorld(p.frame, 0, 1, 0);
    const up = new THREE.Vector3(ux, uy, uz);
    const [fvx, fvy, fvz] = [p.vx, p.vy, p.vz];
    const vel = new THREE.Vector3(fvx, fvy, fvz);
    const hs = Math.hypot(p.vx, p.vz);
    const tickF = this.sim.tick - 1 + alpha;
    this.rig.update(
      {
        pos: this.renderPos,
        vel,
        frame: p.frame,
        crouch: p.crouch || p.mode === Mode.Slide || p.mode === Mode.Roll,
        majorFall: p.majorFall,
        fallTime: this.fallTime,
        speed: hs,
        moving: hs > 1,
        moveYaw: Math.atan2(-p.fx, -p.fz),
      },
      dt,
      s,
      this.world,
      this.sim.st,
      this.sim.tick,
    );
    // Character pose
    const [lvx, lvy, lvz] = [vel.x, vel.y, vel.z];
    const pose: PoseInput = {
      pos: this.renderPos,
      fx: p.fx,
      fz: p.fz,
      up,
      mode: p.mode,
      modeT: p.modeT / TICK_RATE,
      vel: new THREE.Vector3(lvx, lvy, lvz),
      grounded: p.grounded,
      crouch: p.crouch,
      majorFall: p.majorFall,
      wallSide: p.wrSide,
      animU: p.mode === Mode.Mantle || p.mode === Mode.Vault ? Math.min(1, p.modeT / Math.max(1, p.aDur)) : p.mode === Mode.Roll ? Math.min(1, p.modeT / (0.42 * TICK_RATE)) : 0,
      pivot: p.mode === Mode.Swing ? new THREE.Vector3(...toWorld(p.frame, p.pivX, p.pivY, p.pivZ)) : null,
      wind: new THREE.Vector3(-p.vx * 0.6, 0, -p.vz * 0.6),
      dt,
    };
    this.rs.character.update(pose);
    const cam = this.rig.camera;
    this.rs.worldView.update(this.sim.st, tickF, cam.position, p.majorFall, dt);
    const hand = p.mode === Mode.Swing ? this.rs.character.handWorld('R', new THREE.Vector3()) : null;
    this.rs.entities.update(this.sim.st, this.sim.collected, this.sim.lit, p.majorFall, this.time, cam.position, p.ropeId, hand);
    const env = this.rs.updateEnvironment(cam, this.renderPos, this.time, p.majorFall ? 1 : 0);
    this.rs.weather.update(env.weather, env.weather > 0 ? 1 : 0, cam.position, new THREE.Vector3(2, 0, 1), this.time, this.rs.particles.budget);
    this.rs.particles.update(dt);
    this.rs.rings.update(dt);
    this.hooks.onFrame?.(this, dt);
  }

  get lastFrame(): InputFrame {
    return this.lastInput;
  }

  get interpolatedPosition(): THREE.Vector3 {
    return this.renderPos;
  }
}
