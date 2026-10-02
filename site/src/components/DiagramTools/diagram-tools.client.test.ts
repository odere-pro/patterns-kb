/**
 * Pan, zoom and the keyboard path into a rendered diagram.
 *
 * The canvas is the only thing bound, so the two halves worth asserting are
 * that a pointer gesture moves the diagram and that the same move is reachable
 * from the keyboard without stealing a browser chord.
 */
import { describe, expect, it } from 'vitest';

import { fixture } from '../../lib/dom-fixture';
import { init } from './diagram-tools.client';

const MARKUP = `
  <figure data-kb-diagram>
    <div class="kb-diagram-toolbar">
      <button data-kb-diagram-act="out"></button>
      <button data-kb-diagram-act="in"></button>
      <button data-kb-diagram-act="fit"></button>
      <button data-kb-diagram-act="full"></button>
    </div>
    <div data-kb-diagram-canvas>
      <div data-kb-diagram-stage><svg viewBox="0 0 400 200"></svg></div>
    </div>
  </figure>
`;

/**
 * happy-dom computes no layout: clientWidth, offsetHeight and the padding are
 * all zero. The module is arithmetic over those numbers, so the frame and the
 * stage are given sizes — a 800×400 frame around a 400×200 diagram — and the
 * transform it writes is the observable answer.
 */
function setup() {
  const f = fixture(MARKUP);
  const canvas = f.document.querySelector<HTMLElement>('[data-kb-diagram-canvas]');
  const stage = f.document.querySelector<HTMLElement>('[data-kb-diagram-stage]');
  Object.defineProperties(canvas as HTMLElement, {
    clientWidth: { value: 800 },
    clientHeight: { value: 400 },
  });
  Object.defineProperties(stage as HTMLElement, {
    offsetWidth: { value: 400 },
    offsetHeight: { value: 200 },
  });
  Object.defineProperty(f.window, 'getComputedStyle', {
    configurable: true,
    value: () => ({
      paddingLeft: '0px',
      paddingRight: '0px',
      paddingTop: '0px',
      paddingBottom: '0px',
    }),
  });
  const press = (act: string): void => {
    f.document
      .querySelector(`[data-kb-diagram-act="${act}"]`)
      ?.dispatchEvent(new f.window.MouseEvent('click', { bubbles: true }) as unknown as MouseEvent);
  };
  // Not the DOM lib's KeyboardEventInit: its `view` clashes with happy-dom's.
  const key = (
    k: string,
    opts: { shiftKey?: boolean; ctrlKey?: boolean; altKey?: boolean; metaKey?: boolean } = {},
  ): void => {
    canvas?.dispatchEvent(
      new f.window.KeyboardEvent('keydown', {
        key: k,
        bubbles: true,
        cancelable: true,
        ...opts,
      }) as unknown as KeyboardEvent,
    );
  };
  const scale = (): number =>
    Number(/scale\(([\d.]+)\)/.exec(stage?.style.transform ?? '')?.[1] ?? NaN);
  const shift = (): { x: number; y: number } => {
    const m = /translate\((-?[\d.]+)px, (-?[\d.]+)px\)/.exec(stage?.style.transform ?? '');
    return { x: Number(m?.[1] ?? NaN), y: Number(m?.[2] ?? NaN) };
  };
  return { ...f, press, key, scale, shift, stage: stage as HTMLElement };
}

describe('diagram tools', () => {
  it('starts at actual size when the diagram already fits its frame', () => {
    const f = setup();
    init(f.document);
    expect(f.scale()).toBe(1);
  });

  it('centres the stage vertically inside the frame', () => {
    const f = setup();
    init(f.document);
    // (400 frame − 200 stage) / 2
    expect(f.stage.style.transform).toContain('translate(0px, 100px)');
  });

  it('zooms in and out by one step per press', () => {
    const f = setup();
    init(f.document);
    f.press('in');
    expect(f.scale()).toBeCloseTo(1.25);
    f.press('out');
    expect(f.scale()).toBeCloseTo(1);
  });

  // fit() takes whatever scale shows the whole diagram — deliberately without
  // the MIN floor that bounds the zoom-out button.
  it('fits to the tighter of the two ratios', () => {
    const f = setup();
    init(f.document);
    f.press('fit');
    // width 800/400 = 2, height 400/200 = 2 — both, so 2×.
    expect(f.scale()).toBeCloseTo(2);
  });

  it('clamps zoom-out at the floor', () => {
    const f = setup();
    init(f.document);
    for (let i = 0; i < 20; i += 1) f.press('out');
    expect(f.scale()).toBeCloseTo(0.4);
  });

  // iOS Safari has no Element.requestFullscreen, and happy-dom has none either
  // — which makes it the honest fixture for that browser.
  it('hides the fullscreen button where fullscreen does not exist', () => {
    const f = setup();
    init(f.document);
    const btn = f.document.querySelector<HTMLElement>('[data-kb-diagram-act="full"]');
    expect(btn?.style.display).toBe('none');
  });

  it('ignores a page with no diagram', () => {
    const f = fixture('<p>no diagrams here</p>');
    expect(() => {
      init(f.document);
    }).not.toThrow();
  });
});

// The keyboard path: the markup gives the canvas tabindex="0" and an
// aria-label naming these keys (figureFor in astro.config.mjs); the handler
// is bound on the canvas, so the keys act only while it has focus.
describe('diagram keyboard', () => {
  it('pans with the arrows, the way a scroll container would', () => {
    const f = setup();
    init(f.document);
    // The vertical centring offset is (400 − 200) / 2 = 100.
    f.key('ArrowRight');
    expect(f.shift()).toEqual({ x: -24, y: 100 });
    f.key('ArrowDown');
    expect(f.shift()).toEqual({ x: -24, y: 76 });
    f.key('ArrowLeft');
    f.key('ArrowUp');
    expect(f.shift()).toEqual({ x: 0, y: 100 });
  });

  it('pans a larger step with Shift held', () => {
    const f = setup();
    init(f.document);
    f.key('ArrowRight', { shiftKey: true });
    expect(f.shift().x).toBe(-120);
  });

  it('zooms with + and −, through the same clamped zoom as the buttons', () => {
    const f = setup();
    init(f.document);
    f.key('+');
    expect(f.scale()).toBeCloseTo(1.25);
    f.key('-');
    expect(f.scale()).toBeCloseTo(1);
    // The unshifted keys on the same physical keys work too.
    f.key('=');
    expect(f.scale()).toBeCloseTo(1.25);
    f.key('_');
    expect(f.scale()).toBeCloseTo(1);
  });

  it('resets with 0 and fits with f', () => {
    const f = setup();
    init(f.document);
    f.key('+');
    f.key('ArrowRight');
    f.key('0');
    expect(f.scale()).toBe(1);
    expect(f.shift()).toEqual({ x: 0, y: 100 });
    f.key('f');
    expect(f.scale()).toBeCloseTo(2);
  });

  it('leaves browser chords alone — Cmd+plus must keep zooming the page', () => {
    const f = setup();
    init(f.document);
    f.key('+', { metaKey: true });
    f.key('-', { ctrlKey: true });
    expect(f.scale()).toBe(1);
  });

  it('ignores every other key', () => {
    const f = setup();
    init(f.document);
    f.key('a');
    f.key('Enter');
    expect(f.scale()).toBe(1);
    expect(f.shift()).toEqual({ x: 0, y: 100 });
  });
});

describe('diagram pointer and fullscreen', () => {
  /** Pointer capture is a browser feature happy-dom lacks; a held set stands in for it. */
  function withCapture(f: ReturnType<typeof setup>): {
    drag: (type: string, x: number, y: number, button?: number) => void;
    held: Set<number>;
  } {
    const canvas = f.document.querySelector('[data-kb-diagram-canvas]') as HTMLElement;
    const held = new Set<number>();
    Object.assign(canvas, {
      setPointerCapture: (id: number) => held.add(id),
      hasPointerCapture: (id: number) => held.has(id),
      releasePointerCapture: (id: number) => held.delete(id),
    });
    const drag = (type: string, x: number, y: number, button = 0): void => {
      canvas.dispatchEvent(
        new f.window.MouseEvent(type, {
          bubbles: true,
          cancelable: true,
          button,
          clientX: x,
          clientY: y,
        }) as unknown as Event,
      );
    };
    return { drag, held };
  }

  it('pans by the distance a primary-button drag covers, and stops on release', () => {
    const f = setup();
    const { drag } = withCapture(f);
    init(f.document);
    const fig = f.document.querySelector('[data-kb-diagram]') as HTMLElement;
    drag('pointermove', 50, 50);
    expect(f.shift()).toEqual({ x: 0, y: 100 });
    drag('pointerdown', 10, 10, 2);
    drag('pointermove', 30, 30);
    expect(f.shift()).toEqual({ x: 0, y: 100 });
    drag('pointerdown', 10, 10);
    expect(fig.dataset['grabbing']).toBe('true');
    drag('pointermove', 30, 25);
    expect(f.shift()).toEqual({ x: 20, y: 115 });
    drag('pointerup', 30, 25);
    expect(fig.dataset['grabbing']).toBe('false');
    drag('pointermove', 90, 90);
    expect(f.shift()).toEqual({ x: 20, y: 115 });
    drag('pointercancel', 0, 0);
    expect(fig.dataset['grabbing']).toBe('false');
  });

  it('keeps the fullscreen button honest and refits when fullscreen changes', () => {
    const f = setup();
    Object.defineProperty(f.document.querySelector('[data-kb-diagram]'), 'requestFullscreen', {
      value: () => undefined,
    });
    init(f.document);
    const fig = f.document.querySelector('[data-kb-diagram]') as HTMLElement;
    const btn = f.document.querySelector('[data-kb-diagram-act="full"]') as HTMLElement;
    f.press('in');
    fig.dispatchEvent(new f.window.Event('fullscreenchange') as unknown as Event);
    expect(btn.title).toBe('Fullscreen');
    expect(btn.getAttribute('aria-label')).toBe('Fullscreen');
    expect(f.scale()).toBeCloseTo(2);
    Object.defineProperty(f.document, 'fullscreenElement', { configurable: true, value: fig });
    fig.dispatchEvent(new f.window.Event('fullscreenchange') as unknown as Event);
    expect(btn.title).toBe('Exit fullscreen');
  });
});

// On a phone the drawing keeps its labels readable and scrolls inside its
// canvas: the stage gets the width at which 16-unit labels come to 11px.
describe('diagram tools where the column is narrow', () => {
  const withViewBox = (f: ReturnType<typeof setup>, width: number, phone: boolean): void => {
    const svg = f.document.querySelector('svg') as unknown as SVGSVGElement;
    Object.defineProperty(svg, 'viewBox', {
      configurable: true,
      value: { baseVal: { width, height: width / 2 } },
    });
    Object.defineProperty(f.window, 'matchMedia', {
      configurable: true,
      value: () => ({ matches: phone }),
    });
  };

  it('sets the stage width that holds the labels at 11px and leaves the drawing at actual size', () => {
    const f = setup();
    withViewBox(f, 1500, true);
    init(f.document);
    expect(f.stage.style.getPropertyValue('--kb-diagram-min')).toBe('1032px');
    expect(f.scale()).toBe(1);
  });

  it('sets no width above the narrow width, and removes one when the window grows', () => {
    const f = setup();
    withViewBox(f, 1500, true);
    init(f.document);
    expect(f.stage.style.getPropertyValue('--kb-diagram-min')).not.toBe('');
    withViewBox(f, 1500, false);
    f.window.dispatchEvent(new f.window.Event('resize'));
    expect(f.stage.style.getPropertyValue('--kb-diagram-min')).toBe('');
  });

  it('leaves a drawing with no viewBox width alone', () => {
    const f = setup();
    withViewBox(f, 0, true);
    init(f.document);
    expect(f.stage.style.getPropertyValue('--kb-diagram-min')).toBe('');
  });
});

describe('diagram tools: the rest of the paths', () => {
  const wheel = (
    f: ReturnType<typeof setup>,
    opts: { ctrlKey?: boolean; metaKey?: boolean; deltaY: number },
  ): void => {
    // happy-dom's WheelEvent drops the modifier keys, so they are set on a plain event.
    const ev = Object.assign(
      new f.window.Event('wheel', { bubbles: true, cancelable: true }),
      opts,
    );
    f.document.querySelector('[data-kb-diagram-canvas]')?.dispatchEvent(ev as unknown as Event);
  };

  it('ignores a figure that has no stage or no canvas', () => {
    const f = fixture('<figure data-kb-diagram><div data-kb-diagram-canvas></div></figure>');
    expect(() => {
      init(f.document);
    }).not.toThrow();
  });

  it('zooms on Ctrl or Cmd with the wheel, and lets a bare wheel scroll the page', () => {
    const f = setup();
    init(f.document);
    wheel(f, { deltaY: -1 });
    expect(f.scale()).toBe(1);
    wheel(f, { ctrlKey: true, deltaY: -1 });
    expect(f.scale()).toBeCloseTo(1.25);
    wheel(f, { metaKey: true, deltaY: 1 });
    expect(f.scale()).toBeCloseTo(1);
  });

  it('fits a drawing whose stage holds no svg from the stage box itself', () => {
    const f = setup();
    f.stage.innerHTML = '';
    init(f.document);
    f.press('fit');
    expect(f.scale()).toBeCloseTo(2);
  });

  it('caps the drawing at the width mermaid set, and falls back to the stage when there is no viewBox', () => {
    const f = setup();
    const svg = f.document.querySelector('svg') as unknown as SVGSVGElement;
    svg.style.maxWidth = '200px';
    init(f.document);
    f.press('fit');
    // 200px wide from a 400x200 viewBox is 100px tall: the frame is 4x taller.
    expect(f.scale()).toBeCloseTo(4);

    const g = setup();
    Object.defineProperty(g.document.querySelector('svg'), 'viewBox', { value: undefined });
    init(g.document);
    g.press('fit');
    expect(g.scale()).toBeCloseTo(2);
  });

  it('does not fit when the frame has no size', () => {
    const f = setup();
    Object.defineProperty(f.window, 'getComputedStyle', {
      configurable: true,
      value: () => ({
        paddingLeft: '800px',
        paddingRight: '0px',
        paddingTop: '0px',
        paddingBottom: '0px',
      }),
    });
    init(f.document);
    f.press('in');
    f.press('fit');
    expect(f.scale()).toBeCloseTo(1.25);
  });

  it('reads the label size from the first label when the svg has one', () => {
    const f = setup();
    f.document.querySelector('svg')?.insertAdjacentHTML('beforeend', '<text>a</text>');
    Object.defineProperty(f.window, 'matchMedia', {
      configurable: true,
      value: () => ({ matches: true }),
    });
    Object.defineProperty(f.document.querySelector('svg'), 'viewBox', {
      value: { baseVal: { width: 1500, height: 750 } },
    });
    Object.defineProperty(f.window, 'getComputedStyle', {
      configurable: true,
      value: (el: Element) => ({
        paddingLeft: '0px',
        paddingRight: '0px',
        paddingTop: '0px',
        paddingBottom: '0px',
        fontSize: el.tagName.toLowerCase() === 'text' ? '22px' : '',
      }),
    });
    init(f.document);
    expect(f.stage.style.getPropertyValue('--kb-diagram-min')).toBe('750px');
  });

  it('starts fitted when a wide-screen drawing is taller than its frame', () => {
    const f = setup();
    Object.defineProperty(f.document, 'readyState', { configurable: true, value: 'complete' });
    Object.defineProperty(f.window, 'matchMedia', {
      configurable: true,
      value: () => ({ matches: false }),
    });
    Object.defineProperty(f.document.querySelector('svg'), 'viewBox', {
      value: { baseVal: { width: 400, height: 1200 } },
    });
    init(f.document);
    expect(f.scale()).toBeLessThan(1);
  });

  it('waits for the load event when the document is still loading', () => {
    const f = setup();
    Object.defineProperty(f.document, 'readyState', { configurable: true, value: 'loading' });
    Object.defineProperty(f.window, 'matchMedia', {
      configurable: true,
      value: () => ({ matches: false }),
    });
    Object.defineProperty(f.document.querySelector('svg'), 'viewBox', {
      value: { baseVal: { width: 400, height: 1200 } },
    });
    init(f.document);
    expect(f.scale()).toBe(1);
    f.window.dispatchEvent(new f.window.Event('load'));
    expect(f.scale()).toBeLessThan(1);
  });

  it('asks for fullscreen, and leaves it when the figure is already full', () => {
    const f = setup();
    const fig = f.document.querySelector('[data-kb-diagram]') as HTMLElement;
    const calls: string[] = [];
    Object.defineProperty(fig, 'requestFullscreen', { value: () => calls.push('enter') });
    Object.defineProperty(f.document, 'exitFullscreen', {
      configurable: true,
      value: () => calls.push('exit'),
    });
    init(f.document);
    f.press('full');
    Object.defineProperty(f.document, 'fullscreenElement', { configurable: true, value: fig });
    f.press('full');
    expect(calls).toEqual(['enter', 'exit']);
  });

  it('ignores a click that is not on a control, and a full press with no fullscreen support', () => {
    const f = setup();
    init(f.document);
    f.document
      .querySelector('[data-kb-diagram-stage]')
      ?.dispatchEvent(new f.window.MouseEvent('click', { bubbles: true }) as unknown as Event);
    expect(f.scale()).toBe(1);
    expect(() => {
      f.press('full');
    }).not.toThrow();
  });

  it('does nothing for a document that has no window', () => {
    const f = setup();
    Object.defineProperty(f.document, 'defaultView', { configurable: true, value: null });
    expect(() => {
      init(f.document);
    }).not.toThrow();
  });
});
