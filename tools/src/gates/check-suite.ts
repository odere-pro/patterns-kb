/**
 * The tools suite passes, above every coverage floor (spec: kb.gates.testing,
 * coverage-ratchet).
 *
 * `make tools-test` is the suite for a person: vitest's own reporter, a filter
 * by file. It is not a gate — vitest reports on stdout, in paragraphs — so
 * this wrapper runs the same suite with coverage and keeps the contract: one
 * summary line when clean, and on failure one line per failing test,
 * `[tests-vitest] FAIL <test file>: <test name> — <first line of the error>`,
 * plus one per coverage floor the run fell below, pointing at the config file
 * that holds the floors.
 *
 * The suite's JSON report is written to a temporary folder outside the tree
 * and deleted, so a run leaves nothing behind but vitest's own ignored
 * coverage report.
 *
 * Usage: check-suite   (takes no arguments: the floors hold for the whole suite only)
 */

import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { run } from '../lib/exec.js';
import { main, type GateContext, type GateSpec } from '../lib/gate.js';

export const WORKSPACE = 'tools';
/** Where the coverage floors live, and so where a floor finding points. */
export const CONFIG = `${WORKSPACE}/vitest.config.ts`;

const VITEST = path.resolve(fileURLToPath(import.meta.url), '../../../../node_modules/.bin/vitest');

/** The slice of vitest's JSON report this gate reads. */
export interface SuiteReport {
  numPassedTests: number;
  testResults: {
    name: string;
    status: string;
    message?: string;
    assertionResults: { fullName: string; status: string; failureMessages: string[] }[];
  }[];
}

/** One coverage floor the run fell below. */
export interface Shortfall {
  metric: string;
  actual: string;
  floor: string;
}

/** vitest's `ERROR: Coverage for <metric> (<n>%) does not meet global threshold (<m>%)`. */
export function parseShortfalls(output: string): Shortfall[] {
  const out: Shortfall[] = [];
  const re = /Coverage for (\w+) \(([\d.]+)%\) does not meet (?:global )?threshold \(([\d.]+)%\)/g;
  for (const m of output.matchAll(re)) {
    out.push({ metric: m[1] as string, actual: m[2] as string, floor: m[3] as string });
  }
  return out;
}

/**
 * The line of an error message that says what went wrong: the first, joined to
 * the second when the first only introduces it (`…got exit 1:` then the line
 * it quotes), so the finding carries the cause rather than a dangling colon.
 */
export function firstLine(s: string | undefined): string {
  const [head = '', next = ''] = (s ?? '')
    .split('\n')
    .map((l) => l.trim())
    .filter((l) => l !== '');
  return head.endsWith(':') && next !== '' ? `${head} ${next}` : head;
}

export const spec: GateSpec = {
  name: 'tests-vitest',
  usage: 'usage: check-suite   (takes no arguments: the coverage floors hold for the whole suite)',
  run(ctx: GateContext): string {
    const dir = path.join(ctx.root, WORKSPACE);
    if (!fs.existsSync(path.join(ctx.root, CONFIG))) {
      ctx.fail(CONFIG, 'is missing — the suite and its coverage floors are configured there');
      return '';
    }
    const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'kb-suite-'));
    const reportFile = path.join(tmp, 'report.json');
    try {
      const r = run(VITEST, ['run', '--coverage', '--reporter=json', `--outputFile=${reportFile}`], dir, {
        NO_COLOR: '1',
      });
      const output = `${r.stdout}\n${r.stderr}`;
      let report: SuiteReport | null = null;
      try {
        report = JSON.parse(fs.readFileSync(reportFile, 'utf8')) as SuiteReport;
      } catch {
        report = null;
      }
      const rel = (abs: string): string => path.relative(ctx.root, abs).split(path.sep).join('/');

      // Sorted by path: vitest reports files in the order they finished, and a
      // finding list that reorders between two runs of one tree reads as a
      // change when nothing changed.
      const files = [...(report?.testResults ?? [])].sort((a, b) => a.name.localeCompare(b.name));
      for (const file of files) {
        const failed = file.assertionResults.filter((a) => a.status === 'failed');
        for (const a of failed) {
          ctx.fail(rel(file.name), `${a.fullName} — ${firstLine(a.failureMessages[0])}`);
        }
        if (file.status === 'failed' && failed.length === 0) {
          ctx.fail(rel(file.name), `failed to run — ${firstLine(file.message)}`);
        }
      }
      for (const s of parseShortfalls(output)) {
        ctx.fail(
          CONFIG,
          `coverage for ${s.metric} is ${s.actual}%, below its floor of ${s.floor}% — cover the new code; ` +
            'never lower a floor to land a change',
        );
      }
      if (r.status !== 0 && ctx.findings === 0) {
        // `split('\n')` on any string, empty included, always answers at
        // least one element, so `.at(-1)` is never the array's `undefined`.
        const tail = output.trim().split('\n').at(-1) as string;
        ctx.failLine(`vitest exited ${r.status} and named no failing test or floor — its last line: ${tail}`);
      }
      return `[tests-vitest] ${report?.numPassedTests ?? 0} tests in ${files.length} files pass; every coverage floor holds`;
    } finally {
      fs.rmSync(tmp, { recursive: true, force: true });
    }
  },
};

main(spec, import.meta.url);
