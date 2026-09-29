import { PRODUCTS, PRODUCT_BY_SKU } from '../../../core/catalog/store';
import type { Online } from '../../services/online';
import type { IStoreService, PurchaseResult, StoreProduct } from './IStoreService';

/**
 * Google Play Billing via the native `VertigoBilling` Capacitor plugin
 * (platforms/android/.../VertigoBillingPlugin.kt, Play Billing Library 7).
 *
 * Flow: launch billing flow -> Play returns a purchase token -> the SERVER verifies the
 * token with the Android Publisher API, acknowledges it and records the entitlement
 * (idempotent on purchase token) -> client refreshes entitlements. The client never
 * acknowledges or grants anything by itself.
 */
export interface NativePurchase {
  productId: string;
  purchaseToken: string;
  orderId: string;
  /** 1 = PURCHASED, 2 = PENDING */
  purchaseState: number;
  acknowledged: boolean;
}

export interface VertigoBillingPlugin {
  connect(): Promise<{ ok: boolean }>;
  queryProducts(o: { ids: string[] }): Promise<{ products: { productId: string; formattedPrice: string }[] }>;
  purchase(o: { productId: string; obfuscatedAccountId: string }): Promise<{ result: 'OK' | 'USER_CANCELED' | 'ITEM_ALREADY_OWNED' | 'ERROR' | 'PENDING'; purchase?: NativePurchase; message?: string }>;
  queryPurchases(): Promise<{ purchases: NativePurchase[] }>;
  addListener(event: 'purchasesUpdated', cb: (e: { purchases: NativePurchase[] }) => void): Promise<unknown>;
}

export class GooglePlayStoreService implements IStoreService {
  readonly platform = 'google' as const;
  ready = false;
  private owned: string[] = [];
  private pend = new Set<string>();
  private prices = new Map<string, string>();
  private listeners: ((ids: string[]) => void)[] = [];
  /** tokens already sent for verification this session (duplicate prevention) */
  private inFlight = new Set<string>();

  constructor(
    private readonly plugin: VertigoBillingPlugin | null,
    private readonly online: Online,
    private readonly accountId: () => string,
  ) {}

  async init(): Promise<void> {
    if (!this.plugin) return;
    try {
      const c = await this.plugin.connect();
      if (!c.ok) return;
      const r = await this.plugin.queryProducts({ ids: PRODUCTS.map((p) => p.sku) });
      for (const p of r.products) this.prices.set(p.productId, p.formattedPrice);
      await this.plugin.addListener('purchasesUpdated', (e) => {
        for (const p of e.purchases) this.handle(p).catch(() => undefined);
      });
      this.ready = this.prices.size > 0;
      const server = await this.online.entitlements();
      if (server) this.setOwned(server);
      // Complete anything left over (pending purchases that finished while we were closed).
      await this.restore();
    } catch {
      this.ready = false;
    }
  }

  private setOwned(ids: string[]): void {
    this.owned = ids;
    for (const l of this.listeners) l(ids);
  }

  private async handle(p: NativePurchase): Promise<PurchaseResult> {
    if (p.purchaseState === 2) {
      this.pend.add(p.productId);
      return { status: 'pending', sku: p.productId };
    }
    if (this.inFlight.has(p.purchaseToken)) return { status: 'pending', sku: p.productId };
    this.inFlight.add(p.purchaseToken);
    try {
      const r = await this.online.verifyGooglePurchase(p.productId, p.purchaseToken, p.orderId);
      if (r.status === 'granted') {
        this.pend.delete(p.productId);
        this.setOwned(r.cosmetics);
        return { status: 'success', sku: p.productId, grants: PRODUCT_BY_SKU.get(p.productId)?.grants ?? [] };
      }
      if (r.status === 'pending') {
        this.pend.add(p.productId);
        return { status: 'pending', sku: p.productId };
      }
      return { status: 'failed', sku: p.productId, error: 'verification' };
    } catch {
      // Server unreachable: the purchase stays unacknowledged on Play and is retried on
      // next launch via restore(); Play refunds automatically if never acknowledged.
      this.pend.add(p.productId);
      return { status: 'pending', sku: p.productId };
    } finally {
      this.inFlight.delete(p.purchaseToken);
    }
  }

  async products(): Promise<StoreProduct[]> {
    return PRODUCTS.map((p) => ({ sku: p.sku, priceText: this.prices.get(p.sku) ?? '', available: this.ready && this.prices.has(p.sku) }));
  }

  async purchase(sku: string): Promise<PurchaseResult> {
    if (!this.plugin || !this.ready) return { status: 'unavailable', sku };
    if (!this.online.account) return { status: 'unavailable', sku };
    const prod = PRODUCT_BY_SKU.get(sku);
    if (!prod) return { status: 'failed', sku, error: 'unknown-sku' };
    if (prod.grants.every((g) => this.owned.includes(g))) return { status: 'failed', sku, error: 'already-owned' };
    try {
      const r = await this.plugin.purchase({ productId: sku, obfuscatedAccountId: this.accountId() });
      switch (r.result) {
        case 'USER_CANCELED':
          return { status: 'cancelled', sku };
        case 'ITEM_ALREADY_OWNED':
          await this.restore();
          return { status: 'success', sku, grants: prod.grants };
        case 'PENDING':
          this.pend.add(sku);
          return { status: 'pending', sku };
        case 'OK':
          return r.purchase ? this.handle(r.purchase) : { status: 'failed', sku, error: 'no-purchase' };
        default:
          return { status: 'failed', sku, error: r.message ?? 'error' };
      }
    } catch (e) {
      return { status: 'failed', sku, error: (e as Error).message };
    }
  }

  async restore(): Promise<string[]> {
    if (!this.plugin) return this.owned;
    try {
      const r = await this.plugin.queryPurchases();
      for (const p of r.purchases) await this.handle(p);
    } catch {
      /* keep current */
    }
    const server = await this.online.entitlements();
    if (server) this.setOwned(server);
    return this.owned;
  }

  entitlements(): string[] {
    return this.owned;
  }

  onEntitlementsChanged(cb: (ids: string[]) => void): void {
    this.listeners.push(cb);
  }

  pending(): string[] {
    return [...this.pend];
  }
}
