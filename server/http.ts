import type { IncomingMessage, ServerResponse } from 'node:http';

/** Minimal JSON HTTP routing: no framework, nothing the game server does not need. */

export class HttpError extends Error {
  constructor(
    readonly status: number,
    readonly code: string,
  ) {
    super(code);
  }
}

export interface Req {
  method: string;
  path: string;
  params: Record<string, string>;
  query: URLSearchParams;
  body: unknown;
  ip: string;
  headers: IncomingMessage['headers'];
}

export type Handler = (req: Req) => Promise<unknown> | unknown;

interface Route {
  method: string;
  parts: string[];
  handler: Handler;
}

export class Router {
  private routes: Route[] = [];

  on(method: string, pattern: string, handler: Handler): void {
    this.routes.push({ method, parts: pattern.split('/').filter(Boolean), handler });
  }

  match(method: string, path: string): { handler: Handler; params: Record<string, string> } | null {
    const segs = path.split('/').filter(Boolean);
    for (const r of this.routes) {
      if (r.method !== method || r.parts.length !== segs.length) continue;
      const params: Record<string, string> = {};
      let ok = true;
      for (let i = 0; i < segs.length; i++) {
        const p = r.parts[i];
        if (p.startsWith(':')) {
          try {
            params[p.slice(1)] = decodeURIComponent(segs[i]);
          } catch {
            ok = false;
          }
        } else if (p !== segs[i]) ok = false;
        if (!ok) break;
      }
      if (ok) return { handler: r.handler, params };
    }
    return null;
  }
}

export function readBody(req: IncomingMessage, limit: number): Promise<unknown> {
  return new Promise((resolve, reject) => {
    let size = 0;
    const chunks: Buffer[] = [];
    req.on('data', (c: Buffer) => {
      size += c.length;
      if (size > limit) {
        reject(new HttpError(413, 'too-large'));
        req.destroy();
        return;
      }
      chunks.push(c);
    });
    req.on('end', () => {
      if (!chunks.length) return resolve(undefined);
      try {
        resolve(JSON.parse(Buffer.concat(chunks).toString('utf8')));
      } catch {
        reject(new HttpError(400, 'bad-json'));
      }
    });
    req.on('error', reject);
  });
}

export function send(res: ServerResponse, status: number, body: unknown, cors: string): void {
  const json = JSON.stringify(body);
  res.writeHead(status, {
    'Content-Type': 'application/json; charset=utf-8',
    'Content-Length': Buffer.byteLength(json),
    'Cache-Control': 'no-store',
    'X-Content-Type-Options': 'nosniff',
    'Access-Control-Allow-Origin': cors,
    'Access-Control-Allow-Headers': 'Content-Type, Authorization',
    'Access-Control-Allow-Methods': 'GET, POST, PUT, OPTIONS',
    Vary: 'Origin',
  });
  res.end(json);
}

/** Sliding one-minute window counter per key (IP or player). */
export class RateLimiter {
  private hits = new Map<string, number[]>();

  constructor(private readonly perMinute: number) {}

  allow(key: string, now = Date.now()): boolean {
    const arr = (this.hits.get(key) ?? []).filter((t) => now - t < 60_000);
    if (arr.length >= this.perMinute) {
      this.hits.set(key, arr);
      return false;
    }
    arr.push(now);
    this.hits.set(key, arr);
    if (this.hits.size > 50_000) this.hits.clear();
    return true;
  }
}

// ---------------------------------------------------------------- input validation

export function obj(v: unknown): Record<string, unknown> {
  if (!v || typeof v !== 'object' || Array.isArray(v)) throw new HttpError(400, 'bad-request');
  return v as Record<string, unknown>;
}

export function str(o: Record<string, unknown>, k: string, max = 256, optional = false): string {
  const v = o[k];
  if (v === undefined || v === null) {
    if (optional) return '';
    throw new HttpError(400, 'missing-' + k);
  }
  if (typeof v !== 'string' || v.length > max) throw new HttpError(400, 'bad-' + k);
  return v;
}

export function num(o: Record<string, unknown>, k: string, optional = false): number {
  const v = o[k];
  if (v === undefined && optional) return 0;
  if (typeof v !== 'number' || !isFinite(v)) throw new HttpError(400, 'bad-' + k);
  return v;
}
