/**
 * The KB attribute-suffix grammar, section facts, and positional id minting —
 * the one module that reads the markdown dialect's data layer
 * (tools/src/lib/dialect.md is the prose specification; this file is the
 * executable one, and where they disagree this file is the bug report).
 *
 * THREE CARRIERS, NO CLASSES
 *
 *   suffix        a trailing `{#id}` on a paragraph, heading, list item (the
 *                 end of its first paragraph) or table row (the end of its last
 *                 cell) — inline form. A paragraph that is nothing but `{…}`,
 *                 as the next sibling of a table, list, blockquote or code
 *                 block, applies to that block — block form (CommonMark glues a
 *                 `{…}` line straight after a table, list or blockquote INTO
 *                 it, so a blank line always separates them). Key: `#id`.
 *   fence meta    `key=value` pairs after the language in a fence's info
 *                 string: ```mermaid caption="…" wide=true```. Keys: `#id`,
 *                 `caption`, `summary`, `wide` (true).
 *   section fact  `<!--meta k=v-->` on the line under a heading. Keys: `block`
 *                 (on an H2: which block this section is — the heading's id),
 *                 `polarity` (on an H3: pro|con|when|avoid|knob|signal|failure|
 *                 check) and `requirement` (on an H3: fr|nfr — the one key
 *                 added beyond the plan, because today's FR/NFR ids are
 *                 projected from the `.functional` / `.nonfunctional` class and
 *                 a class is never data).
 *
 * A suffix starts at a `{` preceded by a space or tab (or at the start of a
 * block-form paragraph) and runs to a `}` that ends the text. `\{` is a literal
 * brace: the check reads the SOURCE, so an escaped brace never becomes a suffix
 * even though CommonMark hands the text on unescaped. Values are `[a-z0-9-]+`
 * or double-quoted with `\"` and `\\`. Fence meta is read from the raw info
 * line for the same reason: CommonMark processes escapes and entities in an
 * info string, which would corrupt a quoted caption.
 *
 * WHERE PARSED ATTRIBUTES GO
 *
 *   node.data.kb           { id, explicitId, facts, caption, summary, wide }
 *   node.data.hProperties  { id } — the projection a rehype step reads
 *
 * Every page reads at one depth: there is no level key, and a `level=` token
 * anywhere is a finding that says to delete it.
 *
 * THE ID-MINTING TABLE (`mintIds`) — today's id → the markdown construct
 *
 * The block is the `block` fact of the nearest H2 above. Nothing before the
 * first H2 is minted, and neither is anything under an H2 with no `block`
 * fact. Counters restart at every H2. "Top-level" means a list item of a list
 * that is a direct child of the root. An element carrying an explicit `#id`
 * keeps it and takes NO number in any positional sequence — hand-minted ids
 * today sit exactly on elements the build never counted.
 *
 *   <block>                   the H2 carrying `<!--meta block=<block>-->`
 *   explain-text              the first paragraph of `explain`
 *   explain-example           its second paragraph, or its fence
 *   <block>-<polarity>-N      top-level items under an H3 with a polarity fact,
 *                             N per block and polarity
 *   requirements-fr-N / -nfr-N  top-level items under an H3 with a requirement fact
 *   <block>-item-N            top-level items in variations, capabilities,
 *                             contenders, siblings
 *   <block>-li-N              every other list item, any depth, document order,
 *                             except under a polarity/requirement H3 and in
 *                             the item blocks above and in fluency, wild,
 *                             relationships, tour (keyed or generated there)
 *   <block>-p-N               every paragraph in document order, except the
 *                             text of a list item (its first paragraph), the
 *                             summary (first paragraph) of a blockquote, and
 *                             the explain block
 *   deepdives-dive-N          H3 headings in deepdives
 *   <block>-row-N             table body rows (not the header row)
 *   <block>-fig-N             mermaid fences
 *   sketch-variant-N          other fences, and blockquotes, in the sketch block
 *   <block>-sketch-N          the same everywhere else
 *
 * Keyed ids (`wild-<example>`, `tour-<member>`, `fluency-<theme>`) and every
 * hand-minted id (`sizing-h-numbers`, `decide-…`, `requirements-nfr-scale-2`)
 * travel as an explicit `{#id}`.
 */

import type {
  Blockquote,
  Code,
  Heading,
  Html,
  Link,
  List,
  ListItem,
  Nodes,
  Paragraph,
  Parents,
  PhrasingContent,
  Root,
  RootContent,
  Table,
  TableCell,
  TableRow,
} from 'mdast';
import remarkGfm from 'remark-gfm';
import remarkParse from 'remark-parse';
import { unified, type Plugin } from 'unified';

// ---------------------------------------------------------------------------
// Closed vocabularies of the grammar itself
// ---------------------------------------------------------------------------

/** Keys an inline or block-form suffix may carry, besides `#id`. */
export const SUFFIX_KEYS = [] as const;
/** Keys a fence's info string may carry, besides `#id`. */
export const FENCE_KEYS = ['caption', 'summary', 'wide'] as const;
/** Keys a section fact may carry. */
export const FACT_KEYS = ['block', 'polarity', 'requirement'] as const;
/** Polarity values: which side of a multi-sided block a group argues. */
export const POLARITIES = ['pro', 'con', 'when', 'avoid', 'knob', 'signal', 'failure', 'check'] as const;
/** Requirement groups: the FR and NFR lists of a design's requirements block. */
export const REQUIREMENTS = ['fr', 'nfr'] as const;
/** The two facts that make an H3 a group, and the one each H2 fact is. */
export type GroupFact = 'polarity' | 'requirement';

/**
 * The block each group value belongs to: a `polarity=pro` group sits only
 * under the `tradeoffs` H2, a `requirement=fr` group only under
 * `requirements` (D-21). `mintIds` reports a group under any other block,
 * whose ids would otherwise mint as `<wrong block>-pro-N`.
 */
export const GROUP_BLOCKS: Readonly<Record<GroupFact, Readonly<Record<string, string>>>> = {
  polarity: {
    pro: 'tradeoffs',
    con: 'tradeoffs',
    when: 'usage',
    avoid: 'usage',
    knob: 'production',
    signal: 'production',
    failure: 'production',
    check: 'production',
  },
  requirement: { fr: 'requirements', nfr: 'requirements' },
};

/** An element id: kebab-case, lower-case letters and digits. */
export const ID_PATTERN = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;
const BARE_VALUE = /^[a-z0-9-]+$/;

/** Blocks whose top-level list items are `<block>-item-N`. */
export const ITEM_BLOCKS: ReadonlySet<string> = new Set(['variations', 'capabilities', 'contenders', 'siblings']);
/** Blocks whose list items take no positional id (keyed, generated or `-item-`). */
export const UNNUMBERED_ITEM_BLOCKS: ReadonlySet<string> = new Set([
  ...ITEM_BLOCKS,
  'fluency',
  'wild',
  'relationships',
  'tour',
]);

// ---------------------------------------------------------------------------
// The suffix: parse and print
// ---------------------------------------------------------------------------

/** One parsed suffix or fence meta. Only the keys actually written are present. */
export interface Suffix {
  id?: string;
  caption?: string;
  summary?: string;
  wide?: boolean;
}

/** A suffix the grammar refuses. The message names the offending token. */
export class SuffixError extends Error {}

/** Where a suffix sits: inline/block form takes `#id`; a fence takes `#id`, `caption`, `summary` and `wide`. */
export type SuffixContext = 'inline' | 'fence';

/**
 * Parse the inside of a suffix (`#id`, no braces) or a fence's
 * meta string (`caption="…" wide=true`). Throws `SuffixError`.
 */
export function parseSuffix(body: string, context: SuffixContext = 'inline'): Suffix {
  const allowed: readonly string[] = context === 'fence' ? FENCE_KEYS : SUFFIX_KEYS;
  const out: Suffix = {};
  const seen = new Set<string>();
  let i = 0;
  const n = body.length;
  while (i < n) {
    const c = body[i] as string;
    if (c === ' ' || c === '\t') {
      i += 1;
      continue;
    }
    if (c === '#') {
      let j = i + 1;
      while (j < n && body[j] !== ' ' && body[j] !== '\t') j += 1;
      const id = body.slice(i + 1, j);
      if (!ID_PATTERN.test(id)) throw new SuffixError(`"#${id}" is not an id — lower-case letters, digits and hyphens`);
      if (seen.has('#')) throw new SuffixError('two ids in one suffix');
      seen.add('#');
      out.id = id;
      i = j;
      continue;
    }
    const km = /^[a-z]+=/.exec(body.slice(i));
    if (km === null) {
      let j = i;
      while (j < n && body[j] !== ' ' && body[j] !== '\t') j += 1;
      throw new SuffixError(`"${body.slice(i, j)}" is neither #id nor key=value`);
    }
    const key = km[0].slice(0, -1);
    i += km[0].length;
    let value: string;
    if (body[i] === '"') {
      let j = i + 1;
      let v = '';
      let closed = false;
      while (j < n) {
        const ch = body[j] as string;
        if (ch === '\\') {
          const nx = body[j + 1];
          if (nx === '"' || nx === '\\') {
            v += nx;
            j += 2;
            continue;
          }
          throw new SuffixError(`${key}: a backslash escapes only " and \\`);
        }
        if (ch === '"') {
          closed = true;
          break;
        }
        v += ch;
        j += 1;
      }
      if (!closed) throw new SuffixError(`${key}: unterminated quoted value`);
      value = v;
      i = j + 1;
      if (i < n && body[i] !== ' ' && body[i] !== '\t') throw new SuffixError(`${key}: text straight after the closing quote`);
    } else {
      let j = i;
      while (j < n && body[j] !== ' ' && body[j] !== '\t') j += 1;
      value = body.slice(i, j);
      if (!BARE_VALUE.test(value)) {
        throw new SuffixError(`${key}=${value}: an unquoted value is lower-case letters, digits and hyphens`);
      }
      i = j;
    }
    if (key === 'level') throw new SuffixError('`level=` is retired; delete it');
    if (!allowed.includes(key)) {
      throw new SuffixError(`unknown key "${key}" — ${context === 'fence' ? 'a fence' : 'a suffix'} takes #id, ${allowed.join(', ')}`);
    }
    if (seen.has(key)) throw new SuffixError(`"${key}" given twice`);
    seen.add(key);
    switch (key) {
      case 'wide':
        if (value !== 'true') throw new SuffixError(`wide=${value}: the only value is true`);
        out.wide = true;
        break;
      case 'caption':
        out.caption = value;
        break;
      case 'summary':
        out.summary = value;
        break;
    }
  }
  return out;
}

function printValue(v: string): string {
  return BARE_VALUE.test(v) ? v : `"${v.replace(/\\/g, '\\\\').replace(/"/g, '\\"')}"`;
}

/** The tokens of a suffix in canonical order: #id, caption, summary, wide. */
function tokens(s: Suffix): string[] {
  const out: string[] = [];
  if (s.id !== undefined) out.push(`#${s.id}`);
  if (s.caption !== undefined) out.push(`caption=${printValue(s.caption)}`);
  if (s.summary !== undefined) out.push(`summary=${printValue(s.summary)}`);
  if (s.wide === true) out.push('wide=true');
  return out;
}

/** `{#id}`, or the empty string when there is nothing to say. */
export function printSuffix(s: Suffix): string {
  const t = tokens(s);
  return t.length === 0 ? '' : `{${t.join(' ')}}`;
}

/** A fence's info string: the language, then the meta tokens. */
export function printFenceInfo(lang: string, meta: Suffix): string {
  return [lang, ...tokens(meta)].join(' ');
}

/**
 * The trailing suffix group of a raw text, if it has one: the text before it
 * (trailing whitespace dropped) and the group's inside, without braces.
 *
 * The `{` must follow a space or tab or start the text, so `\{…}` (an escaped
 * brace) and `/persons/{id}` are text. Quoted values may hold braces.
 */
export function splitTrailingSuffix(text: string): { text: string; suffix: string } | null {
  const m = /(^|[ \t])\{((?:[^{}"\\\n]|"(?:[^"\\\n]|\\.)*")*)\}[ \t]*$/.exec(text);
  if (m === null) return null;
  return { text: text.slice(0, m.index).trimEnd(), suffix: m[2] as string };
}

/**
 * A fence's opening line, read raw: the fence run, the language, and the meta.
 * Null when the line is not a fence opener.
 */
export function parseFenceLine(line: string): { fence: string; lang: string; meta: Suffix } | null {
  const m = /^[ \t]*(`{3,}|~{3,})[ \t]*([^\s`]*)[ \t]*(.*?)[ \t]*$/.exec(line);
  if (m === null) return null;
  return { fence: m[1] as string, lang: m[2] as string, meta: parseSuffix(m[3] as string, 'fence') };
}

// ---------------------------------------------------------------------------
// Section facts
// ---------------------------------------------------------------------------

/** The facts of a `<!--meta k=v-->` comment, or null when the html is not one. */
export function parseFacts(html: string): { facts: Record<string, string>; errors: string[] } | null {
  const m = /^<!--meta(?:[ \t]+([^]*?))?[ \t]*-->$/.exec(html.trim());
  if (m === null) return null;
  const facts: Record<string, string> = {};
  const errors: string[] = [];
  for (const tok of (m[1] ?? '').split(/[ \t]+/).filter((t) => t !== '')) {
    const kv = /^([a-z]+)=([a-z0-9-]+)$/.exec(tok);
    if (kv === null) {
      errors.push(`"${tok}" is not key=value (no spaces around = or inside a value)`);
      continue;
    }
    const [, key, value] = kv as unknown as [string, string, string];
    if (!(FACT_KEYS as readonly string[]).includes(key)) {
      errors.push(`unknown section-fact key "${key}" — the keys are ${FACT_KEYS.join(', ')}`);
      continue;
    }
    if (key in facts) {
      errors.push(`"${key}" given twice`);
      continue;
    }
    if (key === 'polarity' && !(POLARITIES as readonly string[]).includes(value)) {
      errors.push(`polarity=${value}: the values are ${POLARITIES.join(', ')}`);
      continue;
    }
    if (key === 'requirement' && !(REQUIREMENTS as readonly string[]).includes(value)) {
      errors.push(`requirement=${value}: the values are ${REQUIREMENTS.join(', ')}`);
      continue;
    }
    facts[key] = value;
  }
  if (Object.keys(facts).length === 0 && errors.length === 0) errors.push('a section fact with no key=value');
  return { facts, errors };
}

/** `<!--meta block=tradeoffs-->` — keys in the order given. */
export function printFacts(facts: Readonly<Record<string, string>>): string {
  return `<!--meta ${Object.entries(facts)
    .map(([k, v]) => `${k}=${v}`)
    .join(' ')}-->`;
}

// ---------------------------------------------------------------------------
// Per-node data
// ---------------------------------------------------------------------------

/** What this module records on a node, under `node.data.kb`. */
export interface KbData {
  /** The element's id — explicit from a suffix, or minted. */
  id?: string;
  /** The id was written by an author (`{#id}`), not minted. */
  explicitId?: boolean;
  /** A heading's section facts. */
  facts?: Record<string, string>;
  /** Fence meta. */
  caption?: string;
  summary?: string;
  wide?: boolean;
}

type WithData = { data?: Record<string, unknown> };

/** A node's KB data, created empty when absent. */
export function kbData(node: Nodes): KbData {
  const n = node as unknown as WithData;
  n.data ??= {};
  n.data['kb'] ??= {};
  return n.data['kb'] as KbData;
}

/** A node's KB data, or undefined — never creates it. */
export function readKb(node: Nodes): KbData | undefined {
  return (node as unknown as WithData).data?.['kb'] as KbData | undefined;
}

function setH(node: Nodes, key: string, value: string | undefined): void {
  const n = node as unknown as WithData;
  if (value === undefined) {
    const h = n.data?.['hProperties'] as Record<string, unknown> | undefined;
    if (h !== undefined) delete h[key];
    return;
  }
  n.data ??= {};
  n.data['hProperties'] ??= {};
  (n.data['hProperties'] as Record<string, unknown>)[key] = value;
}

function setId(node: Nodes, id: string | undefined, explicit: boolean): void {
  const d = kbData(node);
  if (id === undefined) {
    delete d.id;
    delete d.explicitId;
  } else {
    d.id = id;
    if (explicit) d.explicitId = true;
    else delete d.explicitId;
  }
  setH(node, 'id', id);
}

function applySuffix(node: Nodes, s: Suffix): void {
  const d = kbData(node);
  if (s.id !== undefined) setId(node, s.id, true);
  if (s.caption !== undefined) d.caption = s.caption;
  if (s.summary !== undefined) d.summary = s.summary;
  if (s.wide === true) d.wide = true;
}

// ---------------------------------------------------------------------------
// Reading the suffixes out of a parsed tree
// ---------------------------------------------------------------------------

/** One thing wrong with a page's data layer. `rule` groups them for a gate. */
export interface KbProblem {
  readonly rule: 'suffix' | 'fact' | 'id';
  readonly message: string;
  /** 1-based source line, when the node has a position. */
  readonly line?: number;
}

function lineOf(node: Nodes | undefined): number | undefined {
  return node?.position?.start.line;
}

function rawOf(node: Nodes, source: string | undefined): string | undefined {
  const p = node.position;
  if (source === undefined || p?.start.offset === undefined || p.end.offset === undefined) return undefined;
  return source.slice(p.start.offset, p.end.offset);
}

/** The last child, when it is a text node: the only place a suffix can end. */
function lastText(children: PhrasingContent[]): { value: string } | undefined {
  const last = children[children.length - 1];
  return last?.type === 'text' ? last : undefined;
}

/**
 * Strip a trailing inline suffix off `holder` (a paragraph, heading or table
 * cell) and return it, parsed. `null` when there is none. The raw source
 * decides whether the brace was escaped; the text node is what gets cut.
 */
function takeInline(
  holder: { children: PhrasingContent[] } & Nodes,
  source: string | undefined,
  problems: KbProblem[],
): Suffix | null {
  const text = lastText(holder.children);
  if (text === undefined) return null;
  const fromText = splitTrailingSuffix(text.value);
  if (fromText === null) {
    // `- item` then `{#id}` on the next line: CommonMark made the brace
    // line a lazy continuation of the item. Refuse it rather than guess
    // whether the author meant the item or the whole list.
    if (/\n[ \t]*\{[^{}\n]*\}[ \t]*$/.test(text.value)) {
      problems.push({
        rule: 'suffix',
        message: 'a {…} line glued to the block above it — leave a blank line before a block-form suffix',
        ...lineAt(holder),
      });
    }
    return null;
  }
  let raw = rawOf(holder, source);
  if (raw !== undefined) {
    // A cell's source may run to its closing pipe; an ATX heading's to its
    // optional closing hashes. Neither is part of the text a suffix ends.
    if (holder.type === 'tableCell') raw = raw.replace(/[ \t]*\|[ \t]*$/, '');
    if (holder.type === 'heading') raw = raw.replace(/[ \t]+#+[ \t]*$/, '');
    const fromRaw = splitTrailingSuffix(raw);
    if (fromRaw === null || fromRaw.suffix !== fromText.suffix) return null;
  }
  let parsed: Suffix;
  try {
    parsed = parseSuffix(fromText.suffix, 'inline');
  } catch (e) {
    // Left in place: a brace group that is not a suffix is still the
    // author's text, and the finding says to escape it or fix it.
    problems.push({ rule: 'suffix', message: `${(e as Error).message} (a literal trailing brace is written \\{)`, ...lineAt(holder) });
    return null;
  }
  text.value = fromText.text;
  if (text.value === '') holder.children.pop();
  else {
    // Trailing whitespace a hard break or code span left before the suffix.
    text.value = text.value.replace(/[ \t]+$/, '');
  }
  return parsed;
}

function lineAt(node: Nodes): { line?: number } {
  const l = lineOf(node);
  return l === undefined ? {} : { line: l };
}

/** A paragraph that is nothing but one suffix group: the block form. */
function blockFormOf(p: Paragraph, source: string | undefined): string | null {
  if (p.children.length !== 1 || p.children[0]?.type !== 'text') return null;
  const value = p.children[0].value.trim();
  const whole = splitTrailingSuffix(value);
  if (whole === null || whole.text !== '') return null;
  const raw = rawOf(p, source);
  if (raw !== undefined) {
    const r = splitTrailingSuffix(raw.trim());
    if (r === null || r.text !== '') return null;
  }
  return whole.suffix;
}

const BLOCK_FORM_TARGETS: ReadonlySet<string> = new Set(['table', 'list', 'blockquote', 'code']);

function readFenceMeta(code: Code, source: string | undefined, problems: KbProblem[]): void {
  let line: string | undefined;
  const off = code.position?.start.offset;
  if (source !== undefined && off !== undefined) {
    const end = source.indexOf('\n', off);
    line = source.slice(off, end === -1 ? undefined : end);
  }
  let meta: Suffix;
  try {
    if (line !== undefined) {
      const parsed = parseFenceLine(line);
      if (parsed === null) return; // an indented code block: no info string
      meta = parsed.meta;
    } else {
      meta = parseSuffix(code.meta ?? '', 'fence');
    }
  } catch (e) {
    problems.push({ rule: 'suffix', message: `fence: ${(e as Error).message}`, ...lineAt(code) });
    return;
  }
  applySuffix(code, meta);
}

/**
 * Read every suffix, fence meta and section fact out of `tree`, in place:
 * suffix text is removed, block-form paragraphs are removed, and what they
 * said lands in `node.data.kb` and `node.data.hProperties`. Then ids are
 * minted. Returns every problem found; the tree is always usable.
 *
 * `source` is the markdown the tree was parsed from. Without it an escaped
 * `\{` cannot be told from a suffix and fence meta falls back to CommonMark's
 * processed info string.
 */
export function applyKbAttrs(tree: Root, source?: string): KbProblem[] {
  const problems: KbProblem[] = [];

  const walk = (parent: Parents): void => {
    const kids = parent.children as RootContent[];
    for (let i = 0; i < kids.length; i += 1) {
      const node = kids[i] as RootContent;

      // Block form: a lone `{…}` paragraph after a table, list, blockquote or fence.
      if (node.type === 'paragraph') {
        const body = blockFormOf(node, source);
        if (body !== null) {
          // Removed only when it applied: a brace line that says nothing
          // valid stays the author's text, and the finding names it.
          const prev = kids[i - 1];
          if (prev === undefined || !BLOCK_FORM_TARGETS.has(prev.type)) {
            problems.push({
              rule: 'suffix',
              message: 'a block-form {…} must follow a table, list, blockquote or code block — on a paragraph or heading, put it at the end of the line',
              ...lineAt(node),
            });
            continue;
          }
          try {
            applySuffix(prev, parseSuffix(body, 'inline'));
          } catch (e) {
            problems.push({ rule: 'suffix', message: `${(e as Error).message} (a literal brace line is written \\{)`, ...lineAt(node) });
            continue;
          }
          kids.splice(i, 1);
          i -= 1;
          continue;
        }
      }

      switch (node.type) {
        case 'paragraph': {
          // The first paragraph of a list item speaks for the item.
          const target = parent.type === 'listItem' && i === 0 ? parent : node;
          const s = takeInline(node, source, problems);
          if (s !== null) applySuffix(target, s);
          break;
        }
        case 'heading': {
          const s = takeInline(node, source, problems);
          if (s !== null) applySuffix(node, s);
          readFactAfter(node, kids[i + 1], problems);
          break;
        }
        case 'table': {
          node.children.forEach((row, r) => {
            // GFM gives every row at least one cell: a line holding a lone
            // `|` is a row of one empty cell.
            const cell = row.children[row.children.length - 1] as TableCell;
            const only = row.children[0];
            if (r > 0 && row.children.length === 1 && only !== undefined && /^\{[^{}]*\}$/.test(plainText(only))) {
              problems.push({
                rule: 'suffix',
                message: 'a {…} line glued to the table above it became a row — leave a blank line before a block-form suffix',
                ...lineAt(row),
              });
              return;
            }
            const s = takeInline(cell, source, problems);
            if (s === null) return;
            if (r === 0) {
              problems.push({ rule: 'suffix', message: 'the header row takes no suffix — put a table-wide one after the table', ...lineAt(row) });
              return;
            }
            applySuffix(row, s);
          });
          break;
        }
        case 'code':
          readFenceMeta(node, source, problems);
          break;
        case 'html': {
          const f = parseFacts(node.value);
          const prev = kids[i - 1];
          if (f !== null && prev?.type !== 'heading') {
            problems.push({ rule: 'fact', message: 'a section fact belongs on the line under a heading', ...lineAt(node) });
          }
          break;
        }
        default:
          break;
      }
      if ('children' in node && node.type !== 'paragraph' && node.type !== 'heading' && node.type !== 'table') {
        walk(node as Parents);
      }
    }
  };

  const readFactAfter = (heading: Heading, next: RootContent | undefined, out: KbProblem[]): void => {
    if (next?.type !== 'html') return;
    const f = parseFacts(next.value);
    if (f === null) return;
    for (const message of f.errors) out.push({ rule: 'fact', message, ...lineAt(next) });
    if (Object.keys(f.facts).length === 0) return;
    // The fact reads as the heading's either way; a blank line between them
    // is still its own problem. A node with no position claims no line.
    const under = lineOf(next);
    const end = heading.position?.end.line;
    if (under !== undefined && end !== undefined && under !== end + 1) {
      out.push({ rule: 'fact', message: 'a section fact sits on the line right under its heading — delete the blank line between them', ...lineAt(next) });
    }
    const facts = { ...f.facts };
    if ('block' in facts && heading.depth !== 2) {
      out.push({ rule: 'fact', message: 'block= sits under an H2 only', ...lineAt(next) });
      delete facts['block'];
    }
    for (const k of ['polarity', 'requirement'] as const) {
      if (k in facts && heading.depth !== 3) {
        out.push({ rule: 'fact', message: `${k}= sits under an H3 only`, ...lineAt(next) });
        delete facts[k];
      }
    }
    if ('polarity' in facts && 'requirement' in facts) {
      out.push({ rule: 'fact', message: 'a group is a polarity group or a requirement group, not both', ...lineAt(next) });
    }
    kbData(heading).facts = facts;
  };

  walk(tree);
  problems.push(...mintIds(tree));
  return problems;
}

// ---------------------------------------------------------------------------
// Minting
// ---------------------------------------------------------------------------

interface Counters {
  p: number;
  explain: number;
  li: number;
  fig: number;
  sketch: number;
  item: number;
  row: number;
  dive: number;
  group: Map<string, number>;
}

function fresh(): Counters {
  return { p: 0, explain: 0, li: 0, fig: 0, sketch: 0, item: 0, row: 0, dive: 0, group: new Map() };
}

/** A heading's facts: from `data.kb` when the plugin ran, else read off the next sibling. */
function factsOf(h: Heading, next: RootContent | undefined): Record<string, string> {
  const d = readKb(h)?.facts;
  if (d !== undefined) return d;
  if (next?.type === 'html') return parseFacts(next.value)?.facts ?? {};
  return {};
}

/**
 * Give every element the id the table in this file's header assigns it.
 * Idempotent: minted ids are recomputed, explicit ones kept. Returns the
 * problems — a duplicate id, an explicit id on a block heading.
 */
export function mintIds(tree: Root): KbProblem[] {
  const problems: KbProblem[] = [];
  let block: string | null = null;
  let group: { key: 'polarity' | 'requirement'; value: string } | null = null;
  let c = fresh();

  const numberOf = (key: string): number => {
    const n = (c.group.get(key) ?? 0) + 1;
    c.group.set(key, n);
    return n;
  };
  const explicit = (node: Nodes): boolean => readKb(node)?.explicitId === true;
  const mint = (node: Nodes, id: string | undefined): void => {
    if (explicit(node)) return;
    setId(node, id, false);
  };

  const visit = (node: RootContent, parent: Parents, index: number): void => {
    switch (node.type) {
      case 'paragraph': {
        if (parent.type === 'listItem' && index === 0) {
          mint(node, undefined);
          return;
        }
        if (parent.type === 'blockquote' && index === 0) {
          mint(node, undefined);
          return;
        }
        if (explicit(node) || block === null) return mint(node, undefined);
        if (block === 'explain') {
          c.explain += 1;
          return mint(node, c.explain === 1 ? 'explain-text' : c.explain === 2 ? 'explain-example' : `explain-p-${c.explain}`);
        }
        c.p += 1;
        return mint(node, `${block}-p-${c.p}`);
      }
      case 'list':
        node.children.forEach((item, i) => visit(item, node, i));
        return;
      case 'listItem': {
        const top = parent.type === 'list' && isRootList(parent);
        let id: string | undefined;
        if (explicit(node) || block === null) id = undefined;
        else if (group !== null) {
          if (top) {
            const infix = group.value;
            id = `${block}-${infix}-${numberOf(`${group.key}:${infix}`)}`;
          }
        } else if (ITEM_BLOCKS.has(block)) {
          if (top) {
            c.item += 1;
            id = `${block}-item-${c.item}`;
          }
        } else if (!UNNUMBERED_ITEM_BLOCKS.has(block)) {
          c.li += 1;
          id = `${block}-li-${c.li}`;
        }
        mint(node, id);
        node.children.forEach((child, i) => visit(child, node, i));
        return;
      }
      case 'blockquote': {
        if (explicit(node) || block === null) mint(node, undefined);
        else {
          c.sketch += 1;
          mint(node, sketchId(block, c.sketch));
        }
        node.children.forEach((child, i) => visit(child, node, i));
        return;
      }
      case 'code': {
        if (explicit(node) || block === null) return mint(node, undefined);
        if (block === 'explain' && c.explain < 2 && node.lang !== 'mermaid') {
          c.explain = 2;
          return mint(node, 'explain-example');
        }
        if (node.lang === 'mermaid') {
          c.fig += 1;
          return mint(node, `${block}-fig-${c.fig}`);
        }
        c.sketch += 1;
        return mint(node, sketchId(block, c.sketch));
      }
      case 'table': {
        if (!explicit(node)) mint(node, undefined);
        node.children.forEach((row, r) => {
          if (r === 0 || explicit(row) || block === null) return mint(row, undefined);
          c.row += 1;
          mint(row, `${block}-row-${c.row}`);
        });
        return;
      }
      default:
        return;
    }
  };

  // Which lists are direct children of the root: the "top-level" test.
  const rootLists = new Set<List>(tree.children.filter((n): n is List => n.type === 'list'));
  const isRootList = (l: Parents): boolean => rootLists.has(l as List);

  tree.children.forEach((node, index) => {
    if (node.type === 'heading') {
      const facts = factsOf(node, tree.children[index + 1]);
      if (node.depth <= 2) {
        group = null;
        c = fresh();
        block = node.depth === 2 ? (facts['block'] ?? null) : null;
        if (node.depth === 2 && facts['block'] !== undefined) {
          const d = readKb(node);
          if (d?.explicitId === true && d.id !== facts['block']) {
            problems.push({ rule: 'id', message: `a block heading's id is its block name "${facts['block']}", not "${d.id}"`, ...lineAt(node) });
          }
          setId(node, facts['block'], false);
        } else mint(node, undefined);
        return;
      }
      if (node.depth === 3) {
        group =
          facts['polarity'] !== undefined
            ? { key: 'polarity', value: facts['polarity'] }
            : facts['requirement'] !== undefined
              ? { key: 'requirement', value: facts['requirement'] }
              : null;
        if (group !== null) {
          const home = GROUP_BLOCKS[group.key][group.value];
          if (home !== undefined && home !== block) {
            problems.push({
              rule: 'fact',
              message: `${group.key}=${group.value} belongs under the ${home} block, not ${block === null ? 'outside a block' : `the ${block} block`}`,
              ...lineAt(node),
            });
          }
        }
        if (block === 'deepdives' && !explicit(node)) {
          c.dive += 1;
          mint(node, `deepdives-dive-${c.dive}`);
        } else mint(node, undefined);
        return;
      }
      mint(node, undefined);
      return;
    }
    visit(node, tree, index);
  });

  // Duplicates, whichever way they arose.
  const seen = new Map<string, Nodes>();
  const check = (node: Nodes): void => {
    const id = readKb(node)?.id;
    if (id !== undefined) {
      if (seen.has(id)) problems.push({ rule: 'id', message: `duplicate id "${id}"`, ...lineAt(node) });
      else seen.set(id, node);
    }
    if ('children' in node) for (const child of node.children as Nodes[]) check(child);
  };
  check(tree);
  return problems;
}

function sketchId(block: string, n: number): string {
  return block === 'sketch' ? `sketch-variant-${n}` : `${block}-sketch-${n}`;
}

// ---------------------------------------------------------------------------
// The plugin, and a one-call parser
// ---------------------------------------------------------------------------

/**
 * The remark plugin: `applyKbAttrs` over the file, every problem reported as
 * a vfile message whose `ruleId` is the problem's rule (`suffix`, `fact`,
 * `id`) and whose `source` is `kb-attrs`. Messages never fail the run: the
 * gate reading them decides.
 */
export const remarkKbAttrs: Plugin<[], Root> = function remarkKbAttrs() {
  return (tree, file) => {
    const source = typeof file.value === 'string' ? file.value : file.value === undefined ? undefined : String(file.value);
    for (const p of applyKbAttrs(tree, source)) {
      file.message(p.message, {
        ruleId: p.rule,
        source: 'kb-attrs',
        ...(p.line === undefined ? {} : { place: { line: p.line, column: 1 } }),
      });
    }
  };
};

/** Parse a page body with GFM and the KB data layer; the one parser every caller shares. */
export function parseKb(markdown: string): { tree: Root; problems: KbProblem[] } {
  const tree = unified().use(remarkParse).use(remarkGfm).parse(markdown);
  const problems = applyKbAttrs(tree, markdown);
  return { tree, problems };
}

// ---------------------------------------------------------------------------
// The flat element list the round-trip compares
// ---------------------------------------------------------------------------

/** What an element is, in the dialect's terms. */
export type ElementKind = 'heading' | 'paragraph' | 'item' | 'list' | 'table' | 'row' | 'figure' | 'sketch';

export interface KbElement {
  readonly id?: string;
  readonly kind: ElementKind;
  /** The block it sits in; null for the H1 and the intro above the first H2. */
  readonly block: string | null;
  /** The polarity of the H3 group it sits under, when it is a list item there. */
  readonly polarity?: string;
  /** The requirement group (fr | nfr), when it is a list item under one. */
  readonly requirement?: string;
  /**
   * Its own plain text, whitespace collapsed: a heading's or paragraph's text,
   * a list item's first paragraph (anything after it — a nested list, a fence,
   * a blockquote, a second paragraph — is an element of its own), a row's cells joined by " | ", a figure's caption, a
   * sketch's summary. Lists and tables carry "".
   */
  readonly text: string;
  /** Heading depth. */
  readonly depth?: number;
  /** The header row of a table. */
  readonly header?: boolean;
  /** A fence's language and source. */
  readonly lang?: string;
  readonly code?: string;
  /** A fence's `wide=true` (the dialect writes it on mermaid fences only, D-41). */
  readonly wide?: boolean;
  /**
   * The marked block the element sits in (`relationships`, `tour`,
   * `fluency`, …): a root-level region between `<!-- <name>:start -->` and
   * `<!-- <name>:end -->` (tools/src/lib/generated.ts writes them). Absent on
   * hand-written elements.
   */
  readonly generated?: string;
}

/** A marked block's start or end line, as `markers()` in generated.ts writes it. */
export const MARKER_PATTERN = /^<!--[ \t]*([a-z]+(?:-[a-z]+)*):(start|end)[ \t]*-->$/;

/** The whitespace HTML collapses (and nothing else: never U+00A0). */
const ASCII_WS = /[ \t\n\r\f]+/g;

/**
 * Plain text: code spans and text verbatim, a break as a space, raw html
 * dropped, then whitespace collapsed the way HTML collapses it — runs of
 * space, tab, LF, CR and FF become one space and the ends are trimmed. A
 * U+00A0 (`&nbsp;`) is text, not whitespace, exactly as in a browser, so a
 * reader can tell a non-breaking space from a plain one.
 */
export function plainText(node: Nodes): string {
  const walk = (n: Nodes): string => {
    switch (n.type) {
      case 'text':
      case 'inlineCode':
        return n.value;
      case 'break':
        return ' ';
      case 'html':
        return '';
      case 'image':
        return n.alt ?? '';
      default:
        return 'children' in n ? (n.children as Nodes[]).map(walk).join('') : '';
    }
  };
  return walk(node).replace(ASCII_WS, ' ').replace(/^ | $/g, '');
}

/**
 * Every element of a parsed page, in document order.
 * Call on a tree `applyKbAttrs` (or the plugin) has processed.
 */
export function deriveElements(tree: Root): KbElement[] {
  const out: KbElement[] = [];
  let block: string | null = null;
  let group: { key: 'polarity' | 'requirement'; value: string } | null = null;
  let region: string | null = null;
  const rootLists = new Set<List>(tree.children.filter((n): n is List => n.type === 'list'));

  const base = (node: Nodes, kind: ElementKind, text: string, extra: Partial<KbElement> = {}): void => {
    const id = readKb(node)?.id;
    out.push({ ...(id === undefined ? {} : { id }), kind, block, text, ...extra, ...(region === null ? {} : { generated: region }) });
  };

  const visit = (node: RootContent, parent: Parents, index: number): void => {
    switch (node.type) {
      case 'paragraph':
        if (parent.type === 'listItem' && index === 0) return; // the item's own text
        if (parent.type === 'blockquote' && index === 0) return; // the sketch's summary
        base(node, 'paragraph', plainText(node));
        return;
      case 'heading':
        base(node, 'heading', plainText(node), { depth: node.depth });
        return;
      case 'list':
        base(node, 'list', '');
        node.children.forEach((item, i) => visit(item, node, i));
        return;
      case 'listItem': {
        const top = parent.type === 'list' && rootLists.has(parent);
        const first = node.children[0];
        const text = first?.type === 'paragraph' ? plainText(first) : '';
        const g = group !== null && top ? { [group.key]: group.value } : {};
        base(node, 'item', text, g);
        node.children.forEach((child, i) => visit(child, node, i));
        return;
      }
      case 'blockquote': {
        const first = node.children[0];
        base(node, 'sketch', first?.type === 'paragraph' ? plainText(first) : '');
        node.children.forEach((child, i) => visit(child, node, i));
        return;
      }
      case 'code': {
        const d = readKb(node);
        const wide = d?.wide === true ? { wide: true } : {};
        if (node.lang === 'mermaid') {
          base(node, 'figure', d?.caption ?? '', { lang: 'mermaid', code: node.value, ...wide });
        } else {
          base(node, 'sketch', d?.summary ?? '', { lang: node.lang ?? '', code: node.value, ...wide });
        }
        return;
      }
      case 'table': {
        base(node, 'table', '');
        (node as Table).children.forEach((row: TableRow, r) => {
          const text = row.children.map((cell) => plainText(cell)).join(' | ');
          base(row, 'row', text, r === 0 ? { header: true } : {});
        });
        return;
      }
      default:
        return;
    }
  };

  tree.children.forEach((node, index) => {
    if (node.type === 'html') {
      // A marked block opens and closes at the root; a stray end closes nothing.
      const m = MARKER_PATTERN.exec(node.value.trim());
      if (m !== null && m[2] === 'start' && region === null) region = m[1] as string;
      else if (m !== null && m[2] === 'end' && region === m[1]) region = null;
      return;
    }
    if (node.type === 'heading') {
      const facts = factsOf(node, tree.children[index + 1]);
      if (node.depth <= 2) {
        group = null;
        block = node.depth === 2 ? (facts['block'] ?? null) : null;
      } else if (node.depth === 3) {
        group =
          facts['polarity'] !== undefined
            ? { key: 'polarity', value: facts['polarity'] }
            : facts['requirement'] !== undefined
              ? { key: 'requirement', value: facts['requirement'] }
              : null;
      }
    }
    visit(node, tree, index);
  });
  return out;
}

// Re-exported so a caller naming a node type does not need a second import.
export type { Blockquote, Code, Heading, Html, Link, List, ListItem, Nodes, Paragraph, PhrasingContent, Root, RootContent, Table, TableRow };
