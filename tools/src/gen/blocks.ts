/**
 * What gen-relations and gen-tours share: reading the data files they render
 * from, and splicing each page's marked blocks through the write-or-check path
 * (spec: kb.generation.marked-blocks, kb.generation.write-or-check).
 *
 * Which pages a block is spliced into: every page the data says carries it,
 * and every page that holds either of its markers. The first half makes a page
 * that lost its markers a finding rather than a page whose block silently
 * stopped rendering; the second makes a stale block on a page the data no
 * longer names come back empty rather than stay stale.
 */

import fs from 'node:fs';
import path from 'node:path';

import { emit, markers, spliceFile, type Block, type Emitted } from '../lib/generated.js';
import type { GateContext } from '../lib/gate.js';

/** The repair a STALE line names: `make gen` runs both generators. */
export const FIX = 'make gen';

/** Does the page on disk hold either marker of the named block? A missing page holds none. */
export function holdsMarker(root: string, source: string, name: string): boolean {
  const abs = path.join(root, source);
  if (!fs.existsSync(abs)) return false;
  const text = fs.readFileSync(abs, 'utf8');
  return markers(name).some((m) => text.includes(m));
}

/**
 * Splice each page's blocks and write or check it. A page that is missing or
 * lacks a marker is a finding and is left alone; the others are still written
 * (marked-blocks-C5, C6).
 */
export function writePages(ctx: GateContext, pages: readonly { source: string; blocks: readonly Block[] }[]): Emitted[] {
  const out: Emitted[] = [];
  for (const p of pages) {
    const text = spliceFile(ctx, p.source, p.blocks);
    if (text !== null) out.push(emit(ctx, { out: p.source, wanted: text, fixCommand: FIX }));
  }
  return out;
}
