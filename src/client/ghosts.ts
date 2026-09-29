import * as THREE from 'three';
import { toWorld } from '../core/collision';
import { buildGhost, parseReplay, serializeReplay, verifyReplay, type GhostTrack, type Replay, type VerifyResult } from '../core/replay';
import type { V3 } from '../core/math';
import type { TrialDef } from '../core/world/types';
import type { World } from '../core/world/world';
import { Character } from './render/character';
import type { KV } from './services/storage';

/** Local ghost storage (one PB and one last-attempt replay per track). */
export class GhostStore {
  constructor(private readonly kv: KV) {}

  key(track: string, kind: 'pb' | 'last'): string {
    return `vertigo.ghost.${track}.${kind}`;
  }

  save(track: string, kind: 'pb' | 'last', r: Replay): boolean {
    try {
      this.kv.set(this.key(track, kind), serializeReplay(r));
      return true;
    } catch {
      // storage full: drop the older 'last' ghosts to make room, keep PBs
      for (const k of this.kv.keys('vertigo.ghost.')) if (k.endsWith('.last')) this.kv.remove(k);
      try {
        this.kv.set(this.key(track, kind), serializeReplay(r));
        return true;
      } catch {
        return false;
      }
    }
  }

  load(track: string, kind: 'pb' | 'last'): Replay | null {
    const raw = this.kv.get(this.key(track, kind));
    if (!raw) return null;
    try {
      return parseReplay(raw);
    } catch {
      this.kv.remove(this.key(track, kind));
      return null;
    }
  }
}

/** A ghost being raced: its precomputed track, verified splits and a translucent climber. */
export class GhostRunner {
  readonly track: GhostTrack;
  readonly result: VerifyResult;
  readonly character: Character;
  private readonly pos = new THREE.Vector3();

  constructor(world: World, replay: Replay, trial: TrialDef | undefined, gates: { pos: V3; r: number }[] | undefined, finish: { pos: V3; r: number } | undefined, color: number) {
    this.track = buildGhost(world, replay, trial, gates, finish);
    this.result = verifyReplay(world, replay, trial, gates, finish);
    this.character = new Character(undefined, true, color);
  }

  get seconds(): number {
    return this.result.ok ? this.result.seconds : Infinity;
  }

  update(tickF: number, dt: number): void {
    const n = this.track.length;
    const i0 = Math.max(0, Math.min(n - 1, Math.floor(tickF)));
    const i1 = Math.min(n - 1, i0 + 1);
    const a = tickF - Math.floor(tickF);
    const tr = this.track;
    this.pos.set(tr.x[i0] + (tr.x[i1] - tr.x[i0]) * a, tr.y[i0] + (tr.y[i1] - tr.y[i0]) * a, tr.z[i0] + (tr.z[i1] - tr.z[i0]) * a);
    const [ux, uy, uz] = toWorld(tr.frame[i0], 0, 1, 0);
    const vx = (tr.x[i1] - tr.x[i0]) * 120;
    const vy = (tr.y[i1] - tr.y[i0]) * 120;
    const vz = (tr.z[i1] - tr.z[i0]) * 120;
    this.character.update({
      pos: this.pos,
      fx: tr.fx[i0],
      fz: tr.fz[i0],
      up: new THREE.Vector3(ux, uy, uz),
      mode: tr.mode[i0],
      modeT: 0,
      vel: new THREE.Vector3(vx, vy, vz),
      grounded: true,
      crouch: false,
      majorFall: false,
      wallSide: 1,
      animU: 0.5,
      pivot: null,
      wind: new THREE.Vector3(),
      dt,
    });
    this.character.root.visible = tickF < n + 240;
  }

  dispose(scene: THREE.Scene): void {
    scene.remove(this.character.root, this.character.scarf);
    this.character.dispose();
  }
}
