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
  steamId(): Promise<string>;
  authTicket(): Promise<string>;
  activateAchievement(apiName: string): Promise<void>;
  setStat(name: string, value: number): Promise<void>;
  overlayActive(): boolean;
  quit(): void;
  setFullscreen(on: boolean): void;
  friendsSteamIds(): Promise<string[]>;
  onMicroTxnAuthorization(cb: (orderId: string, authorized: boolean) => void): void;
  language(): Promise<string>;
}

interface CapacitorGlobal {
  isNativePlatform?: () => boolean;
  getPlatform?: () => string;
  Plugins?: Record<string, unknown>;
}

export interface HapticsPlugin {
  impact(o: { style: 'LIGHT' | 'MEDIUM' | 'HEAVY' }): Promise<void>;
  vibrate(o: { duration: number }): Promise<void>;
}

export class Platform {
  readonly kind: PlatformKind;
  readonly kv: KV;
  readonly steam: SteamBridge | null;
  private readonly cap: CapacitorGlobal | null;

  constructor() {
    const w = window as unknown as { vertigoSteam?: SteamBridge; Capacitor?: CapacitorGlobal };
    this.steam = w.vertigoSteam ?? null;
    this.cap = w.Capacitor && w.Capacitor.isNativePlatform?.() ? w.Capacitor : null;
    this.kind = this.steam ? 'steam' : this.cap && this.cap.getPlatform?.() === 'android' ? 'android' : 'web';
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

  plugin<T>(name: string): T | null {
    return (this.cap?.Plugins?.[name] as T) ?? null;
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

  achievement(steamApiName: string): void {
    this.steam?.activateAchievement(steamApiName).catch(() => undefined);
  }

  /** Lock landscape on phones; the game is designed for landscape. */
  lockLandscape(): void {
    const o = screen.orientation as ScreenOrientation & { lock?: (o: string) => Promise<void> };
    o?.lock?.('landscape').catch(() => undefined);
  }
}
