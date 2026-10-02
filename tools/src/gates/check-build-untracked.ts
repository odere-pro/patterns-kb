/**
 * Built output stays out of version control (spec: kb.generation.output-ownership, output-ownership-C6).
 *
 * The site is built from `docs/` and `docs/data/`; everything under `site/dist/`, the
 * generated content mirror and the bundled `kb.js` is a function of them. A tracked copy
 * goes stale the moment a page changes and doubles every diff, so the `.gitignore` lines
 * that keep these out are held in place, and so is the tracked list: no `.html`, nothing
 * under the build's folders, and under `site/src/content/docs/` only the hand-written home.
 *
 * Reads `git ls-files` (what is committed or staged), never the working tree, so an
 * ignored build on disk is fine and a forced `git add -f` of one is caught.
 *
 * Usage: check-build-untracked   (takes no arguments)
 */

import fs from 'node:fs';
import path from 'node:path';

import { trackedFiles } from '../lib/exec.js';
import { main, type GateContext, type GateSpec } from '../lib/gate.js';

/** Folders that hold build products; nothing under them is tracked. */
export const BUILD_DIRS = ['site/dist/', 'site/.astro/', 'site/coverage/'];
/** The one built file that sits outside a build folder. */
export const BUILT_FILE = 'site/public/kb.js';
/** The mirror of `docs/` inside the site; only its two hand-written pages, the home and the not-found page, are tracked. */
export const MIRROR_DIR = 'site/src/content/docs/';
export const MIRROR_HOME = 'site/src/content/docs/index.mdx';
export const MIRROR_NOT_FOUND = 'site/src/content/docs/404.mdx';

/** The `.gitignore` lines that keep build output out, literal and in full. */
export const IGNORE_LINES = [
  'site/dist/',
  'site/.astro/',
  'site/coverage/',
  'site/public/kb.js',
  'site/src/content/docs/**/*.md',
  'site/src/content/docs/*/**/index.mdx',
  'site/src/content/docs/map/*.mdx',
];

/** The rule a tracked path breaks, or null when it may be tracked. */
export function ruleFor(file: string): string | null {
  if (file.endsWith('.html')) return 'an .html file is built output';
  for (const dir of BUILD_DIRS) {
    if (file.startsWith(dir)) return `${dir} holds build products`;
  }
  if (file === BUILT_FILE) return `${BUILT_FILE} is bundled by the build`;
  if (file.startsWith(MIRROR_DIR) && file !== MIRROR_HOME && file !== MIRROR_NOT_FOUND) {
    return `${MIRROR_DIR} is the mirror of docs/; only ${MIRROR_HOME} and ${MIRROR_NOT_FOUND} are hand-written`;
  }
  return null;
}

export const spec: GateSpec = {
  name: 'build-untracked',
  usage: 'usage: check-build-untracked   (takes no arguments)',
  run(ctx: GateContext): string {
    const tracked = trackedFiles(ctx.root, []);
    for (const f of tracked) {
      const rule = ruleFor(f);
      if (rule !== null) ctx.fail(f, `is tracked, but ${rule} — git rm --cached it; the build makes it`);
    }

    let lines: string[] = [];
    try {
      lines = fs.readFileSync(path.join(ctx.root, '.gitignore'), 'utf8').split('\n').map((l) => l.trim());
    } catch {
      // A missing .gitignore is reported once per required line below.
    }
    for (const want of IGNORE_LINES) {
      if (!lines.includes(want)) ctx.fail('.gitignore', `lacks the line ${want} — built output would show as untracked`);
    }

    return `[build-untracked] ${tracked.length} tracked files hold no built output; .gitignore keeps all ${IGNORE_LINES.length} build paths out`;
  },
};

main(spec, import.meta.url);
