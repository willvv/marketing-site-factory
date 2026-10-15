#!/usr/bin/env node
/**
 * Static QA of a built site (run `npm run build` first). Enforces the findability
 * and integrity rules mechanically so they cannot be forgotten.
 *
 *   node check-site.mjs <site-dir> [--strict]
 *
 * Errors fail the run. Warnings are things a human must look at; --strict makes
 * them fail too (use it before declaring a site done).
 *
 * This does NOT check visual quality or responsiveness - see references/qa.md for
 * the screenshot pass at 375 / 768 / 1440 px.
 */

import { readFileSync, readdirSync, statSync, existsSync } from 'node:fs';
import { join, relative, sep } from 'node:path';

const args = process.argv.slice(2);
const root = args.find((a) => !a.startsWith('--')) || '.';
const strict = args.includes('--strict');
const dist = join(root, 'dist');
if (!existsSync(dist)) {
  console.error(`No dist/ in ${root}. Run \`npm run build\` first.`);
  process.exit(1);
}

const errors = [];
const warnings = [];
const err = (page, msg) => errors.push(`${page}: ${msg}`);
const warn = (page, msg) => warnings.push(`${page}: ${msg}`);

function walk(dir, out = []) {
  for (const f of readdirSync(dir)) {
    const p = join(dir, f);
    statSync(p).isDirectory() ? walk(p, out) : out.push(p);
  }
  return out;
}
const files = walk(dist);
const pages = files.filter((f) => f.endsWith('.html'));
const rel = (p) => relative(dist, p).split(sep).join('/');
const urlPath = (p) => `/${rel(p).replace(/index\.html$/, '').replace(/\.html$/, '')}`;

const attr = (tag, name) => new RegExp(`${name}=("([^"]*)"|'([^']*)')`, 'i').exec(tag)?.[2] ?? new RegExp(`${name}=("([^"]*)"|'([^']*)')`, 'i').exec(tag)?.[3] ?? null;
const metas = (html) => [...html.matchAll(/<meta\b[^>]*>/gi)].map((m) => m[0]);
const links = (html) => [...html.matchAll(/<link\b[^>]*>/gi)].map((m) => m[0]);
const metaContent = (html, key, by = 'name') =>
  attr(metas(html).find((m) => attr(m, by) === key) || '', 'content');

const titles = new Map();
const descriptions = new Map();
let sawFaqSchema = false;
let sawCf = false;
let sawGa = false;
let siteOrigin = null;

for (const file of pages) {
  const html = readFileSync(file, 'utf8');
  const name = urlPath(file) === '/404' ? '404.html' : urlPath(file);
  const noindex = /<meta[^>]+name=["']robots["'][^>]+noindex/i.test(html);

  const title = /<title>([^<]*)<\/title>/i.exec(html)?.[1]?.trim();
  const desc = metaContent(html, 'description');
  const canonical = attr(links(html).find((l) => /rel=["']canonical["']/i.test(l)) || '', 'href');
  if (canonical) siteOrigin ||= new URL(canonical).origin;

  if (!/<html[^>]+\blang=/i.test(html)) err(name, 'missing <html lang>');
  if (!title) err(name, 'missing <title>');
  if (!desc) err(name, 'missing meta description');
  if (!noindex) {
    if (!canonical) err(name, 'missing canonical');
    else if (new URL(canonical).pathname !== urlPath(file)) err(name, `canonical ${canonical} does not match this page`);
    if (title) titles.set(title, [...(titles.get(title) || []), name]);
    if (desc) descriptions.set(desc, [...(descriptions.get(desc) || []), name]);
    if (desc && (desc.length < 70 || desc.length > 175)) warn(name, `meta description is ${desc.length} chars (aim 120-160)`);
    for (const k of ['og:title', 'og:description', 'og:image', 'og:url', 'og:type']) {
      if (!metaContent(html, k, 'property')) err(name, `missing ${k}`);
    }
    if (metaContent(html, 'twitter:card') !== 'summary_large_image') err(name, 'twitter:card should be summary_large_image');
  }

  // headings
  const headings = [...html.matchAll(/<h([1-6])\b/gi)].map((m) => Number(m[1]));
  const h1s = headings.filter((h) => h === 1).length;
  if (h1s !== 1) err(name, `${h1s} <h1> elements (need exactly 1)`);
  for (let i = 1; i < headings.length; i++) {
    if (headings[i] - headings[i - 1] > 1) {
      err(name, `heading level jumps from h${headings[i - 1]} to h${headings[i]}`);
      break;
    }
  }

  // images
  for (const img of html.matchAll(/<img\b[^>]*>/gi)) {
    const tag = img[0];
    if (attr(tag, 'alt') === null) err(name, `<img> without alt: ${tag.slice(0, 80)}`);
    if (!attr(tag, 'width') || !attr(tag, 'height')) warn(name, `<img> without width/height (layout shift): ${tag.slice(0, 80)}`);
  }

  // JSON-LD
  for (const m of html.matchAll(/<script[^>]+application\/ld\+json[^>]*>([\s\S]*?)<\/script>/gi)) {
    try {
      const data = JSON.parse(m[1]);
      const nodes = data['@graph'] || [data];
      if (nodes.some((n) => n['@type'] === 'FAQPage')) sawFaqSchema = true;
    } catch {
      err(name, 'JSON-LD does not parse');
    }
  }

  if (/cloudflareinsights\.com\/beacon/.test(html)) sawCf = true;
  if (/googletagmanager\.com\/gtag/.test(html)) sawGa = true;

  // hreflang
  const alts = links(html).filter((l) => /rel=["']alternate["']/i.test(l) && attr(l, 'hreflang'));
  if (alts.length) {
    const langs = alts.map((l) => attr(l, 'hreflang'));
    if (!langs.includes('x-default')) err(name, 'hreflang set without x-default');
    for (const a of alts) {
      const target = new URL(attr(a, 'href')).pathname;
      const tfile = target.endsWith('/') ? `${target.slice(1)}index.html` : `${target.slice(1)}.html`;
      if (!existsSync(join(dist, tfile))) err(name, `hreflang points at ${target}, which was not built`);
    }
  }

  // content integrity
  const text = html.replace(/<script[\s\S]*?<\/script>/gi, '').replace(/<style[\s\S]*?<\/style>/gi, '').replace(/<[^>]+>/g, ' ');
  if (/\p{Extended_Pictographic}/u.test(text)) err(name, 'contains emoji (banned: icons are generated, never emoji)');
  const todos = text.match(/\bTODO\b/g);
  if (todos) warn(name, `${todos.length} placeholder "TODO" string(s) still on the page`);
  if (/<!--\s*TODO/.test(html)) warn(name, 'TODO comment left in HTML');
}

for (const [t, where] of titles) if (where.length > 1) err(where.join(', '), `duplicate <title> "${t}"`);
for (const [d, where] of descriptions) if (where.length > 1) err(where.join(', '), 'duplicate meta description');

// -- site-level files -------------------------------------------------------
const exists = (p) => existsSync(join(dist, p));
if (!exists('sitemap-index.xml')) err('site', 'sitemap-index.xml missing (is @astrojs/sitemap enabled and `site` set?)');
if (!exists('robots.txt')) err('site', 'robots.txt missing');
else {
  const robots = readFileSync(join(dist, 'robots.txt'), 'utf8');
  for (const bot of ['GPTBot', 'OAI-SearchBot', 'ChatGPT-User', 'Google-Extended', 'PerplexityBot', 'ClaudeBot']) {
    if (!robots.includes(bot)) warn('robots.txt', `does not mention ${bot} (explicit allow is the house rule)`);
  }
  if (!/^Sitemap:/mi.test(robots)) err('robots.txt', 'no Sitemap: line');
  if (siteOrigin && robots.includes('pages.dev') && !siteOrigin.includes('pages.dev')) warn('robots.txt', 'Sitemap still points at pages.dev');
}
if (!exists('llms.txt')) err('site', 'llms.txt missing');
else if (/TODO/.test(readFileSync(join(dist, 'llms.txt'), 'utf8'))) warn('llms.txt', 'still contains TODO');
if (!files.some((f) => /^[a-f0-9]{16,128}\.txt$/.test(rel(f)))) warn('site', 'no IndexNow key file (<key>.txt) in the site root');
if (!sawFaqSchema) err('site', 'no FAQPage JSON-LD anywhere - every site needs a real FAQ');
if (!sawCf) warn('site', 'Cloudflare Web Analytics beacon not found (config.ts analytics.cloudflareToken is null?)');
if (!sawGa) warn('site', 'GA4 tag not found - run register-site.mjs and commit the config.ts change');

// og-default
const og = join(dist, 'og-default.png');
if (!existsSync(og)) err('site', 'public/og-default.png missing (generate og-source.png, then `npm run images:fit`)');
else {
  const b = readFileSync(og);
  const w = b.readUInt32BE(16);
  const h = b.readUInt32BE(20);
  if (w !== 1200 || h !== 630) err('og-default.png', `is ${w}x${h}, must be 1200x630 because SEO.astro declares those dimensions`);
}
for (const icon of ['favicon.png', 'apple-touch-icon.png']) if (!exists(icon)) warn('site', `${icon} missing`);

// -- report -----------------------------------------------------------------
console.log(`Checked ${pages.length} page(s) in ${dist}\n`);
for (const e of errors) console.log(`  [xx] ${e}`);
for (const w of warnings) console.log(`  [!!] ${w}`);
console.log(`\n${errors.length} error(s), ${warnings.length} warning(s)${strict && warnings.length ? '  (--strict: warnings fail)' : ''}`);
process.exit(errors.length || (strict && warnings.length) ? 1 : 0);
