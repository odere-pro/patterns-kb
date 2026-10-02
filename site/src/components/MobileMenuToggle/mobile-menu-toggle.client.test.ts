/**
 * The phone menu button's behaviour, ported out of Starlight's module.
 *
 * What is pinned is the contract the markup and the CSS depend on:
 * `data-kb-menu-open` on the root, `data-mobile-menu-expanded` on <body> for
 * the scroll lock, and `inert` trapping focus inside the open menu.
 */
import { describe, expect, it } from 'vitest';

import { fixture } from '../../lib/dom-fixture';
import { init } from './mobile-menu-toggle.client';

/** The override's markup in its real position: inside the sidebar nav. */
const MARKUP = `
  <a class="sl-skip-link" href="#content">skip</a>
  <nav class="sidebar">
    <div data-kb-menu-button data-kb-menu-open="false">
      <button aria-expanded="false" aria-controls="starlight__sidebar"></button>
    </div>
    <div id="starlight__sidebar"></div>
  </nav>
  <div class="main-frame"></div>
`;

function setup(markup = MARKUP) {
  const f = fixture(markup);
  // happy-dom's matchMedia lacks addEventListener's plumbing for change
  // events, so the stub records listeners and lets a test fire them — the
  // module only ever asks about the one desktop-width query.
  const listeners: (() => void)[] = [];
  Object.defineProperty(f.window, 'matchMedia', {
    configurable: true,
    value: () => ({
      matches: false,
      addEventListener: (_: string, fn: () => void) => listeners.push(fn),
    }),
  });
  const root = () => f.document.querySelector('[data-kb-menu-button]');
  const btn = () => f.document.querySelector<HTMLButtonElement>('[data-kb-menu-button] button');
  const click = (): void => {
    btn()?.dispatchEvent(
      new f.window.MouseEvent('click', { bubbles: true }) as unknown as MouseEvent,
    );
  };
  return { ...f, root, btn, click, crossDesktop: () => listeners.forEach((fn) => fn()) };
}

describe('the phone menu button', () => {
  it('expands: attribute on root and button, scroll lock on body, frame inert', () => {
    const f = setup();
    init(f.document);
    f.click();
    expect(f.root()?.getAttribute('data-kb-menu-open')).toBe('true');
    expect(f.btn()?.getAttribute('aria-expanded')).toBe('true');
    expect(f.document.body.hasAttribute('data-mobile-menu-expanded')).toBe(true);
    expect(f.document.querySelector('.main-frame')?.hasAttribute('inert')).toBe(true);
    expect(f.document.querySelector('.sl-skip-link')?.hasAttribute('inert')).toBe(true);
  });

  it('collapses again on a second press, releasing the page', () => {
    const f = setup();
    init(f.document);
    f.click();
    f.click();
    expect(f.root()?.getAttribute('data-kb-menu-open')).toBe('false');
    expect(f.document.body.hasAttribute('data-mobile-menu-expanded')).toBe(false);
    expect(f.document.querySelector('.main-frame')?.hasAttribute('inert')).toBe(false);
  });

  it('closes from Escape anywhere in the nav, returning focus to the button', () => {
    const f = setup();
    init(f.document);
    f.click();
    f.document
      .querySelector('#starlight__sidebar')
      ?.dispatchEvent(
        new f.window.KeyboardEvent('keyup', { code: 'Escape', bubbles: true }) as unknown as Event,
      );
    expect(f.root()?.getAttribute('data-kb-menu-open')).toBe('false');
    expect(f.document.activeElement).toBe(f.btn());
  });

  it('resets when the viewport crosses into desktop, where the button hides', () => {
    const f = setup();
    init(f.document);
    f.click();
    f.crossDesktop();
    expect(f.root()?.getAttribute('data-kb-menu-open')).toBe('false');
    expect(f.document.body.hasAttribute('data-mobile-menu-expanded')).toBe(false);
  });

  it('does nothing on a page without the button', () => {
    const f = setup('<p>no menu here</p>');
    expect(() => {
      init(f.document);
    }).not.toThrow();
  });

  it('skips a root with no button inside, and still wires the others', () => {
    const f = setup(`${MARKUP}<div data-kb-menu-button></div>`);
    init(f.document);
    f.click();
    expect(f.root()?.getAttribute('data-kb-menu-open')).toBe('true');
  });

  it('ignores a key that is not Escape, leaving the menu open', () => {
    const f = setup();
    init(f.document);
    f.click();
    f.document
      .querySelector('#starlight__sidebar')
      ?.dispatchEvent(
        new f.window.KeyboardEvent('keyup', { code: 'KeyA', bubbles: true }) as unknown as Event,
      );
    expect(f.root()?.getAttribute('data-kb-menu-open')).toBe('true');
  });

  it('works for a button outside any nav, and for a document with no window', () => {
    const f = setup(
      '<div data-kb-menu-button data-kb-menu-open="false"><button aria-expanded="false"></button></div><div class="main-frame"></div>',
    );
    init(f.document);
    f.click();
    expect(f.root()?.getAttribute('data-kb-menu-open')).toBe('true');

    const g = setup();
    Object.defineProperty(g.document, 'defaultView', { configurable: true, value: null });
    expect(() => {
      init(g.document);
    }).not.toThrow();
    g.click();
    expect(g.root()?.getAttribute('data-kb-menu-open')).toBe('true');
  });
});
