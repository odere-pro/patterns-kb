// The theme convention, in one place — because it is shared with code this
// repo does not own.
//
// Starlight's pre-paint inline snippet reads `localStorage['starlight-theme']`
// before any of this site's own code runs, and it treats any value other than
// 'light' as dark. So auto MUST be stored as the empty string: a literal
// 'auto' in there flashes dark on every load of a light-mode machine. The key,
// the cycle order and that one rule live here rather than as prose in
// ThemeToggle's inline script, so the toggle and its tests read the same
// answer.

export type Theme = 'auto' | 'dark' | 'light';

/** Starlight's own key. Changing it orphans everyone's stored preference. */
export const THEME_KEY = 'starlight-theme';

/**
 * The HTML pages' key, `light` or `dark` (absent for auto). The pre-paint
 * script reads it once when Starlight's key is unset and copies it across.
 */
export const CARRIED_THEME_KEY = 'kb-theme';

/** The cycle the button walks, in order. */
export const THEME_ORDER: readonly Theme[] = ['auto', 'dark', 'light'];

export function isTheme(value: unknown): value is Theme {
  return typeof value === 'string' && (THEME_ORDER as readonly string[]).includes(value);
}

/** What goes into storage. Auto is `''` — see the note at the top. */
export function toStored(theme: Theme): string {
  return theme === 'auto' ? '' : theme;
}

/** What comes back out. Anything unrecognised, including `''`, means auto. */
export function fromStored(raw: string | null | undefined): Theme {
  return isTheme(raw) ? raw : 'auto';
}

/** The next state of the cycle. */
export function nextTheme(theme: Theme): Theme {
  const at = THEME_ORDER.indexOf(theme);
  return THEME_ORDER[(at + 1) % THEME_ORDER.length];
}

/** The theme actually painted, once auto has been resolved against the OS. */
export function resolve(theme: Theme, prefersDark: boolean): 'dark' | 'light' {
  if (theme !== 'auto') return theme;
  return prefersDark ? 'dark' : 'light';
}
