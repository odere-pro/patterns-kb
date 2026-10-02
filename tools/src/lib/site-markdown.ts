/**
 * The site's markdown plugins: the page's data layer, made bare `data-*` on
 * class-free elements (spec kb.pagedata.two-layers), and the diagram figure
 * (spec kb.site.build-command, build-command-C10 and C11).
 *
 * TWO LAYERS. A fact is a bare `data-*` attribute on an element with no class;
 * a class is paint and never data. The dialect's suffixes, fence meta and
 * section facts (tools/src/lib/dialect.md, read by kb-attrs.ts) arrive here
 * as `node.data.hProperties` — `id` — on paragraphs, list
 * items, headings, table rows, lists, tables and blockquotes, which Astro
 * renders class-free. A block heading's id is its `block` fact, so `#tradeoffs`
 * still lands where it always did. Three constructs need shaping first, because
 * what renders them wears classes or has no element of its own:
 *
 *   a diagram fence  → `<div id>` (class-free) around the fence and
 *                      its `<figcaption>`; `rehypeKbDiagrams` then puts the
 *                      rendered SVG and the caption in the classed figure
 *   a sketch fence   → `<details id><summary>` around the fence, so
 *                      the code frame Expressive Code draws, all classes, sits
 *                      inside a class-free data block
 *   a captioned fence → `<figure id>` holding the fence and its `<figcaption>`,
 *                      the caption a diagram figure shows, under code instead
 *   any other fence  → `<div id>` when it carries an id
 *   a blockquote     → `<details>`: in the dialect it is a prose sketch (D-43),
 *                      its bold first paragraph the summary
 *
 * Each anchored table row's first cell becomes its row header
 * (`rehypeKbTables`), the label search and a screen reader read it by.
 *
 * Section facts stay in the page as `<!--meta …-->` comments: the post-build
 * pass turns each into a section data block over the elements it governs
 * (spec kb.pagedata.blocks), because only the built page knows where a
 * section ends once Starlight has wrapped its headings.
 */

import type { Root as HastRoot } from 'hast';
import type { Code, Paragraph, PhrasingContent, Root, RootContent } from 'mdast';
import type { Plugin } from 'unified';

import { applyKbAttrs, readKb } from './kb-attrs.js';

// ---------------------------------------------------------------------------
// remark: shape the data layer
// ---------------------------------------------------------------------------

/** A node mdast-util-to-hast renders as the element `data.hName` names. */
interface Shaped {
  type: string;
  data: { hName: string; hProperties?: Record<string, unknown> };
  children: unknown[];
}

type WithH = { data?: { hProperties?: Record<string, unknown> } };

/** Take a node's `id` off it, to hand to the element that stands for it. */
function takeFacts(node: WithH): Record<string, unknown> {
  const h = node.data?.hProperties ?? {};
  const out: Record<string, unknown> = {};
  for (const key of ['id']) {
    if (h[key] !== undefined) {
      out[key] = h[key];
      delete h[key];
    }
  }
  return out;
}

/** A code span in fence meta text: matching backtick runs (D-41, D-42). */
const META_CODE = /(?<!`)(`+)(?!`)([^]*?[^`])\1(?!`)/g;

/** Fence meta text — plain words with code spans in backticks — as inline nodes. */
export function metaInline(text: string): PhrasingContent[] {
  const out: PhrasingContent[] = [];
  let last = 0;
  for (const m of text.matchAll(META_CODE)) {
    if (m.index > last) out.push({ type: 'text', value: text.slice(last, m.index) });
    out.push({ type: 'inlineCode', value: (m[2] as string).replace(/^ (.*) $/, '$1') });
    last = m.index + m[0].length;
  }
  if (last < text.length) out.push({ type: 'text', value: text.slice(last) });
  return out;
}

const shaped = (type: string, hName: string, hProperties: Record<string, unknown>, children: unknown[]): Shaped => ({
  type,
  data: { hName, ...(Object.keys(hProperties).length > 0 ? { hProperties } : {}) },
  children,
});

/** The element one fence becomes, or the fence itself when it needs nothing. */
export function shapeFence(code: Code): Code | Shaped {
  const d = readKb(code);
  const facts = takeFacts(code as WithH);
  if (code.lang === 'mermaid') {
    const caption = d?.caption;
    if (d?.wide === true) facts['data-kb-wide'] = '';
    return shaped('kbDiagram', 'div', facts, [
      code,
      ...(caption === undefined ? [] : [shaped('kbCaption', 'figcaption', {}, metaInline(caption))]),
    ]);
  }
  if (d?.summary !== undefined) {
    return shaped('kbSketch', 'details', facts, [shaped('kbSummary', 'summary', {}, metaInline(d.summary)), code]);
  }
  if (d?.caption !== undefined) {
    return shaped('kbCaptioned', 'figure', facts, [code, shaped('kbCaption', 'figcaption', {}, metaInline(d.caption))]);
  }
  return Object.keys(facts).length > 0 ? shaped('kbFence', 'div', facts, [code]) : code;
}

/**
 * A blockquote as the prose sketch it is: `<details>` keeping its id, its first
 * paragraph — one bold run — as the `<summary>`. A quote that
 * opens with a thematic break has no summary (D-43), and loses the break.
 */
export function shapeQuote(node: { type: 'blockquote'; children: RootContent[] } & WithH): void {
  const n = node as { data?: Record<string, unknown> };
  n.data = { ...n.data, hName: 'details' };
  const first = node.children[0];
  if (first?.type === 'thematicBreak') {
    node.children.shift();
    return;
  }
  const lead = first as Paragraph | undefined;
  if (lead?.type === 'paragraph' && lead.children.length === 1 && lead.children[0]?.type === 'strong') {
    node.children[0] = shaped('kbSummary', 'summary', {}, lead.children[0].children) as unknown as RootContent;
  }
}

function shapeTree(parent: { children: RootContent[] }): void {
  parent.children.forEach((node, i) => {
    if (node.type === 'code') {
      parent.children[i] = shapeFence(node) as RootContent;
      return;
    }
    if (node.type === 'blockquote') shapeQuote(node as Parameters<typeof shapeQuote>[0]);
    if ('children' in node) shapeTree(node as { children: RootContent[] });
  });
}

/**
 * The remark plugin: the dialect's data layer read (kb-attrs.ts, every problem
 * a vfile message the gates decide on), then the fences and quotes
 * shaped.
 */
export const remarkKbSite: Plugin<[], Root> = function remarkKbSite() {
  return (tree, file) => {
    const source = typeof file.value === 'string' ? file.value : String(file.value);
    for (const p of applyKbAttrs(tree, source)) {
      file.message(p.message, {
        ruleId: p.rule,
        source: 'kb-attrs',
        ...(p.line === undefined ? {} : { place: { line: p.line, column: 1 } }),
      });
    }
    shapeTree(tree);
  };
};

// ---------------------------------------------------------------------------
// rehype: the diagram figure
// ---------------------------------------------------------------------------

/** The hast shapes this module touches, described locally. */
export interface HastNode {
  type: string;
  tagName?: string;
  value?: string;
  properties?: Record<string, unknown>;
  children?: HastNode[];
}

const el = (tagName: string, properties: Record<string, unknown>, children: HastNode[] = []): HastNode => ({
  type: 'element',
  tagName,
  properties,
  children,
});

/** Stroked 24×24 icons, one path each, so every button shares a weight. */
const TOOLS: readonly { act: string; label: string; icons: readonly { d: string; cls?: string }[] }[] = [
  { act: 'out', label: 'Zoom out', icons: [{ d: 'M5 12h14' }] },
  { act: 'in', label: 'Zoom in', icons: [{ d: 'M12 5v14M5 12h14' }] },
  { act: 'fit', label: 'Fit to frame', icons: [{ d: 'M4 14h6v6M20 10h-6V4M14 10l7-7M3 21l7-7' }] },
  {
    act: 'full',
    label: 'Fullscreen',
    icons: [
      { d: 'M8 3H5a2 2 0 0 0-2 2v3m18 0V5a2 2 0 0 0-2-2h-3m0 18h3a2 2 0 0 0 2-2v-3M3 16v3a2 2 0 0 0 2 2h3', cls: 'kb-icon-expand' },
      { d: 'M8 3v3a2 2 0 0 1-2 2H3m18 0h-3a2 2 0 0 1-2-2V3m0 18v-3a2 2 0 0 1 2-2h3M3 16h3a2 2 0 0 1 2 2v3', cls: 'kb-icon-collapse' },
    ],
  },
];

/** Every text descendant, whitespace collapsed. */
export function textOf(node: HastNode): string {
  const walk = (n: HastNode): string => (n.type === 'text' ? String(n.value ?? '') : (n.children ?? []).map(walk).join(''));
  return walk(node).replace(/\s+/g, ' ').trim();
}

/** mermaid's own word for what it drew: `flowchart-v2` → `Flowchart diagram`. */
export function kindName(svg: HastNode): string {
  const raw = String(svg.properties?.['aria-roledescription'] ?? svg.properties?.['ariaRoleDescription'] ?? '')
    .replace(/-v\d+$/, '')
    .replace(/[-_]+/g, ' ')
    .trim();
  return raw === '' ? 'Diagram' : `${(raw[0] as string).toUpperCase()}${raw.slice(1)} diagram`;
}

const isDiagramSvg = (n: HastNode): boolean =>
  n.type === 'element' && n.tagName === 'svg' && /^mermaid-/.test(String(n.properties?.['id'] ?? ''));

/**
 * The figure one rendered diagram becomes: a toolbar of hook-attributed
 * buttons over a focusable canvas holding the SVG, then the caption. The
 * figure is decoration; the buttons are chrome, hidden by the noscript rule
 * when no script runs, and the frame still shows the diagram
 * (build-command-C10, C11). The SVG is named by its caption when it has one.
 */
export function figureFor(svg: HastNode, caption: HastNode | undefined, wide: boolean): HastNode {
  const props = svg.properties ?? {};
  const named = ['aria-label', 'ariaLabel', 'aria-labelledby', 'ariaLabelledBy'].some(
    (k) => props[k] !== undefined && String(props[k]).trim() !== '',
  );
  if (!named) svg.properties = { ...props, 'aria-label': caption === undefined ? kindName(svg) : textOf(caption) };
  return el('figure', { className: ['kb-diagram', 'kb-wide', ...(wide ? ['kb-diagram--wide'] : []), 'not-content'], 'data-kb-diagram': '' }, [
    el(
      'div',
      { className: ['kb-diagram-toolbar'] },
      TOOLS.map((tool) =>
        el(
          'button',
          { type: 'button', className: ['kb-diagram-tool'], 'data-kb-diagram-act': tool.act, title: tool.label, 'aria-label': tool.label },
          tool.icons.map((icon) =>
            el(
              'svg',
              {
                ...(icon.cls === undefined ? {} : { className: [icon.cls] }),
                viewBox: '0 0 24 24',
                width: '16',
                height: '16',
                fill: 'none',
                stroke: 'currentColor',
                'stroke-width': '2',
                'stroke-linecap': 'round',
                'stroke-linejoin': 'round',
                'aria-hidden': 'true',
              },
              [el('path', { d: icon.d })],
            ),
          ),
        ),
      ),
    ),
    el(
      'div',
      {
        className: ['kb-diagram-canvas'],
        'data-kb-diagram-canvas': '',
        tabIndex: 0,
        role: 'group',
        'aria-label': 'Diagram. Arrow keys pan, + and - zoom, 0 resets, F fits.',
      },
      [el('div', { className: ['kb-diagram-stage'], 'data-kb-diagram-stage': '' }, [svg])],
    ),
    ...(caption === undefined ? [] : [caption]),
  ]);
}

/**
 * The rehype plugin, run after rehype-mermaid: each diagram wrapper `remarkKbSite`
 * made gets its SVG and caption framed in one figure, and loses its `wide`
 * hook. A diagram SVG outside a wrapper is framed too, uncaptioned.
 */
export const rehypeKbDiagrams: Plugin<[], HastRoot> = function rehypeKbDiagrams() {
  return (root: HastRoot) => {
    const tree = root as unknown as HastNode;
    const walk = (node: HastNode): void => {
      const kids = node.children ?? [];
      const svgAt = kids.findIndex(isDiagramSvg);
      if (svgAt >= 0) {
        const props = node.properties ?? {};
        const wide = 'data-kb-wide' in props || 'dataKbWide' in props;
        delete props['data-kb-wide'];
        delete props['dataKbWide'];
        const capAt = kids.findIndex((k) => k.type === 'element' && k.tagName === 'figcaption');
        const caption = capAt >= 0 ? kids[capAt] : undefined;
        const figure = figureFor(kids[svgAt] as HastNode, caption, wide);
        node.children = kids.filter((_, i) => i !== capAt).map((k) => (k === kids[svgAt] ? figure : k));
        return;
      }
      for (const k of kids) walk(k);
    };
    walk(tree);
  };
};

// ---------------------------------------------------------------------------
// rehype: row headers
// ---------------------------------------------------------------------------

/**
 * The rehype plugin that names each anchored table row: a body row with an id
 * (kb-attrs gives every one `<block>-row-N`) gets its first cell as a row
 * header, `<th scope="row">`, so a screen reader announces the row by it and
 * the search payload lands on it by that text (spec kb.site.components,
 * styling; search-C4). A row with no id, and a row whose first cell is a
 * header already, are left as they are.
 */
export const rehypeKbTables: Plugin<[], HastRoot> = function rehypeKbTables() {
  return (root: HastRoot) => {
    const walk = (node: HastNode, inBody: boolean): void => {
      for (const k of node.children ?? []) {
        if (k.type !== 'element') continue;
        if (inBody && k.tagName === 'tr' && k.properties?.['id'] !== undefined) {
          const first = (k.children ?? []).find((c) => c.type === 'element');
          if (first?.tagName === 'td') {
            first.tagName = 'th';
            first.properties = { ...first.properties, scope: 'row' };
          }
        }
        walk(k, k.tagName === 'tbody' || (inBody && k.tagName !== 'table'));
      }
    };
    walk(root as unknown as HastNode, false);
  };
};
