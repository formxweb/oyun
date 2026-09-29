import type { V3 } from '../math';

/** Surface materials. Drives rendering pattern, footstep sound and friction. */
export const enum Mat {
  Concrete = 0,
  Brick = 1,
  Plaster = 2,
  Metal = 3,
  Girder = 4,
  Wood = 5,
  Stone = 6,
  Glass = 7,
  Moss = 8,
  Cloth = 9,
  Rock = 10,
  Tile = 11,
  Rust = 12,
  Marble = 13,
  Crystal = 14,
  Grass = 15,
  Dirt = 16,
  Brass = 17,
  Paint = 18,
  Glow = 19,
  Water = 20,
  Asphalt = 21,
  Obsidian = 22,
  Cloud = 23,
}
export const MAT_COUNT = 24;

export const enum Shape {
  Box = 0,
  Ramp = 1,
  Cyl = 2,
}

export const enum SolidFlag {
  None = 0,
  NoWallRun = 1,
  NoGrab = 2,
  Slippery = 4,
  Shift = 8,
  Crumble = 16,
  Bounce = 32,
  Soft = 64,
  Decor = 128,
  Hazard = 256,
  Conveyor = 512,
  NoShadow = 1024,
  /** Only rendered / collidable while the player is in a major fall (fall-only architecture). */
  FallOnly = 2048,
  /** Ramps only: a sloped beam THIN_BEAM thick instead of a solid wedge (girders, chains, fallen beams). */
  Thin = 4096,
}

/** Thickness of a Thin ramp (a sloped beam). */
export const THIN_BEAM = 0.3;

/** Ramp slope direction in the solid's local frame: which side is high. */
export const enum Slope {
  PosX = 0,
  NegX = 1,
  PosZ = 2,
  NegZ = 3,
}

export interface Solid {
  id: number;
  shape: Shape;
  /** Authored centre. If attached to a mover, relative to the mover origin. */
  lx: number;
  ly: number;
  lz: number;
  hx: number;
  hy: number;
  hz: number;
  lyaw: number;
  slope: Slope;
  mat: Mat;
  tint: number;
  flags: number;
  mover: number;
  region: number;
  show: string | null;
  hide: string | null;
  tag: string | null;
  bounce: number;
  convX: number;
  convZ: number;
  // runtime world transform
  x: number;
  y: number;
  z: number;
  yaw: number;
  c: number;
  s: number;
  minX: number;
  maxX: number;
  minY: number;
  maxY: number;
  minZ: number;
  maxZ: number;
}

export type MoverKind = 'path' | 'rotate' | 'oscillate' | 'transition' | 'pendulum';

export interface Mover {
  id: number;
  kind: MoverKind;
  origin: V3;
  region: number;
  /** path: offsets relative to origin, visited in order. */
  points: V3[];
  /** Seconds to travel each segment. */
  segTime: number[];
  /** Seconds to pause at each point. */
  pause: number;
  loop: boolean;
  /** Ease in/out at each point (lifts). Linear otherwise (trains, conveyors). */
  ease: boolean;
  phase: number;
  /** rotate / oscillate */
  angVel: number;
  amp: number;
  period: number;
  axisAmp: V3;
  /** transition: animated one-shot change triggered by a memory flag. */
  flag: string | null;
  fromYaw: number;
  toYaw: number;
  fromOff: V3;
  toOff: V3;
  dur: number;
  /** If set, the mover only runs while the flag is set; otherwise it rests at t=0. */
  activeFlag: string | null;
  /** runtime */
  ox: number;
  oy: number;
  oz: number;
  oyaw: number;
  vx: number;
  vy: number;
  vz: number;
  vyaw: number;
  solids: number[];
}

export type RopeKind = 'line' | 'zip' | 'swing' | 'bar' | 'ladder' | 'hook';

export interface Rope {
  id: number;
  kind: RopeKind;
  a: V3;
  b: V3;
  /** ladder: outward normal of the wall the ladder is on */
  n: V3;
  region: number;
  mover: number;
  show: string | null;
  hide: string | null;
  mat: Mat;
}

export type ZoneKind =
  | 'wind'
  | 'updraft'
  | 'vent'
  | 'lightning'
  | 'shift'
  | 'gravityReset'
  | 'trigger'
  | 'area'
  | 'void'
  | 'slow'
  | 'noAnchorRecall';

export interface Zone {
  id: number;
  kind: ZoneKind;
  min: V3;
  max: V3;
  region: number;
  /** Direction/strength (wind), strength (updraft), impulse (vent) */
  dir: V3;
  strength: number;
  period: number;
  phase: number;
  active: number;
  /** trigger: flag set on enter; area: name key */
  key: string | null;
  show: string | null;
  hide: string | null;
}

export interface Anchor {
  id: string;
  pos: V3;
  yaw: number;
  region: number;
  nameKey: string;
  /** Region entry anchors are always available as catch points. */
  major: boolean;
}

export type CollectibleKind = 'fragment' | 'record' | 'echo' | 'lesson';

export interface Collectible {
  id: string;
  kind: CollectibleKind;
  pos: V3;
  region: number;
  show: string | null;
  hide: string | null;
  /** lesson: ability unlocked */
  ability?: Ability;
}

export type TriggerCond =
  | { type: 'land'; tag: string; minFall: number }
  | { type: 'enter'; min: V3; max: V3 }
  | { type: 'anchor'; anchor: string }
  | { type: 'fallPass'; pos: V3; radius: number }
  | { type: 'collect'; kind: CollectibleKind | 'any'; region: number; count: number }
  | { type: 'flags'; all: string[] }
  | { type: 'interact'; pos: V3; radius: number }
  | { type: 'stand'; tag: string; seconds: number }
  | { type: 'height'; y: number };

export interface MemoryTrigger {
  id: string;
  flag: string;
  cond: TriggerCond;
  region: number;
  /** Subtitle / discovery text key shown when this change happens. */
  textKey: string | null;
  /** Only active in New Game+. */
  ngPlusOnly: boolean;
  /** Not evaluated in New Game+ (world already remembers). */
  storyOnly: boolean;
  /** Seconds before the flag takes effect (e.g. a crane creaks before it swings). */
  delay: number;
  /** Camera focus point for the change, if any. */
  focus: V3 | null;
}

/** Movement techniques. Unlocked through lessons found in the world. */
export const enum Ability {
  Sprint = 1,
  Mantle = 2,
  Slide = 4,
  Vault = 8,
  LedgeGrab = 16,
  Rope = 32,
  WallRun = 64,
  WallJump = 128,
  WallClimb = 256,
  Roll = 512,
  Swing = 1024,
  Zip = 2048,
  GravityShift = 4096,
  /** The plumb line: tether to brass hook rings and swing. */
  Tether = 8192,
}
export const ALL_ABILITIES = 16383;
export const BASE_ABILITIES = Ability.Sprint | Ability.Mantle;

export type DecorKind =
  | 'box'
  | 'cyl'
  | 'hcyl'
  | 'cone'
  | 'sphere'
  | 'cable'
  | 'glyph'
  | 'window'
  | 'lamp'
  | 'tree'
  | 'vines'
  | 'laundry'
  | 'flag'
  | 'sign'
  | 'gear'
  | 'bird'
  | 'crate'
  | 'plant'
  | 'vgear';

/** Render-only authored detail. */
export interface Decor {
  kind: DecorKind;
  p: V3;
  s: V3;
  yaw: number;
  mat: Mat;
  tint: number;
  region: number;
  mover: number;
  show: string | null;
  hide: string | null;
  /** cable end / secondary point */
  q?: V3;
  /** glyph id / sign text key / misc */
  key?: string;
  /** only visible during a major fall */
  fallOnly?: boolean;
  /** far silhouette: rendered at any distance */
  landmark?: boolean;
  /** render-only rotation speed in rad/s (gears: about their own axle) */
  spin?: number;
}

export interface TrialDef {
  id: string;
  region: number;
  nameKey: string;
  start: V3;
  startYaw: number;
  gates: { pos: V3; r: number }[];
  finish: { pos: V3; r: number };
  /** seconds */
  medals: { bronze: number; silver: number; gold: number; perfect: number };
  /** World memory state the trial runs in (canonical, so ghosts are fair). */
  flags: string[];
  abilities: number;
  /** Master-route gates: optional, passing them raises the route multiplier. */
  master: { pos: V3; r: number }[];
}

export interface Atmosphere {
  skyTop: number;
  skyHorizon: number;
  fog: number;
  fogDensity: number;
  sunColor: number;
  sunIntensity: number;
  ambient: number;
  sunDir: V3;
  /** 0 none, 1 dust, 2 rain, 3 storm, 4 stars/void motes, 5 petals */
  weather: number;
  cloudColor: number;
  exposure: number;
}

export interface RegionMeta {
  index: number;
  id: string;
  baseY: number;
  topY: number;
  atmosphere: Atmosphere;
  /** Horizontal centre used by the camera for scale framing and for the wind wall. */
  center: V3;
  radius: number;
}

export interface RegionData {
  meta: RegionMeta;
  solids: Solid[];
  movers: Mover[];
  ropes: Rope[];
  zones: Zone[];
  anchors: Anchor[];
  collectibles: Collectible[];
  triggers: MemoryTrigger[];
  decor: Decor[];
  trials: TrialDef[];
  /** Daily Summit gate candidates (authored). */
  dailyGates: V3[];
  /** Golden route: the intended main path, used by the bot verifier and guided hints. */
  route: RouteStep[];
  /** Alternative routes (risk, master, secret) verified by the bot like the main route. */
  branches: RouteBranch[];
  spawn: { pos: V3; yaw: number };
}

export type RouteAction =
  | 'run'
  | 'walk'
  | 'jump'
  | 'sprintjump'
  | 'longjump'
  | 'mantle'
  | 'wallrunL'
  | 'wallrunR'
  | 'walljump'
  | 'slide'
  | 'slidejump'
  | 'rope'
  | 'ladder'
  | 'zip'
  | 'swing'
  | 'wait'
  | 'ride'
  | 'shift'
  | 'drop'
  | 'interact'
  | 'climb';

export interface RouteBranch {
  id: string;
  kind: 'risk' | 'master' | 'secret';
  route: RouteStep[];
}

export interface RouteStep {
  p: V3;
  a: RouteAction;
  /** optional extra parameter (wait seconds, etc.) */
  t?: number;
  /** which mover to ride / wait for */
  m?: number;
  note?: string;
  /** world memory state this leg is verified in (defaults to none) */
  flags?: string[];
  /** the leg only counts once this memory flag has been set (levers, bells, valves) */
  expect?: string;
}
