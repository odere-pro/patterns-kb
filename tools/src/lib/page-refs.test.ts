/**
 * The published pages as the learning lane reads them: structure rows with
 * their top area, one batch read of the pages' frontmatter, and the link
 * targets a block renderer needs. The real structure file is read last, and
 * its rows recounted by a plain walk.
 */

import fs from 'node:fs';
import path from 'node:path';

import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import type { GateSpec } from './gate.js';
import { pageFacts, pageRefs, STRUCTURE, structureRows, type PageRefs, type PageRow } from './page-refs.js';
import { expectFail, expectPass, makeSandbox, REPO_ROOT, type Sandbox } from './sandbox.js';

let sb: Sandbox;
beforeEach(() => {
  sb = makeSandbox();
});
afterEach(() => sb.cleanup());

const row = (slug: string, area = 'a', top = 'a'): PageRow => ({ slug, route: `/${slug}.html`, source: `docs/${slug}.md`, area, top });

describe('structureRows', () => {
  it('answers null for a file with no areas list', () => {
    expect(structureRows(null)).toBeNull();
    expect(structureRows({ areas: {} })).toBeNull();
  });

  it('reads every row in order with its area and top area, skipping what it cannot read', () => {
    const got = structureRows({
      areas: [
        { id: 'top', label: 'Top', pages: [{ slug: 'x', route: '/x.html', source: 'docs/x.md' }] },
        { id: 'mid', nestUnder: 'top', pages: [] },
        { id: 'leaf', label: 'Leaf', nestUnder: 'mid', pages: [{ slug: 'y', route: '/y.html', source: 'docs/y.md' }, { slug: 'z' }, 4] },
        { id: 'loop-a', nestUnder: 'loop-b', pages: [{ slug: 'l', route: '/l.html', source: 'docs/l.md' }] },
        { id: 'loop-b', nestUnder: 'loop-a' },
        { id: 'orphan', nestUnder: 'gone', pages: [{ slug: 'o', route: '/o.html', source: 'docs/o.md' }] },
        { label: 'no id', pages: [{ slug: 'n', route: '/n.html', source: 'docs/n.md' }] },
        'x',
      ],
    }) as NonNullable<ReturnType<typeof structureRows>>;
    expect(got.rows).toEqual([
      row('x', 'top', 'top'),
      row('y', 'leaf', 'top'),
      row('l', 'loop-a', 'loop-b'),
      row('o', 'orphan', 'gone'),
    ]);
    expect([...got.labels]).toEqual([
      ['top', 'Top'],
      ['mid', 'mid'],
      ['leaf', 'Leaf'],
      ['loop-a', 'loop-a'],
      ['loop-b', 'loop-b'],
      ['orphan', 'orphan'],
    ]);
  });
});

describe('pageFacts', () => {
  it('reads each page on disk once, and leaves a missing one out', () => {
    sb.write('docs/x.md', '---\ntitle: X\nstatus: draft\n---\n\n# X\n');
    sb.write('docs/y.md', '# Y, no frontmatter\n');
    const facts = pageFacts(sb.dir, [row('x'), row('x'), row('y'), row('gone')]);
    expect([...facts]).toEqual([
      ['docs/x.md', { title: 'X', status: 'draft' }],
      ['docs/y.md', {}],
    ]);
    expect(pageFacts(sb.dir, [])).toEqual(new Map());
  });
});

describe('pageRefs', () => {
  function refsOf(rows: readonly PageRow[], seen: (PageRefs | null)[]): GateSpec {
    return {
      name: 'refs',
      usage: 'usage: refs',
      run(ctx) {
        seen.push(pageRefs(ctx, rows, pageFacts(ctx.root, rows)));
        return '[refs] read';
      },
    };
  }

  it('titles every page from its frontmatter, by slug and by route', async () => {
    sb.write('docs/x.md', '---\ntitle: The X\n---\n');
    const seen: (PageRefs | null)[] = [];
    expectPass(await sb.run(refsOf([row('x')], seen)));
    const ref = { slug: 'x', route: '/x.html', source: 'docs/x.md', title: 'The X' };
    expect(seen[0]?.bySlug.get('x')).toEqual(ref);
    expect(seen[0]?.byRoute.get('/x.html')).toEqual(ref);
  });

  it('names a missing page and an untitled one, and answers null', async () => {
    sb.write('docs/x.md', '---\ntitle: X\n---\n');
    sb.write('docs/y.md', '---\ndescription: no title\n---\n');
    const seen: (PageRefs | null)[] = [];
    const r = await sb.run(refsOf([row('x'), row('y'), row('gone')], seen));
    expectFail(r);
    expect(r.err.split('\n')).toEqual([
      '[refs] FAIL docs/y.md: declares no title — a generated block links a page by its title',
      `[refs] FAIL docs/gone.md: is missing — ${STRUCTURE} publishes it at /gone.html`,
    ]);
    expect(seen).toEqual([null]);
  });
});

describe('pageRefs, rows the site writes itself', () => {
  it('leaves a generated or site row out: no page under docs/, no finding', async () => {
    sb.write('docs/x.md', '---\ntitle: X\n---\n');
    const seen: (PageRefs | null)[] = [];
    const rows: PageRow[] = [row('x'), { ...row('graph'), source: 'generated' }, { ...row('home'), source: 'site' }];
    const spec: GateSpec = { name: 'refs', usage: 'usage: refs', run: (ctx) => (seen.push(pageRefs(ctx, rows, pageFacts(ctx.root, rows))), '[refs] read') };
    expectPass(await sb.run(spec));
    expect([...(seen[0]?.bySlug.keys() ?? [])]).toEqual(['x']);
  });
});

describe('the real tree', () => {
  it('reads every row the structure file lists, each under a top area with a label', () => {
    const structure = JSON.parse(fs.readFileSync(path.join(REPO_ROOT, STRUCTURE), 'utf8')) as { areas: { pages: unknown[] }[] };
    const count = structure.areas.reduce((n, a) => n + a.pages.length, 0);
    const got = structureRows(structure) as NonNullable<ReturnType<typeof structureRows>>;
    expect(got.rows).toHaveLength(count);
    for (const r of got.rows) expect(got.labels.has(r.top), r.slug).toBe(true);
    expect(new Set(got.rows.map((r) => r.top)).size).toBeLessThan(count);
  });
});
