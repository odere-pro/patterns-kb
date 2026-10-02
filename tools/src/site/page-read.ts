/**
 * The page-audit reader (spec kb.noise.page-audit, reader-script and ratio):
 * one built page read the way a machine reader holds it, as a report a person
 * writes the audit's eight answers from.
 *
 * The reader algorithm is the one check-site-absence.ts states in its header:
 * drop every skip-marked subtree whole; read through a classed element, never
 * from it; a class-free element carrying a bare `data-*` that is neither a hook
 * nor a vendor name is a data block, its attributes facts; everything else is
 * content. Vector graphics and the bodies of scripts, styles and code are not
 * read (page-audit-C3). It prints:
 *
 *   - how many subtrees it dropped and how many classed elements it read through;
 *   - each data block with its facts, the article block first;
 *   - each finding, with the count: a fact on a classed element, naming the
 *     element and the attribute, and a data block carrying anything but
 *     `data-*` and an `id`, naming both (page-audit-C4);
 *   - the ratio: the page's total bytes and the bytes from the knowledge
 *     region's opening tag to the end of the page, or that there is no region
 *     (page-audit-C5). The ratio is a trend to report, never a pass mark.
 *
 * Reads text and never renders (page-audit-C1); writes nothing. The audit
 * closes on the absence gate, which this report never replaces.
 *
 * Usage: page-read <built page>   (e.g. site/dist/patterns/caching.html)
 */

import fs from 'node:fs';
import path from 'node:path';

import { parse } from 'parse5';

import { regions } from '../lib/built-page.js';
import { main, UsageError, type GateContext, type GateSpec } from '../lib/gate.js';
import { isFact, SKIP } from '../gates/check-site-absence.js';

/** Elements whose insides are not read: code, not knowledge. */
const OPAQUE = new Set(['script', 'style', 'noscript', 'template', 'pre', 'code', 'math']);
const SVG_NS = 'http://www.w3.org/2000/svg';

interface El {
  tagName?: string;
  namespaceURI?: string;
  attrs?: { name: string; value: string }[];
  childNodes?: El[];
}

/** What the reader holds of one page. */
export interface Reading {
  readonly dropped: number;
  readonly decoration: number;
  /** Each data block as `<tag> name="value" …`. */
  readonly blocks: string[];
  readonly findings: string[];
  readonly total: number;
  /** Bytes from the knowledge region's opening tag to the end, or null with no region. */
  readonly knowledge: number | null;
}

const describeEl = (tag: string, cls: string | undefined): string => `<${tag}${cls === undefined ? '' : ` class="${cls}"`}>`;

/** Read one page's markup. */
export function readPage(html: string): Reading {
  let dropped = 0;
  let decoration = 0;
  const blocks: string[] = [];
  const findings: string[] = [];

  const visit = (el: El): void => {
    if (el.tagName === undefined || el.namespaceURI === SVG_NS) return;
    const tag = el.tagName;
    const attrs = el.attrs ?? [];
    const names = attrs.map((a) => a.name);
    if (names.includes(SKIP)) {
      dropped += 1;
      return;
    }
    const cls = attrs.find((a) => a.name === 'class')?.value;
    const facts = names.filter(isFact);
    if (cls !== undefined) {
      decoration += 1;
      for (const f of facts) findings.push(`fact ${f} on the classed element ${describeEl(tag, cls)}`);
    } else if (facts.length > 0) {
      blocks.push(`<${tag}> ${attrs.map((a) => `${a.name}="${a.value}"`).join(' ')}`);
      for (const n of names) if (!n.startsWith('data-') && n !== 'id') findings.push(`data block <${tag}> carries ${n}`);
    }
    if (OPAQUE.has(tag)) return;
    for (const child of el.childNodes ?? []) visit(child);
  };
  for (const child of (parse(html) as unknown as El).childNodes ?? []) visit(child);

  const region = regions(html)[0];
  return { dropped, decoration, blocks, findings, total: Buffer.byteLength(html), knowledge: region === undefined ? null : Buffer.byteLength(html.slice(region.start)) };
}

/** The report, one line per fact, in the order the audit asks. */
export function report(file: string, r: Reading): string {
  const ratio =
    r.knowledge === null
      ? `ratio: ${r.total} bytes in all; no knowledge region (no element carries data-kb-region)`
      : `ratio: ${r.knowledge} of ${r.total} bytes from the knowledge region on (${Math.round((r.knowledge / r.total) * 100)}%)`;
  return [
    `[page-read] ${file}`,
    `dropped: ${r.dropped} skip-marked subtree(s)`,
    `decoration: ${r.decoration} classed element(s) read through`,
    `data blocks: ${r.blocks.length}`,
    ...r.blocks.map((b) => `  ${b}`),
    `findings: ${r.findings.length}`,
    ...r.findings.map((f) => `  ${f}`),
    ratio,
  ].join('\n');
}

export const spec: GateSpec = {
  name: 'page-read',
  usage: 'usage: page-read <built page>   (e.g. site/dist/patterns/caching.html)',
  positional: true,
  run(ctx: GateContext): string {
    if (ctx.args.length !== 1) throw new UsageError('name one built page');
    const file = ctx.args[0] as string;
    const abs = path.resolve(ctx.root, file);
    if (!fs.existsSync(abs)) {
      ctx.failLine(`no built page at ${file} — build the site first: make site-build`);
      return '';
    }
    return report(path.relative(ctx.root, abs).split(path.sep).join('/'), readPage(fs.readFileSync(abs, 'utf8')));
  },
};

main(spec, import.meta.url);
