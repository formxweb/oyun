import { PRODUCTS, PRODUCT_BY_SKU } from '../../../core/catalog/store';
import type { KV } from '../../services/storage';
import type { IStoreService, PurchaseResult, StoreProduct } from './IStoreService';

/**
 * Test store for development builds and automated tests. Behaves like a real store:
 * purchases can succeed, fail, be cancelled or go pending, and duplicate purchases of an
 * owned item are refused. No money is involved; the UI labels it as a test store.
 *
 * Outcome can be forced with `?mockstore=fail|cancel|pending|slow` for QA.
 */
export class MockStoreService implements IStoreService {
  readonly platform = 'mock' as const;
  ready = false;
  private owned = new Set<string>();
  private pend = new Set<string>();
  private listeners: ((ids: string[]) => void)[] = [];
  private readonly key = 'vertigo.mockstore';

  constructor(
    private readonly kv: KV,
    private readonly forced: string | null = null,
  ) {}

  async init(): Promise<void> {
    try {
      const raw = this.kv.get(this.key);
      if (raw) {
        const o = JSON.parse(raw) as { owned: string[]; pending: string[] };
        this.owned = new Set(o.owned);
        this.pend = new Set(o.pending);
      }
    } catch {
      /* fresh */
    }
    this.ready = true;
    // resolve pending purchases from a previous session
    if (this.pend.size) setTimeout(() => this.resolvePending(), 1500);
  }

  private persist(): void {
    try {
      this.kv.set(this.key, JSON.stringify({ owned: [...this.owned], pending: [...this.pend] }));
    } catch {
      /* ignore */
    }
  }

  private emit(): void {
    const ids = this.entitlements();
    for (const l of this.listeners) l(ids);
  }

  private resolvePending(): void {
    for (const sku of this.pend) this.owned.add(sku);
    this.pend.clear();
    this.persist();
    this.emit();
  }

  async products(): Promise<StoreProduct[]> {
    return PRODUCTS.map((p) => ({ sku: p.sku, priceText: `$${(p.usdCents / 100).toFixed(2)}`, available: true }));
  }

  async purchase(sku: string): Promise<PurchaseResult> {
    const p = PRODUCT_BY_SKU.get(sku);
    if (!p) return { status: 'failed', sku, error: 'unknown-sku' };
    if (this.owned.has(sku)) return { status: 'failed', sku, error: 'already-owned' };
    if (this.pend.has(sku)) return { status: 'pending', sku };
    await new Promise((r) => setTimeout(r, this.forced === 'slow' ? 2500 : 400));
    switch (this.forced) {
      case 'fail':
        return { status: 'failed', sku, error: 'test-failure' };
      case 'cancel':
        return { status: 'cancelled', sku };
      case 'pending':
        this.pend.add(sku);
        this.persist();
        setTimeout(() => this.resolvePending(), 5000);
        return { status: 'pending', sku };
    }
    this.owned.add(sku);
    this.persist();
    this.emit();
    return { status: 'success', sku, grants: p.grants };
  }

  async restore(): Promise<string[]> {
    return this.entitlements();
  }

  entitlements(): string[] {
    const out = new Set<string>();
    for (const sku of this.owned) for (const g of PRODUCT_BY_SKU.get(sku)?.grants ?? []) out.add(g);
    return [...out];
  }

  onEntitlementsChanged(cb: (ids: string[]) => void): void {
    this.listeners.push(cb);
  }

  pending(): string[] {
    return [...this.pend];
  }
}

/** Used where no store exists (web release builds): everything reports unavailable. */
export class NoStoreService implements IStoreService {
  readonly platform = 'none' as const;
  readonly ready = false;
  async init(): Promise<void> {}
  async products(): Promise<StoreProduct[]> {
    return [];
  }
  async purchase(sku: string): Promise<PurchaseResult> {
    return { status: 'unavailable', sku };
  }
  async restore(): Promise<string[]> {
    return [];
  }
  entitlements(): string[] {
    return [];
  }
  onEntitlementsChanged(): void {}
  pending(): string[] {
    return [];
  }
}
