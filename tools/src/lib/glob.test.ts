/**
 * The glob matcher behind `make validate-changed` and every allowlist entry.
 * Two directions of wrong: too loose, and an allowlist excuses a path it was
 * never written for; too tight, and a narrowed run skips the gate holding the
 * finding.
 */

import { describe, expect, it } from 'vitest';

import { globToRegExp, matches } from './glob.js';

const hit = (pattern: string, file: string): boolean => globToRegExp(pattern).test(file);

describe('globToRegExp', () => {
  it('keeps `*` inside one path segment', () => {
    expect(hit('docs/*.md', 'docs/authoring.md')).toBe(true);
    expect(hit('docs/*.md', 'docs/specs/skill.md')).toBe(false);
  });

  it('lets `**/` span zero segments as well as many', () => {
    // The zero case is the one that bites: `docs/**/*.md` has to match
    // `docs/README.md`, or the registry needs two globs for every doc gate and
    // one of them will be forgotten.
    expect(hit('docs/**/*.md', 'docs/README.md')).toBe(true);
    expect(hit('docs/**/*.md', 'docs/reference/triage.md')).toBe(true);
    expect(hit('**/*.json', 'x.json')).toBe(true);
    expect(hit('**/*.json', 'docs/data/allow/test-colocation.json')).toBe(true);
  });

  it('treats a trailing `**` as "everything under here"', () => {
    expect(hit('tools/**', 'tools/src/lib/gate.ts')).toBe(true);
    expect(hit('tools/**', 'toolsmith/x.ts')).toBe(false);
  });

  it('escapes the regex metacharacters a path really contains', () => {
    expect(hit('docs/data/gates.json', 'docs/data/gates.json')).toBe(true);
    expect(hit('docs/data/gates.json', 'docs/data/gatesXjson')).toBe(false);
  });

  it('handles `?` and `{a,b}`', () => {
    expect(hit('v?.md', 'v1.md')).toBe(true);
    expect(hit('v?.md', 'v10.md')).toBe(false);
    expect(hit('x.{md,mdx}', 'x.mdx')).toBe(true);
    expect(hit('x.{md,mdx}', 'x.txt')).toBe(false);
  });

  it('matches the whole path, never a fragment of it', () => {
    // exceptions-C6: an entry written for one file must not excuse another
    // that merely contains its name.
    expect(hit('tools/src/lib/sandbox.ts', 'tools/src/lib/sandbox.ts.bak')).toBe(false);
    expect(hit('sandbox.ts', 'tools/src/lib/sandbox.ts')).toBe(false);
  });

  it('treats a brace with no alternation open as a literal', () => {
    expect(hit('a}b', 'a}b')).toBe(true);
  });
});

describe('matches', () => {
  it('matches against any pattern in the list', () => {
    expect(matches('Makefile', ['docs/**', 'Makefile'])).toBe(true);
    expect(matches('Makefile', ['docs/**'])).toBe(false);
    expect(matches('Makefile', [])).toBe(false);
  });
});
