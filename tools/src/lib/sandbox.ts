/**
 * A throwaway checkout per test, and the only thing in `tools/` that exists
 * purely for tests (spec: kb.gates.testing, sandbox).
 *
 * A gate resolves its repo root by asking git and then reads real paths under
 * it, so the only honest way to test one is to build a throwaway checkout and
 * run it there. Nothing in a test may write the real working tree.
 */

import { spawnSync } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { exitStatus } from './exec.js';
import { runGate, type GateIo, type GateSpec } from './gate.js';

/** The real repo, for borrowing trees a gate reads but the test is not about. */
export const REPO_ROOT = path.resolve(fileURLToPath(import.meta.url), '../../../..');

/**
 * Delete a tree, tolerating a directory that refills during the walk.
 *
 * Every sandbox has a `.git` in it, and git does not always fall silent when
 * its command exits: a background `gc`/`maintenance` run, or a lock file being
 * written mid-descent, can put a new entry into a directory between the read
 * and the `rmdir`, which surfaces as `ENOTEMPTY`. Node retries exactly that
 * class of error when asked, with a linear backoff — so ask. Without it, a
 * suite that passes on a rerun fails in CI for a reason no diff explains.
 */
export function rmTree(target: string): void {
  fs.rmSync(target, { recursive: true, force: true, maxRetries: 10, retryDelay: 50 });
}

export interface Captured {
  readonly status: number;
  readonly out: string;
  readonly err: string;
  /** stdout and stderr merged, in the order a person would have seen them. */
  readonly output: string;
}

export class Sandbox {
  /** The project directory: a git repo, realpath-resolved so it matches git. */
  readonly dir: string;

  constructor(dir: string) {
    this.dir = dir;
  }

  write(rel: string, content: string): string {
    const p = path.join(this.dir, rel);
    fs.mkdirSync(path.dirname(p), { recursive: true });
    fs.writeFileSync(p, content);
    return p;
  }

  read(rel: string): string {
    return fs.readFileSync(path.join(this.dir, rel), 'utf8');
  }

  exists(rel: string): boolean {
    return fs.existsSync(path.join(this.dir, rel));
  }

  mkdir(rel: string): void {
    fs.mkdirSync(path.join(this.dir, rel), { recursive: true });
  }

  rm(rel: string): void {
    rmTree(path.join(this.dir, rel));
  }

  /**
   * Borrow a real repo tree by symlink — read-only by convention. A gate test
   * supplies fixture content for what it is testing and borrows the real thing
   * for everything else: `node_modules`, so a spawned `tsx`, `tsc` or `vitest`
   * resolves. Nothing a test runs may install or delete through the link.
   */
  linkRepo(...names: readonly string[]): void {
    for (const n of names) {
      const target = path.join(this.dir, n);
      fs.mkdirSync(path.dirname(target), { recursive: true });
      rmTree(target);
      fs.symlinkSync(path.join(REPO_ROOT, n), target);
    }
  }

  /** Copy a real repo tree, for when the test needs to mutate it. */
  copyRepo(...names: readonly string[]): void {
    for (const n of names) this.copyRepoAs(n, n);
  }

  /** Copy a real repo tree in under a different name. */
  copyRepoAs(from: string, to: string): void {
    const target = path.join(this.dir, to);
    fs.mkdirSync(path.dirname(target), { recursive: true });
    fs.cpSync(path.join(REPO_ROOT, from), target, { recursive: true });
  }

  git(...args: readonly string[]): { status: number; stdout: string; stderr: string } {
    const r = spawnSync('git', [...args], { cwd: this.dir, encoding: 'utf8' });
    return { status: exitStatus(r.status, r.signal), stdout: r.stdout ?? '', stderr: r.stderr ?? '' };
  }

  /** Stage and commit everything, for a gate that reads history. */
  commit(message: string): void {
    this.git('add', '-A');
    this.git('commit', '-q', '-m', message);
  }

  /**
   * Every file under the sandbox but `.git`, with its bytes — for "nothing
   * was written" assertions. Symlinked trees are recorded as links, never
   * walked: what they point at is the real repository, not this sandbox.
   */
  snapshot(): Map<string, string> {
    const out = new Map<string, string>();
    const walk = (rel: string): void => {
      for (const e of fs.readdirSync(path.join(this.dir, rel), { withFileTypes: true })) {
        const child = rel === '' ? e.name : `${rel}/${e.name}`;
        if (child === '.git') continue;
        if (e.isSymbolicLink()) out.set(child, `-> ${fs.readlinkSync(path.join(this.dir, child))}`);
        else if (e.isDirectory()) walk(child);
        else out.set(child, fs.readFileSync(path.join(this.dir, child), 'utf8'));
      }
    };
    walk('');
    return out;
  }

  /** Run a gate against this sandbox and capture everything it said. */
  async run(spec: GateSpec, argv: readonly string[] = []): Promise<Captured> {
    return capture(spec, argv, this.dir);
  }

  cleanup(): void {
    if (process.env['KB_TEST_KEEP'] === '1') {
      process.stderr.write(`[sandbox] kept: ${this.dir}\n`);
      return;
    }
    rmTree(path.dirname(this.dir));
  }
}

/**
 * A private project directory with a git repo in it, at its real path
 * (testing-C2): on macOS `mkdtemp` hands back /var/… and git reports
 * /private/var/…, and a gate comparing the two would find them different.
 */
export function makeSandbox(): Sandbox {
  const root = fs.realpathSync(fs.mkdtempSync(path.join(os.tmpdir(), 'kb-tools-')));
  const dir = path.join(root, 'project');
  fs.mkdirSync(dir);
  const sb = new Sandbox(dir);
  sb.git('init', '-q', '-b', 'main', '.');
  sb.git('config', 'user.email', 'tests@kb.invalid');
  sb.git('config', 'user.name', 'kb tests');
  sb.git('config', 'commit.gpgsign', 'false');
  // No background housekeeping: a commit of many files starts a detached `gc`
  // that packs and deletes loose-object directories after the command has
  // returned, and a test copying the sandbox whole then walks a directory
  // that vanishes under it and aborts the worker.
  sb.git('config', 'gc.auto', '0');
  sb.git('config', 'maintenance.auto', 'false');
  return sb;
}

/**
 * Assert what a gate did, with what it said in the failure message
 * (testing-C6).
 *
 * `expect(r.status).toBe(0)` reports a failure as "expected 1 to be +0" and
 * throws away the one thing that would explain it — the gate's own
 * `[name] FAIL <file>: <what>` line, which is already sitting in `output`.
 * These four put it back, so a red test names the finding instead of the
 * integer it arrived as.
 */
function statusError(r: Captured, wanted: string): Error {
  const said = r.output === '' ? '(it said nothing)' : r.output.replace(/^/gm, '    ');
  return new Error(`expected ${wanted}, got exit ${String(r.status)}:\n${said}`);
}

/** The gate found nothing: exit 0. */
export function expectPass(r: Captured): void {
  if (r.status !== 0) throw statusError(r, 'a clean run (exit 0)');
}

/**
 * The gate reported a finding: exit 1, and — when a needle is given — said
 * this about it. One call replaces the pair of assertions that a finding's
 * tests are otherwise written as.
 */
export function expectFail(r: Captured, needle?: string | RegExp): void {
  if (r.status !== 1) throw statusError(r, 'a finding (exit 1)');
  if (needle === undefined) return;
  const hit = typeof needle === 'string' ? r.output.includes(needle) : needle.test(r.output);
  if (!hit) {
    throw new Error(
      `the finding did not mention ${String(needle)}:\n${r.output.replace(/^/gm, '    ')}`,
    );
  }
}

/** Argv was wrong: exit 2, the misuse status every gate shares. */
export function expectMisuse(r: Captured): void {
  if (r.status !== 2) throw statusError(r, 'misuse (exit 2)');
}

/** Any other exit a gate is written to produce. */
export function expectStatus(r: Captured, status: number): void {
  if (r.status !== status) throw statusError(r, `exit ${String(status)}`);
}

/** Run a gate anywhere and collect stdout, stderr and the exit status. */
export async function capture(
  spec: GateSpec,
  argv: readonly string[],
  cwd: string,
): Promise<Captured> {
  const out: string[] = [];
  const err: string[] = [];
  const merged: string[] = [];
  const io: GateIo = {
    out: (l) => {
      out.push(l);
      merged.push(l);
    },
    err: (l) => {
      err.push(l);
      merged.push(l);
    },
  };
  const status = await runGate(spec, argv, io, cwd);
  return {
    status,
    out: out.join('\n'),
    err: err.join('\n'),
    output: merged.join('\n'),
  };
}
