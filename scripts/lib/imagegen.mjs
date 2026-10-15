// Locates the chatgpt-imagegen CLI and runs it the way this skill needs it run.

import { existsSync } from 'node:fs';
import { homedir } from 'node:os';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { spawnSync } from 'node:child_process';
import { loadConfig } from './config.mjs';

const HERE = dirname(fileURLToPath(import.meta.url));
export const WINSHIM = join(HERE, '..', 'winshim');

/** Absolute path of the chatgpt-imagegen executable, or null. */
export function findImagegen() {
  const configured = loadConfig().imagegen.cli;
  const candidates = [
    configured,
    process.env.CHATGPT_IMAGEGEN,
    join(homedir(), '.agents', 'skills', 'chatgpt-imagegen', 'chatgpt-imagegen'),
    join(homedir(), '.claude', 'skills', 'chatgpt-imagegen', 'chatgpt-imagegen'),
  ].filter(Boolean);
  return candidates.find((p) => existsSync(p)) || null;
}

/**
 * Run one generation. `--backend codex` is the headless path that only needs
 * `codex login`; pass backend: 'auto' to let the CLI prefer a logged-in browser
 * when chrome-use is installed. On Windows the CLI imports the POSIX-only `fcntl`
 * module, so a tiny shim is put on PYTHONPATH, and UTF-8 is forced because the
 * CLI prints non-cp1252 characters.
 */
export function generate({ prompt, out, size = '1024x1024', refs = [], backend = 'codex', extra = [] }) {
  const cli = findImagegen();
  if (!cli) throw new Error('chatgpt-imagegen is not installed. Run: npx skills add leeguooooo/chatgpt-imagegen -g');
  const sep = process.platform === 'win32' ? ';' : ':';
  const args = [cli, prompt, '--backend', backend, '--size', size, '--format', 'png', '-o', out];
  for (const r of refs) args.push('--ref', r);
  args.push(...extra);
  const python = process.platform === 'win32' ? 'python' : 'python3';
  return spawnSync(python, args, {
    encoding: 'utf8',
    env: {
      ...process.env,
      PYTHONUTF8: '1',
      PYTHONIOENCODING: 'utf-8',
      PYTHONPATH: process.platform === 'win32' ? `${WINSHIM}${sep}${process.env.PYTHONPATH || ''}` : process.env.PYTHONPATH,
    },
  });
}
