// @vitest-environment node
/**
 * The link's markup: its href is the page's route with `.md` for `.html`,
 * a plain anchor with no script hook, and its tooltip names the file under
 * docs/ it opens. The `node` docblock is the one every render test needs (see
 * ../SectionHub/section-hub.render.test.ts).
 */
import { describe, expect, it } from 'vitest';

import { renderComponent } from '../../lib/render-fixture';

import ViewSource from './ViewSource.astro';

const render = (props: Record<string, unknown>): Promise<string> =>
  renderComponent(ViewSource, { props });

describe('ViewSource', () => {
  it('links the route with .md for .html, names the source file, and says View source', async () => {
    const html = await render({
      route: '/patterns/distributed/resilience/circuit-breaker.html',
      source: 'docs/patterns/circuit-breaker.md',
    });
    expect(html).toContain(
      '<a class="kb-view-source" href="/patterns/distributed/resilience/circuit-breaker.md"',
    );
    expect(html).toContain('title="Markdown source: docs/patterns/circuit-breaker.md"');
    expect(html).toContain('<span>View source</span>');
    expect(html).not.toContain('data-kb');
    expect(html).not.toContain('<script');
  });

  it('falls back to the markdown route in the tooltip when no source is known, and swaps only the trailing .html', async () => {
    const html = await render({ route: '/a.html/b.html', source: null });
    expect(html).toContain('href="/a.html/b.md"');
    expect(html).toContain('title="Markdown source: /a.html/b.md"');
  });
});
