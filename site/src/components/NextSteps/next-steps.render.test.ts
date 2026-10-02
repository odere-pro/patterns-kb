// @vitest-environment node
/**
 * The bar at the foot of a page, rendered: previous and next from Starlight's
 * pagination with a hub named by its area, up to the page's own hub, and
 * nothing at all on the home page. The `node` docblock is required for every
 * render test: see the long note in ../SectionHub/section-hub.render.test.ts.
 */

import { describe, expect, it } from 'vitest';

import { renderComponent } from '../../lib/render-fixture';

import NextSteps from './NextSteps.astro';

const DOCS = 'site/src/content/docs';

type Link = { href: string; label: string };

const render = (filePath: string, area: string, prev?: Link, next?: Link): Promise<string> =>
  renderComponent(NextSteps, {
    locals: {
      starlightRoute: { entry: { filePath, data: { area } }, pagination: { prev, next } },
    } as unknown as App.Locals,
  });

describe('NextSteps', () => {
  it('links the page before, the hub above and the page after, naming a hub by its area', async () => {
    const html = await render(
      `${DOCS}/patterns/distributed/resilience/circuit-breaker.md`,
      'distributed-resilience',
      { href: '/patterns/distributed/routing.html', label: 'Overview' },
      { href: '/patterns/distributed/resilience/retry-backoff.html', label: 'Retry with Backoff' },
    );
    expect(html).toContain('data-kb-skip');
    expect(html).toMatch(
      /href="\/patterns\/distributed\/routing\.html" rel="prev">[\s\S]*?Routing/,
    );
    expect(html).not.toContain('Overview');
    expect(html).toMatch(
      /kb-pager-up" href="\/patterns\/distributed\/resilience\.html"[\s\S]*?Resilience/,
    );
    expect(html).toMatch(
      /href="\/patterns\/distributed\/resilience\/retry-backoff\.html" rel="next">[\s\S]*?Retry with Backoff/,
    );
  });

  it('shows a hub once: a page before that is the hub above is left to up', async () => {
    const html = await render(
      `${DOCS}/patterns/distributed/resilience/circuit-breaker.md`,
      'distributed-resilience',
      { href: '/patterns/distributed/resilience.html', label: 'Overview' },
      { href: '/patterns/distributed/resilience/retry-backoff.html', label: 'Retry with Backoff' },
    );
    expect(html).not.toContain('rel="prev"');
    expect(html.match(/href="\/patterns\/distributed\/resilience\.html"/g)).toHaveLength(1);
  });

  it('drops a hub neighbour of another kind: the designs hub links its own first page and no hazard', async () => {
    const html = await render(
      `${DOCS}/designs/index.mdx`,
      'designs',
      { href: '/hazards/noisy-neighbour.html', label: 'Noisy Neighbour' },
      { href: '/designs/foundational.html', label: 'Foundational' },
    );
    expect(html).not.toContain('rel="prev"');
    expect(html).not.toContain('Noisy Neighbour');
    expect(html).toContain('href="/designs/foundational.html" rel="next"');
  });

  it('keeps each column in place when a page has nothing before or after it', async () => {
    const html = await render(`${DOCS}/hazards/god-object.md`, 'hazards');
    expect(html).not.toContain('rel="prev"');
    expect(html).not.toContain('rel="next"');
    expect(html).toContain('kb-pager-up" href="/hazards.html"');
    expect((html.match(/<span><\/span>/g) ?? []).length).toBe(2);
  });

  it('renders nothing on the home page, or for a path that is no page', async () => {
    const next = { href: '/patterns.html', label: 'Overview' };
    expect((await render(`${DOCS}/index.mdx`, 'patterns', undefined, next)).trim()).toBe('');
    expect((await render('somewhere/else.mdx', 'patterns')).trim()).toBe('');
  });

  it('says which area the next page stays in, and plain Next when the walk crosses into another', async () => {
    const same = await render(
      `${DOCS}/patterns/distributed/resilience/circuit-breaker.md`,
      'distributed-resilience',
      undefined,
      { href: '/patterns/distributed/resilience/retry-backoff.html', label: 'Retry with Backoff' },
    );
    expect(same).toContain('Next in Resilience →');
    const across = await render(
      `${DOCS}/patterns/distributed/resilience/circuit-breaker.md`,
      'distributed-resilience',
      undefined,
      { href: '/hazards/god-object.html', label: 'God Object' },
    );
    expect(across).toMatch(/kb-pager-dir">\s*Next\s*→/);
    expect(across).not.toContain('Next in');
  });

  it('gives the marks page an up to Home and nothing before or after, and the not-found page no bar', async () => {
    const marks = await render(
      `${DOCS}/marks.md`,
      'patterns',
      { href: '/patterns.html', label: 'Overview' },
      { href: '/patterns/gof.html', label: 'Overview' },
    );
    expect(marks).toMatch(/kb-pager-up" href="\/index\.html"[\s\S]*?Home/);
    expect(marks).not.toContain('rel="prev"');
    expect(marks).not.toContain('rel="next"');
    expect((await render(`${DOCS}/404.mdx`, 'patterns')).trim()).toBe('');
  });
});
