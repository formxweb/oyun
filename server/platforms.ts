import { createSign } from 'node:crypto';
import { readFileSync } from 'node:fs';

/**
 * Platform services the backend talks to. Every credential comes from the server environment;
 * none of it ever reaches the game client.
 *
 * The interfaces exist so tests can substitute fakes; production always uses the real clients.
 */

// ---------------------------------------------------------------- Steam

export interface SteamUser {
  steamId: string;
  banned: boolean;
}

export interface SteamTxnItem {
  itemId: number;
  amount: number;
  description: string;
}

export interface SteamApi {
  /** ISteamUserAuth/AuthenticateUserTicket: the ticket proves which Steam account is playing. */
  authenticate(ticketHex: string): Promise<SteamUser | null>;
  /** ISteamMicroTxn/GetUserInfo: the currency and state of the user's wallet. */
  userInfo(steamId: string): Promise<{ currency: string; country: string } | null>;
  initTxn(orderId: string, steamId: string, language: string, currency: string, item: SteamTxnItem): Promise<{ ok: boolean; error?: string }>;
  finalizeTxn(orderId: string): Promise<{ ok: boolean; error?: string }>;
  /** ISteamMicroTxn/QueryTxn: Init, Approved, Succeeded, Failed, Refunded, Chargedback... */
  queryTxn(orderId: string): Promise<string | null>;
  /** ISteamMicroTxn/GetReport: order ids whose status changed since `since` (unix seconds). */
  report(since: number): Promise<{ orderId: string; status: string }[]>;
}

export interface SteamConfig {
  apiKey: string;
  appId: string;
  /** use ISteamMicroTxnSandbox (no money moves) */
  sandbox: boolean;
  /** identity string the client passed to GetAuthTicketForWebApi */
  identity: string;
}

const STEAM = 'https://partner.steam-api.com';

export class SteamWebApi implements SteamApi {
  constructor(private readonly cfg: SteamConfig) {}

  private get txn(): string {
    return this.cfg.sandbox ? 'ISteamMicroTxnSandbox' : 'ISteamMicroTxn';
  }

  private async get(path: string, q: Record<string, string>): Promise<Record<string, unknown>> {
    const u = new URL(STEAM + path);
    for (const [k, v] of Object.entries({ key: this.cfg.apiKey, appid: this.cfg.appId, ...q })) u.searchParams.set(k, v);
    const r = await fetch(u, { signal: AbortSignal.timeout(10_000) });
    if (!r.ok) throw new Error('steam http ' + r.status);
    return (await r.json()) as Record<string, unknown>;
  }

  private async post(path: string, form: Record<string, string>): Promise<Record<string, unknown>> {
    const body = new URLSearchParams({ key: this.cfg.apiKey, appid: this.cfg.appId, ...form });
    const r = await fetch(STEAM + path, { method: 'POST', body, signal: AbortSignal.timeout(10_000) });
    if (!r.ok) throw new Error('steam http ' + r.status);
    return (await r.json()) as Record<string, unknown>;
  }

  async authenticate(ticketHex: string): Promise<SteamUser | null> {
    const q: Record<string, string> = { ticket: ticketHex };
    if (this.cfg.identity) q.identity = this.cfg.identity;
    const j = await this.get('/ISteamUserAuth/AuthenticateUserTicket/v1/', q);
    const p = (j.response as { params?: { result: string; steamid: string; vacbanned: boolean; publisherbanned: boolean } })?.params;
    if (!p || p.result !== 'OK' || !/^\d{17}$/.test(p.steamid)) return null;
    return { steamId: p.steamid, banned: !!p.publisherbanned };
  }

  async userInfo(steamId: string): Promise<{ currency: string; country: string } | null> {
    const j = await this.get(`/${this.txn}/GetUserInfo/v2/`, { steamid: steamId });
    const r = j.response as { result: string; params?: { currency: string; country: string; state: string; status: string } };
    if (r?.result !== 'OK' || !r.params) return null;
    if (r.params.status === 'Locked') return null;
    return { currency: r.params.currency, country: r.params.country };
  }

  async initTxn(orderId: string, steamId: string, language: string, currency: string, item: SteamTxnItem): Promise<{ ok: boolean; error?: string }> {
    const j = await this.post(`/${this.txn}/InitTxn/v3/`, {
      orderid: orderId,
      steamid: steamId,
      itemcount: '1',
      language,
      currency,
      usersession: 'client',
      'itemid[0]': String(item.itemId),
      'qty[0]': '1',
      'amount[0]': String(item.amount),
      'description[0]': item.description,
    });
    const r = j.response as { result: string; error?: { errordesc: string } };
    return r?.result === 'OK' ? { ok: true } : { ok: false, error: r?.error?.errordesc ?? 'init failed' };
  }

  async finalizeTxn(orderId: string): Promise<{ ok: boolean; error?: string }> {
    const j = await this.post(`/${this.txn}/FinalizeTxn/v2/`, { orderid: orderId });
    const r = j.response as { result: string; error?: { errordesc: string } };
    return r?.result === 'OK' ? { ok: true } : { ok: false, error: r?.error?.errordesc ?? 'finalize failed' };
  }

  async queryTxn(orderId: string): Promise<string | null> {
    const j = await this.get(`/${this.txn}/QueryTxn/v3/`, { orderid: orderId });
    const r = j.response as { result: string; params?: { status: string } };
    return r?.result === 'OK' ? r.params?.status ?? null : null;
  }

  async report(since: number): Promise<{ orderId: string; status: string }[]> {
    const time = new Date(since * 1000).toISOString().replace(/\.\d+Z$/, 'Z');
    const j = await this.get(`/${this.txn}/GetReport/v5/`, { type: 'GAMESALES', time, maxresults: '1000' });
    const r = j.response as { result: string; params?: { orders?: { orderid: string; status: string }[] } };
    return (r?.params?.orders ?? []).map((o) => ({ orderId: String(o.orderid), status: o.status }));
  }
}

// ---------------------------------------------------------------- Google

export interface GoogleProductPurchase {
  /** 0 purchased, 1 cancelled, 2 pending */
  purchaseState: number;
  /** 0 not yet acknowledged, 1 acknowledged */
  acknowledgementState: number;
  orderId: string;
  obfuscatedExternalAccountId?: string;
}

export interface GoogleApi {
  /** Play Games Services v2: exchange a server auth code for the player's Games id. */
  playerFromAuthCode(code: string): Promise<{ playerId: string; name: string } | null>;
  getPurchase(sku: string, token: string): Promise<GoogleProductPurchase | null>;
  acknowledge(sku: string, token: string): Promise<void>;
  /** Voided purchases (refunds, chargebacks) since `sinceMs`. */
  voided(sinceMs: number): Promise<string[]>;
}

export interface GoogleConfig {
  packageName: string;
  /** service account JSON (contents or a path to the file) with Android Publisher access */
  serviceAccount: string;
  /** OAuth web client used by Play Games Services server-side access */
  oauthClientId: string;
  oauthClientSecret: string;
}

interface ServiceAccount {
  client_email: string;
  private_key: string;
}

const b64url = (b: Buffer | string) => Buffer.from(b).toString('base64').replace(/=+$/, '').replace(/\+/g, '-').replace(/\//g, '_');

export class GooglePlayApi implements GoogleApi {
  private token: { value: string; expires: number } | null = null;
  private readonly sa: ServiceAccount | null;

  constructor(private readonly cfg: GoogleConfig) {
    let raw = cfg.serviceAccount.trim();
    if (raw && !raw.startsWith('{')) raw = readFileSync(raw, 'utf8');
    this.sa = raw ? (JSON.parse(raw) as ServiceAccount) : null;
  }

  /** OAuth2 service-account flow: a JWT signed with the account's key buys an access token. */
  private async accessToken(): Promise<string> {
    if (this.token && this.token.expires > Date.now() + 60_000) return this.token.value;
    if (!this.sa) throw new Error('google service account not configured');
    const now = Math.floor(Date.now() / 1000);
    const head = b64url(JSON.stringify({ alg: 'RS256', typ: 'JWT' }));
    const claims = b64url(JSON.stringify({ iss: this.sa.client_email, scope: 'https://www.googleapis.com/auth/androidpublisher', aud: 'https://oauth2.googleapis.com/token', iat: now, exp: now + 3600 }));
    const sig = b64url(createSign('RSA-SHA256').update(`${head}.${claims}`).sign(this.sa.private_key));
    const r = await fetch('https://oauth2.googleapis.com/token', {
      method: 'POST',
      body: new URLSearchParams({ grant_type: 'urn:ietf:params:oauth:grant-type:jwt-bearer', assertion: `${head}.${claims}.${sig}` }),
      signal: AbortSignal.timeout(10_000),
    });
    if (!r.ok) throw new Error('google token http ' + r.status);
    const j = (await r.json()) as { access_token: string; expires_in: number };
    this.token = { value: j.access_token, expires: Date.now() + j.expires_in * 1000 };
    return j.access_token;
  }

  private base(): string {
    return `https://androidpublisher.googleapis.com/androidpublisher/v3/applications/${encodeURIComponent(this.cfg.packageName)}`;
  }

  async playerFromAuthCode(code: string): Promise<{ playerId: string; name: string } | null> {
    const r = await fetch('https://oauth2.googleapis.com/token', {
      method: 'POST',
      body: new URLSearchParams({ grant_type: 'authorization_code', code, client_id: this.cfg.oauthClientId, client_secret: this.cfg.oauthClientSecret, redirect_uri: '' }),
      signal: AbortSignal.timeout(10_000),
    });
    if (!r.ok) return null;
    const tok = (await r.json()) as { access_token?: string };
    if (!tok.access_token) return null;
    const me = await fetch('https://games.googleapis.com/games/v1/players/me', { headers: { Authorization: 'Bearer ' + tok.access_token }, signal: AbortSignal.timeout(10_000) });
    if (!me.ok) return null;
    const p = (await me.json()) as { playerId?: string; displayName?: string };
    return p.playerId ? { playerId: p.playerId, name: p.displayName ?? '' } : null;
  }

  async getPurchase(sku: string, token: string): Promise<GoogleProductPurchase | null> {
    const r = await fetch(`${this.base()}/purchases/products/${encodeURIComponent(sku)}/tokens/${encodeURIComponent(token)}`, {
      headers: { Authorization: 'Bearer ' + (await this.accessToken()) },
      signal: AbortSignal.timeout(10_000),
    });
    if (r.status === 404 || r.status === 400 || r.status === 410) return null;
    if (!r.ok) throw new Error('google purchase http ' + r.status);
    return (await r.json()) as GoogleProductPurchase;
  }

  async acknowledge(sku: string, token: string): Promise<void> {
    const r = await fetch(`${this.base()}/purchases/products/${encodeURIComponent(sku)}/tokens/${encodeURIComponent(token)}:acknowledge`, {
      method: 'POST',
      headers: { Authorization: 'Bearer ' + (await this.accessToken()), 'Content-Type': 'application/json' },
      body: '{}',
      signal: AbortSignal.timeout(10_000),
    });
    // 400 "already acknowledged" is fine
    if (!r.ok && r.status !== 400) throw new Error('google acknowledge http ' + r.status);
  }

  async voided(sinceMs: number): Promise<string[]> {
    const out: string[] = [];
    let page: string | undefined;
    for (let i = 0; i < 20; i++) {
      const u = new URL(`${this.base()}/purchases/voidedpurchases`);
      u.searchParams.set('startTime', String(Math.max(sinceMs, Date.now() - 29 * 86400_000)));
      if (page) u.searchParams.set('token', page);
      const r = await fetch(u, { headers: { Authorization: 'Bearer ' + (await this.accessToken()) }, signal: AbortSignal.timeout(10_000) });
      if (!r.ok) throw new Error('google voided http ' + r.status);
      const j = (await r.json()) as { voidedPurchases?: { purchaseToken: string }[]; tokenPagination?: { nextPageToken?: string } };
      for (const v of j.voidedPurchases ?? []) out.push(v.purchaseToken);
      page = j.tokenPagination?.nextPageToken;
      if (!page) break;
    }
    return out;
  }
}
