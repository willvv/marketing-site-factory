#!/usr/bin/env node
/**
 * Submit a site's URLs to IndexNow, which Bing, Yandex, Seznam and Naver consume.
 * Bing's index also feeds Microsoft Copilot and ChatGPT search, so this is the
 * cheapest route into every non-Google engine and most AI assistants.
 *
 *   node indexnow.mjs <slug>     one site
 *   node indexnow.mjs --all      every site in the registry
 *   node indexnow.mjs --url https://example.com/sitemap-index.xml --host example.com
 *
 * Run after any deploy that changes content. Google ignores IndexNow - it gets the
 * sitemap through Search Console (register-site.mjs).
 *
 * The key is generated once per user (setup-cloudflare.mjs) and each site hosts it
 * at https://<host>/<key>.txt, containing exactly the key. new-site.mjs writes
 * that file into public/. A missing key file is the usual reason for a rejection.
 */

import { loadConfig, readRegistry, step, ok, warn } from './lib/config.mjs';

const args = process.argv.slice(2);
const all = args.includes('--all');
const slug = args.find((a) => !a.startsWith('--'));
const KEY = loadConfig().indexnowKey;

if (!KEY) {
  console.error('No IndexNow key configured. Run setup-cloudflare.mjs (it generates one) or set indexnowKey in config.json.');
  process.exit(1);
}

const registry = readRegistry();
const targets = all ? Object.values(registry.sites) : slug ? [registry.sites[slug]] : [];
if (!targets.length || targets.some((t) => !t)) {
  console.error(`usage: indexnow.mjs <slug> | --all.  Known: ${Object.keys(registry.sites).join(', ') || '(none)'}`);
  process.exit(1);
}

async function urlsFor(host) {
  const index = await fetch(`https://${host}/sitemap-index.xml`).then((r) => (r.ok ? r.text() : ''));
  const children = [...index.matchAll(/<loc>([^<]+)<\/loc>/g)].map((m) => m[1]);
  const urls = new Set();
  for (const child of children.length ? children : [`https://${host}/sitemap-0.xml`]) {
    const xml = await fetch(child).then((r) => (r.ok ? r.text() : ''));
    for (const m of xml.matchAll(/<loc>([^<]+)<\/loc>/g)) urls.add(m[1]);
  }
  return [...urls];
}

let failed = 0;
for (const site of targets) {
  const host = new URL(site.url).hostname;
  step(`IndexNow - ${host}`);
  const urlList = await urlsFor(host);
  if (!urlList.length) {
    warn('no URLs found in the sitemap; is the site deployed?');
    failed += 1;
    continue;
  }
  const keyUrl = `https://${host}/${KEY}.txt`;
  const keyOk = await fetch(keyUrl)
    .then(async (r) => r.ok && (await r.text()).trim() === KEY)
    .catch(() => false);
  if (!keyOk) {
    warn(`key file not reachable at ${keyUrl} - deploy it first, skipping`);
    failed += 1;
    continue;
  }
  const res = await fetch('https://api.indexnow.org/IndexNow', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json; charset=utf-8' },
    body: JSON.stringify({ host, key: KEY, keyLocation: keyUrl, urlList }),
  });
  // 200 accepted; 202 accepted, key still being validated.
  if (res.status === 200 || res.status === 202) ok(`${urlList.length} URLs submitted (HTTP ${res.status})`);
  else {
    warn(`rejected: HTTP ${res.status} ${await res.text().catch(() => '')}`);
    failed += 1;
  }
}
process.exit(failed ? 1 : 0);
