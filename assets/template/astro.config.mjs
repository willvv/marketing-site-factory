import { defineConfig } from 'astro/config';
import tailwindcss from '@tailwindcss/vite';
import sitemap from '@astrojs/sitemap';

// Written by new-site.mjs from the site's real production URL and locale list.
// The sitemap integration emits sitemap-index.xml + sitemap-0.xml, with
// xhtml:link hreflang alternates when more than one locale is configured.
export default defineConfig({
  site: '{{url}}',
  output: 'static',
  trailingSlash: 'always',
  {{i18nConfig}}
  integrations: [sitemap({{sitemapOptions}})],
  vite: { plugins: [tailwindcss()] },
});
