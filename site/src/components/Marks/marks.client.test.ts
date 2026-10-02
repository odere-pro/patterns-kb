/**
 * The marks page: the lists drawn from the stores and the payload, stale
 * marks under their own heading with a remove control, and Export, Import and
 * Reset. The stores' own rules are src/lib/store.ts's, tested there.
 */
import { describe, expect, it, vi } from 'vitest';

import { fixture } from '../../lib/dom-fixture';
import { FAVOURITES_KEY, PRACTICED_KEY } from '../../lib/store';
import { init } from './marks.client';

const MARKUP = `
  <script data-kb="bundle" src="../kb.js"></script>
  <div data-kb-marks>
    <button data-kb-marks-export></button>
    <button data-kb-marks-import></button>
    <input type="file" data-kb-marks-file />
    <button data-kb-marks-reset></button>
    <p data-kb-marks-message></p>
    <ul data-kb-marks-list="favourites"></ul>
    <ul data-kb-marks-list="suggested"></ul>
    <ul data-kb-marks-list="practiced"></ul>
    <h2 data-kb-marks-gone-head hidden></h2>
    <ul data-kb-marks-list="gone" hidden></ul>
  </div>
`;

const PAYLOAD = {
  pages: [
    {
      route: '/patterns/bulkhead.html',
      title: 'Bulkhead',
      kind: 'patterns',
      categories: ['Patterns'],
    },
    { route: '/designs/bitly.html', title: 'Bitly', kind: 'designs', categories: ['Case Studies'] },
    {
      route: '/patterns/circuit-breaker.html',
      title: 'Circuit Breaker',
      kind: 'patterns',
      categories: ['Patterns'],
      favourite: true,
    },
    {
      route: '/hazards/split-brain.html',
      title: 'Split-Brain',
      kind: 'hazards',
      categories: ['Hazards'],
      favourite: true,
    },
    { title: 'no route' },
  ],
};

const make = (payload: unknown = PAYLOAD) => {
  const f = fixture(MARKUP);
  (f.window as unknown as { kb?: unknown }).kb = payload;
  return f;
};
const set = (f: ReturnType<typeof make>, key: string, value: unknown): void =>
  f.window.localStorage.setItem(key, JSON.stringify(value));
const texts = (f: ReturnType<typeof make>, name: string): string[] =>
  [...f.document.querySelectorAll(`[data-kb-marks-list="${name}"] li`)].map(
    (li) => li.textContent ?? '',
  );
const click = (f: ReturnType<typeof make>, selector: string): void => {
  f.document
    .querySelector(selector)
    ?.dispatchEvent(new f.window.MouseEvent('click', { bubbles: true }) as unknown as Event);
};
const answer = (f: ReturnType<typeof make>, yes: boolean): void => {
  (f.window as unknown as { confirm: () => boolean }).confirm = () => yes;
};
const message = (f: ReturnType<typeof make>): string =>
  f.document.querySelector('[data-kb-marks-message]')?.textContent ?? '';

describe('the marks page', () => {
  it('returns quietly on a page with no marks block', () => {
    const f = fixture('<p>x</p>');
    expect(() => init(f.document)).not.toThrow();
  });

  it("lists the reader's stars and practiced pages with title, kind and a link relative to the bundle", () => {
    const f = make();
    set(f, FAVOURITES_KEY, { bulkhead: true, bitly: false });
    set(f, PRACTICED_KEY, { bitly: true });
    init(f.document);
    expect(texts(f, 'favourites')).toEqual(['BulkheadPatterns']);
    expect(texts(f, 'practiced')).toEqual(['BitlyCase Studies']);
    expect(
      f.document.querySelector('[data-kb-marks-list="favourites"] a')?.getAttribute('href'),
    ).toBe('../patterns/bulkhead.html');
    expect(f.document.querySelector<HTMLElement>('[data-kb-marks-list="gone"]')?.hidden).toBe(true);
  });

  it('says so when there is nothing marked, and still suggests the editors’ picks', () => {
    const f = make();
    init(f.document);
    expect(texts(f, 'favourites')).toEqual(['No stars of your own yet.']);
    expect(texts(f, 'practiced')).toEqual(['Nothing practiced yet.']);
    expect(texts(f, 'suggested')).toEqual(['Circuit BreakerPatterns', 'Split-BrainHazards']);
  });

  it('lists an editors’ pick under Suggested until the reader unstars it, and never in both groups', () => {
    const f = make();
    set(f, FAVOURITES_KEY, { 'split-brain': false, 'circuit-breaker': true, bulkhead: true });
    init(f.document);
    expect(texts(f, 'suggested')).toEqual(['No suggested pages left.']);
    expect(texts(f, 'favourites')).toEqual(['BulkheadPatterns', 'Circuit BreakerPatterns']);
  });

  it('puts a star on a page with no flag in Yours and leaves the picks alone', () => {
    const f = make();
    set(f, FAVOURITES_KEY, { bitly: true });
    init(f.document);
    expect(texts(f, 'favourites')).toEqual(['BitlyCase Studies']);
    expect(texts(f, 'suggested')).toHaveLength(2);
  });

  it('lists a mark whose page is gone under its own heading, and removes it from both stores', () => {
    const f = make();
    set(f, FAVOURITES_KEY, { retired: true });
    set(f, PRACTICED_KEY, { retired: true, bulkhead: true });
    init(f.document);
    expect(texts(f, 'gone')[0]).toContain('retired');
    expect(texts(f, 'gone')[0]).toContain('favourite and practiced');
    expect(f.document.querySelector<HTMLElement>('[data-kb-marks-gone-head]')?.hidden).toBe(false);
    click(f, '[data-kb-marks-remove="retired"]');
    expect(texts(f, 'gone')).toEqual([]);
    expect(f.document.querySelector<HTMLElement>('[data-kb-marks-list="gone"]')?.hidden).toBe(true);
    expect(JSON.parse(f.window.localStorage.getItem(FAVOURITES_KEY) ?? '')).toEqual({});
    expect(JSON.parse(f.window.localStorage.getItem(PRACTICED_KEY) ?? '')).toEqual({
      bulkhead: true,
    });
    expect(message(f)).toBe('Removed retired.');
  });

  it('loads the payload by adding its script once, and draws when it has run', () => {
    const f = fixture(MARKUP);
    set(f, PRACTICED_KEY, { bulkhead: true });
    init(f.document);
    const script = f.document.head.querySelector('script[data-kb="search-index"]');
    expect(script?.getAttribute('src')).toBe('../search-index.js');
    (f.window as unknown as { kb?: unknown }).kb = PAYLOAD;
    script?.dispatchEvent(new f.window.Event('load') as unknown as Event);
    expect(message(f)).toBe('');
    expect(texts(f, 'practiced')).toEqual(['BulkheadPatterns']);
  });

  it('says the list did not load when the script fails or carries no pages, and draws nothing stale', () => {
    const f = fixture(MARKUP);
    set(f, PRACTICED_KEY, { bulkhead: true });
    init(f.document);
    const script = f.document.head.querySelector('script[data-kb="search-index"]');
    script?.dispatchEvent(new f.window.Event('error') as unknown as Event);
    expect(message(f)).toContain('did not load');
    script?.dispatchEvent(new f.window.Event('load') as unknown as Event);
    expect(message(f)).toContain('did not load');
    expect(texts(f, 'gone')).toEqual([]);
  });

  it('ignores a payload that is not a page list', () => {
    const f = make({ pages: 'x' });
    init(f.document);
    expect(f.document.head.querySelector('script[data-kb="search-index"]')).not.toBeNull();
  });

  it("follows another tab's change to either store, and no other key", () => {
    const f = make();
    init(f.document);
    set(f, FAVOURITES_KEY, { bulkhead: true });
    f.window.dispatchEvent(new f.window.StorageEvent('storage', { key: 'other' }));
    expect(texts(f, 'favourites')).toEqual(['No stars of your own yet.']);
    f.window.dispatchEvent(new f.window.StorageEvent('storage', { key: FAVOURITES_KEY }));
    expect(texts(f, 'favourites')).toEqual(['BulkheadPatterns']);
  });
});

describe('Export, Import and Reset', () => {
  it('exports both stores as a versioned file download', async () => {
    const f = make();
    set(f, FAVOURITES_KEY, { bulkhead: true });
    set(f, PRACTICED_KEY, { bitly: true });
    let blob: Blob | undefined;
    f.window.URL.createObjectURL = ((b: Blob) => {
      blob = b;
      return 'blob:x';
    }) as typeof f.window.URL.createObjectURL;
    f.window.URL.revokeObjectURL = () => undefined;
    const names: string[] = [];
    f.window.HTMLAnchorElement.prototype.click = function (this: HTMLAnchorElement) {
      names.push(this.download);
    };
    init(f.document);
    click(f, '[data-kb-marks-export]');
    expect(names).toEqual(['kb-marks.json']);
    expect(JSON.parse((await blob?.text()) ?? '')).toEqual({
      version: 1,
      favourites: { bulkhead: true },
      practiced: { bitly: true },
    });
    expect(message(f)).toBe('Exported to kb-marks.json.');
  });

  const importFile = async (f: ReturnType<typeof make>, text: string): Promise<void> => {
    const input = f.document.querySelector<HTMLInputElement>(
      '[data-kb-marks-file]',
    ) as HTMLInputElement;
    const file = new f.window.File([text], 'marks.json', { type: 'application/json' });
    Object.defineProperty(input, 'files', { value: [file], configurable: true });
    Object.defineProperty(input, 'value', { value: '', writable: true, configurable: true });
    input.dispatchEvent(new f.window.Event('change') as unknown as Event);
    await vi.waitFor(() => expect(message(f)).not.toBe(''));
  };

  it('merges a valid file into the stores and redraws', async () => {
    const f = make();
    set(f, PRACTICED_KEY, { bitly: true });
    init(f.document);
    await importFile(
      f,
      JSON.stringify({ version: 1, favourites: { bulkhead: true }, practiced: { gone: true } }),
    );
    expect(message(f)).toBe('Imported 1 favourites and 1 practiced.');
    expect(texts(f, 'favourites')).toEqual(['BulkheadPatterns']);
    expect(JSON.parse(f.window.localStorage.getItem(PRACTICED_KEY) ?? '')).toEqual({
      bitly: true,
      gone: true,
    });
    expect(texts(f, 'gone')[0]).toContain('gone');
  });

  it('rejects a file that is not a marks file, storing nothing', async () => {
    const f = make();
    init(f.document);
    await importFile(f, '{"hello":1}');
    expect(message(f)).toContain('Not imported');
    expect(f.window.localStorage.getItem(FAVOURITES_KEY)).toBeNull();
  });

  it('says so when the file cannot be read, and ignores an empty choice', async () => {
    const f = make();
    init(f.document);
    const input = f.document.querySelector<HTMLInputElement>(
      '[data-kb-marks-file]',
    ) as HTMLInputElement;
    Object.defineProperty(input, 'files', { value: [], configurable: true });
    input.dispatchEvent(new f.window.Event('change') as unknown as Event);
    expect(message(f)).toBe('');
    const broken = { text: () => Promise.reject(new Error('unreadable')) };
    Object.defineProperty(input, 'files', { value: [broken], configurable: true });
    input.dispatchEvent(new f.window.Event('change') as unknown as Event);
    await vi.waitFor(() => expect(message(f)).toContain('could not be read'));
  });

  it('opens the file chooser from the Import button', () => {
    const f = make();
    init(f.document);
    let opened = 0;
    f.document.querySelector('[data-kb-marks-file]')?.addEventListener('click', () => {
      opened += 1;
    });
    click(f, '[data-kb-marks-import]');
    expect(opened).toBe(1);
  });

  it('clears both stores only when the reader confirms', () => {
    const f = make();
    set(f, FAVOURITES_KEY, { bulkhead: true });
    set(f, PRACTICED_KEY, { bitly: true });
    init(f.document);
    answer(f, false);
    click(f, '[data-kb-marks-reset]');
    expect(texts(f, 'favourites')).toEqual(['BulkheadPatterns']);
    answer(f, true);
    click(f, '[data-kb-marks-reset]');
    expect(texts(f, 'favourites')).toEqual(['No stars of your own yet.']);
    expect(JSON.parse(f.window.localStorage.getItem(PRACTICED_KEY) ?? '')).toEqual({});
    expect(message(f)).toBe('All marks cleared.');
  });

  it('ignores a click on nothing it owns', () => {
    const f = make();
    init(f.document);
    click(f, '[data-kb-marks-message]');
    expect(message(f)).toBe('');
  });
});
