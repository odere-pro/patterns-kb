// @vitest-environment node
/**
 * The filter bar's markup: which rails and chips a hub's entries earn, the
 * Favourites chip when the rows are pages, and no bar at all for a short
 * list. The rail rules themselves are src/lib/facets.ts's, tested there; the
 * `node` docblock is the one every render test needs (see
 * ../SectionHub/section-hub.render.test.ts).
 */
import { describe, expect, it } from 'vitest';

import { renderComponent } from '../../lib/render-fixture';

import Facets from './Facets.astro';

import type { HubGroup, HubPage } from '../../lib/site-types';

const entry = (n: number, tag: string, extra: Partial<HubPage> = {}): HubPage => ({
  href: `/p${n}.html`,
  title: `P${n}`,
  description: '',
  tags: [tag],
  ...extra,
});

const render = (groups: HubGroup[]): Promise<string> =>
  renderComponent(Facets, { props: { groups } });

describe('Facets', () => {
  it('offers a chip for a topic two entries share and not every one, and the Favourites chip for page rows', async () => {
    const html = await render([
      {
        label: '',
        pages: [
          entry(1, 'caching', { slug: 'p1' }),
          entry(2, 'caching', { slug: 'p2' }),
          entry(3, 'resilience', { slug: 'p3' }),
          entry(4, 'resilience', { slug: 'p4' }),
        ],
      },
    ]);
    expect(html).toContain('data-kb-facets');
    expect(html).toContain('<span class="kb-facet-rail-label">Topic</span>');
    expect(html).toContain('data-kb-facet="topic:caching" aria-pressed="false"');
    expect(html).toContain('data-kb-facet="topic:resilience"');
    expect(html).toContain('data-kb-facet-favourites');
    expect(html).toContain('data-kb-facet-status');
  });

  it('puts the Starred toggle on its own "Show:" row, with a tooltip naming the editors’ picks, and a Clear filters control that starts hidden', async () => {
    const html = await render([
      {
        label: '',
        pages: [
          entry(1, 'caching', { slug: 'p1' }),
          entry(2, 'caching', { slug: 'p2' }),
          entry(3, 'resilience', { slug: 'p3' }),
          entry(4, 'resilience', { slug: 'p4' }),
        ],
      },
    ]);
    expect(html).toMatch(/data-kb-facet-show>\s*<span class="kb-facet-rail-label">Show:<\/span>/);
    expect(html).toMatch(
      /data-kb-facet-favourites[^>]*title="Pages you starred, plus the editors' picks"/,
    );
    expect(html).toMatch(/data-kb-facet-favourites[\s\S]*?>\s*Starred\s*<\/button>/);
    expect(html).not.toContain('Favourites only');
    expect(html).toMatch(/<button[^>]*data-kb-facet-clear[^>]*hidden[^>]*>Clear filters<\/button>/);
  });

  it('shows no Favourites chip when no row is a page, and no bar when nothing is left to offer', async () => {
    const areas = [
      entry(1, 'caching'),
      entry(2, 'caching'),
      entry(3, 'resilience'),
      entry(4, 'resilience'),
    ];
    const html = await render([{ label: '', pages: areas }]);
    expect(html).not.toContain('data-kb-facet-favourites');
    expect(html).toContain('data-kb-facet="topic:resilience"');
    const same = [
      entry(1, 'caching'),
      entry(2, 'caching'),
      entry(3, 'caching'),
      entry(4, 'caching'),
    ];
    expect(await render([{ label: '', pages: same }])).not.toContain('data-kb-facets');
  });

  it('draws no bar for a list read at a glance, whatever it holds', async () => {
    const html = await render([
      {
        label: '',
        pages: [
          entry(1, 'caching', { slug: 'a' }),
          entry(2, 'caching', { slug: 'b' }),
          entry(3, 'resilience', { slug: 'c' }),
        ],
      },
    ]);
    expect(html).not.toContain('data-kb-facets');
  });
});
