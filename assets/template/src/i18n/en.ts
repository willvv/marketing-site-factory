import type { Dict } from './types';

/**
 * English dictionary. Every "TODO" string is a placeholder that check-site.mjs
 * reports until it is replaced with real copy written from the business facts.
 * Titles/descriptions must be unique per page; answers must stand alone.
 */
const en: Dict = {
  htmlLang: 'en',
  ogLocale: 'en_US',
  slugs: { services: 'services', about: 'about', contact: 'contact', faq: 'faq' },
  nav: { services: 'Services', about: 'About', contact: 'Contact', faq: 'FAQ' },
  ui: {
    skipToContent: 'Skip to content',
    menu: 'Menu',
    home: 'Home',
    language: 'Language',
    ctaWhatsapp: 'Message us on WhatsApp',
    ctaEmail: 'Send us an email',
    ctaPhone: 'Call us',
    contactHeading: 'Get in touch',
    emailLabel: 'Email',
    whatsappLabel: 'WhatsApp',
    phoneLabel: 'Phone',
    addressLabel: 'Address',
    hoursLabel: 'Hours',
    notPublished: 'Not published',
    notFoundTitle: 'Page not found',
    notFoundBody: 'The page you were looking for does not exist or has moved.',
    backHome: 'Back to the home page',
    faqHeading: 'Frequently asked questions',
    footerRights: 'All rights reserved.',
  },
  home: {
    title: 'TODO home title',
    description: 'TODO home meta description, 140-160 characters, naming the business, the town and what it does.',
    h1: 'TODO home headline',
    lead: 'TODO one or two sentences that say what the business is, where, and for whom.',
    sections: [{ heading: 'TODO section heading', body: 'TODO section body written from real business facts.' }],
  },
  services: {
    title: 'TODO services title',
    description: 'TODO services meta description, unique, 140-160 characters.',
    h1: 'TODO services headline',
    lead: 'TODO lead paragraph.',
    items: [{ name: 'TODO service', body: 'TODO what it is, who it is for, what it costs only if the client supplied a price.' }],
  },
  about: {
    title: 'TODO about title',
    description: 'TODO about meta description, unique, 140-160 characters.',
    h1: 'TODO about headline',
    body: ['TODO about paragraph. Real facts only - no invented founders, years or numbers.'],
  },
  contact: {
    title: 'TODO contact title',
    description: 'TODO contact meta description, unique, 140-160 characters.',
    h1: 'TODO contact headline',
    lead: 'TODO how to reach the business and how fast it replies.',
  },
  faq: {
    title: 'TODO faq title',
    description: 'TODO faq meta description, unique, 140-160 characters.',
    h1: 'TODO faq headline',
    lead: 'TODO one line introducing the questions.',
  },
};

export default en;
