// @vitest-environment node
/**
 * The page head: what Starlight's head list passes through, and what the
 * override adds after it. The `node` docblock is the one every render test needs
 * (see ../SectionHub/section-hub.render.test.ts).
 *
 * Starlight's own head list is a fixture here, carrying the links and the meta
 * description a real route carries; the claims held are the ones a reader or a
 * crawler depends on: the description is present, the only absolute link is the
 * canonical one, and the override adds the kb tags and one bundle tag.
 */
import { describe, expect, it } from 'vitest';

import { renderComponent } from '../../lib/render-fixture';

import Head from './Head.astro';

const CANONICAL = 'https://example.test/patterns/x.html';

const locals = {
  starlightRoute: {
    head: [
      { tag: 'link', attrs: { rel: 'canonical', href: CANONICAL } },
      { tag: 'link', attrs: { rel: 'stylesheet', href: '../_astro/style.css' } },
      { tag: 'meta', attrs: { name: 'description', content: 'What the page is for.' } },
    ],
    entry: {
      data: {
        title: 'Example',
        description: 'What the page is for.',
        area: 'distributed-resilience',
        owner: 'Someone',
        tags: ['a', 'b'],
        solves: ['my thread pool is exhausted'],
      },
    },
  },
} as unknown as App.Locals;

const render = (): Promise<string> => renderComponent(Head, { locals });

/** Every `href` and `src` the head writes, with the tag it sits on. */
function links(html: string): { tag: string; rel: string | undefined; url: string }[] {
  return [...html.matchAll(/<(link|script)\b([^>]*)>/g)].flatMap(([, tag, attrs]) => {
    const url = /\b(?:href|src)="([^"]*)"/.exec(attrs)?.[1];
    const rel = /\brel="([^"]*)"/.exec(attrs)?.[1];
    return url === undefined ? [] : [{ tag: tag, rel, url }];
  });
}

describe('Head', () => {
  it('keeps the meta description the head list carries', async () => {
    const html = await render();
    expect(html).toMatch(/<meta name="description" content="What the page is for\."/);
  });

  it('writes no absolute link but the canonical one: every other is relative or root-relative', async () => {
    const html = await render();
    const absolute = links(html).filter((l) => /^[a-z][a-z0-9+.-]*:|^\/\//i.test(l.url));
    expect(absolute).toEqual([{ tag: 'link', rel: 'canonical', url: CANONICAL }]);
  });

  it('adds the kb meta tags from the frontmatter', async () => {
    const html = await render();
    expect(html).toContain('<meta name="kb:area" content="distributed-resilience"');
    expect(html).toContain('<meta name="kb:tags" content="a,b"');
    expect(html).toContain('<meta name="kb:solves" content="my thread pool is exhausted"');
  });

  it('adds one JSON-LD block that parses, and one classic bundle script', async () => {
    const html = await render();
    const blocks = [
      ...html.matchAll(/<script[^>]*type="application\/ld\+json"[^>]*>([^]*?)<\/script>/g),
    ];
    expect(blocks).toHaveLength(1);
    expect(JSON.parse(blocks[0]?.[1])).toMatchObject({
      '@type': 'TechArticle',
      headline: 'Example',
    });
    const bundle = html.match(/<script[^>]*data-kb="bundle"[^>]*>/g) ?? [];
    expect(bundle).toHaveLength(1);
    expect(bundle[0]).toContain('src="/kb.js"');
    expect(bundle[0]).toContain('defer');
    expect(bundle[0]).not.toContain('type="module"');
  });
});
