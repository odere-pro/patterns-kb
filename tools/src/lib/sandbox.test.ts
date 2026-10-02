/**
 * The test harness, tested.
 *
 * This file's subject is excluded from the coverage report because it exists
 * only for tests, which is exactly why it is worth pinning: every gate test in
 * tools/ concludes what it concludes through this code, so a bug here does not
 * fail — it quietly weakens every assertion in the suite. Two properties
 * matter most.
 *
 * `makeSandbox` must produce a real git repo at a realpath'd location
 * (testing-C2), because a gate resolves its root by asking git: on macOS
 * `mkdtemp` hands back /var/… and git reports /private/var/…, and a gate
 * comparing the two finds them different for reasons no one would guess.
 *
 * `cleanup` must delete the sandbox and nothing else. It removes the *parent*
 * of the project dir, which is the kind of thing that is right until someone
 * refactors it.
 */

import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

import { afterEach, describe, expect, it, vi } from 'vitest';

import type { GateSpec } from './gate.js';
import {
  REPO_ROOT,
  type Captured,
  capture,
  expectFail,
  expectMisuse,
  expectPass,
  expectStatus,
  makeSandbox,
  rmTree,
  type Sandbox,
} from './sandbox.js';

const open: Sandbox[] = [];
const fresh = (): Sandbox => {
  const sb = makeSandbox();
  open.push(sb);
  return sb;
};
afterEach(() => {
  while (open.length > 0) open.pop()?.cleanup();
});

// A real file under a tree that outlives the migration: tools/ is where the
// gate framework lives from P1 on, so these never point at a retired path.
const REAL_FILE = 'tools/src/lib/gate.ts';

// ---------------------------------------------------------------------------
// The sandbox is a real repo, somewhere else
// ---------------------------------------------------------------------------
describe('makeSandbox', () => {
  it('creates a git repository on branch main', () => {
    const sb = fresh();
    expect(fs.existsSync(path.join(sb.dir, '.git'))).toBe(true);
    // symbolic-ref, not `rev-parse --abbrev-ref`: before the first commit the
    // branch is unborn and rev-parse answers the literal string "HEAD".
    expect(sb.git('symbolic-ref', '--short', 'HEAD').stdout.trim()).toBe('main');
  });

  it('does not inherit the machine’s init.defaultBranch', () => {
    // The driver's narrowed run diffs against a base ref by name; a sandbox
    // that came up on `master` would fail only on the machines configured so.
    const sb = fresh();
    sb.write('a.md', 'x');
    sb.commit('first');
    expect(sb.git('rev-parse', '--abbrev-ref', 'HEAD').stdout.trim()).toBe('main');
  });

  it('gives git an identity, so a commit does not need the machine to have one', () => {
    // Without this a commit fails on a fresh CI runner with "please tell me who
    // you are", which reads like a broken test rather than a broken setup.
    const sb = fresh();
    sb.write('a.txt', 'x');
    sb.commit('first');
    expect(sb.git('log', '--oneline').stdout).toContain('first');
  });

  it('reports a path git agrees with — the /var vs /private/var trap', () => {
    const sb = fresh();
    expect(sb.git('rev-parse', '--show-toplevel').stdout.trim()).toBe(sb.dir);
    expect(fs.realpathSync(sb.dir)).toBe(sb.dir);
  });

  it('is not the real repository, and is not inside it', () => {
    // The one safety property the whole suite rests on.
    const sb = fresh();
    expect(sb.dir).not.toBe(REPO_ROOT);
    expect(sb.dir.startsWith(REPO_ROOT + path.sep)).toBe(false);
    expect(sb.dir.startsWith(fs.realpathSync(os.tmpdir()))).toBe(true);
  });

  it('starts empty apart from .git', () => {
    expect(fs.readdirSync(fresh().dir)).toEqual(['.git']);
  });

  it('hands out a different directory every time', () => {
    expect(fresh().dir).not.toBe(fresh().dir);
  });

  it('isolates two sandboxes from each other', () => {
    const a = fresh();
    const b = fresh();
    a.write('only-in-a.md', 'x');
    expect(b.exists('only-in-a.md')).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// Files
// ---------------------------------------------------------------------------
describe('write / read / exists', () => {
  it('round-trips content', () => {
    const sb = fresh();
    sb.write('docs/page.md', '# A page\n');
    expect(sb.read('docs/page.md')).toBe('# A page\n');
  });

  it('creates the parent directories', () => {
    const sb = fresh();
    sb.write('a/b/c/deep.md', 'x');
    expect(sb.exists('a/b/c/deep.md')).toBe(true);
  });

  it('returns the absolute path it wrote', () => {
    const sb = fresh();
    expect(sb.write('a.md', 'x')).toBe(path.join(sb.dir, 'a.md'));
  });

  it('overwrites rather than appending', () => {
    const sb = fresh();
    sb.write('a.md', 'first');
    sb.write('a.md', 'second');
    expect(sb.read('a.md')).toBe('second');
  });

  it('writes bytes exactly, with no trailing newline added', () => {
    // Every generator test compares byte-for-byte; a helper with an opinion
    // about trailing newlines would make those tests lie.
    const sb = fresh();
    sb.write('a.md', 'no newline');
    expect(sb.read('a.md')).toBe('no newline');
  });

  it('says a file is absent without throwing', () => {
    expect(fresh().exists('nope.md')).toBe(false);
  });
});

describe('mkdir / rm', () => {
  it('makes a directory tree', () => {
    const sb = fresh();
    sb.mkdir('a/b/c');
    expect(fs.statSync(path.join(sb.dir, 'a/b/c')).isDirectory()).toBe(true);
  });

  it('removes a file and a whole tree alike', () => {
    const sb = fresh();
    sb.write('a/b/c.md', 'x');
    sb.rm('a/b/c.md');
    expect(sb.exists('a/b/c.md')).toBe(false);
    sb.rm('a');
    expect(sb.exists('a')).toBe(false);
  });

  it('does not throw removing something that is not there', () => {
    expect(() => fresh().rm('never-existed')).not.toThrow();
  });
});

describe('snapshot', () => {
  it('records every file and its bytes, and skips .git', () => {
    const sb = fresh();
    sb.write('a.md', 'x');
    sb.write('d/b.json', '{}');
    sb.commit('base');
    expect([...sb.snapshot().entries()]).toEqual([
      ['a.md', 'x'],
      ['d/b.json', '{}'],
    ]);
  });

  it('records a linked tree as its link, without walking the real one', () => {
    const sb = fresh();
    sb.linkRepo('tools');
    expect(sb.snapshot().get('tools')).toBe(`-> ${path.join(REPO_ROOT, 'tools')}`);
  });

  it('sees a one-byte change', () => {
    const sb = fresh();
    sb.write('a.md', 'x');
    const before = sb.snapshot();
    sb.write('a.md', 'y');
    expect(sb.snapshot()).not.toEqual(before);
  });
});

// ---------------------------------------------------------------------------
// Borrowing the real repo
// ---------------------------------------------------------------------------
describe('linkRepo', () => {
  it('exposes a real tree by symlink', () => {
    const sb = fresh();
    sb.linkRepo('tools');
    expect(fs.lstatSync(path.join(sb.dir, 'tools')).isSymbolicLink()).toBe(true);
    expect(sb.exists(REAL_FILE)).toBe(true);
  });

  it('replaces whatever was already at that path', () => {
    const sb = fresh();
    sb.write('tools/fixture.md', 'x');
    sb.linkRepo('tools');
    expect(fs.lstatSync(path.join(sb.dir, 'tools')).isSymbolicLink()).toBe(true);
    expect(sb.exists('tools/fixture.md')).toBe(false);
  });

  it('creates the parent directory for a nested link', () => {
    const sb = fresh();
    sb.linkRepo('tools/src/lib');
    expect(sb.exists(REAL_FILE)).toBe(true);
  });
});

describe('copyRepo', () => {
  it('copies a tree that the test may then mutate', () => {
    const sb = fresh();
    sb.copyRepo('tools/src/lib');
    expect(fs.lstatSync(path.join(sb.dir, 'tools/src/lib')).isSymbolicLink()).toBe(false);
    expect(sb.exists(REAL_FILE)).toBe(true);
  });

  it('leaves the real repository untouched when the copy is edited', () => {
    // The reason copyRepo exists at all. If this ever fails, a test run is
    // editing the working tree.
    const sb = fresh();
    const before = fs.readFileSync(path.join(REPO_ROOT, REAL_FILE), 'utf8');
    sb.copyRepo('tools/src/lib');
    sb.write(REAL_FILE, 'clobbered\n');
    expect(fs.readFileSync(path.join(REPO_ROOT, REAL_FILE), 'utf8')).toBe(before);
  });
});

describe('copyRepoAs', () => {
  it('copies a tree in under a different name', () => {
    const sb = fresh();
    sb.copyRepoAs('tools/src/lib', 'lib');
    expect(sb.exists('lib/gate.ts')).toBe(true);
    expect(sb.exists('tools')).toBe(false);
  });

  it('creates the parent directory of the destination', () => {
    const sb = fresh();
    sb.copyRepoAs('tools/src/lib', 'a/b/lib');
    expect(sb.exists('a/b/lib/gate.ts')).toBe(true);
  });
});

describe('REPO_ROOT', () => {
  it('points at this repository', () => {
    expect(fs.existsSync(path.join(REPO_ROOT, 'CLAUDE.md'))).toBe(true);
    expect(fs.existsSync(path.join(REPO_ROOT, 'tools/package.json'))).toBe(true);
    expect(fs.existsSync(path.join(REPO_ROOT, 'plans/harness-optimize.md'))).toBe(true);
  });

  it('is the git top level, not the tools workspace', () => {
    expect(path.basename(REPO_ROOT)).not.toBe('tools');
    expect(fs.existsSync(path.join(REPO_ROOT, '.git'))).toBe(true);
  });
});

// ---------------------------------------------------------------------------
// git
// ---------------------------------------------------------------------------
describe('git', () => {
  it('runs in the sandbox and hands back status, stdout and stderr', () => {
    const sb = fresh();
    const ok = sb.git('status', '--short');
    expect(ok.status).toBe(0);
    const bad = sb.git('rev-parse', '--verify', 'no-such-ref');
    expect(bad.status).not.toBe(0);
  });

  it('commits everything, including deletions', () => {
    const sb = fresh();
    sb.write('a.md', 'x');
    sb.commit('add');
    sb.rm('a.md');
    sb.commit('remove');
    expect(sb.git('log', '--oneline').stdout.split('\n').filter(Boolean)).toHaveLength(2);
    expect(sb.git('status', '--short').stdout.trim()).toBe('');
  });
});

// ---------------------------------------------------------------------------
// Running a gate
// ---------------------------------------------------------------------------
const spec: GateSpec = {
  name: 'demo',
  usage: 'usage: demo',
  run: (ctx) => `root=${ctx.root}`,
};

describe('run / capture', () => {
  it('runs a gate with the sandbox as its repo root', async () => {
    const sb = fresh();
    expect((await sb.run(spec)).out).toBe(`root=${sb.dir}`);
  });

  it('separates stdout from stderr, and keeps both', async () => {
    const noisy: GateSpec = {
      ...spec,
      run: (ctx) => {
        ctx.note('a note');
        ctx.fail('a.md', 'a finding');
        return 'summary';
      },
    };
    const r = await fresh().run(noisy);
    // The summary is discarded (there was a finding); both diagnostics land
    // on stderr, where notes live so stdout stays one summary line.
    expect(r.out).toBe('');
    expect(r.err).toBe('[demo] a note\n[demo] FAIL a.md: a finding');
  });

  it('merges the two streams in the order a person would have seen them', async () => {
    const interleaved: GateSpec = {
      ...spec,
      run: (ctx) => {
        ctx.note('first');
        ctx.fail('a.md', 'second');
        ctx.note('third');
        return 'summary';
      },
    };
    const r = await fresh().run(interleaved);
    expect(r.output).toBe('[demo] first\n[demo] FAIL a.md: second\n[demo] third');
  });

  it('passes argv through and returns the exit status', async () => {
    const r = await fresh().run(spec, ['--nope']);
    expectMisuse(r);
  });

  it('captures a gate anywhere, not only in a Sandbox', async () => {
    const sb = fresh();
    expectPass(await capture(spec, [], sb.dir));
  });
});

// ---------------------------------------------------------------------------
// cleanup — the one that deletes things
// ---------------------------------------------------------------------------
describe('cleanup', () => {
  it('removes the sandbox', () => {
    const sb = makeSandbox();
    sb.write('a.md', 'x');
    sb.cleanup();
    expect(fs.existsSync(sb.dir)).toBe(false);
  });

  it('removes the temp parent too, leaving nothing behind', () => {
    // cleanup() deletes dirname(dir); if that ever became dir, every run would
    // leak an empty kb-tools-XXXX directory into the temp dir forever.
    const sb = makeSandbox();
    const parent = path.dirname(sb.dir);
    sb.cleanup();
    expect(fs.existsSync(parent)).toBe(false);
  });

  it('deletes nothing outside its own temp parent', () => {
    const sb = makeSandbox();
    sb.linkRepo('tools');
    sb.cleanup();
    // Following the symlink while deleting would take the real tools/ with it.
    expect(fs.existsSync(path.join(REPO_ROOT, REAL_FILE))).toBe(true);
  });

  it('is safe to call twice', () => {
    const sb = makeSandbox();
    sb.cleanup();
    expect(() => sb.cleanup()).not.toThrow();
  });

  it('asks the filesystem to retry, so a busy .git cannot flake the run', () => {
    // git writes into .git after its command has exited, the rmdir lands
    // mid-write, and a green suite fails with ENOTEMPTY — reproducible only by
    // luck, and gone on a rerun.
    const sb = makeSandbox();
    sb.write('a.md', 'x');
    sb.commit('base');
    const spy = vi.spyOn(fs, 'rmSync');
    try {
      sb.cleanup();
      const opts = spy.mock.calls.at(-1)?.[1];
      expect(opts).toMatchObject({ recursive: true, force: true });
      expect(opts?.maxRetries ?? 0).toBeGreaterThan(0);
    } finally {
      spy.mockRestore();
    }
    expect(fs.existsSync(path.dirname(sb.dir))).toBe(false);
  });

  it('keeps the sandbox when KB_TEST_KEEP=1, and says where it is', () => {
    const sb = makeSandbox();
    const before = process.env['KB_TEST_KEEP'];
    process.env['KB_TEST_KEEP'] = '1';
    try {
      sb.cleanup();
      expect(fs.existsSync(sb.dir)).toBe(true);
    } finally {
      if (before === undefined) delete process.env['KB_TEST_KEEP'];
      else process.env['KB_TEST_KEEP'] = before;
      rmTree(path.dirname(sb.dir));
    }
  });

  it('rmTree forgives a path that is already gone', () => {
    expect(() => rmTree(path.join(os.tmpdir(), 'kb-tools-never-existed'))).not.toThrow();
  });
});

describe('the gate assertions', () => {
  // What they are for: `expect(r.status).toBe(0)` reports "expected 1 to be
  // +0" and throws away the gate's own finding, which is the only line that
  // says what went wrong. These put it back (testing-C6).
  const captured = (status: number, output: string): Captured => ({
    status,
    out: output,
    err: '',
    output,
  });

  it('says nothing when the gate did what was wanted', () => {
    expect(() => expectPass(captured(0, ''))).not.toThrow();
    expect(() => expectFail(captured(1, '[widget] FAIL a.md: bent'))).not.toThrow();
    expect(() => expectMisuse(captured(2, 'usage: …'))).not.toThrow();
    expect(() => expectStatus(captured(7, ''), 7)).not.toThrow();
  });

  it('quotes what the gate said when the status is wrong', () => {
    expect(() => expectPass(captured(1, '[widget] FAIL a.md: bent'))).toThrow(
      /exit 1[\s\S]*\[widget\] FAIL a\.md: bent/,
    );
    expect(() => expectFail(captured(0, ''))).toThrow(/a finding \(exit 1\)/);
    expect(() => expectMisuse(captured(0, ''))).toThrow(/misuse \(exit 2\)/);
    expect(() => expectStatus(captured(1, ''), 3)).toThrow(/exit 3/);
  });

  it('says so plainly when the gate said nothing at all', () => {
    expect(() => expectPass(captured(2, ''))).toThrow(/it said nothing/);
  });

  it('holds a finding to what it mentions, by string or by pattern', () => {
    const r = captured(1, '[widget] FAIL a.md: bent');
    expect(() => expectFail(r, 'bent')).not.toThrow();
    expect(() => expectFail(r, /FAIL a\.md/)).not.toThrow();
    expect(() => expectFail(r, 'straight')).toThrow(/did not mention straight/);
  });
});
