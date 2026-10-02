// @vitest-environment node
/**
 * What the markup has to be for the module and the gates to find it.
 *
 * Three of these assertions are contracts with another file, not preferences:
 * the `kb-` class is what earns the focus ring from the floor rule in
 * primitives.css (check-site-a11y fails a kb-classed control no
 * `:focus-visible` selector reaches), `.kb-copy` is a selector in the one
 * `<noscript>` rule Head emits and fingerprinted in check-site-absence, and the
 * chip is a sibling of the button rather than its child so that hiding the
 * button does not take the command with it.
 */
import { describe, expect, it } from 'vitest';

import { renderComponent } from '../../lib/render-fixture';

import CopyButton from './CopyButton.astro';

const render = (value: string, block?: boolean): Promise<string> =>
  renderComponent(CopyButton, { props: block === undefined ? { value } : { value, block } });

describe('CopyButton', () => {
  it('shows the command as a chip and offers a button beside it', async () => {
    const html = await render('/plugin install core@kb');
    expect(html).toContain('<code class="kb-code-chip">/plugin install core@kb</code>');
    expect(html).toContain('class="kb-copy"');
  });

  it('hangs its behaviour off an attribute, on the wrapper, not off a class', async () => {
    // page-schema.md: a hook is always a `data-kb-*` attribute — a class says
    // what a thing is, and a reader cannot tell the two apart otherwise.
    // check-site-hooks fails a hook nothing reads, so this and the selector in
    // copy.client.ts are one decision in two files.
    const html = await render('/plugin install core@kb');
    expect(html).toContain('<span class="kb-copyable" data-kb-copy>');
    expect(html).not.toMatch(/<button[^>]*data-kb-copy/);
  });

  it('takes a line of its own only when asked, and keeps the hook either way', async () => {
    // The catalog puts a command above the sentence in one cell; everywhere
    // else the pair is inline. The modifier is the only difference in the
    // markup, so the `data-kb-copy` hook copy.client.ts listens for still sits
    // on the same element.
    const html = await render('/core:add skills onboard', true);
    expect(html).toContain('<span class="kb-copyable kb-copyable--block" data-kb-copy>');
    expect(await render('/core:add skills onboard')).not.toContain('kb-copyable--block');
  });

  it('keeps the command outside the button, so hiding the button keeps the words', async () => {
    // `.kb-copy` is hidden by the <noscript> rule in Head.astro. A chip nested
    // inside the button would vanish with it and a reader with no scripts would
    // be left with an empty cell.
    const html = await render('/plugin install core@kb');
    const chip = html.indexOf('kb-code-chip');
    const button = html.indexOf('<button');
    expect(chip).toBeGreaterThan(-1);
    expect(button).toBeGreaterThan(chip);
  });

  it('names the button after its own command, not just "Copy"', async () => {
    // A catalog of twenty rows is twenty buttons; all named "Copy" they are
    // indistinguishable in a screen reader's control list.
    const html = await render('/plugin install library@kb');
    expect(html).toContain('aria-label="Copy /plugin install library@kb"');
  });

  it('hides its icons from the accessibility tree and carries a live region', async () => {
    const html = await render('/plugin install core@kb');
    expect(html.match(/aria-hidden="true"/g)).toHaveLength(2);
    expect(html).toContain('role="status"');
    expect(html).toContain('kb-visually-hidden');
  });

  it('spells no behaviour into the markup', async () => {
    // Behaviour is copy.client.ts in the kb bundle; an on* attribute here is a
    // hard fail in check-site-absence.
    const html = await render('/plugin install core@kb');
    expect(html).not.toMatch(/\son[a-z]{3,}=/i);
  });
});
