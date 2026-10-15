#!/usr/bin/env node
/**
 * Generate a site's brand imagery from a committed manifest, serially, with the
 * chatgpt-imagegen CLI. Every image - logo, hero, icons, the 1200x630 share card -
 * is produced by the image model; nothing is composed in HTML/SVG/canvas.
 *
 *   node gen-images.mjs <site-dir>/images.json [name ...] [--force] [--backend auto|codex]
 *
 * Manifest:
 * {
 *   "outDir": "src/assets/brand",            // relative to the manifest
 *   "style": "Shared style prefix prepended to every prompt, so the set matches.",
 *   "images": {
 *     "hero":    { "prompt": "...", "size": "1536x1024" },
 *     "icon-delivery": { "prompt": "...", "size": "1024x1024", "background": "transparent" },
 *     "og-default": { "prompt": "... the exact words \"Acme Plumbing\" ...", "size": "1536x1024",
 *                     "out": "../../public/og-default.png", "refs": ["logo.png"] }
 *   }
 * }
 *
 * - Keeping prompts in a committed file is what makes a brand's visual language
 *   reproducible and extendable later; BRAND.md records the same prompts.
 * - `refs` switches an entry to image-to-image: pass the REAL logo so it is
 *   preserved rather than re-imagined.
 * - Skips outputs that already exist; --force regenerates. ~20-60 s per image.
 * - After generating the share card, resize it to exactly 1200x630 (see
 *   references/imagery.md) - the model's native sizes are not 1.91:1.
 */

import { readFileSync, existsSync, mkdirSync } from 'node:fs';
import { resolve, dirname } from 'node:path';
import { generate } from './lib/imagegen.mjs';

const args = process.argv.slice(2);
const manifestPath = args.find((a) => !a.startsWith('--'));
if (!manifestPath) {
  console.error('usage: gen-images.mjs <manifest.json> [name ...] [--force] [--backend codex|auto]');
  process.exit(1);
}
const force = args.includes('--force');
const bi = args.indexOf('--backend');
const backend = bi >= 0 ? args[bi + 1] : 'codex';
const only = args.filter((a, i) => !a.startsWith('--') && a !== manifestPath && args[i - 1] !== '--backend');

const manifest = JSON.parse(readFileSync(manifestPath, 'utf8'));
const base = dirname(resolve(manifestPath));
const outDir = resolve(base, manifest.outDir ?? '.');
mkdirSync(outDir, { recursive: true });

let made = 0;
let failed = 0;
for (const [name, spec] of Object.entries(manifest.images)) {
  if (only.length && !only.includes(name)) continue;
  const entry = typeof spec === 'string' ? { prompt: spec } : spec;
  const out = resolve(outDir, entry.out ?? `${name}.png`);
  if (existsSync(out) && !force) {
    console.log(`[--] ${name}: exists, skipping`);
    continue;
  }
  mkdirSync(dirname(out), { recursive: true });
  const prompt = [manifest.style, entry.prompt].filter(Boolean).join(' ');
  const extra = entry.background ? ['--background', entry.background] : [];
  const refs = (entry.refs || []).map((r) => resolve(base, r));
  console.log(`[..] ${name}: generating (${entry.size || '1024x1024'})`);
  const r = generate({ prompt, out, size: entry.size || '1024x1024', refs, backend, extra });
  if (r.status === 0 && existsSync(out)) {
    console.log(`[ok] ${name} -> ${out}`);
    made += 1;
  } else {
    console.log(`[xx] ${name}: failed\n${(r.stderr || r.stdout || '').toString().trim().slice(-600)}`);
    failed += 1;
  }
}
console.log(`\n${made} generated, ${failed} failed.`);
process.exit(failed ? 1 : 0);
