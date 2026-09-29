import { PRODUCTS, PRODUCT_BY_SKU } from '../../../core/catalog/store';
import type { Online } from '../../services/online';
import type { SteamBridge } from '../platform';
import type { IStoreService, PurchaseResult, StoreProduct } from './IStoreService';

/**
 * Steam microtransactions (ISteamMicroTxn).
 *
 * Flow: client asks the SERVER to InitTxn (the server holds the publisher Web API key) ->
 * Steam shows its own overlay authorization dialog -> the Steam client emits
 * MicroTxnAuthorizationResponse_t, forwarded by the Electron preload -> client asks the
 * server to FinalizeTxn -> server records the entitlement (idempotent on order id).
 * Prices are defined server-side per currency and returned already formatted.
 */
export class SteamStoreService implements IStoreService {
  readonly platform = 'steam' as const;
  ready = false;
  private owned: string[] = [];
  private pend = new Map<string, string>(); // orderId -> sku
  private prices = new Map<string, string>();
  private listeners: ((ids: string[]) => void)[] = [];
  private waiters = new Map<string, (authorized: boolean) => void>();

  constructor(
    private readonly steam: SteamBridge | null,
    private readonly online: Online,
    private readonly fetchPrices: () => Promise<Record<string, string> | null>,
  ) {}

  async init(): Promise<void> {
    if (!this.steam || !(await this.steam.available().catch(() => false))) return;
    this.steam.onMicroTxnAuthorization((orderId, authorized) => {
      const w = this.waiters.get(orderId);
      if (w) {
        this.waiters.delete(orderId);
        w(authorized);
      }
    });
    const p = await this.fetchPrices().catch(() => null);
    if (p) for (const k of Object.keys(p)) this.prices.set(k, p[k]);
    this.ready = this.prices.size > 0 && !!this.online.account;
    const server = await this.online.entitlements();
    if (server) this.setOwned(server);
  }

  private setOwned(ids: string[]): void {
    this.owned = ids;
    for (const l of this.listeners) l(ids);
  }

  async products(): Promise<StoreProduct[]> {
    return PRODUCTS.map((p) => ({ sku: p.sku, priceText: this.prices.get(p.sku) ?? '', available: this.ready && this.prices.has(p.sku) }));
  }

  async purchase(sku: string): Promise<PurchaseResult> {
    if (!this.steam || !this.ready) return { status: 'unavailable', sku };
    const prod = PRODUCT_BY_SKU.get(sku);
    if (!prod) return { status: 'failed', sku, error: 'unknown-sku' };
    if (prod.grants.every((g) => this.owned.includes(g))) return { status: 'failed', sku, error: 'already-owned' };
    let orderId: string;
    try {
      const lang = await this.steam.language().catch(() => 'english');
      orderId = (await this.online.steamInitTxn(sku, lang)).orderId;
    } catch (e) {
      return { status: 'failed', sku, error: (e as Error).message };
    }
    this.pend.set(orderId, sku);
    // Wait for the overlay decision (the user may take a while); give up waiting after 10 min.
    const authorized = await new Promise<boolean>((resolve) => {
      this.waiters.set(orderId, resolve);
      setTimeout(() => {
        if (this.waiters.has(orderId)) {
          this.waiters.delete(orderId);
          resolve(false);
        }
      }, 10 * 60 * 1000);
    });
    if (!authorized) {
      this.pend.delete(orderId);
      return { status: 'cancelled', sku };
    }
    try {
      const r = await this.online.steamFinalize(orderId);
      if (r.status === 'granted') {
        this.pend.delete(orderId);
        this.setOwned(r.cosmetics);
        return { status: 'success', sku, grants: prod.grants };
      }
      if (r.status === 'pending') return { status: 'pending', sku };
      this.pend.delete(orderId);
      return { status: 'failed', sku, error: 'finalize' };
    } catch {
      // The server retries finalization of authorized orders itself; entitlements will
      // appear on the next restore.
      return { status: 'pending', sku };
    }
  }

  async restore(): Promise<string[]> {
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
    return [...this.pend.values()];
  }
}
