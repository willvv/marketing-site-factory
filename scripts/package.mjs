#!/usr/bin/env node
/**
 * Build a shareable zip of this skill, excluding anything personal or generated.
 *
 *   node package.mjs [--out <dir>]      default: <skill>/dist/marketing-site-factory.zip
 *
 * Refuses to package if it finds anything that looks like a secret or a personal
 * identifier from the owner's workspace.
 */
import { readdirSync, statSync, readFileSync, mkdirSync, existsSync, rmSync } from 'node:fs';
import { join, dirname, relative, resolve, sep } from 'node:path';
import { fileURLToPath } from 'node:url';
import { execFileSync } from 'node:child_process';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const args = process.argv.slice(2);
const oi = args.indexOf('--out');
const outDir = resolve(oi >= 0 ? args[oi + 1] : join(ROOT, 'dist'));
const SKIP = new Set(['node_modules', 'dist', '.astro', '.git', '__pycache__', '.DS_Store']);

function walk(dir, out = []) {
  for (const f of readdirSync(dir)) {
    if (SKIP.has(f)) continue;
    const p = join(dir, f);
    statSync(p).isDirectory() ? walk(p, out) : out.push(p);
  }
  return out;
}

const files = walk(ROOT);

// Leak guard: nothing personal/secret may ride along.
const PATTERNS = [
  [/\b[a-f0-9]{32}\b/, '32-hex value (Cloudflare id/token?) - IndexNow/analytics ids must not be bundled'],
  [/-----BEGIN [A-Z ]*PRIVATE KEY-----/, 'private key'],
  [/gh[pousr]_[A-Za-z0-9]{30,}/, 'GitHub token'],
  [/AIza[0-9A-Za-z_-]{30,}/, 'Google API key'],
];
const problems = [];
for (const f of files) {
  if (!/\.(mjs|md|json|ts|astro|txt|css|py|toml)$/.test(f) && !f.endsWith('_headers')) continue;
  const text = readFileSync(f, 'utf8');
  for (const [re, why] of PATTERNS) if (re.test(text)) problems.push(`${relative(ROOT, f)}: ${why}`);
}
if (problems.length) {
  console.error('Refusing to package:\n  ' + problems.join('\n  '));
  process.exit(1);
}

mkdirSync(outDir, { recursive: true });
const zip = join(outDir, 'marketing-site-factory.zip');
if (existsSync(zip)) rmSync(zip);

// Python's zipfile is the one portable zip writer available here (Python is already a
// prerequisite for the image CLI); `tar` and `zip` differ between GNU, bsdtar and Windows.
const parent = dirname(ROOT);
const name = ROOT.split(sep).pop();
const list = files.map((f) => relative(parent, f).split(sep).join('/'));
const py = [
  'import json, sys, zipfile',
  'out, base = sys.argv[1], sys.argv[2]',
  'names = json.load(sys.stdin)',
  "with zipfile.ZipFile(out, 'w', zipfile.ZIP_DEFLATED) as z:",
  '    for n in names:',
  "        z.write(base + '/' + n, n)",
].join('\n');
execFileSync(process.platform === 'win32' ? 'python' : 'python3', ['-c', py, zip, parent], {
  input: JSON.stringify(list),
  stdio: ['pipe', 'inherit', 'inherit'],
});
console.log(`\n${files.length} files -> ${zip}\nThe archive's top folder is "${name}/" - unzip it into ~/.claude/skills/.`);
