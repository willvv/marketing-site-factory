/**
 * Written by new-site.mjs from the locales chosen for this site.
 *
 * The FIRST entry is the default locale and lives at the URL root (no prefix) so
 * its URLs are the canonical ones. Every other locale lives under /<code>/.
 * Adding a language later = add a dictionary file, add it here, add its FAQ in
 * src/data/faq.ts. The sitemap, hreflang and switcher follow automatically.
 */
import {{dictImports}}

export const locales = [{{localeList}}] as const;
export type Lang = (typeof locales)[number];
export const defaultLocale: Lang = '{{defaultLang}}';

export const dictionaries = { {{dictMap}} } as const;
