import { Capacitor, registerPlugin } from '@capacitor/core';
import { LocalStorageKV, type KV } from '../services/storage';

/**
 * Platform abstraction. Platform-specific code lives behind this interface:
 *  - web:     plain browser build (itch.io / demo), mock store only in dev builds
 *  - android: Capacitor shell; native bridge `window.Capacitor` + VertigoBilling plugin
 *  - steam:   Electron shell; preload exposes `window.vertigoSteam`
 */
export type PlatformKind = 'web' | 'android' | 'steam';

export interface SteamBridge {
  available(): Promise<boolean>;
  playerName(): Promise<string>;
  authTicket(): Promise<string>;
  activateAchievement(apiName: string): Promise<void>;
  quit(): void;
  setFullscreen(on: boolean): void;
  onMicroTxnAuthorization(cb: (orderId: string, authorized: boolean) => void): void;
  language(): Promise<string>;
}

/**
 * Play Games Services v2 sign-in (platforms/android VertigoGamesPlugin). Returns a one-time
 * server auth code; only the backend can exchange it, with credentials the app never holds.
 */
export interface GamesPlugin {
  signIn(): Promise<{ serverAuthCode: string | null; displayName?: string }>;
  /** unlocks resource `achievement_<key>`; a no-op if the resource is not configured */
  unlock(o: { key: string }): Promise<void>;
}

export interface HapticsPlugin {
  impact(o: { style: 'LIGHT' | 'MEDIUM' | 'HEAVY' }): Promise<void>;
  vibrate(o: { duration: number }): Promise<void>;
}

export class Platform {
  readonly kind: PlatformKind;
  readonly kv: KV;
  readonly steam: SteamBridge | null;
  private readonly plugins = new Map<string, unknown>();

  constructor() {
    const w = window as unknown as { vertigoSteam?: SteamBridge };
    this.steam = w.vertigoSteam ?? null;
    this.kind = this.steam ? 'steam' : Capacitor.isNativePlatform() && Capacitor.getPlatform() === 'android' ? 'android' : 'web';
    this.kv = new LocalStorageKV();
  }

  get name(): string {
    return this.kind === 'steam' ? 'Steam' : this.kind === 'android' ? 'Android' : 'Web';
  }

  get canQuit(): boolean {
    return this.kind === 'steam';
  }

  quit(): void {
    if (this.steam) this.steam.quit();
  }

  /** A native Capacitor plugin (Android only), or null where it does not exist. */
  plugin<T>(name: string): T | null {
    if (this.kind !== 'android' || !Capacitor.isPluginAvailable(name)) return null;
    let p = this.plugins.get(name);
    if (!p) {
      p = registerPlugin<object>(name);
      this.plugins.set(name, p);
    }
    return p as T;
  }

  haptic(strength: 'light' | 'medium' | 'heavy'): void {
    const hp = this.plugin<HapticsPlugin>('Haptics');
    if (hp) {
      hp.impact({ style: strength === 'light' ? 'LIGHT' : strength === 'medium' ? 'MEDIUM' : 'HEAVY' }).catch(() => undefined);
      return;
    }
    if ('vibrate' in navigator) navigator.vibrate(strength === 'light' ? 8 : strength === 'medium' ? 18 : 35);
  }

  setFullscreen(on: boolean): void {
    if (this.steam) {
      this.steam.setFullscreen(on);
      return;
    }
    try {
      if (on && !document.fullscreenElement) document.documentElement.requestFullscreen?.().catch(() => undefined);
      if (!on && document.fullscreenElement) document.exitFullscreen?.().catch(() => undefined);
    } catch {
      /* not allowed without gesture */
    }
  }

  achievement(id: string, steamApiName: string): void {
    this.steam?.activateAchievement(steamApiName).catch(() => undefined);
    this.plugin<GamesPlugin>('VertigoGames')
      ?.unlock({ key: id })
      .catch(() => undefined);
  }

  /** Lock landscape on phones; the game is designed for landscape. */
  lockLandscape(): void {
    const o = screen.orientation as ScreenOrientation & { lock?: (o: string) => Promise<void> };
    o?.lock?.('landscape').catch(() => undefined);
  }
}
