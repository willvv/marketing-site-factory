#!/usr/bin/env node
/**
 * One-time Cloudflare onboarding: trade the Global API Key for a scoped token.
 *
 *   node setup-cloudflare.mjs --domain example.com [--forward-email you@gmail.com]
 *                             [--github-owner <login>] [--account-id <id>]
 *                             [--keep-global-key] [--dry-run]
 *
 * The Global API Key is read from the CF_GLOBAL_API_KEY / CF_ACCOUNT_EMAIL
 * environment variables, or typed at a hidden prompt. It is used ONCE to mint a
 * scoped API token (Pages, Workers, DNS, Email Routing, redirects) and is then
 * discarded unless --keep-global-key is passed.
 *
 * Run this in YOUR OWN terminal, not through an AI assistant, so the key never
 * enters a chat transcript.
 *
 * Where to get the key: https://dash.cloudflare.com/profile/api-tokens
 *   -> "API Keys" section -> "Global API Key" -> View.
 */

import { randomBytes } from 'node:crypto';
import { execFileSync } from 'node:child_process';
import { createInterface } from 'node:readline';
import { Writable } from 'node:stream';
import { loadConfig, loadCredentials, saveConfigPatch, saveCredentialsPatch, paths, step, ok, skip, warn, fail, log } from './lib/config.mjs';

const API = 'https://api.cloudflare.com/client/v4';
const args = process.argv.slice(2);
const flag = (n) => args.includes(`--${n}`);
const opt = (n) => {
  const i = args.indexOf(`--${n}`);
  return i >= 0 ? args[i + 1] : null;
};
const DRY = flag('dry-run');

/** Permission groups the scripts need, by their exact Cloudflare names. */
const ACCOUNT_GROUPS = [
  'Account Settings Read',
  'Pages Write',
  'Workers Scripts Write',
  'D1 Write',
  'Email Routing Addresses Write',
  'Email Routing Addresses Read',
];
const ZONE_GROUPS = [
  'Zone Read',
  'DNS Write',
  'Email Routing Rules Write',
  'Workers Routes Write',
  'Dynamic URL Redirects Write',
  'Zone Settings Read',
];
const USER_GROUPS = ['User Details Read', 'Memberships Read'];

async function ask(question, { hidden = false } = {}) {
  if (!process.stdin.isTTY) {
    throw new Error(`"${question.trim()}" needs an interactive terminal. Set the matching environment variable instead.`);
  }
  const mutable = new Writable({
    write(chunk, enc, cb) {
      if (!hidden || !this.muted) process.stdout.write(chunk, enc);
      cb();
    },
  });
  const rl = createInterface({ input: process.stdin, output: mutable, terminal: true });
  return new Promise((resolve) => {
    process.stdout.write(question);
    mutable.muted = hidden;
    rl.question('', (answer) => {
      rl.close();
      if (hidden) process.stdout.write('\n');
      resolve(answer.trim());
    });
  });
}

async function globalCall(email, key, method, path, body) {
  const res = await fetch(`${API}${path}`, {
    method,
    headers: { 'X-Auth-Email': email, 'X-Auth-Key': key, 'Content-Type': 'application/json' },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  const json = await res.json();
  if (!json.success) {
    throw new Error(`${method} ${path} -> ${(json.errors || []).map((e) => `${e.code}: ${e.message}`).join('; ')}`);
  }
  return json.result;
}

async function tokenCall(token, path) {
  const res = await fetch(`${API}${path}`, { headers: { Authorization: `Bearer ${token}` } });
  const json = await res.json();
  return json;
}

async function main() {
  log(`marketing-site-factory - Cloudflare setup${DRY ? '   (DRY RUN: nothing is created)' : ''}`);
  const existing = loadConfig();
  const creds = loadCredentials();

  const domain = (opt('domain') || existing.baseDomain || '').toLowerCase();
  if (!domain) throw new Error('Pass --domain <your-base-domain.com> (a domain already on your Cloudflare account).');

  // ---- global key -----------------------------------------------------------
  step('Global API Key');
  let email = creds.cfEmail || process.env.CF_ACCOUNT_EMAIL;
  let key = process.env.CF_GLOBAL_API_KEY || creds.cfGlobalKey;
  if (!email) email = await ask('Cloudflare account email: ');
  if (!key) key = await ask('Cloudflare Global API Key (input hidden): ', { hidden: true });
  if (!email || !key) throw new Error('Email and Global API Key are both required.');

  const user = await globalCall(email, key, 'GET', '/user');
  ok(`authenticated as ${user.email}`);

  // ---- account + zone ---------------------------------------------------------
  // A login can own several Cloudflare accounts. Guessing the first one would put
  // the token, the Pages projects and the DNS records in the wrong place, so the
  // account is chosen by where the base domain's zone actually lives.
  step(`Account and zone for ${domain}`);
  const accounts = await globalCall(email, key, 'GET', '/accounts?per_page=50');
  if (!accounts.length) throw new Error('This login has no Cloudflare accounts.');
  const zoneHits = await globalCall(email, key, 'GET', `/zones?name=${encodeURIComponent(domain)}`);
  const explicit = opt('account-id') || existing.accountId;

  let account = explicit ? accounts.find((a) => a.id === explicit) : null;
  if (explicit && !account) throw new Error(`Account ${explicit} is not visible to this login.`);
  if (!account && zoneHits.length) account = accounts.find((a) => a.id === zoneHits[0].account?.id) || null;
  if (!account && accounts.length === 1) account = accounts[0];
  if (!account) {
    fail(`${domain} is not a zone on any of this login's ${accounts.length} accounts, so the account cannot be inferred:`);
    for (const a of accounts) log(`      ${a.id}  ${a.name}`);
    log(`      Add the domain first: https://dash.cloudflare.com/?to=/:account/add-site`);
    log(`      then set the nameservers at your registrar to the two Cloudflare gives you.`);
    log(`      (Don't have a domain yet? https://dash.cloudflare.com/?to=/:account/domains/register)`);
    log(`      Or choose an account explicitly with --account-id <id>.`);
    process.exit(1);
  }
  ok(`account: ${account.name} (${account.id})`);
  const zone0 = zoneHits.find((z) => z.account?.id === account.id);
  if (zone0) ok(`zone ${domain} found (${zone0.status})`);
  else {
    fail(`${domain} is not a zone on this account yet.`);
    log(`      Add it: https://dash.cloudflare.com/?to=/:account/add-site, set the registrar nameservers, re-run.`);
    if (!DRY) process.exit(1);
  }

  // ---- permission groups ----------------------------------------------------
  step('Permission groups');
  const groups = await globalCall(email, key, 'GET', '/user/tokens/permission_groups');
  const byName = new Map(groups.map((g) => [g.name, g]));
  const resolve = (names, label) => {
    const out = [];
    for (const n of names) {
      const g = byName.get(n);
      if (g) out.push({ id: g.id, name: n });
      else warn(`${label}: no permission group named "${n}" - skipped (Cloudflare may have renamed it)`);
    }
    return out;
  };
  const acct = resolve(ACCOUNT_GROUPS, 'account');
  const zone = resolve(ZONE_GROUPS, 'zone');
  const usr = resolve(USER_GROUPS, 'user');
  ok(`${acct.length} account + ${zone.length} zone + ${usr.length} user permissions resolved`);

  const body = {
    name: `marketing-site-factory ${new Date().toISOString().slice(0, 10)}`,
    policies: [
      {
        effect: 'allow',
        resources: { [`com.cloudflare.api.account.${account.id}`]: '*' },
        permission_groups: acct.map((g) => ({ id: g.id })),
      },
      {
        effect: 'allow',
        resources: { 'com.cloudflare.api.account.zone.*': '*' },
        permission_groups: zone.map((g) => ({ id: g.id })),
      },
      {
        effect: 'allow',
        resources: { [`com.cloudflare.api.user.${user.id}`]: '*' },
        permission_groups: usr.map((g) => ({ id: g.id })),
      },
    ].filter((p) => p.permission_groups.length),
  };

  if (DRY) {
    log('\nWould create a token with:');
    for (const g of [...acct, ...zone, ...usr]) log(`  - ${g.name}`);
    log(`\nWould write ${paths.CONFIG_PATH} and ${paths.CRED_PATH}`);
    return;
  }

  // ---- mint -----------------------------------------------------------------
  step('Minting a scoped API token');
  const minted = await globalCall(email, key, 'POST', '/user/tokens', body);
  ok(`token "${minted.name}" created (id ${minted.id}); its value is stored locally, never printed`);

  // ---- smoke test with the NEW token, not the global key ---------------------
  step('Smoke test with the new token');
  const checks = [
    ['verify token', '/user/tokens/verify'],
    ['list zones', `/zones?name=${encodeURIComponent(domain)}`],
    ['list Pages projects', `/accounts/${account.id}/pages/projects`],
    ['list Email Routing destinations', `/accounts/${account.id}/email/routing/addresses`],
    ['list Web Analytics sites', `/accounts/${account.id}/rum/site_info/list`],
  ];
  let allOk = true;
  for (const [label, path] of checks) {
    const j = await tokenCall(minted.value, path);
    if (j.success) ok(label);
    else {
      allOk = false;
      warn(`${label}: ${(j.errors || []).map((e) => `${e.code} ${e.message}`).join('; ')}`);
    }
  }
  if (!allOk) {
    warn('Some calls failed. If it is only "Web Analytics", re-run with --keep-global-key so provisioning can fall back to it.');
  }

  // ---- persist --------------------------------------------------------------
  let githubOwner = opt('github-owner') || existing.githubOwner;
  if (!githubOwner) {
    try {
      githubOwner = execFileSync('gh', ['api', 'user', '--jq', '.login'], { encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'] }).trim();
    } catch {
      warn('could not read your GitHub login from `gh` - run `gh auth login`, then pass --github-owner <login> or re-run.');
    }
  }
  const forwardEmail = opt('forward-email') || existing.forwardEmail || user.email;

  saveCredentialsPatch({
    cfApiToken: minted.value,
    cfEmail: email,
    ...(flag('keep-global-key') ? { cfGlobalKey: key } : { cfGlobalKey: null }),
  });
  saveConfigPatch({
    cloudflare: { accountId: account.id },
    baseDomain: domain,
    githubOwner: githubOwner || null,
    forwardEmail,
    indexnowKey: existing.indexnowKey || randomBytes(16).toString('hex'),
  });
  ok(`saved ${paths.CONFIG_PATH}`);
  ok(`saved ${paths.CRED_PATH}${flag('keep-global-key') ? ' (global key kept at your request)' : ' (global key NOT stored)'}`);

  log(`
Done. Notes:
  - Email Routing forwards to ${forwardEmail}. Cloudflare must verify that address once:
    the first provisioning run creates it and tells you to click the link in the email.
  - The Cloudflare Pages GitHub App must be installed on ${githubOwner || 'your GitHub account'} (one click, once):
    https://github.com/apps/cloudflare-workers-and-pages/installations/new
  - Revoke the minted token any time: https://dash.cloudflare.com/profile/api-tokens
`);
}

main().catch((err) => {
  console.error(`\nFAILED: ${err.message}`);
  process.exit(1);
});
