// Langue du jeu : données pures (Node, check-levels). Pas de DOM.
// Docs : docs/LANGUES.md. Le français est la langue d'origine et le repli.

export const LOCALES = ['fr', 'en', 'de', 'it', 'es'] as const;
export type Locale = (typeof LOCALES)[number];

/** Choix du réglage : suivre le système, ou une langue fixe. */
export const LANG_PREFS = ['system', 'fr', 'en', 'de', 'it', 'es'] as const;
export type LangPref = (typeof LANG_PREFS)[number];

/** Chaîne traduite. Clé stable ailleurs ; ici, une phrase complète par langue. */
export interface L10n {
  readonly fr: string;
  readonly en: string;
  readonly de: string;
  readonly it: string;
  readonly es: string;
}

/** Espace insécable (radio, répliques) : avant : ; ! ? */
export const NB = '\u00A0';

export function L(fr: string, en: string, de: string, it: string, es: string): L10n {
  return { fr, en, de, it, es };
}

export function isLocale(v: unknown): v is Locale {
  return typeof v === 'string' && (LOCALES as readonly string[]).includes(v);
}

export function isLangPref(v: unknown): v is LangPref {
  return typeof v === 'string' && (LANG_PREFS as readonly string[]).includes(v);
}

/** Sous-tag principal : « fr-FR » → « fr ». */
export function primaryTag(tag: string): string {
  const i = tag.indexOf('-');
  return (i < 0 ? tag : tag.slice(0, i)).toLowerCase();
}

/**
 * `system` : première langue connue dans `langs` (navigator.languages, puis language).
 * Inconnue ou liste vide : français.
 */
export function resolveLocale(pref: LangPref, langs: readonly string[]): Locale {
  if (pref !== 'system') return pref;
  for (let i = 0; i < langs.length; i++) {
    const p = primaryTag(langs[i]);
    if (isLocale(p)) return p;
  }
  return 'fr';
}

/** Langues du navigateur ; hors navigateur (Node) : français. */
export function navigatorLangs(): readonly string[] {
  if (typeof navigator === 'undefined') return ['fr'];
  const list = navigator.languages;
  if (list && list.length > 0) return list;
  return [navigator.language || 'fr'];
}

let active: Locale = 'fr';
let pref: LangPref = 'system';
const listeners = new Set<() => void>();

export function getLocale(): Locale {
  return active;
}

export function getLangPref(): LangPref {
  return pref;
}

/** Préférence affichée (réglage ou ?lang=). Ne redessine pas. */
export function setLangPref(next: LangPref): void {
  pref = next;
}

/**
 * Langue active. Notifie si elle change (écrans, HUD, radio).
 * `t()` ne fait pas d'allocation : il renvoie la chaîne déjà stockée.
 */
export function setLocale(next: Locale): void {
  if (next === active) return;
  active = next;
  for (const fn of listeners) fn();
}

export function onLocale(fn: () => void): () => void {
  listeners.add(fn);
  return () => {
    listeners.delete(fn);
  };
}

export function t(s: L10n): string {
  return s[active];
}

/** Remplace `{nom}` (alloue : pas dans une boucle de jeu). */
export function tf(s: L10n, vars: Readonly<Record<string, string | number>>): string {
  let out: string = s[active];
  for (const k in vars) {
    const token = `{${k}}`;
    if (out.indexOf(token) !== -1) out = out.split(token).join(String(vars[k]));
  }
  return out;
}

/** 1 → `one`, sinon `many`. `{n}` est fourni. */
export function tn(n: number, one: L10n, many: L10n): string {
  return tf(n === 1 ? one : many, { n });
}

const TAG: Record<Locale, string> = { fr: 'fr-FR', en: 'en', de: 'de', it: 'it', es: 'es' };

/** Étiquette BCP 47 pour toLocaleUpperCase. */
export function localeTag(): string {
  return TAG[active];
}

/** Virgule décimale sauf en anglais : 1.25 → « ×1,25 » ou « ×1.25 ». */
export function formatMul(m: number): string {
  const n = String(Math.round(m * 100) / 100);
  return `×${active === 'en' ? n : n.replace('.', ',')}`;
}
