/**
 * The bash test suite passes (spec: kb.gates.testing; kb.harness.hooks,
 * hook-tests).
 *
 * The hooks under `.claude/hooks/` are bash, and so are their tests:
 * `tests/**\/*.test.sh`, run by `tests/run.sh`. That runner is the suite for a
 * person — one PASS or FAIL line per file, a failing file's transcript under
 * it — and it reports on stdout, in its own shape. This wrapper runs the same
 * runner and keeps the gate contract: one summary line when clean, and on
 * failure one line per failed assertion,
 * `[tests-bash] FAIL <test file>:<line>: <assertion label>`, at the line
 * `tests/lib.sh` reports it from. A file that failed without a parsed
 * assertion — a crash, a lost EXIT trap — is one finding naming the file.
 *
 * Usage: check-bash-suite   (takes no arguments: the suite runs whole)
 */

import fs from 'node:fs';
import path from 'node:path';

import { run } from '../lib/exec.js';
import { main, type GateContext, type GateSpec } from '../lib/gate.js';

export const RUNNER = 'tests/run.sh';

export interface SuiteFinding {
  readonly file: string;
  readonly line?: number;
  readonly what: string;
}

export interface Transcript {
  readonly findings: SuiteFinding[];
  readonly files: number;
  readonly assertions: number;
}

/** What `tests/run.sh` said, as findings and counts. */
export function parseTranscript(out: string): Transcript {
  const findings: SuiteFinding[] = [];
  let files = 0;
  let assertions = 0;
  let block: { file: string; header: string; found: number } | null = null;
  let label: string | null = null;

  const flushLabel = (): void => {
    if (block !== null && label !== null) {
      findings.push({ file: block.file, what: label });
      block.found += 1;
    }
    label = null;
  };
  const closeBlock = (): void => {
    flushLabel();
    if (block !== null && block.found === 0) {
      findings.push({ file: block.file, what: `failed without a parsed assertion: ${block.header}` });
    }
    block = null;
  };

  for (const line of out.split('\n')) {
    const pass = /^PASS\s+(\S+)\s+(\d+) assertion\(s\) passed/.exec(line);
    if (pass !== null) {
      closeBlock();
      files += 1;
      assertions += Number(pass[2]);
      continue;
    }
    const fail = /^FAIL\s+(\S+)\s+(\(.*\))\s*$/.exec(line);
    if (fail !== null) {
      closeBlock();
      files += 1;
      block = { file: fail[1] as string, header: fail[2] as string, found: 0 };
      continue;
    }
    const inner = /^\s+\| ?(.*)$/.exec(line);
    if (block === null || inner === null) {
      if (inner === null) closeBlock();
      continue;
    }
    const text = inner[1] as string;
    const failed = /^ {2}FAIL (.+)$/.exec(text);
    if (failed !== null) {
      flushLabel();
      label = failed[1] as string;
      continue;
    }
    const at = /^ {7}at (\S+):(\d+)$/.exec(text);
    if (at !== null && label !== null) {
      findings.push({ file: at[1] as string, line: Number(at[2]), what: label });
      (block as { found: number }).found += 1;
      label = null;
    }
  }
  closeBlock();
  return { findings, files, assertions };
}

export const spec: GateSpec = {
  name: 'tests-bash',
  usage: 'usage: check-bash-suite   (takes no arguments: the suite runs whole)',
  run(ctx: GateContext): string {
    if (!fs.existsSync(path.join(ctx.root, RUNNER))) {
      ctx.fail(RUNNER, 'is missing — the bash suite runs the hooks’ tests through it');
      return '';
    }
    const r = run('bash', [RUNNER], ctx.root);
    const t = parseTranscript(r.stdout);
    for (const f of t.findings) ctx.fail(f.file, f.what, f.line);
    if (r.status !== 0 && ctx.findings === 0) {
      // `split('\n')` on any string, empty included, always answers at least
      // one element, so `.at(-1)` is never the array's `undefined`.
      const said = r.stderr.trim().split('\n').at(-1) as string;
      ctx.fail(RUNNER, `exited ${r.status} and named no failing test: ${said}`);
    }
    return `[tests-bash] ${t.files} test file(s), ${t.assertions} assertion(s) pass`;
  },
};

main(spec, import.meta.url);
