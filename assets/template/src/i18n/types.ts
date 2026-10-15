/** Shape every language dictionary must satisfy - a missing key is a build error, not an empty string in production. */
export type PageKey = 'home' | 'services' | 'about' | 'contact' | 'faq';
export type NavKey = Exclude<PageKey, 'home'>;

export interface PageCopy {
  /** <title> (without the site-name suffix, which SEO.astro adds). Unique per page. */
  title: string;
  /** Unique 140-160 character meta description. */
  description: string;
  /** The single <h1> of the page. */
  h1: string;
}

export interface Dict {
  htmlLang: string;
  ogLocale: string;
  /** URL slug per page in THIS language - routes are translated, not just text. */
  slugs: Record<NavKey, string>;
  nav: Record<NavKey, string>;
  ui: {
    skipToContent: string;
    menu: string;
    home: string;
    language: string;
    ctaWhatsapp: string;
    ctaEmail: string;
    ctaPhone: string;
    contactHeading: string;
    emailLabel: string;
    whatsappLabel: string;
    phoneLabel: string;
    addressLabel: string;
    hoursLabel: string;
    notPublished: string;
    notFoundTitle: string;
    notFoundBody: string;
    backHome: string;
    faqHeading: string;
    footerRights: string;
  };
  home: PageCopy & { lead: string; sections: { heading: string; body: string }[] };
  services: PageCopy & { lead: string; items: { name: string; body: string }[] };
  about: PageCopy & { body: string[] };
  contact: PageCopy & { lead: string };
  faq: PageCopy & { lead: string };
}
