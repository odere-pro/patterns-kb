// @vitest-environment node
/**
 * The home page's search prompt: the button carries Search's open hook and the
 * symptom it fills in, and the corpus answers that symptom with a page whose
 * own symptom line says so. The `node` docblock is the one every render test
 * needs (see ../SectionHub/section-hub.render.test.ts).
 */
import { describe, expect, it } from 'vitest';

import { searchWithRetry } from '../../../../tools/src/lib/search-score';
import { searchTree } from '../../../../tools/src/lib/search-tree';
import { renderComponent } from '../../lib/render-fixture';
import { repoRoot } from '../../lib/repo-root';

import HomeSearch from './HomeSearch.astro';

const EXAMPLE = 'one slow dependency blocks my threads';

describe('HomeSearch', () => {
  it('renders one button that opens the dialog with the example symptom', async () => {
    const html = await renderComponent(HomeSearch, {});
    expect(html).toContain('data-kb-search-open');
    expect(html).toContain(`data-kb-search-prefill="${EXAMPLE}"`);
    expect(html).toContain(`“${EXAMPLE}”`);
    expect(html).toContain('what went wrong');
    expect(html).not.toContain('data-kb-skip');
  });

  it('offers a different symptom when given one', async () => {
    const html = await renderComponent(HomeSearch, { props: { example: 'cache is stale' } });
    expect(html).toContain('data-kb-search-prefill="cache is stale"');
  });

  it('is an example the corpus answers: the first result’s own symptom line holds its words', () => {
    const pages = searchTree(repoRoot()).pages;
    const found = searchWithRetry(EXAMPLE, pages, {});
    const top = found.hits[0]?.page;
    expect(top).toBeDefined();
    expect(top?.solves.some((line) => /slow dependency/.test(line))).toBe(true);
  });
});
