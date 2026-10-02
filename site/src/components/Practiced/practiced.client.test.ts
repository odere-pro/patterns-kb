/**
 * The practiced checks and the hub's count: today's store and its
 * true-or-absent values, every check for one page in step, and a count of
 * the pages on the page, one per slug.
 */
import { describe, expect, it } from 'vitest';

import { fixture } from '../../lib/dom-fixture';
import { PRACTICED_KEY } from '../../lib/store';
import { init } from './practiced.client';

const MARKUP = `
  <p data-kb-practiced-count></p>
  <button data-kb-practiced="alpha" aria-pressed="false"></button>
  <button data-kb-practiced="alpha" aria-pressed="false"></button>
  <button data-kb-practiced="beta" aria-pressed="false"></button>
`;

const state = (doc: Document): string[] =>
  [...doc.querySelectorAll('[data-kb-practiced]')].map((b) => b.getAttribute('aria-pressed') ?? '');
const count = (doc: Document): string =>
  doc.querySelector('[data-kb-practiced-count]')?.textContent ?? '';
const click = (doc: Document, i: number): void => {
  const target = doc.querySelectorAll('[data-kb-practiced]')[i];
  target?.dispatchEvent(new doc.defaultView!.MouseEvent('click', { bubbles: true }));
};

describe('the practiced checks', () => {
  it('returns quietly on a page with no check, even one with a count', () => {
    const f = fixture('<p data-kb-practiced-count></p>');
    init(f.document);
    expect(count(f.document)).toBe('');
  });

  it("reads today's store and counts each page once", () => {
    const f = fixture(MARKUP);
    f.window.localStorage.setItem(PRACTICED_KEY, JSON.stringify({ alpha: true, gone: true }));
    init(f.document);
    expect(state(f.document)).toEqual(['true', 'true', 'false']);
    expect(count(f.document)).toBe('1 of 2 practiced');
  });

  it('marks with true and unmarks by deleting the key', () => {
    const f = fixture(MARKUP);
    init(f.document);
    click(f.document, 2);
    expect(JSON.parse(f.window.localStorage.getItem(PRACTICED_KEY) ?? '')).toEqual({ beta: true });
    expect(count(f.document)).toBe('1 of 2 practiced');
    click(f.document, 2);
    expect(JSON.parse(f.window.localStorage.getItem(PRACTICED_KEY) ?? '')).toEqual({});
    expect(state(f.document)).toEqual(['false', 'false', 'false']);
  });

  it('ignores a click on anything but a check', () => {
    const f = fixture(`${MARKUP}<p id="x">x</p>`);
    init(f.document);
    f.document
      .getElementById('x')
      ?.dispatchEvent(new f.window.MouseEvent('click', { bubbles: true }) as unknown as Event);
    expect(f.window.localStorage.getItem(PRACTICED_KEY)).toBeNull();
  });

  it("shows another tab's marks, and ignores other keys", () => {
    const f = fixture(MARKUP);
    init(f.document);
    f.window.localStorage.setItem(PRACTICED_KEY, JSON.stringify({ alpha: true, beta: true }));
    f.window.dispatchEvent(new f.window.StorageEvent('storage', { key: 'other' }));
    expect(count(f.document)).toBe('0 of 2 practiced');
    f.window.dispatchEvent(new f.window.StorageEvent('storage', { key: PRACTICED_KEY }));
    expect(count(f.document)).toBe('2 of 2 practiced');
  });
});

describe('the practiced toggles before and after the first paint', () => {
  it('sets the ready hook on <html> after painting the stored marks, so practiced.css shows them', () => {
    const f = fixture(MARKUP);
    f.window.localStorage.setItem(PRACTICED_KEY, JSON.stringify({ alpha: true }));
    expect(f.document.documentElement.hasAttribute('data-kb-practiced-ready')).toBe(false);
    init(f.document);
    expect(state(f.document)[0]).toBe('true');
    expect(f.document.documentElement.hasAttribute('data-kb-practiced-ready')).toBe(true);
  });

  it('keeps a mark for the life of the page when storage refuses the write', () => {
    const f = fixture(MARKUP);
    Object.defineProperty(f.window, 'localStorage', {
      value: {
        getItem: () => {
          throw new Error('blocked');
        },
        setItem: () => {
          throw new Error('blocked');
        },
      },
    });
    init(f.document);
    click(f.document, 2);
    expect(state(f.document)).toEqual(['false', 'false', 'true']);
    expect(count(f.document)).toBe('1 of 2 practiced');
  });
});

describe('the tours’ counts', () => {
  const TOUR = `
    <p data-kb-practiced-tour="alpha beta gamma beta"></p>
    <button data-kb-practiced="alpha" aria-pressed="false"></button>
  `;
  const HOME = `
    <section data-kb-practiced-tours hidden>
      <ul>
        <li data-kb-practiced-tour="alpha beta" hidden><a href="a.html">A</a> <span data-kb-practiced-tour-text></span></li>
        <li data-kb-practiced-tour="gamma delta" hidden><a href="b.html">B</a> <span data-kb-practiced-tour-text></span></li>
      </ul>
    </section>
  `;
  const tourText = (doc: Document): string =>
    doc.querySelector('p[data-kb-practiced-tour]')?.textContent ?? '';
  const items = (doc: Document): HTMLElement[] => [
    ...doc.querySelectorAll<HTMLElement>('li[data-kb-practiced-tour]'),
  ];
  const list = (doc: Document): HTMLElement =>
    doc.querySelector<HTMLElement>('[data-kb-practiced-tours]') as HTMLElement;

  it('counts the stored marks against the baked page list, each page once, on a page that holds none of the tour’s checks', () => {
    const f = fixture('<p data-kb-practiced-tour="alpha beta gamma beta"></p>');
    f.window.localStorage.setItem(
      PRACTICED_KEY,
      JSON.stringify({ alpha: true, beta: true, other: true }),
    );
    init(f.document);
    expect(tourText(f.document)).toBe('2 of 3 practiced');
  });

  it('starts at none for a reader with no marks, and follows a check on the same page', () => {
    const f = fixture(TOUR);
    init(f.document);
    expect(tourText(f.document)).toBe('0 of 3 practiced');
    click(f.document, 0);
    expect(tourText(f.document)).toBe('1 of 3 practiced');
    click(f.document, 0);
    expect(tourText(f.document)).toBe('0 of 3 practiced');
  });

  it('follows another tab’s marks', () => {
    const f = fixture(TOUR);
    init(f.document);
    f.window.localStorage.setItem(PRACTICED_KEY, JSON.stringify({ beta: true, gamma: true }));
    f.window.dispatchEvent(new f.window.StorageEvent('storage', { key: PRACTICED_KEY }));
    expect(tourText(f.document)).toBe('2 of 3 practiced');
  });

  it('lists on the home page only the tours the reader has started, and shows the list only then', () => {
    const f = fixture(HOME);
    init(f.document);
    expect(list(f.document).hidden).toBe(true);
    expect(items(f.document).map((i) => i.hidden)).toEqual([true, true]);

    const g = fixture(HOME);
    g.window.localStorage.setItem(PRACTICED_KEY, JSON.stringify({ gamma: true }));
    init(g.document);
    expect(list(g.document).hidden).toBe(false);
    expect(items(g.document).map((i) => i.hidden)).toEqual([true, false]);
    expect(items(g.document)[1]?.textContent).toContain('1 of 2 practiced');
  });

  it('shows a tour on the home page the moment a mark in another tab starts it', () => {
    const f = fixture(HOME);
    init(f.document);
    f.window.localStorage.setItem(PRACTICED_KEY, JSON.stringify({ alpha: true, beta: true }));
    f.window.dispatchEvent(new f.window.StorageEvent('storage', { key: PRACTICED_KEY }));
    expect(list(f.document).hidden).toBe(false);
    expect(items(f.document)[0]?.hidden).toBe(false);
    expect(items(f.document)[0]?.textContent).toContain('2 of 2 practiced');
  });

  it('counts none and throws nothing when storage is off, and holds a mark made since the page opened', () => {
    const f = fixture(`${TOUR}<p id="empty" data-kb-practiced-tour=""></p>`);
    Object.defineProperty(f.window, 'localStorage', {
      value: {
        getItem: () => {
          throw new Error('blocked');
        },
        setItem: () => {
          throw new Error('blocked');
        },
      },
    });
    expect(() => init(f.document)).not.toThrow();
    expect(tourText(f.document)).toBe('0 of 3 practiced');
    click(f.document, 0);
    expect(tourText(f.document)).toBe('1 of 3 practiced');
    expect(f.document.getElementById('empty')?.textContent).toBe('0 of 0 practiced');
  });

  it('is quiet on a page with no tour and no check', () => {
    const f = fixture('<p>x</p>');
    init(f.document);
    expect(f.document.documentElement.hasAttribute('data-kb-practiced-ready')).toBe(false);
  });
});
