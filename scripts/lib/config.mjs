// Per-user configuration for marketing-site-factory.
//
// Everything user-specific lives OUTSIDE any repo, in one directory:
//
//   ~/.marketing-site-factory/            (override with $MSF_HOME)
//     config.json        non-secret: GitHub owner, Cloudflare account id, base domain, ...
//     credentials.json   secret: scoped Cloudflare token (+ optional global key, Bing key)
//     sites.json         registry of every site this user has provisioned
//
// Environment variables win over files, so CI or a one-off shell can inject values.

import { readFileSync, writeFileSync, mkdirSync, existsSync, chmodSync } from 'node:fs';
import { homedir } from 'node:os';
import { join, resolve } from 'node:path';

export const HOME = resolve(process.env.MSF_HOME || join(homedir(), '.marketing-site-factory'));
const CONFIG_PATH = join(HOME, 'config.json');
const CRED_PATH = join(HOME, 'credentials.json');
const REGISTRY_PATH = join(HOME, 'sites.json');

function readJson(path, fallback) {
  if (!existsSync(path)) return fallback;
  try {
    return JSON.parse(readFileSync(path, 'utf8'));
  } catch (err) {
    throw new Error(`${path} is not valid JSON: ${err.message}`);
  }
}

function writeJson(path, data, { secret = false } = {}) {
  mkdirSync(HOME, { recursive: true });
  writeFileSync(path, `${JSON.stringify(data, null, 2)}\n`, 'utf8');
  if (secret) {
    try {
      chmodSync(path, 0o600); // no-op on Windows, which is fine: the file is under the user profile
    } catch {
      /* ignore */
    }
  }
}

export function loadConfig() {
  const file = readJson(CONFIG_PATH, {});
  return {
    githubOwner: process.env.GITHUB_OWNER || file.githubOwner || null,
    accountId: process.env.CF_ACCOUNT_ID || file.cloudflare?.accountId || null,
    baseDomain: process.env.BASE_DOMAIN || file.baseDomain || null,
    forwardEmail: process.env.FORWARD_EMAIL || file.forwardEmail || null,
    workspace: file.workspace || null,
    indexnowKey: file.indexnowKey || null,
    google: {
      saKeyPath: process.env.GOOGLE_SA_KEY || file.google?.saKeyPath || join(HOME, 'google-service-account.json'),
      gaAccount: file.google?.gaAccount || null, // "accounts/123456"
      timeZone: file.google?.timeZone || 'America/New_York',
      currency: file.google?.currency || 'USD',
    },
    imagegen: { cli: file.imagegen?.cli || null },
    raw: file,
  };
}

export function saveConfigPatch(patch) {
  const file = readJson(CONFIG_PATH, {});
  const next = deepMerge(file, patch);
  writeJson(CONFIG_PATH, next);
  return next;
}

export function loadCredentials() {
  const file = readJson(CRED_PATH, {});
  return {
    cfApiToken: process.env.CF_API_TOKEN || file.cfApiToken || null,
    cfGlobalKey: process.env.CF_GLOBAL_API_KEY || file.cfGlobalKey || null,
    cfEmail: process.env.CF_ACCOUNT_EMAIL || file.cfEmail || null,
    bingApiKey: process.env.BING_API_KEY || file.bingApiKey || null,
  };
}

export function saveCredentialsPatch(patch) {
  const file = readJson(CRED_PATH, {});
  writeJson(CRED_PATH, { ...file, ...patch }, { secret: true });
}

export function readRegistry() {
  return readJson(REGISTRY_PATH, { sites: {} });
}

export function writeRegistry(reg) {
  writeJson(REGISTRY_PATH, reg);
}

export function requireConfig(...keys) {
  const cfg = loadConfig();
  const missing = keys.filter((k) => !cfg[k]);
  if (missing.length) {
    throw new Error(
      `Missing configuration: ${missing.join(', ')}.\n` +
        `Run:  node <skill>/scripts/doctor.mjs   (it prints exactly what to do)\n` +
        `or:   node <skill>/scripts/setup-cloudflare.mjs --domain <your-domain.com>`
    );
  }
  return cfg;
}

function deepMerge(a, b) {
  const out = { ...a };
  for (const [k, v] of Object.entries(b)) {
    out[k] = v && typeof v === 'object' && !Array.isArray(v) ? deepMerge(a?.[k] || {}, v) : v;
  }
  return out;
}

export const paths = { HOME, CONFIG_PATH, CRED_PATH, REGISTRY_PATH };

// ---- console helpers shared by every script -------------------------------
export const log = (...a) => console.log(...a);
export const step = (msg) => console.log(`\n-> ${msg}`);
export const ok = (msg) => console.log(`  [ok] ${msg}`);
export const skip = (msg) => console.log(`  [--] ${msg}`);
export const warn = (msg) => console.log(`  [!!] ${msg}`);
export const fail = (msg) => console.log(`  [xx] ${msg}`);
