#!/usr/bin/env node
/**
 * Register a site with Google Analytics 4 and Google Search Console, and write the
 * GA4 measurement id into the site's src/config.ts.
 *
 *   node register-site.mjs <slug> [--dir <path-to-site>]
 *   node register-site.mjs --verify-domain [domain]    one-time per domain
 *   node register-site.mjs --add-owner you@gmail.com [--domain d]   show it in your Google UI
 *   node register-site.mjs <slug> --dry-run [--ga-only | --gsc-only]
 *
 * Idempotent, matched on natural keys (property displayName = hostname, stream
 * defaultUri, Search Console siteUrl), so a drifted registry still converges.
 *
 * Needs (see references/onboarding.md):
 *   - the service-account key (setup-google.mjs)
 *   - the service account added as Administrator on your GA account (one UI step;
 *     there is no API for the first access grant)
 *   - Cloudflare credentials, to write the DNS TXT record for domain verification
 */

import { readFileSync, writeFileSync, existsSync } from 'node:fs';
import { resolve } from 'node:path';
import { cf, zoneId, accountId } from './lib/cf.mjs';
import { g, SCOPES, serviceAccountEmail } from './lib/google.mjs';
import { requireConfig, readRegistry, writeRegistry, log, step, ok, skip, warn } from './lib/config.mjs';

const args = process.argv.slice(2);
const DRY = args.includes('--dry-run');
const flags = new Set(args.filter((a) => a.startsWith('--')));
const dirIdx = args.indexOf('--dir');
const dirArg = dirIdx >= 0 ? args[dirIdx + 1] : null;
const positional = args.filter((a, i) => !a.startsWith('--') && args[i - 1] !== '--dir');

const cfg = requireConfig('baseDomain');
const GA_ACCOUNT = cfg.google.gaAccount;
const TIME_ZONE = cfg.google.timeZone;
const CURRENCY = cfg.google.currency;

/* ------------------------------------------------------------------ *
 * One-time per domain: make the service account a verified owner.
 * Ownership of a domain property cascades to every subdomain, so for the
 * base domain this is once ever. A different domain needs its own run.
 * ------------------------------------------------------------------ */
async function verifyDomain(domain) {
  step(`Verifying ${domain} for ${serviceAccountEmail()}`);
  const already = await g('GET', 'https://www.googleapis.com/siteVerification/v1/webResource', {
    scope: SCOPES.siteverification,
  });
  if ((already.items || []).some((i) => i.site?.type === 'INET_DOMAIN' && i.site?.identifier === domain)) {
    skip(`already a verified owner of ${domain}`);
    return true;
  }

  const { token } = await g('POST', 'https://www.googleapis.com/siteVerification/v1/token', {
    scope: SCOPES.siteverification,
    body: { site: { type: 'INET_DOMAIN', identifier: domain }, verificationMethod: 'DNS_TXT' },
  });
  ok('verification token issued');
  if (DRY) return false;

  const zid = await zoneId(domain);
  const existing = await cf('GET', `/zones/${zid}/dns_records?type=TXT&name=${encodeURIComponent(domain)}`);
  if (existing.some((r) => r.content.replace(/^"|"$/g, '') === token)) skip('TXT record already present');
  else {
    await cf('POST', `/zones/${zid}/dns_records`, {
      type: 'TXT', name: domain, content: token, ttl: 60, comment: 'Google Search Console - service account ownership',
    });
    ok('TXT record added to Cloudflare DNS');
  }

  // DNS needs a moment to be visible to Google's resolver: retry, don't sleep blindly.
  for (let attempt = 1; attempt <= 6; attempt++) {
    try {
      await g('POST', 'https://www.googleapis.com/siteVerification/v1/webResource?verificationMethod=DNS_TXT', {
        scope: SCOPES.siteverification,
        body: { site: { type: 'INET_DOMAIN', identifier: domain } },
      });
      ok(`verified - the service account now owns ${domain} and every subdomain`);
      return true;
    } catch (err) {
      if (attempt === 6) throw err;
      warn(`attempt ${attempt} failed (${err.message.slice(0, 80)}), retrying in 20s`);
      await new Promise((r) => setTimeout(r, 20_000));
    }
  }
  return false;
}

/* ------------------------------------------------------------------ *
 * Google Analytics 4
 * ------------------------------------------------------------------ */
async function ensureGa4(site) {
  if (!GA_ACCOUNT) {
    throw new Error('No GA account configured. Run: node setup-google.mjs detect   (after adding the service account in GA)');
  }
  const displayName = site.hostname;
  const list = await g(
    'GET',
    `https://analyticsadmin.googleapis.com/v1beta/properties?filter=${encodeURIComponent(`parent:${GA_ACCOUNT}`)}&pageSize=200`,
    { scope: SCOPES.analytics }
  );
  let property = (list.properties || []).find((p) => p.displayName === displayName);

  if (property) skip(`GA4 property exists: ${property.name}`);
  else if (DRY) {
    log(`  [dry] would create GA4 property "${displayName}"`);
    return null;
  } else {
    property = await g('POST', 'https://analyticsadmin.googleapis.com/v1beta/properties', {
      scope: SCOPES.analytics,
      body: { parent: GA_ACCOUNT, displayName, timeZone: TIME_ZONE, currencyCode: CURRENCY },
    });
    ok(`GA4 property created: ${property.name}`);
  }

  const streams = await g('GET', `https://analyticsadmin.googleapis.com/v1beta/${property.name}/dataStreams?pageSize=50`, {
    scope: SCOPES.analytics,
  });
  let stream = (streams.dataStreams || []).find(
    (s) => s.webStreamData?.defaultUri === site.url || s.displayName === displayName
  );
  if (stream) skip(`data stream exists: ${stream.webStreamData?.measurementId}`);
  else if (DRY) {
    log(`  [dry] would create web data stream for ${site.url}`);
    return null;
  } else {
    stream = await g('POST', `https://analyticsadmin.googleapis.com/v1beta/${property.name}/dataStreams`, {
      scope: SCOPES.analytics,
      body: { type: 'WEB_DATA_STREAM', displayName, webStreamData: { defaultUri: site.url } },
    });
    ok(`data stream created: ${stream.webStreamData?.measurementId}`);
  }
  return { propertyId: property.name.replace('properties/', ''), measurementId: stream.webStreamData?.measurementId || null };
}

function siteDir(slug) {
  const candidates = [dirArg, cfg.workspace && resolve(cfg.workspace, 'sites', slug), resolve('sites', slug), resolve(slug)].filter(Boolean);
  return candidates.find((d) => existsSync(resolve(d, 'src', 'config.ts'))) || null;
}

/** Write the measurement id into config.ts, keeping the nullable type annotation. */
function patchConfig(slug, measurementId) {
  const dir = siteDir(slug);
  if (!dir) return warn(`could not find ${slug}/src/config.ts - pass --dir <site folder>, or set ga4Id by hand`);
  const path = resolve(dir, 'src', 'config.ts');
  const src = readFileSync(path, 'utf8');
  const re = /(ga4Id:\s*)(?:null|'[^']*')(\s*as string \| null)/;
  if (!re.test(src)) return warn(`no ga4Id field found in ${path} - set it by hand`);
  const next = src.replace(re, `$1'${measurementId}'$2`);
  if (next === src) return skip('config.ts already has this measurement id');
  if (DRY) return log(`  [dry] would set ga4Id = '${measurementId}' in ${path}`);
  writeFileSync(path, next, 'utf8');
  ok(`config.ts updated -> ga4Id = '${measurementId}'  (commit it so the tag ships)`);
}

/* ------------------------------------------------------------------ *
 * Google Search Console
 * ------------------------------------------------------------------ */
async function ensureSearchConsole(site) {
  const siteUrl = `${site.url.replace(/\/$/, '')}/`;
  const enc = encodeURIComponent(siteUrl);
  const list = await g('GET', 'https://www.googleapis.com/webmasters/v3/sites', { scope: SCOPES.searchconsole });
  const found = (list.siteEntry || []).find((s) => s.siteUrl === siteUrl);

  if (found) skip(`Search Console property exists (${found.permissionLevel})`);
  else if (DRY) return log(`  [dry] would add Search Console property ${siteUrl}`);
  else {
    await g('PUT', `https://www.googleapis.com/webmasters/v3/sites/${enc}`, { scope: SCOPES.searchconsole });
    ok(`Search Console property added: ${siteUrl}`);
  }

  const sitemap = `${siteUrl}sitemap-index.xml`;
  if (DRY) return log(`  [dry] would submit ${sitemap}`);
  await g('PUT', `https://www.googleapis.com/webmasters/v3/sites/${enc}/sitemaps/${encodeURIComponent(sitemap)}`, {
    scope: SCOPES.searchconsole,
  });
  ok(`sitemap submitted: ${sitemap}`);
  return { siteUrl, sitemap };
}

async function registerSite(slug, reg) {
  const site = reg.sites[slug];
  if (!site) throw new Error(`Unknown slug "${slug}" - run provision-site.mjs first.`);
  step(`${slug} -> ${site.url}`);
  let changed = false;

  if (!flags.has('--gsc-only')) {
    try {
      const ga = await ensureGa4(site);
      if (ga) {
        site.analytics = { ...(site.analytics || {}), ga4PropertyId: ga.propertyId, ga4MeasurementId: ga.measurementId };
        changed = true;
        if (ga.measurementId) patchConfig(slug, ga.measurementId);
      }
    } catch (err) {
      warn(`GA4 failed: ${err.message}`);
    }
  }

  if (!flags.has('--ga-only')) {
    if (/\.pages\.dev$/.test(new URL(site.url).hostname)) {
      warn('pages.dev hosts cannot be verified in Search Console by DNS - attach a real domain first, then re-run.');
    } else {
      try {
        const sc = await ensureSearchConsole(site);
        if (sc) {
          site.searchConsole = sc;
          changed = true;
        }
      } catch (err) {
        warn(`Search Console failed: ${err.message}`);
        if (/permission|forbidden|403/i.test(err.message)) {
          warn(`the service account does not own this domain yet. Run: node register-site.mjs --verify-domain ${site.zone || cfg.baseDomain}`);
        }
      }
    }
  }
  return changed;
}

/* ------------------------------------------------------------------ *
 * Optional: add a human as an owner of the verified domain so the Search
 * Console / Site Verification dashboards show in their own Google account.
 * The Search Console API has no user-management endpoint; owner lists are
 * edited through the Site Verification API.
 * ------------------------------------------------------------------ */
async function addOwner(domain, email) {
  step(`Adding ${email} as an owner of ${domain}`);
  const id = encodeURIComponent(`dns://${domain}`);
  const url = `https://www.googleapis.com/siteVerification/v1/webResource/${id}`;
  const res = await g('GET', url, { scope: SCOPES.siteverification });
  const owners = new Set([...(res.owners || []), serviceAccountEmail()]);
  if (owners.has(email)) return skip('already an owner');
  if (DRY) return log(`  [dry] would add ${email}`);
  owners.add(email);
  await g('PUT', url, {
    scope: SCOPES.siteverification,
    body: { site: res.site, owners: [...owners] },
  });
  ok(`${email} can now see ${domain} in Search Console`);
}

async function main() {
  if (DRY) log('DRY RUN - nothing will be written\n');
  accountId(); // fail early with a useful message if Cloudflare is not set up

  if (flags.has('--add-owner')) {
    const email = args[args.indexOf('--add-owner') + 1];
    if (!email || email.startsWith('--')) throw new Error('usage: --add-owner <google-account-email> [--domain <domain>]');
    const di = args.indexOf('--domain');
    await addOwner(di >= 0 ? args[di + 1] : cfg.baseDomain, email);
    return;
  }

  if (flags.has('--verify-domain')) {
    const i = args.indexOf('--verify-domain');
    const given = args[i + 1] && !args[i + 1].startsWith('--') ? args[i + 1] : null;
    await verifyDomain(given || cfg.baseDomain);
    if (!positional.length || positional[0] === given) return;
  }

  const reg = readRegistry();
  const slugs = flags.has('--all') ? Object.keys(reg.sites) : positional.filter((p) => reg.sites[p] || !flags.has('--verify-domain'));
  if (!slugs.length) {
    log('usage: register-site.mjs <slug> | --all | --verify-domain [domain]');
    process.exit(1);
  }
  let changed = false;
  for (const slug of slugs) changed = (await registerSite(slug, reg)) || changed;
  if (changed && !DRY) {
    writeRegistry(reg);
    log('\nRegistry updated.');
  }
  log('\nDone. Commit the config.ts change so the GA4 tag deploys.');
}

main().catch((err) => {
  console.error(`\nFAILED: ${err.message}`);
  process.exit(1);
});
