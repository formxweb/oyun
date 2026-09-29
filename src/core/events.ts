import type { CollectibleKind, Mat, RopeKind } from './world/types';

/** Deterministic events emitted by the simulation each tick. Drive audio, VFX, UI and progression. */
export type SimEvent =
  | { k: 'jump'; kind: 'ground' | 'coyote' | 'slide' | 'wall' | 'wallrun' | 'rope' | 'ledge' | 'ladder' | 'roll'; x: number; y: number; z: number }
  | { k: 'land'; fall: number; mat: Mat; speed: number; heavy: boolean; soft: boolean; x: number; y: number; z: number }
  | { k: 'step'; mat: Mat; speed: number; x: number; y: number; z: number }
  | { k: 'slide'; start: boolean }
  | { k: 'mantle'; height: number }
  | { k: 'vault' }
  | { k: 'hang' }
  | { k: 'climb' }
  | { k: 'roll' }
  | { k: 'stagger'; fall: number }
  | { k: 'wallrun'; start: boolean; side: number }
  | { k: 'wallclimb' }
  | { k: 'grab'; rope: RopeKind }
  | { k: 'release'; rope: RopeKind }
  | { k: 'bounce'; x: number; y: number; z: number }
  | { k: 'fallStart'; from: number }
  | { k: 'fallEnd'; dist: number; caught: boolean; tag: string | null }
  | { k: 'netFound'; tag: string }
  | { k: 'collect'; id: string; kind: CollectibleKind }
  | { k: 'anchor'; id: string; first: boolean }
  | { k: 'memory'; trigger: string; flag: string }
  | { k: 'flag'; flag: string }
  | { k: 'shift'; frame: number }
  | { k: 'shiftEnd'; reason: 'timer' | 'reset' }
  | { k: 'vent'; zone: number }
  | { k: 'lightning'; zone: number; hit: boolean }
  | { k: 'hazard' }
  | { k: 'area'; key: string }
  | { k: 'respawn'; reason: 'void' | 'squish' | 'recall' | 'catch' }
  | { k: 'crumble'; solid: number }
  | { k: 'ability'; ability: number }
  | { k: 'region'; index: number }
  | { k: 'gate'; index: number }
  | { k: 'master'; index: number }
  | { k: 'finish' };

export type EventSink = SimEvent[];
