/**
 * Every fact about this business that appears in more than one place lives here.
 * Nothing else in the codebase may hardcode a phone number, an address, a nav
 * label or the domain - when the site later moves to the client's own domain,
 * this file (plus astro.config.mjs and public/) is all that changes.
 *
 * Content integrity: a value is either supplied by the client, verified from a
 * real public source (and recorded in SITE.md), or `null`. Never guess a phone
 * number, a price, an address or opening hours.
 */

export const site = {
  /** Display name, as the business writes it. */
  name: '{{name}}',
  /** Legal / full name, for JSON-LD. */
  legalName: '{{name}}',
  tagline: 'TODO: one-line positioning',
  /** 150-160 characters, used as the default meta description. */
  description: 'TODO: what the business does, for whom, and where.',
  url: '{{url}}',
} as const;

export const contact = {
  email: '{{email}}' as string | null,
  /** International format, digits only, e.g. '50688887777'. null until a real one exists. */
  whatsapp: null as string | null,
  /** Pre-filled WhatsApp greeting, per language (keys match src/i18n/locales.ts). */
  whatsappMessage: { en: 'Hello, I found you online and would like to know more.', es: 'Hola, los encontré en internet y me gustaría saber más.' } as Record<string, string>,
  phone: null as string | null,
  /** Public street address, or null for a remote / online business. */
  address: null as null | {
    street: string;
    locality: string;
    region: string;
    postalCode?: string;
    country: string; // ISO 3166-1 alpha-2, e.g. 'CR'
  },
  /** e.g. ['Mo-Fr 08:00-17:00'] (schema.org openingHours). Empty until supplied. */
  hours: [] as string[],
} as const;

/** schema.org business type. Use the most specific one that is true. */
export const business = {
  schemaType: 'LocalBusiness' as string, // 'Restaurant' | 'ProfessionalService' | 'Dentist' | ...
  /** Towns / regions / countries actually served. [] if unknown - never pad it. */
  areaServed: [] as string[],
  /** Real profile URLs only (Facebook, Instagram, Google Business Profile). */
  sameAs: [] as string[],
  /** Languages the business operates in, BCP-47. */
  knowsLanguage: ['{{defaultLang}}'] as string[],
} as const;

/** The channel the page pushes first. WhatsApp wins where customers use it. */
export const primaryCta = 'whatsapp' as 'whatsapp' | 'email' | 'phone';

export function whatsappHref(lang: string): string | null {
  if (!contact.whatsapp) return null;
  const message = contact.whatsappMessage[lang] ?? Object.values(contact.whatsappMessage)[0] ?? '';
  return `https://wa.me/${contact.whatsapp}?text=${encodeURIComponent(message)}`;
}

export function mailtoHref(subject: string): string | null {
  return contact.email ? `mailto:${contact.email}?subject=${encodeURIComponent(subject)}` : null;
}

/**
 * Analytics. Cloudflare Web Analytics is cookie-less and needs no consent banner.
 * GA4 stays null until register-site.mjs writes the measurement id; the snippet
 * renders nothing while it is null, so an unregistered site is never broken.
 */
export const analytics = {
  cloudflareToken: '{{cfToken}}' as string | null,
  ga4Id: null as string | null,
} as const;

/** Search-engine ownership meta tags. Rendered only when set. */
export const verification = {
  google: null as string | null,
  bing: null as string | null,
} as const;
