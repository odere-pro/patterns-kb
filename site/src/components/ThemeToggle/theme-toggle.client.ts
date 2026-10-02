// The auto → dark → light cycle behind the header button.
//
// The key, the order and the `''`-means-auto storage rule are in
// ../../lib/theme.ts — shared with Starlight's pre-paint snippet, which this
// repo does not own, and with this module's tests.
import { THEME_KEY, fromStored, nextTheme, resolve, toStored, type Theme } from '../../lib/theme';

export function init(doc: Document): void {
  const view = doc.defaultView;
  if (!view) return;

  // The state of record for this page. Storage is only its backup: with
  // localStorage blocked (private mode), reading it back every click would
  // pin the cycle to one state forever.
  let current: Theme | null = null;

  // Const arrows, not `function` declarations: a hoisted declaration is checked
  // without the `if (!view) return` narrowing above it.
  const stored = (): Theme => {
    if (current) return current;
    try {
      return fromStored(view.localStorage.getItem(THEME_KEY));
    } catch {
      return 'auto';
    }
  };

  const save = (theme: Theme): void => {
    current = theme;
    try {
      view.localStorage.setItem(THEME_KEY, toStored(theme));
    } catch {
      /* private mode: the choice lives in `current` for this page */
    }
  };

  const apply = (theme: Theme): void => {
    const dark = view.matchMedia('(prefers-color-scheme: dark)').matches;
    doc.documentElement.dataset.theme = resolve(theme, dark);
    // Two buttons, not one: Starlight renders the ThemeSelect override in the
    // header and again in the mobile menu footer. Both wear the same state.
    for (const button of doc.querySelectorAll<HTMLElement>('[data-kb-theme-toggle]')) {
      button.dataset.state = theme;
      button.title = `Theme: ${theme}`;
      button.setAttribute('aria-label', `Theme: ${theme} — click to change`);
    }
  };

  doc.addEventListener('click', (ev) => {
    const target = ev.target as Element | null;
    if (!target?.closest?.('[data-kb-theme-toggle]')) return;
    const next = nextTheme(stored());
    save(next);
    apply(next);
  });

  view.matchMedia('(prefers-color-scheme: dark)').addEventListener('change', () => {
    if (stored() === 'auto') apply('auto');
  });

  apply(stored());
}
