/**
 * Store products. Only cosmetics. No currencies, no loot boxes, no randomness, no gameplay.
 * The SKU is the product id on Google Play and the item definition key on Steam.
 * `usdCents` is a reference price used by the test store and server-side sanity checks;
 * real prices are always shown from the platform store in the player's currency.
 */
export interface Product {
  sku: string;
  nameKey: string;
  grants: string[];
  usdCents: number;
  steamItemDef: number;
  bundle: boolean;
}

export const PRODUCTS: Product[] = [
  { sku: 'vertigo.outfit.night', nameKey: 'cos.outfit.night', grants: ['outfit.night'], usdCents: 299, steamItemDef: 101, bundle: false },
  { sku: 'vertigo.outfit.cartographer', nameKey: 'cos.outfit.cartographer', grants: ['outfit.cartographer'], usdCents: 299, steamItemDef: 102, bundle: false },
  { sku: 'vertigo.outfit.festival', nameKey: 'cos.outfit.festival', grants: ['outfit.festival'], usdCents: 299, steamItemDef: 103, bundle: false },
  { sku: 'vertigo.scarf.aurora', nameKey: 'cos.scarf.aurora', grants: ['scarf.aurora'], usdCents: 199, steamItemDef: 111, bundle: false },
  { sku: 'vertigo.scarf.ember', nameKey: 'cos.scarf.ember', grants: ['scarf.ember'], usdCents: 199, steamItemDef: 112, bundle: false },
  { sku: 'vertigo.shoes.neon', nameKey: 'cos.shoes.neon', grants: ['shoes.neon'], usdCents: 149, steamItemDef: 121, bundle: false },
  { sku: 'vertigo.gloves.lantern', nameKey: 'cos.gloves.lantern', grants: ['gloves.lantern'], usdCents: 149, steamItemDef: 131, bundle: false },
  { sku: 'vertigo.trail.aurora', nameKey: 'cos.trail.aurora', grants: ['trail.aurora'], usdCents: 199, steamItemDef: 141, bundle: false },
  { sku: 'vertigo.trail.origami', nameKey: 'cos.trail.origami', grants: ['trail.origami'], usdCents: 199, steamItemDef: 142, bundle: false },
  { sku: 'vertigo.landing.lantern', nameKey: 'cos.landing.lantern', grants: ['landing.lantern'], usdCents: 149, steamItemDef: 151, bundle: false },
  { sku: 'vertigo.jump.feather', nameKey: 'cos.jump.feather', grants: ['jump.feather'], usdCents: 99, steamItemDef: 161, bundle: false },
  { sku: 'vertigo.emote.dance', nameKey: 'cos.emote.dance', grants: ['emote.dance'], usdCents: 99, steamItemDef: 171, bundle: false },
  { sku: 'vertigo.emote.handstand', nameKey: 'cos.emote.handstand', grants: ['emote.handstand'], usdCents: 99, steamItemDef: 172, bundle: false },
  { sku: 'vertigo.banner.nightsky', nameKey: 'cos.banner.nightsky', grants: ['banner.nightsky'], usdCents: 99, steamItemDef: 181, bundle: false },
  { sku: 'vertigo.banner.clouds', nameKey: 'cos.banner.clouds', grants: ['banner.clouds'], usdCents: 99, steamItemDef: 182, bundle: false },
  {
    sku: 'vertigo.bundle.night',
    nameKey: 'cos.bundle.night',
    grants: ['outfit.night', 'scarf.aurora', 'trail.aurora', 'banner.nightsky'],
    usdCents: 599,
    steamItemDef: 191,
    bundle: true,
  },
  {
    sku: 'vertigo.bundle.supporter',
    nameKey: 'cos.bundle.supporter',
    grants: ['outfit.cartographer', 'outfit.festival', 'scarf.ember', 'shoes.neon', 'gloves.lantern', 'trail.origami', 'landing.lantern', 'jump.feather', 'emote.dance', 'emote.handstand', 'banner.clouds'],
    usdCents: 999,
    steamItemDef: 192,
    bundle: true,
  },
];

export const PRODUCT_BY_SKU = new Map(PRODUCTS.map((p) => [p.sku, p]));
