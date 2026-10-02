// The "what a machine reads here" dialog: open, close, the one piece of DOM
// surgery the markup needs — and the panel's content, built here from the
// page's own <head>.
//
// Starlight renders the SocialIcons override twice — in the header and again
// in the mobile menu footer — so this component's *markup* arrives twice. The
// bundle only loads once, so there is no run-once guard here; the duplicated
// markup is a separate problem and the fix below is still required.

/**
 * Fill the empty panel from the page itself: the kb:* meta tags become the
 * definition list, the JSON-LD block is pretty-printed below it. The markup
 * ships none of this — compiled in, it was a second copy of the JSON-LD and a
 * third of the meta values in the page text of every page. Reading the head at
 * runtime keeps the page layer single-sourced and makes the panel honest by
 * construction: it can only show what the page actually carries.
 */
function fill(doc: Document, dialog: HTMLDialogElement): void {
  const list = dialog.querySelector('[data-kb-meta-list]');
  const json = dialog.querySelector('[data-kb-meta-json] code');
  const block = doc.querySelector('script[data-kb="page"]');

  let page: Record<string, unknown> | null = null;
  try {
    page = JSON.parse(block?.textContent ?? '') as Record<string, unknown>;
  } catch {
    // A malformed block is still worth showing — raw, below.
  }

  if (list) {
    const add = (name: string, value: string): void => {
      const dt = doc.createElement('dt');
      dt.textContent = name;
      const dd = doc.createElement('dd');
      // Prettier rewrites content="" to a bare `content` attribute; both read
      // back as the empty string here, which is why this never checks quoting.
      if (value === '') dd.appendChild(doc.createElement('em')).textContent = 'none';
      else dd.textContent = value;
      list.append(dt, dd);
    };
    for (const tag of doc.querySelectorAll('meta[name^="kb:"]')) {
      add(tag.getAttribute('name') ?? '', tag.getAttribute('content') ?? '');
    }
    if (typeof page?.dateModified === 'string') add('dateModified', page.dateModified);
  }

  if (json && block) {
    json.textContent = page ? JSON.stringify(page, null, 2) : (block.textContent ?? '').trim();
  }
}

export function init(doc: Document): void {
  // Keep ONE dialog, moved to <body>: a modal opened inside the header's
  // display:none wrapper (any phone) would paint nothing while still making
  // the whole page inert, with no Esc key to escape.
  const dialogs = doc.querySelectorAll<HTMLDialogElement>('[data-kb-meta-dialog]');
  const dialog = dialogs[0];
  if (!dialog) return;
  for (let i = 1; i < dialogs.length; i += 1) dialogs[i].remove();
  doc.body.appendChild(dialog);
  fill(doc, dialog);

  // The setAttribute('open') fallback below exists for a browser with no
  // <dialog> support, and native showModal()'s keyboard contract — Esc closes,
  // focus moves in, focus returns to the opener — has to be restated by hand
  // for it. The showModal path gets none of this: the browser already does it.
  let opener: HTMLElement | null = null;
  const fallbackClose = (): void => {
    dialog.removeAttribute('open');
    opener?.focus();
    opener = null;
  };

  doc.addEventListener('click', (ev) => {
    const t = ev.target as Element | null;
    if (!t?.closest) return;
    const openBtn = t.closest<HTMLElement>('[data-kb-meta-open]');
    if (openBtn) {
      if (dialog.showModal) dialog.showModal();
      else {
        opener = openBtn;
        dialog.setAttribute('open', '');
        dialog.querySelector<HTMLElement>('[data-kb-meta-close]')?.focus();
      }
    } else if (t.closest('[data-kb-meta-close]')) {
      if (dialog.close) dialog.close();
      else fallbackClose();
    } else if (t === dialog) {
      // Only a genuine backdrop click: a click on the dialog's own padding
      // also targets the element, so check the point against the panel's box
      // before treating it as "outside".
      const r = dialog.getBoundingClientRect();
      const outside =
        ev.clientX < r.left || ev.clientX > r.right || ev.clientY < r.top || ev.clientY > r.bottom;
      if (outside && dialog.close) dialog.close();
    }
  });

  doc.addEventListener('keydown', (ev) => {
    if (ev.key !== 'Escape') return;
    // Native <dialog> closes itself on Esc; acting here too would race it.
    if (typeof dialog.showModal === 'function') return;
    if (dialog.hasAttribute('open')) fallbackClose();
  });
}
