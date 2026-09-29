/** Minimal key-value storage abstraction so each platform can use its most durable store. */
export interface KV {
  get(key: string): string | null;
  set(key: string, value: string): void;
  remove(key: string): void;
  keys(prefix: string): string[];
}

export class LocalStorageKV implements KV {
  get(key: string): string | null {
    try {
      return localStorage.getItem(key);
    } catch {
      return null;
    }
  }
  set(key: string, value: string): void {
    localStorage.setItem(key, value);
  }
  remove(key: string): void {
    try {
      localStorage.removeItem(key);
    } catch {
      /* ignore */
    }
  }
  keys(prefix: string): string[] {
    const out: string[] = [];
    try {
      for (let i = 0; i < localStorage.length; i++) {
        const k = localStorage.key(i);
        if (k && k.startsWith(prefix)) out.push(k);
      }
    } catch {
      /* ignore */
    }
    return out;
  }
}

export class MemoryKV implements KV {
  private m = new Map<string, string>();
  quota = Infinity;
  get(key: string): string | null {
    return this.m.get(key) ?? null;
  }
  set(key: string, value: string): void {
    let size = value.length;
    for (const [k, v] of this.m) if (k !== key) size += v.length;
    if (size > this.quota) throw new DOMException('quota', 'QuotaExceededError');
    this.m.set(key, value);
  }
  remove(key: string): void {
    this.m.delete(key);
  }
  keys(prefix: string): string[] {
    return [...this.m.keys()].filter((k) => k.startsWith(prefix));
  }
}

/** FNV-1a 32-bit over a string, hex. Detects truncation and bit-rot in saves. */
export function checksum(s: string): string {
  let h = 0x811c9dc5;
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i);
    h = Math.imul(h, 0x01000193) >>> 0;
  }
  return h.toString(16).padStart(8, '0');
}
