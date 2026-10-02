/**
 * "Mentioned by", built from prose links: what counts as prose, what a
 * declared pair takes out, the order an aside lists, and one real-tree case
 * holding every list to a published page other than the page itself.
 */

import fs from 'node:fs';
import path from 'node:path';

import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import { makeSandbox, REPO_ROOT, type Sandbox } from './sandbox.js';
import {
  bodyOf,
  declaredPairs,
  loadMentions,
  mentionPages,
  mentionsIndex,
  proseTargets,
  renderedFromData,
  type MentionPage,
} from './site-mentions.js';
import type { Structure } from './site-routes.js';

describe('bodyOf', () => {
  it('drops the frontmatter block, and keeps a page with none whole', () => {
    expect(bodyOf('---\ntitle: A\n---\n\n# A\n')).toBe('\n# A\n');
    expect(bodyOf('---\r\ntitle: A\r\n---\r\nbody')).toBe('body');
    expect(bodyOf('# A\n\n---\n')).toBe('# A\n\n---\n');
  });
});

describe('proseTargets', () => {
  it('reads every inline link in prose, several to a line, in order', () => {
    expect(proseTargets('See [A](./a.md) and [B](../b.md#x).\n\n| x | [C](c.md) |\n')).toEqual(['./a.md', '../b.md#x', 'c.md']);
  });

  it('skips a generated marked block, and reads on after its end', () => {
    const body = [
      '<!-- relationships:start -->',
      '- [A](./a.md) — declared',
      '<!-- relationships:end -->',
      '',
      'Then [B](./b.md).',
    ].join('\n');
    expect(proseTargets(body)).toEqual(['./b.md']);
  });

  it("does not close a marked block on another block's end marker", () => {
    const body = ['<!-- tour:start -->', '<!-- fluency:end -->', '[A](./a.md)', '<!-- tour:end -->', '[B](./b.md)'].join('\n');
    expect(proseTargets(body)).toEqual(['./b.md']);
  });

  it("skips a theme's siblings list until the next block", () => {
    const body = [
      '## Related areas',
      '<!--meta block=siblings-->',
      '',
      '- [A](./a.md) — a sibling',
      '',
      '## After',
      '<!--meta block=decide-->',
      '[B](./b.md)',
    ].join('\n');
    expect(proseTargets(body)).toEqual(['./b.md']);
  });

  it('reads a sub-heading inside a block as that block', () => {
    const body = ['## Related areas', '<!--meta block=siblings-->', '### Nearby', '- [A](./a.md)'].join('\n');
    expect(proseTargets(body)).toEqual([]);
  });

  it('never reads code: a fence, a tilde fence, a longer closing run, a code span', () => {
    const body = [
      '```md',
      '[A](./a.md)',
      '````',
      '~~~',
      '[B](./b.md)',
      '```',
      '[still code](./c.md)',
      '~~~',
      'Write `[D](./d.md)` or ``[E](./e.md)``, or see [F](./f.md).',
    ].join('\n');
    expect(proseTargets(body)).toEqual(['./f.md']);
  });

  it('keeps a fence open past a line that only starts like its closer', () => {
    expect(proseTargets(['```', '``` not a closer', '[A](./a.md)', '```', '[B](./b.md)'].join('\n'))).toEqual(['./b.md']);
  });
});

const page = (slug: string, title: string, dir = 'patterns'): MentionPage => ({
  slug,
  route: `/${dir}/${slug}.html`,
  source: `docs/${dir}/${slug}.md`,
  title,
  kind: dir,
  kindLabel: dir,
});

describe('mentionsIndex', () => {
  const alpha = page('alpha', 'Alpha');
  const beta = page('beta', 'Beta');
  const gamma = page('gamma', 'Gamma', 'hazards');
  const zeta = page('zeta', 'Zeta');
  const bodies: Record<string, string> = {
    alpha: 'Links [Gamma](../hazards/gamma.md), [Gamma again](../hazards/gamma.md#why), [itself](./alpha.md), [Beta](./beta.md) and [a script](../../scripts/x.sh).',
    beta: 'Links [Gamma](../hazards/gamma.md) and [nothing](https://example.com) and [an anchor](#here).',
    gamma: 'Links [Alpha](../patterns/alpha.md).',
    zeta: 'Links [Gamma](../hazards/gamma.md).',
  };
  const none = (): boolean => false;

  it('inverts prose links onto the page they land on, once per linking page, sorted by title', () => {
    const index = mentionsIndex([zeta, beta, alpha, gamma], (p) => bodies[p.slug] as string, none);
    expect(index.get(gamma.route)?.map((p) => p.slug)).toEqual(['alpha', 'beta', 'zeta']);
    expect(index.get(beta.route)?.map((p) => p.slug)).toEqual(['alpha']);
    expect(index.get(alpha.route)?.map((p) => p.slug)).toEqual(['gamma']);
    expect(index.has(zeta.route)).toBe(false);
  });

  it('leaves out a pair the data files already declare, in either order', () => {
    const declared = (a: string, b: string): boolean => (a === 'gamma' && b === 'alpha') || (a === 'beta' && b === 'gamma');
    const index = mentionsIndex([alpha, beta, gamma, zeta], (p) => bodies[p.slug] as string, declared);
    expect(index.get(gamma.route)?.map((p) => p.slug)).toEqual(['alpha', 'zeta']);
    expect(index.has(alpha.route)).toBe(false);
  });

  it('keeps two pages with one title in the order they were read', () => {
    const one = page('one', 'Same');
    const two = page('two', 'Same');
    const index = mentionsIndex([one, two, gamma], (p) => (p === gamma ? '' : bodies['zeta'] as string), none);
    expect(index.get(gamma.route)?.map((p) => p.slug)).toEqual(['one', 'two']);
  });
});

describe('declaredPairs', () => {
  it('declares every relation both ways, and every tour with each stage it holds', () => {
    const declared = declaredPairs(
      [{ a: 'alpha', b: 'beta' }],
      [{ id: 'tour', stages: ['/patterns/gamma.html', '/nowhere.html'] }],
      new Map([['/patterns/gamma.html', 'gamma']]),
    );
    expect(declared('alpha', 'beta')).toBe(true);
    expect(declared('beta', 'alpha')).toBe(true);
    expect(declared('tour', 'gamma')).toBe(true);
    expect(declared('gamma', 'tour')).toBe(true);
    expect(declared('alpha', 'gamma')).toBe(false);
  });
});

describe('mentionPages', () => {
  it("lists the rows copied from docs/, each titled by its label and kinded by its top area's label", () => {
    const hub = { description: 'd', intro: 'i', tags: [] };
    const structure: Structure = {
      areas: [
        { id: 'patterns', label: 'Patterns', hub, pages: [] },
        { id: 'caching', label: 'Caching', nestUnder: 'patterns', hub, pages: [{ slug: 'alpha', label: 'Alpha', source: 'docs/patterns/caching/alpha.md' }] },
        { id: 'map', label: 'Map', generated: 'gen', hub, pages: [{ slug: 'stack', label: 'Stack', source: 'generated', route: '/map/stack.html' }] },
      ],
    };
    expect(mentionPages(structure)).toEqual([
      { slug: 'alpha', route: '/patterns/caching/alpha.html', source: 'docs/patterns/caching/alpha.md', title: 'Alpha', kind: 'patterns', kindLabel: 'Patterns' },
    ]);
  });
});

describe('loadMentions', () => {
  let sb: Sandbox;
  beforeEach(() => {
    sb = makeSandbox();
  });
  afterEach(() => sb.cleanup());

  it('reads the three data files and every page once, and answers the next call from memory', () => {
    const hub = { description: 'd', intro: 'i', tags: [] };
    const structure: Structure = {
      areas: [
        {
          id: 'patterns',
          label: 'Patterns',
          hub,
          pages: [
            { slug: 'alpha', label: 'Alpha', source: 'docs/patterns/alpha.md', route: '/patterns/alpha.html' },
            { slug: 'beta', label: 'Beta', source: 'docs/patterns/beta.md', route: '/patterns/beta.html' },
            { slug: 'tour', label: 'Tour', source: 'docs/patterns/tour.md', route: '/patterns/tour.html' },
          ],
        },
      ],
    };
    sb.write('docs/data/site-structure.json', JSON.stringify(structure));
    sb.write('docs/data/relations.json', JSON.stringify({ relations: [{ a: 'alpha', b: 'tour' }] }));
    sb.write('docs/data/learning-paths.json', JSON.stringify({ profiles: [{ id: 'tour', stages: ['/patterns/beta.html'] }] }));
    sb.write('docs/patterns/alpha.md', '---\ntitle: Alpha\n---\n\nSee [Beta](./beta.md) and [Tour](./tour.md).\n');
    sb.write('docs/patterns/beta.md', '---\ntitle: Beta\n---\n\nSee [Tour](./tour.md).\n');
    sb.write('docs/patterns/tour.md', '---\ntitle: Tour\n---\n\nSee [Alpha](./alpha.md).\n');
    const first = loadMentions(sb.dir);
    expect([...first].map(([route, from]) => [route, from.map((p) => p.slug)])).toEqual([['/patterns/beta.html', ['alpha']]]);
    sb.rm('docs');
    expect(loadMentions(sb.dir)).toBe(first);
  });

  it('declares nothing through a data file the tree does not have', () => {
    const hub = { description: 'd', intro: 'i', tags: [] };
    const structure: Structure = {
      areas: [
        {
          id: 'patterns',
          label: 'Patterns',
          hub,
          pages: [
            { slug: 'alpha', label: 'Alpha', source: 'docs/patterns/alpha.md', route: '/patterns/alpha.html' },
            { slug: 'beta', label: 'Beta', source: 'docs/patterns/beta.md', route: '/patterns/beta.html' },
          ],
        },
      ],
    };
    sb.write('docs/data/site-structure.json', JSON.stringify(structure));
    sb.write('docs/patterns/alpha.md', 'See [Beta](./beta.md).\n');
    sb.write('docs/patterns/beta.md', 'Nothing.\n');
    expect(loadMentions(sb.dir).get('/patterns/beta.html')?.map((p) => p.slug)).toEqual(['alpha']);
  });

  it('reads a page rendered whole from a data file as mentioning nothing, and a converted page as prose', () => {
    const stamp = (from: string): string => `<!-- GENERATED by tools/src/gen/gen-x.ts from ${from}. Do not edit this file. -->`;
    expect(renderedFromData(`\n${stamp('docs/data/relations.json')}\n\n# P\n`)).toBe(true);
    expect(renderedFromData(`${stamp('site/patterns/x.html')}\n# X\n`)).toBe(false);
    expect(renderedFromData('Quotes GENERATED by x from docs/data/y.json. Do not edit this file. in prose.\n')).toBe(false);
    expect(renderedFromData('# Plain\n')).toBe(false);
  });

  it('on the real tree, lists only published pages, never the page itself, each once, on over a hundred pages', () => {
    const structure = JSON.parse(fs.readFileSync(path.join(REPO_ROOT, 'docs/data/site-structure.json'), 'utf8')) as Structure;
    const routes = new Map(structure.areas.flatMap((a) => a.pages.map((p) => [p.route, p.slug] as const)));
    const index = loadMentions(REPO_ROOT);
    for (const [route, list] of index) {
      const slugs = list.map((p) => p.slug);
      expect(routes.has(route), route).toBe(true);
      expect(slugs, route).not.toContain(routes.get(route));
      expect(new Set(slugs).size, route).toBe(slugs.length);
      for (const p of list) expect([...routes.values()], route).toContain(p.slug);
    }
    expect([...index.values()].filter((l) => l.length > 0).length).toBeGreaterThan(100);
  });
});
