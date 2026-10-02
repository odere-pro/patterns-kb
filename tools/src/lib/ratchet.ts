/**
 * The kb-shape gate's ratchets: three page rules whose pages are listed in
 * `docs/data/allow/kb-shape.json` while their rewrite is pending, read the
 * same way by the gate (`check-kb-shape`) and by `kb.mjs validate`.
 *
 *   explain      a missing example or a word bound on the explain paragraph (KB-014)
 *   costs        a missing costs list on a pattern's explain block (KB-014)
 *   description  a description block over 80 words, or not one paragraph (KB-015)
 *
 * An entry names its ratchet in `covers` (absent means `explain`, the one the
 * list started with). A `description` entry may also carry `maxWords`, the
 * word count its page had when it was listed: a page that grows past it fails,
 * so the list only ever shrinks.
 */

import { Allowlist, type AllowEntry } from './allowlist.js';

export const RATCHETS = ['explain', 'costs', 'description'] as const;
export type Ratchet = (typeof RATCHETS)[number];

export interface RatchetEntry extends AllowEntry {
  covers?: string;
  maxWords?: number;
}

/** What is wrong with one entry's ratchet keys, or null. */
export function ratchetProblem(entry: RatchetEntry): string | null {
  if (entry.covers !== undefined && !(RATCHETS as readonly string[]).includes(entry.covers)) {
    return `covers "${entry.covers}", which is none of ${RATCHETS.join(', ')}`;
  }
  if (entry.maxWords !== undefined && (!Number.isInteger(entry.maxWords) || entry.maxWords < 1)) return 'has a maxWords that is not a whole number above 0';
  return null;
}

/** One Allowlist per ratchet over the entries, each entry in the list its `covers` names. */
export class Ratchets {
  private readonly lists: Record<Ratchet, Allowlist>;

  constructor(entries: readonly RatchetEntry[]) {
    const of = (r: Ratchet): RatchetEntry[] => entries.filter((e) => (e.covers ?? 'explain') === r);
    this.lists = { explain: new Allowlist(of('explain')), costs: new Allowlist(of('costs')), description: new Allowlist(of('description')) };
  }

  /**
   * Does an entry of the ratchet excuse `page`? With `words`, an entry that
   * carries `maxWords` excuses it only while the page is no longer than that.
   */
  excuses(ratchet: Ratchet, page: string, words?: number): boolean {
    const entry = this.lists[ratchet].entryFor(page) as RatchetEntry | undefined;
    if (entry === undefined) return false;
    return words === undefined || entry.maxWords === undefined || words <= entry.maxWords;
  }

  /** The entries that excused nothing, in list order, across the ratchets. */
  unused(): RatchetEntry[] {
    return RATCHETS.flatMap((r) => this.lists[r].unused() as RatchetEntry[]);
  }
}
