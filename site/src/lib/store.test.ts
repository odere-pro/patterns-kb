/**
 * The reader's stores: read and written without ever throwing, and the
 * favourites' overrides-only rule.
 */
import { describe, expect, it } from 'vitest';

import { fixture } from './dom-fixture';
import {
  exportMarks,
  FAVOURITES_KEY,
  flipFavourite,
  isFavourite,
  mergeMarks,
  parseMarks,
  PRACTICED_KEY,
  readFlags,
  resetMarks,
  writeFlags,
} from './store';

const view = (): Window => fixture('').window as unknown as Window;

describe('readFlags and writeFlags', () => {
  it("keeps today's keys, so a reader's marks from the HTML site survive", () => {
    expect([FAVOURITES_KEY, PRACTICED_KEY]).toEqual([
      'kb-favourites-v1',
      'elevation-map-progress-v1',
    ]);
  });

  it('round-trips a store, keeping only its true and false flags', () => {
    const w = view();
    writeFlags(w, PRACTICED_KEY, { a: true, b: false });
    expect(readFlags(w, PRACTICED_KEY)).toEqual({ a: true, b: false });
    w.localStorage.setItem(PRACTICED_KEY, JSON.stringify({ a: true, b: 'yes', c: 1 }));
    expect(readFlags(w, PRACTICED_KEY)).toEqual({ a: true });
  });

  it('reads an empty store from nothing, from text that is no JSON, and from JSON that is no object', () => {
    const w = view();
    expect(readFlags(w, 'nothing-here')).toEqual({});
    for (const raw of ['{', '[1,2]', 'null', '"text"']) {
      w.localStorage.setItem('k', raw);
      expect(readFlags(w, 'k'), raw).toEqual({});
    }
  });

  it('never throws when storage is off', () => {
    const off = {
      localStorage: {
        getItem: () => {
          throw new Error('blocked');
        },
        setItem: () => {
          throw new Error('blocked');
        },
      },
    } as unknown as Window;
    expect(readFlags(off, 'k')).toEqual({});
    expect(() => writeFlags(off, 'k', { a: true })).not.toThrow();
  });
});

describe('favourites', () => {
  it("answers the page's own choice until the reader overrides it", () => {
    expect(isFavourite('a', true, {})).toBe(true);
    expect(isFavourite('a', false, {})).toBe(false);
    expect(isFavourite('a', true, { a: false })).toBe(false);
    expect(isFavourite('a', false, { a: true })).toBe(true);
  });

  it('stores an override only while the reader disagrees with the page, never on an inherited key', () => {
    expect(flipFavourite('a', true, {})).toEqual({ a: false });
    expect(flipFavourite('a', true, { a: false })).toEqual({});
    expect(flipFavourite('a', false, {})).toEqual({ a: true });
    expect(flipFavourite('b', false, { a: true })).toEqual({ a: true, b: true });
    expect(isFavourite('constructor', false, {})).toBe(false);
  });
});

describe('a refused write', () => {
  const refusing = (): Window => {
    const w = view();
    Object.defineProperty(w, 'localStorage', {
      value: {
        getItem: () => {
          throw new Error('blocked');
        },
        setItem: () => {
          throw new Error('blocked');
        },
      },
    });
    return w;
  };

  it('is read back from memory for the life of the window', () => {
    const w = refusing();
    writeFlags(w, PRACTICED_KEY, { a: true });
    expect(readFlags(w, PRACTICED_KEY)).toEqual({ a: true });
    writeFlags(w, PRACTICED_KEY, { a: true, b: true });
    expect(readFlags(w, PRACTICED_KEY)).toEqual({ a: true, b: true });
    expect(readFlags(w, FAVOURITES_KEY)).toEqual({});
  });

  it('hands the store back to storage once a write is accepted', () => {
    const w = view();
    const real = w.localStorage;
    let fail = true;
    Object.defineProperty(w, 'localStorage', {
      value: {
        getItem: (k: string) => real.getItem(k),
        setItem: (k: string, v: string) => {
          if (fail) throw new Error('quota');
          real.setItem(k, v);
        },
      },
    });
    writeFlags(w, PRACTICED_KEY, { a: true });
    expect(readFlags(w, PRACTICED_KEY)).toEqual({ a: true });
    fail = false;
    writeFlags(w, PRACTICED_KEY, { b: true });
    real.setItem(PRACTICED_KEY, JSON.stringify({ c: true }));
    expect(readFlags(w, PRACTICED_KEY)).toEqual({ c: true });
  });

  it('hands back a copy, so a caller cannot edit the held store', () => {
    const w = refusing();
    writeFlags(w, PRACTICED_KEY, { a: true });
    readFlags(w, PRACTICED_KEY)['z'] = true;
    expect(readFlags(w, PRACTICED_KEY)).toEqual({ a: true });
  });
});

describe('the marks file', () => {
  it('exports both stores under a version', () => {
    const w = view();
    writeFlags(w, FAVOURITES_KEY, { a: false, b: true });
    writeFlags(w, PRACTICED_KEY, { c: true });
    expect(exportMarks(w)).toEqual({
      version: 1,
      favourites: { a: false, b: true },
      practiced: { c: true },
    });
  });

  it('parses its own export, and drops a practiced false', () => {
    const text = JSON.stringify({
      version: 1,
      favourites: { a: true },
      practiced: { b: true, c: false },
    });
    expect(parseMarks(text)).toEqual({
      version: 1,
      favourites: { a: true },
      practiced: { b: true },
    });
  });

  it('rejects text that is no marks file', () => {
    for (const text of [
      '{',
      'null',
      '[]',
      '"x"',
      '{}',
      JSON.stringify({ version: 2, favourites: {}, practiced: {} }),
      JSON.stringify({ version: 1, favourites: {} }),
      JSON.stringify({ version: 1, favourites: [], practiced: {} }),
      JSON.stringify({ version: 1, favourites: { a: 'yes' }, practiced: {} }),
      JSON.stringify({ version: 1, favourites: {}, practiced: null }),
    ])
      expect(parseMarks(text), text).toBeNull();
  });

  it("merges into the reader's marks, the file winning a shared slug, and resets both", () => {
    const w = view();
    writeFlags(w, FAVOURITES_KEY, { a: true, b: true });
    writeFlags(w, PRACTICED_KEY, { p: true });
    mergeMarks(w, { version: 1, favourites: { b: false, c: true }, practiced: { q: true } });
    expect(readFlags(w, FAVOURITES_KEY)).toEqual({ a: true, b: false, c: true });
    expect(readFlags(w, PRACTICED_KEY)).toEqual({ p: true, q: true });
    resetMarks(w);
    expect(readFlags(w, FAVOURITES_KEY)).toEqual({});
    expect(readFlags(w, PRACTICED_KEY)).toEqual({});
  });
});
