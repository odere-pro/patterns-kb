/**
 * The auto → dark → light cycle behind the header button.
 *
 * The storage convention it shares with Starlight's pre-paint snippet lives in
 * ../../lib/theme.ts and is tested there; these cases are the button's own
 * behaviour and what it writes.
 */
import { describe, expect, it } from 'vitest';

import { fixture } from '../../lib/dom-fixture';
import { THEME_KEY } from '../../lib/theme';
import { init } from './theme-toggle.client';

/** Two buttons, because Starlight renders this override twice on every page. */
const MARKUP = `
  <button data-kb-theme-toggle data-state="auto"></button>
  <button data-kb-theme-toggle data-state="auto"></button>
`;

function setup(prefersDark = false) {
  const f = fixture(MARKUP);
  // happy-dom's matchMedia answers false for everything; the toggle only ever
  // asks about one query, so stubbing it is honest rather than a mock of the
  // module under test. `media.prefersDark` is mutable and `matches` a getter,
  // so a test can flip the OS preference mid-flight and fire the listeners.
  const listeners: (() => void)[] = [];
  const media = { prefersDark };
  Object.defineProperty(f.window, 'matchMedia', {
    configurable: true,
    value: () => ({
      get matches() {
        return media.prefersDark;
      },
      addEventListener: (_: string, cb: () => void) => listeners.push(cb),
    }),
  });
  return { ...f, listeners, media };
}

const click = (f: { document: Document }): void => {
  f.document
    .querySelectorAll('[data-kb-theme-toggle]')[0]
    ?.dispatchEvent(new f.document.defaultView!.MouseEvent('click', { bubbles: true }));
};

describe('the theme toggle', () => {
  it('paints both buttons, not just the one that was clicked', () => {
    const f = setup();
    init(f.document);
    click(f);
    for (const b of f.document.querySelectorAll<HTMLElement>('[data-kb-theme-toggle]')) {
      expect(b.dataset.state).toBe('dark');
      expect(b.getAttribute('aria-label')).toBe('Theme: dark — click to change');
    }
  });

  it('cycles auto → dark → light → auto and writes the stored form', () => {
    const f = setup();
    const store = f.window.localStorage;
    init(f.document);

    click(f);
    expect(store.getItem(THEME_KEY)).toBe('dark');
    click(f);
    expect(store.getItem(THEME_KEY)).toBe('light');
    click(f);
    // Auto is stored as '', never 'auto' — Starlight's pre-paint script reads
    // this key and treats any other non-empty value as dark.
    expect(store.getItem(THEME_KEY)).toBe('');
  });

  it('resolves auto against the OS preference', () => {
    const dark = setup(true);
    init(dark.document);
    expect(dark.document.documentElement.dataset.theme).toBe('dark');

    const light = setup(false);
    init(light.document);
    expect(light.document.documentElement.dataset.theme).toBe('light');
  });

  it('re-applies auto when the OS preference changes, and only then', () => {
    const f = setup(false);
    init(f.document);
    expect(f.document.documentElement.dataset.theme).toBe('light');

    // Still on auto: the OS flipping to dark must repaint the page.
    f.media.prefersDark = true;
    f.listeners.forEach((cb) => cb());
    expect(f.document.documentElement.dataset.theme).toBe('dark');

    // After an explicit choice the OS preference no longer drives the theme.
    click(f); // auto → dark, an explicit choice
    f.media.prefersDark = false;
    f.listeners.forEach((cb) => cb());
    expect(f.document.documentElement.dataset.theme).toBe('dark');
  });

  // Private mode: every localStorage call throws. The cycle must still advance,
  // which is why the module keeps the state of record in a variable and treats
  // storage as a backup.
  it('keeps cycling when localStorage is unavailable', () => {
    const f = setup();
    const boom = () => {
      throw new Error('private mode');
    };
    Object.defineProperty(f.window, 'localStorage', {
      configurable: true,
      value: { getItem: boom, setItem: boom },
    });
    init(f.document);
    click(f);
    expect(f.document.documentElement.dataset.theme).toBe('dark');
    click(f);
    expect(f.document.documentElement.dataset.theme).toBe('light');
  });

  it('reads an existing preference back on load', () => {
    const f = setup();
    f.window.localStorage.setItem(THEME_KEY, 'light');
    init(f.document);
    expect(f.document.documentElement.dataset.theme).toBe('light');
    click(f);
    expect(f.window.localStorage.getItem(THEME_KEY)).toBe('');
  });

  it('ignores a click that is not on a toggle', () => {
    const f = setup();
    init(f.document);
    f.document.body.dispatchEvent(
      new f.window.MouseEvent('click', { bubbles: true }) as unknown as Event,
    );
    expect(f.window.localStorage.getItem(THEME_KEY)).toBeNull();
  });

  it('does nothing for a document that has no window', () => {
    const f = setup();
    Object.defineProperty(f.document, 'defaultView', { configurable: true, value: null });
    expect(() => {
      init(f.document);
    }).not.toThrow();
    expect(f.document.documentElement.dataset.theme).toBeUndefined();
  });

  it('treats a stored value it does not know as auto', () => {
    const f = setup(true);
    f.window.localStorage.setItem(THEME_KEY, 'sepia');
    init(f.document);
    expect(f.document.documentElement.dataset.theme).toBe('dark');
    expect(f.document.querySelector<HTMLElement>('[data-kb-theme-toggle]')?.dataset.state).toBe(
      'auto',
    );
  });
});
