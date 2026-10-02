/**
 * The collecting driver.
 *
 * What this suite defends is the reason the driver exists: `make validate`
 * reports EVERY finding in one run. The barrier to that is not the happy path
 * but the edits later made to this file, each of which could reintroduce a
 * first-failure exit. So the cases pin behaviour: three failing gates give
 * three findings and one exit; FAILFAST is the only way back to the old
 * behaviour; and a narrowed run never silently drops a gate it could not
 * narrow.
 */

import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

import { fileURLToPath } from 'node:url';

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import type { Gate, Registry } from './gen/gen-gates.js';
import { run } from './lib/exec.js';
import { makeSandbox, REPO_ROOT, type Sandbox } from './lib/sandbox.js';
import {
  changedFiles,
  drive,
  driven,
  main,
  parse,
  selectChanged,
  shellQuote,
  targetOf,
  type DriverIo,
} from './run-gates.js';

describe('shellQuote', () => {
  it('survives a path with a space and a path with an apostrophe', () => {
    expect(shellQuote('a b.md')).toBe("'a b.md'");
    expect(shellQuote("it's.md")).toBe("'it'\\''s.md'");
    expect(run('bash', ['-c', `printf %s ${shellQuote("it's.md")}`], process.cwd()).stdout).toBe("it's.md");
  });
});

// ---------------------------------------------------------------------------
// Selection
// ---------------------------------------------------------------------------
const gate = (over: Partial<Gate>): Gate => ({
  id: 'g',
  name: 'G',
  protects: '',
  command: 'make gate G=g',
  positional: false,
  fixable: false,
  runs: ['local'],
  requires: [],
  fix: '',
  runbook: 'docs/reference/triage.md#g',
  ...over,
});

const registry = (gates: Gate[]): Registry => ({
  version: 1,
  updated: '2026-09-23',
  note: 'fixture',
  runs_values: { local: { meaning: 'make' } },
  setup_steps: {},
  required_contexts: { exclude: {} },
  gates,
  symptoms: [],
});

describe('driven', () => {
  it('takes only the gates that declare a command, for the target asked for', () => {
    const reg = registry([
      gate({ id: 'a', local_command: 'true' }),
      gate({ id: 'b', local_command: 'true', local_target: 'preflight' }),
      gate({ id: 'c' }),
    ]);
    expect(driven(reg, 'validate').map((g) => g.id)).toEqual(['a']);
    expect(driven(reg, 'preflight').map((g) => g.id)).toEqual(['b']);
  });

  it('defaults an unstated target to validate', () => {
    expect(targetOf(gate({}))).toBe('validate');
    expect(targetOf(gate({ local_target: 'preflight' }))).toBe('preflight');
  });
});

describe('selectChanged', () => {
  const gates = [
    gate({ id: 'docs', local_command: 'echo docs', scans: ['docs/**/*.md'], positional: true }),
    gate({ id: 'json', local_command: 'echo json', scans: ['**/*.json'] }),
    gate({ id: 'always', local_command: 'echo always' }),
  ];

  it('runs a gate only when a changed file matches its scans', () => {
    expect(selectChanged(gates, ['docs/authoring.md']).map((j) => j.gate.id)).toEqual(['docs', 'always']);
  });

  it('hands the matching paths to a positional gate, and only those', () => {
    const docs = selectChanged(gates, ['docs/a.md', 'docs/b.md', 'x.json']).find((j) => j.gate.id === 'docs');
    expect(docs?.command).toBe("echo docs 'docs/a.md' 'docs/b.md'");
  });

  it('does not hand paths to a gate that did not say it takes them', () => {
    expect(selectChanged(gates, ['x.json']).find((j) => j.gate.id === 'json')?.command).toBe('echo json');
  });

  it('always runs a gate with no scans, unnarrowed — a missing field over-runs, never skips', () => {
    const jobs = selectChanged(gates, ['unrelated.txt']);
    expect(jobs.map((j) => [j.gate.id, j.command])).toEqual([['always', 'echo always']]);
  });
});

describe('parse', () => {
  it('reads the flags', () => {
    expect(parse(['--changed'])).toMatchObject({ changed: true });
    expect(parse(['--fix'])).toMatchObject({ fix: true });
    expect(parse(['--list'])).toMatchObject({ list: true });
    expect(parse(['--target', 'preflight'])).toMatchObject({ target: 'preflight' });
  });

  it('treats a bare path as a changed file', () => {
    expect(parse(['a.md'])).toMatchObject({ changed: true, files: ['a.md'] });
  });

  it('is misuse on an unknown argument or a --target with no value', () => {
    expect(parse(['--nope'])).toBe('unknown argument: --nope');
    expect(parse(['--target'])).toBe('--target needs a value');
  });
});

// ---------------------------------------------------------------------------
// The run
// ---------------------------------------------------------------------------
let sb: Sandbox;
beforeEach(() => {
  sb = makeSandbox();
});
afterEach(() => sb.cleanup());

const capture = async (argv: readonly string[]): Promise<{ status: number; out: string; err: string }> => {
  const out: string[] = [];
  const err: string[] = [];
  const io: DriverIo = { out: (l) => out.push(l), err: (l) => err.push(l) };
  const status = await drive(argv, io, sb.dir);
  return { status, out: out.join('\n'), err: err.join('\n') };
};

const writeRegistry = (gates: Gate[]): void => {
  sb.write('docs/data/gates.json', JSON.stringify(registry(gates), null, 2));
};

/** Run with the environment a test needs, and put it back whatever happens. */
async function withEnv<T>(env: Record<string, string>, fn: () => Promise<T>): Promise<T> {
  const before = Object.fromEntries(Object.keys(env).map((k) => [k, process.env[k]]));
  Object.assign(process.env, env);
  try {
    return await fn();
  } finally {
    for (const [k, v] of Object.entries(before)) {
      if (v === undefined) delete process.env[k];
      else process.env[k] = v;
    }
  }
}

describe('drive', () => {
  it('runs every gate, one line per gate with its summary, and one summary line on stdout', async () => {
    writeRegistry([
      gate({ id: 'a', name: 'A', local_command: 'echo "[a] all good"' }),
      gate({ id: 'b', name: 'B', local_command: 'echo "[b] fine too"' }),
    ]);
    const r = await capture([]);
    expect(r.status).toBe(0);
    expect(r.out).toMatch(/^✓ 2 gates, no findings \(\d+\.\ds\)$/);
    expect(r.err).toMatch(/✓ A +\d+\.\ds {2}\[a\] all good/);
    expect(r.err).toMatch(/✓ B +\d+\.\ds {2}\[b\] fine too/);
  });

  it('reports THREE findings from three failing gates, and exits once', async () => {
    writeRegistry([
      gate({ id: 'one', name: 'One', local_command: 'echo one-broke >&2; exit 1' }),
      gate({ id: 'two', name: 'Two', local_command: 'echo two-broke >&2; exit 1' }),
      gate({ id: 'three', name: 'Three', local_command: 'echo three-broke >&2; exit 1' }),
    ]);
    const r = await capture([]);
    expect(r.status).toBe(1);
    for (const s of ['one-broke', 'two-broke', 'three-broke']) expect(r.err).toContain(s);
    expect(r.err).toContain('3 of 3 gate(s) failed: one, two, three');
  });

  it('counts a gate that exited 2 as failed', async () => {
    writeRegistry([gate({ id: 'misused', name: 'Misused', local_command: 'echo "usage: x" >&2; exit 2' })]);
    const r = await capture([]);
    expect(r.status).toBe(1);
    expect(r.err).toContain('1 of 1 gate(s) failed: misused');
  });

  it('carries the repro, the fix and the runbook into the failure block', async () => {
    writeRegistry([
      gate({
        id: 'a',
        name: 'A',
        command: 'make gate G=check-a',
        fix: 'Delete the thing.',
        runbook: 'docs/reference/triage.md#a',
        local_command: 'exit 1',
      }),
    ]);
    const r = await capture([]);
    expect(r.err).toContain('   repro: make gate G=check-a');
    expect(r.err).toContain('   fix:   Delete the thing.');
    expect(r.err).toContain('   more:  docs/reference/triage.md#a');
  });

  it('stops at the first failure under FAILFAST=1 and says the rest did not run', async () => {
    writeRegistry([
      gate({ id: 'a', name: 'A', local_command: 'exit 1' }),
      gate({ id: 'b', name: 'B', local_command: 'exit 1' }),
      gate({ id: 'c', name: 'C', local_command: 'touch c-ran; exit 1' }),
    ]);
    const r = await withEnv({ FAILFAST: '1' }, () => capture([]));
    expect(r.status).toBe(1);
    expect(r.err).toContain('one at a time (FAILFAST=1)');
    expect(r.err).toContain('1 of 1 gate(s) failed: a (FAILFAST=1 — the rest did not run)');
    expect(sb.exists('c-ran')).toBe(false);
  });

  it('names the tool a gate needs and the setup command, instead of letting it exit 127', async () => {
    writeRegistry([
      gate({
        id: 'a',
        name: 'A',
        local_command: 'touch it-ran',
        requires: ['node', 'definitely-not-a-real-binary'],
      }),
    ]);
    const r = await capture([]);
    expect(r.status).toBe(1);
    expect(r.err).toContain('a cannot run — it needs `definitely-not-a-real-binary` on PATH. Install it, then run: make install');
    expect(sb.exists('it-ran')).toBe(false);
  });

  it('treats a gate with no requires field as needing nothing, same as an empty list', async () => {
    const g = gate({ id: 'a', local_command: 'true' });
    delete (g as Partial<Gate>).requires;
    writeRegistry([g]);
    expect((await capture([])).status).toBe(0);
  });

  it('asks PATH for a tool once, not once per gate that needs it', async () => {
    // A stand-in `bash` first on PATH logs every `command -v` it is handed,
    // then runs the real one. The tool name is this test's own: the answers
    // are kept for the life of the module, so a name another test asked
    // about would be looked up zero times here.
    const bin = path.join(sb.dir, 'shim');
    fs.mkdirSync(bin);
    const log = path.join(sb.dir, 'lookups.log');
    fs.writeFileSync(
      path.join(bin, 'bash'),
      `#!/bin/sh\ncase "$2" in 'command -v '*) echo "$2" >> '${log}' ;; esac\nexec /bin/bash "$@"\n`,
      { mode: 0o755 },
    );
    writeRegistry([
      gate({ id: 'a', name: 'A', local_command: 'true', requires: ['kb-lookup-once-probe'] }),
      gate({ id: 'b', name: 'B', local_command: 'true', requires: ['kb-lookup-once-probe'] }),
    ]);
    const r = await withEnv({ PATH: `${bin}${path.delimiter}${process.env['PATH'] ?? ''}` }, () => capture([]));
    expect(r.status).toBe(1);
    expect(r.err).toContain('a cannot run');
    expect(r.err).toContain('b cannot run');
    expect(fs.readFileSync(log, 'utf8').split('\n').filter((l) => l.includes('kb-lookup-once-probe'))).toHaveLength(1);
  });

  it('fails a gate a signal ended, and names the signal in the replay', async () => {
    // `close` hands back a null code when a signal, not a return, ended the
    // process. A gate the OOM killer took never said it was clean.
    writeRegistry([gate({ id: 'a', name: 'A', local_command: 'kill -TERM $$' })]);
    const r = await capture([]);
    expect(r.status).toBe(1);
    expect(r.err).toContain('\n   a was ended by SIGTERM before it exited\n');
    expect(r.err).toContain('✗ 1 of 1 gate(s) failed: a');
  });

  it('--list prints the selection and runs nothing', async () => {
    writeRegistry([gate({ id: 'a', local_command: 'touch ran' }), gate({ id: 'b', local_command: 'touch ran' })]);
    const r = await capture(['--list']);
    expect(r).toMatchObject({ status: 0, out: 'a\nb' });
    expect(sb.exists('ran')).toBe(false);
  });

  it('--target picks a different set, and is misuse when it names nothing', async () => {
    writeRegistry([
      gate({ id: 'a', local_command: 'true' }),
      gate({ id: 'b', local_command: 'true', local_target: 'preflight' }),
    ]);
    expect((await capture(['--target', 'preflight', '--list'])).out).toBe('b');
    const r = await capture(['--target', 'nope']);
    expect(r.status).toBe(2);
    expect(r.err).toContain('no gate declares local_target "nope"');
  });

  it('passes on what a passing gate said on stderr — a note, or a repair line', async () => {
    writeRegistry([gate({ id: 'a', name: 'A', local_command: 'echo "[a] FIXED x.md: added owner" >&2; echo "[a] clean"' })]);
    const r = await capture([]);
    expect(r.status).toBe(0);
    expect(r.err.split('\n')).toContain('[a] FIXED x.md: added owner');
  });

  it('--fix runs only the gates that opted in, with --fix appended', async () => {
    writeRegistry([
      gate({ id: 'plain', local_command: 'echo plain' }),
      gate({ id: 'fixer', local_command: 'echo fixer', fixable: true }),
    ]);
    expect((await capture(['--fix', '--list'])).out).toBe('fixer');
    const r = await capture(['--fix']);
    expect(r.status).toBe(0);
    expect(r.err).toContain('fixer --fix');
  });

  it('is misuse when --fix would run nothing — silence there reads as success', async () => {
    writeRegistry([gate({ id: 'plain', local_command: 'true' })]);
    expect((await capture(['--fix'])).status).toBe(2);
  });

  it('narrows to the gates that scan the named files, and passes when none does', async () => {
    writeRegistry([
      gate({ id: 'docs', local_command: 'true', scans: ['docs/**/*.md'] }),
      gate({ id: 'json', local_command: 'true', scans: ['**/*.json'] }),
    ]);
    expect((await capture(['--list', 'docs/x.md'])).out).toBe('docs');
    const r = await capture(['x.txt']);
    expect(r.status).toBe(0);
    expect(r.out).toBe('✓ 1 changed file(s), no gate scans them');
  });

  it('is misuse, starting nothing, when the registry is missing, broken or holds no gates', async () => {
    const missing = await capture([]);
    expect(missing.status).toBe(2);
    expect(missing.err).toContain('missing docs/data/gates.json');
    sb.write('docs/data/gates.json', '{oops');
    expect((await capture([])).status).toBe(2);
    sb.write('docs/data/gates.json', '{"version": 1}');
    expect((await capture([])).err).toContain('holds no gates array');
  });

  it('answers --help without touching the registry', async () => {
    const r = await capture(['--help']);
    expect(r.status).toBe(0);
    expect(r.out).toContain('usage: run-gates');
  });

  it('exits 2 on an unknown argument, starting no gate', async () => {
    writeRegistry([gate({ id: 'a', local_command: 'touch ran' })]);
    const r = await capture(['--nope']);
    expect(r.status).toBe(2);
    expect(r.out).toBe('');
    expect(r.err).toContain('unknown argument: --nope');
    expect(sb.exists('ran')).toBe(false);
  });
});

describe('changedFiles', () => {
  it('is the merge-base diff plus what git has never seen', () => {
    sb.write('base.md', 'base\n');
    sb.commit('base');
    sb.git('checkout', '-q', '-b', 'work');
    sb.write('committed.md', 'changed\n');
    sb.commit('work');
    sb.write('untracked.md', 'new\n');
    expect(changedFiles(sb.dir)).toEqual(['committed.md', 'untracked.md']);
  });

  it('never names a file the change deleted — a gate cannot read one', () => {
    sb.write('gone.md', 'x\n');
    sb.commit('base');
    sb.git('checkout', '-q', '-b', 'work');
    fs.rmSync(path.join(sb.dir, 'gone.md'));
    sb.commit('delete it');
    expect(changedFiles(sb.dir)).not.toContain('gone.md');
  });

  it('is only what git has never seen when there is no trunk to diff against', () => {
    sb.git('checkout', '-q', '-b', 'orphan');
    sb.write('new.md', 'x\n');
    expect(changedFiles(sb.dir)).toEqual(['new.md']);
  });
});

describe('JOBS and the concurrency line', () => {
  it('honours JOBS=1 and says how many are running at once', async () => {
    writeRegistry([gate({ id: 'a', name: 'A', local_command: 'true' }), gate({ id: 'b', name: 'B', local_command: 'true' })]);
    const r = await withEnv({ JOBS: '1' }, () => capture([]));
    expect(r.status).toBe(0);
    expect(r.err).toContain('1 at a time');
  });

  it('ignores a JOBS that is not a positive integer rather than running zero gates', async () => {
    writeRegistry([gate({ id: 'a', name: 'A', local_command: 'true' })]);
    const r = await withEnv({ JOBS: 'lots' }, () => capture([]));
    expect(r.status).toBe(0);
  });
});

describe('--changed with nothing to compare against', () => {
  it('passes, saying so, on a branch that changed nothing', async () => {
    writeRegistry([gate({ id: 'a', local_command: 'true', scans: ['docs/**'] })]);
    sb.commit('everything');
    const r = await capture(['--changed']);
    expect(r.status).toBe(0);
    expect(r.out).toContain('no gate to run');
  });
});

describe('oracle scenarios', () => {
  it('driver-O1: every finding in registry order, narrowing by the merge base, repair ignoring change, misuse starting nothing', async () => {
    // Rows a, b, c: a waits a second then fails with one finding, b prints one
    // line and passes, c fails at once.
    const rows = [
      gate({
        id: 'a',
        name: 'A',
        command: 'make gate G=check-a',
        fix: 'Repair a.',
        runbook: 'docs/reference/triage.md#a',
        local_command: 'sleep 1; echo "[a] FAIL docs/a.md: slow and wrong" >&2; exit 1',
      }),
      gate({ id: 'b', name: 'B', local_command: 'echo "[b] one line"' }),
      gate({
        id: 'c',
        name: 'C',
        command: 'make gate G=check-c',
        fix: 'Repair c.',
        runbook: 'docs/reference/triage.md#c',
        local_command: 'echo "[c] FAIL docs/c.md:3: fast and wrong" >&2; exit 1',
      }),
    ];
    writeRegistry(rows);
    const whole = await withEnv({ JOBS: '3' }, () => capture([]));
    expect(whole.status).toBe(1);
    expect(whole.out).toBe('');
    const err = whole.err.split('\n');
    // c finished first, but a's block comes first; b gets none.
    const aAt = err.indexOf('[a] FAIL docs/a.md: slow and wrong');
    const cAt = err.indexOf('[c] FAIL docs/c.md:3: fast and wrong');
    expect(aAt).toBeGreaterThan(-1);
    expect(cAt).toBeGreaterThan(aAt);
    expect(err.slice(aAt + 1, aAt + 4)).toEqual([
      '   repro: make gate G=check-a',
      '   fix:   Repair a.',
      '   more:  docs/reference/triage.md#a',
    ]);
    expect(err.slice(cAt + 1, cAt + 4)).toEqual([
      '   repro: make gate G=check-c',
      '   fix:   Repair c.',
      '   more:  docs/reference/triage.md#c',
    ]);
    expect(err.filter((l) => l.startsWith('── '))).toHaveLength(2);
    expect(err.at(-1)).toBe('✗ 2 of 3 gate(s) failed: a, c');
    const progress = err.filter((l) => /^ {2}[✓✗] /.test(l)).map((l) => l.trim()[2]);
    expect(progress.indexOf('C')).toBeLessThan(progress.indexOf('A'));

    // --changed on a branch whose trunk moved: one changed page and one
    // untracked, unignored file, and nothing after the merge base.
    const narrow = [
      gate({ id: 'pages', local_command: "printf '%s\\n' > pages-args.txt", scans: ['docs/**/*.md'], positional: true }),
      gate({ id: 'json', local_command: 'touch json-ran', scans: ['**/*.json'] }),
      gate({ id: 'globless', local_command: 'echo "$#" > globless-args.txt' }),
    ];
    writeRegistry(narrow);
    sb.write('.gitignore', '*-args.txt\n*-ran\nignored.md\n');
    sb.write('docs/a.md', 'a\n');
    sb.commit('base');
    sb.git('checkout', '-q', '-b', 'work');
    sb.write('docs/a.md', 'a, edited\n');
    sb.commit('edit a page');
    sb.git('checkout', '-q', 'main');
    sb.write('docs/trunk-only.md', 'the trunk moved on\n');
    sb.commit('trunk moves');
    sb.git('checkout', '-q', 'work');
    sb.write('docs/new.md', 'untracked\n');
    sb.write('docs/ignored.md', 'ignored\n');

    const changed = await capture(['--changed']);
    expect(changed.status).toBe(0);
    expect(sb.read('pages-args.txt')).toBe('docs/a.md\ndocs/new.md\n');
    expect(sb.exists('json-ran')).toBe(false);
    expect(sb.read('globless-args.txt')).toBe('0\n');

    // Nothing matching: exit 0 with a summary line.
    writeRegistry([narrow[1] as Gate]);
    const none = await capture(['--changed']);
    expect(none.status).toBe(0);
    expect(none.out.split('\n')).toHaveLength(1);

    // The repair run ignores what changed.
    writeRegistry([gate({ id: 'fixer', local_command: 'touch fixed', fixable: true, scans: ['nothing/**'] })]);
    expect((await capture(['--fix'])).status).toBe(0);
    expect(sb.exists('fixed')).toBe(true);

    // An unknown flag exits 2, starting no gate.
    sb.rm('fixed');
    expect((await capture(['--fix', '--nope'])).status).toBe(2);
    expect(sb.exists('fixed')).toBe(false);
  });
});

describe('the real registry', () => {
  it('drives every row that declares a local command, in registry order', async () => {
    // testing-C4: the rows are recounted from the registry's JSON here.
    const real = JSON.parse(fs.readFileSync(path.join(REPO_ROOT, 'docs/data/gates.json'), 'utf8')) as Registry;
    const local = real.gates.filter((g) => g.local_command !== undefined && (g.local_target ?? 'validate') === 'validate');
    sb.copyRepo('docs/data/gates.json');
    const r = await capture(['--list']);
    expect(r.status).toBe(0);
    expect(r.out.split('\n')).toEqual(local.map((g) => g.id));
    expect(local.length).toBeGreaterThan(0);
  });
});

describe('main', () => {
  // Driven in-process with argv, the exit code, stdout and stderr restored.
  const MODULE = new URL('./run-gates.ts', import.meta.url).href;

  async function asEntry(args: string[], entry = fileURLToPath(MODULE)): Promise<{ code: unknown; out: string; err: string }> {
    const argv = process.argv;
    const before = process.exitCode;
    const out: string[] = [];
    const err: string[] = [];
    const o = vi.spyOn(process.stdout, 'write').mockImplementation((s) => (out.push(String(s)), true));
    const e = vi.spyOn(process.stderr, 'write').mockImplementation((s) => (err.push(String(s)), true));
    try {
      process.argv = ['node', entry, ...args];
      process.exitCode = undefined;
      main(MODULE);
      await new Promise((r) => setTimeout(r, 200));
      return { code: process.exitCode, out: out.join(''), err: err.join('') };
    } finally {
      o.mockRestore();
      e.mockRestore();
      process.argv = argv;
      process.exitCode = before;
    }
  }

  it('drives the real registry when it is the entry point, printing through the console', async () => {
    const r = await asEntry(['--list']);
    expect(r.code).toBe(0);
    expect(r.out.split('\n')[0]).toBe('typecheck');
  });

  it('exits 2 on misuse through the console, and runs nothing when merely imported', async () => {
    const bad = await asEntry(['--nope']);
    expect(bad.code).toBe(2);
    expect(bad.err).toContain('[run-gates] unknown argument: --nope');
    const imported = await asEntry(['--nope'], '/somewhere/else.ts');
    expect(imported.code).toBeUndefined();
  });

  it('reports a rejected drive() through the console, its message when it is an Error', async () => {
    // repoRoot() throws synchronously, but drive() is async, so the throw
    // reaches main()'s own rejection handler rather than the caller directly
    // — the one path in this driver that is not a plain finding or a misuse.
    const outside = fs.mkdtempSync(path.join(os.tmpdir(), 'kb-no-git-'));
    const before = process.cwd();
    process.chdir(outside);
    try {
      const r = await asEntry([]);
      expect(r.code).toBe(2);
      expect(r.err).toContain('[run-gates] not inside a git repository');
    } finally {
      process.chdir(before);
      fs.rmSync(outside, { recursive: true, force: true });
    }
  });

});
