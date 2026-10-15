// Cloudflare + GitHub API layer. Dependency-free (Node >= 18 for global fetch).
//
// Auth: a scoped API token (preferred, minted by setup-cloudflare.mjs) is sent as
// a Bearer token. If only a Global API Key is available it is sent as
// X-Auth-Email / X-Auth-Key instead. A few endpoints (Registrar purchases,
// Workers Builds triggers) historically only accept the global key, which is why
// setup lets the user keep it optionally.

import { execFileSync } from 'node:child_process';
import { loadConfig, loadCredentials } from './config.mjs';

const API = 'https://api.cloudflare.com/client/v4';

export function authHeaders({ forceGlobal = false } = {}) {
  const c = loadCredentials();
  if (!forceGlobal && c.cfApiToken) return { Authorization: `Bearer ${c.cfApiToken}` };
  if (c.cfGlobalKey && c.cfEmail) return { 'X-Auth-Email': c.cfEmail, 'X-Auth-Key': c.cfGlobalKey };
  throw new Error(
    'No Cloudflare credentials found. Run: node <skill>/scripts/setup-cloudflare.mjs --domain <your-domain.com>'
  );
}

export function hasGlobalKey() {
  const c = loadCredentials();
  return Boolean(c.cfGlobalKey && c.cfEmail);
}

export function accountId() {
  const id = loadConfig().accountId;
  if (!id) throw new Error('Cloudflare account id not configured. Run setup-cloudflare.mjs first.');
  return id;
}

/**
 * Call the Cloudflare API. Throws on a non-success envelope so callers can assume
 * `result` is real, except when `tolerate` matches an error code - used to make
 * "already exists" idempotent rather than fatal.
 */
export async function cf(method, path, body, { tolerate = [], forceGlobal = false, raw = false } = {}) {
  const res = await fetch(`${API}${path}`, {
    method,
    headers: { ...authHeaders({ forceGlobal }), 'Content-Type': 'application/json' },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  const text = await res.text();
  let json;
  try {
    json = JSON.parse(text);
  } catch {
    throw new Error(`${method} ${path} -> non-JSON ${res.status}: ${text.slice(0, 300)}`);
  }
  if (raw) return json;
  if (!json.success) {
    const codes = (json.errors || []).map((e) => e.code);
    if (codes.some((c) => tolerate.includes(c))) return { tolerated: true, errors: json.errors };
    const msg = (json.errors || []).map((e) => `${e.code}: ${e.message}`).join('; ');
    throw new Error(`${method} ${path} failed -> ${msg || text.slice(0, 300)}`);
  }
  return json.result;
}

/**
 * Run the `gh` CLI using the user's own `gh auth login` session.
 * GH_TOKEN is deliberately not injected: the CLI's keyring login carries `repo`
 * and `workflow`, which is everything these scripts need.
 */
export function gh(args, { allowFail = false } = {}) {
  try {
    return execFileSync('gh', args, { encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] }).trim();
  } catch (err) {
    if (allowFail) return null;
    const detail = [err.stdout, err.stderr].filter(Boolean).join('\n').trim();
    throw new Error(`gh ${args.join(' ')} failed:\n${detail || err.message}`);
  }
}

export function git(args, cwd) {
  try {
    return execFileSync('git', args, {
      encoding: 'utf8',
      cwd,
      env: { ...process.env, GIT_TERMINAL_PROMPT: '0' },
      stdio: ['ignore', 'pipe', 'pipe'],
    }).trim();
  } catch (err) {
    const detail = [err.stdout, err.stderr].filter(Boolean).join('\n').trim();
    throw new Error(`git ${args.join(' ')} failed:\n${detail || err.message}`);
  }
}

/** Resolve a zone name to its id. */
export async function zoneId(name) {
  const zones = await cf('GET', `/zones?name=${encodeURIComponent(name)}`);
  if (!zones.length) {
    throw new Error(
      `Zone "${name}" is not on this Cloudflare account. Add it at https://dash.cloudflare.com/?to=/:account/add-site ` +
        `and point the registrar's nameservers at Cloudflare first.`
    );
  }
  return zones[0].id;
}
