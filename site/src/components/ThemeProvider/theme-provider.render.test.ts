// @vitest-environment node
/**
 * The pre-paint theme script: it must be in every page's head as an inline,
 * classic script, and it must read the keys src/lib/theme.ts and the toggle
 * agree on. The `node` docblock is the one every render test needs (see
 * ../SectionHub/section-hub.render.test.ts).
 */
import { describe, expect, it } from 'vitest';

import { CARRIED_THEME_KEY, THEME_KEY } from '../../lib/theme';
import { renderComponent } from '../../lib/render-fixture';

import ThemeProvider from './ThemeProvider.astro';

describe('ThemeProvider', () => {
  it('writes one inline classic script, with no template of icons', async () => {
    const html = await renderComponent(ThemeProvider);
    const scripts = html.match(/<script\b[^>]*>/g) ?? [];
    expect(scripts).toHaveLength(1);
    expect(scripts[0]).not.toContain('src=');
    expect(scripts[0]).not.toContain('type="module"');
    expect(html).not.toContain('<template');
  });

  it('sets data-theme on the root from the stored choice, the carried one, then the OS preference', async () => {
    const html = await renderComponent(ThemeProvider);
    expect(html).toContain('document.documentElement.dataset.theme');
    expect(html).toContain(`localStorage.getItem('${THEME_KEY}')`);
    expect(html).toContain(`localStorage.getItem('${CARRIED_THEME_KEY}')`);
    expect(html).toContain('(prefers-color-scheme: light)');
  });
});
