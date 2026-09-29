import { PRODUCTS } from '../src/core/catalog/store';

/**
 * Steam price points. Steam charges in the buyer's wallet currency, so every product needs an
 * amount per currency (in hundredths of the currency unit, as ISteamMicroTxn expects). Prices
 * are set by tier from the USD reference in the catalog; a wallet currency not listed here
 * cannot buy (the store shows the item as unavailable rather than guessing an exchange rate).
 * Google Play prices are configured in the Play Console and come to the client from Play itself.
 */
type Tier = 99 | 149 | 199 | 299 | 599 | 999;

const TABLE: Record<string, Record<Tier, number>> = {
  USD: { 99: 99, 149: 149, 199: 199, 299: 299, 599: 599, 999: 999 },
  EUR: { 99: 99, 149: 149, 199: 199, 299: 299, 599: 599, 999: 999 },
  GBP: { 99: 89, 149: 129, 199: 179, 299: 249, 599: 499, 999: 849 },
  CAD: { 99: 129, 149: 199, 199: 279, 299: 399, 599: 799, 999: 1299 },
  AUD: { 99: 145, 149: 225, 199: 295, 299: 445, 599: 895, 999: 1495 },
  NZD: { 99: 159, 149: 249, 199: 329, 299: 499, 599: 999, 999: 1599 },
  CHF: { 99: 90, 149: 140, 199: 180, 299: 270, 599: 550, 999: 900 },
  NOK: { 99: 1000, 149: 1500, 199: 2000, 299: 3000, 599: 6000, 999: 10000 },
  SEK: { 99: 1000, 149: 1500, 199: 2000, 299: 3000, 599: 6000, 999: 10000 },
  DKK: { 99: 700, 149: 1000, 199: 1500, 299: 2000, 599: 4000, 999: 7000 },
  PLN: { 99: 399, 149: 599, 199: 799, 299: 1199, 599: 2399, 999: 3999 },
  JPY: { 99: 12000, 149: 18000, 199: 24000, 299: 36000, 599: 72000, 999: 120000 },
  KRW: { 99: 110000, 149: 170000, 199: 230000, 299: 340000, 599: 680000, 999: 1100000 },
  CNY: { 99: 600, 149: 900, 199: 1200, 299: 1800, 599: 3600, 999: 6000 },
  BRL: { 99: 399, 149: 599, 199: 799, 299: 1199, 599: 2299, 999: 3799 },
  MXN: { 99: 1900, 149: 2900, 199: 3900, 299: 5900, 599: 10900, 999: 17900 },
  INR: { 99: 4900, 149: 7900, 199: 9900, 299: 14900, 599: 29900, 999: 49900 },
};

const LOCALE: Record<string, string> = {
  USD: 'en-US', EUR: 'de-DE', GBP: 'en-GB', CAD: 'en-CA', AUD: 'en-AU', NZD: 'en-NZ', CHF: 'de-CH', NOK: 'nb-NO', SEK: 'sv-SE', DKK: 'da-DK',
  PLN: 'pl-PL', JPY: 'ja-JP', KRW: 'ko-KR', CNY: 'zh-CN', BRL: 'pt-BR', MXN: 'es-MX', INR: 'en-IN',
};

export function steamAmount(sku: string, currency: string): number | null {
  const p = PRODUCTS.find((x) => x.sku === sku);
  const row = TABLE[currency];
  if (!p || !row) return null;
  return row[p.usdCents as Tier] ?? null;
}

export function formatPrice(amount: number, currency: string): string {
  const fmt = new Intl.NumberFormat(LOCALE[currency] ?? 'en-US', { style: 'currency', currency });
  const digits = fmt.resolvedOptions().maximumFractionDigits ?? 2;
  // Steam amounts are always in hundredths, whatever the currency's usual precision
  return fmt.format(Number((amount / 100).toFixed(digits)));
}

export function steamPrices(currency: string): Record<string, string> {
  const out: Record<string, string> = {};
  for (const p of PRODUCTS) {
    const a = steamAmount(p.sku, currency);
    if (a !== null) out[p.sku] = formatPrice(a, currency);
  }
  return out;
}

/** Steam's API language names to the ISO 639-1 codes InitTxn wants. */
export function steamLanguage(apiLanguage: string): string {
  const m: Record<string, string> = { english: 'en', turkish: 'tr', german: 'de', french: 'fr', spanish: 'es', latam: 'es', italian: 'it', portuguese: 'pt', brazilian: 'pt', russian: 'ru', polish: 'pl', japanese: 'ja', koreana: 'ko', schinese: 'zh', tchinese: 'zh' };
  return m[apiLanguage] ?? 'en';
}
