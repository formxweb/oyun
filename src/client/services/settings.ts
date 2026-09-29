import { DEFAULT_BINDINGS, type Bindings } from '../input/input';
import type { Lang } from '../i18n/i18n';
import type { QualityLevel } from '../render/renderer';
import type { KV } from './storage';

export interface TouchButton {
  x: number;
  y: number;
  size: number;
}

export type TouchId = 'stick' | 'jump' | 'crouch' | 'interact' | 'sprint' | 'recall' | 'pause';

export interface Settings {
  lang: Lang;
  graphics: {
    quality: QualityLevel;
    resolutionScale: number;
    dynamicResolution: boolean;
    targetFps: number;
    fullscreen: boolean;
    fov: number;
  };
  audio: { master: number; music: number; sfx: number; ambience: number; voice: number };
  controls: {
    sensitivity: number;
    padLookSpeed: number;
    invertY: boolean;
    autoCenter: boolean;
    camDistance: number;
    sprintMode: 'hold' | 'toggle' | 'auto';
    vibration: boolean;
    bindings: Bindings;
  };
  touch: {
    layout: Record<TouchId, TouchButton>;
    opacity: number;
    scale: number;
    leftHanded: boolean;
    autoSprint: boolean;
    haptics: boolean;
    lookSensitivity: number;
  };
  access: {
    subtitles: boolean;
    subSize: number;
    uiScale: number;
    cameraShake: boolean;
    motionBlur: boolean;
    reducedMotion: boolean;
    slowMo: boolean;
    colorblind: boolean;
    highContrast: boolean;
    hints: boolean;
  };
  gameplay: { showTimer: boolean; showRisk: boolean };
}

/** Default touch layout in normalized screen coordinates (0..1), right-handed. */
export const DEFAULT_TOUCH: Record<TouchId, TouchButton> = {
  stick: { x: 0.14, y: 0.72, size: 1 },
  jump: { x: 0.88, y: 0.74, size: 1.2 },
  crouch: { x: 0.77, y: 0.85, size: 0.95 },
  interact: { x: 0.9, y: 0.52, size: 0.85 },
  sprint: { x: 0.76, y: 0.62, size: 0.8 },
  recall: { x: 0.96, y: 0.3, size: 0.7 },
  pause: { x: 0.96, y: 0.08, size: 0.7 },
};

export function isTouchDevice(): boolean {
  return typeof window !== 'undefined' && ('ontouchstart' in window || navigator.maxTouchPoints > 0) && matchMedia('(pointer: coarse)').matches;
}

/** Pick a starting quality from what we can learn about the device. */
export function detectQuality(): QualityLevel {
  const touch = isTouchDevice();
  const mem = (navigator as Navigator & { deviceMemory?: number }).deviceMemory ?? 4;
  const cores = navigator.hardwareConcurrency ?? 4;
  if (touch) return mem >= 6 && cores >= 8 ? 'medium' : 'low';
  if (mem >= 8 && cores >= 8) return 'high';
  return 'medium';
}

export function defaultSettings(lang: Lang): Settings {
  const touch = isTouchDevice();
  return {
    lang,
    graphics: { quality: detectQuality(), resolutionScale: 1, dynamicResolution: true, targetFps: touch ? 60 : 60, fullscreen: false, fov: touch ? 74 : 72 },
    audio: { master: 0.85, music: 0.7, sfx: 0.9, ambience: 0.8, voice: 0.9 },
    controls: {
      sensitivity: 1,
      padLookSpeed: 3.2,
      invertY: false,
      autoCenter: touch,
      camDistance: 4.4,
      sprintMode: 'hold',
      vibration: true,
      bindings: structuredClone(DEFAULT_BINDINGS),
    },
    touch: { layout: structuredClone(DEFAULT_TOUCH), opacity: 0.55, scale: 1, leftHanded: false, autoSprint: true, haptics: true, lookSensitivity: 1 },
    access: { subtitles: true, subSize: 1, uiScale: 1, cameraShake: true, motionBlur: false, reducedMotion: false, slowMo: true, colorblind: false, highContrast: false, hints: true },
    gameplay: { showTimer: false, showRisk: true },
  };
}

function deepMerge<T>(base: T, over: unknown): T {
  if (typeof base !== 'object' || base === null || Array.isArray(base)) return (over === undefined ? base : (over as T)) ?? base;
  const out = { ...base } as Record<string, unknown>;
  if (over && typeof over === 'object') {
    for (const k of Object.keys(base as object)) {
      const bv = (base as Record<string, unknown>)[k];
      const ov = (over as Record<string, unknown>)[k];
      if (ov === undefined) continue;
      if (typeof bv === 'object' && bv !== null && !Array.isArray(bv)) out[k] = deepMerge(bv, ov);
      else if (typeof bv === typeof ov || (Array.isArray(bv) && Array.isArray(ov))) out[k] = ov;
    }
  }
  return out as T;
}

const KEY = 'vertigo.settings';

export class SettingsStore {
  value: Settings;
  private listeners = new Set<(s: Settings) => void>();

  constructor(
    private readonly kv: KV,
    lang: Lang,
  ) {
    const def = defaultSettings(lang);
    let loaded: unknown = null;
    try {
      const raw = kv.get(KEY);
      if (raw) loaded = JSON.parse(raw);
    } catch {
      loaded = null;
    }
    this.value = deepMerge(def, loaded);
    // Bindings: fill any action missing from an older settings file.
    this.value.controls.bindings = {
      keys: { ...DEFAULT_BINDINGS.keys, ...(this.value.controls.bindings?.keys ?? {}) },
      pad: { ...DEFAULT_BINDINGS.pad, ...(this.value.controls.bindings?.pad ?? {}) },
    };
    this.value.touch.layout = { ...DEFAULT_TOUCH, ...(this.value.touch.layout ?? {}) };
  }

  save(): void {
    try {
      this.kv.set(KEY, JSON.stringify(this.value));
    } catch {
      /* ignore quota: settings are not critical */
    }
    for (const f of this.listeners) f(this.value);
  }

  onChange(f: (s: Settings) => void): () => void {
    this.listeners.add(f);
    return () => this.listeners.delete(f);
  }

  reset(section: keyof Settings): void {
    const def = defaultSettings(this.value.lang);
    (this.value as unknown as Record<string, unknown>)[section] = structuredClone(def[section]);
    this.save();
  }
}
