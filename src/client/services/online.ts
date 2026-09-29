import type { LeaderboardEntry } from '../ui/context';
import { fmtTime, fmtNumber } from '../i18n/i18n';
import type { KV } from './storage';

/**
 * Backend client. Everything competitive or financial is decided by the server:
 * runs are submitted as input replays and re-simulated server-side; purchases are granted
 * only after the server verifies the platform receipt.
 *
 * Offline-first: when the server is unreachable, submissions wait in an outbox and
 * are retried; nothing the player earns locally depends on the connection.
 */
export interface Account {
  token: string;
  playerId: string;
  name: string;
  friendCode: string;
}

export interface SubmitResult {
  status: 'ok' | 'rejected' | 'pending';
  rank?: number;
  reason?: string;
}

const TOKEN_KEY = 'vertigo.account';

export class Online {
  account: Account | null = null;
  reachable = false;
  lastSync: number | null = null;
  lastError = false;
  private readonly base: string | null;

  constructor(
    private readonly kv: KV,
    base: string | null,
  ) {
    this.base = base ? base.replace(/\/$/, '') : null;
    try {
      const raw = kv.get(TOKEN_KEY);
      if (raw) this.account = JSON.parse(raw) as Account;
    } catch {
      this.account = null;
    }
  }

  get configured(): boolean {
    return this.base !== null;
  }

  private async req<T>(method: string, path: string, body?: unknown, timeoutMs = 8000): Promise<T> {
    if (!this.base) throw new Error('offline');
    const ctrl = new AbortController();
    const timer = setTimeout(() => ctrl.abort(), timeoutMs);
    try {
      const r = await fetch(this.base + path, {
        method,
        headers: {
          'Content-Type': 'application/json',
          ...(this.account ? { Authorization: 'Bearer ' + this.account.token } : {}),
        },
        body: body === undefined ? undefined : JSON.stringify(body),
        signal: ctrl.signal,
      });
      this.reachable = true;
      if (r.status === 401 && this.account) {
        this.account = null;
        this.kv.remove(TOKEN_KEY);
      }
      if (!r.ok) {
        const e = new Error('http ' + r.status) as Error & { status: number; body: unknown };
        e.status = r.status;
        e.body = await r.json().catch(() => null);
        throw e;
      }
      return (await r.json()) as T;
    } catch (e) {
      if ((e as Error).name === 'AbortError' || (e as Error).message === 'Failed to fetch' || (e as { status?: number }).status === undefined) this.reachable = false;
      throw e;
    } finally {
      clearTimeout(timer);
    }
  }

  async ping(): Promise<boolean> {
    try {
      await this.req('GET', '/v1/health', undefined, 3000);
      return true;
    } catch {
      return false;
    }
  }

  /** Guest accounts are created per device; platform identities upgrade them. */
  async signIn(platform: 'guest' | 'steam' | 'google', proof: string | null, profileId: string, name: string): Promise<boolean> {
    try {
      const a = await this.req<Account>('POST', '/v1/auth/login', { platform, proof, deviceId: profileId, name });
      this.account = a;
      this.kv.set(TOKEN_KEY, JSON.stringify(a));
      this.lastError = false;
      return true;
    } catch {
      this.lastError = true;
      return false;
    }
  }

  signOut(): void {
    this.account = null;
    this.kv.remove(TOKEN_KEY);
  }

  /**
   * Upload the save. The server refuses to replace a cloud save that has more progress unless
   * `force` is set (the player chose this device's save); even then it keeps the old version.
   */
  async pushSave(saveJson: string, progress: number, updatedAt: number, force = false): Promise<'ok' | 'conflict' | 'error'> {
    if (!this.account) return 'error';
    try {
      const r = await this.req<{ status: string }>('PUT', '/v1/save', { data: saveJson, progress, updatedAt, force });
      this.lastSync = Date.now();
      this.lastError = false;
      return r.status === 'conflict' ? 'conflict' : 'ok';
    } catch {
      this.lastError = true;
      return 'error';
    }
  }

  async pullSave(): Promise<{ data: string; progress: number; updatedAt: number } | null> {
    if (!this.account) return null;
    try {
      const r = await this.req<{ data: string | null; progress: number; updatedAt: number }>('GET', '/v1/save');
      this.lastSync = Date.now();
      return r.data ? { data: r.data, progress: r.progress, updatedAt: r.updatedAt } : null;
    } catch {
      this.lastError = true;
      return null;
    }
  }

  async submitRun(kind: 'trial' | 'daily' | 'speedrun', track: string, replay: string, claimedSeconds: number): Promise<SubmitResult> {
    if (!this.account) return { status: 'pending' };
    try {
      const r = await this.req<{ accepted: boolean; rank?: number; reason?: string }>('POST', '/v1/runs', { kind, track, replay, claimedSeconds }, 30000);
      return r.accepted ? { status: 'ok', rank: r.rank } : { status: 'rejected', reason: r.reason };
    } catch (e) {
      if ((e as { status?: number }).status === 400 || (e as { status?: number }).status === 422) return { status: 'rejected', reason: 'invalid' };
      return { status: 'pending' };
    }
  }

  async leaderboard(kind: string, id: string, scope: 'global' | 'friends'): Promise<LeaderboardEntry[] | null> {
    if (!this.base) return null;
    try {
      const r = await this.req<{ entries: { rank: number; name: string; value: number; playerId: string; replayId: string | null }[] }>('GET', `/v1/leaderboards/${encodeURIComponent(kind)}/${encodeURIComponent(id)}?scope=${scope}`);
      const time = kind === 'trial' || kind === 'speedrun';
      return r.entries.map((e) => ({
        rank: e.rank,
        name: e.name,
        value: e.value,
        valueText: time ? fmtTime(e.value) : fmtNumber(e.value),
        you: !!this.account && e.playerId === this.account.playerId,
        replayId: e.replayId,
        verified: true,
      }));
    } catch {
      return null;
    }
  }

  async replay(replayId: string): Promise<string | null> {
    try {
      const r = await this.req<{ replay: string }>('GET', '/v1/replays/' + encodeURIComponent(replayId));
      return r.replay;
    } catch {
      return null;
    }
  }

  async addFriend(code: string): Promise<boolean> {
    try {
      await this.req('POST', '/v1/friends', { code });
      return true;
    } catch {
      return false;
    }
  }

  async entitlements(): Promise<string[] | null> {
    if (!this.account) return null;
    try {
      const r = await this.req<{ cosmetics: string[] }>('GET', '/v1/entitlements');
      return r.cosmetics;
    } catch {
      return null;
    }
  }

  async verifyGooglePurchase(sku: string, purchaseToken: string, orderId: string): Promise<{ status: 'granted' | 'pending' | 'invalid'; cosmetics: string[] }> {
    return this.req('POST', '/v1/purchases/google/verify', { sku, purchaseToken, orderId }, 20000);
  }

  async steamInitTxn(sku: string, language: string): Promise<{ orderId: string }> {
    return this.req('POST', '/v1/purchases/steam/init', { sku, language }, 20000);
  }

  async steamFinalize(orderId: string): Promise<{ status: 'granted' | 'pending' | 'invalid'; cosmetics: string[] }> {
    return this.req('POST', '/v1/purchases/steam/finalize', { orderId }, 20000);
  }

  async statsPush(stats: Record<string, number>): Promise<void> {
    if (!this.account) return;
    await this.req('POST', '/v1/stats', stats).catch(() => undefined);
  }
}
