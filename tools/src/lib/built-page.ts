/**
 * How the site's own programs read a built page: its head facts, its JSON-LD
 * block and its knowledge region (spec kb.pagedata, interfaces/built-page.md).
 *
 * One reader, because every program that asks the same question must get the
 * same answer: the post-build pass, the search payload, the site gates and the
 * built-level round-trip all read these pages, and two readers that disagree
 * on what a `<meta>` says turn one page fact into two.
 *
 * A scan, not a parser, for the same reason the post-build pass is one: these
 * run over every page on every build, and a start tag is all they read. The
 * scan is honest where a quick pattern is not:
 *
 *   * a quoted attribute value is consumed whole, so a `>` inside one — a
 *     description reading "`</script>` ends a block" — is text, not the end
 *     of the tag;
 *   * comments and the bodies of `script`, `style` and `textarea` are not
 *     markup, so a `<div>` written in a code sample or a CSS rule opens
 *     nothing;
 *   * a meta element is read by the attributes it has, never by a quoted
 *     spelling: `content` bare, or with no value at all, reads as empty
 *     (head-C9).
 *
 * THE KNOWLEDGE REGION is the one element carrying `data-kb-region`, a hook
 * attribute the build writes on the element holding the rendered body
 * (blocks-C11; site/src/components/MarkdownContent). Never a class: a class is
 * paint, and Starlight's class names are upstream's to change.
 */

/** The hook attribute on the element that holds a page's rendered body. */
export const REGION = 'data-kb-region';

/** One attribute as written: `null` for a bare name with no value. */
export interface Attr {
  readonly name: string;
  readonly value: string | null;
}

/** One tag the scan met. */
export interface Tag {
  /** Lower-cased element name. */
  readonly name: string;
  readonly closing: boolean;
  /** Written `<x … />`. */
  readonly selfClosing: boolean;
  /** Offset of the `<`. */
  readonly start: number;
  /** Offset just past the `>`. */
  readonly end: number;
  /** The attribute text between the name and the `>`, as written. */
  readonly source: string;
}

/** Elements that never have an end tag. */
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

/** Elements whose content is text to the markup, not tags. */
const RAW_TEXT = new Set(['script', 'style', 'textarea']);

const ATTR = /([^\s"'>/=]+)(?:\s*=\s*(?:"([^"]*)"|'([^']*)'|([^\s"'=<>`]+)))?/g;

/** The attributes of one start tag's attribute text, in order. */
export function parseAttrs(source: string): Attr[] {
  const out: Attr[] = [];
  for (const m of source.matchAll(ATTR)) {
    const value = m[2] ?? m[3] ?? m[4];
    out.push({ name: (m[1] as string).toLowerCase(), value: value === undefined ? null : value });
  }
  return out;
}

/** The value of one attribute: `undefined` when absent, `''` when bare. */
export function attrValue(attrs: readonly Attr[], name: string): string | undefined {
  const a = attrs.find((x) => x.name === name);
  return a === undefined ? undefined : (a.value ?? '');
}

/** A comment, or a tag whose quoted values are consumed whole. */
const TOKEN = /<!--[\s\S]*?(?:-->|$)|<(\/?)([a-zA-Z][\w:-]*)((?:"[^"]*"|'[^']*'|[^>"'])*)>/g;

/** One comment in the markup, not inside a tag or a raw-text body. */
export interface Comment {
  readonly start: number;
  readonly end: number;
  /** What sits between `<!--` and `-->`. */
  readonly text: string;
}

/**
 * Every tag and every markup-level comment, in document order. A comment
 * written inside a quoted attribute value — a code sample's copy button holds
 * its source there — is part of that tag, never a comment of the page, and a
 * `<div>` written in one is never a tag.
 */
export function* tokens(html: string): Generator<Tag | Comment> {
  const re = new RegExp(TOKEN.source, 'g');
  let m: RegExpExecArray | null;
  while ((m = re.exec(html)) !== null) {
    if (m[2] === undefined) {
      const body = m[0].replace(/^<!--/, '').replace(/-->$/, '');
      yield { start: m.index, end: m.index + m[0].length, text: body };
      continue;
    }
    const name = m[2].toLowerCase();
    const source = m[3] as string;
    const closing = m[1] === '/';
    const tag: Tag = {
      name,
      closing,
      selfClosing: !closing && /\/\s*$/.test(source),
      start: m.index,
      end: m.index + m[0].length,
      source,
    };
    yield tag;
    if (!closing && RAW_TEXT.has(name)) {
      // Everything up to this element's end tag is its text.
      const close = new RegExp(`</${name}\\s*>`, 'gi');
      close.lastIndex = tag.end;
      const c = close.exec(html);
      re.lastIndex = c === null ? html.length : c.index;
    }
  }
}

const isTag = (t: Tag | Comment): t is Tag => 'name' in t;

/**
 * Every tag in document order, comments and raw-text bodies skipped. A tag
 * cut off by the end of the file is not a tag.
 */
export function* tags(html: string): Generator<Tag> {
  for (const t of tokens(html)) if (isTag(t)) yield t;
}

/** Every markup-level comment, in document order. */
export function* comments(html: string): Generator<Comment> {
  for (const t of tokens(html)) if (!isTag(t)) yield t;
}

/** One element's extent: where its start tag begins, its content, and where its end tag ends. */
export interface Span {
  readonly start: number;
  readonly innerStart: number;
  readonly innerEnd: number;
  readonly end: number;
  /** False when the file ended before the element's end tag came. */
  readonly closed: boolean;
}

/**
 * Every element whose start tag passes `keep`, with its extent. An element
 * whose end tag never comes runs to the end of the file, the way a browser
 * reads it, and says so in `closed`.
 */
export function elements(html: string, keep: (name: string, attrs: readonly Attr[]) => boolean): Span[] {
  const all = [...tags(html)];
  const out: Span[] = [];
  all.forEach((t, i) => {
    if (t.closing || !keep(t.name, parseAttrs(t.source))) return;
    if (t.selfClosing || VOID.has(t.name)) {
      out.push({ start: t.start, innerStart: t.end, innerEnd: t.end, end: t.end, closed: true });
      return;
    }
    let depth = 0;
    for (let j = i; j < all.length; j += 1) {
      const u = all[j] as Tag;
      if (u.name !== t.name || u.selfClosing) continue;
      depth += u.closing ? -1 : 1;
      if (depth === 0) {
        out.push({ start: t.start, innerStart: t.end, innerEnd: u.start, end: u.end, closed: true });
        return;
      }
    }
    out.push({ start: t.start, innerStart: t.end, innerEnd: html.length, end: html.length, closed: false });
  });
  return out;
}

/** Every element carrying the region hook, in document order. */
export function regions(html: string): Span[] {
  return elements(html, (_name, attrs) => attrs.some((a) => a.name === REGION));
}

/**
 * The knowledge region's content, as `[start, end)`: null unless exactly one
 * element carries the hook and its end tag comes, since a pass that wrapped a
 * guessed region would be writing structure on a guess.
 */
export function knowledgeRegion(html: string): [number, number] | null {
  const found = regions(html);
  if (found.length !== 1) return null;
  const r = found[0] as Span;
  return r.closed ? [r.innerStart, r.innerEnd] : null;
}

/** Every `<meta>` start tag's attributes, in order. */
export function metas(html: string): Attr[][] {
  const out: Attr[][] = [];
  for (const t of tags(html)) if (!t.closing && t.name === 'meta') out.push(parseAttrs(t.source));
  return out;
}

/** How many `<meta name="…">` a page carries for one name. */
export function metaCount(html: string, name: string): number {
  return metas(html).filter((a) => attrValue(a, 'name') === name).length;
}

/**
 * The `content` of the first `<meta name="…">`, entities decoded: `null` when
 * the page has no such element, `''` when its `content` is bare or absent.
 */
export function metaContent(html: string, name: string): string | null {
  const found = metas(html).find((a) => attrValue(a, 'name') === name);
  return found === undefined ? null : decode(attrValue(found, 'content') ?? '');
}

/**
 * The `content` of every `<meta name="…">` for one name, in order, entities
 * decoded, empty ones dropped: the reading of a fact a page states once per
 * value (kb:alias, kb:solves).
 */
export function metaContents(html: string, name: string): string[] {
  return metas(html)
    .filter((a) => attrValue(a, 'name') === name)
    .map((a) => decode(attrValue(a, 'content') ?? ''))
    .filter((v) => v !== '');
}

/** The text of every `<script type="application/ld+json">`, in order. */
export function jsonLdBlocks(html: string): string[] {
  const out: string[] = [];
  for (const t of tags(html)) {
    if (t.closing || t.name !== 'script') continue;
    if (attrValue(parseAttrs(t.source), 'type') !== 'application/ld+json') continue;
    const close = html.toLowerCase().indexOf('</script', t.end);
    out.push(html.slice(t.end, close < 0 ? html.length : close));
  }
  return out;
}

const ENTITIES: Readonly<Record<string, string>> = {
  amp: '&',
  lt: '<',
  gt: '>',
  quot: '"',
  apos: "'",
  nbsp: '\u00a0',
  mdash: '—',
  ndash: '–',
  hellip: '…',
};

/** Character references to characters; one past the last code point, or unknown, stays text. */
export function decode(text: string): string {
  return text.replace(/&(#x?[0-9a-f]+|[a-z]+);/gi, (all: string, body: string) => {
    if (body[0] === '#') {
      const code =
        body[1] === 'x' || body[1] === 'X' ? parseInt(body.slice(2), 16) : parseInt(body.slice(1), 10);
      return code <= 0x10ffff ? String.fromCodePoint(code) : all;
    }
    const named = ENTITIES[body.toLowerCase()];
    return named === undefined ? all : named;
  });
}

/**
 * Markup out, text in, HTML whitespace collapsed. A tag is a word break; a
 * comment and the body of a `script` or `style` (a diagram's own stylesheet)
 * are not text at all.
 */
export function stripTags(html: string): string {
  const parts: string[] = [];
  let last = 0;
  // tags() never yields a tag inside a script or style body, so only the
  // body's text needs skipping here.
  for (const t of tags(html)) {
    parts.push(html.slice(last, t.start).replace(/<!--[\s\S]*?(?:-->|$)/g, ' '), ' ');
    last = t.end;
    if (!t.closing && (t.name === 'script' || t.name === 'style')) {
      const close = html.toLowerCase().indexOf(`</${t.name}`, t.end);
      last = close < 0 ? html.length : close;
    }
  }
  parts.push(html.slice(last).replace(/<!--[\s\S]*?(?:-->|$)/g, ' '));
  // HTML's whitespace only: a U+00A0 is part of a word, as in a browser and in
  // the markdown's plain text (tools/src/lib/kb-attrs.ts), so `500&nbsp;ms`
  // stays one unbroken run.
  return decode(parts.join(''))
    .replace(/[ \t\n\r\f]+/g, ' ')
    .replace(/^ | $/g, '');
}
