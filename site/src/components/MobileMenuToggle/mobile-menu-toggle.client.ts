// The phone menu, ported from Starlight's MobileMenuToggle module — the ~20
// lines that, left as an external module, leave the button dead on a
// downloaded folder. Faithful to upstream in everything that shows:
// `data-kb-menu-open`
// on the root drives the sidebar-pane sibling selector and this component's own
// styles; `data-mobile-menu-expanded` on <body> drives the scroll lock; `inert`
// on the frame and skip link traps focus inside the open menu.
//
// The root's state attribute is a data hook and not upstream's `aria-expanded`,
// because a bare <div> is `role="generic"` and ARIA allows no `aria-expanded`
// there — see MobileMenuToggle.astro. The <button> is where the ARIA belongs
// and where it stayed: it is the element assistive technology reports.
export function init(doc: Document): void {
  for (const root of doc.querySelectorAll<HTMLElement>('[data-kb-menu-button]')) {
    const btn = root.querySelector<HTMLButtonElement>('button');
    if (!btn) continue;

    const setExpanded = (expanded: boolean): void => {
      root.setAttribute('data-kb-menu-open', String(expanded));
      btn.setAttribute('aria-expanded', String(expanded));
      doc.body.toggleAttribute('data-mobile-menu-expanded', expanded);
      for (const el of doc.querySelectorAll<HTMLElement>('.main-frame, .sl-skip-link')) {
        el.toggleAttribute('inert', expanded);
      }
    };

    btn.addEventListener('click', () => {
      setExpanded(root.getAttribute('data-kb-menu-open') !== 'true');
    });

    // Close from anywhere in the open menu with Escape, like upstream.
    root.closest('nav')?.addEventListener('keyup', (ev) => {
      if (ev.code === 'Escape') {
        setExpanded(false);
        btn.focus();
      }
    });

    // Reset when the viewport crosses into desktop, where the button hides.
    doc.defaultView
      ?.matchMedia('(min-width: 50em)')
      .addEventListener('change', () => setExpanded(false));
  }
}
