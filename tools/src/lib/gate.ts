/**
 * The gate contract, as a function rather than a review rule.
 *
 * Every check gate in this repo behaves the same way, because CI, the driver,
 * `docs/reference/triage.md` and the person reading a red build all depend on
 * it (spec: kb.gates.contract):
 *
 *   exit 0   nothing wrong; exactly one summary line on stdout
 *   exit 1   real findings; each one `[name] FAIL <file>: <what>` on stderr
 *            (`<file>:<line>:` when the gate knows the line — the CI problem
 *            matcher reads both), stdout empty
 *   exit 2   misuse — an unknown argument, or one that names nothing
 *            (`UsageError`) — and nothing was written
 *
 * A gate that declares `fixable` also accepts `--fix` and repairs what it can
 * — only ever the deterministic classes, where the gate already knows the
 * exact bytes. Repairs are reported as `[name] FIXED <file>: <what>` and do
 * not change the exit status; whatever `--fix` could not repair is still a
 * finding and still exits 1. Every other gate answers `--fix` with exit 2.
 *
 * Two rules are enforced here rather than trusted to each gate: argv is parsed
 * by `runGate` BEFORE `spec.run` is called, so a gate cannot write something
 * and then discover it was misused; and the summary line is only printed when
 * the finding count is zero, so a gate cannot say "OK" and exit 1.
 */

import { spawnSync } from 'node:child_process';
import { pathToFileURL } from 'node:url';

export interface GateContext {
  /** The short tag in `[name] FAIL …` — equal to the gate's registry row id. */
  readonly name: string;
  /** Repo top level, absolute. Every path a gate reports is relative to it. */
  readonly root: string;
  /** The declared boolean flags that were actually passed. */
  readonly flags: ReadonlySet<string>;
  /** The declared value-taking options that were passed, and their values. */
  readonly options: ReadonlyMap<string, string>;
  /** Non-flag arguments, when the gate declares `positional`. */
  readonly args: readonly string[];
  /**
   * `--fix` was asked for, and this gate declared `fixable`. A gate that did
   * not declare it never sees this true — `--fix` is exit 2 there, which is
   * the honest answer for a gate whose findings are judgements about prose.
   */
  readonly fixing: boolean;
  /**
   * Record a repair this run made. A fixed thing is not a finding — the exit
   * status stays 0 — but it is not silence either: the line says what changed,
   * on stderr, so `make fix` leaves a reviewable trail beside `git diff`.
   */
  fixed(file: string, what: string): void;
  /** How many repairs so far. */
  readonly repairs: number;
  /**
   * Record a finding against a file — with a line number whenever the gate
   * knows one, so the CI problem matcher can put the annotation on the right
   * row of the diff instead of the top of the file.
   */
  fail(file: string, what: string, line?: number): void;
  /** Record a finding that is not about one file. It yields no annotation. */
  failLine(what: string): void;
  /**
   * Record a finding printed verbatim: the rule-id shape
   * `<RULE-ID> <file>:<line> <message>` a gate deciding numbered rules prints,
   * and the diff lines under a STALE finding.
   */
  failRaw(line: string): void;
  /**
   * Say something on stderr that is not a finding — a warning the gate does
   * not fail on, a file it skipped. Never changes the exit status, which is
   * why it is a separate call and not a `fail` with a softer word in it.
   */
  note(what: string): void;
  /** How many findings so far. A gate may branch on this; it must not reset it. */
  readonly findings: number;
}

/**
 * Misuse discovered after argv parsing — an argument that names a file which
 * does not exist, say. `runGate` turns it into the same exit 2 an unknown
 * argument gets, because both mean "the invocation is wrong", not "the tree
 * has a finding".
 */
export class UsageError extends Error {}

export interface GateSpec {
  /** Lower-case letters, digits and hyphens, starting with a letter; the registry row's `id`. */
  readonly name: string;
  /** Shown on `--help` and on misuse. One line, starting with `usage:`. */
  readonly usage: string;
  /** Long boolean flags this gate accepts. Anything else is exit 2. */
  readonly flags?: readonly string[];
  /** Long options that consume the next argument. A missing value is exit 2. */
  readonly options?: readonly string[];
  /** Accept non-flag arguments (a list of files, say) into `ctx.args`. */
  readonly positional?: boolean;
  /**
   * Accept `--fix` and repair what it can, instead of only reporting.
   *
   * Opt-in, and deliberately rare. A gate may declare this only when the edit
   * is DETERMINISTIC — the gate already computed the exact bytes, and there is
   * one right answer. Everything that is a judgement keeps rejecting `--fix`
   * with exit 2, because a machine picking for you there is worse than the
   * finding.
   *
   * A `--fix` run still exits 1 for whatever it could NOT repair. It never
   * exits 0 on a tree it did not actually make clean.
   */
  readonly fixable?: boolean;
  /**
   * Do the work. Return the one-line summary printed on a clean run — it is
   * discarded if anything was recorded through `fail`, so it can be written as
   * if success were certain.
   */
  run(ctx: GateContext): Promise<string> | string;
}

export interface GateIo {
  out(line: string): void;
  err(line: string): void;
}

const consoleIo: GateIo = {
  out: (line) => process.stdout.write(`${line}\n`),
  err: (line) => process.stderr.write(`${line}\n`),
};

/**
 * A gate name: lower-case letters, digits and hyphens, starting with a letter
 * (contract-C5), the shape the problem matcher's `[a-z0-9-]+` reads.
 */
export const GATE_NAME = /^[a-z][a-z0-9]*(?:-[a-z0-9]+)*$/;

/**
 * A finding's file part: root-relative, with no space and no colon
 * (contract-C5). The problem matcher's `file` group is `[^\s:]+`, so a path
 * outside this shape would be annotated on a path that does not exist.
 */
export function isFindingPath(file: string): boolean {
  return file !== '' && !file.startsWith('/') && !/[\s:]/.test(file);
}

/** Repo top level, asked of git, so a gate never guesses where it is. */
export function repoRoot(cwd?: string): string {
  const r = spawnSync('git', ['rev-parse', '--show-toplevel'], {
    cwd: cwd ?? process.cwd(),
    encoding: 'utf8',
  });
  if (r.status !== 0) throw new Error('not inside a git repository');
  return r.stdout.trim();
}

/**
 * Run one gate and return the exit status. Never throws for a finding — a
 * finding is data, not an exception — but an unexpected error propagates,
 * because a gate that crashed did not pass.
 */
export async function runGate(
  spec: GateSpec,
  argv: readonly string[],
  io: GateIo = consoleIo,
  cwd?: string,
): Promise<number> {
  if (!GATE_NAME.test(spec.name)) {
    throw new Error(`gate name "${spec.name}" is not lower-case letters, digits and hyphens starting with a letter`);
  }

  // ---- argv, before anything is read or written --------------------------
  const declaredFlags = new Set(spec.flags ?? []);
  if (spec.fixable === true) declaredFlags.add('--fix');
  const declaredOptions = new Set(spec.options ?? []);
  const flags = new Set<string>();
  const options = new Map<string, string>();
  const args: string[] = [];
  for (let i = 0; i < argv.length; i += 1) {
    const arg = argv[i] as string;
    if (arg === '-h' || arg === '--help') {
      io.out(spec.usage);
      return 0;
    }
    if (declaredOptions.has(arg)) {
      const value = argv[i + 1];
      if (value === undefined) {
        io.err(`[${spec.name}] ${arg} needs a value`);
        io.err(spec.usage);
        return 2;
      }
      options.set(arg, value);
      i += 1;
      continue;
    }
    if (declaredFlags.has(arg)) {
      flags.add(arg);
      continue;
    }
    if (spec.positional === true && !arg.startsWith('-')) {
      args.push(arg);
      continue;
    }
    io.err(`[${spec.name}] unknown argument: ${arg}`);
    io.err(spec.usage);
    return 2;
  }

  // ---- the run -----------------------------------------------------------
  let findings = 0;
  let repairs = 0;
  const shaped = (file: string): string => {
    if (!isFindingPath(file)) {
      throw new Error(`[${spec.name}] finding path "${file}" is not root-relative without spaces`);
    }
    return file;
  };
  const ctx: GateContext = {
    name: spec.name,
    root: repoRoot(cwd),
    flags,
    options,
    args,
    fixing: spec.fixable === true && flags.has('--fix'),
    fixed(file, what) {
      repairs += 1;
      io.err(`[${spec.name}] FIXED ${shaped(file)}: ${what}`);
    },
    get repairs() {
      return repairs;
    },
    fail(file, what, line) {
      findings += 1;
      io.err(`[${spec.name}] FAIL ${shaped(file)}${line === undefined ? '' : `:${line}`}: ${what}`);
    },
    failLine(what) {
      findings += 1;
      io.err(`[${spec.name}] FAIL: ${what}`);
    },
    failRaw(line) {
      findings += 1;
      io.err(line);
    },
    note(what) {
      io.err(`[${spec.name}] ${what}`);
    },
    get findings() {
      return findings;
    },
  };

  let summary: string;
  try {
    summary = await spec.run(ctx);
  } catch (e) {
    if (e instanceof UsageError) {
      io.err(`[${spec.name}] ${e.message}`);
      io.err(spec.usage);
      return 2;
    }
    throw e;
  }
  if (findings > 0) return 1;
  // An empty summary prints nothing, which stops a gate that returned '' from
  // emitting a blank line.
  if (summary !== '') io.out(summary);
  return 0;
}

/**
 * Wire a gate to the process. The single line every gate module ends with, so
 * that `process.exit` and `process.argv` appear once in this codebase.
 *
 * `moduleUrl` is always `import.meta.url`: a gate module is both an executable
 * and something its own test imports, and without the check the test suite
 * would run every gate against the real working tree on import (contract-C10).
 */
export function main(spec: GateSpec, moduleUrl: string): void {
  const entry = process.argv[1];
  if (entry === undefined || pathToFileURL(entry).href !== moduleUrl) return;
  runGate(spec, process.argv.slice(2)).then(
    (code) => {
      process.exitCode = code;
    },
    (err: unknown) => {
      // A crash, or a working directory outside any repository: never exit 0.
      process.stderr.write(`[${spec.name}] ${err instanceof Error ? err.message : String(err)}\n`);
      process.exitCode = 2;
    },
  );
}
