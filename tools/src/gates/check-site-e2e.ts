/**
 * The reader's flows over the built site pass in a real browser (the site-e2e
 * gate): home to a page, the sidebar, search, the theme, the marks,
 * the filters, the onward links, the map pages, diagrams and sketches, the
 * keyboard path and the phone menu — each from disk and from a server, at a
 * desktop and a phone width.
 *
 * The flows are Playwright tests under tools/e2e/, configured by
 * tools/e2e/playwright.config.ts. Playwright reports on stdout in its own
 * shape, so this wrapper runs it with the JSON reporter into a temporary file
 * outside the tree and keeps the gate contract: one summary line when every
 * flow passes, and one finding per failed flow and project,
 * `[site-e2e] FAIL <flow>: [<project>] <what went wrong> (<spec>:<line>)`.
 *
 * With no browser installed it opens no page, prints the skip with the
 * command that installs one, and exits 0, like check-site-axe.ts, unless
 * KB_REQUIRE_BROWSER=1 is set (CI's site job sets it): then a missing browser
 * is a finding, so a runner without Chromium cannot pass by running nothing.
 *
 * A skipped flow is pinned too. docs/data/allow/site-e2e.json lists each flow
 * that may skip with the number of projects it skips in (`count`) and why; a
 * flow that skips more often than that, a skipped flow with no entry, and an
 * entry that allows more skips than happened are all findings, so neither a
 * new skip nor a stale allowance goes unseen. The comparison runs only after
 * every flow passed or skipped: a failed flow never reaches its skip.
 *
 * It runs from `make site-e2e`, after `make site-build`, and in CI's site
 * job; never in `make validate` or `make site-build`.
 *
 * Usage: check-site-e2e   (no arguments; reads site/dist; needs make site-deps)
 */

import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { chromium } from 'playwright-core';

import { run as spawn, type RunResult } from '../lib/exec.js';
import { readAllowlist, type AllowEntry } from '../lib/allowlist.js';
import { main, type GateContext, type GateSpec } from '../lib/gate.js';
import { browserRequired, REQUIRE_BROWSER } from '../lib/require-browser.js';
import { DIST } from '../site/site-output.js';

/** The flows' configuration, from the repo root. */
export const CONFIG = 'tools/e2e/playwright.config.ts';

/** The command that installs the browser this gate needs. */
export const INSTALL = 'make site-deps';

/** The skip allowance: one entry per flow that may skip, with how many projects it skips in. */
export const ALLOW = 'docs/data/allow/site-e2e.json';

/** Playwright's test runner, run by the node running this gate. */
const CLI = path.resolve(fileURLToPath(import.meta.url), '../../../../node_modules/@playwright/test/cli.js');

/** The slice of Playwright's JSON report this gate reads. */
export interface E2eError {
  message?: string;
  location?: { file: string; line: number };
}
export interface E2eTest {
  projectName: string;
  /** expected, unexpected, flaky or skipped. */
  status: string;
  annotations?: { type: string; description?: string }[];
  results: { error?: E2eError; errors?: E2eError[] }[];
}
export interface E2eSpec {
  title: string;
  /** Relative to the config's `rootDir`. */
  file: string;
  /** The line the flow's `test(…)` call is on. */
  line?: number;
  tests: E2eTest[];
}
export interface E2eSuite {
  specs?: E2eSpec[];
  suites?: E2eSuite[];
}
export interface E2eReport {
  config?: { rootDir: string };
  suites: E2eSuite[];
  errors?: E2eError[];
  stats: { duration: number };
}

/** One flow in one project, as the summary and the findings name it. */
export interface Outcome {
  flow: string;
  project: string;
  file: string;
  status: 'passed' | 'failed' | 'skipped';
  /** Why it failed, or why it was skipped; empty when it passed. */
  why: string;
}

/** Terminal colour codes: Playwright colours its messages even into JSON. */
const ANSI = new RegExp(`${String.fromCharCode(0x1b)}\\[[0-9;]*m`, 'g');

/**
 * An error as one line: its first line, joined to the next when that says
 * which element or value it was about (`Locator: …`, `Expected: …`), then
 * where in the spec it was raised — or, for an error raised inside a boxed
 * helper step, which carries no location of its own, where the flow starts.
 */
export function errorLine(err: E2eError | undefined, root: string, fallback?: { file: string; line: number }): string {
  const lines = (err?.message ?? 'failed with no message')
    .replace(ANSI, '')
    .split('\n')
    .map((l) => l.trim())
    .filter((l) => l !== '');
  const [head = '', next = ''] = lines;
  const detail = /^(Locator|Expected):/.test(next) ? ` — ${next}` : '';
  const at = err?.location ?? fallback;
  const loc = at === undefined ? '' : ` (${path.relative(root, at.file).split(path.sep).join('/')}:${at.line})`;
  return `${head.replace(/^Error:\s*/, '')}${detail}${loc}`;
}

/** Every spec in a report, depth first, in the order Playwright lists them. */
export function specsOf(suites: readonly E2eSuite[]): E2eSpec[] {
  return suites.flatMap((s) => [...(s.specs ?? []), ...specsOf(s.suites ?? [])]);
}

/** Every flow in every project, sorted by flow then project so two runs print alike. */
export function outcomes(report: E2eReport, root: string): Outcome[] {
  const out: Outcome[] = [];
  for (const spec of specsOf(report.suites)) {
    const start =
      report.config === undefined || spec.line === undefined
        ? undefined
        : { file: path.join(report.config.rootDir, spec.file), line: spec.line };
    for (const t of spec.tests) {
      const last = t.results.at(-1);
      const status = t.status === 'skipped' ? 'skipped' : t.status === 'expected' ? 'passed' : 'failed';
      const why =
        status === 'failed'
          ? errorLine(last?.error ?? last?.errors?.[0], root, start)
          : status === 'skipped'
            ? (t.annotations?.find((a) => a.type === 'skip')?.description ?? 'skipped')
            : '';
      out.push({ flow: spec.title, project: t.projectName, file: spec.file, status, why });
    }
  }
  return out.sort((a, b) => (a.flow === b.flow ? a.project.localeCompare(b.project) : a.flow.localeCompare(b.flow)));
}

/** The one line a green run prints: flows, projects, counts, the skips and why, and the time. */
export function summary(all: readonly Outcome[], ms: number): string {
  const flows = new Set(all.map((o) => o.flow)).size;
  const projects = [...new Set(all.map((o) => o.project))].sort();
  const passed = all.filter((o) => o.status === 'passed').length;
  const skipped = new Map<string, { n: number; why: string }>();
  for (const o of all.filter((x) => x.status === 'skipped')) {
    const seen = skipped.get(o.flow) ?? { n: 0, why: o.why };
    skipped.set(o.flow, { n: seen.n + 1, why: seen.why });
  }
  const skips = [...skipped].map(([flow, s]) => `${flow} ×${s.n}: ${s.why}`).join('; ');
  return (
    `[site-e2e] ${flows} flow(s) × ${projects.length} project(s) (${projects.join(', ')}): ` +
    `${passed} passed, ${all.length - passed} skipped${skips === '' ? '' : ` (${skips})`} in ${(ms / 1000).toFixed(1)}s`
  );
}

/** Runs the flows, writing the JSON report where asked; a fake in the tests. */
export type Runner = (root: string, reportFile: string) => RunResult;

/** The real runner: Playwright's CLI on the flows' config, JSON report to a file. */
export const runPlaywright: Runner = (root, reportFile) =>
  spawn(process.execPath, [CLI, 'test', '-c', CONFIG, '--reporter=json'], root, {
    PLAYWRIGHT_JSON_OUTPUT_NAME: reportFile,
    NO_COLOR: '1',
    FORCE_COLOR: '0',
  });

/** Whether the Chromium this Playwright build expects is on disk. */
export function browserInstalled(executable: () => string = () => chromium.executablePath()): boolean {
  try {
    return fs.existsSync(executable());
  } catch {
    return false;
  }
}

/**
 * Holds the skipped flows to the allowance file: each skipped flow needs an
 * entry whose `count` is at least its skips, and no entry may allow more
 * skips than happened.
 */
export function checkSkips(ctx: GateContext, all: readonly Outcome[]): void {
  const entries = readAllowlist(ctx, ALLOW, {
    missing: 'it lists the flows that may skip and how often, even when none may',
    emptyReason: 'says nothing about why the flow may skip',
  });
  if (entries === null) return;
  const allowed = new Map<string, AllowEntry & { count?: unknown }>(entries.map((e) => [e.match, e]));
  const skips = new Map<string, number>();
  for (const o of all.filter((x) => x.status === 'skipped')) skips.set(o.flow, (skips.get(o.flow) ?? 0) + 1);
  for (const [flow, n] of skips) {
    const entry = allowed.get(flow);
    if (entry === undefined) {
      ctx.fail(ALLOW, `flow "${flow}" skipped in ${n} project(s) and has no entry — fix what skips it, or add an entry with a reason`);
    } else if (!Number.isInteger(entry.count) || (entry.count as number) < 1) {
      ctx.fail(ALLOW, `entry "${entry.name}" has no count (a whole number from 1)`);
    } else if (n > (entry.count as number)) {
      ctx.fail(ALLOW, `flow "${flow}" skipped in ${n} project(s), more than the ${entry.count} its entry allows`);
    }
  }
  for (const entry of entries as (AllowEntry & { count?: unknown })[]) {
    const n = skips.get(entry.match) ?? 0;
    if (Number.isInteger(entry.count) && (entry.count as number) > n) {
      ctx.fail(ALLOW, `entry "${entry.name}" allows ${entry.count} skip(s) of "${entry.match}" but ${n} happened — lower or delete it`);
    }
  }
}

/** The whole run, with the runner, the browser's presence and whether one is required passed in. */
export function check(ctx: GateContext, runner: Runner, installed: boolean, required = false): string {
  if (!fs.existsSync(path.join(ctx.root, DIST, 'index.html'))) {
    ctx.failLine(`no built site at ${DIST} — build it first: make site-build`);
    return '';
  }
  if (!installed && required) {
    ctx.failLine(`no Chromium installed and ${REQUIRE_BROWSER}=1 — run ${INSTALL}, then this gate`);
    return '';
  }
  if (!installed) {
    return `[site-e2e] skipped: no Chromium installed, so no flow was run — run ${INSTALL}, then this gate`;
  }
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'kb-e2e-'));
  const reportFile = path.join(tmp, 'report.json');
  try {
    const r = runner(ctx.root, reportFile);
    let report: E2eReport | null;
    try {
      report = JSON.parse(fs.readFileSync(reportFile, 'utf8')) as E2eReport;
    } catch {
      report = null;
    }
    for (const err of report?.errors ?? []) ctx.failLine(`the run itself failed: ${errorLine(err, ctx.root)}`);
    const all = report === null ? [] : outcomes(report, ctx.root);
    for (const o of all.filter((x) => x.status === 'failed')) {
      ctx.failRaw(`[${ctx.name}] FAIL ${o.flow}: [${o.project}] ${o.why}`);
    }
    if (r.status !== 0 && ctx.findings === 0) {
      const tail = `${r.stdout}\n${r.stderr}`.trim().split('\n').at(-1) as string;
      ctx.failLine(`playwright exited ${r.status} and named no failing flow — its last line: ${tail}`);
    }
    if (r.status === 0 && all.length === 0) ctx.failLine(`playwright ran no flow — is ${CONFIG} finding its specs?`);
    if (ctx.findings === 0) checkSkips(ctx, all);
    return summary(all, report?.stats.duration ?? 0);
  } finally {
    fs.rmSync(tmp, { recursive: true, force: true });
  }
}

export const spec: GateSpec = {
  name: 'site-e2e',
  usage: 'usage: check-site-e2e   (no arguments; reads site/dist; needs make site-deps)',
  run(ctx: GateContext): string {
    return check(ctx, runPlaywright, browserInstalled(), browserRequired());
  },
};

main(spec, import.meta.url);
