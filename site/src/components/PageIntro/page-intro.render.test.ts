// @vitest-environment node
/**
 * The intro line every page opens with, rendered from a route's frontmatter.
 *
 * It is injected by a layout override, so no page carries markup for it and no
 * page can be read to check it: the only way to see what a reader gets is to
 * render the component. The `node` docblock is required for every render test —
 * see the long note in ../SectionHub/section-hub.render.test.ts.
 */

import { describe, expect, it } from 'vitest';

import { renderComponent } from '../../lib/render-fixture';

import PageIntro from './PageIntro.astro';

/**
 * The one thing this component reads. `starlightRoute` is much larger in a real
 * render; a fixture carrying only what is read is also a statement of what is
 * read, and it fails loudly the day the component reaches for something else.
 */
const locals = (description: string, body?: string): App.Locals =>
  ({
    starlightRoute: { entry: { data: { description }, body } },
  }) as unknown as App.Locals;

const render = (description: string, body?: string): Promise<string> =>
  renderComponent(PageIntro, { locals: locals(description, body) });

describe('PageIntro', () => {
  it('renders the purpose line from frontmatter', async () => {
    const html = await render('How to add an artifact.');
    expect(html).toContain('How to add an artifact.');
    expect(html).toContain('class="kb-page-intro"');
  });

  it('leaves the purpose line out when the lead opens with it, so the page says it once', async () => {
    const body = '<!-- stamp -->\n\nHow to add an artifact — step by step.\n\n## Steps\n';
    const html = await render('How to add an artifact.', body);
    expect(html).not.toContain('kb-page-intro');
    expect(await render('How to add an artifact.', 'Something else first.\n')).toContain(
      'kb-page-intro-purpose',
    );
  });

  it('escapes a description rather than letting frontmatter reach the markup', async () => {
    // Frontmatter is authored in this repo. A component that interpolated it
    // as markup stops being safe the first time a description comes from
    // somewhere else.
    const html = await render('Angle < bracket & <b>bold</b>.');
    expect(html).not.toContain('<b>bold</b>');
    expect(html).toContain('&lt;b&gt;bold&lt;/b&gt;');
  });
});
