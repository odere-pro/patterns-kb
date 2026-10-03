// Putting a command on the clipboard, from wherever the page shows one.
//
// Two kinds of source, one handler. `.kb-copyable` is this site's own chip,
// where the text is the chip's own — read back out of the DOM rather than
// duplicated into an attribute. `.expressive-code .copy button` is upstream's
// button on a fenced code block: it renders on every code-block page and its
// behaviour is an ES module, which never runs from file://, so on a downloaded
// copy of the site it is a control that does nothing. Driving it from the kb
// bundle is the same move this repo already made for Starlight's theme dropdown
// and mobile drawer.
//
// The clipboard API is the primary path on both protocols. `file://` is a
// potentially-trustworthy origin, so `isSecureContext` is true there and
// `navigator.clipboard` is defined — the execCommand path below is for engines
// that disagree, not for the offline case.

/** How long the button wears its confirmation before going back. */
const FEEDBACK_MS = 2000;

/** What the note reads, and what upstream's button falls back to. */
const COPIED = 'Copied';

/**
 * Expressive-code joins the lines of a sample with U+007F rather than a
 * newline, because the value rides in an HTML attribute. Copying the attribute
 * without translating it hands the reader one run-on line.
 *
 * Built from its code point on purpose: the character is unprintable, so a
 * literal here would be an empty-looking pair of quotes nobody could review,
 * and a stray edit could delete it without changing how the line reads.
 */
const EC_LINE_SEPARATOR = String.fromCharCode(0x7f);

/**
 * Every element a click may land on, and be a request to copy.
 *
 * `data-kb-copy` rather than `.kb-copyable`: a behaviour hook is an attribute
 * and a class is for styling, so a reader can tell the two apart
 * (page-schema.md). Upstream's button is matched by its own markup, which this
 * repo does not own and cannot stamp.
 */
const SOURCES = '[data-kb-copy], .expressive-code .copy button';

/**
 * The text a source stands for.
 *
 * Upstream's button carries its sample in `data-code`. This site's chip carries
 * it as text, and that text arrives whitespace-formatted: `site/dist` is
 * pretty-printed, so a table cell reads `"\n<thirty-four spaces>/plugin install
 * core@kb\n<twenty-eight spaces>"`. Collapsing the runs and trimming is what
 * turns it back into the one line the reader meant to copy — which is safe here
 * and only here, because a chip holds a single command. A multi-line sample
 * comes from `data-code`, where its newlines are explicit.
 */
const textOf = (source: Element): string | null => {
  const code = source.getAttribute('data-code');
  if (code !== null) return code.split(EC_LINE_SEPARATOR).join('\n');
  const chip = source.querySelector('.kb-code-chip');
  const text = chip?.textContent?.replace(/\s+/g, ' ').trim();
  return text ? text : null;
};

/**
 * Write to the clipboard, and say whether it worked.
 *
 * The fallback runs a temporary off-screen textarea through `execCommand`,
 * which is the only path an engine without the clipboard API has. It is
 * `readonly` so a mobile keyboard does not open over the page, and positioned
 * rather than hidden because `display: none` cannot hold a selection.
 */
const write = async (doc: Document, view: Window, text: string): Promise<boolean> => {
  try {
    await view.navigator.clipboard.writeText(text);
    return true;
  } catch {
    /* no clipboard API, or the write was refused — fall through */
  }
  try {
    const field = doc.createElement('textarea');
    field.value = text;
    field.setAttribute('readonly', '');
    field.style.setProperty('position', 'fixed');
    field.style.setProperty('top', '-9999px');
    doc.body.appendChild(field);
    field.select();
    // `execCommand` is deprecated, and still the only copy an engine without
    // the clipboard API has. Called through this narrower type, so the
    // typecheck does not flag a fallback that is deliberate.
    const legacy: { execCommand(command: 'copy'): boolean } = doc;
    const ok = legacy.execCommand('copy');
    field.remove();
    return ok;
  } catch {
    return false;
  }
};

/**
 * Say it worked, twice: once where a reader can see it and once where a screen
 * reader can hear it.
 *
 * `data-state` is what the stylesheet swaps the icon on. The note is this
 * component's own `role="status"`; upstream's button brings its own `aria-live`
 * region and its own wording in `data-copied`, so that one is filled instead of
 * a second being added beside it.
 */
const confirm = (view: Window, source: Element): void => {
  const host = source.closest('[data-kb-copy]') ?? source;
  host.setAttribute('data-state', 'copied');

  const note =
    host.querySelector('.kb-copy-note') ?? source.parentElement?.querySelector('[aria-live]');
  const said = source.getAttribute('data-copied') ?? COPIED;
  if (note) note.textContent = said;

  view.setTimeout(() => {
    host.removeAttribute('data-state');
    if (note) note.textContent = '';
  }, FEEDBACK_MS);
};

export function init(doc: Document): void {
  const view = doc.defaultView;
  if (!view) return;

  doc.addEventListener('click', (ev) => {
    const target = ev.target as Element | null;
    const source = target?.closest?.(SOURCES);
    if (!source) return;

    const text = textOf(source);
    if (text === null) return;

    // Upstream's own module may also be listening where it managed to load.
    // Both writing the same text is harmless; both announcing is not.
    ev.preventDefault();

    void write(doc, view, text).then((ok) => {
      if (ok) confirm(view, source);
    });
  });
}
