// Opening a page shows you where you are in the left sidebar.
//
// The nav is one scroll box holding every page on the site, and it starts at
// the top on every load. A reader deep in `docs/runbooks/` therefore lands on
// a list whose visible part is the section they left — the entry marked
// `aria-current="page"` is below the fold, so the one thing the sidebar exists
// to tell them is the one thing they cannot see. This brings it into the box.
//
// The pane is scrolled directly rather than through `scrollIntoView`: that
// call moves every scrollable ancestor it needs to, and the outermost one is
// the document, so on a page opened at a `#heading` it would scroll the
// reader away from the heading they came for. Setting `scrollTop` on the pane
// touches the pane and nothing else.

/**
 * Starlight's sidebar pane — the element carrying `overflow-y: auto`. The id
 * is the same one the menu button's `aria-controls` points at, so a Starlight
 * upgrade that renamed it would break the phone menu first and loudly.
 */
const PANE = 'starlight__sidebar';

export function init(doc: Document): void {
  const pane = doc.getElementById(PANE);
  if (!pane) return;

  const current = pane.querySelector<HTMLElement>('a[aria-current="page"]');
  if (!current) return;

  // A sidebar shorter than its box has nothing below the fold, and an
  // unrendered one — a test's document, a pane the browser has not laid out —
  // reports the same thing. Both mean "no scroll to make".
  if (pane.scrollHeight <= pane.clientHeight) return;

  const paneBox = pane.getBoundingClientRect();
  const linkBox = current.getBoundingClientRect();
  // Already in the box: leave the scroll position alone. Moving a sidebar that
  // was showing the right thing anyway is a jump the reader did not ask for.
  if (linkBox.top >= paneBox.top && linkBox.bottom <= paneBox.bottom) return;

  // Centred, not brought to the nearest edge. On arrival the entries around
  // the current page are the context — its siblings above and below — and an
  // entry parked against the top or bottom edge shows only half of them.
  //
  // No clamping of our own: a browser clamps an assigned `scrollTop` to the
  // scrollable range, so the last entry of a long nav — which cannot be
  // centred, there is no scroll below it — lands at the bottom of the box.
  const offset = pane.scrollTop + (linkBox.top - paneBox.top);
  pane.scrollTop = offset - (pane.clientHeight - linkBox.height) / 2;
}
