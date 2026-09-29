/**
 * Platform-neutral store interface. Implementations: GooglePlayStoreService (Android),
 * SteamStoreService (desktop/Steam), MockStoreService (development/test builds).
 *
 * Rules every implementation follows:
 *  - Only cosmetics are sold (see core/catalog/store.ts). Nothing affects gameplay.
 *  - Entitlements are granted only after server verification of the platform receipt.
 *  - The client never holds secrets; verification keys live on the server.
 *  - Duplicate grants are prevented by purchase token / order id on the server.
 *  - Pending purchases are tracked and resolved on restore / next launch.
 */
export type StorePlatform = 'google' | 'steam' | 'mock' | 'none';

export interface StoreProduct {
  sku: string;
  /** localized price text from the platform store (never computed on the client) */
  priceText: string;
  available: boolean;
}

export type PurchaseResult =
  | { status: 'success'; sku: string; grants: string[] }
  | { status: 'pending'; sku: string }
  | { status: 'cancelled'; sku: string }
  | { status: 'failed'; sku: string; error: string }
  | { status: 'unavailable'; sku: string };

export interface IStoreService {
  readonly platform: StorePlatform;
  /** true when the service can actually process purchases right now */
  readonly ready: boolean;
  init(): Promise<void>;
  products(): Promise<StoreProduct[]>;
  purchase(sku: string): Promise<PurchaseResult>;
  /** Re-query platform purchases and server entitlements. Returns owned cosmetic ids. */
  restore(): Promise<string[]>;
  /** Cosmetic ids the server says this account owns. */
  entitlements(): string[];
  onEntitlementsChanged(cb: (cosmeticIds: string[]) => void): void;
  /** SKUs with a purchase waiting for platform confirmation. */
  pending(): string[];
}
