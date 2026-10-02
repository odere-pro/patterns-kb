// @vitest-environment node
/**
 * The star's markup: its starting state is the page's own `favourite` answer,
 * which favourites.client.ts reads back as the default before it applies the
 * reader's overrides, so it must come from the prop and nowhere else. The
 * `node` docblock is the one every render test needs (see
 * ../SectionHub/section-hub.render.test.ts).
 */
import { describe, expect, it } from 'vitest';

import { renderComponent } from '../../lib/render-fixture';

import Favourites from './Favourites.astro';

const render = (props: Record<string, unknown>): Promise<string> =>
  renderComponent(Favourites, { props });

describe('Favourites', () => {
  it('starts pressed for an authored favourite and names the page, with its word beside the star', async () => {
    const html = await render({ slug: 'circuit-breaker', name: 'Circuit Breaker', authored: true });
    expect(html).toContain('data-kb-favourite="circuit-breaker"');
    expect(html).toContain('aria-pressed="true"');
    expect(html).toContain('aria-label="Favourite: Circuit Breaker"');
    expect(html).toContain('<span>Favourite</span>');
  });

  it('starts unpressed by default, and a compact star is the icon alone', async () => {
    const html = await render({ slug: 'x', name: 'X', compact: true });
    expect(html).toContain('aria-pressed="false"');
    expect(html).toContain('kb-favourite--compact');
    expect(html).not.toContain('<span>Favourite</span>');
  });
});
