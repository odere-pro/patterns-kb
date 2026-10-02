/**
 * The gate contract is the thing every other gate inherits, so it is the one
 * piece of `tools/` whose bugs would be invisible: a gate that exits 0 while
 * reporting findings looks exactly like a passing build.
 */

import { fileURLToPath } from 'node:url';

import { afterEach, describe, expect, it, vi } from 'vitest';

import { GATE_NAME, isFindingPath, main, runGate, UsageError, type GateSpec } from './gate.js';
import {
  capture,
  expectFail,
  expectMisuse,
  expectPass,
  makeSandbox,
  type Sandbox,
} from './sandbox.js';

// An array, not a single slot: a test that calls sandbox() twice would
// otherwise orphan the first one, and afterEach would clean only the last.
const sandboxes: Sandbox[] = [];
afterEach(() => {
  for (const s of sandboxes) s.cleanup();
  sandboxes.length = 0;
});

function sandbox(): Sandbox {
  const s = makeSandbox();
  sandboxes.push(s);
  return s;
}

const clean: GateSpec = {
  name: 'demo',
  usage: 'usage: demo',
  run: () => 'demo OK — nothing to say',
};

describe('exit statuses', () => {
  it('exits 0 and prints exactly one summary line when clean', async () => {
    const r = await capture(clean, [], sandbox().dir);
    expectPass(r);
    expect(r.out).toBe('demo OK — nothing to say');
    expect(r.err).toBe('');
  });

  it('exits 1 on a finding, and swallows the summary', async () => {
    const spec: GateSpec = {
      ...clean,
      run: (ctx) => {
        ctx.fail('docs/a.md', 'missing a title');
        return 'demo OK — nothing to say';
      },
    };
    const r = await capture(spec, [], sandbox().dir);
    expectFail(r);
    expect(r.err).toBe('[demo] FAIL docs/a.md: missing a title');
    // The summary is written as if success were certain; the contract is what
    // stops it being printed next to a failure.
    expect(r.out).toBe('');
  });

  it('exits 2 on an unknown argument, naming it and printing the usage', async () => {
    const r = await capture(clean, ['--wat'], sandbox().dir);
    expectMisuse(r);
    expect(r.err).toContain('unknown argument: --wat');
    expect(r.err).toContain('usage: demo');
    expect(r.out).toBe('');
  });

  it('exits 2 on an option with no value', async () => {
    const spec: GateSpec = { ...clean, options: ['--out'] };
    const r = await capture(spec, ['--out'], sandbox().dir);
    expectMisuse(r);
    expect(r.err).toContain('--out needs a value');
  });

  it('passes a declared option and its value through', async () => {
    const spec: GateSpec = {
      ...clean,
      options: ['--out'],
      run: (ctx) => `out=${ctx.options.get('--out') ?? ''}`,
    };
    expect((await capture(spec, ['--out', 'x.md'], sandbox().dir)).out).toBe('out=x.md');
  });

  it('exits 2 on a UsageError thrown mid-run — misuse found after argv, no summary', async () => {
    const spec: GateSpec = {
      ...clean,
      positional: true,
      run: () => {
        throw new UsageError('no such file: typo.md');
      },
    };
    const r = await capture(spec, ['typo.md'], sandbox().dir);
    expectMisuse(r);
    expect(r.err).toBe('[demo] no such file: typo.md\nusage: demo');
    expect(r.out).toBe('');
  });

  it('lets a non-usage error propagate — a crashed gate did not pass', async () => {
    const spec: GateSpec = {
      ...clean,
      run: () => {
        throw new Error('disk on fire');
      },
    };
    await expect(runGate(spec, [], undefined, sandbox().dir)).rejects.toThrow('disk on fire');
  });

  it('exits 0 and prints usage on --help', async () => {
    for (const flag of ['-h', '--help']) {
      const r = await capture(clean, [flag], sandbox().dir);
      expectPass(r);
      expect(r.out).toBe('usage: demo');
    }
  });

  it('prints nothing at all for an empty summary, rather than a blank line', async () => {
    const r = await capture({ ...clean, run: () => '' }, [], sandbox().dir);
    expectPass(r);
    expect(r.out).toBe('');
  });
});

describe('argv is validated before the gate runs', () => {
  it('does not call run() at all when an argument is unknown', async () => {
    let ran = false;
    const spec: GateSpec = {
      ...clean,
      run: () => {
        ran = true;
        return 'ok';
      },
    };
    const r = await capture(spec, ['--nope'], sandbox().dir);
    expectMisuse(r);
    // A gate cannot write something and then discover it was misused, because
    // it never starts.
    expect(ran).toBe(false);
  });

  it('rejects an unknown argument even when a declared one precedes it', async () => {
    const spec: GateSpec = { ...clean, flags: ['--check'] };
    const r = await capture(spec, ['--check', '--nope'], sandbox().dir);
    expectMisuse(r);
  });

  it('rejects a bare argument from a gate that takes no files', async () => {
    expectMisuse(await capture(clean, ['docs/a.md'], sandbox().dir));
  });

  it('passes declared flags through', async () => {
    const spec: GateSpec = {
      ...clean,
      flags: ['--check'],
      run: (ctx) => `checked=${ctx.flags.has('--check')}`,
    };
    expect((await capture(spec, ['--check'], sandbox().dir)).out).toBe('checked=true');
    expect((await capture(spec, [], sandbox().dir)).out).toBe('checked=false');
  });
});

describe('finding shape', () => {
  it('formats a line-numbered finding as [name] FAIL <file>:<line>: <what>', async () => {
    const spec: GateSpec = {
      ...clean,
      name: 'vocab',
      run: (ctx) => {
        ctx.fail('docs/x.md', 'use "check gate" not "quality gate"', 12);
        return 'ok';
      },
    };
    const r = await capture(spec, [], sandbox().dir);
    expect(r.err).toBe('[vocab] FAIL docs/x.md:12: use "check gate" not "quality gate"');
  });

  it('formats a fileless finding as [name] FAIL: <what>', async () => {
    const spec: GateSpec = {
      ...clean,
      run: (ctx) => {
        ctx.failLine('no files to scan — the scan set is wrong');
        return 'ok';
      },
    };
    expect((await capture(spec, [], sandbox().dir)).err).toBe(
      '[demo] FAIL: no files to scan — the scan set is wrong',
    );
  });

  it('prints a rule-id finding verbatim and counts it', async () => {
    const spec: GateSpec = {
      ...clean,
      run: (ctx) => {
        ctx.failRaw('PAGE-003 docs/a.md:4 the description is 171 characters');
        return 'ok';
      },
    };
    const r = await capture(spec, [], sandbox().dir);
    expectFail(r);
    expect(r.err).toBe('PAGE-003 docs/a.md:4 the description is 171 characters');
  });

  it('lets a gate say something without failing, on stderr', async () => {
    const spec: GateSpec = {
      ...clean,
      run: (ctx) => {
        ctx.note('one file skipped — it is not stamped');
        return 'demo OK — nothing to say';
      },
    };
    const r = await capture(spec, [], sandbox().dir);
    expectPass(r);
    // stdout stays exactly one summary line; the note is a diagnostic.
    expect(r.out).toBe('demo OK — nothing to say');
    expect(r.err).toBe('[demo] one file skipped — it is not stamped');
  });

  it('counts findings so a gate can branch on them', async () => {
    const seen: number[] = [];
    const spec: GateSpec = {
      ...clean,
      run: (ctx) => {
        seen.push(ctx.findings);
        ctx.fail('a', 'one');
        seen.push(ctx.findings);
        ctx.failLine('two');
        seen.push(ctx.findings);
        return 'ok';
      },
    };
    await capture(spec, [], sandbox().dir);
    expect(seen).toEqual([0, 1, 2]);
  });
});

describe('contract-C5: the names and paths a finding may carry', () => {
  it('accepts a gate name of lower-case letters, digits and hyphens, starting with a letter', () => {
    expect(GATE_NAME.test('json-sanity')).toBe(true);
    expect(GATE_NAME.test('typecheck')).toBe(true);
    expect(GATE_NAME.test('site-e2e')).toBe(true);
    expect(GATE_NAME.test('Json')).toBe(false);
    expect(GATE_NAME.test('2fa')).toBe(false);
    expect(GATE_NAME.test('site_e2e')).toBe(false);
    expect(GATE_NAME.test('-lead')).toBe(false);
  });

  it('refuses to run a gate whose name the matcher could not read', async () => {
    await expect(runGate({ ...clean, name: 'Bad_Name' }, [], undefined, sandbox().dir)).rejects.toThrow(
      /lower-case letters, digits and hyphens/,
    );
  });

  it('accepts only a root-relative path with no space and no colon', () => {
    expect(isFindingPath('docs/data/gates.json')).toBe(true);
    expect(isFindingPath('/abs/path.md')).toBe(false);
    expect(isFindingPath('has space.md')).toBe(false);
    expect(isFindingPath('a.md:12')).toBe(false);
    expect(isFindingPath('')).toBe(false);
  });

  it('crashes rather than print a finding on a path the matcher would misread', async () => {
    const spec: GateSpec = {
      ...clean,
      run: (ctx) => {
        ctx.fail('/abs/elsewhere.md', 'x');
        return 'ok';
      },
    };
    await expect(runGate(spec, [], { out: () => {}, err: () => {} }, sandbox().dir)).rejects.toThrow(
      /root-relative/,
    );
  });
});

describe('the repo root', () => {
  it('is the sandbox, not the real working tree', async () => {
    const s = sandbox();
    const spec: GateSpec = { ...clean, run: (ctx) => ctx.root };
    expect((await capture(spec, [], s.dir)).out).toBe(s.dir);
  });

  it('is resolved before run(), so a gate outside a repository scans nothing', async () => {
    // Outside a git repo there is no root to resolve, and the failure has to
    // arrive as an error rather than as a gate that quietly scanned $HOME.
    let ran = false;
    const spec: GateSpec = {
      ...clean,
      run: () => {
        ran = true;
        return 'ok';
      },
    };
    await expect(runGate(spec, [], undefined, '/')).rejects.toThrow(/git repository/);
    expect(ran).toBe(false);
  });
});

describe('an async gate', () => {
  it('is awaited before the status is decided', async () => {
    const spec: GateSpec = {
      ...clean,
      run: async (ctx) => {
        await new Promise((r) => setTimeout(r, 5));
        ctx.fail('late.md', 'found after the await');
        return 'ok';
      },
    };
    const r = await capture(spec, [], sandbox().dir);
    expectFail(r);
  });
});

describe('--fix, and why most gates refuse it', () => {
  it('is an unknown argument unless the gate declares fixable', async () => {
    // The default, and the one worth pinning: a gate whose findings are
    // judgements about prose must not quietly accept a flag it cannot honour.
    expectMisuse(await capture(clean, ['--fix'], sandbox().dir));
  });

  it('reaches the gate as ctx.fixing when it did declare it', async () => {
    const spec: GateSpec = { ...clean, fixable: true, run: (ctx) => String(ctx.fixing) };
    expect((await capture(spec, ['--fix'], sandbox().dir)).out).toBe('true');
    expect((await capture(spec, [], sandbox().dir)).out).toBe('false');
  });

  it('reports a repair without turning it into a finding', async () => {
    const spec: GateSpec = {
      ...clean,
      fixable: true,
      run: (ctx) => {
        ctx.fixed('a.md', 'added owner');
        return `fixed ${ctx.repairs}`;
      },
    };
    const r = await capture(spec, ['--fix'], sandbox().dir);
    expectPass(r);
    expect(r.err).toContain('[demo] FIXED a.md: added owner');
    expect(r.out).toBe('fixed 1');
  });

  it('still exits 1 for what --fix could NOT repair', async () => {
    // The rule that keeps `make fix` honest: it never leaves a tree green that
    // a person still has to finish.
    const spec: GateSpec = {
      ...clean,
      fixable: true,
      run: (ctx) => {
        ctx.fixed('a.md', 'opened the section');
        ctx.fail('b.md', 'the section is empty');
        return 'ok';
      },
    };
    const r = await capture(spec, ['--fix'], sandbox().dir);
    expectFail(r);
    expect(r.out).toBe('');
    expect(r.err.split('\n')).toEqual([
      '[demo] FIXED a.md: opened the section',
      '[demo] FAIL b.md: the section is empty',
    ]);
  });
});

describe('main', () => {
  // The one place `process.argv` and `process.exitCode` are touched. Driven
  // here in-process, with both restored, and stdout and stderr captured.
  const MODULE = new URL('./a-gate-module.ts', import.meta.url).href;

  async function asEntry(spec: GateSpec, moduleUrl: string, entry: string): Promise<{ code: unknown; out: string; err: string }> {
    const argv = process.argv;
    const before = process.exitCode;
    const out: string[] = [];
    const err: string[] = [];
    const o = vi.spyOn(process.stdout, 'write').mockImplementation((s) => (out.push(String(s)), true));
    const e = vi.spyOn(process.stderr, 'write').mockImplementation((s) => (err.push(String(s)), true));
    try {
      process.argv = ['node', entry];
      process.exitCode = undefined;
      main(spec, moduleUrl);
      await new Promise((r) => setTimeout(r, 50));
      return { code: process.exitCode, out: out.join(''), err: err.join('') };
    } finally {
      o.mockRestore();
      e.mockRestore();
      process.argv = argv;
      process.exitCode = before;
    }
  }

  it('runs the gate when its module is the entry point, and sets the exit code', async () => {
    const r = await asEntry(clean, MODULE, fileURLToPath(MODULE));
    expect(r).toEqual({ code: 0, out: 'demo OK — nothing to say\n', err: '' });
  });

  it('runs nothing when the module was only imported', async () => {
    let ran = false;
    const spec: GateSpec = { ...clean, run: () => ((ran = true), 'x') };
    const r = await asEntry(spec, MODULE, '/somewhere/else.ts');
    expect(ran).toBe(false);
    expect(r.code).toBeUndefined();
  });

  it('never exits 0 when the gate crashes', async () => {
    const spec: GateSpec = {
      ...clean,
      run: () => {
        throw new Error('disk on fire');
      },
    };
    const r = await asEntry(spec, MODULE, fileURLToPath(MODULE));
    expect(r.code).toBe(2);
    expect(r.err).toBe('[demo] disk on fire\n');
  });
});
