/**
 * The tour-order gate: in a theme's tour, a page comes after the pages it
 * requires. Planted trees in the sandbox for the pass, the fail and the
 * misuse, then the real tree.
 */

import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import { capture, expectFail, expectMisuse, expectPass, makeSandbox, REPO_ROOT, type Sandbox } from '../lib/sandbox.js';
import { LEARNING_PATHS } from './check-learning-paths.js';
import { RELATIONS } from './check-relations.js';
import { spec } from './check-tour-order.js';

const STRUCTURE = 'docs/data/site-structure.json';
const route = (slug: string): string => `/patterns/${slug}.html`;

let sb: Sandbox;
beforeEach(() => {
  sb = makeSandbox();
});
afterEach(() => sb.cleanup());

/** A tree whose theme `tour` stages `stages` (slugs) and whose edges are `[a, b]`: a requires b. */
function tree(stages: string[], edges: [string, string][], extra: { verb?: string } = {}): void {
  const slugs = ['tour', 'agent', 'a2a', 'acp', 'loop'];
  sb.write(
    STRUCTURE,
    JSON.stringify({
      areas: [{ id: 'patterns', label: 'Patterns', pages: slugs.map((slug) => ({ slug, route: route(slug), source: `docs/patterns/${slug}.md` })) }],
    }),
  );
  sb.write(
    RELATIONS,
    JSON.stringify({ relations: edges.map(([a, b]) => ({ a, verb: extra.verb ?? 'prerequisite', b, note_a: '', note_b: '' })) }),
  );
  sb.write(LEARNING_PATHS, JSON.stringify({ profiles: [{ id: 'tour', label: 'Tour', stages: stages.map(route) }] }, null, 2));
}

describe('tour-order', () => {
  it('passes a tour that lists each prerequisite before the page that requires it, and counts the pairs', async () => {
    tree(['agent', 'a2a', 'acp'], [['a2a', 'agent'], ['acp', 'agent']]);
    const r = await sb.run(spec);
    expectPass(r);
    expect(r.out).toBe('[tour-order] 1 tour(s): every page follows its prerequisites (2 prerequisite pair(s) inside a tour)');
  });

  it('fails a page that comes before its prerequisite, naming the theme, both pages, their positions and the stage line', async () => {
    tree(['a2a', 'loop', 'agent'], [['a2a', 'agent']]);
    const r = await sb.run(spec);
    expectFail(r);
    expect(r.out).toBe('');
    const at = sb.read(LEARNING_PATHS).split('\n').findIndex((l) => l.includes(route('a2a'))) + 1;
    expect(r.err.trim()).toBe(
      `[tour-order] FAIL ${LEARNING_PATHS}:${at}: theme 'tour': a2a (stage 1) comes before its prerequisite agent (stage 3) — move agent above a2a`,
    );
  });

  it('reports each offending pair once', async () => {
    tree(['a2a', 'acp', 'agent'], [['a2a', 'agent'], ['acp', 'agent']]);
    const r = await sb.run(spec);
    expectFail(r);
    expect(r.err.trim().split('\n')).toHaveLength(2);
  });

  it('does not judge an edge with one end outside the tour, a self edge, or another verb', async () => {
    tree(['a2a', 'loop'], [['a2a', 'agent'], ['loop', 'loop']]);
    expectPass(await sb.run(spec));
    tree(['a2a', 'agent'], [['a2a', 'agent']], { verb: 'combines-with' });
    expectPass(await sb.run(spec));
  });

  it('passes with no learning-paths file, and fails a missing relations file', async () => {
    const none = await sb.run(spec);
    expect(none.status).toBe(0);
    expect(none.out).toBe(`[tour-order] no ${LEARNING_PATHS}: no tour to order`);
    tree(['agent'], []);
    sb.rm(RELATIONS);
    expectFail(await sb.run(spec), `${RELATIONS}: is missing`);
  });

  it('names the file and the missing list when a data file has the wrong shape', async () => {
    tree(['agent'], []);
    sb.write(LEARNING_PATHS, JSON.stringify({ profiles: 'none' }));
    expectFail(await sb.run(spec), `${LEARNING_PATHS}: has no profiles list`);
    sb.write(LEARNING_PATHS, JSON.stringify([]));
    expectFail(await sb.run(spec), `${LEARNING_PATHS}: has no profiles list`);

    tree(['agent'], []);
    sb.write(RELATIONS, JSON.stringify({ relations: 'none' }));
    expectFail(await sb.run(spec), `${RELATIONS}: has no relations list`);

    tree(['agent'], []);
    sb.write(STRUCTURE, JSON.stringify({ areas: 'none' }));
    expectFail(await sb.run(spec), `${STRUCTURE}: has no areas list`);
  });

  it('skips a profile without an id or a stages list, and does not count it', async () => {
    tree(['agent'], []);
    sb.write(
      LEARNING_PATHS,
      JSON.stringify({ profiles: ['text', { label: 'No id', stages: [] }, { id: 'nostages' }, { id: 'tour', stages: [route('agent')] }] }),
    );
    const r = await sb.run(spec);
    expectPass(r);
    expect(r.out).toContain('1 tour(s)');
  });

  it('does not judge an edge whose page the structure file does not publish', async () => {
    tree(['a2a', 'agent'], [['ghost', 'agent'], ['a2a', 'phantom']]);
    const r = await sb.run(spec);
    expectPass(r);
    expect(r.out).toContain('(0 prerequisite pair(s) inside a tour)');
  });

  it('orders findings on one page by the position of the prerequisite', async () => {
    tree(['a2a', 'agent', 'acp'], [['a2a', 'acp'], ['a2a', 'agent']]);
    const r = await sb.run(spec);
    expectFail(r);
    const lines = r.err.trim().split('\n');
    expect(lines).toHaveLength(2);
    expect(lines[0]).toContain('prerequisite agent (stage 2)');
    expect(lines[1]).toContain('prerequisite acp (stage 3)');
  });

  it('exits 2 on any argument', async () => {
    tree(['agent'], []);
    expectMisuse(await sb.run(spec, ['--nope']));
  });
});

describe('the real tree', () => {
  it('lists every prerequisite before the page that requires it in every tour', async () => {
    const r = await capture(spec, [], REPO_ROOT);
    expectPass(r);
    expect(r.out).toMatch(/^\[tour-order\] \d+ tour\(s\): every page follows its prerequisites/);
  });
});
