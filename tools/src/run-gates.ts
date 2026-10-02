/**
 * The collecting driver: one run, every finding (spec: kb.gates.driver).
 *
 * A make recipe of gate lines stops at the first one that exits non-zero, so a
 * branch with three unrelated findings costs three runs to discover all three.
 * This driver runs them all, replays every failure, and exits once.
 *
 * It takes its list from `docs/data/gates.json`, the one home for what a gate
 * is and where it runs. A gate is driven here when it declares
 * `local_command`; `local_target` says which make target owns it (default
 * `validate`). Nothing is listed twice — adding a row with a local command
 * adds it to `make validate`, and `check-gates-sync` fails if the Makefile
 * stops calling this driver.
 *
 * Three modes on top of "run everything":
 *
 *   --changed [file…]  only the gates whose `scans` globs match what changed
 *                      since the merge-base with origin/main. File-scoped
 *                      gates (`positional: true`) additionally get just those
 *                      paths, so editing one page checks one page.
 *   --fix              only the gates that declare `fixable`, run with `--fix`
 *                      so they apply the repair they already computed.
 *   --list             print the selected gate ids and stop.
 *
 * Environment:
 *   FAILFAST=1   stop at the first failing gate (one at a time, in order)
 *   JOBS=n       how many gates run at once (default: cores - 1, capped at 8)
 *
 * Exit 0 clean, 1 findings, 2 misuse — the same contract every gate keeps.
 */

import { spawn } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { pathToFileURL } from 'node:url';

import type { Gate, Registry } from './gen/gen-gates.js';
import { exitStatus, lines, run } from './lib/exec.js';
import { repoRoot } from './lib/gate.js';
import { matches } from './lib/glob.js';

const SRC = 'docs/data/gates.json';
const DEFAULT_TARGET = 'validate';
/** What a person runs when a gate's tool is missing from their machine. */
const SETUP = 'make install';

// ---------------------------------------------------------------------------
// Selection
// ---------------------------------------------------------------------------
export interface Job {
  readonly gate: Gate;
  /** The shell command as it will run — file arguments already appended. */
  readonly command: string;
}

/** Single-quote a path for `bash -c`, the way a filename with a space needs. */
export function shellQuote(s: string): string {
  return `'${s.replace(/'/g, `'\\''`)}'`;
}

export function targetOf(g: Gate): string {
  return g.local_target ?? DEFAULT_TARGET;
}

/** Every gate this driver owns for one make target, in registry order. */
export function driven(reg: Registry, target: string): Gate[] {
  return reg.gates.filter((g) => g.local_command !== undefined && targetOf(g) === target);
}

/**
 * Narrow a gate list to what a set of changed paths can affect.
 *
 * A gate with no `scans` cannot be narrowed and always runs, unnarrowed — the
 * safe default, so a gate added without the field is over-run rather than
 * skipped (driver-C5). A gate that also declares `positional` is handed the
 * matching paths, each quoted.
 */
export function selectChanged(gates: readonly Gate[], changed: readonly string[]): Job[] {
  const jobs: Job[] = [];
  for (const g of gates) {
    const command = g.local_command as string;
    if (g.scans === undefined) {
      jobs.push({ gate: g, command });
      continue;
    }
    const hit = changed.filter((f) => matches(f, g.scans as string[]));
    if (hit.length === 0) continue;
    jobs.push({
      gate: g,
      command: g.positional ? `${command} ${hit.map(shellQuote).join(' ')}` : command,
    });
  }
  return jobs;
}

/**
 * What this branch changed, relative to where it left main (driver-C4).
 *
 * The merge-base, not `origin/main` itself: diffing against the tip reports
 * everything main gained since the branch started. Files git does not know
 * about yet count too — a page written and not yet staged is exactly the thing
 * being checked. A path the branch deleted is dropped: no gate can read it.
 */
export function changedFiles(root: string): string[] {
  const base = (): string => {
    for (const ref of ['origin/main', 'main']) {
      const r = run('git', ['merge-base', 'HEAD', ref], root);
      if (r.status === 0 && r.stdout.trim() !== '') return r.stdout.trim();
    }
    return '';
  };
  const from = base();
  const out = new Set<string>();
  if (from !== '') {
    for (const f of lines(run('git', ['diff', '--name-only', from], root).stdout)) out.add(f);
  }
  for (const f of lines(run('git', ['ls-files', '--others', '--exclude-standard'], root).stdout)) {
    out.add(f);
  }
  return [...out].filter((f) => fs.existsSync(path.join(root, f))).sort();
}

// ---------------------------------------------------------------------------
// Running
// ---------------------------------------------------------------------------
export interface Outcome {
  readonly job: Job;
  readonly status: number;
  /** stdout alone: on a pass, the gate's one summary line. */
  readonly stdout: string;
  /** stderr alone: on a pass, only notes and repair lines. */
  readonly stderr: string;
  /** stdout and stderr as the gate wrote them, replayed byte for byte on a failure. */
  readonly output: string;
  readonly ms: number;
}

const have = new Map<string, boolean>();

/** Is a tool the gate declares actually on PATH? Asked once per tool. */
function onPath(tool: string, root: string): boolean {
  if (!have.has(tool)) have.set(tool, run('bash', ['-c', `command -v ${shellQuote(tool)}`], root).status === 0);
  return have.get(tool) === true;
}

async function exec(job: Job, root: string, startedAt: number): Promise<Outcome> {
  // A missing tool fails the gate unstarted, naming the tool and the setup
  // command (driver-C8), rather than letting it exit 127 mid-sentence.
  const missing = (job.gate.requires ?? []).filter((t) => t !== 'node' && !onPath(t, root));
  if (missing.length > 0) {
    const said = `${job.gate.id} cannot run — it needs ${missing.map((m) => `\`${m}\``).join(', ')} on PATH. Install it, then run: ${SETUP}\n`;
    return { job, status: 1, stdout: '', stderr: said, output: said, ms: 0 };
  }
  return new Promise<Outcome>((resolve, reject) => {
    const child = spawn('bash', ['-c', job.command], { cwd: root });
    let stdout = '';
    let stderr = '';
    let output = '';
    child.stdout.on('data', (d: Buffer) => {
      stdout += d.toString();
      output += d.toString();
    });
    child.stderr.on('data', (d: Buffer) => {
      stderr += d.toString();
      output += d.toString();
    });
    child.on('error', reject);
    child.on('close', (code, signal) => {
      // A gate a signal ended — the OOM killer's SIGKILL, a timeout's
      // SIGTERM — never exited, so it never said it was clean. It fails with
      // the status a shell would report, and the replay names the signal on a
      // line of the driver's own (three spaces, so no problem matcher reads
      // it as a finding).
      if (signal !== null) {
        const said = `   ${job.gate.id} was ended by ${signal} before it exited\n`;
        stderr += said;
        output += said;
      }
      resolve({ job, status: exitStatus(code, signal), stdout, stderr, output, ms: Date.now() - startedAt });
    });
  });
}

export interface DriverIo {
  out(line: string): void;
  err(line: string): void;
}

const consoleIo: DriverIo = {
  out: (l) => process.stdout.write(`${l}\n`),
  err: (l) => process.stderr.write(`${l}\n`),
};

const seconds = (ms: number): string => `${(ms / 1000).toFixed(1)}s`;

/**
 * Run a list of jobs and report every one of them.
 *
 * Output is buffered per gate and failures replay in registry order after the
 * last one finishes (driver-C2), because gates run concurrently and
 * interleaved stderr from three of them is unreadable. The live line each gate
 * prints as it completes — with its own summary line when it passed — is what
 * stops a long run from looking hung, and is one line per gate either way.
 */
export async function runJobs(
  jobs: readonly Job[],
  root: string,
  io: DriverIo,
  opts: { jobs: number; failFast: boolean },
): Promise<number> {
  const started = Date.now();
  const width = Math.max(0, ...jobs.map((j) => j.gate.name.length));
  const done: Outcome[] = [];
  let next = 0;
  let stop = false;

  const worker = async (): Promise<void> => {
    for (;;) {
      if (stop || next >= jobs.length) return;
      const job = jobs[next] as Job;
      next += 1;
      const outcome = await exec(job, root, Date.now());
      done.push(outcome);
      const summary = outcome.status === 0 ? (lines(outcome.stdout)[0] ?? '') : '';
      io.err(
        `  ${outcome.status === 0 ? '✓' : '✗'} ${job.gate.name.padEnd(width)}  ${seconds(outcome.ms).padStart(6)}` +
          (summary === '' ? '' : `  ${summary}`),
      );
      // A passing gate's stderr holds only what is not a finding — its repair
      // lines under --fix, a warning it does not fail on — and is passed on as
      // it came, so `make fix` leaves the trail its gates wrote.
      if (outcome.status === 0) for (const l of lines(outcome.stderr)) io.err(l);
      if (outcome.status !== 0 && opts.failFast) stop = true;
    }
  };

  const width2 = Math.max(1, Math.min(opts.jobs, jobs.length));
  await Promise.all(Array.from({ length: width2 }, () => worker()));

  const order = new Map(jobs.map((j, i) => [j.gate.id, i]));
  // Every outcome in `done` carries a `job` pulled from this same `jobs`
  // array, so its gate id is always a key here — `Map.get`'s own type is the
  // only reason this would ever need a fallback.
  const failed = done
    .filter((o) => o.status !== 0)
    .sort((a, b) => (order.get(a.job.gate.id) as number) - (order.get(b.job.gate.id) as number));

  // No line the driver adds matches a finding shape (driver-C3): each opens
  // with a rule or three spaces, so the problem matcher annotates only what
  // the gates themselves said.
  for (const o of failed) {
    io.err('');
    io.err(`── ${o.job.gate.name} ${'─'.repeat(Math.max(0, 68 - o.job.gate.name.length))}`);
    io.err(o.output.replace(/\n$/, ''));
    io.err(`   repro: ${o.job.gate.command}`);
    io.err(`   fix:   ${o.job.gate.fix}`);
    io.err(`   more:  ${o.job.gate.runbook}`);
  }

  if (failed.length > 0) {
    io.err('');
    io.err(
      `✗ ${failed.length} of ${done.length} gate(s) failed: ${failed.map((o) => o.job.gate.id).join(', ')}` +
        (stop ? ' (FAILFAST=1 — the rest did not run)' : ''),
    );
    return 1;
  }
  io.out(`✓ ${done.length} gates, no findings (${seconds(Date.now() - started)})`);
  return 0;
}

// ---------------------------------------------------------------------------
// argv
// ---------------------------------------------------------------------------
const USAGE =
  'usage: run-gates [--target <name>] [--changed [file…]] [--fix] [--list]\n' +
  '       FAILFAST=1 stops at the first failure; JOBS=n sets the concurrency';

export interface Options {
  target: string;
  changed: boolean;
  fix: boolean;
  list: boolean;
  files: string[];
}

export function parse(argv: readonly string[]): Options | string {
  const o: Options = { target: DEFAULT_TARGET, changed: false, fix: false, list: false, files: [] };
  for (let i = 0; i < argv.length; i += 1) {
    const a = argv[i] as string;
    if (a === '--target') {
      const v = argv[i + 1];
      if (v === undefined) return '--target needs a value';
      o.target = v;
      i += 1;
      continue;
    }
    if (a === '--changed') {
      o.changed = true;
      continue;
    }
    if (a === '--fix') {
      o.fix = true;
      continue;
    }
    if (a === '--list') {
      o.list = true;
      continue;
    }
    if (a === '-h' || a === '--help') return USAGE;
    if (a.startsWith('-')) return `unknown argument: ${a}`;
    o.files.push(a);
    o.changed = true;
  }
  return o;
}

/** Everything a misuse exit says: the cause, then the usage. Exit 2, no gate started. */
function misuse(io: DriverIo, cause: string): number {
  io.err(`[run-gates] ${cause}`);
  io.err(USAGE);
  return 2;
}

export async function drive(argv: readonly string[], io: DriverIo = consoleIo, cwd?: string): Promise<number> {
  const parsed = parse(argv);
  if (parsed === USAGE) {
    io.out(USAGE);
    return 0;
  }
  if (typeof parsed === 'string') return misuse(io, parsed);

  const root = repoRoot(cwd);
  const src = path.join(root, SRC);
  if (!fs.existsSync(src)) return misuse(io, `missing ${SRC}`);
  let reg: Registry;
  try {
    reg = JSON.parse(fs.readFileSync(src, 'utf8')) as Registry;
  } catch {
    return misuse(io, `${SRC} is not valid JSON`);
  }
  if (!Array.isArray(reg.gates)) return misuse(io, `${SRC} holds no gates array`);

  const gates = driven(reg, parsed.target);
  if (gates.length === 0) return misuse(io, `no gate declares local_target "${parsed.target}" in ${SRC}`);

  let jobs: Job[];
  if (parsed.fix) {
    // Only the gates that can repair rather than report, and every one of them
    // regardless of what changed (driver-C6): a repair run that skipped the
    // gate holding the finding would be worse than none.
    jobs = gates.filter((g) => g.fixable).map((g) => ({ gate: g, command: `${g.local_command as string} --fix` }));
    if (jobs.length === 0) return misuse(io, `no gate in "${parsed.target}" declares fixable in ${SRC}`);
  } else if (parsed.changed) {
    const changed = parsed.files.length > 0 ? parsed.files : changedFiles(root);
    if (changed.length === 0) {
      io.out('✓ nothing changed since the merge-base with origin/main — no gate to run');
      return 0;
    }
    jobs = selectChanged(gates, changed);
    if (jobs.length === 0) {
      io.out(`✓ ${changed.length} changed file(s), no gate scans them`);
      return 0;
    }
  } else {
    jobs = gates.map((g) => ({ gate: g, command: g.local_command as string }));
  }

  if (parsed.list) {
    for (const j of jobs) io.out(j.gate.id);
    return 0;
  }

  const failFast = process.env['FAILFAST'] === '1';
  const declared = Number(process.env['JOBS'] ?? '');
  const concurrency = failFast
    ? 1
    : Number.isInteger(declared) && declared > 0
      ? declared
      : Math.max(1, Math.min(8, os.cpus().length - 1));

  io.err(
    `[${parsed.target}] ${jobs.length} gate(s)` +
      (failFast ? ', one at a time (FAILFAST=1)' : `, ${concurrency} at a time`),
  );
  return runJobs(jobs, root, io, { jobs: concurrency, failFast });
}

/**
 * Wire the driver to the process when this module is the entry point, and do
 * nothing when it is only imported — its own suite imports it.
 */
export function main(moduleUrl: string): void {
  const entry = process.argv[1];
  if (entry === undefined || pathToFileURL(entry).href !== moduleUrl) return;
  drive(process.argv.slice(2)).then(
    (code) => {
      process.exitCode = code;
    },
    (err: unknown) => {
      // What drive awaits — git, fs, child_process — rejects with an Error.
      process.stderr.write(`[run-gates] ${(err as Error).message}\n`);
      process.exitCode = 2;
    },
  );
}

main(import.meta.url);
