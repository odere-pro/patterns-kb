/**
 * The wrapper that turns `tests/run.sh` into a gate. The transcript parser is
 * pinned on hand-written transcripts; the end-to-end cases run the real runner
 * and the real assertion library over a one-file suite in a sandbox.
 */

import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import { bashSuiteTree } from '../lib/fixtures.js';
import { expectFail, expectMisuse, expectPass, makeSandbox, type Sandbox } from '../lib/sandbox.js';
import { parseTranscript, RUNNER, spec } from './check-bash-suite.js';

let sb: Sandbox;
beforeEach(() => {
  sb = makeSandbox();
});
afterEach(() => sb.cleanup());

describe('parseTranscript', () => {
  it('counts the passing files and their assertions', () => {
    const t = parseTranscript(
      [
        '== kb bash test suite (bash 5.2), 8 at a time ==',
        'PASS  tests/hooks/a.test.sh        12 assertion(s) passed (1s)',
        'PASS  tests/hooks/b.test.sh        3 assertion(s) passed (0s)',
        '[tests] 2 file(s) passed in 1s',
      ].join('\n'),
    );
    expect(t).toEqual({ findings: [], files: 2, assertions: 15 });
  });

  it('turns each failed assertion into a finding at the line it was written', () => {
    const t = parseTranscript(
      [
        'FAIL  tests/hooks/a.test.sh        (exit 1, 0s)',
        '      |   ok   first',
        '      |   FAIL second',
        '      |        at tests/hooks/a.test.sh:12',
        '      |        expected: x',
        '      |   FAIL third',
        '      |        at tests/hooks/a.test.sh:20',
        '      |   — 2 of 3 assertion(s) failed',
        'PASS  tests/hooks/b.test.sh        1 assertion(s) passed (0s)',
      ].join('\n'),
    );
    expect(t.findings).toEqual([
      { file: 'tests/hooks/a.test.sh', line: 12, what: 'second' },
      { file: 'tests/hooks/a.test.sh', line: 20, what: 'third' },
    ]);
    expect(t.files).toBe(2);
  });

  it('ignores a transcript line shaped like `| …` outside any open block', () => {
    // With no FAIL block open there is no file to attribute a line to, even
    // one shaped exactly like a failed assertion and its place.
    const t = parseTranscript(
      [
        '== kb bash test suite (bash 5.2), 8 at a time ==',
        '      | stray line before any FAIL block',
        '      |   FAIL looks like an assertion',
        '      |        at tests/hooks/a.test.sh:1',
        'PASS  tests/hooks/a.test.sh        1 assertion(s) passed (0s)',
      ].join('\n'),
    );
    expect(t).toEqual({ findings: [], files: 1, assertions: 1 });
  });

  it('names the file for a failure with no line, and for a failed file with no parsed assertion', () => {
    const t = parseTranscript(
      [
        'FAIL  tests/hooks/a.test.sh        (exit 3, 0s)',
        '      |   FAIL harness: the test file exited 3 before finishing',
        'FAIL  tests/hooks/b.test.sh        (exit 0, no tally: the harness trap was lost, 0s)',
        '      |   ok   something',
        '[tests] 2 of 2 file(s) FAILED in 0s:',
      ].join('\n'),
    );
    expect(t.findings).toEqual([
      { file: 'tests/hooks/a.test.sh', what: 'harness: the test file exited 3 before finishing' },
      {
        file: 'tests/hooks/b.test.sh',
        what: 'failed without a parsed assertion: (exit 0, no tally: the harness trap was lost, 0s)',
      },
    ]);
  });
});

describe('the gate over a real runner', () => {
  it('passes a green suite with one summary line', async () => {
    bashSuiteTree(sb);
    const r = await sb.run(spec);
    expectPass(r);
    expect(r.out).toBe('[tests-bash] 1 test file(s), 2 assertion(s) pass');
  });

  it('reports a failed assertion at its file and line', async () => {
    bashSuiteTree(sb, true);
    const r = await sb.run(spec);
    expectFail(r);
    expect(r.out).toBe('');
    expect(r.err).toBe('[tests-bash] FAIL tests/demo/sum.test.sh:5: one and two');
  });

  it('reports a case reached through the file’s own helper at the case, not the helper', async () => {
    bashSuiteTree(sb);
    sb.write(
      'tests/demo/sum.test.sh',
      [
        '#!/usr/bin/env bash',
        '. "$(dirname "$0")/../lib.sh"',
        'check_sum() { # <a> <b> <sum>',
        '  assert_equal "$3" "$(($1 + $2))" "$1 and $2"',
        '}',
        'check_sum 1 1 2',
        'check_sum 1 2 4',
        '',
      ].join('\n'),
    );
    const r = await sb.run(spec);
    expect(r.err).toBe('[tests-bash] FAIL tests/demo/sum.test.sh:7: 1 and 2');
  });

  it('fails a hook answer that holds the right words under the wrong keys', async () => {
    bashSuiteTree(sb);
    const flat = JSON.stringify({ hookEventName: 'PreToolUse', permissionDecision: 'deny', reason: 'git add <file>' });
    const note = JSON.stringify({ hookSpecificOutput: { hookEventName: 'PostToolUse' }, note: 'make gates' });
    sb.write(
      'tests/demo/sum.test.sh',
      [
        '#!/usr/bin/env bash',
        '. "$(dirname "$0")/../lib.sh"',
        `OUTPUT='${flat}'; STATUS=0`,
        'assert_hook_denied "a flat deny" "git add <file>"',
        `OUTPUT='${note}'; STATUS=0`,
        'assert_hook_advises "a note with neither field" "make gates"',
        '',
      ].join('\n'),
    );
    const r = await sb.run(spec);
    expectFail(r);
    expect(r.err.split('\n')).toEqual([
      '[tests-bash] FAIL tests/demo/sum.test.sh:4: a flat deny: one PreToolUse deny object',
      '[tests-bash] FAIL tests/demo/sum.test.sh:4: a flat deny: says what to run instead',
      '[tests-bash] FAIL tests/demo/sum.test.sh:6: a note with neither field: one PostToolUse note, for the session and the person',
      '[tests-bash] FAIL tests/demo/sum.test.sh:6: a note with neither field: says what to do about it',
    ]);
  });

  it('names the runner when it is missing, and a suite with no test file', async () => {
    expectFail(await sb.run(spec), `[tests-bash] FAIL ${RUNNER}: is missing`);
    bashSuiteTree(sb);
    sb.rm('tests/demo');
    expectFail(await sb.run(spec), `${RUNNER}: exited 1 and named no failing test: [tests] no test files found under tests/`);
  });

  it('takes no arguments and writes nothing', async () => {
    bashSuiteTree(sb);
    const before = sb.snapshot();
    expectMisuse(await sb.run(spec, ['--nope']));
    expectMisuse(await sb.run(spec, ['hooks']));
    expect(sb.snapshot()).toEqual(before);
  });
});
