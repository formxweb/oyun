import { closeSync, existsSync, fsyncSync, mkdirSync, openSync, readFileSync, renameSync, writeSync } from 'node:fs';
import { join } from 'node:path';

/**
 * Server state. Kept in memory and written to disk as one JSON snapshot (atomically: write a
 * temp file, fsync, rename; the previous snapshot is kept as a backup). This is enough for a
 * single-instance deployment; a larger deployment replaces this class with a database behind
 * the same shape — nothing else touches storage directly.
 */

export interface Player {
  id: string;
  name: string;
  friendCode: string;
  createdAt: number;
  steamId?: string;
  googleId?: string;
  friends: string[];
  banned?: boolean;
}

export interface Session {
  playerId: string;
  expires: number;
}

export interface CloudSave {
  data: string;
  progress: number;
  updatedAt: number;
  serverAt: number;
}

export interface SaveSlot extends CloudSave {
  /** earlier versions, newest first — a cloud save is never simply overwritten */
  history: CloudSave[];
}

export interface BoardEntry {
  playerId: string;
  /** seconds (trial, speedrun) or score (daily) */
  value: number;
  falls: number;
  replayId: string | null;
  at: number;
  /** held back from public boards until reviewed */
  hidden?: boolean;
}

export interface StoredReplay {
  id: string;
  playerId: string;
  track: string;
  data: string;
}

export type PurchaseState = 'pending' | 'granted' | 'revoked' | 'invalid';

export interface Purchase {
  /** Google purchase token or Steam order id */
  key: string;
  platform: 'google' | 'steam';
  playerId: string;
  sku: string;
  state: PurchaseState;
  orderId: string;
  createdAt: number;
  updatedAt: number;
}

export interface PendingSpeedrun {
  id: string;
  playerId: string;
  replayId: string;
  claimed: number;
  at: number;
}

export interface DbData {
  version: 1;
  players: Record<string, Player>;
  sessions: Record<string, Session>;
  saves: Record<string, SaveSlot>;
  /** board key -> playerId -> best entry */
  boards: Record<string, Record<string, BoardEntry>>;
  replays: Record<string, StoredReplay>;
  purchases: Record<string, Purchase>;
  speedrunQueue: PendingSpeedrun[];
  stats: Record<string, Record<string, number>>;
}

function empty(): DbData {
  return { version: 1, players: {}, sessions: {}, saves: {}, boards: {}, replays: {}, purchases: {}, speedrunQueue: [], stats: {} };
}

export class Db {
  data: DbData;
  private dirty = false;
  private timer: NodeJS.Timeout | null = null;

  /** @param dir directory for snapshots; null keeps everything in memory (tests) */
  constructor(private readonly dir: string | null) {
    this.data = this.load();
  }

  private file(name: string): string {
    return join(this.dir!, name);
  }

  private load(): DbData {
    if (!this.dir) return empty();
    mkdirSync(this.dir, { recursive: true });
    for (const name of ['state.json', 'state.backup.json']) {
      const f = this.file(name);
      if (!existsSync(f)) continue;
      try {
        const d = JSON.parse(readFileSync(f, 'utf8')) as DbData;
        if (d && d.version === 1 && d.players) return { ...empty(), ...d };
      } catch (e) {
        console.error(`[db] ${name} unreadable, trying the backup:`, (e as Error).message);
      }
    }
    return empty();
  }

  /** Mark changed; a snapshot follows within a second. */
  touch(): void {
    this.dirty = true;
    if (!this.dir || this.timer) return;
    this.timer = setTimeout(() => {
      this.timer = null;
      this.flush();
    }, 1000);
  }

  flush(): void {
    if (!this.dir || !this.dirty) return;
    this.dirty = false;
    const tmp = this.file('state.tmp.json');
    const json = JSON.stringify(this.data);
    const fd = openSync(tmp, 'w');
    try {
      writeSync(fd, json);
      fsyncSync(fd);
    } finally {
      closeSync(fd);
    }
    const main = this.file('state.json');
    if (existsSync(main)) renameSync(main, this.file('state.backup.json'));
    renameSync(tmp, main);
  }

  close(): void {
    if (this.timer) clearTimeout(this.timer);
    this.timer = null;
    this.flush();
  }
}
