#!/usr/bin/env node
/**
 * Install the companion skills this workflow depends on.
 *
 *   node install-skills.mjs            install everything that is missing
 *   node install-skills.mjs --dry-run  say what would happen
 *
 *   apple-design      fetched from github.com/emilkowalski/skills (MIT) -> ~/.claude/skills/apple-design
 *   chatgpt-imagegen  `npx skills add leeguooooo/chatgpt-imagegen -g`
 *
 * What it cannot do for you (it prints these as instructions):
 *   - `codex login` and `gh auth login` are interactive browser sign-ins.
 *   - the ui-ux-pro-max plugin is installed with Claude Code's /plugin command.
 */

import { existsSync, mkdirSync, writeFileSync } from 'node:fs';
import { homedir } from 'node:os';
import { join } from 'node:path';
import { spawnSync } from 'node:child_process';
import { step, ok, skip, warn, log } from './lib/config.mjs';
import { findImagegen } from './lib/imagegen.mjs';

const DRY = process.argv.includes('--dry-run');
const skills = join(homedir(), '.claude', 'skills');

step('apple-design');
const target = join(skills, 'apple-design');
// Upstream is MIT-licensed (emilkowalski/skills). It is fetched, not bundled, so the author stays
// credited and the user always gets the current version.
const APPLE_URL = 'https://raw.githubusercontent.com/emilkowalski/skills/HEAD/skills/apple-design/SKILL.md';
if (existsSync(join(target, 'SKILL.md'))) skip(`already installed at ${target}`);
else if (DRY) skip(`would download ${APPLE_URL} to ${target}`);
else {
  try {
    const res = await fetch(APPLE_URL);
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    mkdirSync(target, { recursive: true });
    writeFileSync(join(target, 'SKILL.md'), await res.text());
    ok(`installed to ${target}`);
  } catch (e) {
    warn(`could not download apple-design (${e.message}). Install it by hand: npx -y skills add emilkowalski/skills -g`);
  }
}

step('chatgpt-imagegen');
if (findImagegen()) skip(`already installed (${findImagegen()})`);
else if (DRY) skip('would run: npx -y skills add leeguooooo/chatgpt-imagegen -g');
else {
  const r = spawnSync('npx', ['-y', 'skills', 'add', 'leeguooooo/chatgpt-imagegen', '-g'], {
    stdio: 'inherit',
    shell: process.platform === 'win32',
  });
  r.status === 0 ? ok('installed') : warn('npx skills failed - clone https://github.com/leeguooooo/chatgpt-imagegen into ~/.agents/skills/chatgpt-imagegen instead');
}

log(`
Still to do by hand (interactive sign-ins):
  gh auth login                         GitHub CLI
  npm i -g @openai/codex && codex login ChatGPT sign-in used by the image backend
  /plugin marketplace add nextlevelbuilder/ui-ux-pro-max-skill      (inside Claude Code, optional)
  /plugin install ui-ux-pro-max@ui-ux-pro-max-skill

Then run: node doctor.mjs
`);
