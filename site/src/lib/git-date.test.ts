/**
 * sourceOf has a trap in it: the mirror under src/content/docs/ is ignored by
 * git, so asking git about the mirror path returns nothing — every mirrored
 * page has to be redirected to the page it came from, or dateModified silently
 * vanishes from every page. These assert against the real structure file, on
 * purpose: a folder list would stay green while the areas moved underneath it.
 */
import { describe, expect, it } from 'vitest';

import { dateReader, lastModified, newestDates, sourceOf, type Git } from './git-date';

describe('sourceOf', () => {
  it('redirects a mirrored page to its docs/ source', () => {
    expect(
      sourceOf('/abs/site/src/content/docs/patterns/distributed/resilience/circuit-breaker.md'),
    ).toBe('docs/patterns/distributed/resilience/circuit-breaker.md');
  });

  it('keeps a page the structure file does not mirror inside site/', () => {
    expect(sourceOf('/abs/site/src/content/docs/index.mdx')).toBe(
      'site/src/content/docs/index.mdx',
    );
    expect(sourceOf('/abs/site/src/content/docs/patterns/caching/index.mdx')).toBe(
      'site/src/content/docs/patterns/caching/index.mdx',
    );
  });

  it('answers null for nothing, not a crash', () => {
    expect(sourceOf(undefined)).toBeNull();
    expect(sourceOf(null)).toBeNull();
    expect(sourceOf('')).toBeNull();
    expect(sourceOf('docs/patterns/caching/cache-aside.md')).toBeNull();
  });

  it('normalises Windows separators before matching', () => {
    expect(sourceOf('site\\src\\content\\docs\\hazards\\god-object.md')).toBe(
      'docs/hazards/god-object.md',
    );
  });
});

describe('lastModified', () => {
  it('reads the source page commit date, once', () => {
    const first = lastModified('site/src/content/docs/hazards/god-object.md');
    expect(first).toMatch(/^\d{4}-\d{2}-\d{2}T/);
    expect(lastModified('site/src/content/docs/hazards/god-object.md')).toBe(first);
  });

  it('answers null for a file git has never seen, and for no file', () => {
    expect(lastModified('site/src/content/docs/never/was.md')).toBeNull();
    expect(lastModified(undefined)).toBeNull();
  });
});

/** A git that answers from a table and counts what it was asked. */
function fakeGit(answers: { root?: string | null; log?: string | null }) {
  const calls: string[] = [];
  const git: Git = (args) => {
    calls.push(args.join(' '));
    if (args[0] === 'rev-parse') return answers.root === undefined ? '/repo\n' : answers.root;
    return answers.log === undefined ? '' : answers.log;
  };
  return { git, calls };
}

/** What `git log --format=%x00%cI --name-only` prints: newest commit first. */
const LOG =
  '\u00002026-09-24T10:00:00+02:00\n\ndocs/hazards/god-object.md\n' +
  '\u00002026-01-02T03:04:05+00:00\n\ndocs/hazards/god-object.md\ndocs/patterns/caching/cache-aside.md\n';

describe('newestDates', () => {
  it('gives each file the first date the newest-first log names it under', () => {
    expect(newestDates(LOG)).toEqual(
      new Map([
        ['docs/hazards/god-object.md', '2026-09-24T10:00:00+02:00'],
        ['docs/patterns/caching/cache-aside.md', '2026-01-02T03:04:05+00:00'],
      ]),
    );
    expect(newestDates('')).toEqual(new Map());
  });
});

describe('dateReader', () => {
  it('asks git once for every page of the trees, and never twice for one source', () => {
    const { git, calls } = fakeGit({ log: LOG });
    const read = dateReader(git);
    expect(read('site/src/content/docs/hazards/god-object.md')).toBe('2026-09-24T10:00:00+02:00');
    expect(read('site/src/content/docs/hazards/god-object.md')).toBe('2026-09-24T10:00:00+02:00');
    expect(read('site/src/content/docs/patterns/caching/cache-aside.md')).toBe(
      '2026-01-02T03:04:05+00:00',
    );
    // A page of the trees the log never names has never been committed: no date.
    expect(read('site/src/content/docs/index.mdx')).toBeNull();
    expect(calls).toEqual([
      'rev-parse --show-toplevel',
      'log --format=%x00%cI --name-only -- docs site/src/content/docs',
    ]);
  });

  it('answers no date with no repository, with a log git cannot run, and with an empty answer', () => {
    expect(
      dateReader(fakeGit({ root: null }).git)('site/src/content/docs/hazards/god-object.md'),
    ).toBeNull();
    expect(
      dateReader(fakeGit({ root: '\n' }).git)('site/src/content/docs/hazards/god-object.md'),
    ).toBeNull();
    expect(
      dateReader(fakeGit({ log: null }).git)('site/src/content/docs/hazards/god-object.md'),
    ).toBeNull();
  });

  it('answers no date for no path without asking git anything', () => {
    const { git, calls } = fakeGit({});
    expect(dateReader(git)(undefined)).toBeNull();
    expect(calls).toEqual([]);
  });
});
