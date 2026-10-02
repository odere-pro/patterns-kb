// @vitest-environment node
/**
 * The trail, rendered: Home, then every hub above the page — read from the
 * page's `area` and the real structure file, never from its folders — then the
 * page itself, named and not linked. The `node` docblock is required for every
 * render test: see the long note in ../SectionHub/section-hub.render.test.ts.
 */

import { describe, expect, it } from 'vitest';

import { renderComponent } from '../../lib/render-fixture';

import Breadcrumbs from './Breadcrumbs.astro';

const render = (filePath: string, area: string, title: string): Promise<string> =>
  renderComponent(Breadcrumbs, {
    locals: {
      starlightRoute: { entry: { filePath, data: { title, area } } },
    } as unknown as App.Locals,
  });

const DOCS = 'site/src/content/docs';

describe('Breadcrumbs', () => {
  it('renders Home › every hub above the page › the page, named not linked', async () => {
    const html = await render(
      `${DOCS}/patterns/distributed/routing/sharding.md`,
      'distributed-scale',
      'Sharding',
    );
    expect(html).toContain('href="/index.html"');
    expect(html).toContain('href="/patterns.html"');
    expect(html).toContain('href="/patterns/distributed.html"');
    // The page's area is Scale, whatever folder its file sits in.
    expect(html).toContain('href="/patterns/distributed/scale.html"');
    expect(html).not.toContain('href="/patterns/distributed/routing.html"');
    expect(html).toContain('<span aria-current="page">Sharding</span>');
  });

  it('leaves a hub off its own trail', async () => {
    const html = await render(
      `${DOCS}/patterns/distributed/scale/index.mdx`,
      'distributed-scale',
      'Scale',
    );
    expect(html).not.toContain('href="/patterns/distributed/scale.html"');
    expect(html).toContain('href="/patterns/distributed.html"');
  });

  it('is chrome — the whole trail carries data-kb-skip and a Breadcrumb label, separators hidden', async () => {
    const html = await render(`${DOCS}/hazards/god-object.md`, 'hazards', 'God Object');
    expect(html).toContain('data-kb-skip');
    expect(html).toContain('aria-label="Breadcrumb"');
    expect((html.match(/kb-crumb-sep/g) ?? []).length).toBe(2);
  });

  it('renders nothing for the home page, or a path that is no page', async () => {
    expect((await render(`${DOCS}/index.mdx`, 'patterns', 'Home')).trim()).toBe('');
    expect((await render('somewhere/else.mdx', 'patterns', 'Stray')).trim()).toBe('');
  });

  it('reads Home › My marks on the marks page, whatever area its frontmatter names', async () => {
    const html = await render(`${DOCS}/marks.md`, 'patterns', 'My marks');
    expect(html).toContain('href="/index.html"');
    expect(html).not.toContain('href="/patterns.html"');
    expect(html).toContain('<span aria-current="page">My marks</span>');
    expect((html.match(/kb-crumb-sep/g) ?? []).length).toBe(1);
  });

  it('renders no trail on the not-found page', async () => {
    expect((await render(`${DOCS}/404.mdx`, 'patterns', 'Page not found')).trim()).toBe('');
  });
});
