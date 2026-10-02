/**
 * A block as text: what `kb.mjs get` prints, read off the markdown instead of
 * the HTML, in the conventions scripts/kb.mjs set (so an agent reading either
 * sees the same page):
 *
 *   paragraph      its text on a line of its own
 *   ### heading    in capitals; a deeper heading as written
 *   list item      `- [<id>] <text>`; a nested list's items indented, no id
 *   variation      `- [<id>] **<name>**: <text>` (variations, capabilities, contenders)
 *   example, row   `- <name> — <note>` (wild, fluency, siblings)
 *   relation       `<Label>:` then `- <title> [<slug>] — <note>`
 *   example        `EXAMPLE` then its text, or its caption above its fence
 *   fence          its summary, then the code fenced with its language
 *   mermaid        its caption in underscores; the source too with --diagrams
 *   table          `| a | b |` per row, the header row included
 */

import { readKb, type List, type ListItem, type Nodes, type RootContent } from '../lib/kb-attrs.js';

import { inline, inlineOf, type Block, type PageDoc } from './page.js';

/** Blocks whose top-level items are a name and its explanation (`dl.variations` today). */
const NAMED_ITEM_BLOCKS: ReadonlySet<string> = new Set(['variations', 'capabilities', 'contenders']);
/** Blocks whose rows are a name and a note with no id of their own printed. */
const ROW_BLOCKS: ReadonlySet<string> = new Set(['wild', 'siblings']);

export interface RenderOptions {
  readonly diagrams: boolean;
  /** A link url → the slug of the page it names, for relationship rows. */
  readonly slugOf: (url: string) => string | null;
}

interface Ctx extends RenderOptions {
  readonly block: string;
  readonly out: string[];
  region: string | null;
}

/** A code span in fence meta (a caption, a summary): matching backtick runs (dialect D-41, D-42). */
const META_CODE = /(?<!`)(`+)(?!`)([^]*?[^`])\1(?!`)/g;

/**
 * Fence meta as the text a reader sees: code spans unwrapped, whitespace
 * collapsed — all of it for a summary, as scripts/kb.mjs read a `<summary>`;
 * ASCII runs only for a caption, whose no-break spaces it kept.
 */
export function metaText(meta: string, keepNbsp = false): string {
  return meta
    .replace(META_CODE, '$2')
    .replace(keepNbsp ? /[ \t\n\r\f]+/g : /\s+/g, ' ')
    .trim();
}

const idTag = (n: Nodes): string => {
  const id = readKb(n)?.id;
  return id === undefined ? '' : `[${id}] `;
};

/** Text of a node's children, each block its own text, joined by a space. */
function wholeText(nodes: readonly Nodes[]): string {
  return nodes
    .map((n) => (n.type === 'list' ? (n as List).children.map((i) => wholeText(i.children)).join(' ') : inline(n)))
    .filter((t) => t !== '')
    .join(' ');
}

function renderItem(item: ListItem, ctx: Ctx): void {
  const first = item.children[0];
  const para = first?.type === 'paragraph' ? first : undefined;
  const kids = para?.children ?? [];
  const lead = kids[0];

  // A name-and-note row: relationships, fluency, wild, siblings.
  if (ctx.region === 'relationships' || ctx.region === 'fluency' || (ctx.region === null && ROW_BLOCKS.has(ctx.block))) {
    const head = lead?.type === 'link' || lead?.type === 'strong' ? lead : undefined;
    const name = head === undefined ? '' : inline(head);
    const note = inlineOf(head === undefined ? kids : kids.slice(1)).replace(/^—\s*/, '');
    const to = ctx.region === 'relationships' && head?.type === 'link' ? ctx.slugOf(head.url) : null;
    if (head === undefined) ctx.out.push(`- ${note}\n`);
    else ctx.out.push(`- ${name}${to === null ? '' : ` [${to}]`}${note === '' ? '' : ` — ${note}`}\n`);
    return;
  }

  // A named item: `- **Name** — text`.
  if (NAMED_ITEM_BLOCKS.has(ctx.block) && lead?.type === 'strong') {
    const rest = [inlineOf(kids.slice(1)).replace(/^—\s*/, ''), wholeText(item.children.slice(1))].filter((t) => t !== '').join(' ');
    ctx.out.push(`\n- ${idTag(item)}**${inline(lead)}**: ${rest}\n`);
    return;
  }

  const sub = item.children.find((c): c is List => c.type === 'list');
  if (sub !== undefined) {
    ctx.out.push(`- ${idTag(item)}${wholeText(item.children.filter((c) => c !== sub))}\n`);
    for (const s of sub.children) ctx.out.push(`  - ${wholeText(s.children)}\n`);
    return;
  }
  if (item.children.every((c) => c.type === 'paragraph')) {
    ctx.out.push(`- ${idTag(item)}${wholeText(item.children)}\n`);
    return;
  }
  // An item carrying a fence or a quote under its text (an entity, an endpoint).
  ctx.out.push(`- ${idTag(item)}${para === undefined ? '' : inline(para)}\n`);
  for (const c of item.children.slice(para === undefined ? 0 : 1)) renderNode(c as RootContent, ctx);
}

function renderNode(node: RootContent, ctx: Ctx): void {
  switch (node.type) {
    case 'paragraph': {
      const lead = node.children[0];
      if (ctx.block === 'explain' && lead?.type === 'strong' && node.children.length > 1) {
        ctx.out.push(`\n${inline(lead).replace(/\.$/, '').toUpperCase()}\n`, `\n${inlineOf(node.children.slice(1))}\n`);
        return;
      }
      if (ctx.region === 'relationships' && lead?.type === 'strong' && node.children.length === 1) {
        ctx.out.push(`\n${inline(lead)}:\n`);
        return;
      }
      ctx.out.push(`\n${inline(node)}\n`);
      return;
    }
    case 'heading':
      ctx.out.push(`\n${node.depth === 3 ? inline(node).toUpperCase() : inline(node)}\n`);
      return;
    case 'list':
      for (const item of node.children) renderItem(item, ctx);
      return;
    case 'code': {
      const d = readKb(node);
      if (node.lang === 'mermaid') {
        if (ctx.diagrams) ctx.out.push(`\n\`\`\`mermaid\n${node.value.trim()}\n\`\`\`\n`);
        const caption = metaText(d?.caption ?? '', true);
        if (caption !== '') ctx.out.push(`\n_${caption}_\n`);
        return;
      }
      if (ctx.block === 'explain') {
        const caption = metaText(d?.caption ?? '', true);
        ctx.out.push(`\nEXAMPLE\n`, ...(caption === '' ? [] : [`\n${caption}\n`]));
      }
      const summary = metaText(d?.summary ?? '');
      if (summary !== '') ctx.out.push(`\n${summary}\n`);
      ctx.out.push(`\n\`\`\`${node.lang ?? ''}\n${node.value.trim()}\n\`\`\`\n`);
      return;
    }
    case 'table':
      for (const row of node.children) ctx.out.push(`| ${row.children.map((c) => inline(c)).join(' | ')} |\n`);
      return;
    case 'blockquote':
      for (const c of node.children) renderNode(c, ctx);
      return;
    default:
      return;
  }
}

/** One block's text, as `kb.mjs get` prints it. */
export function blockText(doc: PageDoc, block: Block, opts: RenderOptions): string {
  const ctx: Ctx = { ...opts, block: block.name, out: [], region: null };
  for (const node of block.nodes) {
    ctx.region = doc.regionOf.get(node) ?? null;
    renderNode(node, ctx);
  }
  return ctx.out.join('').replace(/\n{3,}/g, '\n\n').trim();
}
