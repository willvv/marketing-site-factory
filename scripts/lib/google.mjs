// Google API layer - service-account auth, no dependencies.
//
// The identity is a service account the user creates once (setup-google.mjs, or
// the manual steps in references/onboarding.md). Its key file lives under
// ~/.marketing-site-factory/ and is never committed.
//
// Hand-rolled JWT instead of `googleapis`: the whole flow is one signed assertion
// plus one token exchange, and node's crypto does RS256 natively. That keeps the
// skill dependency-free.

import { readFileSync } from 'node:fs';
import { createSign } from 'node:crypto';
import { loadConfig } from './config.mjs';

export const SCOPES = {
  analytics: 'https://www.googleapis.com/auth/analytics.edit',
  searchconsole: 'https://www.googleapis.com/auth/webmasters',
  siteverification: 'https://www.googleapis.com/auth/siteverification',
};

let key = null;
function loadKey() {
  if (key) return key;
  const path = loadConfig().google.saKeyPath;
  try {
    key = JSON.parse(readFileSync(path, 'utf8'));
  } catch {
    throw new Error(
      `Cannot read the Google service-account key at ${path}.\n` +
        `Run: node <skill>/scripts/setup-google.mjs gcloud   (or follow references/onboarding.md, step "Google")`
    );
  }
  return key;
}

export function serviceAccountEmail() {
  return loadKey().client_email;
}

const b64url = (buf) =>
  Buffer.from(buf).toString('base64').replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');

const tokenCache = new Map();

/** Mint (and cache) an access token for a space-joined scope string. */
export async function token(scopes) {
  const scope = Array.isArray(scopes) ? scopes.join(' ') : scopes;
  const cached = tokenCache.get(scope);
  const now = Math.floor(Date.now() / 1000);
  if (cached && cached.expiry > now + 60) return cached.value;

  const k = loadKey();
  const header = b64url(JSON.stringify({ alg: 'RS256', typ: 'JWT' }));
  const claims = b64url(
    JSON.stringify({
      iss: k.client_email,
      scope,
      aud: 'https://oauth2.googleapis.com/token',
      iat: now,
      exp: now + 3600,
    })
  );
  const signer = createSign('RSA-SHA256');
  signer.update(`${header}.${claims}`);
  const assertion = `${header}.${claims}.${b64url(signer.sign(k.private_key))}`;

  const res = await fetch('https://oauth2.googleapis.com/token', {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({ grant_type: 'urn:ietf:params:oauth:grant-type:jwt-bearer', assertion }),
  });
  const json = await res.json();
  if (!res.ok) throw new Error(`Token exchange failed (${res.status}): ${JSON.stringify(json)}`);
  tokenCache.set(scope, { value: json.access_token, expiry: now + (json.expires_in || 3600) });
  return json.access_token;
}

/**
 * Call a Google REST API. Returns the parsed body; throws with the API's own
 * message on failure, except when `tolerate` matches the HTTP status.
 */
export async function g(method, url, { scope, body, tolerate = [] } = {}) {
  const access = await token(scope);
  const res = await fetch(url, {
    method,
    headers: { Authorization: `Bearer ${access}`, 'Content-Type': 'application/json' },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  const text = await res.text();
  let json = null;
  if (text) {
    try {
      json = JSON.parse(text);
    } catch {
      if (!res.ok) throw new Error(`${method} ${url} -> ${res.status}: ${text.slice(0, 300)}`);
      return text;
    }
  }
  if (!res.ok) {
    if (tolerate.includes(res.status)) return { tolerated: true, status: res.status, body: json };
    throw new Error(`${method} ${url} -> ${res.status}: ${json?.error?.message || text.slice(0, 300)}`);
  }
  return json ?? {};
}
