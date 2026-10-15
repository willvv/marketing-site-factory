import type { Dict } from './types';

/** Diccionario en español. Cada cadena "TODO" es un marcador que check-site.mjs reporta hasta reemplazarse con texto real. */
const es: Dict = {
  htmlLang: 'es',
  ogLocale: 'es_ES',
  slugs: { services: 'servicios', about: 'nosotros', contact: 'contacto', faq: 'preguntas-frecuentes' },
  nav: { services: 'Servicios', about: 'Nosotros', contact: 'Contacto', faq: 'Preguntas' },
  ui: {
    skipToContent: 'Saltar al contenido',
    menu: 'Menú',
    home: 'Inicio',
    language: 'Idioma',
    ctaWhatsapp: 'Escríbanos por WhatsApp',
    ctaEmail: 'Escríbanos un correo',
    ctaPhone: 'Llámenos',
    contactHeading: 'Contacto',
    emailLabel: 'Correo',
    whatsappLabel: 'WhatsApp',
    phoneLabel: 'Teléfono',
    addressLabel: 'Dirección',
    hoursLabel: 'Horario',
    notPublished: 'No publicado',
    notFoundTitle: 'Página no encontrada',
    notFoundBody: 'La página que buscaba no existe o cambió de lugar.',
    backHome: 'Volver al inicio',
    faqHeading: 'Preguntas frecuentes',
    footerRights: 'Todos los derechos reservados.',
  },
  home: {
    title: 'TODO título de inicio',
    description: 'TODO descripción de inicio, 140-160 caracteres, con el nombre del negocio, el lugar y lo que hace.',
    h1: 'TODO titular de inicio',
    lead: 'TODO una o dos frases que digan qué es el negocio, dónde está y para quién.',
    sections: [{ heading: 'TODO encabezado de seccion', body: 'TODO texto escrito con datos reales del negocio.' }],
  },
  services: {
    title: 'TODO título de servicios',
    description: 'TODO descripción de servicios, unica, 140-160 caracteres.',
    h1: 'TODO titular de servicios',
    lead: 'TODO párrafo introductorio.',
    items: [{ name: 'TODO servicio', body: 'TODO qué es, para quién es, y el precio solo si el cliente lo dio.' }],
  },
  about: {
    title: 'TODO título de nosotros',
    description: 'TODO descripción de nosotros, unica, 140-160 caracteres.',
    h1: 'TODO titular de nosotros',
    body: ['TODO párrafo. Solo hechos reales: sin fundadores, años ni cifras inventadas.'],
  },
  contact: {
    title: 'TODO título de contacto',
    description: 'TODO descripción de contacto, unica, 140-160 caracteres.',
    h1: 'TODO titular de contacto',
    lead: 'TODO cómo contactar al negocio y qué tan rápido responde.',
  },
  faq: {
    title: 'TODO título de preguntas',
    description: 'TODO descripción de preguntas, unica, 140-160 caracteres.',
    h1: 'TODO titular de preguntas',
    lead: 'TODO una línea que presente las preguntas.',
  },
};

export default es;
