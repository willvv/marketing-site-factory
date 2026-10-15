#!/usr/bin/env node
/**
 * Bing Webmaster Tools helper (optional layer on top of IndexNow).
 *
 *   node bing.mjs add <slug>      AddSite for the site's URL
 *   node bing.mjs submit <slug>   SubmitUrlBatch with every URL in the sitemap
 *   node bing.mjs sites           GetUserSites - what Bing already knows
 *
 * Needs a Bing Webmaster API key: https://www.bing.com/webmasters -> Settings ->
 * API access -> "Generate API key". Keys are UI-only. Put it in the
 * BING_API_KEY environment variable, or in credentials.json as "bingApiKey".
 *
 * IMPORTANT - verification is not done here. The documented, reliable route is:
 *   Bing Webmaster Tools -> Add a site -> "Import from Google Search Console".
 * Sites imported that way are verified automatically (Bing re-checks against the
 * Search Console grant periodically). Do that once after register-site.mjs.
 *
 * Status of this script: the endpoint shape (ssl.bing.com/webmaster/api.svc/json/
 * <Method>?apikey=...) and the AddSite / SubmitUrlBatch / GetUserSites methods are
 * taken from Bing's published API reference and the 2019 batch-submission post,
 * but this script has NOT been exercised against a live key. Treat the first run
 * as a test and read the HTTP status it prints.
 */

import { loadCredentials, readRegistry, warn, ok, step } from './lib/config.mjs';

const [cmd, slug] = process.argv.slice(2);
const key = loadCredentials().bingApiKey;
const API = 'https://ssl.bing.com/webmaster/api.svc/json';

if (!key) {
  console.error('No Bing API key. Generate one at https://www.bing.com/webmasters (Settings -> API access) and set BING_API_KEY.');
  process.exit(1);
}

async function call(method, body, verb = 'POST') {
  const res = await fetch(`${API}/${method}?apikey=${encodeURIComponent(key)}`, {
    method: verb,
    headers: { 'Content-Type': 'application/json; charset=utf-8' },
    body: verb === 'GET' ? undefined : JSON.stringify(body),
  });
  const text = await res.text();
  return { status: res.status, body: text.slice(0, 500) };
}

async function sitemapUrls(host) {
  const index = await fetch(`https://${host}/sitemap-index.xml`).then((r) => (r.ok ? r.text() : ''));
  const children = [...index.matchAll(/<loc>([^<]+)<\/loc>/g)].map((m) => m[1]);
  const urls = new Set();
  for (const child of children) {
    const xml = await fetch(child).then((r) => (r.ok ? r.text() : ''));
    for (const m of xml.matchAll(/<loc>([^<]+)<\/loc>/g)) urls.add(m[1]);
  }
  return [...urls];
}

const site = slug ? readRegistry().sites[slug] : null;
if (cmd !== 'sites' && !site) {
  console.error('usage: bing.mjs add|submit <slug> | sites');
  process.exit(1);
}

if (cmd === 'sites') {
  const r = await call('GetUserSites', null, 'GET');
  console.log(r.status, r.body);
} else if (cmd === 'add') {
  step(`AddSite ${site.url}`);
  const r = await call('AddSite', { siteUrl: `${site.url.replace(/\/$/, '')}/` });
  (r.status === 200 ? ok : warn)(`HTTP ${r.status} ${r.body}`);
} else if (cmd === 'submit') {
  const host = new URL(site.url).hostname;
  const urls = await sitemapUrls(host);
  step(`SubmitUrlBatch ${urls.length} URLs for ${host}`);
  for (let i = 0; i < urls.length; i += 500) {
    const r = await call('SubmitUrlBatch', { siteUrl: `${site.url.replace(/\/$/, '')}/`, urlList: urls.slice(i, i + 500) });
    (r.status === 200 ? ok : warn)(`HTTP ${r.status} ${r.body}`);
  }
} else {
  console.error('usage: bing.mjs add|submit <slug> | sites');
  process.exit(1);
}
