/**
 * The suite wrapper: vitest's JSON report and its coverage verdicts, read
 * back into the contract's shapes. Every case runs the real vitest over a
 * miniature `tools/` in a sandbox.
 *
 * There is deliberately no case against the real suite. The thing this gate
 * polices is the suite itself, so that case would run the whole suite from
 * inside the suite; its real run is the registry row `make validate` and CI
 * both start.
 */

import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { matcherOwners, suiteProject } from '../lib/fixtures.js';
import { expectFail, expectMisuse, expectPass, makeSandbox, type Sandbox } from '../lib/sandbox.js';
import { CONFIG, firstLine, parseShortfalls, spec } from './check-suite.js';

let sb: Sandbox;
beforeEach(() => {
  sb = makeSandbox();
});
afterEach(() => sb.cleanup());

const failing = (name: string): string =>
  [
    "import { expect, it } from 'vitest';",
    '',
    `it('${name}', () => {`,
    '  expect(1).toBe(2);',
    '});',
    '',
  ].join('\n');

describe('the gate', () => {
  it('passes a green suite above its floors, counting tests and files', async () => {
    suiteProject(sb, { lines: 50 });
    const r = await sb.run(spec);
    expectPass(r);
    expect(r.out).toBe('[tests-vitest] 1 tests in 1 files pass; every coverage floor holds');
  });

  it('names each failing test on its own file, one matched finding apiece', async () => {
    suiteProject(sb);
    sb.write('tools/src/one.test.ts', failing('adds up'));
    sb.write('tools/src/deep/two.test.ts', failing('adds up again'));
    const r = await sb.run(spec);
    expectFail(r);
    expect(r.out).toBe('');
    const findings = r.err.split('\n');
    expect(findings).toEqual([
      '[tests-vitest] FAIL tools/src/deep/two.test.ts: adds up again — AssertionError: expected 1 to be 2 // Object.is equality',
      '[tests-vitest] FAIL tools/src/one.test.ts: adds up — AssertionError: expected 1 to be 2 // Object.is equality',
    ]);
    for (const line of findings) expect(matcherOwners(line)).toEqual(['kb-gate']);
  });

  it('names a test file that could not even load', async () => {
    suiteProject(sb);
    sb.write('tools/src/broken.test.ts', "import { gone } from './gone.js';\ngone();\n");
    const r = await sb.run(spec);
    expectFail(r);
    expect(r.err).toMatch(/^\[tests-vitest\] FAIL tools\/src\/broken\.test\.ts: failed to run — .*gone\.js/);
  });

  it('points a floor the run fell below at the config that sets it', async () => {
    // The fixture's module has a branch the one test never takes.
    suiteProject(sb, { branches: 100 });
    const r = await sb.run(spec);
    expectFail(r);
    expect(r.err).toBe(
      `[tests-vitest] FAIL ${CONFIG}: coverage for branches is 50%, below its floor of 100% — ` +
        'cover the new code; never lower a floor to land a change',
    );
  });

  it('says so when vitest fails before it can report anything', async () => {
    suiteProject(sb);
    sb.write(CONFIG, "throw new Error('the config itself is broken');\n");
    const r = await sb.run(spec);
    expectFail(r);
    expect(r.err).toMatch(/^\[tests-vitest\] FAIL: vitest exited 1 and named no failing test or floor — its last line: /);
  });

  it('names a missing config instead of running with no floors', async () => {
    suiteProject(sb);
    sb.rm(CONFIG);
    expectFail(await sb.run(spec), `[tests-vitest] FAIL ${CONFIG}: is missing`);
  });

  it('leaves no report behind in the temp folder or the tree', async () => {
    suiteProject(sb);
    // A temp folder of this test's own. The shared one belongs to every
    // process of this user, and another session's suite run keeps its own
    // kb-suite-* there while it runs — which read as this gate's leftover.
    const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'kb-tmpdir-'));
    vi.stubEnv('TMPDIR', tmp);
    try {
      await sb.run(spec);
      expect(fs.readdirSync(tmp).filter((n) => n.startsWith('kb-suite-'))).toEqual([]);
    } finally {
      vi.unstubAllEnvs();
      fs.rmSync(tmp, { recursive: true, force: true });
    }
    expect(sb.git('status', '--porcelain').stdout).not.toContain('report.json');
  });
});

describe('misuse', () => {
  it('takes no arguments, and no --fix — and starts no suite', async () => {
    suiteProject(sb);
    sb.write('tools/src/one.test.ts', failing('would fail'));
    for (const argv of [['--nope'], ['tools/src/sign.test.ts'], ['--fix']]) {
      const r = await sb.run(spec, argv);
      expectMisuse(r);
      expect(r.err).not.toContain('would fail');
    }
  });
});

describe('reading vitest back', () => {
  it('reads every floor the run fell below', () => {
    const out = [
      'ERROR: Coverage for lines (95.5%) does not meet global threshold (97%)',
      'ERROR: Coverage for branches (88%) does not meet threshold (89%)',
    ].join('\n');
    expect(parseShortfalls(out)).toEqual([
      { metric: 'lines', actual: '95.5', floor: '97' },
      { metric: 'branches', actual: '88', floor: '89' },
    ]);
    expect(parseShortfalls('All files | 100 |')).toEqual([]);
  });

  it('keeps the first line of an error, which says what went wrong', () => {
    expect(firstLine('AssertionError: nope\n    at x (a.ts:1:1)')).toBe('AssertionError: nope');
    expect(firstLine(undefined)).toBe('');
    expect(firstLine('Error: expected exit 0, got exit 1:\n    [x] FAIL a.md: bent\n    more')).toBe(
      'Error: expected exit 0, got exit 1: [x] FAIL a.md: bent',
    );
  });
});
