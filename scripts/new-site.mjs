#!/usr/bin/env node
/**
 * Scaffold a new site folder from the bundled Astro template.
 *
 *   node new-site.mjs <slug> --name "Business Name" [--langs es,en] [--dest <dir>]
 *                            [--email info@x.com] [--url https://x.com]
 *
 *   --langs   comma-separated BCP-47 codes; the FIRST is the default language and
 *             lives at the URL root. One code = single-language site; two or more
 *             = bilingual with translated slugs, hreflang and a language switcher.
 *   --dest    where to create the folder (default: <workspace>/sites/<slug>, or
 *             ./sites/<slug>)
 *
 * Run provision-site.mjs FIRST: the registry then supplies the real URL, the
 * Cloudflare Web Analytics token and the repo to point `origin` at.
 */

import { cpSync, readFileSync, writeFileSync, renameSync, rmSync, existsSync, mkdirSync, readdirSync, statSync } from 'node:fs';
import { resolve, join, dirname, basename } from 'node:path';
import { fileURLToPath } from 'node:url';
import { execFileSync } from 'node:child_process';
import { loadConfig, readRegistry, step, ok, skip, warn, log } from './lib/config.mjs';

const HERE = dirname(fileURLToPath(import.meta.url));
const TEMPLATE = resolve(HERE, '..', 'assets', 'template');

const args = process.argv.slice(2);
const opt = (n, d = null) => {
  const i = args.indexOf(`--${n}`);
  return i >= 0 ? args[i + 1] : d;
};
const slug = args.find((a, i) => !a.startsWith('--') && !String(args[i - 1]).startsWith('--'));
if (!slug) {
  console.error('usage: new-site.mjs <slug> --name "Business Name" [--langs es,en] [--dest <dir>]');
  process.exit(1);
}

const cfg = loadConfig();
const reg = readRegistry().sites[slug];
const name = opt('name', slug);
const langs = opt('langs', 'en').split(',').map((s) => s.trim().toLowerCase()).filter(Boolean);
const defaultLang = langs[0];
const url = (opt('url') || reg?.url || `https://${slug}.pages.dev`).replace(/\/$/, '');
const email = opt('email') || reg?.email || '';
const cfToken = reg?.cloudflareAnalyticsToken || '';
const indexnowKey = cfg.indexnowKey || '';
const dest = resolve(opt('dest') || join(cfg.workspace || process.cwd(), 'sites', slug));

if (!reg) warn(`"${slug}" is not in the registry - run provision-site.mjs first for the real URL and analytics token. Using ${url}.`);
if (!indexnowKey) warn('no IndexNow key configured (run setup-cloudflare.mjs); public/<key>.txt will be a placeholder.');
if (existsSync(dest) && readdirSync(dest).length) {
  console.error(`${dest} already exists and is not empty - refusing to overwrite.`);
  process.exit(1);
}

// -- copy -------------------------------------------------------------------
step(`Copying template -> ${dest}`);
mkdirSync(dest, { recursive: true });
cpSync(TEMPLATE, dest, { recursive: true, filter: (src) => !['node_modules', 'dist', '.astro'].includes(basename(src)) });

// -- locales ----------------------------------------------------------------
const SLUGS = {
  en: { services: 'services', about: 'about', contact: 'contact', faq: 'faq' },
  es: { services: 'servicios', about: 'nosotros', contact: 'contacto', faq: 'preguntas-frecuentes' },
};
const PAGE_NAMES = {
  en: { home: 'Home', services: 'Services', about: 'About', contact: 'Contact', faq: 'FAQ' },
  es: { home: 'Inicio', services: 'Servicios', about: 'Nosotros', contact: 'Contacto', faq: 'Preguntas frecuentes' },
};
const OG_LOCALE = { en: 'en_US', es: 'es_ES', pt: 'pt_BR', fr: 'fr_FR', de: 'de_DE', it: 'it_IT' };

for (const l of ['en', 'es']) {
  if (!langs.includes(l)) rmSync(join(dest, 'src', 'i18n', `${l}.ts`), { force: true });
}
for (const l of langs.filter((x) => !['en', 'es'].includes(x))) {
  // New language: start from the English dictionary; the model translates it.
  let src = readFileSync(join(TEMPLATE, 'src', 'i18n', 'en.ts'), 'utf8');
  src = src
    .replace("htmlLang: 'en'", `htmlLang: '${l}'`)
    .replace("ogLocale: 'en_US'", `ogLocale: '${OG_LOCALE[l] || `${l}_${l.toUpperCase()}`}'`)
    .replace('const en: Dict', `const ${l}: Dict`)
    .replace('export default en;', `export default ${l};`);
  writeFileSync(join(dest, 'src', 'i18n', `${l}.ts`), `// TODO: translate every string, including the slugs (routes are translated, not just text).\n${src}`);
}

const names = new Intl.DisplayNames(['en'], { type: 'language' });
const tokens = {
  slug,
  name,
  url,
  email,
  defaultLang,
  cfToken,
  indexnowKey,
  repo: reg?.repo || `<owner>/${slug}`,
  date: new Date().toISOString().slice(0, 10),
  languageNames: langs.map((l) => names.of(l) || l).join(', '),
  dictImports: langs.map((l) => `${l} from './${l}';`).map((s) => `import ${s}`).join('\n').replace(/^import /, ''),
  localeList: langs.map((l) => `'${l}'`).join(', '),
  dictMap: langs.join(', '),
  faqBlocks: langs.map((l) => `  ${l}: [\n    // { q: 'TODO: the question a customer would type', a: 'TODO: a standalone answer that names the business, the place and a contact detail.' },\n  ],`).join('\n'),
  i18nConfig: '// Locales and routes live in src/i18n/; Astro\'s own i18n router is not needed for the catch-all page.',
  sitemapOptions:
    langs.length > 1
      ? `{ i18n: { defaultLocale: '${defaultLang}', locales: { ${langs.map((l) => `${l}: '${l}'`).join(', ')} } } }`
      : '',
  llmsPages: langs
    .flatMap((l) => {
      const slugs = SLUGS[l] || SLUGS.en;
      const label = PAGE_NAMES[l] || PAGE_NAMES.en;
      const prefix = l === defaultLang ? '' : `/${l}`;
      return [
        `- ${label.home} (${l}): ${url}${prefix}/`,
        ...Object.keys(slugs).map((k) => `- ${label[k]} (${l}): ${url}${prefix}/${slugs[k]}/`),
      ];
    })
    .join('\n'),
};
// -- token substitution -----------------------------------------------------
function walk(dir, fn) {
  for (const f of readdirSync(dir)) {
    const p = join(dir, f);
    statSync(p).isDirectory() ? walk(p, fn) : fn(p);
  }
}
const TEXT = /\.(astro|ts|mjs|json|md|txt|css|toml|html|svg)$|_headers$/;
walk(dest, (p) => {
  if (!TEXT.test(p)) return;
  const before = readFileSync(p, 'utf8');
  const after = before.replace(/\{\{(\w+)\}\}/g, (m, k) => (k in tokens ? tokens[k] : m));
  if (after !== before) writeFileSync(p, after, 'utf8');
});

if (indexnowKey) renameSync(join(dest, 'public', '__INDEXNOW_KEY__.txt'), join(dest, 'public', `${indexnowKey}.txt`));
else rmSync(join(dest, 'public', '__INDEXNOW_KEY__.txt'), { force: true });
ok(`${langs.length} locale(s): ${langs.join(', ')} (default ${defaultLang})`);

// -- git --------------------------------------------------------------------
step('git');
try {
  execFileSync('git', ['init', '-b', 'main'], { cwd: dest, stdio: 'ignore' });
  if (reg?.repo) {
    execFileSync('git', ['remote', 'add', 'origin', `https://github.com/${reg.repo}.git`], { cwd: dest, stdio: 'ignore' });
    ok(`origin -> https://github.com/${reg.repo}.git`);
  } else skip('no repo in the registry; add `origin` yourself');
} catch (err) {
  warn(`git init failed: ${err.message}`);
}

log(`
Created ${dest}

Next, in order:
  1. Write BRAND.md (palette, type, voice, image direction) BEFORE any layout.
  2. Fill images.json from BRAND.md, then:  node ${join(HERE, 'gen-images.mjs')} images.json
     and fit them:                          npm install && npm run images:fit
  3. Replace every "TODO" in src/i18n/*.ts, src/data/faq.ts, src/config.ts, public/llms.txt.
  4. node ${join(HERE, 'check-site.mjs')} .     (after \`npm run build\`)
`);
