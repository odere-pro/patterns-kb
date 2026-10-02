/**
 * Subprocesses, and the scan set git defines.
 *
 * Plain `node:child_process` on purpose — a gate spawns `git` and `bash` a
 * handful of times and then exits, which is not worth a dependency.
 *
 * The frontmatter door, a subprocess over scripts/fm-json.sh, is
 * `./frontmatter.ts`; it spawns the parser through `run` here.
 */

import { spawnSync } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

export interface RunResult {
  readonly status: number;
  readonly stdout: string;
  readonly stderr: string;
}

/**
 * Run a command and hand back what it said. Never throws on a non-zero exit.
 *
 * `input` is written to the command's stdin. A hook reads its event payload
 * from there and answers nothing without one, so a caller that builds a
 * payload and forgets to pass it measures the hook's empty-stdin path.
 *
 * `timeoutMs` kills the command once it has run that long, and the call then
 * throws an error whose `code` is `ETIMEDOUT`: a command that never returned
 * said nothing a caller could read as its answer.
 */
export function run(
  cmd: string,
  args: readonly string[],
  cwd: string,
  env?: Readonly<Record<string, string>>,
  input?: string,
  timeoutMs?: number,
): RunResult {
  const r = spawnSync(cmd, [...args], {
    cwd,
    encoding: 'utf8',
    ...(env ? { env: { ...process.env, ...env } } : {}),
    ...(input === undefined ? {} : { input }),
    ...(timeoutMs === undefined ? {} : { timeout: timeoutMs }),
    // A gate that reads a large tree's output would otherwise be truncated at
    // the default 1 MiB, silently — which reads exactly like "no findings".
    maxBuffer: 256 * 1024 * 1024,
  });
  // EPIPE is not a spawn failure. `input` is written to the child's stdin; a
  // command that answers without reading it — a legitimate hook — can exit
  // before that write drains, and the write then fails EPIPE. The child ran,
  // said what it had to say and chose its exit status; the only thing that
  // broke is a pipe nobody was reading.
  //
  // Narrow on purpose: only when we wrote to stdin, and only EPIPE. ENOENT
  // still throws, because a command that is not on PATH really did not run.
  const failedPipe =
    r.error !== undefined &&
    input !== undefined &&
    (r.error as NodeJS.ErrnoException).code === 'EPIPE';
  if (r.error && !failedPipe) throw r.error;
  // `stdout`/`stderr` are typed `string` once `encoding` is set: a spawn
  // failure throws above, and a signalled or EPIPE-shortened child still
  // hands back real, if empty, strings.
  return { status: exitStatus(r.status, r.signal), stdout: r.stdout, stderr: r.stderr };
}

/**
 * The status a shell would report for a child: its exit code, or 128 plus
 * the signal's number when a signal ended it (143 for SIGTERM, 137 for
 * SIGKILL). Node hands back `null` for the code in the signal case, and
 * reading that as 0 would turn an out-of-memory kill into a pass for every
 * caller that checks `status !== 0`.
 */
export function exitStatus(code: number | null, signal: NodeJS.Signals | null): number {
  if (code !== null) return code;
  const n = signal === null ? undefined : os.constants.signals[signal];
  return n === undefined ? 1 : 128 + n;
}

/** Split command output into lines, dropping every empty one. */
export function lines(s: string): string[] {
  return s.split('\n').filter((l) => l !== '');
}

/**
 * A file's lines the way awk counts records: a trailing newline terminates the
 * last line, it does not begin an empty one. `split('\n')` disagrees, and the
 * difference is one spurious blank line at the end of every generated file.
 */
export function records(s: string): string[] {
  if (s === '') return [];
  return (s.endsWith('\n') ? s.slice(0, -1) : s).split('\n');
}

/**
 * Every file git can see that is not ignored: committed, plus one just written
 * and not yet staged. Deriving the scan set is the point — a hand-written list
 * stays green on the day someone adds a surface, which is the one moment a
 * gate exists for.
 */
export function gitFiles(root: string, patterns: readonly string[]): string[] {
  // -z: newline-separated output C-quotes a path containing non-ASCII, `"` or
  // `\`, and the quoted literal is not a file on disk. NUL separation is raw.
  const r = run(
    'git',
    ['ls-files', '-z', '--cached', '--others', '--exclude-standard', '--', ...patterns],
    root,
  );
  if (r.status !== 0) throw new Error(`git ls-files failed: ${r.stderr.trim()}`);
  // `--others` can list the same path twice when it is both tracked and
  // present; dedupe so a finding is not reported twice.
  return [...new Set(r.stdout.split('\0').filter((l) => l !== ''))].sort();
}

/**
 * Every file git tracks (committed, or staged to be) that is still on disk.
 * For a rule about committed files rather than every file in sight: a draft
 * nobody has added is not the tree's yet, and a file deleted from disk but
 * not yet from the index is not there to read.
 */
export function trackedFiles(root: string, patterns: readonly string[]): string[] {
  const r = run('git', ['ls-files', '-z', '--cached', '--', ...patterns], root);
  if (r.status !== 0) throw new Error(`git ls-files failed: ${r.stderr.trim()}`);
  // A path with a merge conflict is listed once per stage; dedupe.
  return [...new Set(r.stdout.split('\0').filter((l) => l !== ''))]
    .filter((f) => fs.existsSync(path.join(root, f)))
    .sort();
}
