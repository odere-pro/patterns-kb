/**
 * The favourite stars: the page's own answer as the starting state, the
 * reader's overrides in the store, and every star for one page kept in step.
 * The override rule itself is src/lib/store.ts's, tested there.
 */
import { describe, expect, it } from 'vitest';

import { fixture } from '../../lib/dom-fixture';
import { FAVOURITES_KEY } from '../../lib/store';
import { init } from './favourites.client';

/** Two stars for `alpha` (authored a favourite), one for `beta` (not). */
const MARKUP = `
  <button data-kb-favourite="alpha" aria-pressed="true"></button>
  <button data-kb-favourite="alpha" aria-pressed="true"></button>
  <button data-kb-favourite="beta" aria-pressed="false"></button>
`;

const state = (doc: Document): string[] =>
  [...doc.querySelectorAll('[data-kb-favourite]')].map(
    (b) => `${b.getAttribute('data-kb-favourite')}:${b.getAttribute('aria-pressed')}`,
  );

const click = (doc: Document, i: number): void => {
  const target = doc.querySelectorAll('[data-kb-favourite]')[i];
  target?.dispatchEvent(new doc.defaultView!.MouseEvent('click', { bubbles: true }));
};

const stored = (f: { window: { localStorage: { getItem(k: string): string | null } } }): unknown =>
  JSON.parse(f.window.localStorage.getItem(FAVOURITES_KEY) ?? 'null');

describe('the favourite stars', () => {
  it('returns quietly on a page with no star', () => {
    const f = fixture('<p>none</p>');
    const seen: Event[] = [];
    f.document.addEventListener('kb-favourites-change', (ev) => seen.push(ev));
    init(f.document);
    expect(seen).toEqual([]);
  });

  it("paints the page's own answer when the reader has chosen nothing, and says so once", () => {
    const f = fixture(MARKUP);
    const seen: Event[] = [];
    f.document.addEventListener('kb-favourites-change', (ev) => seen.push(ev));
    init(f.document);
    expect(state(f.document)).toEqual(['alpha:true', 'alpha:true', 'beta:false']);
    expect(seen).toHaveLength(1);
  });

  it('applies the stored overrides over the authored answers', () => {
    const f = fixture(MARKUP);
    f.window.localStorage.setItem(FAVOURITES_KEY, JSON.stringify({ alpha: false, beta: true }));
    init(f.document);
    expect(state(f.document)).toEqual(['alpha:false', 'alpha:false', 'beta:true']);
  });

  it('flips every star for the page clicked, stores the override, and deletes it on the way back', () => {
    const f = fixture(MARKUP);
    const slugs: unknown[] = [];
    f.document.addEventListener('kb-favourites-change', (ev) =>
      slugs.push((ev as CustomEvent<{ slug?: string }>).detail.slug),
    );
    init(f.document);
    click(f.document, 1);
    expect(state(f.document)).toEqual(['alpha:false', 'alpha:false', 'beta:false']);
    expect(stored(f)).toEqual({ alpha: false });
    click(f.document, 0);
    expect(state(f.document)).toEqual(['alpha:true', 'alpha:true', 'beta:false']);
    expect(stored(f)).toEqual({});
    expect(slugs).toEqual([undefined, 'alpha', 'alpha']);
  });

  it('ignores a click on anything but a star', () => {
    const f = fixture(`${MARKUP}<p id="x">x</p>`);
    init(f.document);
    f.document
      .getElementById('x')
      ?.dispatchEvent(new f.window.MouseEvent('click', { bubbles: true }) as unknown as Event);
    expect(stored(f)).toBeNull();
  });

  it("shows another tab's change to the store, and no other key's", () => {
    const f = fixture(MARKUP);
    init(f.document);
    let heard = 0;
    f.document.addEventListener('kb-favourites-change', () => {
      heard += 1;
    });
    f.window.localStorage.setItem(FAVOURITES_KEY, JSON.stringify({ beta: true }));
    f.window.dispatchEvent(new f.window.StorageEvent('storage', { key: 'another-key' }));
    expect(state(f.document)[2]).toBe('beta:false');
    f.window.dispatchEvent(new f.window.StorageEvent('storage', { key: FAVOURITES_KEY }));
    expect(state(f.document)[2]).toBe('beta:true');
    expect(heard).toBe(1);
  });
});

describe('the favourite stars before the first paint', () => {
  it('sets the ready hook on <html> after applying the stored overrides', () => {
    const f = fixture(MARKUP);
    f.window.localStorage.setItem(FAVOURITES_KEY, JSON.stringify({ alpha: false }));
    expect(f.document.documentElement.hasAttribute('data-kb-favourites-ready')).toBe(false);
    init(f.document);
    expect(state(f.document)[0]).toBe('alpha:false');
    expect(f.document.documentElement.hasAttribute('data-kb-favourites-ready')).toBe(true);
  });
});
