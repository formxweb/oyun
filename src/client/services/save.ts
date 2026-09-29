import { DEFAULT_EQUIP, type Slot } from '../../core/catalog/cosmetics';
import { BASE_ABILITIES } from '../../core/world/types';
import { checksum, type KV } from './storage';

export const SAVE_VERSION = 2;

export type Difficulty = 'guided' | 'standard';

export interface JourneyStats {
  majorFalls: number;
  fallDistance: number;
  climbed: number;
  jumps: number;
  wallRuns: number;
  maxY: number;
  maxFall: number;
  longestChain: number;
  respawns: number;
  lightningHits: number;
}

export interface Journey {
  ngPlus: boolean;
  difficulty: Difficulty;
  abilities: number;
  flags: string[];
  collected: string[];
  lit: string[];
  lastAnchor: string | null;
  playTime: number;
  stats: JourneyStats;
  regionMax: number;
  /** falls per region index, for No Way Down */
  regionFalls: number[];
  startedAt: number;
  speedrun: boolean;
  /** in-game timer (ticks) for speedrun / journey time */
  ticks: number;
  splits: number[];
  finished: boolean;
}

export interface TrialRecord {
  bestTime: number;
  bestFalls: number;
  bestScore: number;
  medal: 'none' | 'bronze' | 'silver' | 'gold' | 'perfect';
  attempts: number;
  /** replay keys stored in the ghost store */
  pbGhost: string | null;
  lastGhost: string | null;
  masterDone: boolean;
}

export interface SaveData {
  version: number;
  profileId: string;
  createdAt: number;
  updatedAt: number;
  journey: Journey | null;
  journeysCompleted: number;
  ngPlusCompleted: number;
  /** highest region index ever reached (unlocks trials) */
  regionsReached: number;
  everCollected: string[];
  lettersRead: string[];
  achievements: Record<string, number>;
  achievementProgress: Record<string, number>;
  lifetime: { playTime: number; climbed: number; fallen: number; majorFalls: number; jumps: number; wallRuns: number; maxY: number; maxFall: number; longestChain: number };
  trials: Record<string, TrialRecord>;
  daily: Record<string, { bestScore: number; bestTime: number; attempts: number; submitted: boolean }>;
  speedrunBest: number | null;
  owned: string[];
  equipped: Record<Slot, string>;
  seen: string[];
  /** pending server submissions (offline queue) */
  outbox: { kind: string; payload: unknown; tries: number }[];
  thirtyFirstLetter: string | null;
}

export function newStats(): JourneyStats {
  return { majorFalls: 0, fallDistance: 0, climbed: 0, jumps: 0, wallRuns: 0, maxY: 0, maxFall: 0, longestChain: 0, respawns: 0, lightningHits: 0 };
}

export function newJourney(difficulty: Difficulty, ngPlus: boolean, speedrun = false, abilities = BASE_ABILITIES): Journey {
  return {
    ngPlus,
    difficulty,
    abilities,
    flags: [],
    collected: [],
    lit: [],
    lastAnchor: null,
    playTime: 0,
    stats: newStats(),
    regionMax: 0,
    regionFalls: new Array(10).fill(0),
    startedAt: Date.now(),
    speedrun,
    ticks: 0,
    splits: [],
    finished: false,
  };
}

function uuid(): string {
  const c = globalThis.crypto;
  if (c && 'randomUUID' in c) return c.randomUUID();
  return 'p-' + Math.random().toString(36).slice(2) + Date.now().toString(36);
}

export function newSave(): SaveData {
  const now = Date.now();
  return {
    version: SAVE_VERSION,
    profileId: uuid(),
    createdAt: now,
    updatedAt: now,
    journey: null,
    journeysCompleted: 0,
    ngPlusCompleted: 0,
    regionsReached: 0,
    everCollected: [],
    lettersRead: [],
    achievements: {},
    achievementProgress: {},
    lifetime: { playTime: 0, climbed: 0, fallen: 0, majorFalls: 0, jumps: 0, wallRuns: 0, maxY: 0, maxFall: 0, longestChain: 0 },
    trials: {},
    daily: {},
    speedrunBest: null,
    owned: [],
    equipped: { ...DEFAULT_EQUIP },
    seen: [],
    outbox: [],
    thirtyFirstLetter: null,
  };
}

/** Upgrade older save structures in place. Never throws away fields it does not know. */
export function migrate(d: Record<string, unknown>): SaveData {
  const base = newSave();
  const out = { ...base, ...(d as Partial<SaveData>) } as SaveData;
  const v = typeof d.version === 'number' ? d.version : 1;
  if (v < 2) {
    // v1 stored equipped cosmetics as an array and had no outbox.
    if (Array.isArray((d as { equipped?: unknown }).equipped)) out.equipped = { ...DEFAULT_EQUIP };
    out.outbox = [];
  }
  out.equipped = { ...DEFAULT_EQUIP, ...(out.equipped ?? {}) };
  out.lifetime = { ...base.lifetime, ...(out.lifetime ?? {}) };
  if (out.journey) {
    out.journey = { ...newJourney(out.journey.difficulty ?? 'standard', !!out.journey.ngPlus), ...out.journey };
    out.journey.stats = { ...newStats(), ...(out.journey.stats ?? {}) };
    if (!Array.isArray(out.journey.regionFalls) || out.journey.regionFalls.length < 10) out.journey.regionFalls = new Array(10).fill(0);
  }
  out.version = SAVE_VERSION;
  return out;
}

/** Structural validation: catches saves that parse but are nonsense. */
export function validate(d: SaveData): boolean {
  if (typeof d !== 'object' || d === null) return false;
  if (typeof d.profileId !== 'string' || !d.profileId) return false;
  if (!Array.isArray(d.everCollected) || !Array.isArray(d.owned)) return false;
  if (typeof d.achievements !== 'object' || typeof d.trials !== 'object') return false;
  if (d.journey) {
    const j = d.journey;
    if (!Array.isArray(j.flags) || !Array.isArray(j.collected) || !Array.isArray(j.lit)) return false;
    if (typeof j.abilities !== 'number' || !isFinite(j.abilities)) return false;
  }
  return true;
}

export interface LoadResult {
  data: SaveData;
  source: 'main' | 'backup' | 'fresh';
  corrupt: boolean;
}

const MAIN = 'vertigo.save';
const BAK = 'vertigo.save.bak.';
const CORRUPT = 'vertigo.save.corrupt.';
const BACKUPS = 3;

/**
 * Local save manager. Saves carry a checksum; a rolling set of backups is kept; a save that
 * fails to load is never deleted — it is moved aside so it can be recovered.
 */
export class SaveManager {
  private lastBackup = 0;
  lastError: string | null = null;

  constructor(private readonly kv: KV) {}

  private encode(d: SaveData): string {
    const json = JSON.stringify(d);
    return JSON.stringify({ v: SAVE_VERSION, sum: checksum(json), data: json });
  }

  private decode(raw: string | null): SaveData | null {
    if (!raw) return null;
    try {
      const env = JSON.parse(raw) as { v: number; sum: string; data: string };
      if (typeof env.data !== 'string' || checksum(env.data) !== env.sum) return null;
      const d = migrate(JSON.parse(env.data) as Record<string, unknown>);
      return validate(d) ? d : null;
    } catch {
      return null;
    }
  }

  load(): LoadResult {
    const raw = this.kv.get(MAIN);
    const main = this.decode(raw);
    if (main) return { data: main, source: 'main', corrupt: false };
    const hadMain = raw !== null;
    if (hadMain) this.quarantine(raw!);
    for (let i = 0; i < BACKUPS; i++) {
      const b = this.decode(this.kv.get(BAK + i));
      if (b) {
        this.write(b);
        return { data: b, source: 'backup', corrupt: hadMain };
      }
    }
    const fresh = newSave();
    return { data: fresh, source: 'fresh', corrupt: hadMain };
  }

  private quarantine(raw: string): void {
    try {
      this.kv.set(CORRUPT + Date.now(), raw);
      // keep only the three most recent quarantined files
      const ks = this.kv.keys(CORRUPT).sort();
      while (ks.length > 3) this.kv.remove(ks.shift()!);
    } catch {
      /* storage full: leave the damaged main in place rather than lose it */
    }
  }

  private write(d: SaveData): boolean {
    try {
      this.kv.set(MAIN, this.encode(d));
      this.lastError = null;
      return true;
    } catch (e) {
      this.lastError = (e as Error).name || 'error';
      return false;
    }
  }

  /** Persist. Rotates backups at most every five minutes or when forced (milestones). */
  save(d: SaveData, milestone = false): boolean {
    d.updatedAt = Date.now();
    const now = Date.now();
    if (milestone || now - this.lastBackup > 5 * 60 * 1000) {
      try {
        for (let i = BACKUPS - 1; i > 0; i--) {
          const prev = this.kv.get(BAK + (i - 1));
          if (prev) this.kv.set(BAK + i, prev);
        }
        const cur = this.kv.get(MAIN);
        if (cur && this.decode(cur)) this.kv.set(BAK + '0', cur);
        this.lastBackup = now;
      } catch {
        /* backups are best-effort */
      }
    }
    return this.write(d);
  }

  exportString(d: SaveData): string {
    return btoa(unescape(encodeURIComponent(this.encode(d))));
  }

  importString(s: string): SaveData | null {
    try {
      return this.decode(decodeURIComponent(escape(atob(s.trim()))));
    } catch {
      return null;
    }
  }

  /** Progress summary used for cloud conflict prompts. */
  static progress(d: SaveData): number {
    return d.everCollected.length * 10 + Object.keys(d.achievements).length * 20 + d.regionsReached * 100 + d.journeysCompleted * 1000 + (d.journey ? d.journey.playTime / 60 : 0);
  }
}
