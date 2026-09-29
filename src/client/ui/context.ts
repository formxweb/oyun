import type { DailyRoute } from '../../core/daily';
import type { World } from '../../core/world/world';
import type { StoreProduct, PurchaseResult, StorePlatform } from '../platform/store/IStoreService';
import type { Profile } from '../services/profile';
import type { Difficulty } from '../services/save';
import type { SettingsStore } from '../services/settings';

export type GhostChoice = 'none' | 'pb' | 'last' | 'top' | 'friend';

export interface LeaderboardEntry {
  rank: number;
  name: string;
  value: number;
  valueText: string;
  you: boolean;
  replayId: string | null;
  verified: boolean;
}

export interface TrialResultView {
  trialId: string | null;
  title: string;
  seconds: number;
  falls: number;
  maxMult: number;
  efficiency: number;
  score: number;
  medal: string;
  pb: boolean;
  route: 'safe' | 'risk' | 'master';
  submit: 'ok' | 'pending' | 'rejected' | 'none';
  splits: number[];
  daily: boolean;
}

/** Everything the menu screens can ask of the application. */
export interface UIContext {
  readonly world: World;
  readonly profile: Profile;
  readonly settings: SettingsStore;
  readonly isTouch: boolean;
  readonly canQuit: boolean;
  readonly platformName: string;

  journeySummary(): { region: number; time: number } | null;
  continueJourney(): void;
  startJourney(d: Difficulty, ngPlus: boolean, speedrun?: boolean): void;
  startTrial(id: string, ghost: GhostChoice): void;
  startDaily(): void;
  startNoFall(region: number): void;
  resume(): void;
  recall(): boolean;
  canRecall(): boolean;
  restartRun(): void;
  quitToMenu(): void;
  quitGame(): void;
  applySettings(): void;
  saveNow(): void;

  daily(): DailyRoute | null;
  dailyUnlocked(): boolean;

  storePlatform(): StorePlatform;
  storeReady(): boolean;
  storeProducts(): Promise<StoreProduct[]>;
  purchase(sku: string): Promise<PurchaseResult>;
  restorePurchases(): Promise<number>;
  pendingPurchases(): string[];

  online(): boolean;
  leaderboard(kind: 'daily' | 'weekly' | 'trial' | 'speedrun', id: string, scope: 'global' | 'friends'): Promise<LeaderboardEntry[] | null>;
  raceReplay(replayId: string, trialId: string): void;
  accountInfo(): { signedIn: boolean; name: string; friendCode: string; lastSync: number | null; error: boolean };
  signIn(): Promise<void>;
  signOut(): void;
  syncCloud(): Promise<void>;
  addFriend(code: string): Promise<boolean>;
  exportSave(): string;
  importSave(s: string): boolean;

  previewLook(slotItem: string | null): void;
  playUi(sound: 'move' | 'select' | 'back' | 'error' | 'unlock'): void;
  startTouchEditor(): void;
}
