// When a page last changed, read from git rather than from a frontmatter field
// nobody would remember to update.
//
// The catch is which file to ask about. A mirrored page under
// src/content/docs/ is written at build time by tools/src/site/gen-site-docs.ts
// and ignored by git, so asking git about the mirror returns nothing: the
// question is redirected to the page under docs/ it came from, found through the
// structure file (tools/src/lib/site-routes.ts), never through a folder list. A
// hub has no page behind it and a hand-written page is its own source.
//
// One git pass reads every date (spec head-C7): the first question runs one
// `git log` over the two trees a page's source can be in — the page tree, and
// the site's own hand-written pages — and remembers the newest commit date of
// every file it names, so a 400-page build asks git once, not 400 times, and no
// source is asked about twice.
//
// Every failure here is soft. A shallow CI checkout knows the date of one
// commit and nothing else, and a page with no answer omits dateModified — the
// build never stops for it (spec head-C6, head-O1: with no version control,
// the date is omitted and the build exits 0).
import { execFileSync } from 'node:child_process';

import structureFile from '../../../docs/data/site-structure.json';
import { placedPages, type Structure } from '../../../tools/src/lib/site-routes';

/** Runs git with these arguments in this folder: its stdout, or null when git could not answer. */
export type Git = (args: readonly string[], cwd?: string) => string | null;

const realGit: Git = (args, cwd) => {
  try {
    return execFileSync('git', [...args], {
      ...(cwd === undefined ? {} : { cwd }),
      encoding: 'utf8',
      stdio: ['ignore', 'pipe', 'ignore'],
      maxBuffer: 64 * 1024 * 1024,
    });
  } catch {
    return null;
  }
};

/**
 * The trees one pass reads: the page tree, and the site's own hand-written
 * pages. `sourceOf` answers a path in one of them, since every structure row's
 * source is a page under docs/.
 */
export const PAGE_TREES = ['docs', 'site/src/content/docs'] as const;

/** Content path (relative to src/content/docs/) → the page under docs/ it mirrors. */
const mirrors = new Map(
  placedPages(structureFile as Structure).map((p) => [p.contentPath, p.source]),
);

/** Map a content entry's file path back to the file a person edits. */
export function sourceOf(filePath: string | undefined | null): string | null {
  if (!filePath) return null;
  const rel = String(filePath).replace(/\\/g, '/');
  const inContent = /src\/content\/docs\/(.+)$/.exec(rel)?.[1];
  if (inContent === undefined) return null;
  return mirrors.get(inContent) ?? `site/src/content/docs/${inContent}`;
}

/**
 * `git log --format=%x00%cI --name-only` read back: each file's newest commit
 * date. The log runs newest first, so the first date a file meets is its own.
 */
export function newestDates(log: string): Map<string, string> {
  const out = new Map<string, string>();
  for (const chunk of log.split('\0').slice(1)) {
    const [date, ...files] = chunk.split('\n');
    for (const f of files) {
      const file = f.trim();
      if (file !== '' && !out.has(file)) out.set(file, date.trim());
    }
  }
  return out;
}

/** A date lookup with its own memory: one repository question and one pass, whatever it is asked. */
export function dateReader(
  git: Git = realGit,
): (filePath: string | undefined | null) => string | null {
  let root: string | null | undefined;
  let pass: Map<string, string> | null | undefined;
  return (filePath) => {
    const source = sourceOf(filePath);
    if (!source) return null;
    if (root === undefined) root = git(['rev-parse', '--show-toplevel'])?.trim() || null;
    if (root === null) return null;
    if (pass === undefined) {
      const log = git(['log', '--format=%x00%cI', '--name-only', '--', ...PAGE_TREES], root);
      pass = log === null ? null : newestDates(log);
    }
    return pass?.get(source) ?? null;
  };
}

/** ISO-8601 commit date of the last change to a page's source, or null. */
export const lastModified = dateReader();
