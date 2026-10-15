/**
 * i18n helpers. Works for one locale or many.
 *
 * - The default locale is unprefixed (`/`, `/services/`); others are `/<code>/...`.
 * - Slugs are translated per language (`/servicios/` vs `/en/services/`), never
 *   `/en/servicios/` - a hybrid serves nobody and URLs are part of what engines read.
 * - The language is derived from the URL, so components never need it passed down.
 */
import { locales, defaultLocale, dictionaries, type Lang } from './locales';
import type { Dict, NavKey, PageKey } from './types';

export { locales, defaultLocale };
export type { Lang, Dict, NavKey, PageKey };

export const pageKeys: PageKey[] = ['home', 'services', 'about', 'contact', 'faq'];
export const navKeys: NavKey[] = ['services', 'about', 'contact', 'faq'];
export const isMultilingual = locales.length > 1;

export function t(lang: Lang): Dict {
  return dictionaries[lang] as Dict;
}

export function localeRoot(lang: Lang): string {
  return lang === defaultLocale ? '' : `/${lang}`;
}

export function pathFor(key: PageKey, lang: Lang): string {
  if (key === 'home') return `${localeRoot(lang)}/`;
  return `${localeRoot(lang)}/${t(lang).slugs[key]}/`;
}

export function langFromPath(pathname: string): Lang {
  for (const l of locales) {
    if (l !== defaultLocale && (pathname === `/${l}` || pathname.startsWith(`/${l}/`))) return l;
  }
  return defaultLocale;
}

export function pageKeyFromPath(pathname: string): PageKey | null {
  const p = pathname.endsWith('/') ? pathname : `${pathname}/`;
  const lang = langFromPath(p);
  return pageKeys.find((k) => pathFor(k, lang) === p) ?? null;
}

/** The same page in another language; falls back to that language's home, never a 404. */
export function alternatePath(pathname: string, target: Lang): string {
  const key = pageKeyFromPath(pathname);
  return pathFor(key ?? 'home', target);
}
