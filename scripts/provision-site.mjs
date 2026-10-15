#!/usr/bin/env node
/**
 * Provision all the cloud infrastructure for one marketing site.
 *
 *   node provision-site.mjs <slug> [--apex] [--pages-only] [--no-email]
 *                                  [--email-alias] [--dry-run]
 *
 * Idempotent: every step checks for the existing resource first, so re-running
 * after a partial failure is safe and is the intended recovery path.
 *
 * Creates, in order:
 *   1. a PRIVATE GitHub repo  <owner>/<slug>
 *   2. a Cloudflare Pages project bound to that repo through the Git integration
 *      (push to main -> automatic deploy; no GitHub Actions workflow)
 *   3. DNS CNAME  <slug>.<baseDomain> -> the project's REAL pages.dev host
 *   4. the custom domain on the Pages project
 *   5. Email Routing for that hostname: MX + SPF + an info@ rule
 *   6. a Cloudflare Web Analytics site (cookie-less) and its beacon token
 *
 * --pages-only  skips 3-6 (no base domain yet; the site lives on pages.dev).
 * --apex        use the base domain itself rather than <slug>.<baseDomain>.
 */

import { cf, gh, accountId, zoneId } from './lib/cf.mjs';
import { requireConfig, readRegistry, writeRegistry, step, ok, skip, warn, log } from './lib/config.mjs';

const args = process.argv.slice(2);
const slug = args.find((a) => !a.startsWith('--'));
const isApex = args.includes('--apex');
const pagesOnly = args.includes('--pages-only');
const noEmail = args.includes('--no-email');
const useAlias = args.includes('--email-alias');
const DRY = args.includes('--dry-run');

if (!slug || !/^[a-z0-9]([a-z0-9-]*[a-z0-9])?$/.test(slug)) {
  console.error('usage: provision-site.mjs <slug> [--apex] [--pages-only] [--no-email] [--email-alias] [--dry-run]');
  console.error('slug must be lowercase letters, digits and hyphens.');
  process.exit(1);
}

const cfg = requireConfig('githubOwner', 'accountId', ...(pagesOnly ? [] : ['baseDomain']));
const ACCOUNT = accountId();
const OWNER = cfg.githubOwner;
const BASE = cfg.baseDomain;
const hostname = pagesOnly ? null : isApex ? BASE : `${slug}.${BASE}`;

let destination = cfg.forwardEmail;
if (useAlias && destination?.includes('@')) {
  const [local, domain] = destination.split('@');
  destination = `${local.split('+')[0]}+${slug}@${domain}`;
}

console.log(`Provisioning "${slug}"  ->  ${hostname ? `https://${hostname}` : '(pages.dev only)'}${DRY ? '   (DRY RUN)' : ''}`);

// ---------------------------------------------------------------- GitHub repo
step(`GitHub repo ${OWNER}/${slug} (private)`);
let repoId = gh(['api', `repos/${OWNER}/${slug}`, '--jq', '.id'], { allowFail: true });
if (repoId) {
  const priv = gh(['api', `repos/${OWNER}/${slug}`, '--jq', '.private'], { allowFail: true });
  skip(`already exists (id ${repoId})`);
  if (priv !== 'true') warn('this repo is PUBLIC. Marketing-site repos must be private - fix it before going further.');
} else if (DRY) {
  skip('would create');
} else {
  gh(['repo', 'create', `${OWNER}/${slug}`, '--private', '--description', `Marketing site - ${hostname || slug}`]);
  repoId = gh(['api', `repos/${OWNER}/${slug}`, '--jq', '.id']);
  ok(`created (id ${repoId})`);
}
const ownerId = gh(['api', `users/${OWNER}`, '--jq', '.id'], { allowFail: true });

// -------------------------------------------------------- Cloudflare Pages
step(`Cloudflare Pages project "${slug}"`);
let project = await cf('GET', `/accounts/${ACCOUNT}/pages/projects/${slug}`, undefined, { tolerate: [8000007, 8000005] }).catch(() => null);
if (project?.tolerated) project = null;

if (project) {
  skip(`already exists (source: ${project.source?.type ?? 'none'})`);
} else if (DRY) {
  skip('would create with the GitHub source');
} else {
  try {
    project = await cf('POST', `/accounts/${ACCOUNT}/pages/projects`, {
      name: slug,
      production_branch: 'main',
      source: {
        type: 'github',
        config: {
          owner: OWNER,
          owner_id: String(ownerId),
          repo_name: slug,
          repo_id: String(repoId),
          production_branch: 'main',
          deployments_enabled: true,
          production_deployments_enabled: true,
          pr_comments_enabled: false,
          preview_deployment_setting: 'all',
          preview_branch_includes: ['*'],
          preview_branch_excludes: [],
          path_includes: ['*'],
          path_excludes: [],
        },
      },
      build_config: { build_command: 'npm run build', destination_dir: 'dist', root_dir: '' },
      deployment_configs: {
        production: { compatibility_date: '2026-08-01' },
        preview: { compatibility_date: '2026-08-01' },
      },
    });
    ok('created with the GitHub Git integration (push-to-deploy, no Actions)');
  } catch (err) {
    warn(`could not create the Pages project: ${err.message}`);
    warn('The usual cause is that the Cloudflare Pages GitHub App is not installed on this GitHub account.');
    warn(`Install it (one click, once): https://github.com/apps/cloudflare-workers-and-pages/installations/new`);
    warn('then re-run this script.');
    process.exit(1);
  }
}

/*
 * The pages.dev host is NOT always <project>.pages.dev. The namespace is global
 * across every Cloudflare account; if the name is taken Cloudflare silently hands
 * back a suffixed one (e.g. "name-5p4"). Pointing a CNAME at the unsuffixed name
 * aims it at a stranger's site -> error 1014 "CNAME Cross-User Banned", while the
 * custom domain sits at "pending" with the misleading "CNAME record not set".
 * Always read the real subdomain back; never construct it.
 */
const live = project || (await cf('GET', `/accounts/${ACCOUNT}/pages/projects/${slug}`).catch(() => null));
const pagesHost = live?.subdomain || `${slug}.pages.dev`;
if (live && pagesHost !== `${slug}.pages.dev`) warn(`pages.dev name was taken - this project is ${pagesHost}`);

let emailReady = false;
let cfAnalyticsToken = null;

if (!pagesOnly) {
  // ------------------------------------------------------------------- DNS
  const zid = await zoneId(BASE);
  step(`DNS ${hostname} -> ${pagesHost}`);
  const records = await cf('GET', `/zones/${zid}/dns_records?name=${encodeURIComponent(hostname)}&type=CNAME`);
  if (records.length) {
    const rec = records[0];
    if (rec.content === pagesHost) skip('CNAME already correct');
    else if (DRY) skip(`would repoint CNAME ${rec.content} -> ${pagesHost}`);
    else {
      await cf('PATCH', `/zones/${zid}/dns_records/${rec.id}`, { content: pagesHost, proxied: true });
      ok(`CNAME repointed ${rec.content} -> ${pagesHost}`);
    }
  } else if (DRY) {
    skip('would create CNAME');
  } else {
    await cf('POST', `/zones/${zid}/dns_records`, {
      type: 'CNAME',
      name: hostname,
      content: pagesHost,
      proxied: true,
      comment: `Marketing site: ${slug}`,
    });
    ok('CNAME created (proxied)');
  }

  // --------------------------------------------------- Pages custom domain
  step(`Custom domain ${hostname} on the Pages project`);
  const domains = await cf('GET', `/accounts/${ACCOUNT}/pages/projects/${slug}/domains`).catch(() => []);
  if (Array.isArray(domains) && domains.some((d) => d.name === hostname)) skip('already attached');
  else if (DRY) skip('would attach');
  else {
    try {
      await cf('POST', `/accounts/${ACCOUNT}/pages/projects/${slug}/domains`, { name: hostname });
      ok('attached (the certificate issues within a few minutes)');
    } catch (err) {
      warn(`could not attach ${hostname}: ${err.message}`);
      warn('if another Pages project still holds this hostname, detach it there first');
    }
  }

  // ----------------------------------------------------------- Email routing
  if (noEmail || !destination) {
    step('Email routing - skipped');
  } else {
    step(`Email routing for ${hostname}`);
    const dests = await cf('GET', `/accounts/${ACCOUNT}/email/routing/addresses?per_page=100`);
    const dest = dests.find((d) => d.email.toLowerCase() === destination.toLowerCase());
    if (!dest) {
      if (DRY) skip(`would create destination ${destination}`);
      else {
        await cf('POST', `/accounts/${ACCOUNT}/email/routing/addresses`, { email: destination });
        ok(`destination ${destination} created - open that inbox and click the Cloudflare verification link`);
      }
    } else if (!dest.verified) {
      warn(`destination ${destination} exists but is NOT verified - click the link Cloudflare emailed to it`);
    } else {
      skip(`destination ${destination} already verified`);
      emailReady = true;
    }

    // A subdomain only receives mail once it has its own MX + SPF records. The
    // dashboard's "Subdomains" toggle does this and has no public API, so the
    // apex's records are mirrored onto the subdomain here.
    if (!isApex && !DRY) {
      const apexMx = await cf('GET', `/zones/${zid}/dns_records?type=MX&name=${encodeURIComponent(BASE)}`);
      const subMx = await cf('GET', `/zones/${zid}/dns_records?type=MX&name=${encodeURIComponent(hostname)}`);
      if (subMx.length) skip('subdomain MX records already present');
      else if (!apexMx.length) {
        warn(`${BASE} has no MX records - enable Email Routing on the zone first: Cloudflare dashboard -> ${BASE} -> Email -> Email Routing`);
      } else {
        for (const m of apexMx) {
          await cf('POST', `/zones/${zid}/dns_records`, {
            type: 'MX', name: hostname, content: m.content, priority: m.priority, comment: `Email Routing for ${slug}`,
          });
        }
        ok(`${apexMx.length} MX records created on ${hostname}`);
      }
      const subTxt = await cf('GET', `/zones/${zid}/dns_records?type=TXT&name=${encodeURIComponent(hostname)}`);
      if (subTxt.some((r) => r.content.includes('v=spf1'))) skip('subdomain SPF already present');
      else {
        await cf('POST', `/zones/${zid}/dns_records`, {
          type: 'TXT', name: hostname, content: '"v=spf1 include:_spf.mx.cloudflare.net ~all"', comment: `Email Routing for ${slug}`,
        });
        ok('SPF record created');
      }
    }

    if (emailReady && !DRY) {
      const rules = await cf('GET', `/zones/${zid}/email/routing/rules?per_page=100`);
      const wanted = `info@${hostname}`;
      if (rules.some((r) => (r.matchers || []).some((m) => m.value === wanted))) skip(`rule for ${wanted} already exists`);
      else {
        await cf('POST', `/zones/${zid}/email/routing/rules`, {
          name: wanted,
          enabled: true,
          matchers: [{ type: 'literal', field: 'to', value: wanted }],
          actions: [{ type: 'forward', value: [destination] }],
        });
        ok(`${wanted} -> ${destination}`);
      }
    } else if (!emailReady && !DRY) {
      warn('routing rules NOT created - verify the destination address, then re-run this script');
    }
  }

  // ------------------------------------------------------ Web Analytics (RUM)
  step(`Cloudflare Web Analytics for ${hostname}`);
  const sites = await cf('GET', `/accounts/${ACCOUNT}/rum/site_info/list?per_page=100`).catch((e) => {
    warn(`cannot list Web Analytics sites: ${e.message}`);
    return null;
  });
  const have = (sites || []).find((s) => s.host === hostname || s.ruleset?.zone_name === hostname);
  if (have) {
    cfAnalyticsToken = have.site_token;
    skip('already exists');
  } else if (DRY) {
    skip('would create');
  } else if (sites) {
    const created = await cf('POST', `/accounts/${ACCOUNT}/rum/site_info`, { host: hostname, auto_install: false });
    cfAnalyticsToken = created.site_token;
    ok('created (cookie-less, no consent banner needed)');
  }
}

// -------------------------------------------------------------- registry
if (!DRY) {
  const reg = readRegistry();
  reg.sites[slug] = {
    ...(reg.sites[slug] || {}),
    slug,
    hostname: hostname || pagesHost,
    url: `https://${hostname || pagesHost}`,
    repo: `${OWNER}/${slug}`,
    repoPrivate: true,
    pagesProject: slug,
    pagesUrl: `https://${pagesHost}`,
    ...(hostname ? { email: `info@${hostname}`, emailForwardsTo: destination || null, emailVerified: emailReady, zone: BASE } : {}),
    isApex,
    cloudflareAnalyticsToken: cfAnalyticsToken || reg.sites[slug]?.cloudflareAnalyticsToken || null,
  };
  writeRegistry(reg);
  step('Registry updated');
}

log(`
Done. ${hostname || pagesHost}
  repo    https://github.com/${OWNER}/${slug}  (private)
  pages   https://dash.cloudflare.com/${ACCOUNT}/pages/view/${slug}
  deploy  push to main -> Cloudflare builds and deploys automatically
${hostname && !noEmail && destination ? `  email   info@${hostname} -> ${destination}${emailReady ? '' : '   (PENDING VERIFICATION)'}\n` : ''}`);
