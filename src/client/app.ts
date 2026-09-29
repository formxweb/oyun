import * as THREE from 'three';
import { ACHIEVEMENTS } from '../core/catalog/achievements';
import { COSMETIC_BY_ID, type Slot } from '../core/catalog/cosmetics';
import { dailyRoute, dateKey, type DailyRoute } from '../core/daily';
import type { SimEvent } from '../core/events';
import { Btn, type InputFrame } from '../core/input';
import { Mode } from '../core/player';
import { SIM_VERSION, verifyReplay, worldHash, serializeReplay, type Replay } from '../core/replay';
import { medalFor, trialScore } from '../core/scoring';
import type { SimConfig } from '../core/sim';
import { T } from '../core/tuning';
import { buildWorld } from '../core/world/index';
import { ALL_ABILITIES, type TrialDef } from '../core/world/types';
import { newWorldState, TICK_RATE, worldTop, type World, type WorldState } from '../core/world/world';
import { AudioEngine } from './audio/audio';
import { EndingDirector } from './ending';
import { GhostRunner, GhostStore } from './ghosts';
import { detectLang, fmtDuration, fmtNumber, fmtTime, setLang, t } from './i18n/i18n';
import { InputManager, type Action } from './input/input';
import { TouchControls } from './input/touch';
import { Platform } from './platform/platform';
import type { IStoreService } from './platform/store/IStoreService';
import { GooglePlayStoreService, type VertigoBillingPlugin } from './platform/store/GooglePlayStoreService';
import { MockStoreService, NoStoreService } from './platform/store/MockStoreService';
import { SteamStoreService } from './platform/store/SteamStoreService';
import { CameraRig, type CameraSettings } from './render/camera';
import { DEFAULT_LOOK, type Look } from './render/character';
import { RenderSystem } from './render/renderer';
import { Online } from './services/online';
import { allMemoryFlags, Profile } from './services/profile';
import { migrate, SaveManager, validate, type SaveData } from './services/save';
import { isTouchDevice, SettingsStore } from './services/settings';
import { Session } from './session';
import type { GhostChoice, LeaderboardEntry, TrialResultView, UIContext } from './ui/context';
import { h } from './ui/dom';
import { Hud } from './ui/hud';
import { keyName, padName } from './ui/screens';
import { UIManager } from './ui/ui';

type State = 'menu' | 'play' | 'ending';
type RunKind = 'story' | 'trial' | 'daily' | 'nofall';

interface Run {
  kind: RunKind;
  trial?: TrialDef;
  daily?: DailyRoute;
  region?: number;
  ghost?: GhostChoice;
  countdown: number;
  finished: boolean;
  started: boolean;
  failed: boolean;
}

export class App implements UIContext {
  readonly platform = new Platform();
  readonly settings: SettingsStore;
  readonly saves: SaveManager;
  readonly world: World;
  readonly profile: Profile;
  readonly isTouch = isTouchDevice();
  readonly net: Online;
  private store: IStoreService;
  private readonly ghostsStore: GhostStore;
  private rs!: RenderSystem;
  private rig!: CameraRig;
  private input!: InputManager;
  private touch!: TouchControls;
  private ui!: UIManager;
  private hud!: Hud;
  readonly audio = new AudioEngine();
  private state: State = 'menu';
  private session: Session | null = null;
  private run: Run | null = null;
  private ghosts: GhostRunner[] = [];
  private pbSplits: number[] = [];
  private menuState: WorldState;
  private menuT = 0;
  private last = performance.now();
  private autosaveT = 0;
  private lastClimbed = 0;
  private ending: EndingDirector | null = null;
  private previewId: string | null = null;
  private lastCollectedLetter: string | null = null;
  private flashT = 0;
  private cloudT = 0;
  private dailyCache: DailyRoute | null = null;
  private worldHashCache: string | null = null;
  private speedrunVerified = true;
  private noFallStart: { x: number; y: number; z: number; yaw: number } | null = null;

  constructor(private readonly canvas: HTMLCanvasElement, private readonly uiRoot: HTMLElement) {
    this.settings = new SettingsStore(this.platform.kv, detectLang());
    setLang(this.settings.value.lang);
    this.saves = new SaveManager(this.platform.kv);
    const loaded = this.saves.load();
    this.world = buildWorld();
    this.profile = new Profile(loaded.data, this.world, {
      onAchievement: (id) => this.onAchievement(id),
      onUnlockCosmetic: () => undefined,
    });
    this.menuState = newWorldState(loaded.data.journey?.flags ?? []);
    const apiBase = (import.meta.env.VITE_API_URL as string | undefined) ?? null;
    this.net = new Online(this.platform.kv, apiBase);
    this.ghostsStore = new GhostStore(this.platform.kv);
    this.store = this.createStore();
    this.boot(loaded.corrupt, loaded.source);
  }

  private createStore(): IStoreService {
    if (this.platform.kind === 'android') {
      return new GooglePlayStoreService(this.platform.plugin<VertigoBillingPlugin>('VertigoBilling'), this.net, () => this.net.account?.playerId ?? this.profile.data.profileId);
    }
    if (this.platform.kind === 'steam') {
      return new SteamStoreService(this.platform.steam, this.net, async () => {
        const r = await fetch(((import.meta.env.VITE_API_URL as string) ?? '') + '/v1/store/prices?platform=steam', {
          headers: this.net.account ? { Authorization: 'Bearer ' + this.net.account.token } : {},
        });
        return r.ok ? ((await r.json()) as Record<string, string>) : null;
      });
    }
    // The test store exists only in development and QA builds; a release web build has no store
    // (nothing can be bought there), whatever the URL says.
    if (import.meta.env.DEV || import.meta.env.VITE_STORE === 'mock') {
      return new MockStoreService(this.platform.kv, new URLSearchParams(location.search).get('mockstore'));
    }
    return new NoStoreService();
  }

  // ------------------------------------------------------------------ boot

  private boot(corrupt: boolean, source: string): void {
    try {
      this.rs = new RenderSystem(this.canvas, this.world, this.renderSettings(), this.currentLook());
    } catch {
      this.uiRoot.append(h('div', { class: 'screen full' }, h('div', { class: 'panel center' }, h('p', null, t('err.webgl')))));
      throw new Error('webgl');
    }
    this.canvas.addEventListener('webglcontextlost', (e) => {
      e.preventDefault();
      this.pause();
    });
    this.rig = new CameraRig(this.canvas.clientWidth / Math.max(1, this.canvas.clientHeight));
    this.input = new InputManager(this.canvas);
    this.input.onPause = () => this.togglePause();
    this.input.onJournal = () => this.openJournal();
    this.input.onAnyInput = (d) => this.onDevice(d);
    (window as unknown as { __vertigoCapture: (cb: (c: string | number) => void) => void }).__vertigoCapture = (cb) => {
      this.input.capture = cb;
    };
    this.touch = new TouchControls(this.input, () => this.settings.value, () => this.settings.save());
    this.touch.onPause = () => this.togglePause();
    this.touch.haptic = () => {
      if (this.settings.value.touch.haptics) this.platform.haptic('light');
    };
    this.ui = new UIManager(this.uiRoot, this);
    this.ui.onBackFromRoot = () => this.resume();
    this.audio.worldTop = worldTop(this.world.regions);
    this.hud = new Hud(
      this.world.regions.map((r, i) => ({ y: r.baseY < 0 ? 0 : r.baseY, name: t('region.' + i) })),
      worldTop(this.world.regions),
    );
    this.ui.hudLayer.appendChild(this.hud.el);
    this.ui.touchLayer.appendChild(this.touch.el);
    this.hud.setVisible(false);
    this.applySettings();
    window.addEventListener('resize', () => this.onResize());
    document.addEventListener('visibilitychange', () => {
      if (document.hidden) {
        if (this.state === 'play' && this.session && !this.session.paused) this.pause();
        this.saveNow();
      }
    });
    window.addEventListener('pagehide', () => this.saveNow());
    const unlockAudio = () => {
      this.audio.start();
      this.audio.setVolumes(this.settings.value.audio);
      if (this.settings.value.graphics.fullscreen) this.platform.setFullscreen(true);
    };
    window.addEventListener('pointerdown', unlockAudio, { once: false });
    window.addEventListener('keydown', unlockAudio, { once: false });
    if (this.isTouch) this.platform.lockLandscape();
    this.ui.replace('main');
    if (corrupt) this.ui.message(source === 'backup' ? 'save.corrupt' : 'save.corrupt.none');
    if (import.meta.env.DEV) this.devStart();
    this.startServices();
    requestAnimationFrame(this.loop);
  }

  private async startServices(): Promise<void> {
    await this.store.init().catch(() => undefined);
    this.store.onEntitlementsChanged((ids) => {
      this.profile.setOwnedFromServer([...new Set([...this.profile.data.owned, ...ids])]);
      this.saveNow();
      this.refreshLook();
    });
    if (this.store.entitlements().length) this.profile.grantPurchase(this.store.entitlements());
    if (this.net.configured && this.net.account) {
      await this.syncCloud();
      await this.flushOutbox();
    }
  }

  private renderSettings() {
    const g = this.settings.value.graphics;
    return { quality: g.quality, resolutionScale: g.resolutionScale, dynamicResolution: g.dynamicResolution, targetFps: g.targetFps, motionBlur: this.settings.value.access.motionBlur };
  }

  applySettings(): void {
    const s = this.settings.value;
    setLang(s.lang);
    const root = document.documentElement;
    root.style.setProperty('--ui-scale', String(s.access.uiScale));
    root.classList.toggle('colorblind', s.access.colorblind);
    root.classList.toggle('contrast', s.access.highContrast);
    root.classList.toggle('reduced', s.access.reducedMotion);
    this.hud?.setSubSize(s.access.subSize);
    if (this.rs) {
      this.rs.settings = this.renderSettings();
      this.rs.applyQuality();
    }
    if (this.input) {
      this.input.bindings = s.controls.bindings;
      this.input.settings.sprintMode = s.controls.sprintMode;
      this.input.settings.padLookSpeed = s.controls.padLookSpeed;
      this.input.settings.vibration = s.controls.vibration;
    }
    this.touch?.layout();
    this.audio.setVolumes(s.audio);
    if (this.session) {
      this.session.slowMoEnabled = s.access.slowMo;
      if (this.run?.kind === 'story' && this.profile.data.journey) this.session.sim.cfg.recallAnywhere = this.profile.data.journey.difficulty === 'guided';
    }
    this.platform.setFullscreen(s.graphics.fullscreen);
  }

  private camSettings = (): CameraSettings => {
    const s = this.settings.value;
    return {
      fov: s.graphics.fov,
      sensitivity: s.controls.sensitivity,
      invertY: s.controls.invertY,
      reducedMotion: s.access.reducedMotion,
      cameraShake: s.access.cameraShake,
      autoCenter: s.controls.autoCenter,
      distance: s.controls.camDistance,
    };
  };

  private onResize(): void {
    this.rs.resize();
    this.rig.camera.aspect = this.canvas.clientWidth / Math.max(1, this.canvas.clientHeight);
    this.rig.camera.updateProjectionMatrix();
    this.touch.layout();
  }

  private onDevice(d: 'kbm' | 'pad' | 'touch'): void {
    const playing = this.state === 'play' && this.session && !this.session.paused;
    this.touch.setVisible(d === 'touch' && !!playing);
  }

  // ------------------------------------------------------------------ look / cosmetics

  currentLook(preview: string | null = null): Look {
    const eq = { ...this.profile.data.equipped };
    if (preview) {
      const c = COSMETIC_BY_ID.get(preview);
      if (c) eq[c.slot] = c.id;
    }
    const look: Look = { ...DEFAULT_LOOK };
    for (const slot of ['outfit', 'scarf', 'shoes', 'gloves'] as Slot[]) {
      const c = COSMETIC_BY_ID.get(eq[slot]);
      if (c?.look) Object.assign(look, Object.fromEntries(Object.entries(c.look).filter(([, v]) => v !== undefined)));
    }
    return look;
  }

  private refreshLook(): void {
    this.rs?.character.setLook(this.currentLook(this.previewId));
  }

  previewLook(id: string | null): void {
    this.previewId = id;
    this.refreshLook();
  }

  // ------------------------------------------------------------------ main loop

  private loop = (now: number): void => {
    const dt = Math.min(0.1, Math.max(0, (now - this.last) / 1000));
    this.last = now;
    const t0 = performance.now();
    try {
      this.frame(dt);
    } catch (e) {
      console.error(e);
    }
    this.rs.trackFrame(performance.now() - t0, dt);
    requestAnimationFrame(this.loop);
  };

  private frame(dt: number): void {
    const gp = navigator.getGamepads ? [...navigator.getGamepads()].find((g) => g) ?? null : null;
    if (this.ui.open) this.ui.nav.pollPad(gp, dt);
    if (this.state === 'ending' && this.ending) {
      this.ending.update(dt);
      this.rs.particles.update(dt);
      this.hud.update({ y: 0, peakY: 0, majorFall: false, fallDist: 0, risk: null, timer: null, gravity: null, prompt: null }, dt, { showRisk: false, showTimer: false });
      this.audio.update(dt, { y: 1200, speed: 50, falling: !this.ending.done, fallSpeed: 50, weather: 0, region: 9, danger: 0.2, paused: false, menu: false, wind: 2 });
      if (this.ending.done) this.finishEnding();
    } else if (this.state === 'play' && this.session) {
      this.playFrame(dt);
    } else {
      this.menuFrame(dt);
    }
    if (this.flashT > 0) {
      this.flashT -= dt;
      this.rs.renderer.toneMappingExposure += Math.max(0, this.flashT) * 3;
    }
    this.rs.render(this.rig.camera);
  }

  private menuFrame(dt: number): void {
    this.menuT += dt;
    const j = this.profile.data.journey;
    const focusRegion = this.ui.top === 'customize' || this.ui.top === 'store' ? -1 : j ? this.world.regionAt(this.profile.simConfig().spawn.pos.y) : 0;
    const cam = this.rig.camera;
    if (focusRegion < 0) {
      // Showcase: the climber on the Last Floor, camera close.
      const p = new THREE.Vector3(-4, 3.6, 62);
      this.rs.character.root.visible = true;
      this.rs.character.update({
        pos: p,
        fx: Math.sin(this.menuT * 0.3) * 0.3,
        fz: 1,
        up: new THREE.Vector3(0, 1, 0),
        mode: Mode.Ground,
        modeT: 0,
        vel: new THREE.Vector3(),
        grounded: true,
        crouch: false,
        majorFall: false,
        wallSide: 0,
        animU: 0,
        pivot: null,
        wind: new THREE.Vector3(2, 0, 1),
        dt,
      });
      cam.position.set(p.x - 1.6, p.y + 1.5, p.z + 3.6);
      cam.up.set(0, 1, 0);
      cam.lookAt(p.x - 0.9, p.y + 1.0, p.z);
    } else {
      const meta = this.world.regions[focusRegion];
      const y = Math.max(8, Math.min(meta.topY - 20, meta.baseY + (meta.topY - meta.baseY) * 0.45));
      const a = this.menuT * 0.035 + focusRegion;
      const r = 118 + Math.sin(this.menuT * 0.05) * 12;
      cam.position.set(Math.sin(a) * r, y + Math.sin(this.menuT * 0.07) * 6, Math.cos(a) * r);
      cam.up.set(0, 1, 0);
      cam.lookAt(0, y + 40 + Math.sin(this.menuT * 0.04) * 20, 0);
      this.rs.character.root.visible = false;
    }
    cam.fov = 60;
    cam.updateProjectionMatrix();
    const tick = this.menuT * TICK_RATE;
    this.world.applyMovers(Math.floor(tick), this.menuState);
    this.rs.worldView.update(this.menuState, tick, cam.position, false, dt);
    this.rs.entities.update(this.menuState, new Set(this.profile.data.journey?.collected ?? []), new Set(this.profile.data.journey?.lit ?? []), false, this.menuT, cam.position, -1, null);
    const env = this.rs.updateEnvironment(cam, cam.position, this.menuT, 0);
    this.rs.weather.update(env.weather, env.weather > 0 ? 0.6 : 0, cam.position, new THREE.Vector3(2, 0, 1), this.menuT, this.rs.particles.budget);
    this.rs.particles.update(dt);
    this.audio.update(dt, { y: cam.position.y, speed: 0, falling: false, fallSpeed: 0, weather: env.weather, region: env.region, danger: 0, paused: false, menu: true, wind: 0 });
  }

  // ------------------------------------------------------------------ play

  private makeSession(cfg: SimConfig): Session {
    this.disposeSession();
    this.world.applyMovers(0, newWorldState(cfg.flags));
    const s = new Session(this.world, cfg, this.rs, this.rig, this.input, this.camSettings, {
      onEvent: (e, ss) => this.onEvent(e, ss),
      onTick: (ss, inp) => this.onTick(ss, inp),
    });
    s.slowMoEnabled = this.settings.value.access.slowMo && this.run?.kind !== 'trial' && this.run?.kind !== 'daily';
    this.session = s;
    this.state = 'play';
    this.rs.character.root.visible = true;
    this.ui.closeAll();
    this.hud.setVisible(true);
    this.touch.setVisible(this.input.device === 'touch' || this.isTouch);
    this.input.enabled = true;
    this.input.reset();
    this.lastClimbed = 0;
    this.refreshLook();
    return s;
  }

  private disposeSession(): void {
    for (const g of this.ghosts) g.dispose(this.rs.scene);
    this.ghosts = [];
    this.session = null;
    this.audio.setSlide(false, 0);
  }

  journeySummary(): { region: number; time: number } | null {
    const j = this.profile.data.journey;
    if (!j || j.finished) return null;
    const a = j.lastAnchor ? this.world.anchorById.get(j.lastAnchor) : null;
    return { region: a ? a.region : 0, time: j.playTime };
  }

  continueJourney(): void {
    if (!this.profile.data.journey) return;
    this.audio.start();
    this.run = { kind: 'story', countdown: 0, finished: false, started: true, failed: false };
    const cfg = this.profile.simConfig();
    const s = this.makeSession(cfg);
    this.speedrunVerified = false; // resumed runs cannot be verified end-to-end
    this.hud.showRegion(this.world.regionAt(cfg.spawn.pos.y));
    void s;
  }

  startJourney(d: 'guided' | 'standard', ngPlus: boolean, speedrun = false): void {
    this.audio.start();
    this.profile.startJourney(d, ngPlus, speedrun);
    this.saveNow(true);
    this.run = { kind: 'story', countdown: 0, finished: false, started: true, failed: false };
    this.makeSession(this.profile.simConfig());
    this.speedrunVerified = speedrun;
    this.hud.showRegion(0);
    if (this.settings.value.access.hints) setTimeout(() => this.showHint('hint.move'), 2500);
  }

  startTrial(id: string, ghost: GhostChoice): void {
    const trial = this.world.trials.find((x) => x.id === id);
    if (!trial) return;
    this.audio.start();
    this.run = { kind: 'trial', trial, ghost, countdown: 3.2, finished: false, started: false, failed: false };
    const cfg: SimConfig = {
      mode: 'trial',
      abilities: trial.abilities,
      flags: trial.flags,
      collected: [],
      litAnchors: [],
      lastAnchor: null,
      spawn: { pos: trial.start, yaw: trial.startYaw },
      recallAnywhere: false,
      ngPlus: false,
      trial,
    };
    const s = this.makeSession(cfg);
    s.frozen = true;
    this.loadGhosts(trial.id, ghost, trial, undefined, undefined);
  }

  private loadGhosts(track: string, ghost: GhostChoice | undefined, trial: TrialDef | undefined, gates: DailyRoute['gates'] | undefined, finish: DailyRoute['finish'] | undefined): void {
    this.pbSplits = [];
    const pb = this.ghostsStore.load(track, 'pb');
    if (pb) {
      try {
        const g = new GhostRunner(this.world, pb, trial, gates, finish, 0x9fd8ff);
        if (g.result.ok) this.pbSplits = g.result.splits.map((x) => x / TICK_RATE);
        if (ghost === 'pb' && g.result.ok) {
          this.ghosts.push(g);
          this.rs.scene.add(g.character.root, g.character.scarf);
        }
      } catch {
        /* incompatible ghost (physics version) — ignore */
      }
    }
    if (ghost === 'last') {
      const last = this.ghostsStore.load(track, 'last');
      if (last) {
        const g = new GhostRunner(this.world, last, trial, gates, finish, 0xffd89a);
        if (g.result.ok) {
          this.ghosts.push(g);
          this.rs.scene.add(g.character.root, g.character.scarf);
        }
      }
    }
    if (ghost === 'top' || ghost === 'friend') {
      this.net.leaderboard(trial ? 'trial' : 'daily', track, ghost === 'friend' ? 'friends' : 'global').then(async (rows) => {
        const top = rows?.find((r) => r.replayId && !r.you);
        if (!top?.replayId) return;
        const raw = await this.net.replay(top.replayId);
        if (!raw || !this.session) return;
        try {
          const { parseReplay } = await import('../core/replay');
          const g = new GhostRunner(this.world, parseReplay(raw), trial, gates, finish, 0xff9a7a);
          if (g.result.ok) {
            this.ghosts.push(g);
            this.rs.scene.add(g.character.root, g.character.scarf);
          }
        } catch {
          /* ignore */
        }
      });
    }
  }

  raceReplay(replayId: string, trialId: string): void {
    this.startTrial(trialId, 'none');
    this.net.replay(replayId).then(async (raw) => {
      if (!raw || !this.session) return;
      const { parseReplay } = await import('../core/replay');
      const trial = this.world.trials.find((x) => x.id === trialId);
      const g = new GhostRunner(this.world, parseReplay(raw), trial, undefined, undefined, 0xff9a7a);
      if (g.result.ok) {
        this.ghosts.push(g);
        this.rs.scene.add(g.character.root, g.character.scarf);
      }
    });
  }

  dailyUnlocked(): boolean {
    return this.profile.data.journeysCompleted > 0;
  }

  daily(): DailyRoute | null {
    if (!this.dailyUnlocked()) return null;
    const key = dateKey(new Date());
    if (!this.dailyCache || this.dailyCache.date !== key) this.dailyCache = dailyRoute(this.world, key, allMemoryFlags(this.world));
    return this.dailyCache;
  }

  startDaily(): void {
    const d = this.daily();
    if (!d) return;
    this.audio.start();
    this.run = { kind: 'daily', daily: d, countdown: 3.2, finished: false, started: false, failed: false, ghost: 'pb' };
    const cfg: SimConfig = {
      mode: 'daily',
      abilities: d.abilities,
      flags: d.flags,
      collected: [],
      litAnchors: [],
      lastAnchor: null,
      spawn: { pos: d.start, yaw: d.startYaw },
      recallAnywhere: false,
      ngPlus: false,
      gates: d.gates,
      finish: d.finish,
      wind: d.modifier === 'wind' ? { x: 5, z: 3 } : undefined,
    };
    const s = this.makeSession(cfg);
    s.frozen = true;
    this.loadGhosts('daily:' + d.date, 'pb', undefined, d.gates, d.finish);
  }

  startNoFall(region: number): void {
    const anchors = this.world.anchors.filter((a) => a.region === region).sort((a, b) => a.pos.y - b.pos.y);
    const a = anchors[0];
    const spawn = a ? { pos: { x: a.pos.x, y: a.pos.y + 0.05, z: a.pos.z }, yaw: a.yaw } : this.world.regionData[region].spawn;
    this.audio.start();
    this.run = { kind: 'nofall', region, countdown: 0, finished: false, started: true, failed: false };
    this.noFallStart = { ...spawn.pos, yaw: spawn.yaw };
    this.makeSession({
      mode: 'story',
      abilities: ALL_ABILITIES,
      flags: allMemoryFlags(this.world),
      collected: this.world.collectibles.map((c) => c.id),
      litAnchors: [],
      lastAnchor: null,
      spawn,
      recallAnywhere: false,
      ngPlus: false,
    });
    this.hud.showRegion(region);
  }

  private onTick(s: Session, inp: InputFrame): void {
    const run = this.run;
    const sim = s.sim;
    if (run?.kind === 'story') {
      const j = this.profile.data.journey;
      if (j) j.ticks++;
      // lifetime & autosave bookkeeping once per second of sim time
      if (sim.tick % TICK_RATE === 0) {
        const climbed = sim.stats.climbed;
        this.profile.tickLifetime(1, climbed - this.lastClimbed, sim.stats.maxY);
        this.lastClimbed = climbed;
      }
    }
    void inp;
  }

  private playFrame(dt: number): void {
    const s = this.session!;
    const run = this.run!;
    // countdown for trials / daily
    if (run.countdown > 0 && !s.paused) {
      const before = Math.ceil(run.countdown);
      run.countdown -= dt;
      const after = Math.ceil(run.countdown);
      if (after !== before && after > 0) this.audio.countdown(false);
      this.hud.countdown(run.countdown > 0 ? String(Math.max(1, after)) : null);
      if (run.countdown <= 0) {
        s.frozen = false;
        run.started = true;
        this.audio.countdown(true);
        this.hud.countdown(t('trial.go'));
        setTimeout(() => this.hud.countdown(null), 600);
      }
    }
    s.frame(dt);
    const sim = s.sim;
    const p = sim.player;
    for (const g of this.ghosts) g.update(sim.tick, dt);
    // HUD
    const anchorY = sim.lastAnchor ? this.world.anchorById.get(sim.lastAnchor)?.pos.y ?? 0 : sim.cfg.spawn.pos.y;
    const timed = run.kind === 'trial' || run.kind === 'daily' || (run.kind === 'story' && (this.profile.data.journey?.speedrun || this.settings.value.gameplay.showTimer));
    const tr = sim.trial;
    const journeyTicks = this.profile.data.journey?.ticks ?? 0;
    this.hud.update(
      {
        y: p.y,
        peakY: Math.max(sim.stats.maxY, anchorY),
        majorFall: p.majorFall,
        fallDist: p.peakY - p.y,
        risk: { mult: sim.risk.mult, unbanked: sim.risk.unbanked, banked: sim.risk.banked },
        timer: timed ? { seconds: tr ? (tr.finished ? tr.finishTick : sim.tick) / TICK_RATE : journeyTicks / TICK_RATE, gate: tr ? tr.gate : 0, total: tr ? tr.gates.length + 1 : 0 } : null,
        gravity: p.frame !== 0 ? Math.max(0, p.gravTimer / (8 * TICK_RATE)) : null,
        prompt: this.interactPrompt(),
      },
      dt,
      { showRisk: this.settings.value.gameplay.showRisk, showTimer: !!timed },
    );
    // Guided recall prompt after a fall: hold recall
    const guided = run.kind === 'story' && this.profile.data.journey?.difficulty === 'guided';
    this.touch.setContext(!!this.interactPrompt(), guided);
    // audio beds
    const danger = Math.min(1, (sim.risk.mult - 1) / 2.5 + (p.majorFall ? 0.3 : 0));
    this.audio.update(dt, {
      y: p.y,
      speed: Math.hypot(p.vx, p.vz),
      falling: p.majorFall,
      fallSpeed: Math.max(0, -p.vy),
      weather: this.rs.atm.weather,
      region: sim.region,
      danger: run.kind === 'trial' || run.kind === 'daily' ? Math.max(0.5, danger) : danger,
      paused: s.paused,
      menu: false,
      wind: 0,
    });
    this.audio.setSlide(p.mode === Mode.Slide, Math.hypot(p.vx, p.vz));
    this.rs.weather.update(this.rs.atm.weather, this.rs.atm.weather > 0 ? 1 : 0, this.rig.camera.position, new THREE.Vector3(p.vx * 0.2 + 2, 0, p.vz * 0.2 + 1), s.time, this.rs.particles.budget);
    this.rs.zoneFx.update(dt, this.rig.camera.position, sim.tick / TICK_RATE, sim.st, s.paused ? 0 : this.rs.particles.budget);
    // autosave
    if (run.kind === 'story' && !s.paused) {
      this.autosaveT += dt;
      if (this.autosaveT > 60) {
        this.autosaveT = 0;
        this.syncJourney();
        this.saveNow();
      }
      this.cloudT += dt;
      if (this.cloudT > 180 && this.net.account) {
        this.cloudT = 0;
        this.syncCloud().catch(() => undefined);
      }
    }
    // trail cosmetic
    const trail = COSMETIC_BY_ID.get(this.profile.data.equipped.trail);
    if (trail?.fx && Math.hypot(p.vx, p.vz) > 6.5 && !s.paused && Math.random() < 0.6) {
      this.rs.particles.emit(p.x, p.y + 0.4, p.z, (Math.random() - 0.5) * 0.4, 0.3, (Math.random() - 0.5) * 0.4, Math.random() < 0.5 ? trail.fx.color : trail.fx.color2 ?? trail.fx.color, 0.09, 0.8, 0.3, 1);
    }
  }

  private interactPrompt(): string | null {
    const s = this.session;
    if (!s) return null;
    const p = s.sim.player;
    for (const tr of this.world.triggers) {
      if (tr.cond.type !== 'interact') continue;
      if (s.sim.st.flags.has(tr.flag)) continue;
      const c = tr.cond;
      const d = Math.hypot(p.x - c.pos.x, p.y + 1 - c.pos.y, p.z - c.pos.z);
      if (d <= c.radius) return t('hint.bell', { interact: this.keyText('interact') }).replace(/<[^>]+>/g, '');
    }
    if (s.sim.abilities & 8192 && p.mode === Mode.Air) {
      for (const r of this.world.ropes) {
        if (r.kind !== 'hook') continue;
        const d = Math.hypot(r.a.x - p.x, r.a.y - p.y - 1.6, r.a.z - p.z);
        if (d < T.hookRange && r.a.y > p.y) return this.keyText('interact').replace(/<[^>]+>/g, '') + ' ◎';
      }
    }
    return null;
  }

  keyText(a: Action): string {
    const d = this.input.device;
    if (d === 'pad') return `<span class="keycap">${padName(this.input.bindings.pad[a][0])}</span>`;
    if (d === 'touch') return `<span class="keycap">${t('action.' + a)}</span>`;
    return `<span class="keycap">${keyName(this.input.bindings.keys[a][0])}</span>`;
  }

  private showHint(key: string): void {
    if (!this.settings.value.access.hints) return;
    const moveKeys = this.input.device === 'kbm' ? `${this.keyText('forward')}${this.keyText('left')}${this.keyText('back')}${this.keyText('right')}` : this.input.device === 'pad' ? '<span class="keycap">L</span>' : `<span class="keycap">◉</span>`;
    const look = this.input.device === 'kbm' ? '<span class="keycap">🖱</span>' : this.input.device === 'pad' ? '<span class="keycap">R</span>' : '<span class="keycap">↔</span>';
    this.hud.hint(t(key, { move: moveKeys, look, jump: this.keyText('jump'), sprint: this.keyText('sprint'), crouch: this.keyText('crouch'), interact: this.keyText('interact') }), 7);
  }

  // ------------------------------------------------------------------ events

  private onEvent(e: SimEvent, s: Session): void {
    const run = this.run!;
    const sim = s.sim;
    const p = sim.player;
    const pos = new THREE.Vector3(p.x, p.y, p.z);
    const up = this.rig.localUp;
    const story = run.kind === 'story';
    if (story) this.profile.onEvent(e, sim);
    switch (e.k) {
      case 'step':
        this.audio.footstep(e.mat, e.speed);
        break;
      case 'jump': {
        this.audio.jump();
        const jf = COSMETIC_BY_ID.get(this.profile.data.equipped.jump);
        if (jf?.fx) this.rs.particles.burst(new THREE.Vector3(e.x, e.y + 0.1, e.z), 8, 1.6, jf.fx.color, 0.08, 0.45, 1, 0.2);
        break;
      }
      case 'land': {
        this.audio.land(e.fall, e.mat, e.soft);
        if (e.fall > 2) {
          const lf = COSMETIC_BY_ID.get(this.profile.data.equipped.landing);
          const col = lf?.fx?.color ?? 0xcdbb9a;
          this.rs.particles.ring(new THREE.Vector3(e.x, e.y, e.z), 10 + e.fall * 2, 2 + e.fall * 0.2, col, 0.14, 0.7);
          if (lf?.fx?.kind === 'ring' || e.fall > 9) this.rs.rings.spawn(new THREE.Vector3(e.x, e.y, e.z), up, col, Math.min(6, 1 + e.fall * 0.2), 0.8);
          this.rig.landDip(Math.min(0.35, e.fall * 0.02), this.camSettings());
        }
        if (e.heavy) {
          this.rig.impulse(Math.min(1, e.fall / 25), this.camSettings());
          this.input.rumble(Math.min(1, e.fall / 30), 180);
          if (this.settings.value.touch.haptics && this.input.device === 'touch') this.platform.haptic('heavy');
        }
        break;
      }
      case 'roll':
        this.audio.roll();
        break;
      case 'mantle':
      case 'climb':
        this.audio.mantle();
        break;
      case 'vault':
        this.audio.vault();
        break;
      case 'wallrun':
        this.audio.wallrun(e.start);
        break;
      case 'wallclimb':
        this.audio.wallrun(true);
        break;
      case 'grab':
        this.audio.grab(e.rope);
        this.input.rumble(0.2, 60);
        break;
      case 'bounce':
        this.audio.land(2, 9, true);
        break;
      case 'fallStart':
        this.audio.fallStart();
        if (run.kind === 'nofall') this.failNoFall();
        break;
      case 'fallEnd':
        if (!e.caught && e.dist > 25 && story) {
          this.hud.toast(t('hud.fall.dist', { m: Math.round(e.dist) }), '', '');
          if (this.profile.data.journey?.difficulty === 'guided') this.showHint('hint.recall');
        }
        if (run.kind === 'daily' && run.daily?.modifier === 'nofall' && !e.caught && e.dist > T.majorFallDrop) this.failDaily();
        break;
      case 'netFound':
        this.hud.toast(t('hud.memory'), t('mem.net'), 'sky');
        this.audio.anchor(false);
        break;
      case 'collect':
        this.onCollect(e.id, e.kind, pos);
        break;
      case 'anchor': {
        const a = this.world.anchorById.get(e.id);
        this.audio.anchor(e.first);
        if (e.first && a) this.hud.toast(t('hud.anchor'), t(a.nameKey), 'gold');
        if (story) {
          this.syncJourney();
          this.saveNow(true);
        }
        break;
      }
      case 'memory': {
        const tr = this.world.triggers.find((x) => x.id === e.trigger);
        if (tr?.flag.startsWith('hint_')) {
          this.showHint(tr.textKey ?? '');
          break;
        }
        this.audio.memory();
        if (tr?.flag === 'r1_bell') this.audio.bell();
        if (tr?.textKey && this.settings.value.access.subtitles) this.hud.subtitle(t(tr.textKey), 6, true);
        if (tr?.focus) this.rig.setFocus(new THREE.Vector3(tr.focus.x, tr.focus.y, tr.focus.z), 2.5);
        this.rig.impulse(0.3, this.camSettings());
        this.input.rumble(0.4, 400);
        if (story) {
          this.syncJourney();
          this.saveNow(true);
          if (tr?.flag === 'r10_cradle') setTimeout(() => this.beginEnding(), 2500);
        }
        break;
      }
      case 'flag':
        if (e.flag.startsWith('hint_')) {
          const tr = this.world.triggers.find((x) => x.flag === e.flag);
          if (tr?.textKey) this.showHint(tr.textKey);
        }
        break;
      case 'shift':
      case 'shiftEnd':
        this.audio.shift();
        break;
      case 'vent':
        this.audio.vent();
        break;
      case 'lightning': {
        const z = this.world.zones[e.zone];
        this.rs.zoneFx.bolt(z);
        const cx = (z.min.x + z.max.x) / 2;
        const cy = (z.min.y + z.max.y) / 2;
        const cz = (z.min.z + z.max.z) / 2;
        const d = Math.hypot(cx - p.x, cy - p.y, cz - p.z);
        this.audio.thunder(d, e.hit);
        if (!this.settings.value.access.reducedMotion) this.flashT = Math.max(this.flashT, d < 120 ? 0.25 : 0.12);
        if (e.hit) {
          this.rig.impulse(0.8, this.camSettings());
          this.input.rumble(0.9, 300);
          this.rs.particles.burst(pos.clone().add(new THREE.Vector3(0, 1, 0)), 40, 6, 0xcfe0ff, 0.12, 0.5, 2, 0.3);
        }
        break;
      }
      case 'hazard':
        this.audio.hazard();
        break;
      case 'area':
        this.hud.showArea(e.key);
        if (e.key.includes('pegs') || e.key.includes('master')) this.hud.toast(t('trial.route.master'), t(e.key), 'gold');
        break;
      case 'respawn':
        this.audio.respawn();
        this.hud.fade(true);
        setTimeout(() => this.hud.fade(false), 250);
        if (run.kind === 'nofall' && e.reason !== 'recall') this.failNoFall();
        break;
      case 'crumble':
        this.audio.crumble();
        break;
      case 'ability': {
        this.hud.toast(t('hud.collect.lesson'), t('hud.ability', { name: t('ability.' + e.ability) }), 'sky');
        const hints: Record<number, string> = { 4: 'hint.slide', 8: 'hint.vault', 16: 'hint.ledge', 32: 'hint.rope', 64: 'hint.wallrun', 128: 'hint.walljump', 256: 'hint.wallclimb', 512: 'hint.roll', 1024: 'hint.swing', 2048: 'hint.zip', 4096: 'hint.gravity', 8192: 'hint.tether' };
        if (hints[e.ability]) setTimeout(() => this.showHint(hints[e.ability]), 800);
        break;
      }
      case 'region':
        this.hud.showRegion(e.index);
        if (story) {
          this.syncJourney();
          this.saveNow(true);
        }
        if (run.kind === 'nofall' && e.index === (run.region ?? 0) + 1 && !run.failed) {
          run.finished = true;
          this.profile.unlock('no_way_down');
          this.hud.subtitle(t('nofall.complete', { region: t('region.' + run.region) }), 6);
          this.saveNow();
          setTimeout(() => this.quitToMenu(), 4000);
        }
        break;
      case 'gate': {
        this.audio.gate();
        const secs = sim.tick / TICK_RATE;
        const pb = this.pbSplits[e.index];
        if (pb !== undefined) this.hud.split(secs - pb);
        break;
      }
      case 'master':
        this.hud.toast(t('hud.master'), t('trial.route.master'), 'gold');
        break;
      case 'finish':
        this.finishRun();
        break;
    }
  }

  private onCollect(id: string, kind: string, pos: THREE.Vector3): void {
    this.audio.collect(kind);
    const color = kind === 'fragment' ? 0xffd890 : kind === 'record' ? 0x9fe0ff : kind === 'echo' ? 0xffe2a0 : 0x8fd0ff;
    this.rs.particles.burst(pos.clone().add(new THREE.Vector3(0, 1, 0)), 36, 3, color, 0.1, 1.2, -0.5, 0.8);
    this.rs.rings.spawn(pos, this.rig.localUp, color, 3, 1.2);
    this.input.rumble(0.3, 120);
    if (kind === 'echo') {
      this.hud.toast(t('hud.collect.echo'), '', 'gold');
      this.hud.subtitle(t(id), 7, true);
    } else if (kind === 'fragment') {
      this.lastCollectedLetter = id;
      this.hud.toast(t('hud.collect.fragment'), `${t(id + '.title')} — ${t('hud.readLetter', { key: this.keyText('journal').replace(/<[^>]+>/g, '') })}`, 'gold');
    } else if (kind === 'record') {
      this.lastCollectedLetter = id;
      this.hud.toast(t('hud.collect.record'), t(id + '.title'), 'sky');
    } else if (kind === 'lesson') {
      // Lessons are short and teach the new technique: show immediately.
      this.pause(false);
      this.ui.replace('reader', id);
    }
    if (this.run?.kind === 'story') {
      this.syncJourney();
      this.saveNow(true);
    }
  }

  private openJournal(): void {
    if (this.state !== 'play' || !this.session) return;
    if (this.session.paused && this.ui.top === 'reader') {
      this.resume();
      return;
    }
    if (this.lastCollectedLetter && !this.profile.data.lettersRead.includes(this.lastCollectedLetter)) {
      this.pause(false);
      this.ui.replace('reader', this.lastCollectedLetter);
    } else {
      this.pause(false);
      this.ui.replace('collection');
    }
  }

  // ------------------------------------------------------------------ run end

  private buildReplay(): Replay {
    const s = this.session!;
    if (!this.worldHashCache) this.worldHashCache = worldHash(this.world);
    return {
      header: {
        simVersion: SIM_VERSION,
        worldHash: this.worldHashCache,
        mode: s.sim.cfg.mode,
        track: this.run?.kind === 'daily' ? 'daily:' + this.run.daily!.date : this.run?.trial?.id ?? 'speedrun',
        abilities: s.sim.cfg.abilities,
        flags: s.sim.cfg.flags,
        spawn: s.sim.cfg.spawn,
        ticks: s.inputs.length,
      },
      inputs: s.inputs.slice(),
    };
  }

  private finishRun(): void {
    const run = this.run;
    const s = this.session;
    if (!run || !s || run.finished) return;
    run.finished = true;
    const replay = this.buildReplay();
    const trial = run.trial;
    const d = run.daily;
    const v = verifyReplay(this.world, replay, trial, d?.gates, d?.finish, d?.par);
    const seconds = v.ok ? v.seconds : s.sim.tick / TICK_RATE;
    const falls = v.falls;
    const track = replay.header.track;
    let pb = false;
    let medal = 'none';
    let score = v.score;
    if (trial) {
      medal = v.ok ? v.medal : medalFor(seconds, falls, trial.medals);
      const r = this.profile.recordTrial(trial.id, seconds, falls, score, medal as 'none', v.masterGates > 0);
      pb = r.pb;
    } else if (d) {
      score = v.ok ? v.score : trialScore(seconds, d.par, falls, s.sim.risk.maxMult, 0.5, 0);
      const rec = this.profile.data.daily[d.date] ?? { bestScore: 0, bestTime: Infinity, attempts: 0, submitted: false };
      rec.attempts++;
      if (score > rec.bestScore) {
        rec.bestScore = score;
        rec.bestTime = seconds;
        pb = true;
      }
      this.profile.data.daily[d.date] = rec;
      this.profile.unlock('daily');
    }
    // ghosts
    this.ghostsStore.save(track, 'last', replay);
    if (pb) this.ghostsStore.save(track, 'pb', replay);
    if (this.ghosts.some((g) => g.seconds > seconds && isFinite(g.seconds))) this.profile.unlock('ghost');
    // submission (queued when offline)
    const view: TrialResultView = {
      trialId: trial?.id ?? null,
      title: trial ? t(trial.nameKey) : t('daily.title'),
      seconds,
      falls,
      maxMult: v.maxMult,
      efficiency: v.efficiency,
      score,
      medal,
      pb,
      route: v.masterGates > 0 ? 'master' : v.maxMult > 2.2 ? 'risk' : 'safe',
      submit: 'none',
      splits: v.splits.map((x) => x / TICK_RATE),
      daily: !!d,
    };
    if (v.ok && pb) {
      view.submit = 'pending';
      this.submit(trial ? 'trial' : 'daily', track, serializeReplay(replay), seconds).then((st) => {
        view.submit = st;
        if (this.ui.top === 'results') this.ui.replace('results', view);
      });
    }
    this.saveNow();
    setTimeout(() => {
      if (!this.session) return;
      this.session.paused = true;
      this.input.releasePointer();
      this.touch.setVisible(false);
      this.ui.replace('results', view);
    }, 900);
  }

  private async submit(kind: 'trial' | 'daily' | 'speedrun', track: string, replay: string, seconds: number): Promise<'ok' | 'pending' | 'rejected'> {
    const r = await this.net.submitRun(kind, track, replay, seconds);
    if (r.status === 'pending') {
      this.profile.data.outbox.push({ kind: 'run', payload: { kind, track, replay, seconds }, tries: 0 });
      this.saveNow();
    }
    return r.status;
  }

  private async flushOutbox(): Promise<void> {
    const box = this.profile.data.outbox;
    if (!box.length || !this.net.account) return;
    const keep: typeof box = [];
    for (const item of box) {
      if (item.kind !== 'run') continue;
      const p = item.payload as { kind: 'trial' | 'daily' | 'speedrun'; track: string; replay: string; seconds: number };
      const r = await this.net.submitRun(p.kind, p.track, p.replay, p.seconds);
      if (r.status === 'pending' && item.tries < 20) keep.push({ ...item, tries: item.tries + 1 });
    }
    this.profile.data.outbox = keep;
    this.saveNow();
  }

  private failDaily(): void {
    const run = this.run;
    if (!run || run.failed) return;
    run.failed = true;
    this.hud.subtitle(t('daily.mod.nofall'), 3);
    setTimeout(() => this.restartRun(), 1500);
  }

  private failNoFall(): void {
    const run = this.run;
    if (!run || run.failed || run.finished || !this.session || !this.noFallStart) return;
    this.hud.subtitle(t('nofall.failed'), 3);
    const st = this.noFallStart;
    setTimeout(() => {
      if (!this.session || this.run !== run) return;
      this.session.sim.ctrl.place(this.session.sim.player, st.x, st.y, st.z, st.yaw);
    }, 1200);
  }

  restartRun(): void {
    const run = this.run;
    if (!run) return;
    if (run.kind === 'trial' && run.trial) this.startTrial(run.trial.id, run.ghost ?? 'pb');
    else if (run.kind === 'daily') this.startDaily();
    else if (run.kind === 'nofall') this.startNoFall(run.region ?? 0);
    else this.resume();
  }

  // ------------------------------------------------------------------ ending

  private beginEnding(): void {
    if (!this.session || this.state !== 'play') return;
    const j = this.profile.data.journey;
    this.syncJourney();
    this.profile.finishJourney();
    if (j?.speedrun && this.speedrunVerified) {
      const secs = j.ticks / TICK_RATE;
      if (!this.profile.data.speedrunBest || secs < this.profile.data.speedrunBest) this.profile.data.speedrunBest = secs;
      if (secs < 3600) this.profile.unlock('sub60');
      if (secs < 1800) this.profile.unlock('sub30');
      const rep = this.buildReplay();
      rep.header.track = 'speedrun';
      this.submit('speedrun', 'speedrun', serializeReplay(rep), secs).catch(() => undefined);
    }
    this.saveNow(true);
    const flags = [...this.session.sim.st.flags];
    // Read the first letter and Aurel's letter, then fall.
    this.pause(false);
    this.ui.replace('reader', 'f1');
    const origPop = this.ui.pop.bind(this.ui);
    let step = 0;
    this.ui.pop = () => {
      step++;
      if (step === 1) {
        this.ui.replace('reader', 'f0');
        return;
      }
      this.ui.pop = origPop;
      this.ui.closeAll();
      this.disposeSession();
      this.state = 'ending';
      this.hud.setVisible(true);
      this.touch.setVisible(false);
      this.ending = new EndingDirector(this.world, this.rs, this.rig.camera, this.hud, this.audio, flags);
    };
  }

  private finishEnding(): void {
    this.ending = null;
    const j = this.profile.data.journey;
    const letters = this.profile.countCollected('fragment');
    this.hud.subtitle(`${t('ending.complete')}  ${t('ending.stats', { time: fmtDuration(j?.playTime ?? 0), falls: j?.stats.majorFalls ?? 0, letters })}`, 10);
    this.hud.toast(t('ach.unlocked'), t('ending.ngplus'), 'gold');
    const afterLetter = () => {
      this.state = 'menu';
      this.hud.setVisible(false);
      this.ui.replace('main');
      this.ui.push('credits');
    };
    if (letters >= this.profile.totals.fragment && !this.profile.data.thirtyFirstLetter) {
      const text = prompt(`${t('ending.secret')}\n\n${t('ending.letter.prompt')}`, t('ending.letter.default'));
      this.profile.data.thirtyFirstLetter = (text ?? t('ending.letter.default')).slice(0, 600);
    }
    this.saveNow(true);
    setTimeout(afterLetter, 6000);
  }

  // ------------------------------------------------------------------ pause / menu

  private togglePause(): void {
    if (this.state !== 'play' || !this.session) return;
    if (this.session.paused) {
      if (this.ui.top === 'pause' || this.ui.top === 'reader' || this.ui.top === 'collection') this.resume();
    } else this.pause();
  }

  pause(showMenu = true): void {
    const s = this.session;
    if (!s || s.paused) return;
    if (this.run?.finished) return;
    s.paused = true;
    this.input.releasePointer();
    this.input.reset();
    this.touch.setVisible(false);
    if (this.run?.kind === 'story') {
      this.syncJourney();
      this.saveNow();
    }
    if (showMenu) {
      const sim = s.sim;
      this.ui.replace('pause', {
        mode: this.run?.kind === 'story' || this.run?.kind === 'nofall' ? 'story' : 'trial',
        stats: t('pause.stats', { falls: sim.stats.majorFalls, climbed: fmtNumber(sim.stats.climbed), time: fmtTime(sim.tick / TICK_RATE) }),
      });
    }
  }

  resume(): void {
    if (!this.session) return;
    this.ui.closeAll();
    this.session.paused = false;
    this.touch.setVisible(this.input.device === 'touch' || this.isTouch);
    this.hud.setVisible(true);
  }

  canRecall(): boolean {
    const s = this.session;
    if (!s || this.run?.kind !== 'story') return false;
    const a = s.sim.anchorFor();
    if (!a) return false;
    if (this.profile.data.journey?.difficulty === 'guided') return true;
    return s.sim.player.y >= a.pos.y - 5;
  }

  recall(): boolean {
    if (!this.canRecall() || !this.session) return false;
    // Recall is an input so replays stay deterministic.
    this.session.step({ ...this.session.lastFrame, btn: Btn.Recall });
    this.session.step({ ...this.session.lastFrame, btn: 0 });
    return true;
  }

  quitToMenu(): void {
    if (this.run?.kind === 'story') {
      this.syncJourney();
      this.saveNow(true);
      if (this.net.account) this.syncCloud().catch(() => undefined);
    }
    this.disposeSession();
    this.run = null;
    this.state = 'menu';
    this.menuState = newWorldState(this.profile.data.journey?.flags ?? []);
    this.hud.setVisible(false);
    this.touch.setVisible(false);
    this.input.releasePointer();
    this.ui.replace('main');
  }

  quitGame(): void {
    this.saveNow(true);
    this.platform.quit();
  }

  // ------------------------------------------------------------------ saving

  private syncJourney(): void {
    if (this.session && this.run?.kind === 'story') this.profile.syncFromSim(this.session.sim);
  }

  saveNow(milestone = false): void {
    const ok = this.saves.save(this.profile.data, milestone);
    if (!ok && this.saves.lastError) console.warn('save failed', this.saves.lastError);
  }

  exportSave(): string {
    return this.saves.exportString(this.profile.data);
  }

  importSave(s: string): boolean {
    const d = this.saves.importString(s);
    if (!d) return false;
    this.profile.data = d;
    this.saveNow(true);
    this.refreshLook();
    return true;
  }

  // ------------------------------------------------------------------ online / store

  online(): boolean {
    return this.net.configured && this.net.reachable;
  }

  accountInfo() {
    const a = this.net.account;
    return { signedIn: !!a, name: a?.name ?? '', friendCode: a?.friendCode ?? '', lastSync: this.net.lastSync, error: this.net.lastError };
  }

  async signIn(): Promise<void> {
    if (!this.net.configured) {
      this.ui.message('err.network');
      return;
    }
    let platform: 'guest' | 'steam' | 'google' = 'guest';
    let proof: string | null = null;
    let name = 'Climber';
    if (this.platform.steam) {
      platform = 'steam';
      proof = await this.platform.steam.authTicket().catch(() => null);
      name = await this.platform.steam.playerName().catch(() => name);
    }
    const ok = await this.net.signIn(platform, proof, this.profile.data.profileId, name);
    if (!ok) this.ui.message('settings.cloud.status.err');
    else {
      await this.syncCloud();
      await this.flushOutbox();
      await this.restorePurchases();
    }
  }

  signOut(): void {
    this.net.signOut();
  }

  async syncCloud(): Promise<void> {
    if (!this.net.account) return;
    const remote = await this.net.pullSave();
    const localProgress = SaveManager.progress(this.profile.data);
    if (remote) {
      let parsed: SaveData | null = null;
      try {
        parsed = migrate(JSON.parse(remote.data) as Record<string, unknown>);
        if (!validate(parsed)) parsed = null;
      } catch {
        parsed = null;
      }
      if (parsed) {
        const remoteProgress = SaveManager.progress(parsed);
        const diverged = parsed.profileId !== this.profile.data.profileId;
        if (diverged && remoteProgress > localProgress) {
          const choice = parsed;
          await new Promise<void>((resolve) => {
            this.ui.dialog(t('save.conflict'), [
              { label: t('save.conflict.local', { progress: Math.round(localProgress) }), action: () => resolve() },
              {
                label: t('save.conflict.cloud', { progress: Math.round(remoteProgress) }),
                primary: true,
                action: () => {
                  this.profile.data = choice;
                  this.saveNow(true);
                  resolve();
                },
              },
            ]);
          });
        } else if (!diverged && remote.updatedAt > this.profile.data.updatedAt && remoteProgress >= localProgress) {
          this.profile.data = parsed;
          this.saveNow(true);
        }
      }
    }
    await this.net.pushSave(JSON.stringify(this.profile.data), SaveManager.progress(this.profile.data), this.profile.data.updatedAt);
  }

  async addFriend(code: string): Promise<boolean> {
    return this.net.addFriend(code);
  }

  storePlatform() {
    return this.store.platform;
  }
  storeReady(): boolean {
    return this.store.ready;
  }
  storeProducts() {
    return this.store.products();
  }
  pendingPurchases(): string[] {
    return this.store.pending();
  }

  async purchase(sku: string) {
    const r = await this.store.purchase(sku);
    if (r.status === 'success') {
      this.profile.grantPurchase(r.grants);
      this.saveNow(true);
      this.refreshLook();
    }
    return r;
  }

  async restorePurchases(): Promise<number> {
    const ids = await this.store.restore();
    this.profile.setOwnedFromServer([...new Set([...this.profile.data.owned, ...ids])]);
    this.saveNow();
    return ids.length;
  }

  leaderboard(kind: 'daily' | 'weekly' | 'trial' | 'speedrun', id: string, scope: 'global' | 'friends'): Promise<LeaderboardEntry[] | null> {
    return this.net.leaderboard(kind, id, scope);
  }

  // ------------------------------------------------------------------ misc UIContext

  get canQuit(): boolean {
    return this.platform.canQuit;
  }
  get platformName(): string {
    return this.platform.name;
  }

  playUi(sound: 'move' | 'select' | 'back' | 'error' | 'unlock'): void {
    this.audio.ui(sound);
  }

  startTouchEditor(): void {
    this.ui.closeAll();
    this.touch.startEditing(() => {
      this.touch.setVisible(false);
      this.ui.replace('main');
      this.ui.push('settings');
    });
  }

  private onAchievement(id: string): void {
    this.hud.toast(t('ach.unlocked'), t('ach.' + id), 'gold');
    this.audio.achievement();
    const def = ACHIEVEMENTS.find((a) => a.id === id);
    if (def) this.platform.achievement(def.steam);
    this.saveNow();
  }

  /**
   * Development builds only (stripped from production by Vite): `?dev=x,y,z,yaw[,pitch]&flags=a,b`
   * drops straight into the world for screenshots and automated visual checks.
   */
  private devStart(): void {
    const q = new URLSearchParams(location.search);
    const dev = q.get('dev');
    if (!dev) return;
    const [x, y, z, yaw, pitch] = dev.split(',').map(Number);
    this.run = { kind: 'nofall', region: 0, countdown: 0, finished: false, started: true, failed: true };
    this.makeSession({
      mode: 'story',
      abilities: ALL_ABILITIES,
      flags: (q.get('flags') ?? '').split(',').filter(Boolean),
      collected: [],
      litAnchors: [],
      lastAnchor: null,
      spawn: { pos: { x, y, z }, yaw: yaw || 0 },
      recallAnywhere: false,
      ngPlus: false,
    });
    if (!isNaN(pitch)) this.rig.pitch = pitch;
    this.hud.setVisible(q.get('hud') !== '0');
  }

  /** Debug-free accessor used by automated tests (Playwright) to inspect state. */
  inspect(): { state: State; tick: number; y: number; region: number } {
    return { state: this.state, tick: this.session?.sim.tick ?? 0, y: this.session?.sim.player.y ?? 0, region: this.session?.sim.region ?? 0 };
  }

  get data(): SaveData {
    return this.profile.data;
  }
}
