/**
 * The scoped-rule reader, and the rules folder it is written for. The
 * scenario runs over a sandbox holding the real core rules plus a plant; the
 * rest runs over the real tree, because a rule's globs are only right or
 * wrong against the files that actually exist.
 */

import path from 'node:path';

import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import { gitFiles } from './exec.js';
import {
  CORE_RULES,
  readRules,
  ruleFrontmatter,
  ruleProblems,
  RULES_DIR,
  rulesWithoutPaths,
  scopeOf,
  type Rule,
} from './rules.js';
import { makeSandbox, REPO_ROOT, type Sandbox } from './sandbox.js';

let sb: Sandbox;
beforeEach(() => {
  sb = makeSandbox();
});
afterEach(() => sb.cleanup());

describe('scoped-rules-O1', () => {
  it('the core rules plus a plant with a description and no paths: exactly the plant is reported, by name', () => {
    for (const f of Object.values(CORE_RULES)) sb.copyRepo(`${RULES_DIR}/${f}`);
    sb.write(`${RULES_DIR}/plant.md`, '---\ndescription: "A rule planted with no paths."\n---\n\n# Plant\n');

    const rules = readRules(sb.dir);
    expect(rules).toHaveLength(6);
    for (const r of rules) expect(r.fm?.description, r.file).toMatch(/\S/);
    expect(rulesWithoutPaths(rules)).toEqual([`${RULES_DIR}/plant.md`]);
    expect(ruleProblems(rules)).toEqual([
      {
        file: `${RULES_DIR}/plant.md`,
        what: 'has no paths and names no act — give it paths, or an act key naming the act it governs',
      },
    ]);

    sb.rm(`${RULES_DIR}/plant.md`);
    const clean = readRules(sb.dir);
    expect(rulesWithoutPaths(clean)).toEqual([]);
    expect(ruleProblems(clean)).toEqual([]);
  });
});

describe('ruleFrontmatter, through the one parser', () => {
  /** Write each rule into the sandbox's rules folder and read the folder back. */
  const read = (rules: Record<string, string>): Record<string, Rule['fm']> => {
    for (const [name, text] of Object.entries(rules)) sb.write(`${RULES_DIR}/${name}`, text);
    return Object.fromEntries(readRules(sb.dir).map((r) => [path.posix.basename(r.file), r.fm]));
  };

  it('reads an inline list, a quoted description with a colon, an act, and passes over a comment', () => {
    expect(
      read({
        'a.md': '---\ndescription: "Holds x: y."\npaths: ["a/**", \'b.md\']\n---\n\n# A\n',
        'b.md': "---\ndescription: 'x'\nact: committing\n---\n",
        'c.md': '---\n# a comment\ndescription: d\n---\n',
      }),
    ).toEqual({
      'a.md': { description: 'Holds x: y.', paths: ['a/**', 'b.md'] },
      'b.md': { description: 'x', act: 'committing' },
      'c.md': { description: 'd' },
    });
  });

  it('marks paths that are not an inline list of globs, and has no answer without frontmatter', () => {
    const fm = read({
      'scalar.md': '---\npaths: a/**\n---\n',
      'block.md': '---\npaths:\n  - "a/**"\n  - b.md\n---\n',
      'open.md': '---\npaths: [unquoted\n---\n',
      'empty.md': '---\npaths:\n---\n',
      'none.md': '---\npaths: []\n---\n',
      'bare.md': '# No frontmatter\n',
      'hollow.md': '---\n---\n',
    });
    for (const f of ['scalar.md', 'block.md', 'open.md', 'empty.md', 'none.md']) expect(fm[f]?.paths, f).toBe('malformed');
    expect(fm['bare.md']).toBeNull();
    expect(fm['hollow.md']).toBeNull();
  });

  it('takes a scalar where one belongs, and nothing from a list in its place', () => {
    expect(ruleFrontmatter({ description: ['a', 'b'], act: 'x', paths: ['1', '2'] })).toEqual({ act: 'x', paths: ['1', '2'] });
    expect(ruleFrontmatter({})).toBeNull();
  });

  it('selects nothing for a rule without globs', () => {
    expect(scopeOf({ file: 'x.md', fm: null }, ['a'])).toEqual([]);
    expect(scopeOf({ file: 'x.md', fm: { paths: 'malformed' } }, ['a'])).toEqual([]);
  });
});

describe('ruleProblems', () => {
  const rule = (file: string, fm: Rule['fm']): Rule => ({ file, fm });

  it('names a missing description, malformed paths, a glob that does not compile and a core rule without paths', () => {
    const problems = ruleProblems([
      rule('.claude/rules/a.md', { paths: ['x/**'] }),
      rule('.claude/rules/b.md', { description: 'b', paths: 'malformed' }),
      rule('.claude/rules/c.md', { description: 'c', paths: ['site/{a,b'] }),
      rule('.claude/rules/claims.md', { description: 'claims' }),
      rule('.claude/rules/d.md', null),
      rule('.claude/rules/e.md', { description: 'e', act: 'writing a commit message' }),
    ]);
    expect(problems.map((p) => `${p.file}: ${p.what}`)).toEqual([
      '.claude/rules/a.md: has no description — say what the rule holds and when it applies',
      '.claude/rules/b.md: paths is not an inline list of globs — write paths: ["a/**", "b.md"]',
      '.claude/rules/c.md: paths holds a glob that does not compile: site/{a,b',
      '.claude/rules/claims.md: is a core rule with no paths — it would load in every session',
      '.claude/rules/d.md: has no frontmatter — a rule opens with description and paths',
    ]);
  });

  it('finds no rules where there is no rules folder', () => {
    expect(readRules(sb.dir)).toEqual([]);
  });
});

describe('the real rules folder', () => {
  const rules = readRules(REPO_ROOT);
  const files = gitFiles(REPO_ROOT, ['.']);
  const pages = files.filter((f) => /^site\/.*\.html$/.test(f) || /^docs\/.*\.md$/.test(f));
  const core = (id: string): Rule => {
    const r = rules.find((x) => x.file === `${RULES_DIR}/${CORE_RULES[id] as string}`);
    if (r === undefined) throw new Error(`no core rule ${id}`);
    return r;
  };

  it('holds the five core rules, every rule with a description and well-formed paths', () => {
    for (const f of Object.values(CORE_RULES)) expect(rules.map((r) => r.file)).toContain(`${RULES_DIR}/${f}`);
    expect(ruleProblems(rules)).toEqual([]);
    expect(rulesWithoutPaths(rules)).toEqual([]);
  });

  it('gives each core rule globs that select its scope and no page', () => {
    for (const id of Object.keys(CORE_RULES)) {
      expect(scopeOf(core(id), pages), id).toEqual([]);
    }
    const claims = scopeOf(core('claims'), files);
    for (const f of ['Makefile', 'scripts/kb.mjs', 'tools/src/run-gates.ts', '.github/workflows/validate.yml', '.githooks/pre-commit']) {
      expect(claims, f).toContain(f);
    }
    const comment = scopeOf(core('comment'), files);
    for (const f of ['Makefile', 'scripts/kb.mjs', 'scripts/fm-json.sh', 'tools/src/lib/gate.ts', '.githooks/pre-commit', 'site/src/lib/store.ts', 'site/astro.config.mjs']) {
      expect(comment, f).toContain(f);
    }
    expect(scopeOf(core('workflow'), files)).toEqual(files.filter((f) => f.startsWith('.github/')));
    // The page and component rules govern the Astro workspace: its source and
    // config, never a page under docs/.
    const page = scopeOf(core('page'), files);
    expect(page).toContain('site/astro.config.mjs');
    expect(page).toContain('site/src/lib/types.ts');
    expect(page.filter((f) => f !== 'site/astro.config.mjs' && !f.startsWith('site/src/'))).toEqual([]);
    const component = scopeOf(core('component'), files);
    expect(component).toContain('site/src/components/Head/Head.astro');
    expect(component.filter((f) => !f.startsWith('site/src/components/'))).toEqual([]);
  });

  it('scopes the authoring rule to the docs pages', () => {
    const ruleFiles = rules.map((r) => r.file);
    expect(ruleFiles).not.toContain(`${RULES_DIR}/html5-authoring.md`);
    const authoring = rules.find((r) => r.file === `${RULES_DIR}/markdown-authoring.md`);
    if (authoring === undefined) throw new Error('no markdown-authoring.md');
    const scope = scopeOf(authoring, files);
    expect(scope).toContain('docs/patterns/distributed/resilience/circuit-breaker.md');
    expect(scope.filter((f) => !/^docs\/.*\.md$/.test(f))).toEqual([]);
  });
});
