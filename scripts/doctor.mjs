#!/usr/bin/env node
/**
 * Prerequisite check. Run it first, and again whenever something fails.
 *
 *   node doctor.mjs            human-readable report with the exact fix for every gap
 *   node doctor.mjs --strict   exit 1 if any REQUIRED item is missing (default exit code)
 *
 * Read-only: it never creates or changes anything.
 */

import { execSync } from 'node:child_process';
import { existsSync, readFileSync } from 'node:fs';
import { homedir } from 'node:os';
import { join } from 'node:path';
import { loadConfig, loadCredentials, readRegistry, paths } from './lib/config.mjs';
import { findImagegen } from './lib/imagegen.mjs';

const results = [];
const add = (level, area, name, detail, fix) => results.push({ level, area, name, detail, fix });
const pass = (area, name, detail = '') => add('pass', area, name, detail);
const need = (area, name, detail, fix) => add('required', area, name, detail, fix);
const want = (area, name, detail, fix) => add('recommended', area, name, detail, fix);

function run(cmd, args) {
  // Fixed literal arguments only. execSync (not execFile + shell) so Windows .cmd
  // shims such as npm resolve without Node's "args with shell" deprecation warning.
  try {
    return execSync(`${cmd} ${args.join(' ')}`, { encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] }).trim();
  } catch {
    return null;
  }
}

// ---------------------------------------------------------------- tooling
const nodeMajor = Number(process.versions.node.split('.')[0]);
nodeMajor >= 18
  ? pass('Tooling', 'Node.js', process.versions.node)
  : need('Tooling', 'Node.js >= 18', process.versions.node, 'Install the LTS from https://nodejs.org/');
if (nodeMajor < 22) {
  want('Tooling', 'Node.js >= 22 (only if you will deploy Cloudflare Workers with wrangler)', process.versions.node, 'https://nodejs.org/ - wrangler v4 refuses to run on Node 20');
}

run('git', ['--version'])
  ? pass('Tooling', 'git', run('git', ['--version']))
  : need('Tooling', 'git', 'not found', 'https://git-scm.com/downloads');

run('npm', ['--version'])
  ? pass('Tooling', 'npm', run('npm', ['--version']))
  : need('Tooling', 'npm', 'not found', 'Comes with Node.js: https://nodejs.org/');

// ----------------------------------------------------------------- GitHub
const ghVersion = run('gh', ['--version']);
if (!ghVersion) {
  need('GitHub', 'GitHub CLI (gh)', 'not found', 'Install: https://cli.github.com/  (winget install GitHub.cli | brew install gh)  then: gh auth login');
} else {
  pass('GitHub', 'GitHub CLI', ghVersion.split('\n')[0]);
  const status = run('gh', ['auth', 'status']);
  if (!status) need('GitHub', 'gh logged in', 'not logged in', 'Run: gh auth login   (choose GitHub.com -> HTTPS -> browser)');
  else {
    pass('GitHub', 'gh logged in', (run('gh', ['api', 'user', '--jq', '.login']) || '').trim());
    // Keyring logins from `gh auth login` carry `repo`; a fine-grained PAT may not.
    /repo/.test(status)
      ? pass('GitHub', 'token can create repos', 'repo scope present')
      : want('GitHub', 'token can create repos', 'could not confirm the `repo` scope', 'Run: gh auth refresh -s repo');
  }
}

// ------------------------------------------------------------- Cloudflare
const cfg = loadConfig();
const creds = loadCredentials();
if (!creds.cfApiToken && !(creds.cfGlobalKey && creds.cfEmail)) {
  need('Cloudflare', 'credentials', `none in ${paths.CRED_PATH}`, 'Create a free account at https://dash.cloudflare.com/sign-up , add your domain, then run (in YOUR terminal): node setup-cloudflare.mjs --domain <your-domain.com>');
} else {
  try {
    const headers = creds.cfApiToken
      ? { Authorization: `Bearer ${creds.cfApiToken}` }
      : { 'X-Auth-Email': creds.cfEmail, 'X-Auth-Key': creds.cfGlobalKey };
    const verifyPath = creds.cfApiToken ? '/user/tokens/verify' : '/user';
    const v = await fetch(`https://api.cloudflare.com/client/v4${verifyPath}`, { headers }).then((r) => r.json());
    v.success
      ? pass('Cloudflare', 'credentials valid', creds.cfApiToken ? 'scoped API token' : 'global key (consider minting a scoped token: setup-cloudflare.mjs)')
      : need('Cloudflare', 'credentials valid', (v.errors || []).map((e) => e.message).join('; '), 'Re-run setup-cloudflare.mjs');
    if (v.success && cfg.accountId && cfg.baseDomain) {
      const z = await fetch(`https://api.cloudflare.com/client/v4/zones?name=${cfg.baseDomain}`, { headers }).then((r) => r.json());
      z.success && z.result?.length
        ? pass('Cloudflare', `base domain ${cfg.baseDomain}`, `zone ${z.result[0].status}`)
        : need('Cloudflare', `base domain ${cfg.baseDomain}`, 'zone not found or token cannot see it', 'Add the domain: https://dash.cloudflare.com/?to=/:account/add-site and set the registrar nameservers');
    }
  } catch (err) {
    need('Cloudflare', 'API reachable', err.message, 'Check your network connection');
  }
  cfg.accountId
    ? pass('Cloudflare', 'account id', cfg.accountId)
    : need('Cloudflare', 'account id', 'not configured', 'Run setup-cloudflare.mjs');
  cfg.githubOwner
    ? pass('Config', 'GitHub owner', cfg.githubOwner)
    : need('Config', 'GitHub owner', 'not configured', 'Run setup-cloudflare.mjs --github-owner <login>');
}
want(
  'Cloudflare',
  'Cloudflare Pages GitHub App installed',
  'cannot be checked from here',
  'One click, once: https://github.com/apps/cloudflare-workers-and-pages/installations/new  - without it, Pages project creation fails with a source/repo error'
);

// ----------------------------------------------------------------- Imagery
const py = run('python', ['--version']) || run('python3', ['--version']);
py
  ? pass('Images', 'Python', py)
  : need('Images', 'Python 3.9+', 'not found', 'https://www.python.org/downloads/ (the chatgpt-imagegen CLI is a single Python file)');

const imagegen = findImagegen();
if (!imagegen) {
  need('Images', 'chatgpt-imagegen skill', 'not installed', 'Install:  npx skills add leeguooooo/chatgpt-imagegen -g   (source: https://github.com/leeguooooo/chatgpt-imagegen)');
} else {
  pass('Images', 'chatgpt-imagegen skill', imagegen);
}
const codexAuth = join(homedir(), '.codex', 'auth.json');
if (existsSync(codexAuth)) {
  let oauth = false;
  try {
    oauth = Boolean(JSON.parse(readFileSync(codexAuth, 'utf8'))?.tokens?.access_token);
  } catch {
    /* ignore */
  }
  oauth
    ? pass('Images', 'image backend signed in', 'ChatGPT subscription via Codex login')
    : need('Images', 'image backend signed in', '~/.codex/auth.json has no ChatGPT login (an API key does not count)', 'Run: codex login   (sign in with the ChatGPT account that has the subscription)');
} else {
  need('Images', 'image backend signed in', '~/.codex/auth.json not found', 'Run: npm i -g @openai/codex   then: codex login   (needs a ChatGPT Plus/Pro subscription)');
}

// ------------------------------------------------------------------ Design
const skillDirs = [join(homedir(), '.claude', 'skills'), join(homedir(), '.agents', 'skills')];
const hasSkill = (n) => skillDirs.some((d) => existsSync(join(d, n, 'SKILL.md')));
hasSkill('apple-design')
  ? pass('Design', 'apple-design skill', 'installed')
  : need('Design', 'apple-design skill', 'not installed', 'Run: node install-skills.mjs   (downloads emilkowalski/skills apple-design into ~/.claude/skills/)');
let uiuxPlugin = false;
try {
  uiuxPlugin = readFileSync(join(homedir(), '.claude', 'plugins', 'installed_plugins.json'), 'utf8').includes('ui-ux-pro-max');
} catch {
  /* no plugins file */
}
hasSkill('ui-ux-pro-max') || uiuxPlugin
  ? pass('Design', 'ui-ux-pro-max (palette/type input)', 'installed')
  : want('Design', 'ui-ux-pro-max plugin', 'not found', 'Optional, used for palette and type input. In Claude Code: /plugin marketplace add nextlevelbuilder/ui-ux-pro-max-skill  then  /plugin install ui-ux-pro-max@ui-ux-pro-max-skill');

// ------------------------------------------------------------------ Google
const saPath = cfg.google.saKeyPath;
if (!existsSync(saPath)) {
  need('Google', 'service-account key', `not found at ${saPath}`, 'Run: node setup-google.mjs gcloud   (or follow references/onboarding.md "Google")');
} else {
  try {
    const { token, SCOPES } = await import('./lib/google.mjs');
    await token(SCOPES.analytics);
    pass('Google', 'service-account key', 'token exchange works');
  } catch (err) {
    need('Google', 'service-account key', err.message.slice(0, 120), 'Re-create the key: gcloud iam service-accounts keys create <path> --iam-account=<sa-email>');
  }
  cfg.google.gaAccount
    ? pass('Google', 'GA4 account', cfg.google.gaAccount)
    : need('Google', 'GA4 account', 'not detected', 'Add the service account as Administrator in GA (https://analytics.google.com/analytics/web/#/admin -> Account access management), then: node setup-google.mjs detect');
}

// ------------------------------------------------------- Bing / IndexNow
cfg.indexnowKey
  ? pass('Search', 'IndexNow key', 'generated')
  : need('Search', 'IndexNow key', 'not generated', 'Re-run setup-cloudflare.mjs (it creates one)');
creds.bingApiKey
  ? pass('Search', 'Bing Webmaster API key', 'present')
  : want('Search', 'Bing Webmaster API key', 'not set (optional)', 'https://www.bing.com/webmasters -> sign in -> Settings -> API access -> Generate API key; export BING_API_KEY=...');

// ----------------------------------------------------------------- Browser
want(
  'Browser',
  'Claude in Chrome extension',
  'cannot be checked from a script',
  'Used to drive the Google/Bing dashboards when a step has no API. Install from https://claude.ai/chrome , sign in, and confirm Claude Code shows the claude-in-chrome tools. Without it, the skill gives you each link and the exact clicks.'
);

// ------------------------------------------------------------------ report
const icon = { pass: '[ok]', required: '[xx]', recommended: '[--]' };
let area = '';
for (const r of results) {
  if (r.area !== area) {
    area = r.area;
    console.log(`\n${area}`);
  }
  console.log(`  ${icon[r.level]} ${r.name}${r.detail ? `  -  ${r.detail}` : ''}`);
  if (r.fix) console.log(`        fix: ${r.fix}`);
}
const missing = results.filter((r) => r.level === 'required');
const sites = Object.keys(readRegistry().sites).length;
console.log(
  `\n${missing.length ? `${missing.length} required item(s) missing - fix them in the order shown, then run doctor again.` : 'All required items are in place.'}  (${sites} site(s) in the registry)`
);
process.exit(missing.length ? 1 : 0);
