// Zoom, fit, pan and fullscreen for the mermaid figures the rehype wrapper in
// astro.config.mjs builds. The markup is server rendered; this only attaches
// behaviour, so a diagram is readable with no JavaScript at all, just not
// interactive.
//
// Ships inside the one kb bundle (src/client/index.ts) as a classic script —
// an ES module never executes from file://, and these pages are meant to open
// by double-click.

const MIN = 0.4;
const MAX = 6;
const STEP = 1.25;

// Below this width (the layout's pinned-navigation breakpoint) a diagram scrolls inside its canvas rather than shrinking,
// and its labels are held at READABLE_PX (diagram-tools.css).
const NARROW = '(max-width: 75.99rem)';
const READABLE_PX = 11;
// Mermaid draws its labels at 16 user units when the SVG names no size.
const LABEL_UNITS = 16;

interface Box {
  width: number;
  height: number;
}

function setup(fig: HTMLElement, view: Window): void {
  const stage = fig.querySelector<HTMLElement>('[data-kb-diagram-stage]');
  const canvas = fig.querySelector<HTMLElement>('[data-kb-diagram-canvas]');
  if (!stage || !canvas) return;

  let z = 1;
  let x = 0;
  let y = 0;
  let dragging = false;
  let lastX = 0;
  let lastY = 0;

  // Every helper below is a const arrow rather than a `function` declaration
  // on purpose: a hoisted declaration is type-checked without the narrowing the
  // guard above just did, so `stage` and `canvas` would read as possibly null
  // inside each one.
  //
  // The canvas' usable box, inside its padding.
  const frame = (): Box => {
    const cs = view.getComputedStyle(canvas);
    return {
      width: canvas.clientWidth - parseFloat(cs.paddingLeft) - parseFloat(cs.paddingRight),
      height: canvas.clientHeight - parseFloat(cs.paddingTop) - parseFloat(cs.paddingBottom),
    };
  };

  const paint = (): void => {
    // Vertical centring lives here rather than in a flex rule, and it is
    // one subtraction: scaling happens about the stage's own centre, so
    // the diagram is centred in the frame exactly when the two centres
    // coincide. x and y stay pure pan offsets the reader controls.
    const offsetY = (frame().height - stage.offsetHeight) / 2;
    stage.style.transform = `translate(${x}px, ${y + offsetY}px) scale(${z})`;
  };

  // The DIAGRAM's layout size — the svg, not the stage. The stage is a
  // full-width block, so measuring it made fit()'s width ratio exactly 1
  // and fit could only ever shrink; in fullscreen that left a small
  // diagram alone in an empty screen. The svg cannot be measured with
  // getBoundingClientRect (the ancestor transform, mid-transition, would
  // leak into the reading), so its layout box is derived: width is 100%
  // of the stage capped by the max-width mermaid sets, height follows
  // from the viewBox's aspect ratio.
  const natural = (): Box => {
    const svg = stage.querySelector('svg');
    if (!svg) return { width: stage.offsetWidth, height: stage.offsetHeight };
    const maxW = parseFloat(svg.style?.maxWidth ?? '') || Infinity;
    const w = Math.min(stage.offsetWidth, maxW);
    const vb = svg.viewBox?.baseVal;
    const h = vb && vb.width > 0 ? (w * vb.height) / vb.width : stage.offsetHeight;
    return { width: w, height: h };
  };

  const fit = (): void => {
    const f = frame();
    const n = natural();
    if (!n.width || !n.height || f.width <= 0 || f.height <= 0) return;
    x = 0;
    y = 0;
    // No MIN here, deliberately: MIN bounds the zoom-out button, but fit
    // means the whole diagram, and a diagram 3× taller than the frame
    // needs whatever scale that takes.
    z = Math.min(MAX, Math.min(f.width / n.width, f.height / n.height));
    paint();
  };

  const narrow = (): boolean => view.matchMedia?.(NARROW).matches === true;

  // The stage width at which the drawing's labels come to READABLE_PX: the
  // viewBox width scaled by the ratio of that size to the label's own, which
  // is read from the first label when the SVG has one.
  const readableWidth = (): number => {
    const svg = stage.querySelector('svg');
    const vb = svg?.viewBox?.baseVal;
    if (!svg || !vb || vb.width <= 0) return 0;
    const label = svg.querySelector('.nodeLabel, .messageText, text');
    const units = (label && parseFloat(view.getComputedStyle(label).fontSize)) || LABEL_UNITS;
    return Math.ceil((vb.width * READABLE_PX) / units);
  };

  // Sets the custom property the stylesheet's narrow-width rule reads; a viewport
  // above that width needs none.
  const sizeStage = (): void => {
    const width = narrow() ? readableWidth() : 0;
    if (width > 0) stage.style.setProperty('--kb-diagram-min', `${width}px`);
    else stage.style.removeProperty('--kb-diagram-min');
  };

  const zoomTo = (next: number): void => {
    const clamped = Math.min(MAX, Math.max(MIN, next));
    if (clamped === z) return;
    // Keep the centre of the viewport fixed while scaling.
    const k = clamped / z;
    x = x * k;
    y = y * k;
    z = clamped;
    paint();
  };

  fig.addEventListener('click', (ev) => {
    const target = ev.target as Element | null;
    const btn = target?.closest?.<HTMLElement>('[data-kb-diagram-act]');
    if (!btn) return;
    const act = btn.dataset.kbDiagramAct;
    if (act === 'in') zoomTo(z * STEP);
    else if (act === 'out') zoomTo(z / STEP);
    else if (act === 'fit') fit();
    else if (act === 'full') {
      if (fig.ownerDocument.fullscreenElement === fig) void fig.ownerDocument.exitFullscreen();
      else if (fig.requestFullscreen) void fig.requestFullscreen();
    }
  });

  // iOS Safari has no Element.requestFullscreen — a button that can never
  // do anything is worse than no button.
  const fullBtn = fig.querySelector<HTMLElement>('[data-kb-diagram-act="full"]');
  if (fullBtn && !fig.requestFullscreen) fullBtn.style.display = 'none';

  // Ctrl/Cmd + wheel zooms; a bare wheel must still scroll the page, or a
  // diagram becomes a trap you cannot scroll past on a laptop.
  canvas.addEventListener(
    'wheel',
    (ev) => {
      if (!ev.ctrlKey && !ev.metaKey) return;
      ev.preventDefault();
      zoomTo(z * (ev.deltaY < 0 ? STEP : 1 / STEP));
    },
    { passive: false },
  );

  // The keyboard path to everything the pointer can do. Bound on the canvas —
  // never the document — so the keys act only while the canvas has focus
  // (the markup gives it tabindex="0" and an aria-label naming these keys, in
  // figureFor in astro.config.mjs). A chord held with Ctrl/Alt/Meta is the
  // browser's, not the canvas's: Cmd+plus must keep zooming the page.
  canvas.addEventListener('keydown', (ev) => {
    if (ev.ctrlKey || ev.altKey || ev.metaKey) return;
    const pan = ev.shiftKey ? 120 : 24;
    // Arrows follow scrolling: ArrowRight brings the right-hand side of the
    // diagram into view, the way it would in a scroll container.
    if (ev.key === 'ArrowLeft') x += pan;
    else if (ev.key === 'ArrowRight') x -= pan;
    else if (ev.key === 'ArrowUp') y += pan;
    else if (ev.key === 'ArrowDown') y -= pan;
    else if (ev.key === '+' || ev.key === '=') {
      zoomTo(z * STEP);
      ev.preventDefault();
      return;
    } else if (ev.key === '-' || ev.key === '_') {
      zoomTo(z / STEP);
      ev.preventDefault();
      return;
    } else if (ev.key === '0') {
      x = 0;
      y = 0;
      z = 1;
    } else if (ev.key === 'f' || ev.key === 'F') {
      fit();
      ev.preventDefault();
      return;
    } else return;
    ev.preventDefault();
    paint();
  });

  canvas.addEventListener('pointerdown', (ev) => {
    if (ev.button !== 0) return;
    // Without this, a mouse drag also starts a text selection and smears
    // it across the SVG labels while panning.
    ev.preventDefault();
    dragging = true;
    lastX = ev.clientX;
    lastY = ev.clientY;
    canvas.setPointerCapture(ev.pointerId);
    fig.dataset.grabbing = 'true';
  });
  canvas.addEventListener('pointermove', (ev) => {
    if (!dragging) return;
    x += ev.clientX - lastX;
    y += ev.clientY - lastY;
    lastX = ev.clientX;
    lastY = ev.clientY;
    paint();
  });
  const stop = (ev: PointerEvent): void => {
    if (!dragging) return;
    dragging = false;
    if (canvas.hasPointerCapture(ev.pointerId)) canvas.releasePointerCapture(ev.pointerId);
    fig.dataset.grabbing = 'false';
  };
  canvas.addEventListener('pointerup', stop);
  canvas.addEventListener('pointercancel', stop);

  // Entering or leaving fullscreen changes the frame completely; refit so
  // the whole diagram uses the space it just gained or lost, and keep the
  // one toggle button's label honest for assistive tech — the icon swap
  // is CSS and a screen reader never sees it.
  fig.addEventListener('fullscreenchange', () => {
    const active = fig.ownerDocument.fullscreenElement === fig;
    if (fullBtn) {
      fullBtn.title = active ? 'Exit fullscreen' : 'Fullscreen';
      fullBtn.setAttribute('aria-label', fullBtn.title);
    }
    fit();
  });

  // A diagram taller than its frame would otherwise have its foot hidden
  // behind a scroll nobody knows to perform, so start fitted when it does
  // not already fit. A diagram that fits is left at actual size — shrinking
  // readable text to fill a rule helps nobody.
  //
  // Deferred to `load`, not DOMContentLoaded: web fonts land in between and
  // change how tall a diagram is, and a fit computed before they arrive is
  // a scale nothing on screen justifies. The bundle is `defer`, so the DOM
  // is ready — the fonts are the reason this one wait survives.
  //
  // At those widths the canvas scrolls instead, so the labels stay readable.
  const initialFit = (): void => {
    sizeStage();
    if (!narrow() && natural().height > frame().height + 1) fit();
    else paint();
  };
  sizeStage();
  paint();
  if (fig.ownerDocument.readyState === 'complete') initialFit();
  else view.addEventListener('load', initialFit, { once: true });

  // A viewport resize changes both the frame and the diagram's own layout
  // height; without repainting, the centring offset is stale and the
  // diagram sits low or high in its frame.
  view.addEventListener('resize', () => {
    sizeStage();
    paint();
  });
}

export function init(doc: Document): void {
  const view = doc.defaultView;
  if (!view) return;
  for (const fig of doc.querySelectorAll<HTMLElement>('[data-kb-diagram]')) setup(fig, view);
}
