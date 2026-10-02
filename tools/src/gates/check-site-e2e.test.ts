/**
 * The site-e2e gate: Playwright's JSON report turned into the gate contract.
 *
 * The decisions — which flows failed and in which project, how an error
 * becomes one line, what the summary counts and why a flow was skipped, a run
 * that broke before any flow, the skip with no browser, the missing build —
 * are tested on a fake runner that writes a report, so they hold on a
 * checkout with no Chromium and no built site. One case runs the real runner
 * against a sandbox that holds no flows, which proves the spawn and the
 * finding for a run that names nothing.
 */

import fs from 'node:fs';

import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import type { RunResult } from '../lib/exec.js';
import { runGate, type GateContext } from '../lib/gate.js';
import { REQUIRE_BROWSER } from '../lib/require-browser.js';
import { e2eProject } from '../lib/fixtures.js';
import { expectFail, expectMisuse, expectPass, makeSandbox, type Sandbox } from '../lib/sandbox.js';
import {
  ALLOW,
  browserInstalled,
  check,
  CONFIG,
  errorLine,
  INSTALL,
  outcomes,
  runPlaywright,
  spec,
  specsOf,
  summary,
  type E2eReport,
  type E2eTest,
  type Runner,
} from './check-site-e2e.js';

let sb: Sandbox;
beforeEach(() => {
  sb = makeSandbox();
});
afterEach(() => sb.cleanup());

const ok = (projectName: string): E2eTest => ({ projectName, status: 'expected', results: [{}] });
const skipped = (projectName: string, why?: string): E2eTest => ({
  projectName,
  status: 'skipped',
  annotations: why === undefined ? [] : [{ type: 'skip', description: why }],
  results: [],
});
const failed = (projectName: string, message: string, line = 12): E2eTest => ({
  projectName,
  status: 'unexpected',
  results: [{ error: { message, location: { file: `${sb.dir}/tools/e2e/search.spec.ts`, line } } }],
});

/** A report with the flows spread over nested suites, the way Playwright nests file and describe. */
function report(flows: Record<string, E2eTest[]>, extra: Partial<E2eReport> = {}): E2eReport {
  const specs = Object.entries(flows).map(([title, tests]) => ({ title, file: 'x.spec.ts', tests }));
  return { suites: [{ specs: specs.slice(0, 1), suites: [{ specs: specs.slice(1) }] }], stats: { duration: 12_345 }, ...extra };
}

/** A runner that writes `rep` where the gate asks and exits `status`; it records the root it ran in. */
function fake(rep: E2eReport | null, status = 0, said: Partial<RunResult> = {}): Runner & { roots: string[] } {
  const roots: string[] = [];
  const runner = (root: string, reportFile: string): RunResult => {
    roots.push(root);
    if (rep !== null) fs.writeFileSync(reportFile, JSON.stringify(rep));
    return { status, stdout: said.stdout ?? '', stderr: said.stderr ?? '' };
  };
  return Object.assign(runner, { roots });
}

/** A real gate context whose summary and findings are collected, not printed. */
async function withCtx(fn: (ctx: GateContext) => string): Promise<{ r: string; err: string[]; status: number }> {
  const err: string[] = [];
  let r = '';
  const status = await runGate(
    {
      name: 'site-e2e',
      usage: 'usage: harness',
      run(ctx) {
        r = fn(ctx);
        return r;
      },
    },
    [],
    { out: () => {}, err: (l) => err.push(l) },
    sb.dir,
  );
  return { r, err, status };
}

/** The skip allowance file, with `allowed` as flow → count. */
const allow = (allowed: Record<string, number | undefined> = {}): void => {
  sb.write(
    ALLOW,
    JSON.stringify({
      version: 1,
      entries: Object.entries(allowed).map(([flow, count]) => ({ name: flow, match: flow, count, reason: 'for the test' })),
    }),
  );
};

const built = (allowed: Record<string, number | undefined> = {}): void => {
  sb.write('site/dist/index.html', '<!doctype html><title>t</title>');
  allow(allowed);
};

describe('errorLine', () => {
  it('keeps the first line, the locator it was about and where the spec raised it, without colour or the Error prefix', () => {
    const msg = '\u001b[31mError: expect(locator).toBeFocused() failed\u001b[39m\n\nLocator:  getByRole(\'link\')\nExpected: focused';
    expect(errorLine({ message: msg, location: { file: `${sb.dir}/tools/e2e/reading.spec.ts`, line: 141 } }, sb.dir)).toBe(
      "expect(locator).toBeFocused() failed — Locator:  getByRole('link') (tools/e2e/reading.spec.ts:141)",
    );
  });

  it('leaves out a second line that is not about an element or a value', () => {
    expect(errorLine({ message: 'Test timeout of 30000ms exceeded.\n\nCall log:\n  - waiting' }, sb.dir)).toBe('Test timeout of 30000ms exceeded.');
  });

  it('says something when there is no error at all', () => {
    expect(errorLine(undefined, sb.dir)).toBe('failed with no message');
    expect(errorLine({ message: '' }, sb.dir)).toBe('');
  });
});

describe('reading the report', () => {
  it('finds specs at every depth', () => {
    const rep = report({ a: [ok('p')], b: [ok('p')], c: [ok('p')] });
    expect(specsOf(rep.suites).map((s) => s.title)).toEqual(['a', 'b', 'c']);
  });

  it('sorts flows then projects, and says why a flow failed or was skipped', () => {
    const rep = report({
      search: [failed('served-phone', 'Error: boom'), ok('file-desktop')],
      'draft-chip': [skipped('file-desktop', 'no page is draft'), skipped('file-phone')],
    });
    expect(outcomes(rep, sb.dir)).toEqual([
      { flow: 'draft-chip', project: 'file-desktop', file: 'x.spec.ts', status: 'skipped', why: 'no page is draft' },
      { flow: 'draft-chip', project: 'file-phone', file: 'x.spec.ts', status: 'skipped', why: 'skipped' },
      { flow: 'search', project: 'file-desktop', file: 'x.spec.ts', status: 'passed', why: '' },
      { flow: 'search', project: 'served-phone', file: 'x.spec.ts', status: 'failed', why: 'boom (tools/e2e/search.spec.ts:12)' },
    ]);
  });

  it('points an error with no location of its own, raised in a boxed step, at the line the flow starts on', () => {
    const rep: E2eReport = {
      config: { rootDir: `${sb.dir}/tools/e2e` },
      suites: [{ specs: [{ title: 'next-steps', file: 'navigation.spec.ts', line: 57, tests: [{ projectName: 'p', status: 'unexpected', results: [{ error: { message: 'Error: lands nowhere' } }] }] }] }],
      stats: { duration: 1 },
    };
    expect(outcomes(rep, sb.dir)[0]?.why).toBe('lands nowhere (tools/e2e/navigation.spec.ts:57)');
  });

  it('reads the error list when a result carries no single error, and a flaky flow as failed', () => {
    const t: E2eTest = { projectName: 'p', status: 'flaky', results: [{ errors: [{ message: 'second try broke' }] }] };
    expect(outcomes(report({ lens: [t] }), sb.dir)[0]).toMatchObject({ status: 'failed', why: 'second try broke' });
  });

  it('summarises flows, projects, passes, each skipped flow once with its reason, and the time', () => {
    const all = outcomes(
      report({
        lens: [ok('file-desktop'), ok('served-phone')],
        'phone-menu': [skipped('file-desktop', 'a phone-width flow'), ok('served-phone')],
      }),
      sb.dir,
    );
    expect(summary(all, 12_345)).toBe(
      '[site-e2e] 2 flow(s) × 2 project(s) (file-desktop, served-phone): 3 passed, 1 skipped (phone-menu ×1: a phone-width flow) in 12.3s',
    );
    expect(summary([], 0)).toBe('[site-e2e] 0 flow(s) × 0 project(s) (): 0 passed, 0 skipped in 0.0s');
  });
});

describe('the gate', () => {
  it('asks for a build when there is no built site, and runs nothing', async () => {
    const runner = fake(report({}));
    const { err, status } = await withCtx((ctx) => check(ctx, runner, true));
    expect(status).toBe(1);
    expect(err).toEqual(['[site-e2e] FAIL: no built site at site/dist — build it first: make site-build']);
    expect(runner.roots).toEqual([]);
    expectFail(await sb.run(spec), 'no built site at site/dist');
  });

  it('with no browser installed, runs no flow, prints the skip and the install command, and exits 0', async () => {
    built();
    const runner = fake(report({}));
    const { r, err, status } = await withCtx((ctx) => check(ctx, runner, false));
    expect(status).toBe(0);
    expect(err).toEqual([]);
    expect(r).toBe(`[site-e2e] skipped: no Chromium installed, so no flow was run — run ${INSTALL}, then this gate`);
    expect(runner.roots).toEqual([]);
  });

  it('with no browser and KB_REQUIRE_BROWSER set, fails naming the install command and runs no flow', async () => {
    built();
    const runner = fake(report({}));
    const { err, status } = await withCtx((ctx) => check(ctx, runner, false, true));
    expect(status).toBe(1);
    expect(err).toEqual([`[site-e2e] FAIL: no Chromium installed and ${REQUIRE_BROWSER}=1 — run ${INSTALL}, then this gate`]);
    expect(runner.roots).toEqual([]);
  });

  it('passes skips the allowance names, and prints the count', async () => {
    built({ 'phone-menu': 2 });
    const rep = report({ 'phone-menu': [skipped('file-desktop', 'phone'), skipped('served-desktop', 'phone'), ok('file-phone')] });
    const { r, err, status } = await withCtx((ctx) => check(ctx, fake(rep), true));
    expect(status).toBe(0);
    expect(err).toEqual([]);
    expect(r).toContain('1 passed, 2 skipped');
  });

  it('fails a flow that skips in more projects than its entry allows', async () => {
    built({ 'phone-menu': 1 });
    const rep = report({ 'phone-menu': [skipped('file-desktop'), skipped('served-desktop')] });
    const { err, status } = await withCtx((ctx) => check(ctx, fake(rep), true));
    expect(status).toBe(1);
    expect(err).toEqual([`[site-e2e] FAIL ${ALLOW}: flow "phone-menu" skipped in 2 project(s), more than the 1 its entry allows`]);
  });

  it('fails a skipped flow that has no entry', async () => {
    built();
    const { err } = await withCtx((ctx) => check(ctx, fake(report({ lens: [skipped('file-desktop')] })), true));
    expect(err).toEqual([`[site-e2e] FAIL ${ALLOW}: flow "lens" skipped in 1 project(s) and has no entry — fix what skips it, or add an entry with a reason`]);
  });

  it('fails a stale allowance: an entry that allows more skips than happened, or for a flow that no longer skips', async () => {
    built({ 'phone-menu': 3, 'draft-chip': 4 });
    const rep = report({ 'phone-menu': [skipped('file-desktop'), skipped('served-desktop')], 'draft-chip': [ok('file-desktop')] });
    const { err } = await withCtx((ctx) => check(ctx, fake(rep), true));
    expect(err).toEqual([
      `[site-e2e] FAIL ${ALLOW}: entry "phone-menu" allows 3 skip(s) of "phone-menu" but 2 happened — lower or delete it`,
      `[site-e2e] FAIL ${ALLOW}: entry "draft-chip" allows 4 skip(s) of "draft-chip" but 0 happened — lower or delete it`,
    ]);
  });

  it('fails an entry with no usable count, and a missing allowance file', async () => {
    built({ 'phone-menu': undefined });
    const rep = report({ 'phone-menu': [skipped('file-desktop')] });
    const bad = await withCtx((ctx) => check(ctx, fake(rep), true));
    expect(bad.err).toEqual([`[site-e2e] FAIL ${ALLOW}: entry "phone-menu" has no count (a whole number from 1)`]);

    sb.rm(ALLOW);
    const gone = await withCtx((ctx) => check(ctx, fake(report({ a: [ok('p')] })), true));
    expect(gone.err[0]).toContain(`${ALLOW}: is missing`);
  });

  it('does not compare skips while a flow has failed, since a failed flow never reaches its skip', async () => {
    built();
    const rep = report({ 'draft-chip': [failed('file-desktop', 'Error: boom')] });
    const { err } = await withCtx((ctx) => check(ctx, fake(rep, 1), true));
    expect(err).toEqual(['[site-e2e] FAIL draft-chip: [file-desktop] boom (tools/e2e/search.spec.ts:12)']);
  });

  it('ships an allowance whose counts add up to the skips the flows make in the projects that run them', () => {
    const real = JSON.parse(fs.readFileSync(new URL('../../../docs/data/allow/site-e2e.json', import.meta.url), 'utf8')) as {
      entries: { match: string; count: number; reason: string }[];
    };
    expect(real.entries.map((e) => e.match).sort()).toEqual(['action-bar-clear-of-toc', 'draft-chip', 'phone-diagram-size', 'phone-home-menu', 'phone-menu', 'phone-table-scroll', 'toc-tracking']);
    expect(real.entries.reduce((n, e) => n + e.count, 0)).toBe(16);
  });

  it('passes with one summary line when every flow passes, running in the repo root', async () => {
    built();
    const runner = fake(report({ search: [ok('file-desktop')] }));
    const { r, err, status } = await withCtx((ctx) => check(ctx, runner, true));
    expect(status).toBe(0);
    expect(err).toEqual([]);
    expect(r).toBe('[site-e2e] 1 flow(s) × 1 project(s) (file-desktop): 1 passed, 0 skipped in 12.3s');
    expect(runner.roots).toEqual([sb.dir]);
  });

  it('names each failed flow with its project, and nothing else, exiting 1', async () => {
    built();
    const runner = fake(
      report({ search: [failed('file-desktop', 'Error: no results'), ok('file-phone')], lens: [failed('served-phone', 'Error: not pressed', 40)] }),
      1,
    );
    const { err, status } = await withCtx((ctx) => check(ctx, runner, true));
    expect(status).toBe(1);
    expect(err).toEqual([
      '[site-e2e] FAIL lens: [served-phone] not pressed (tools/e2e/search.spec.ts:40)',
      '[site-e2e] FAIL search: [file-desktop] no results (tools/e2e/search.spec.ts:12)',
    ]);
  });

  it('reports a run that broke before any flow, such as a fixture that could not find its page', async () => {
    built();
    const runner = fake(report({}, { errors: [{ message: 'Error: no built page is drawing a diagram' }] }), 1);
    const { err } = await withCtx((ctx) => check(ctx, runner, true));
    expect(err).toEqual(['[site-e2e] FAIL: the run itself failed: no built page is drawing a diagram']);
  });

  it('says so when Playwright fails and leaves no report, quoting its last line', async () => {
    built();
    const { err } = await withCtx((ctx) => check(ctx, fake(null, 1, { stderr: 'first\nError: port 4719 is in use' }), true));
    expect(err).toEqual(['[site-e2e] FAIL: playwright exited 1 and named no failing flow — its last line: Error: port 4719 is in use']);
  });

  it('fails a green run that ran no flow at all', async () => {
    built();
    const { err } = await withCtx((ctx) => check(ctx, fake(report({})), true));
    expect(err).toEqual([`[site-e2e] FAIL: playwright ran no flow — is ${CONFIG} finding its specs?`]);
  });

  it('exits 2 on any argument', async () => {
    expectMisuse(await sb.run(spec, ['--nope']));
  });

  it('asks the browser build where Chromium lives, and says no when the answer is missing or throws', () => {
    expect(browserInstalled(() => '/nowhere/chrome')).toBe(false);
    expect(
      browserInstalled(() => {
        throw new Error('no build for this platform');
      }),
    ).toBe(false);
    expect(browserInstalled(() => process.execPath)).toBe(true);
    expect(typeof browserInstalled()).toBe('boolean');
  });

  // The real runner, in a checkout with no flows: Playwright starts, finds no
  // config, and exits non-zero with no report — the gate's "named nothing" case.
  it(
    'spawns the real runner in the root it is given',
    async () => {
      built();
      const { err, status } = await withCtx((ctx) => check(ctx, runPlaywright, true));
      expect(status).toBe(1);
      expect(err).toHaveLength(1);
      expect(err[0]).toMatch(/^\[site-e2e\] FAIL: playwright exited [1-9]\d* and named no failing flow/);
    },
    60_000,
  );

  // The browser leg, where `make site-deps` has installed Chromium: a one-page
  // site and one flow, green and then red, through the real runner.
  it.runIf(browserInstalled())(
    'in real Chromium, passes a green flow and names a red one with its project and spec line',
    async () => {
      e2eProject(sb);
      const ok = await sb.run(spec);
      expectPass(ok);
      expect(ok.out).toMatch(/^\[site-e2e\] 1 flow\(s\) × 1 project\(s\) \(file-desktop\): 1 passed, 0 skipped in \d+\.\ds\n?$/);

      e2eProject(sb, true);
      const bad = await sb.run(spec);
      expectFail(bad);
      expect(bad.err.trim()).toMatch(/^\[site-e2e\] FAIL home: \[file-desktop\] expect\(locator\)\.toHaveText\(expected\) failed — Locator: .* \(tools\/e2e\/home\.spec\.ts:7\)$/);
    },
    120_000,
  );
});
