/**
 * The colocation gate: every module and every hook has a test, or an
 * allowlist entry that says why not. Two directions of default-deny are the
 * point — an untested thing fails, and so does an exception that no longer
 * excuses anything.
 */

import fs from 'node:fs';
import path from 'node:path';

import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import { allowlistJson, colocationTree } from '../lib/fixtures.js';
import {
  expectFail,
  expectMisuse,
  expectPass,
  makeSandbox,
  REPO_ROOT,
  type Sandbox,
} from '../lib/sandbox.js';
import {
  ALLOWLIST,
  entryProblem,
  HOOK_DIR,
  hookTestHomes,
  importsModule,
  isTest,
  MODULE_ROOT,
  spec,
  type Entry,
} from './check-test-colocation.js';

let sb: Sandbox;
beforeEach(() => {
  sb = makeSandbox();
  colocationTree(sb);
});
afterEach(() => sb.cleanup());

const entry = (over: Partial<Entry> = {}): Entry => ({
  name: 'scaffolding',
  match: 'tools/src/lib/untested.ts',
  reason: 'test scaffolding, measured by the suites that use it',
  ...over,
});

describe('modules', () => {
  it('passes a module with its sibling test, and counts it', async () => {
    const r = await sb.run(spec);
    expectPass(r);
    expect(r.out).toBe('[test-colocation] 1 modules and 0 hooks have tests; 0 allowlist entries applied');
  });

  it('accepts a suite in the same folder that imports the module', async () => {
    sb.write('tools/src/lib/helper.ts', 'export const h = 1;\n');
    sb.write('tools/src/lib/widget.test.ts', "import { widget } from './widget.js';\nimport { h } from './helper.js';\n");
    const r = await sb.run(spec);
    expectPass(r);
    expect(r.out).toContain('2 modules');
  });

  it('does not accept a suite in another folder that happens to import it', async () => {
    sb.write('tools/src/gen/far.ts', 'export const far = 1;\n');
    sb.write('tools/src/lib/widget.test.ts', "import { far } from '../gen/far.js';\n");
    expectFail(await sb.run(spec), 'tools/src/gen/far.ts');
  });

  it('names an untested module and all three ways out', async () => {
    sb.write('tools/src/gates/check-new.ts', 'export {};\n');
    const r = await sb.run(spec);
    expectFail(r);
    expect(r.err).toBe(
      '[test-colocation] FAIL tools/src/gates/check-new.ts: has no test — add tools/src/gates/check-new.test.ts, ' +
        `import it from a suite in tools/src/gates/, or add a reasoned entry to ${ALLOWLIST}`,
    );
  });

  it('never asks a test file, or a declaration file, for a test of its own', async () => {
    sb.write('tools/src/lib/orphan.test.ts', 'export {};\n');
    sb.write('tools/src/lib/shapes.d.ts', 'export type X = 1;\n');
    expectPass(await sb.run(spec));
    expect(isTest('tools/src/lib/orphan.test.ts')).toBe(true);
  });

  it('reads nothing outside the module tree', async () => {
    sb.write('scripts/legacy.mjs', 'console.log(1);\n');
    sb.write('toolsmith/src/x.ts', 'export {};\n');
    expectPass(await sb.run(spec));
    expect(MODULE_ROOT).toBe('tools/src/');
  });

  it('treats a suite git still lists but the disk no longer has as not covering anything', async () => {
    // `git ls-files --cached` answers from the index, not the working tree: a
    // committed file removed by hand (never `git rm`) still lists, and the
    // suite it would have been has nothing to import from any more.
    sb.write('tools/src/gates/check-new.ts', 'export {};\n');
    sb.write('tools/src/gates/other.test.ts', "import { checkNew } from './check-new.js';\n");
    sb.commit('add both');
    sb.rm('tools/src/gates/other.test.ts');
    const r = await sb.run(spec);
    expectFail(r);
    expect(r.err).toContain('tools/src/gates/check-new.ts: has no test');
  });
});

describe('importsModule', () => {
  it('reads the static and the dynamic forms, with or without an extension', () => {
    expect(importsModule("import { a } from './gate.js';", 'gate')).toBe(true);
    expect(importsModule('import { a } from "./gate";', 'gate')).toBe(true);
    expect(importsModule("import type { A } from './gate.ts';", 'gate')).toBe(true);
    expect(importsModule("const m = await import('./gate.js');", 'gate')).toBe(true);
  });

  it('does not mistake a longer name, another folder or a comment-free mention for an import', () => {
    expect(importsModule("import { a } from './gate-sync.js';", 'gate')).toBe(false);
    expect(importsModule("import { a } from '../lib/gate.js';", 'gate')).toBe(false);
    expect(importsModule('the gate module', 'gate')).toBe(false);
  });
});

describe('hooks', () => {
  const HOOK = `${HOOK_DIR}after-write.sh`;

  it('passes a hook whose test names it, and counts it', async () => {
    sb.write(HOOK, '#!/usr/bin/env bash\nexit 0\n');
    sb.write('tools/src/hooks/after-write.test.ts', "const HOOK = '.claude/hooks/after-write.sh';\n");
    const r = await sb.run(spec);
    expectPass(r);
    expect(r.out).toContain('1 modules and 1 hook have tests');
  });

  it('accepts a bash test in tests/hooks/ too', async () => {
    sb.write(HOOK, '#!/usr/bin/env bash\nexit 0\n');
    sb.write('tests/hooks/after-write.test.sh', 'bash .claude/hooks/after-write.sh </dev/null\n');
    expectPass(await sb.run(spec));
    expect(hookTestHomes(HOOK)).toEqual(['tools/src/hooks/after-write.test.ts', 'tests/hooks/after-write.test.sh']);
  });

  it('names a hook that has no test', async () => {
    sb.write(HOOK, '#!/usr/bin/env bash\nexit 0\n');
    const r = await sb.run(spec);
    expectFail(r);
    expect(r.err).toContain(`[test-colocation] FAIL ${HOOK}: has no test`);
  });

  it('fails a test claimed for a hook by its path that never names it', async () => {
    sb.write(HOOK, '#!/usr/bin/env bash\nexit 0\n');
    sb.write('tools/src/hooks/after-write.test.ts', '// tests something else entirely\n');
    const r = await sb.run(spec);
    expectFail(r);
    expect(r.err).toContain('[test-colocation] FAIL tools/src/hooks/after-write.test.ts: is the test for');
    expect(r.err).toContain('never names after-write.sh');
  });

  it('excuses an untested hook an allowlist entry matches', async () => {
    sb.write(HOOK, '#!/usr/bin/env bash\nexit 0\n');
    sb.write(ALLOWLIST, allowlistJson([{ name: 'no-test-yet', match: HOOK, reason: 'ported from the shell suite; the port is next' }]));
    const r = await sb.run(spec);
    expectPass(r);
    expect(r.out).toContain('0 hooks have tests; 1 allowlist entry applied');
  });
});

describe('the allowlist', () => {
  beforeEach(() => {
    sb.write('tools/src/lib/untested.ts', 'export {};\n');
  });

  it('excuses a module an entry matches, and counts the entry applied', async () => {
    sb.write(ALLOWLIST, allowlistJson([entry()]));
    const r = await sb.run(spec);
    expectPass(r);
    expect(r.out).toBe('[test-colocation] 1 modules and 0 hooks have tests; 1 allowlist entry applied');
  });

  it('matches a whole-path pattern, and never a fragment', async () => {
    sb.write(ALLOWLIST, allowlistJson([entry({ match: 'tools/src/**/untested.ts' })]));
    expectPass(await sb.run(spec));
    // exceptions-C6: an entry naming only part of the path excuses nothing.
    sb.write(ALLOWLIST, allowlistJson([entry({ match: 'untested.ts' })]));
    const r = await sb.run(spec);
    expectFail(r, 'tools/src/lib/untested.ts: has no test');
    expect(r.err).toContain('entry "scaffolding" excuses nothing');
  });

  it('fails an entry that excuses nothing, naming it', async () => {
    sb.write('tools/src/lib/untested.test.ts', 'export {};\n');
    sb.write(ALLOWLIST, allowlistJson([entry()]));
    const r = await sb.run(spec);
    expectFail(r);
    expect(r.err).toBe(
      `[test-colocation] FAIL ${ALLOWLIST}: entry "scaffolding" excuses nothing — its match tools/src/lib/untested.ts ` +
        'names no untested module or hook; delete it',
    );
  });

  it('fails an entry with an empty reason, and does not apply it', async () => {
    sb.write(ALLOWLIST, allowlistJson([entry({ reason: ' ' })]));
    const r = await sb.run(spec);
    expectFail(r);
    expect(r.err).toContain('entry "scaffolding" has an empty reason');
  });

  it('holds an excusing entry to an owner and a since date', () => {
    expect(entryProblem(entry({ owner: 'Oleksandr Derechei', since: '2026-09-23' }))).toBeNull();
    expect(entryProblem(entry({ owner: 'Oleksandr Derechei' }))).toContain('no since date');
    expect(entryProblem(entry({ since: '2026-09-23' }))).toContain('names no owner');
    expect(entryProblem(entry({ owner: 'x', since: 'last week' }))).toContain('no since date');
  });

  it('refuses an entry missing its name or match, or one that is not an object', () => {
    expect(entryProblem({ match: 'a', reason: 'b' })).toBe('has no name');
    expect(entryProblem({ name: 'a', reason: 'b' })).toBe('has no match');
    expect(entryProblem('a string')).toBe('is not an object');
    expect(entryProblem(null)).toBe('is not an object');
  });

  it('names an entry by position when it has no name to name it by', async () => {
    sb.write(ALLOWLIST, allowlistJson([{ match: 'x' } as Entry]));
    expectFail(await sb.run(spec), 'entry #1 has no name');
  });

  it('names the allowlist when it is missing, not JSON, or holds no entries array', async () => {
    sb.rm(ALLOWLIST);
    expectFail(await sb.run(spec), `[test-colocation] FAIL ${ALLOWLIST}: is missing`);
    sb.write(ALLOWLIST, 'not json');
    expectFail(await sb.run(spec), `[test-colocation] FAIL ${ALLOWLIST}: is not valid JSON`);
    sb.write(ALLOWLIST, '{"version": 1, "updated": "2026-09-23", "note": "x"}\n');
    expectFail(await sb.run(spec), `[test-colocation] FAIL ${ALLOWLIST}: has no entries array`);
  });
});

describe('misuse', () => {
  it('takes no arguments at all: the scan is always whole', async () => {
    expectMisuse(await sb.run(spec, ['--nope']));
    expectMisuse(await sb.run(spec, ['tools/src/lib/widget.ts']));
  });

  it('rejects --fix: a missing test has no one right repair', async () => {
    expectMisuse(await sb.run(spec, ['--fix']));
  });
});

describe('oracle scenarios', () => {
  it('testing-O1: a new module fails, an entry clears it, a deleted hook test fails naming the hook', async () => {
    // One module has a sibling test (the fixture), one hook's test names it.
    sb.write(`${HOOK_DIR}guard.sh`, '#!/usr/bin/env bash\nexit 0\n');
    sb.write('tools/src/hooks/guard.test.ts', "const HOOK = '.claude/hooks/guard.sh';\n");
    expectPass(await sb.run(spec));

    // A module lands with no sibling test and no allowlist entry.
    sb.write('tools/src/lib/landed.ts', 'export {};\n');
    const landed = await sb.run(spec);
    expectFail(landed);
    expect(landed.err).toBe(
      '[test-colocation] FAIL tools/src/lib/landed.ts: has no test — add tools/src/lib/landed.test.ts, ' +
        `import it from a suite in tools/src/lib/, or add a reasoned entry to ${ALLOWLIST}`,
    );

    // An entry with a reason is added: 0, the summary counting covered modules.
    sb.write(ALLOWLIST, allowlistJson([entry({ name: 'landed', match: 'tools/src/lib/landed.ts' })]));
    const excused = await sb.run(spec);
    expectPass(excused);
    expect(excused.out).toBe('[test-colocation] 1 modules and 1 hook have tests; 1 allowlist entry applied');

    // The hook's test is deleted: 1, naming the hook.
    sb.rm('tools/src/hooks/guard.test.ts');
    const hookless = await sb.run(spec);
    expectFail(hookless);
    expect(hookless.err).toContain(`[test-colocation] FAIL ${HOOK_DIR}guard.sh: has no test`);
    expect(hookless.err.split('\n')).toHaveLength(1);
  });

  it('exceptions-O1: plant, excuse, blank the reason, then an entry left behind', async () => {
    // A gate over committed files runs clean, its allowlist empty.
    sb.commit('clean');
    expectPass(await sb.run(spec));

    // One unrecognized thing is planted: exit 1, one finding naming that file.
    sb.write('tools/src/lib/planted.ts', 'export {};\n');
    const planted = await sb.run(spec);
    expectFail(planted);
    expect(planted.err.split('\n')).toEqual([expect.stringContaining('FAIL tools/src/lib/planted.ts: ')]);

    // An allowlist entry with a non-empty reason exits 0; blanking it exits 1.
    const plantEntry = entry({ name: 'planted', match: 'tools/src/lib/planted.ts' });
    sb.write(ALLOWLIST, allowlistJson([plantEntry]));
    expectPass(await sb.run(spec));
    sb.write(ALLOWLIST, allowlistJson([{ ...plantEntry, reason: '' }]));
    expectFail(await sb.run(spec), 'entry "planted" has an empty reason');

    // Deleting the plant but keeping its entry: exit 1, naming the entry.
    sb.write(ALLOWLIST, allowlistJson([plantEntry]));
    sb.rm('tools/src/lib/planted.ts');
    const leftover = await sb.run(spec);
    expectFail(leftover);
    expect(leftover.err).toContain(`FAIL ${ALLOWLIST}: entry "planted" excuses nothing`);
  });
});

describe('the real tree', () => {
  it('finds a test for every module and hook in this repository, counting them by its own rule', async () => {
    // testing-C4: the modules are recounted by a walk written here — every
    // `.ts` under tools/src that is neither a test nor a declaration — and the
    // hooks by a listing of .claude/hooks. Copied in, so nothing real is written.
    const walk = (dir: string): string[] =>
      fs.readdirSync(path.join(REPO_ROOT, dir), { withFileTypes: true }).flatMap((e) =>
        e.isDirectory() ? walk(`${dir}/${e.name}`) : [`${dir}/${e.name}`],
      );
    const modules = walk('tools/src').filter((f) => /\.ts$/.test(f) && !/\.(test|d)\.ts$/.test(f));
    const hooks = fs.existsSync(path.join(REPO_ROOT, '.claude/hooks'))
      ? fs.readdirSync(path.join(REPO_ROOT, '.claude/hooks'))
      : [];
    const applied = (JSON.parse(fs.readFileSync(path.join(REPO_ROOT, ALLOWLIST), 'utf8')) as { entries: unknown[] })
      .entries.length;

    sb.rm('tools');
    sb.copyRepo('tools/src', ALLOWLIST);
    if (hooks.length > 0) sb.copyRepo('.claude/hooks');
    // A hook's test may live beside the suite in tests/hooks/, as the bash ones do.
    if (fs.existsSync(path.join(REPO_ROOT, 'tests/hooks'))) sb.copyRepo('tests/hooks');

    const r = await sb.run(spec);
    expectPass(r);
    const tested = modules.length - applied;
    expect(r.out).toBe(
      `[test-colocation] ${tested} modules and ${hooks.length} ${hooks.length === 1 ? 'hook' : 'hooks'} have tests; ` +
        `${applied} allowlist ${applied === 1 ? 'entry' : 'entries'} applied`,
    );
  });
});
