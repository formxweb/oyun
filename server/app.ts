import { createHash, randomBytes, randomInt, randomUUID } from 'node:crypto';
import { createServer, type Server } from 'node:http';
import { PRODUCT_BY_SKU } from '../src/core/catalog/store';
import { dailyRoute, dateKey, weekKey, type DailyRoute } from '../src/core/daily';
import { parseReplay, SIM_VERSION, SpeedrunCheck, verifyDaily, verifyReplay, worldHash, type Replay } from '../src/core/replay';
import { buildWorld } from '../src/core/world/index';
import { TRIAL_PAR } from '../src/core/world/par';
import type { World } from '../src/core/world/world';
import type { BoardEntry, Db, Player, Purchase } from './db';
import { HttpError, num, obj, RateLimiter, readBody, Router, send, str, type Req } from './http';
import type { GoogleApi, SteamApi } from './platforms';
import { steamAmount, steamLanguage, steamPrices } from './prices';

/**
 * VERTIGO backend: accounts, cloud saves, verified leaderboards, ghosts, purchases.
 *
 * Trust model: the client is never trusted with anything competitive or financial.
 *  - Runs arrive as input replays and are re-simulated here with the same deterministic core
 *    the game uses; the server's own result (time, falls, score) is what gets ranked.
 *  - Purchases are granted only after the platform (Google Play / Steam) confirms them to this
 *    server, and are idempotent on purchase token / order id. Refunds revoke.
 *  - Cloud saves are never overwritten without the previous version being kept.
 */

export interface ServerOptions {
  db: Db;
  steam: SteamApi | null;
  google: GoogleApi | null;
  corsOrigin?: string;
  tokenDays?: number;
  /** background jobs (purchase reconciliation, speedrun verification); off in some tests */
  jobs?: boolean;
  /** requests per minute: logins per IP, run submissions per player */
  limits?: { login?: number; runs?: number };
  log?: (...a: unknown[]) => void;
}

export interface GameServer {
  server: Server;
  world: World;
  /** process queued speedrun verifications now (tests) */
  drainSpeedruns(): Promise<void>;
  /** run purchase reconciliation and refund checks now (tests; normally on timers) */
  runJobs(): Promise<void>;
  close(): Promise<void>;
}

const MAX_TRIAL_FRAMES = 120 * 60 * 30;
const MAX_SPEEDRUN_FRAMES = 120 * 3600 * 8;
const BOARD_SIZE = 100;
const HISTORY = 10;
const FRIEND_ALPHABET = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';

export function createGameServer(opt: ServerOptions): GameServer {
  const db = opt.db;
  const D = db.data;
  const log = opt.log ?? ((...a: unknown[]) => console.log('[vertigo]', ...a));
  const cors = opt.corsOrigin ?? '*';
  const tokenMs = (opt.tokenDays ?? 90) * 86400_000;
  const world = buildWorld();
  const hash = worldHash(world);
  const dailyCache = new Map<string, DailyRoute>();
  const loginLimit = new RateLimiter(opt.limits?.login ?? 20);
  const runLimit = new RateLimiter(opt.limits?.runs ?? 30);
  const anyLimit = new RateLimiter(600);
  const router = new Router();
  const inFlight = new Set<string>();

  // ------------------------------------------------------------ accounts

  const tokenHash = (t: string) => createHash('sha256').update(t).digest('hex');

  function issue(p: Player): Record<string, string> {
    const token = randomBytes(32).toString('base64url');
    D.sessions[tokenHash(token)] = { playerId: p.id, expires: Date.now() + tokenMs };
    db.touch();
    return { token, playerId: p.id, name: p.name, friendCode: p.friendCode };
  }

  function bearer(req: Req): Player | null {
    const h = req.headers.authorization;
    if (!h || !h.startsWith('Bearer ')) return null;
    const s = D.sessions[tokenHash(h.slice(7).trim())];
    if (!s || s.expires < Date.now()) return null;
    return D.players[s.playerId] ?? null;
  }

  function auth(req: Req): Player {
    const p = bearer(req);
    if (!p) throw new HttpError(401, 'unauthorized');
    if (p.banned) throw new HttpError(403, 'banned');
    return p;
  }

  function friendCode(): string {
    for (;;) {
      let c = '';
      const b = randomBytes(8);
      for (let i = 0; i < 8; i++) c += FRIEND_ALPHABET[b[i] % FRIEND_ALPHABET.length];
      if (!Object.values(D.players).some((p) => p.friendCode === c)) return c;
    }
  }

  function cleanName(n: string, code: string): string {
    const s = n
      .normalize('NFC')
      .replace(/[\u0000-\u001f\u007f<>&"'`\\]/g, '')
      .replace(/\s+/g, ' ')
      .trim()
      .slice(0, 20);
    return s || 'Climber-' + code.slice(0, 4);
  }

  function newPlayer(name: string): Player {
    const code = friendCode();
    const p: Player = { id: randomUUID(), name: cleanName(name, code), friendCode: code, createdAt: Date.now(), friends: [] };
    D.players[p.id] = p;
    db.touch();
    return p;
  }

  router.on('POST', '/v1/auth/login', async (req) => {
    if (!loginLimit.allow('login:' + req.ip)) throw new HttpError(429, 'slow-down');
    const b = obj(req.body);
    const platform = str(b, 'platform', 16);
    const name = str(b, 'name', 64, true);
    const current = bearer(req);
    if (platform === 'guest') {
      // A guest is identified only by its token: a device id is never enough to take an account.
      const p = current ?? newPlayer(name);
      if (p.banned) throw new HttpError(403, 'banned');
      return issue(p);
    }
    const proof = str(b, 'proof', 4096);
    let identity: { key: 'steamId' | 'googleId'; id: string; name: string };
    if (platform === 'steam') {
      if (!opt.steam) throw new HttpError(503, 'steam-unavailable');
      if (!/^[0-9a-fA-F]+$/.test(proof)) throw new HttpError(400, 'bad-proof');
      const u = await opt.steam.authenticate(proof);
      if (!u) throw new HttpError(401, 'steam-auth');
      if (u.banned) throw new HttpError(403, 'banned');
      identity = { key: 'steamId', id: u.steamId, name };
    } else if (platform === 'google') {
      if (!opt.google) throw new HttpError(503, 'google-unavailable');
      const u = await opt.google.playerFromAuthCode(proof);
      if (!u) throw new HttpError(401, 'google-auth');
      identity = { key: 'googleId', id: u.playerId, name: name || u.name };
    } else throw new HttpError(400, 'bad-platform');
    let p = Object.values(D.players).find((x) => x[identity.key] === identity.id);
    if (!p && current && !current[identity.key]) {
      // upgrade the guest account this device already has
      p = current;
      p[identity.key] = identity.id;
    }
    if (!p) {
      p = newPlayer(identity.name);
      p[identity.key] = identity.id;
    }
    if (p.banned) throw new HttpError(403, 'banned');
    if (identity.name) p.name = cleanName(identity.name, p.friendCode);
    db.touch();
    return issue(p);
  });

  // ------------------------------------------------------------ cloud save

  router.on('GET', '/v1/save', (req) => {
    const p = auth(req);
    const s = D.saves[p.id];
    return s ? { data: s.data, progress: s.progress, updatedAt: s.updatedAt } : { data: null, progress: 0, updatedAt: 0 };
  });

  router.on('PUT', '/v1/save', (req) => {
    const p = auth(req);
    const b = obj(req.body);
    const data = str(b, 'data', 2_000_000);
    const progress = num(b, 'progress');
    const updatedAt = num(b, 'updatedAt');
    const force = b.force === true;
    try {
      const parsed = JSON.parse(data) as { profileId?: unknown };
      if (!parsed || typeof parsed !== 'object' || typeof parsed.profileId !== 'string') throw new Error();
    } catch {
      throw new HttpError(400, 'bad-save');
    }
    const cur = D.saves[p.id];
    // Refuse to replace a save with more progress by an older one unless the player chose to.
    if (cur && !force && cur.progress > progress + 1e-6 && cur.updatedAt > updatedAt) return { status: 'conflict' };
    const history = cur ? [{ data: cur.data, progress: cur.progress, updatedAt: cur.updatedAt, serverAt: cur.serverAt }, ...cur.history].slice(0, HISTORY) : [];
    D.saves[p.id] = { data, progress, updatedAt, serverAt: Date.now(), history };
    db.touch();
    return { status: 'ok' };
  });

  /** Earlier cloud versions, for recovering a save (newest first). */
  router.on('GET', '/v1/save/history', (req) => {
    const p = auth(req);
    const s = D.saves[p.id];
    return { versions: (s?.history ?? []).map((h, i) => ({ index: i, progress: h.progress, updatedAt: h.updatedAt, serverAt: h.serverAt })) };
  });

  router.on('POST', '/v1/save/restore', (req) => {
    const p = auth(req);
    const i = num(obj(req.body), 'index');
    const s = D.saves[p.id];
    const v = s?.history[i];
    if (!s || !v) throw new HttpError(404, 'no-version');
    const history = [{ data: s.data, progress: s.progress, updatedAt: s.updatedAt, serverAt: s.serverAt }, ...s.history.filter((_, k) => k !== i)].slice(0, HISTORY);
    D.saves[p.id] = { ...v, serverAt: Date.now(), history };
    db.touch();
    return { data: v.data, progress: v.progress, updatedAt: v.updatedAt };
  });

  // ------------------------------------------------------------ runs & leaderboards

  function daily(date: string): DailyRoute {
    let r = dailyCache.get(date);
    if (!r) {
      r = dailyRoute(world, date);
      dailyCache.set(date, r);
      if (dailyCache.size > 8) dailyCache.delete(dailyCache.keys().next().value!);
    }
    return r;
  }

  function storeReplay(p: Player, track: string, data: string): string {
    const id = randomBytes(12).toString('base64url');
    D.replays[id] = { id, playerId: p.id, track, data };
    return id;
  }

  /** Keep a player's best; `better(a, b)` says whether a beats b. Returns true when improved. */
  function record(board: string, e: BoardEntry, better: (a: BoardEntry, b: BoardEntry) => boolean): boolean {
    const b = (D.boards[board] ??= {});
    const prev = b[e.playerId];
    if (prev && !better(e, prev)) {
      if (e.replayId) delete D.replays[e.replayId];
      return false;
    }
    if (prev?.replayId) delete D.replays[prev.replayId];
    b[e.playerId] = e;
    db.touch();
    return true;
  }

  const fasterFirst = (a: BoardEntry, b: BoardEntry) => a.value < b.value - 1e-9 || (Math.abs(a.value - b.value) < 1e-9 && a.falls < b.falls);
  const higherFirst = (a: BoardEntry, b: BoardEntry) => a.value > b.value;

  function ranked(entries: BoardEntry[], asc: boolean): BoardEntry[] {
    return entries
      .filter((e) => !e.hidden && !D.players[e.playerId]?.banned)
      .sort((a, b) => (asc ? a.value - b.value || a.falls - b.falls : b.value - a.value) || a.at - b.at);
  }

  function rankOf(board: string, playerId: string, asc: boolean): number | undefined {
    const i = ranked(Object.values(D.boards[board] ?? {}), asc).findIndex((e) => e.playerId === playerId);
    return i >= 0 ? i + 1 : undefined;
  }

  function parse(replay: string, max: number): Replay {
    try {
      return parseReplay(replay, max);
    } catch {
      throw new HttpError(422, 'bad-replay');
    }
  }

  router.on('POST', '/v1/runs', (req) => {
    const p = auth(req);
    if (!runLimit.allow('run:' + p.id)) throw new HttpError(429, 'slow-down');
    const b = obj(req.body);
    const kind = str(b, 'kind', 16);
    const track = str(b, 'track', 64);
    const claimed = num(b, 'claimedSeconds', true);
    if (kind === 'speedrun') {
      const data = str(b, 'replay', 12_000_000);
      const r = parse(data, MAX_SPEEDRUN_FRAMES);
      const check = new SpeedrunCheck(world, r);
      if (check.result) return { accepted: false, reason: check.result.reason };
      if (D.speedrunQueue.filter((q) => q.playerId === p.id).length >= 3) throw new HttpError(429, 'queue-full');
      const replayId = storeReplay(p, 'speedrun', data);
      D.speedrunQueue.push({ id: randomUUID(), playerId: p.id, replayId, claimed, at: Date.now() });
      db.touch();
      kickSpeedruns();
      return { accepted: true, queued: true };
    }
    const data = str(b, 'replay', 1_000_000);
    const r = parse(data, MAX_TRIAL_FRAMES);
    if (kind === 'trial') {
      const trial = world.trials.find((t) => t.id === track);
      if (!trial) throw new HttpError(400, 'bad-track');
      const v = verifyReplay(world, r, trial);
      if (!v.ok) return { accepted: false, reason: v.reason };
      if (Math.abs(v.seconds - claimed) > 0.05) log('claimed time differs from verified', p.id, track, claimed, v.seconds);
      // Far faster than the reference run: kept, but held off the public board until reviewed.
      const par = TRIAL_PAR[trial.id];
      const hidden = !!par && v.seconds < par * 0.5;
      const board = 'trial:' + trial.id;
      record(board, { playerId: p.id, value: v.seconds, falls: v.falls, replayId: storeReplay(p, track, data), at: Date.now(), hidden }, fasterFirst);
      return { accepted: true, rank: rankOf(board, p.id, true), seconds: v.seconds, score: v.score, medal: v.medal };
    }
    if (kind === 'daily') {
      const m = /^daily:(\d{4}-\d{2}-\d{2})$/.exec(track);
      if (!m) throw new HttpError(400, 'bad-track');
      const date = m[1];
      const today = dateKey(new Date());
      const yesterday = dateKey(new Date(Date.now() - 86400_000));
      if (date !== today && date !== yesterday) return { accepted: false, reason: 'closed' };
      const v = verifyDaily(world, r, daily(date));
      if (!v.ok) return { accepted: false, reason: v.reason };
      const board = 'daily:' + date;
      record(board, { playerId: p.id, value: v.score, falls: v.falls, replayId: storeReplay(p, track, data), at: Date.now() }, higherFirst);
      return { accepted: true, rank: rankOf(board, p.id, false), seconds: v.seconds, score: v.score };
    }
    throw new HttpError(400, 'bad-kind');
  });

  router.on('GET', '/v1/leaderboards/:kind/:id', (req) => {
    if (!anyLimit.allow('lb:' + req.ip)) throw new HttpError(429, 'slow-down');
    const { kind, id } = req.params;
    const scope = req.query.get('scope') === 'friends' ? 'friends' : 'global';
    const me = bearer(req);
    let entries: BoardEntry[];
    let asc = true;
    if (kind === 'trial') entries = Object.values(D.boards['trial:' + id] ?? {});
    else if (kind === 'speedrun') entries = Object.values(D.boards['speedrun:any'] ?? {});
    else if (kind === 'daily') {
      entries = Object.values(D.boards['daily:' + id] ?? {});
      asc = false;
    } else if (kind === 'weekly') {
      // the week's score is the sum of a player's best Daily Summit scores that week
      const sum = new Map<string, BoardEntry>();
      for (const [key, board] of Object.entries(D.boards)) {
        if (!key.startsWith('daily:') || weekKey(new Date(key.slice(6) + 'T12:00:00Z')) !== id) continue;
        for (const e of Object.values(board)) {
          if (e.hidden) continue;
          const s = sum.get(e.playerId) ?? { playerId: e.playerId, value: 0, falls: 0, replayId: null, at: 0 };
          s.value += e.value;
          s.at = Math.max(s.at, e.at);
          sum.set(e.playerId, s);
        }
      }
      entries = [...sum.values()];
      asc = false;
    } else throw new HttpError(404, 'no-board');
    if (scope === 'friends') {
      if (!me) throw new HttpError(401, 'unauthorized');
      const circle = new Set([me.id, ...me.friends]);
      entries = entries.filter((e) => circle.has(e.playerId));
    }
    const list = ranked(entries, asc);
    const view = (e: BoardEntry, i: number) => ({ rank: i + 1, name: D.players[e.playerId]?.name ?? '?', value: e.value, playerId: e.playerId, replayId: e.replayId });
    const out = list.slice(0, BOARD_SIZE).map(view);
    if (me) {
      const i = list.findIndex((e) => e.playerId === me.id);
      if (i >= BOARD_SIZE) out.push(view(list[i], i));
    }
    return { entries: out };
  });

  router.on('GET', '/v1/replays/:id', (req) => {
    if (!anyLimit.allow('rp:' + req.ip)) throw new HttpError(429, 'slow-down');
    const r = D.replays[req.params.id];
    // only replays standing on a public board are served (ghost races)
    const board = r ? D.boards[r.track === 'speedrun' ? 'speedrun:any' : r.track.startsWith('daily:') ? r.track : 'trial:' + r.track]?.[r.playerId] : undefined;
    if (!r || !board || board.replayId !== r.id || board.hidden) throw new HttpError(404, 'no-replay');
    return { replay: r.data };
  });

  // ------------------------------------------------------------ speedrun verification queue

  let speedrunBusy: Promise<void> | null = null;

  function kickSpeedruns(): void {
    if (opt.jobs === false || speedrunBusy) return;
    speedrunBusy = processSpeedruns().finally(() => {
      speedrunBusy = null;
    });
  }

  async function processSpeedruns(): Promise<void> {
    while (D.speedrunQueue.length) {
      const q = D.speedrunQueue[0];
      const rep = D.replays[q.replayId];
      const p = D.players[q.playerId];
      if (rep && p) {
        const check = new SpeedrunCheck(world, parseReplay(rep.data, MAX_SPEEDRUN_FRAMES));
        let res = check.advance(20_000);
        while (!res) {
          // yield between slices so requests keep being served
          await new Promise((r) => setImmediate(r));
          res = check.advance(20_000);
        }
        if (res.ok) {
          const improved = record('speedrun:any', { playerId: p.id, value: res.seconds, falls: 0, replayId: rep.id, at: q.at }, fasterFirst);
          log('speedrun verified', p.id, res.seconds.toFixed(2), improved ? 'best' : '');
        } else {
          delete D.replays[rep.id];
          log('speedrun rejected', p.id, res.reason);
        }
      }
      D.speedrunQueue.shift();
      db.touch();
    }
  }

  // ------------------------------------------------------------ friends & stats

  router.on('POST', '/v1/friends', (req) => {
    const p = auth(req);
    const code = str(obj(req.body), 'code', 16).trim().toUpperCase();
    const f = Object.values(D.players).find((x) => x.friendCode === code);
    if (!f || f.id === p.id) throw new HttpError(404, 'no-player');
    if (p.friends.length >= 500) throw new HttpError(409, 'too-many');
    if (!p.friends.includes(f.id)) p.friends.push(f.id);
    if (!f.friends.includes(p.id) && f.friends.length < 500) f.friends.push(p.id);
    db.touch();
    return { ok: true, name: f.name };
  });

  const STAT_MAX: Record<string, number> = { playTime: 1e8, climbed: 1e8, fallen: 1e8, majorFalls: 1e7, jumps: 1e8, wallRuns: 1e7, maxY: 5000, maxFall: 5000, longestChain: 1e5 };

  router.on('POST', '/v1/stats', (req) => {
    const p = auth(req);
    const b = obj(req.body);
    const s = (D.stats[p.id] ??= {});
    for (const [k, max] of Object.entries(STAT_MAX)) {
      const v = b[k];
      if (typeof v !== 'number' || !isFinite(v) || v < 0) continue;
      // lifetime stats only grow; never trusted for anything competitive
      s[k] = Math.max(s[k] ?? 0, Math.min(v, max));
    }
    db.touch();
    return { ok: true };
  });

  router.on('GET', '/v1/stats/global', () => {
    const tot: Record<string, number> = { players: Object.keys(D.players).length };
    for (const s of Object.values(D.stats)) for (const k of ['climbed', 'fallen', 'majorFalls', 'jumps']) tot[k] = (tot[k] ?? 0) + (s[k] ?? 0);
    return tot;
  });

  // ------------------------------------------------------------ purchases & entitlements

  function owned(playerId: string): string[] {
    const out = new Set<string>();
    for (const pu of Object.values(D.purchases)) if (pu.playerId === playerId && pu.state === 'granted') for (const g of PRODUCT_BY_SKU.get(pu.sku)?.grants ?? []) out.add(g);
    return [...out].sort();
  }

  function putPurchase(pu: Purchase): void {
    D.purchases[pu.platform + ':' + pu.key] = pu;
    db.touch();
  }

  router.on('GET', '/v1/entitlements', (req) => ({ cosmetics: owned(auth(req).id) }));

  router.on('POST', '/v1/purchases/google/verify', async (req) => {
    const p = auth(req);
    if (!opt.google) throw new HttpError(503, 'google-unavailable');
    const b = obj(req.body);
    const sku = str(b, 'sku', 128);
    const token = str(b, 'purchaseToken', 2048);
    if (!PRODUCT_BY_SKU.has(sku)) throw new HttpError(400, 'bad-sku');
    const key = 'google:' + token;
    if (inFlight.has(key)) return { status: 'pending', cosmetics: owned(p.id) };
    inFlight.add(key);
    try {
      const prev = D.purchases[key];
      if (prev?.state === 'revoked') return { status: 'invalid', cosmetics: owned(p.id) };
      const gp = await opt.google.getPurchase(sku, token);
      const now = Date.now();
      const base = { key: token, platform: 'google' as const, playerId: p.id, sku, orderId: gp?.orderId ?? '', createdAt: prev?.createdAt ?? now, updatedAt: now };
      if (!gp || gp.purchaseState === 1) {
        if (!prev) putPurchase({ ...base, state: 'invalid' });
        return { status: 'invalid', cosmetics: owned(p.id) };
      }
      if (gp.purchaseState === 2) {
        putPurchase({ ...base, state: 'pending' });
        return { status: 'pending', cosmetics: owned(p.id) };
      }
      // Paid. Acknowledge before granting: an unacknowledged purchase is refunded by Play, so
      // the player is never charged for something they did not receive.
      if (gp.acknowledgementState !== 1) await opt.google.acknowledge(sku, token);
      // The purchase belongs to whichever of our accounts the Play account is signed into now
      // (reinstall, new device): the entitlement moves with it rather than being duplicated.
      if (prev && prev.playerId !== p.id) log('google purchase moved', prev.playerId, '->', p.id, sku);
      putPurchase({ ...base, state: 'granted' });
      return { status: 'granted', cosmetics: owned(p.id) };
    } finally {
      inFlight.delete(key);
    }
  });

  router.on('GET', '/v1/store/prices', async (req) => {
    if (req.query.get('platform') !== 'steam') return {};
    const p = bearer(req);
    if (!p?.steamId || !opt.steam) return {};
    const info = await opt.steam.userInfo(p.steamId).catch(() => null);
    return info ? steamPrices(info.currency) : {};
  });

  router.on('POST', '/v1/purchases/steam/init', async (req) => {
    const p = auth(req);
    if (!opt.steam) throw new HttpError(503, 'steam-unavailable');
    if (!p.steamId) throw new HttpError(403, 'steam-account');
    const b = obj(req.body);
    const sku = str(b, 'sku', 128);
    const prod = PRODUCT_BY_SKU.get(sku);
    if (!prod) throw new HttpError(400, 'bad-sku');
    const have = owned(p.id);
    if (prod.grants.every((g) => have.includes(g))) throw new HttpError(409, 'owned');
    const open = Object.values(D.purchases).filter((x) => x.platform === 'steam' && x.playerId === p.id && x.state === 'pending' && Date.now() - x.createdAt < 600_000);
    if (open.length >= 3) throw new HttpError(429, 'slow-down');
    const info = await opt.steam.userInfo(p.steamId);
    if (!info) throw new HttpError(409, 'wallet');
    const amount = steamAmount(sku, info.currency);
    if (amount === null) throw new HttpError(409, 'currency');
    // Unique per order (Steam wants a uint64). Kept below 2^53: the Steam client's authorization
    // callback can reach JavaScript as a plain number, which must round-trip exactly.
    let orderId = '';
    do orderId = String(randomInt(1, 2 ** 21) * 2 ** 32 + randomInt(0, 2 ** 32));
    while (D.purchases['steam:' + orderId]);
    const now = Date.now();
    putPurchase({ key: orderId, platform: 'steam', playerId: p.id, sku, state: 'pending', orderId, createdAt: now, updatedAt: now });
    const r = await opt.steam.initTxn(orderId, p.steamId, steamLanguage(str(b, 'language', 32, true)), info.currency, { itemId: prod.steamItemDef, amount, description: prod.sku });
    if (!r.ok) {
      putPurchase({ ...D.purchases['steam:' + orderId], state: 'invalid', updatedAt: Date.now() });
      throw new HttpError(502, 'steam-init');
    }
    return { orderId };
  });

  /** Finish a Steam order the user authorized. Idempotent; also used by the reconciliation job. */
  async function finalizeSteam(pu: Purchase): Promise<'granted' | 'pending' | 'invalid'> {
    if (pu.state === 'granted') return 'granted';
    if (pu.state !== 'pending' || !opt.steam) return 'invalid';
    const key = 'steam:' + pu.key;
    if (inFlight.has(key)) return 'pending';
    inFlight.add(key);
    try {
      const f = await opt.steam.finalizeTxn(pu.key);
      let status = f.ok ? 'Succeeded' : await opt.steam.queryTxn(pu.key);
      if (status === 'Approved') {
        const again = await opt.steam.finalizeTxn(pu.key);
        status = again.ok ? 'Succeeded' : status;
      }
      if (status === 'Succeeded') {
        putPurchase({ ...pu, state: 'granted', updatedAt: Date.now() });
        return 'granted';
      }
      if (status === 'Init' || status === 'Approved' || status === null) return 'pending';
      putPurchase({ ...pu, state: 'invalid', updatedAt: Date.now() });
      return 'invalid';
    } finally {
      inFlight.delete(key);
    }
  }

  router.on('POST', '/v1/purchases/steam/finalize', async (req) => {
    const p = auth(req);
    const orderId = str(obj(req.body), 'orderId', 32);
    const pu = D.purchases['steam:' + orderId];
    if (!pu || pu.playerId !== p.id) throw new HttpError(404, 'no-order');
    const status = await finalizeSteam(pu);
    return { status, cosmetics: owned(p.id) };
  });

  // ------------------------------------------------------------ reconciliation jobs

  let lastRefundCheck = Date.now() - 86400_000;

  async function reconcile(): Promise<void> {
    // Steam orders the client authorized but never finalized (closed the game, lost connection)
    for (const pu of Object.values(D.purchases)) {
      if (pu.platform !== 'steam' || pu.state !== 'pending' || Date.now() - pu.createdAt < 30_000) continue;
      if (Date.now() - pu.createdAt > 86400_000) {
        putPurchase({ ...pu, state: 'invalid', updatedAt: Date.now() });
        continue;
      }
      await finalizeSteam(pu).catch((e) => log('steam reconcile', (e as Error).message));
    }
  }

  async function refunds(): Promise<void> {
    const since = lastRefundCheck;
    lastRefundCheck = Date.now();
    if (opt.google) {
      const voided = await opt.google.voided(since).catch((e) => {
        log('google voided', (e as Error).message);
        return [] as string[];
      });
      for (const token of voided) {
        const pu = D.purchases['google:' + token];
        if (pu && pu.state !== 'revoked') putPurchase({ ...pu, state: 'revoked', updatedAt: Date.now() });
      }
    }
    if (opt.steam) {
      const orders = await opt.steam.report(Math.floor(since / 1000)).catch((e) => {
        log('steam report', (e as Error).message);
        return [] as { orderId: string; status: string }[];
      });
      for (const o of orders) {
        const pu = D.purchases['steam:' + o.orderId];
        if (pu && (o.status === 'Refunded' || o.status === 'Chargedback' || o.status === 'PartialRefund') && pu.state !== 'revoked') putPurchase({ ...pu, state: 'revoked', updatedAt: Date.now() });
      }
    }
  }

  function sweepSessions(): void {
    const now = Date.now();
    for (const [k, s] of Object.entries(D.sessions)) if (s.expires < now) delete D.sessions[k];
    db.touch();
  }

  const timers: NodeJS.Timeout[] = [];
  if (opt.jobs !== false) {
    timers.push(setInterval(() => reconcile().catch(() => undefined), 60_000));
    timers.push(setInterval(() => refunds().catch(() => undefined), 6 * 3600_000));
    timers.push(setInterval(sweepSessions, 3600_000));
    for (const t of timers) t.unref();
    kickSpeedruns();
  }

  // ------------------------------------------------------------ misc

  router.on('GET', '/v1/health', () => ({ ok: true, sim: SIM_VERSION, world: hash, speedrunQueue: D.speedrunQueue.length }));

  // ------------------------------------------------------------ http

  const server = createServer(async (req, res) => {
    const url = new URL(req.url ?? '/', 'http://localhost');
    const ip = (req.socket.remoteAddress ?? '').replace(/^::ffff:/, '');
    if (req.method === 'OPTIONS') {
      send(res, 204, {}, cors);
      return;
    }
    const m = router.match(req.method ?? 'GET', url.pathname);
    if (!m) {
      send(res, 404, { error: 'not-found' }, cors);
      return;
    }
    try {
      const body = req.method === 'POST' || req.method === 'PUT' ? await readBody(req, 13_000_000) : undefined;
      const out = await m.handler({ method: req.method ?? 'GET', path: url.pathname, params: m.params, query: url.searchParams, body, ip, headers: req.headers });
      send(res, 200, out, cors);
    } catch (e) {
      if (e instanceof HttpError) send(res, e.status, { error: e.code }, cors);
      else {
        log('error', url.pathname, (e as Error).stack ?? e);
        send(res, 500, { error: 'internal' }, cors);
      }
    }
  });

  return {
    server,
    world,
    async runJobs() {
      await reconcile();
      await refunds();
    },
    async drainSpeedruns() {
      if (!speedrunBusy) speedrunBusy = processSpeedruns().finally(() => (speedrunBusy = null));
      await speedrunBusy;
    },
    close: () =>
      new Promise<void>((resolve) => {
        for (const t of timers) clearInterval(t);
        server.close(() => {
          db.close();
          resolve();
        });
        server.closeAllConnections?.();
      }),
  };
}
