import { ALL_ABILITIES, type Atmosphere } from '../src/core/world/types';
import { RegionBuilder } from '../src/core/world/builder';
import { World } from '../src/core/world/world';
import { Simulation, type SimConfig } from '../src/core/sim';
import { Btn, quantizeInput, type InputFrame } from '../src/core/input';
import { v3 } from '../src/core/math';

export const ATM: Atmosphere = {
  skyTop: 0x335577,
  skyHorizon: 0xaabbcc,
  fog: 0xaabbcc,
  fogDensity: 0.002,
  sunColor: 0xffffff,
  sunIntensity: 1,
  ambient: 0x888888,
  sunDir: v3(0.3, 0.8, 0.2),
  weather: 0,
  cloudColor: 0xffffff,
  exposure: 1,
};

export function testWorld(fn: (b: RegionBuilder) => void): World {
  const b = new RegionBuilder({ index: 0, id: 'test', baseY: -10, topY: 500, atmosphere: ATM, center: v3(0, 0, 0), radius: 1000 });
  fn(b);
  return new World([b.build()]);
}

export function sim(world: World, x: number, y: number, z: number, yaw = 0, cfg: Partial<SimConfig> = {}): Simulation {
  return new Simulation(world, {
    mode: 'story',
    abilities: ALL_ABILITIES,
    flags: [],
    collected: [],
    litAnchors: [],
    lastAnchor: null,
    spawn: { pos: v3(x, y, z), yaw },
    recallAnywhere: false,
    ngPlus: false,
    ...cfg,
  });
}

export const inp = (mz = 0, mx = 0, yaw = 0, btn = 0): InputFrame => quantizeInput({ mx, mz, yaw, btn });

export function run(s: Simulation, n: number, i: InputFrame | ((t: number) => InputFrame)): void {
  for (let t = 0; t < n; t++) s.step(typeof i === 'function' ? i(t) : i);
}

export const B = Btn;
