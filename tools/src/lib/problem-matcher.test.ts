/**
 * The CI problem matcher and the gate contract are two halves of one promise:
 * every finding a gate can emit lands as an inline annotation on the diff.
 * They live in different files read by different machinery, so nothing else
 * would notice when a new output shape quietly stops matching. This test holds
 * the two files together (contract-C8): every emittable shape either matches
 * exactly one matcher pattern with the right captures, or is named here as
 * deliberately excluded.
 */

import { afterEach, describe, expect, it } from 'vitest';

import { matcherOwners as owners, problemMatchers, type Matcher, type MatcherPattern } from './fixtures.js';
import { runGate, type GateContext, type GateSpec } from './gate.js';
import { makeSandbox, type Sandbox } from './sandbox.js';

const matchers = problemMatchers();

function groups(owner: string, line: string): Record<string, string> {
  const m = matchers.find((x) => x.owner === owner) as Matcher;
  const p = m.pattern[0] as MatcherPattern;
  const match = new RegExp(p.regexp).exec(line) as RegExpExecArray;
  const out: Record<string, string> = {};
  for (const k of ['code', 'file', 'line', 'message'] as const) {
    const idx = p[k];
    if (idx !== undefined) out[k] = match[idx] as string;
  }
  return out;
}

const sandboxes: Sandbox[] = [];
afterEach(() => {
  for (const s of sandboxes) s.cleanup();
  sandboxes.length = 0;
});

/** Run a one-off gate body and return the stderr lines it produced. */
async function emitted(run: (ctx: GateContext) => void, name = 'demo'): Promise<string[]> {
  const s = makeSandbox();
  sandboxes.push(s);
  const err: string[] = [];
  const spec: GateSpec = {
    name,
    usage: 'usage: demo',
    run: (ctx) => {
      run(ctx);
      return '';
    },
  };
  await runGate(spec, [], { out: () => {}, err: (l) => err.push(l) }, s.dir);
  return err;
}

describe('every emittable shape is matched or deliberately excluded', () => {
  it('declares exactly the three finding shapes the contract names', () => {
    expect(matchers.map((m) => m.owner)).toEqual(['kb-rule', 'kb-gate', 'kb-gate-line']);
  });

  it('fail(file, what) matches kb-gate alone, with the right captures', async () => {
    const [line] = await emitted((ctx) => ctx.fail('docs/a.md', 'missing a title'));
    expect(owners(line as string)).toEqual(['kb-gate']);
    expect(groups('kb-gate', line as string)).toEqual({
      code: 'demo',
      file: 'docs/a.md',
      message: 'missing a title',
    });
  });

  it('reads a gate name holding a digit, which GATE_NAME allows', async () => {
    const [line] = await emitted((ctx) => ctx.fail('docs/a.md', 'missing a title'), 'site-e2e');
    expect(owners(line as string)).toEqual(['kb-gate']);
    expect(groups('kb-gate', line as string)).toMatchObject({ code: 'site-e2e', file: 'docs/a.md' });
  });

  it('fail(file, what, line) matches kb-gate-line alone, carrying the line', async () => {
    const [line] = await emitted((ctx) => ctx.fail('docs/a.md', 'missing a title', 12));
    expect(owners(line as string)).toEqual(['kb-gate-line']);
    expect(groups('kb-gate-line', line as string)).toEqual({
      code: 'demo',
      file: 'docs/a.md',
      line: '12',
      message: 'missing a title',
    });
  });

  it('failRaw in the rule-id shape matches kb-rule alone', async () => {
    const [line] = await emitted((ctx) => ctx.failRaw('PAGE-003 docs/patterns/x.md:3 too long'));
    expect(owners(line as string)).toEqual(['kb-rule']);
    expect(groups('kb-rule', line as string)).toEqual({
      code: 'PAGE-003',
      file: 'docs/patterns/x.md',
      line: '3',
      message: 'too long',
    });
  });

  it('failLine is excluded on purpose: no file token means no diff row', async () => {
    // A gate reaches for failLine only when the finding is not about one file
    // (a missing registry, a stale generated output). If this shape ever
    // matched, the annotation would land on a garbage path.
    const [line] = await emitted((ctx) => ctx.failLine('missing docs/data/gates.json'));
    expect(owners(line as string)).toEqual([]);
  });

  it('a STALE line is excluded: it names a generated output, never the source at fault', async () => {
    const [line] = await emitted((ctx) =>
      ctx.failLine('docs/reference/gates.md is STALE — run: make gates'),
    );
    expect(owners(line as string)).toEqual([]);
  });

  it('note and a repair line are excluded on purpose: neither is a finding', async () => {
    const [note] = await emitted((ctx) => ctx.note('skipping an unstamped file'));
    expect(owners(note as string)).toEqual([]);
    const [fixed] = await emitted((ctx) => ctx.fixed('docs/a.md', 'added owner'));
    expect(owners(fixed as string)).toEqual([]);
  });

  it('the two FAIL patterns never both claim one line', async () => {
    // `file` in kb-gate is [^\s:]+ — it cannot swallow the `:12` that makes a
    // line kb-gate-line's. If someone loosens that character class, both
    // patterns fire and GitHub annotates the finding twice.
    const plain = await emitted((ctx) => ctx.fail('a.md', 'x'));
    const numbered = await emitted((ctx) => ctx.fail('a.md', 'x', 3));
    expect(owners(plain[0] as string)).toHaveLength(1);
    expect(owners(numbered[0] as string)).toHaveLength(1);
  });
});
