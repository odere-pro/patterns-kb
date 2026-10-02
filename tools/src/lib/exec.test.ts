/**
 * Subprocesses and the derived scan set.
 *
 * `records()` looks too small to test and is not: it is the awk-vs-
 * `split('\n')` disagreement that puts one spurious blank line at the end of
 * every generated file. And `gitFiles()` is where every gate's scan set comes
 * from, so a quirk in it is a quirk in every gate at once.
 */

import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import { exitStatus, gitFiles, lines, records, run, trackedFiles } from './exec.js';
import { makeSandbox, type Sandbox } from './sandbox.js';

let sb: Sandbox;
beforeEach(() => {
  sb = makeSandbox();
});
afterEach(() => sb.cleanup());

// ---------------------------------------------------------------------------
// run
// ---------------------------------------------------------------------------
describe('run', () => {
  it('hands back stdout, stderr and the status separately', () => {
    const r = run('bash', ['-c', 'echo to-out; echo to-err >&2; exit 3'], sb.dir);
    expect(r.status).toBe(3);
    expect(r.stdout).toBe('to-out\n');
    expect(r.stderr).toBe('to-err\n');
  });

  it('does not throw on a non-zero exit — a failing command is data', () => {
    // A gate exits 1 whenever it has findings, and every caller treats that as
    // a normal answer.
    expect(() => run('bash', ['-c', 'exit 1'], sb.dir)).not.toThrow();
    expect(run('bash', ['-c', 'exit 1'], sb.dir).status).toBe(1);
  });

  it('throws when the command does not exist', () => {
    // A missing binary is not a finding about the repo; it is a broken machine,
    // and it has to be loud rather than an empty stdout that reads as "clean".
    expect(() => run('kb-no-such-command', [], sb.dir)).toThrow();
  });

  it('runs in the directory it is given', () => {
    sb.mkdir('sub');
    expect(run('pwd', [], `${sb.dir}/sub`).stdout.trim()).toBe(`${sb.dir}/sub`);
  });

  it('writes `input` to stdin, and gives an empty stdin without it', () => {
    // A hook reads its event payload from stdin and answers nothing without
    // one. A caller that builds a payload and forgets to pass it measures the
    // hook's empty-stdin path.
    expect(run('cat', [], sb.dir, undefined, 'payload').stdout).toBe('payload');
    expect(run('cat', [], sb.dir).stdout).toBe('');
  });

  it('survives a child that exits without reading the stdin it was given', () => {
    // `spawnSync` writes `input` to the child's stdin, and a command that
    // answers without reading it can exit before that write drains — the write
    // then fails EPIPE. A payload big enough to outlive the child makes the
    // race deterministic rather than a once-a-week CI flake.
    const big = 'x'.repeat(2_000_000);
    const r = run('bash', ['-c', 'echo answered; exit 7'], sb.dir, undefined, big);
    expect(r.status).toBe(7);
    expect(r.stdout).toBe('answered\n');
  });

  it('reports a child a signal ended as the shell would, 128 plus the signal, never 0', () => {
    // spawnSync's own status is null when a signal, not an exit, ended the
    // child. Read as 0, an out-of-memory SIGKILL would pass every gate that
    // checks `status !== 0`.
    const r = run('bash', ['-c', 'kill -TERM $$'], sb.dir);
    expect(r.status).toBe(143);
    expect(r.stdout).toBe('');
    expect(r.stderr).toBe('');
    expect(run('bash', ['-c', 'kill -KILL $$'], sb.dir).status).toBe(137);
  });

  it('still throws on a spawn failure even when stdin was written', () => {
    // The guard above is narrow on purpose. A command that is not on PATH
    // really did not run, and an empty stdout from it reads as "clean".
    expect(() => run('kb-no-such-command', [], sb.dir, undefined, 'payload')).toThrow();
  });

  it('adds to the environment rather than replacing it', () => {
    const r = run('bash', ['-c', 'echo "$KB_EXTRA/$([ -n "$PATH" ] && echo has-path)"'], sb.dir, {
      KB_EXTRA: 'set',
    });
    expect(r.stdout.trim()).toBe('set/has-path');
  });

  it('reads output far past the default 1 MiB buffer', () => {
    // At the default maxBuffer the output is truncated silently, which looks
    // exactly like "no findings".
    const r = run('bash', ['-c', 'head -c 2000000 /dev/zero | tr "\\0" "x"'], sb.dir);
    expect(r.stdout.length).toBe(2_000_000);
  });
});

// ---------------------------------------------------------------------------
// lines / records — the one-blank-line difference
// ---------------------------------------------------------------------------
describe('exitStatus', () => {
  it('keeps an exit code, and turns a signal into 128 plus its number', () => {
    expect(exitStatus(0, null)).toBe(0);
    expect(exitStatus(3, null)).toBe(3);
    expect(exitStatus(null, 'SIGTERM')).toBe(143);
    expect(exitStatus(null, 'SIGKILL')).toBe(137);
  });

  it('fails a child that reports neither a code nor a signal Node can number', () => {
    // Node's own types allow both to be null, and a signal name outside this
    // platform's table has no number; neither is ever a pass.
    expect(exitStatus(null, null)).toBe(1);
    expect(exitStatus(null, 'SIGNOPE' as NodeJS.Signals)).toBe(1);
  });
});

describe('lines', () => {
  it('drops every empty line, not just the trailing one', () => {
    expect(lines('a\n\nb\n')).toEqual(['a', 'b']);
  });

  it('is empty for empty output', () => {
    expect(lines('')).toEqual([]);
  });
});

describe('records', () => {
  it('treats a trailing newline as a terminator, not a separator', () => {
    // This is the whole reason it exists: split('\n') would return a fourth,
    // empty element and every generated file would grow a blank last line.
    expect(records('a\nb\nc\n')).toEqual(['a', 'b', 'c']);
    expect('a\nb\nc\n'.split('\n')).toHaveLength(4);
  });

  it('keeps a last line that has no newline after it', () => {
    expect(records('a\nb')).toEqual(['a', 'b']);
  });

  it('keeps interior blank lines — only the terminator is special', () => {
    expect(records('a\n\nb\n')).toEqual(['a', '', 'b']);
  });

  it('is empty for an empty file, and one empty line for a lone newline', () => {
    expect(records('')).toEqual([]);
    expect(records('\n')).toEqual(['']);
  });
});

// ---------------------------------------------------------------------------
// gitFiles — the derived scan set
// ---------------------------------------------------------------------------
describe('gitFiles', () => {
  it('lists tracked files matching the pattern, sorted', () => {
    sb.write('docs/b.md', 'b');
    sb.write('docs/a.md', 'a');
    sb.commit('base');
    expect(gitFiles(sb.dir, ['docs/*.md'])).toEqual(['docs/a.md', 'docs/b.md']);
  });

  it('includes a file that has only just been written', () => {
    // Otherwise a gate passes locally and fails in CI, which is the worst shape
    // a gate can have.
    sb.write('docs/tracked.md', 'x');
    sb.commit('base');
    sb.write('docs/brand-new.md', 'x');
    expect(gitFiles(sb.dir, ['docs/*.md'])).toContain('docs/brand-new.md');
  });

  it('skips a gitignored file', () => {
    sb.write('.gitignore', 'docs/generated/\n');
    sb.write('docs/keep.md', 'x');
    sb.write('docs/generated/copy.md', 'x');
    sb.commit('base');
    expect(gitFiles(sb.dir, ['docs/**/*.md', 'docs/*.md'])).toEqual(['docs/keep.md']);
  });

  it('reports a file once even when two patterns claim it', () => {
    sb.write('docs/a.md', 'x');
    sb.commit('base');
    expect(gitFiles(sb.dir, ['docs/*.md', 'docs/a.md', 'docs/**/*.md'])).toEqual(['docs/a.md']);
  });

  it('is empty when nothing matches, rather than listing everything', () => {
    sb.write('README.md', 'x');
    sb.commit('base');
    expect(gitFiles(sb.dir, ['docs/*.md'])).toEqual([]);
  });

  it('returns a non-ASCII filename literally, not C-quoted', () => {
    // Newline-separated ls-files prints "docs/\303\266.md" for this; the
    // quoted literal is not a file on disk, and reading it crashes a scan.
    sb.write('docs/ö.md', 'x');
    sb.commit('base');
    expect(gitFiles(sb.dir, ['docs/*.md'])).toEqual(['docs/ö.md']);
  });

  it('throws outside a git repository', () => {
    const loose = fs.mkdtempSync(path.join(os.tmpdir(), 'kb-not-a-repo-'));
    try {
      expect(() => gitFiles(loose, ['*.md'])).toThrow(/git ls-files failed/);
    } finally {
      fs.rmSync(loose, { recursive: true, force: true });
    }
  });
});

// ---------------------------------------------------------------------------
// trackedFiles — committed or staged, and on disk
// ---------------------------------------------------------------------------
describe('trackedFiles', () => {
  it('lists committed and staged files, never an untracked draft, sorted', () => {
    sb.write('docs/b.md', 'b');
    sb.commit('base');
    sb.write('docs/a.md', 'a');
    sb.git('add', 'docs/a.md');
    sb.write('docs/draft.md', 'x');
    expect(trackedFiles(sb.dir, ['docs/*.md'])).toEqual(['docs/a.md', 'docs/b.md']);
  });

  it('drops a tracked file deleted from disk, and lists a path once', () => {
    sb.write('docs/a.md', 'a');
    sb.write('docs/gone.md', 'x');
    sb.commit('base');
    fs.rmSync(path.join(sb.dir, 'docs/gone.md'));
    expect(trackedFiles(sb.dir, ['docs/*.md', 'docs/a.md'])).toEqual(['docs/a.md']);
  });

  it('throws outside a git repository', () => {
    const loose = fs.mkdtempSync(path.join(os.tmpdir(), 'kb-not-a-repo-'));
    try {
      expect(() => trackedFiles(loose, ['*.md'])).toThrow(/git ls-files failed/);
    } finally {
      fs.rmSync(loose, { recursive: true, force: true });
    }
  });
});
