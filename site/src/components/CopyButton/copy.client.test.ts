/**
 * What lands on the clipboard, and what the reader is told.
 *
 * The cases that matter here are all about the *value*, because the defect this
 * module exists for is not "there is no button" but "the text you get is not
 * the text you wanted": `site/dist` is pretty-printed, so a chip's textContent
 * arrives wrapped in the formatter's newlines and indentation, and
 * expressive-code joins the lines of a sample with U+007F rather than `\n`.
 *
 * happy-dom ships neither `navigator.clipboard` nor a working `execCommand`, so
 * both are stubbed — which is also how the fallback path gets covered, by
 * making the first one reject.
 */
import { describe, expect, it } from 'vitest';

import { fixture } from '../../lib/dom-fixture';

import { init } from './copy.client';

/** U+007F, expressive-code's line separator. Built, not typed: it is invisible. */
const SEP = String.fromCharCode(0x7f);

/** The chip as the formatter leaves it in `dist` — newlines, deep indentation. */
const MARKUP = `
  <span class="kb-copyable" data-kb-copy>
    <code class="kb-code-chip">
                                  /plugin install core@kb
                                </code>
    <button type="button" class="kb-copy" aria-label="Copy /plugin install core@kb"></button>
    <span class="kb-copy-note kb-visually-hidden" role="status"></span>
  </span>
  <div class="expressive-code">
    <div class="copy">
      <div aria-live="polite"></div>
      <button data-copied="Copied!" data-code="one${SEP}two"></button>
    </div>
  </div>
`;

interface Setup {
  document: Document;
  window: Window & typeof globalThis;
  written: string[];
  /** Run whatever the module scheduled — see `elapse` below. */
  elapse: () => void;
}

function setup({ clipboardFails = false } = {}): Setup {
  const f = fixture(MARKUP);
  const written: string[] = [];
  // The module schedules its revert on `doc.defaultView.setTimeout`, and the
  // fixture's window is happy-dom's own — a different object from the global
  // vitest's fake timers replace, so faking them here would leave the callback
  // pending forever. Capturing it is both faster and more exact than waiting
  // two real seconds for it.
  const scheduled: Array<() => void> = [];
  Object.defineProperty(f.window, 'setTimeout', {
    configurable: true,
    value: (fn: () => void) => {
      scheduled.push(fn);
      return 0;
    },
  });
  const elapse = (): void => {
    for (const fn of scheduled.splice(0)) fn();
  };
  Object.defineProperty(f.window.navigator, 'clipboard', {
    configurable: true,
    value: {
      writeText: (text: string) => {
        if (clipboardFails) return Promise.reject(new Error('denied'));
        written.push(text);
        return Promise.resolve();
      },
    },
  });
  // happy-dom has no execCommand; the fallback needs one that reports success
  // and a way to see what it would have copied.
  Object.defineProperty(f.document, 'execCommand', {
    configurable: true,
    value: () => {
      const field = f.document.querySelector('textarea');
      if (field) written.push(field.value);
      return true;
    },
  });
  init(f.document);
  return { ...(f as unknown as Setup), written, elapse };
}

const click = (s: Setup, selector: string): void => {
  s.document
    .querySelector(selector)
    ?.dispatchEvent(new s.window.MouseEvent('click', { bubbles: true }));
};

const settle = (): Promise<void> => new Promise((r) => setTimeout(r, 0));

describe('copying a command', () => {
  it('copies the command alone, without the whitespace the formatter left round it', async () => {
    // The whole reason this module reads the DOM and normalises rather than
    // trusting textContent: `dist` is pretty-printed, so the raw text is
    // "\n<spaces>/plugin install core@kb\n<spaces>".
    const s = setup();
    click(s, '.kb-copy');
    await settle();
    expect(s.written).toEqual(['/plugin install core@kb']);
  });

  it('turns expressive-code U+007F separators back into real newlines', async () => {
    // Upstream puts the sample in an HTML attribute, which cannot hold a
    // newline, so it substitutes U+007F. Copying the attribute as-is hands the
    // reader one run-on line that does not run.
    const s = setup();
    click(s, '.expressive-code button');
    await settle();
    expect(s.written).toEqual(['one\ntwo']);
    expect(s.written[0]).not.toContain(SEP);
  });

  it('falls back to execCommand when the clipboard API refuses', async () => {
    const s = setup({ clipboardFails: true });
    click(s, '.kb-copy');
    await settle();
    expect(s.written).toEqual(['/plugin install core@kb']);
    // The temporary field is cleaned up, never left in the page.
    expect(s.document.querySelector('textarea')).toBeNull();
  });

  it('copies from a click on the chip, not only on the button', async () => {
    // The command is the obvious thing to click, and it is a much bigger
    // target than the button beside it.
    const s = setup();
    click(s, '.kb-code-chip');
    await settle();
    expect(s.written).toEqual(['/plugin install core@kb']);
  });

  it('confirms in both channels, and takes the confirmation back', async () => {
    const s = setup();
    click(s, '.kb-copy');
    await settle();

    const host = s.document.querySelector('.kb-copyable');
    expect(host?.getAttribute('data-state')).toBe('copied');
    expect(s.document.querySelector('.kb-copy-note')?.textContent).toBe('Copied');

    s.elapse();
    expect(host?.getAttribute('data-state')).toBeNull();
    expect(s.document.querySelector('.kb-copy-note')?.textContent).toBe('');
  });

  it("fills expressive-code's own live region, with its own wording", async () => {
    // Upstream ships an aria-live div and a data-copied string. Adding a second
    // live region beside them would announce the same event twice.
    const s = setup();
    click(s, '.expressive-code button');
    await settle();
    expect(s.document.querySelector('.expressive-code [aria-live]')?.textContent).toBe('Copied!');
  });

  it('ignores a click that is not on a command', async () => {
    const s = setup();
    click(s, '.expressive-code');
    await settle();
    expect(s.written).toEqual([]);
  });

  it('ignores a chip that holds no text', async () => {
    const s = setup();
    s.document.querySelector('.kb-code-chip')!.textContent = '   ';
    click(s, '.kb-copy');
    await settle();
    expect(s.written).toEqual([]);
  });

  it('ignores a copyable with no chip and no data-code', async () => {
    const s = setup();
    s.document.body.insertAdjacentHTML('beforeend', '<span data-kb-copy id="bare"></span>');
    click(s, '#bare');
    await settle();
    expect(s.written).toEqual([]);
  });

  it('copies, but announces nowhere, when the source has no note', async () => {
    const s = setup();
    s.document.body.insertAdjacentHTML(
      'beforeend',
      '<button data-kb-copy id="lone" data-code="solo"></button>',
    );
    click(s, '#lone');
    await settle();
    expect(s.written).toEqual(['solo']);
    expect(s.document.querySelector('#lone')?.getAttribute('data-state')).toBe('copied');
    s.elapse();
    expect(s.document.querySelector('#lone')?.hasAttribute('data-state')).toBe(false);
  });

  it('stays silent when neither the clipboard nor execCommand works', async () => {
    const s = setup({ clipboardFails: true });
    Object.defineProperty(s.document, 'execCommand', {
      configurable: true,
      value: () => false,
    });
    click(s, '.kb-copy');
    await settle();
    expect(s.document.querySelector('.kb-copyable')?.hasAttribute('data-state')).toBe(false);
    Object.defineProperty(s.document, 'execCommand', {
      configurable: true,
      value: () => {
        throw new Error('no');
      },
    });
    click(s, '.kb-copy');
    await settle();
    expect(s.document.querySelector('.kb-copyable')?.hasAttribute('data-state')).toBe(false);
  });

  it('does nothing for a document that has no window', () => {
    const f = fixture(MARKUP);
    Object.defineProperty(f.document, 'defaultView', { configurable: true, value: null });
    expect(() => {
      init(f.document);
    }).not.toThrow();
  });
});
