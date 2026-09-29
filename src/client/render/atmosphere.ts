import * as THREE from 'three';
import type { Atmosphere, RegionMeta } from '../../core/world/types';

const tmpA = new THREE.Color();
const tmpB = new THREE.Color();

function lerpHex(a: number, b: number, t: number): number {
  tmpA.setHex(a);
  tmpB.setHex(b);
  tmpA.lerp(tmpB, t);
  return tmpA.getHex();
}

export function blendAtmosphere(a: Atmosphere, b: Atmosphere, t: number): Atmosphere {
  return {
    skyTop: lerpHex(a.skyTop, b.skyTop, t),
    skyHorizon: lerpHex(a.skyHorizon, b.skyHorizon, t),
    fog: lerpHex(a.fog, b.fog, t),
    fogDensity: a.fogDensity + (b.fogDensity - a.fogDensity) * t,
    sunColor: lerpHex(a.sunColor, b.sunColor, t),
    sunIntensity: a.sunIntensity + (b.sunIntensity - a.sunIntensity) * t,
    ambient: lerpHex(a.ambient, b.ambient, t),
    sunDir: {
      x: a.sunDir.x + (b.sunDir.x - a.sunDir.x) * t,
      y: a.sunDir.y + (b.sunDir.y - a.sunDir.y) * t,
      z: a.sunDir.z + (b.sunDir.z - a.sunDir.z) * t,
    },
    weather: t < 0.5 ? a.weather : b.weather,
    cloudColor: lerpHex(a.cloudColor, b.cloudColor, t),
    exposure: a.exposure + (b.exposure - a.exposure) * t,
  };
}

/**
 * Atmosphere at an altitude: each region's preset holds through its body and blends into the
 * next across a band around the boundary, so the climb reads as one continuous sky.
 */
export function atmosphereAt(regions: readonly RegionMeta[], y: number): { atm: Atmosphere; region: number; blend: number } {
  const band = 45;
  let i = 0;
  for (let k = regions.length - 1; k >= 0; k--) {
    if (y >= regions[k].baseY) {
      i = k;
      break;
    }
  }
  const cur = regions[i];
  const next = regions[i + 1];
  if (next && y > next.baseY - band) {
    const t = (y - (next.baseY - band)) / band;
    return { atm: blendAtmosphere(cur.atmosphere, next.atmosphere, Math.min(1, t) * 0.5), region: i, blend: t };
  }
  if (i > 0 && y < cur.baseY + band) {
    const prev = regions[i - 1];
    const t = (y - cur.baseY) / band;
    return { atm: blendAtmosphere(prev.atmosphere, cur.atmosphere, 0.5 + Math.max(0, t) * 0.5), region: i, blend: t };
  }
  return { atm: cur.atmosphere, region: i, blend: 0 };
}
