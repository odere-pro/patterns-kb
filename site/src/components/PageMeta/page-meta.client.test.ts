/**
 * The metadata dialog, filled from the page's own <head> at load time.
 *
 * The panel ships empty, so the interesting cases are the fill itself and the
 * fallback for a browser with no `showModal`.
 */
import { describe, expect, it } from 'vitest';

import { fixture } from '../../lib/dom-fixture';
import { init } from './page-meta.client';

/** The header copy and the mobile-menu-footer copy, as Starlight renders them. */
const MARKUP = `
  <script data-kb="page" type="application/ld+json">{"@type":"TechArticle","headline":"How it works","dateModified":"2026-08-07"}</script>
  <meta name="kb:audience" content="everyone" />
  <meta name="kb:tags" content />
  <div id="header">
    <button data-kb-meta-open></button>
    <dialog data-kb-meta-dialog id="first">
      <button data-kb-meta-close></button>
      <dl data-kb-meta-list></dl>
      <pre data-kb-meta-json><code></code></pre>
    </dialog>
  </div>
  <div id="menu">
    <button data-kb-meta-open></button>
    <dialog data-kb-meta-dialog id="second"></dialog>
  </div>
`;

function setup(markup = MARKUP) {
  const f = fixture(markup);
  const dialog = () => f.document.querySelector<HTMLDialogElement>('[data-kb-meta-dialog]');
  const clickOn = (selector: string): void => {
    f.document
      .querySelector(selector)
      ?.dispatchEvent(new f.window.MouseEvent('click', { bubbles: true }) as unknown as MouseEvent);
  };
  return { ...f, dialog, clickOn };
}

describe('the page-metadata dialog', () => {
  // The markup arrives twice because the SocialIcons override renders twice.
  // The bundle runs once, so there is no guard to lean on — the duplicate has
  // to be removed here, and the survivor moved out of the header's display:none
  // wrapper or a phone opens a modal that paints nothing and traps the page.
  it('keeps one dialog and moves it to <body>', () => {
    const f = setup();
    init(f.document);
    const all = f.document.querySelectorAll('[data-kb-meta-dialog]');
    expect(all).toHaveLength(1);
    expect(all[0]?.id).toBe('first');
    expect(all[0]?.parentElement).toBe(f.document.body);
  });

  it('opens from either button and closes from the close button', () => {
    const f = setup();
    init(f.document);
    expect(f.dialog()?.open).toBe(false);

    f.clickOn('#menu [data-kb-meta-open]');
    expect(f.dialog()?.open).toBe(true);

    f.clickOn('[data-kb-meta-close]');
    expect(f.dialog()?.open).toBe(false);
  });

  // The dialog ships empty — compiled in, its values were a second copy of the
  // JSON-LD and a third of the meta tags in every page's text. The panel is
  // filled here, from the head the page already carries.
  it('fills the list from the page’s own meta tags, marking blank values', () => {
    const f = setup();
    init(f.document);
    const dts = [...f.document.querySelectorAll('[data-kb-meta-list] dt')].map(
      (el) => el.textContent,
    );
    expect(dts).toEqual(['kb:audience', 'kb:tags', 'dateModified']);
    const dds = [...f.document.querySelectorAll('[data-kb-meta-list] dd')];
    expect(dds[0]?.textContent).toBe('everyone');
    // Prettier turns content="" into a bare attribute; both must read as none.
    expect(dds[1]?.querySelector('em')?.textContent).toBe('none');
    expect(dds[2]?.textContent).toBe('2026-08-07');
  });

  it('pretty-prints the JSON-LD block, and shows a malformed one raw', () => {
    const f = setup();
    init(f.document);
    const code = f.document.querySelector('[data-kb-meta-json] code');
    expect(code?.textContent).toContain('"headline": "How it works"');

    const g = setup(MARKUP.replace(/\{"@type"[^<]*/, 'not json'));
    init(g.document);
    expect(g.document.querySelector('[data-kb-meta-json] code')?.textContent).toBe('not json');
  });

  it('does nothing at all when the page has no dialog', () => {
    const f = setup('<button data-kb-meta-open></button>');
    expect(() => {
      init(f.document);
    }).not.toThrow();
  });
});

// A browser with no <dialog> gets the setAttribute('open') fallback, and the
// keyboard contract showModal() gives for free — Esc closes, focus moves to
// the close button, focus returns to the opener — has to be restated by hand.
describe('the no-showModal fallback', () => {
  function legacySetup() {
    const f = setup();
    init(f.document);
    // The one surviving dialog, stripped of its native methods the way a
    // pre-<dialog> browser never had them.
    Object.defineProperties(f.dialog() as HTMLDialogElement, {
      showModal: { value: undefined },
      close: { value: undefined },
    });
    const esc = (): void => {
      f.document.dispatchEvent(
        new f.window.KeyboardEvent('keydown', {
          key: 'Escape',
          bubbles: true,
        }) as unknown as KeyboardEvent,
      );
    };
    return { ...f, esc };
  }

  it('opens with focus on the close button, and Esc closes back to the opener', () => {
    const f = legacySetup();
    const opener = f.document.querySelector<HTMLElement>(
      '#header [data-kb-meta-open]',
    ) as HTMLElement;
    opener.focus();
    f.clickOn('#header [data-kb-meta-open]');
    expect(f.dialog()?.hasAttribute('open')).toBe(true);
    expect(f.document.activeElement).toBe(f.document.querySelector('[data-kb-meta-close]'));

    f.esc();
    expect(f.dialog()?.hasAttribute('open')).toBe(false);
    expect(f.document.activeElement).toBe(opener);
  });

  it('returns focus to the opener from the close button too', () => {
    const f = legacySetup();
    const opener = f.document.querySelector<HTMLElement>(
      '#header [data-kb-meta-open]',
    ) as HTMLElement;
    opener.focus();
    f.clickOn('#header [data-kb-meta-open]');
    f.clickOn('[data-kb-meta-close]');
    expect(f.dialog()?.hasAttribute('open')).toBe(false);
    expect(f.document.activeElement).toBe(opener);
  });

  it('ignores Esc while the dialog is closed', () => {
    const f = legacySetup();
    expect(() => {
      f.esc();
    }).not.toThrow();
    expect(f.dialog()?.hasAttribute('open')).toBe(false);
  });
});

describe('the dialog in the cases the markup can still produce', () => {
  const click = (f: ReturnType<typeof setup>, target: EventTarget, x = 0, y = 0): void => {
    target.dispatchEvent(
      new f.window.MouseEvent('click', {
        bubbles: true,
        clientX: x,
        clientY: y,
      }) as unknown as Event,
    );
  };

  it('lists the meta tags when the page carries no JSON-LD block, and leaves the code area empty', () => {
    const f = setup(MARKUP.replace(/<script[^]*?<\/script>/, ''));
    init(f.document);
    expect(
      [...f.document.querySelectorAll('[data-kb-meta-list] dt')].map((e) => e.textContent),
    ).toEqual(['kb:audience', 'kb:tags']);
    expect(f.document.querySelector('[data-kb-meta-json] code')?.textContent).toBe('');
  });

  it('leaves out dateModified when the block has none', () => {
    const f = setup(MARKUP.replace(',"dateModified":"2026-08-07"', ''));
    init(f.document);
    const names = [...f.document.querySelectorAll('[data-kb-meta-list] dt')].map(
      (e) => e.textContent,
    );
    expect(names).not.toContain('dateModified');
  });

  it('opens a dialog that has neither list nor code area without failing', () => {
    const f = setup(
      '<button data-kb-meta-open></button><dialog data-kb-meta-dialog><button data-kb-meta-close></button></dialog>',
    );
    expect(() => {
      init(f.document);
    }).not.toThrow();
    f.clickOn('[data-kb-meta-open]');
    expect(f.dialog()?.open).toBe(true);
  });

  it('ignores a click whose target is not an element', () => {
    const f = setup();
    init(f.document);
    f.clickOn('[data-kb-meta-open]');
    click(f, f.document);
    expect(f.dialog()?.open).toBe(true);
  });

  it('closes on a click outside the panel and stays open on one inside it', () => {
    const f = setup();
    init(f.document);
    f.clickOn('[data-kb-meta-open]');
    const dialog = f.dialog() as HTMLDialogElement;
    dialog.getBoundingClientRect = () =>
      ({ left: 10, right: 100, top: 10, bottom: 100 }) as unknown as DOMRect;
    click(f, dialog, 50, 50);
    expect(dialog.open).toBe(true);
    click(f, dialog, 500, 50);
    expect(dialog.open).toBe(false);
    f.clickOn('[data-kb-meta-open]');
    click(f, dialog, 50, 500);
    expect(dialog.open).toBe(false);
  });

  it('ignores any key but Escape in the fallback, and Escape while the native dialog is in charge', () => {
    const f = setup();
    init(f.document);
    const key = (k: string): void => {
      f.document.dispatchEvent(
        new f.window.KeyboardEvent('keydown', {
          key: k,
          bubbles: true,
        }) as unknown as KeyboardEvent,
      );
    };
    f.clickOn('[data-kb-meta-open]');
    key('Escape');
    expect(f.dialog()?.open).toBe(true);

    const g = setup();
    init(g.document);
    Object.defineProperties(g.dialog() as HTMLDialogElement, {
      showModal: { value: undefined },
      close: { value: undefined },
    });
    g.clickOn('[data-kb-meta-open]');
    g.document.dispatchEvent(
      new g.window.KeyboardEvent('keydown', {
        key: 'a',
        bubbles: true,
      }) as unknown as KeyboardEvent,
    );
    expect(g.dialog()?.hasAttribute('open')).toBe(true);
  });

  it('does not close a native-less dialog on an outside click', () => {
    const g = setup();
    init(g.document);
    const dialog = g.dialog() as HTMLDialogElement;
    Object.defineProperties(dialog, {
      showModal: { value: undefined },
      close: { value: undefined },
    });
    dialog.getBoundingClientRect = () =>
      ({ left: 10, right: 100, top: 10, bottom: 100 }) as unknown as DOMRect;
    g.clickOn('[data-kb-meta-open]');
    click(g, dialog, 500, 50);
    expect(dialog.hasAttribute('open')).toBe(true);
  });
});
