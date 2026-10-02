/**
 * The theme convention this repo shares with Starlight's pre-paint snippet.
 *
 * The rule worth pinning is the storage encoding: auto is the empty string,
 * because upstream reads any other value as dark.
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { Window } from 'happy-dom';
import { describe, expect, it } from 'vitest';

import {
  CARRIED_THEME_KEY,
  THEME_KEY,
  THEME_ORDER,
  fromStored,
  nextTheme,
  resolve,
  toStored,
} from './theme';

const here = path.dirname(fileURLToPath(import.meta.url));

/** The pre-paint script's body, as ThemeProvider.astro ships it. */
function prePaint(): string {
  const astro = fs.readFileSync(
    path.join(here, '../components/ThemeProvider/ThemeProvider.astro'),
    'utf8',
  );
  return (/<script is:inline>([\s\S]*?)<\/script>/.exec(astro) as RegExpExecArray)[1];
}

/** Run the pre-paint script in a fresh window with `stored` in its storage and the OS in `scheme`. */
function paint(
  stored: Record<string, string>,
  scheme: 'light' | 'dark',
): { theme: string | undefined; storage: Record<string, string | null> } {
  const window = new Window({ url: 'https://kb.test/' });
  for (const [k, v] of Object.entries(stored)) window.localStorage.setItem(k, v);
  window.matchMedia = ((q: string) => ({
    matches: q.includes(scheme),
  })) as unknown as typeof window.matchMedia;
  window.eval(prePaint());
  return {
    theme: window.document.documentElement.dataset['theme'],
    storage: {
      [THEME_KEY]: window.localStorage.getItem(THEME_KEY),
      [CARRIED_THEME_KEY]: window.localStorage.getItem(CARRIED_THEME_KEY),
    },
  };
}

describe('the theme convention', () => {
  it('cycles auto → dark → light → auto', () => {
    expect(THEME_ORDER).toEqual(['auto', 'dark', 'light']);
    expect(nextTheme('auto')).toBe('dark');
    expect(nextTheme('dark')).toBe('light');
    expect(nextTheme('light')).toBe('auto');
  });

  // The rule this repo does not own: Starlight's pre-paint snippet treats any
  // non-empty value other than 'light' as dark, so a literal 'auto' in storage
  // would flash dark on every load of a light-mode machine.
  it("stores auto as '' and reads '' back as auto", () => {
    expect(toStored('auto')).toBe('');
    expect(fromStored('')).toBe('auto');
    expect(toStored('dark')).toBe('dark');
    expect(toStored('light')).toBe('light');
  });

  it('treats anything unrecognised as auto', () => {
    expect(fromStored(null)).toBe('auto');
    expect(fromStored(undefined)).toBe('auto');
    expect(fromStored('sepia')).toBe('auto');
    expect(fromStored('AUTO')).toBe('auto');
  });

  it('uses the key Starlight already owns', () => {
    expect(THEME_KEY).toBe('starlight-theme');
  });

  it('carries a reader’s choice from the HTML pages over once, before first paint', () => {
    expect(CARRIED_THEME_KEY).toBe('kb-theme');
    const carried = paint({ [CARRIED_THEME_KEY]: 'dark' }, 'light');
    expect(carried.theme).toBe('dark');
    expect(carried.storage[THEME_KEY]).toBe('dark');
    // Starlight's own value, even auto's empty one, wins over the old key.
    expect(paint({ [THEME_KEY]: 'light', [CARRIED_THEME_KEY]: 'dark' }, 'dark').theme).toBe(
      'light',
    );
    expect(paint({ [THEME_KEY]: '', [CARRIED_THEME_KEY]: 'dark' }, 'light').theme).toBe('light');
    // Nothing stored, or nothing the old pages would have written: the OS decides.
    expect(paint({}, 'light')).toEqual({
      theme: 'light',
      storage: { [THEME_KEY]: null, [CARRIED_THEME_KEY]: null },
    });
    expect(paint({ [CARRIED_THEME_KEY]: 'sepia' }, 'dark').storage[THEME_KEY]).toBeNull();
  });

  it('resolves auto against the OS and leaves the others alone', () => {
    expect(resolve('auto', true)).toBe('dark');
    expect(resolve('auto', false)).toBe('light');
    expect(resolve('light', true)).toBe('light');
    expect(resolve('dark', false)).toBe('dark');
  });
});
