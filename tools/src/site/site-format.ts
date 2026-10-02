/**
 * The formatter for the built pages under site/dist (spec kb.noise.formatter).
 *
 * The last step of `postbuild` in site/package.json, after the portability
 * pass and the search payload, so `npm run build` never leaves a page off its
 * fixed point (formatter-C7). Runnable on its own:
 *
 *     node_modules/.bin/tsx tools/src/site/site-format.ts [--dist <dir>] [--check]
 *
 * Unflagged it rewrites each page in place; `--check` writes nothing and names
 * every page it would change (formatter-C6). The absence gate asks the same
 * question of every page through `formatHtml` (check-site-absence.ts).
 *
 * ## The shape, and why not prettier
 *
 * Two rules from .claude/rules/page-schema.md: an opening tag is one line
 * however long it gets, and content sits on a line of its own where a reader
 * can find it. Prettier drives both from one `printWidth`, in opposite
 * directions, so no setting gives both; the printer is local (formatter-C8,
 * site/.prettierignore keeps prettier off the built site).
 *
 * ## The one rule that keeps it honest
 *
 * Moving text onto its own line adds whitespace, and HTML paints whitespace.
 * `Run <code>make validate</code>.` broken after `</code>` paints as
 * "Run make validate ." — a space that was never in the page. So:
 *
 *   A line break either replaces whitespace that is already there, or is added
 *   at a seam where the nearest painted character on one side is already
 *   whitespace. Nowhere else.
 *
 * A run of whitespace collapses to one space, so both moves are invisible to a
 * browser. "Nearest painted character" looks through tags, which is what lets
 * the skip link expand while an inline `<code>` welded to a full stop stays put
 * (formatter-C2). There is no list of inline elements to keep in step with a
 * browser: the question is never "is this element inline" but "does this seam
 * already have whitespace at it", and the text answers that.
 *
 * The rule is checked, not trusted: `formatHtml` compares the painted text of
 * its input and its output and throws when they differ, naming the character
 * offset (formatter-C3). The page is then refused, left unwritten, and the run
 * goes on to the next one.
 *
 * ## Idempotence
 *
 * The seam test reads the painted text, which this pass leaves unchanged, and
 * the printer is pure, so a second run decides every seam the same way and
 * changes no byte (formatter-C5).
 *
 * No dependencies and no HTML parser: a parser normalises names, entities and
 * quoting, and this pass exists to move whitespace and touch nothing else.
 */

import { readdirSync, readFileSync, writeFileSync } from 'node:fs';
import path from 'node:path';

import { main, type GateContext, type GateSpec } from '../lib/gate.js';

/** Elements with no closing tag. They never open a level of indentation. */
export const VOID = new Set([
  'area',
  'base',
  'br',
  'col',
  'embed',
  'hr',
  'img',
  'input',
  'link',
  'meta',
  'param',
  'source',
  'track',
  'wbr',
]);

/**
 * Elements whose body is text, not markup, and is copied byte for byte
 * (formatter-C4). `pre` and `textarea` because their whitespace is the
 * content: every column of a code block is load-bearing. `script` and `style`
 * because their body is code: the JSON-LD block is data a machine reader
 * parses, and a diagram's `<style>` is part of the picture.
 */
const RAW_TEXT = new Set(['script', 'style', 'pre', 'textarea']);

/** Of those four, the two a browser paints. The other two are not in the text. */
const RAW_PAINTED = new Set(['pre', 'textarea']);

/**
 * Elements whose children stay on the opening tag's line whatever the seams
 * say. `title` because a document title with a newline in it is at the mercy of
 * whoever reads it; SVG's text elements because SVG's whitespace handling is
 * `xml:space`, not CSS, and the painted-text model above is an HTML model.
 * Copied as they are, both.
 */
const NEVER_EXPAND = new Set(['title', 'text', 'tspan', 'textpath']);

/** Foreign content, where `/>` closes an element and in HTML it does not. */
const FOREIGN_ROOTS = new Set(['svg', 'math']);

/**
 * A `white-space` value under which whitespace stops collapsing — which is the
 * one assumption the seam rule rests on. `white-space` inherits, so an element
 * declaring one of these has its whole subtree copied out flat.
 *
 * Not hypothetical: mermaid puts `white-space: break-spaces` and `nowrap` on
 * the label `<div>`s inside its `<foreignObject>`s. They would survive anyway,
 * since mermaid writes its SVG on one line and no seam in there has whitespace
 * to be safe about — but that is an accident, and this is the rule that does
 * not lean on it. A rule set in a stylesheet, not on the tag, is out of this
 * printer's sight (component-authoring.md).
 */
const WHITESPACE_PRESERVING = /white-space:\s*(?:pre|pre-wrap|pre-line|break-spaces|nowrap)/i;

/**
 * Elements that paint something on their own box: a link's underline, a code
 * chip's background. A run of whitespace collapses to one space, and the space
 * that survives is the first one in the run. A break added before the closing
 * tag of such an element, when the page's own space follows the tag, therefore
 * becomes the survivor and the element paints it: the underline runs on past the
 * last letter. Their closing tag stays against the last character, and the
 * break goes after it.
 */
const PAINTS_OWN_BOX = new Set(['a', 'code', 'kbd', 'mark', 'abbr', 'del', 'ins', 's', 'u']);

const INDENT = '  ';

const isWs = (c: string): boolean =>
  c === ' ' || c === '\t' || c === '\n' || c === '\r' || c === '\f';

// ---------------------------------------------------------------------------
// the tree
// ---------------------------------------------------------------------------
interface ElementNode {
  readonly kind: 'element';
  readonly name: string;
  readonly start: number;
  readonly openEnd: number;
  /** Where the closing tag starts. Equal to `end` when there is not one. */
  closeStart: number;
  end: number;
  readonly children: Node[];
}

interface RawNode {
  readonly kind: 'raw';
  readonly name: string;
  readonly start: number;
  readonly openEnd: number;
  readonly closeStart: number;
  readonly end: number;
}

/** Copied through untouched: a comment, the doctype, an unmatched close tag. */
interface OpaqueNode {
  readonly kind: 'opaque';
  readonly start: number;
  readonly end: number;
}

interface TextNode {
  readonly kind: 'text';
  readonly start: number;
  readonly end: number;
}

type Node = ElementNode | RawNode | OpaqueNode | TextNode;

/**
 * The index just past a tag that starts at `from`, with quoted attribute values
 * consumed. Expressive Code keeps each sample's raw code in `data-code="…"`,
 * so a sample about markup puts a literal `<tag>` or a whole `<!--meta …-->`
 * comment inside a value, and a scanner that stops at the first `>` ends the
 * tag mid-attribute.
 */
export function tagEnd(src: string, from: number): number {
  let quote = '';
  for (let i = from + 1; i < src.length; i += 1) {
    const c = src[i] as string;
    if (quote !== '') {
      if (c === quote) quote = '';
      continue;
    }
    if (c === '"' || c === "'") {
      quote = c;
      continue;
    }
    if (c === '>') return i + 1;
  }
  return src.length;
}

/** The name at the start of a tag, lowercased. `''` when there is not one. */
function tagName(src: string, from: number): string {
  let i = from;
  while (i < src.length && /[a-zA-Z0-9:-]/.test(src[i] as string)) i += 1;
  return src.slice(from, i).toLowerCase();
}

/** Where `</name …>` starts and ends. Raw-text elements never nest. */
function rawClose(src: string, from: number, name: string): { closeStart: number; end: number } {
  const at = src.toLowerCase().indexOf(`</${name}`, from);
  if (at < 0) return { closeStart: src.length, end: src.length };
  return { closeStart: at, end: tagEnd(src, at) };
}

/**
 * Build the tree. Recovery is deliberate and quiet — an unmatched close tag
 * becomes opaque, an unclosed element ends where its parent does — because the
 * painted-text invariant below is what catches a mis-parse, and it catches it
 * with the page name attached rather than as a thrown parser error nobody can
 * place.
 */
export function parse(src: string): Node[] {
  const roots: Node[] = [];
  const stack: ElementNode[] = [];
  /** Whether the children of each open element are foreign content. */
  const foreign: boolean[] = [];
  const push = (n: Node): void => {
    const parent = stack[stack.length - 1];
    (parent ? parent.children : roots).push(n);
  };

  let i = 0;
  while (i < src.length) {
    const lt = src.indexOf('<', i);
    if (lt < 0) {
      push({ kind: 'text', start: i, end: src.length });
      break;
    }
    if (lt > i) push({ kind: 'text', start: i, end: lt });

    if (src.startsWith('<!--', lt)) {
      const close = src.indexOf('-->', lt + 4);
      const end = close < 0 ? src.length : close + 3;
      push({ kind: 'opaque', start: lt, end });
      i = end;
      continue;
    }
    if (src.startsWith('<!', lt) || src.startsWith('<?', lt)) {
      const end = tagEnd(src, lt);
      push({ kind: 'opaque', start: lt, end });
      i = end;
      continue;
    }
    if (src.startsWith('</', lt)) {
      const end = tagEnd(src, lt);
      const name = tagName(src, lt + 2);
      let idx = -1;
      for (let k = stack.length - 1; k >= 0; k -= 1) {
        if ((stack[k] as ElementNode).name === name) {
          idx = k;
          break;
        }
      }
      if (idx < 0) {
        push({ kind: 'opaque', start: lt, end });
      } else {
        // Anything still open above the match never got a closing tag.
        while (stack.length - 1 > idx) {
          const orphan = stack.pop() as ElementNode;
          foreign.pop();
          orphan.closeStart = lt;
          orphan.end = lt;
        }
        const el = stack.pop() as ElementNode;
        foreign.pop();
        el.closeStart = lt;
        el.end = end;
      }
      i = end;
      continue;
    }

    const name = tagName(src, lt + 1);
    if (name === '') {
      // A bare `<` in running text. It is text, not a tag.
      push({ kind: 'text', start: lt, end: lt + 1 });
      i = lt + 1;
      continue;
    }
    const openEnd = tagEnd(src, lt);

    if (RAW_TEXT.has(name)) {
      const { closeStart, end } = rawClose(src, openEnd, name);
      push({ kind: 'raw', name, start: lt, openEnd, closeStart, end });
      i = end;
      continue;
    }

    // `/>` closes an element in SVG and MathML. In HTML it is decoration on a
    // void element and means nothing anywhere else, so honouring it there would
    // build a tree the browser does not have.
    const inForeign = foreign[foreign.length - 1] ?? false;
    const selfClosing = (src[openEnd - 2] === '/' && inForeign) || VOID.has(name);

    const el: ElementNode = {
      kind: 'element',
      name,
      start: lt,
      openEnd,
      closeStart: openEnd,
      end: openEnd,
      children: [],
    };
    push(el);
    if (!selfClosing) {
      stack.push(el);
      // foreignObject hands the subtree back to HTML — that is the whole point
      // of it, and mermaid puts one on three pages.
      foreign.push(FOREIGN_ROOTS.has(name) ? true : name === 'foreignobject' ? false : inForeign);
    }
    i = openEnd;
  }

  while (stack.length > 0) {
    const el = stack.pop() as ElementNode;
    el.closeStart = src.length;
    el.end = src.length;
  }
  return roots;
}

// ---------------------------------------------------------------------------
// the painted-character stream
// ---------------------------------------------------------------------------
/**
 * Every character a browser would paint, with the offset it came from. Tags,
 * comments and the bodies of `script` and `style` are not in it — which is the
 * point: `a<script>x</script>b` has `a` and `b` adjacent in the stream, so the
 * seams around the script correctly read as unbreakable.
 */
interface Stream {
  readonly chars: string;
  readonly offsets: readonly number[];
}

function buildStream(nodes: readonly Node[], src: string): Stream {
  const chars: string[] = [];
  const offsets: number[] = [];
  const walk = (list: readonly Node[]): void => {
    for (const n of list) {
      if (n.kind === 'text') {
        for (let i = n.start; i < n.end; i += 1) {
          chars.push(src[i] as string);
          offsets.push(i);
        }
      } else if (n.kind === 'raw') {
        if (!RAW_PAINTED.has(n.name)) continue;
        for (let i = n.openEnd; i < n.closeStart; i += 1) {
          chars.push(src[i] as string);
          offsets.push(i);
        }
      } else if (n.kind === 'element') {
        walk(n.children);
      }
    }
  };
  walk(nodes);
  return { chars: chars.join(''), offsets };
}

/**
 * May a line break be added at this source offset?
 *
 * Yes when the nearest painted character on either side is already whitespace,
 * because the break then joins a run that already collapses to one space. Yes
 * at the ends of the stream, where leading and trailing whitespace is dropped.
 * No otherwise — that is the `<code>make validate</code>.` case.
 */
function seamIsSafe(stream: Stream, offset: number): boolean {
  const { chars, offsets } = stream;
  let lo = 0;
  let hi = offsets.length;
  while (lo < hi) {
    const mid = (lo + hi) >> 1;
    if ((offsets[mid] as number) < offset) lo = mid + 1;
    else hi = mid;
  }
  if (lo === 0 || lo === chars.length) return true;
  return isWs(chars[lo - 1] as string) || isWs(chars[lo] as string);
}

// ---------------------------------------------------------------------------
// tags
// ---------------------------------------------------------------------------
/**
 * One tag on one line, opening or closing. Whitespace between attributes
 * collapses to a single space — and it is only ever whitespace inside a tag,
 * which a browser never paints, so this is free.
 * Whitespace *inside* a quoted value is untouched, because `data-code`
 * and `title` carry theirs into the page. Nothing else is rewritten — not the
 * quoting, not the case (`viewBox`, `stdDeviation`, `foreignObject` all survive),
 * and not an empty value (formatter-C1).
 */
export function normalizeTag(tag: string): string {
  let out = '';
  let quote = '';
  let pending = false;
  for (let i = 0; i < tag.length; i += 1) {
    const c = tag[i] as string;
    if (quote !== '') {
      out += c;
      if (c === quote) quote = '';
      continue;
    }
    if (isWs(c)) {
      pending = true;
      continue;
    }
    if (pending) {
      // No space before the closing `>`; keep the one in ` />`.
      if (c !== '>') out += ' ';
      pending = false;
    }
    out += c;
    if (c === '"' || c === "'") quote = c;
  }
  return out;
}

// ---------------------------------------------------------------------------
// printing
// ---------------------------------------------------------------------------
/** A child of an element, after whitespace-only text has become a break. */
type Item =
  | { readonly br: true }
  | { readonly br: false; readonly node: Node; readonly start: number; readonly end: number };

/**
 * Children, with every whitespace-only text node turned into a break and the
 * outer whitespace of a mixed text node turned into one too. Whitespace is
 * never deleted, only ever exchanged for a newline and an indent — which is why
 * this half of the transform needs no seam check at all.
 */
function itemsOf(children: readonly Node[], src: string): Item[] {
  const items: Item[] = [];
  for (const c of children) {
    if (c.kind !== 'text') {
      items.push({ br: false, node: c, start: c.start, end: c.end });
      continue;
    }
    const text = src.slice(c.start, c.end);
    const lead = (/^\s*/.exec(text) as RegExpExecArray)[0].length;
    if (lead === text.length) {
      items.push({ br: true });
      continue;
    }
    const trail = (/\s*$/.exec(text) as RegExpExecArray)[0].length;
    if (lead > 0) items.push({ br: true });
    items.push({ br: false, node: c, start: c.start + lead, end: c.end - trail });
    if (trail > 0) items.push({ br: true });
  }
  return items;
}

/** Does this node end in painted text, or in an element that paints its own box? */
function endsInText(n: Node): boolean {
  return n.kind === 'text' || (n.kind === 'element' && PAINTS_OWN_BOX.has(n.name));
}

class Printer {
  private readonly lines: string[] = [];
  private cur = '';

  constructor(
    private readonly src: string,
    private readonly stream: Stream,
  ) {}

  private put(s: string): void {
    this.cur += s;
  }

  private br(depth: number): void {
    this.lines.push(this.cur.replace(/[ \t]+$/, ''));
    this.cur = INDENT.repeat(Math.max(0, depth));
  }

  finish(): string {
    this.lines.push(this.cur.replace(/[ \t]+$/, ''));
    return `${this.lines.join('\n').replace(/^\n+/, '').replace(/\s+$/, '')}\n`;
  }

  /** Everything on the current line, inner whitespace untouched. Always safe. */
  private flat(n: Node): void {
    if (n.kind === 'text' || n.kind === 'opaque') {
      this.put(this.src.slice(n.start, n.end));
      return;
    }
    if (n.kind === 'raw') {
      // Both tags normalised, the body between them byte for byte — the body is
      // the part whose whitespace is content.
      this.put(
        normalizeTag(this.src.slice(n.start, n.openEnd)) +
          this.src.slice(n.openEnd, n.closeStart) +
          normalizeTag(this.src.slice(n.closeStart, n.end)),
      );
      return;
    }
    this.put(normalizeTag(this.src.slice(n.start, n.openEnd)));
    for (const c of n.children) this.flat(c);
    this.put(normalizeTag(this.src.slice(n.closeStart, n.end)));
  }

  /**
   * An element puts its children on their own lines only when both of its own
   * seams can take a break. Half-expanding — `Run <code>` opened on one line and
   * closed mid-sentence on the next — is safe but unreadable, and the shape
   * exists to be read.
   */
  private expandable(el: ElementNode): boolean {
    if (el.children.length === 0 || el.closeStart === el.openEnd) return false;
    if (NEVER_EXPAND.has(el.name)) return false;
    if (WHITESPACE_PRESERVING.test(this.src.slice(el.start, el.openEnd))) return false;
    const first = el.children[0] as Node;
    const last = el.children[el.children.length - 1] as Node;
    const opensOnWs = first.kind === 'text' && /^\s/.test(this.src.slice(first.start, first.end));
    const closesOnWs = last.kind === 'text' && /\s$/.test(this.src.slice(last.start, last.end));
    return (
      (opensOnWs || seamIsSafe(this.stream, el.openEnd)) &&
      (closesOnWs || seamIsSafe(this.stream, el.closeStart))
    );
  }

  node(n: Node, depth: number): void {
    if (n.kind !== 'element' || !this.expandable(n)) {
      this.flat(n);
      return;
    }
    this.put(normalizeTag(this.src.slice(n.start, n.openEnd)));
    this.children(n, depth);
    this.put(normalizeTag(this.src.slice(n.closeStart, n.end)));
  }

  children(el: ElementNode, depth: number): void {
    const inner = depth + 1;
    const items: Item[] = [];
    for (const it of itemsOf(el.children, this.src)) {
      const prev = items[items.length - 1];
      if (prev !== undefined && !prev.br && !it.br && seamIsSafe(this.stream, it.start)) {
        // Two content items with no whitespace between them, at a seam the
        // painted text says will survive one.
        items.push({ br: true });
      }
      if (it.br && (prev === undefined || prev.br)) continue; // one break is enough
      items.push(it);
    }

    const first = items[0];
    if (first !== undefined && !first.br && seamIsSafe(this.stream, el.openEnd)) {
      items.unshift({ br: true });
    }
    const last = items[items.length - 1];
    if (
      last !== undefined &&
      !last.br &&
      seamIsSafe(this.stream, el.closeStart) &&
      !(PAINTS_OWN_BOX.has(el.name) && endsInText(last.node))
    ) {
      items.push({ br: true });
    }

    for (let i = 0; i < items.length; i += 1) {
      const it = items[i] as Item;
      if (it.br) {
        // The last break returns to the parent's indent, for the closing tag.
        this.br(i === items.length - 1 ? depth : inner);
      } else if (it.node.kind === 'text') {
        this.put(this.src.slice(it.start, it.end));
      } else {
        this.node(it.node, inner);
      }
    }
  }
}

// ---------------------------------------------------------------------------
// the invariant
// ---------------------------------------------------------------------------
/** What the page says, with whitespace collapsed the way a browser collapses it. */
export function paintedText(html: string): string {
  return buildStream(parse(html), html).chars.replace(/\s+/g, ' ').trim();
}

/** Thrown when formatting would have changed the page. Never caught in here. */
export class RenderChanged extends Error {}

/**
 * Throw when two painted texts differ, naming the first character where they
 * part and forty characters either side (formatter-C3).
 */
export function assertSamePaint(before: string, after: string): void {
  if (before === after) return;
  let i = 0;
  while (i < before.length && i < after.length && before[i] === after[i]) i += 1;
  const window = (s: string): string => JSON.stringify(s.slice(Math.max(0, i - 40), i + 40));
  throw new RenderChanged(`formatting would change the page at character ${i}: ${window(before)} became ${window(after)}`);
}

export function formatHtml(src: string): string {
  const roots = parse(src);
  const stream = buildStream(roots, src);
  const printer = new Printer(src, stream);
  printer.children(
    {
      kind: 'element',
      name: '#document',
      start: 0,
      openEnd: 0,
      closeStart: src.length,
      end: src.length,
      children: roots,
    },
    -1,
  );
  const out = printer.finish();
  assertSamePaint(stream.chars.replace(/\s+/g, ' ').trim(), paintedText(out));
  return out;
}

// ---------------------------------------------------------------------------
// the pass
// ---------------------------------------------------------------------------
/** The repair a page off the fixed point names: the build, whose last step is this pass. */
export const OFF_FIXED_POINT = 'not at the formatter’s fixed point — run make site-build (or tsx tools/src/site/site-format.ts)';

function htmlFiles(dir: string): string[] {
  const out: string[] = [];
  const walk = (d: string): void => {
    for (const e of readdirSync(d, { withFileTypes: true }).sort((a, b) => (a.name < b.name ? -1 : 1))) {
      const p = path.join(d, e.name);
      if (e.isDirectory()) walk(p);
      else if (e.name.endsWith('.html')) out.push(p);
    }
  };
  walk(dir);
  return out;
}

export const spec: GateSpec = {
  name: 'site-format',
  usage: 'usage: site-format [--dist <dir>] [--check] [--quiet]',
  flags: ['--check', '--quiet'],
  options: ['--dist'],
  run(ctx: GateContext): string {
    // Against ctx.root, not the working folder, like the post-build pass and
    // the site gates: a relative --dist means the same folder to all of them.
    const dist = ctx.options.get('--dist') ?? path.join('site', 'dist');
    const abs = path.resolve(ctx.root, dist);
    const shown = path.relative(ctx.root, abs) || '.';

    let files: string[];
    try {
      files = htmlFiles(abs);
    } catch {
      ctx.failLine(`no built site at ${shown} — build it first: make site-build`);
      return '';
    }
    if (files.length === 0) {
      ctx.failLine(`no .html files under ${shown} — build it first: make site-build`);
      return '';
    }

    const check = ctx.flags.has('--check');
    let rewritten = 0;
    for (const file of files) {
      const route = path.relative(ctx.root, file).split(path.sep).join('/');
      const html = readFileSync(file, 'utf8');
      let out: string;
      try {
        out = formatHtml(html);
      } catch (err) {
        // Refused, not written: the printer would have changed what the page says.
        ctx.fail(route, err instanceof Error ? err.message : String(err));
        continue;
      }
      if (out === html) continue;
      rewritten += 1;
      if (check) ctx.fail(route, OFF_FIXED_POINT);
      else writeFileSync(file, out);
    }

    if (ctx.flags.has('--quiet')) return '';
    return `[site-format] ${check ? 'checked' : 'formatted'} ${files.length} page(s); ${rewritten} ${check ? 'off the fixed point' : 'rewritten'}`;
  },
};

main(spec, import.meta.url);
