#!/usr/bin/env node
/**
 * One-time Google onboarding for GA4 + Search Console automation.
 *
 *   node setup-google.mjs gcloud [--project <id>] [--name msf-automation]
 *       Uses the `gcloud` CLI (must be logged in) to: create/select a Cloud project,
 *       enable the three APIs, create a service account and download its key.
 *
 *   node setup-google.mjs detect [--timezone America/Mexico_City] [--currency MXN]
 *       After you add the service account as Administrator in Google Analytics,
 *       finds the GA account it can see and saves it, with the time zone/currency
 *       new GA4 properties will be created with.
 *
 *   node setup-google.mjs status
 *       Prints the service-account email and what it can currently see.
 *
 * No gcloud? references/onboarding.md has the same steps as clickable links.
 */

import { execSync } from 'node:child_process';
import { existsSync, mkdirSync, chmodSync } from 'node:fs';
import { dirname } from 'node:path';
import { loadConfig, saveConfigPatch, step, ok, skip, warn, fail, log } from './lib/config.mjs';
import { g, SCOPES, serviceAccountEmail } from './lib/google.mjs';

const [cmd, ...rest] = process.argv.slice(2);
const opt = (n, d = null) => {
  const i = rest.indexOf(`--${n}`);
  return i >= 0 ? rest[i + 1] : d;
};

const API_LIST = ['analyticsadmin.googleapis.com', 'searchconsole.googleapis.com', 'siteverification.googleapis.com'];

function gcloud(args, { allowFail = false } = {}) {
  // gcloud is a .cmd shim on Windows, so it is run through a shell as one string.
  // Every argument here is a fixed literal or a validated project/account id.
  const q = (a) => (/^[\w@.=:\/,-]+$/.test(a) ? a : `"${a.replace(/"/g, '')}"`);
  try {
    return execSync(['gcloud', ...args.map(q)].join(' '), { encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] }).trim();
  } catch (err) {
    if (allowFail) return null;
    throw new Error(`gcloud ${args.join(' ')} failed:
${(err.stderr || err.message).toString().trim()}`);
  }
}

async function setupGcloud() {
  const cfg = loadConfig();
  step('gcloud');
  const who = gcloud(['auth', 'list', '--filter=status:ACTIVE', '--format=value(account)'], { allowFail: true });
  if (!who) {
    fail('gcloud is not installed or not logged in.');
    log('      Install: https://cloud.google.com/sdk/docs/install   then run:  gcloud auth login');
    log('      No gcloud? Follow the manual steps in references/onboarding.md instead.');
    process.exit(1);
  }
  ok(`logged in as ${who}`);

  const project = opt('project') || `msf-${Math.random().toString(36).slice(2, 8)}-automation`;
  step(`Cloud project ${project}`);
  const exists = gcloud(['projects', 'describe', project, '--format=value(projectId)'], { allowFail: true });
  if (exists) skip('already exists');
  else {
    gcloud(['projects', 'create', project, '--name', 'Marketing site automation']);
    ok('created');
  }

  step('Enabling APIs');
  gcloud(['services', 'enable', ...API_LIST, '--project', project]);
  ok(API_LIST.join(', '));

  const saName = opt('name', 'msf-automation');
  const email = `${saName}@${project}.iam.gserviceaccount.com`;
  step(`Service account ${email}`);
  const saExists = gcloud(['iam', 'service-accounts', 'describe', email, '--project', project, '--format=value(email)'], { allowFail: true });
  if (saExists) skip('already exists');
  else {
    gcloud(['iam', 'service-accounts', 'create', saName, '--project', project, '--display-name', 'Marketing site automation']);
    ok('created');
  }

  const keyPath = cfg.google.saKeyPath;
  step(`Key -> ${keyPath}`);
  if (existsSync(keyPath)) skip('key file already present (not overwritten)');
  else {
    mkdirSync(dirname(keyPath), { recursive: true });
    gcloud(['iam', 'service-accounts', 'keys', 'create', keyPath, '--iam-account', email, '--project', project]);
    try {
      chmodSync(keyPath, 0o600);
    } catch {
      /* windows */
    }
    ok('key written (never commit this file)');
  }
  saveConfigPatch({ google: { saKeyPath: keyPath, project, serviceAccount: email } });

  log(`
NEXT - one manual step, because Google offers no API for the first access grant:
  1. Open Google Analytics:        https://analytics.google.com/analytics/web/#/admin
  2. Choose your ACCOUNT (not property) -> "Account access management" -> "+" -> "Add users"
  3. Email:  ${email}
     Role:   Administrator      (Notify by email: off)
  Don't have a GA account yet? Create one first: https://analytics.google.com/  -> Start measuring.
  Then run:  node setup-google.mjs detect
`);
}

async function detect() {
  step('Looking for a Google Analytics account visible to the service account');
  log(`  service account: ${serviceAccountEmail()}`);
  const res = await g('GET', 'https://analyticsadmin.googleapis.com/v1beta/accountSummaries?pageSize=50', {
    scope: SCOPES.analytics,
  });
  const accounts = res.accountSummaries || [];
  if (!accounts.length) {
    fail('no GA accounts visible. Add the service account as Administrator on your GA account first (see the NEXT step above).');
    process.exit(1);
  }
  for (const a of accounts) log(`  ${a.account}  ${a.displayName}`);
  const chosen = opt('account') || accounts[0].account;
  if (accounts.length > 1 && !opt('account')) warn(`several accounts visible; using ${chosen}. Pass --account accounts/<id> to choose.`);
  saveConfigPatch({
    google: {
      gaAccount: chosen,
      timeZone: opt('timezone', loadConfig().google.timeZone),
      currency: opt('currency', loadConfig().google.currency),
    },
  });
  ok(`saved GA account ${chosen}`);
}

async function status() {
  log(`service account: ${serviceAccountEmail()}`);
  const cfg = loadConfig();
  log(`GA account:      ${cfg.google.gaAccount || '(not detected yet - run: setup-google.mjs detect)'}`);
  const sites = await g('GET', 'https://www.googleapis.com/webmasters/v3/sites', { scope: SCOPES.searchconsole });
  log(`Search Console properties visible: ${(sites.siteEntry || []).length}`);
  const ver = await g('GET', 'https://www.googleapis.com/siteVerification/v1/webResource', { scope: SCOPES.siteverification });
  for (const i of ver.items || []) log(`  verified: ${i.site?.type} ${i.site?.identifier}`);
}

const run = { gcloud: setupGcloud, detect, status }[cmd];
if (!run) {
  console.error('usage: setup-google.mjs gcloud | detect | status');
  process.exit(1);
}
run().catch((err) => {
  console.error(`\nFAILED: ${err.message}`);
  process.exit(1);
});
