#!/usr/bin/env node
/**
 * Mechanical sizing of MODEL-GENERATED images. This crops and resizes; it never
 * draws, adds text, or overlays a logo (that is done in the prompt - see
 * references/imagery.md in the marketing-site-factory skill).
 *
 *   npm run images:fit            fits every image that exists
 *
 *   src/assets/brand/og-source.png   -> public/og-default.png        1200x630
 *   src/assets/brand/icon-source.png -> public/favicon.png           512x512
 *                                       public/apple-touch-icon.png  180x180
 *
 * `sharp` is already installed: Astro depends on it for image optimisation.
 */
import { existsSync } from 'node:fs';
import sharp from 'sharp';

const jobs = [
  { from: 'src/assets/brand/og-source.png', to: 'public/og-default.png', w: 1200, h: 630 },
  { from: 'src/assets/brand/icon-source.png', to: 'public/favicon.png', w: 512, h: 512 },
  { from: 'src/assets/brand/icon-source.png', to: 'public/apple-touch-icon.png', w: 180, h: 180 },
];

let done = 0;
for (const j of jobs) {
  if (!existsSync(j.from)) {
    console.log(`[--] ${j.from} not found, skipping ${j.to}`);
    continue;
  }
  await sharp(j.from).resize(j.w, j.h, { fit: 'cover', position: 'centre' }).png({ compressionLevel: 9 }).toFile(j.to);
  console.log(`[ok] ${j.to} (${j.w}x${j.h})`);
  done += 1;
}
if (!done) process.exitCode = 1;
