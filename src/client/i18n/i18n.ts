import { EN } from './en';
import { TR } from './tr';

export type Lang = 'en' | 'tr';
export type Dict = Record<string, string>;

const TABLES: Record<Lang, Dict> = { en: EN, tr: TR };
export const LANGS: { id: Lang; name: string }[] = [
  { id: 'en', name: 'English' },
  { id: 'tr', name: 'Türkçe' },
];

let lang: Lang = 'en';
const listeners = new Set<() => void>();

export function setLang(l: Lang): void {
  if (!TABLES[l]) l = 'en';
  lang = l;
  document.documentElement.lang = l;
  for (const f of listeners) f();
}

export function getLang(): Lang {
  return lang;
}

export function onLangChange(f: () => void): () => void {
  listeners.add(f);
  return () => listeners.delete(f);
}

/** Detect the system language on first launch. */
export function detectLang(): Lang {
  const n = (navigator.language || 'en').toLowerCase();
  return n.startsWith('tr') ? 'tr' : 'en';
}

/**
 * Translate a key. Missing keys fall back to English, then to the key itself (never crash,
 * never show undefined). Params replace {name} placeholders.
 */
export function t(key: string, params?: Record<string, string | number>): string {
  let s = TABLES[lang][key] ?? EN[key] ?? key;
  if (params) for (const k in params) s = s.split('{' + k + '}').join(String(params[k]));
  return s;
}

export function has(key: string): boolean {
  return key in EN;
}

/** Format seconds as m:ss.cc */
export function fmtTime(sec: number): string {
  if (!isFinite(sec)) return '--:--.--';
  const m = Math.floor(sec / 60);
  const s = sec - m * 60;
  return `${m}:${s < 10 ? '0' : ''}${s.toFixed(2)}`;
}

export function fmtDuration(sec: number): string {
  const h = Math.floor(sec / 3600);
  const m = Math.floor((sec % 3600) / 60);
  return h > 0 ? t('fmt.hm', { h, m }) : t('fmt.m', { m });
}

export function fmtNumber(n: number): string {
  return Math.round(n).toLocaleString(lang === 'tr' ? 'tr-TR' : 'en-US');
}
