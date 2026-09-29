import * as THREE from 'three';
import { cloudLayers, type World } from '../../core/world/world';
import type { Atmosphere } from '../../core/world/types';
import { atmosphereAt } from './atmosphere';
import { Character, DEFAULT_LOOK, type Look } from './character';
import { Entities } from './entities';
import { Particles, Rings, Weather } from './fx';
import { createWorldUniforms, type WorldUniforms } from './materials';
import { Sky } from './sky';
import { WorldView } from './worldview';

export type QualityLevel = 'low' | 'medium' | 'high' | 'ultra';

export interface QualityPreset {
  pixelRatio: number;
  shadows: boolean;
  shadowSize: number;
  shadowRange: number;
  drawDistance: number;
  lodDistance: number;
  detail: number;
  particles: number;
  clouds: boolean;
  antialias: boolean;
}

export const QUALITY: Record<QualityLevel, QualityPreset> = {
  low: { pixelRatio: 0.75, shadows: false, shadowSize: 512, shadowRange: 20, drawDistance: 520, lodDistance: 150, detail: 0.35, particles: 0.3, clouds: true, antialias: false },
  medium: { pixelRatio: 1.0, shadows: true, shadowSize: 1024, shadowRange: 28, drawDistance: 800, lodDistance: 230, detail: 0.8, particles: 0.6, clouds: true, antialias: false },
  high: { pixelRatio: 1.5, shadows: true, shadowSize: 2048, shadowRange: 40, drawDistance: 1200, lodDistance: 340, detail: 1, particles: 1, clouds: true, antialias: true },
  ultra: { pixelRatio: 2, shadows: true, shadowSize: 4096, shadowRange: 55, drawDistance: 1900, lodDistance: 520, detail: 1, particles: 1.4, clouds: true, antialias: true },
};

export interface RenderSettings {
  quality: QualityLevel;
  resolutionScale: number;
  dynamicResolution: boolean;
  targetFps: number;
  motionBlur: boolean;
}

/**
 * Owns the WebGL renderer, scene graph and all visual systems. Shared across menus and sessions.
 */
export class RenderSystem {
  readonly renderer: THREE.WebGLRenderer;
  readonly scene = new THREE.Scene();
  readonly u: WorldUniforms = createWorldUniforms();
  readonly sun = new THREE.DirectionalLight(0xffffff, 2.2);
  readonly hemi = new THREE.HemisphereLight(0xbfd8ff, 0x6a5a48, 1.1);
  readonly sky: Sky;
  readonly worldView: WorldView;
  readonly entities: Entities;
  readonly character: Character;
  readonly particles: Particles;
  readonly weather: Weather;
  readonly rings: Rings;
  readonly ghosts: Character[] = [];
  private preset: QualityPreset;
  private dynScale = 1;
  private frameEMA = 16;
  private goodTime = 0;
  atm: Atmosphere;
  private readonly fogColor = new THREE.Color();
  private readonly cloudShade = new THREE.Color();
  settings: RenderSettings;

  constructor(
    readonly canvas: HTMLCanvasElement,
    readonly world: World,
    settings: RenderSettings,
    look: Look = DEFAULT_LOOK,
  ) {
    this.settings = settings;
    this.preset = QUALITY[settings.quality];
    this.renderer = new THREE.WebGLRenderer({ canvas, antialias: this.preset.antialias, powerPreference: 'high-performance', stencil: false });
    this.renderer.outputColorSpace = THREE.SRGBColorSpace;
    this.renderer.toneMapping = THREE.ACESFilmicToneMapping;
    this.renderer.toneMappingExposure = 1.0;
    this.renderer.shadowMap.type = THREE.PCFSoftShadowMap;
    this.scene.add(this.sun, this.sun.target, this.hemi);
    this.sun.shadow.bias = -0.0004;
    this.sun.shadow.normalBias = 0.03;

    this.sky = new Sky(cloudLayers(world.regions));
    this.scene.add(this.sky.group);
    this.worldView = new WorldView(world, this.u, { drawDistance: this.preset.drawDistance, lodDistance: this.preset.lodDistance, detail: this.preset.detail });
    this.scene.add(this.worldView.group);
    this.entities = new Entities(world);
    this.scene.add(this.entities.group);
    this.character = new Character(look);
    this.scene.add(this.character.root, this.character.scarf);
    this.particles = new Particles(2600);
    this.scene.add(this.particles.points);
    this.weather = new Weather(1600);
    this.scene.add(this.weather.mesh);
    this.rings = new Rings();
    this.scene.add(this.rings.group);
    this.atm = world.regions[0].atmosphere;
    this.applyQuality();
  }

  applyQuality(): void {
    this.preset = QUALITY[this.settings.quality];
    const p = this.preset;
    this.renderer.shadowMap.enabled = p.shadows;
    this.sun.castShadow = p.shadows;
    if (p.shadows) {
      this.sun.shadow.mapSize.set(p.shadowSize, p.shadowSize);
      const cam = this.sun.shadow.camera;
      cam.left = -p.shadowRange;
      cam.right = p.shadowRange;
      cam.top = p.shadowRange;
      cam.bottom = -p.shadowRange;
      cam.near = 1;
      cam.far = 400;
      cam.updateProjectionMatrix();
      this.sun.shadow.map?.dispose();
      this.sun.shadow.map = null;
    }
    this.u.uDetail.value = p.detail;
    this.particles.budget = p.particles;
    this.worldView.setOptions({ drawDistance: p.drawDistance, lodDistance: p.lodDistance, detail: p.detail });
    this.sky.setQuality(p.clouds ? 1 : 0);
    this.resize();
  }

  resize(): void {
    const w = this.canvas.clientWidth || window.innerWidth;
    const h = this.canvas.clientHeight || window.innerHeight;
    const dpr = Math.min(window.devicePixelRatio || 1, 3);
    const pr = Math.max(0.35, Math.min(dpr, this.preset.pixelRatio * dpr * 0.75) * this.settings.resolutionScale * this.dynScale);
    this.renderer.setPixelRatio(pr);
    this.renderer.setSize(w, h, false);
    this.particles.setViewportScale(h * pr);
  }

  get pixelScale(): number {
    return this.dynScale;
  }

  /** Dynamic resolution: react to sustained frame time, not single spikes. */
  trackFrame(ms: number, dt: number): void {
    this.frameEMA = this.frameEMA * 0.95 + ms * 0.05;
    if (!this.settings.dynamicResolution) {
      if (this.dynScale !== 1) {
        this.dynScale = 1;
        this.resize();
      }
      return;
    }
    const budget = 1000 / this.settings.targetFps;
    if (this.frameEMA > budget * 1.18 && this.dynScale > 0.55) {
      this.dynScale = Math.max(0.55, this.dynScale * 0.92);
      this.frameEMA = budget;
      this.goodTime = 0;
      this.resize();
    } else if (this.frameEMA < budget * 0.78 && this.dynScale < 1) {
      this.goodTime += dt;
      if (this.goodTime > 2.5) {
        this.dynScale = Math.min(1, this.dynScale * 1.06);
        this.goodTime = 0;
        this.resize();
      }
    } else this.goodTime = 0;
  }

  /** Update atmosphere, lights and sky for the camera position. */
  updateEnvironment(cam: THREE.Camera, focus: THREE.Vector3, time: number, fallGlow: number): { region: number; weather: number } {
    const camPos = cam.position;
    const { atm, region } = atmosphereAt(this.world.regions, camPos.y);
    this.atm = atm;
    this.fogColor.setHex(atm.fog);
    this.u.uFogColor.value.copy(this.fogColor);
    this.u.uFogDensity.value = atm.fogDensity;
    // Height haze below us is the colour of the region we came from.
    const below = atmosphereAt(this.world.regions, Math.max(0, camPos.y - 260)).atm;
    this.u.uHeightFogColor.value.setHex(below.fog).lerp(new THREE.Color(atm.skyHorizon), 0.35);
    this.u.uCamY.value = camPos.y;
    this.u.uTime.value = time;
    this.u.uFallGlow.value = fallGlow;
    this.u.uSkyTop.value.setHex(atm.skyTop);
    this.sun.color.setHex(atm.sunColor);
    this.sun.intensity = atm.sunIntensity * 2.4;
    this.hemi.color.setHex(atm.skyTop).lerp(new THREE.Color(0xffffff), 0.35);
    this.hemi.groundColor.setHex(atm.ambient);
    this.hemi.intensity = 1.25;
    this.renderer.toneMappingExposure = atm.exposure;
    const sd = new THREE.Vector3(atm.sunDir.x, atm.sunDir.y, atm.sunDir.z).normalize();
    // Shadow camera follows the focus, snapped to texels to avoid shimmering.
    const range = this.preset.shadowRange;
    const texel = (range * 2) / this.preset.shadowSize;
    const fx = Math.round(focus.x / texel) * texel;
    const fy = Math.round(focus.y / texel) * texel;
    const fz = Math.round(focus.z / texel) * texel;
    this.sun.position.set(fx + sd.x * 150, fy + sd.y * 150, fz + sd.z * 150);
    this.sun.target.position.set(fx, fy, fz);
    this.cloudShade.setHex(atm.fog).multiplyScalar(0.8);
    const stars = atm.weather === 4 ? 1 : camPos.y > 1900 ? Math.min(1, (camPos.y - 1900) / 300) * 0.6 : 0;
    this.sky.update(atm, camPos, time, stars, this.cloudShade, this.fogColor);
    return { region, weather: atm.weather };
  }

  render(cam: THREE.Camera): void {
    this.renderer.render(this.scene, cam);
  }

  dispose(): void {
    this.worldView.dispose();
    this.character.dispose();
    this.renderer.dispose();
  }
}
