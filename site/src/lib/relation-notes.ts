// The one-line reason each relation carries, for the prerequisite card.
//
// docs/data/relations.json holds every typed edge between two pages once, as
// `{a, verb, b, note_a, note_b}`: `note_a` is the note shown on page a's side
// of the edge (why a's reader should look at b), `note_b` the note on b's.
// The card shows, beside each neighbour, the note on the current page's own
// side, so the reason is worded for the page the reader is on.
//
// Notes are markdown inline text with links relative to their own page; the
// card shows plain text, so links become their words and emphasis marks go.
// A pair with no note, or a tree with no relations file, gets no reason: the
// card shows the link alone. The file is read again only when it changed, as
// the prerequisite cards are, so `astro dev` sees an edit with no restart.
import fs from 'node:fs';
import path from 'node:path';

/** The relations file, repo-relative. */
export const RELATIONS = 'docs/data/relations.json';

interface Relation {
  a?: string;
  b?: string;
  note_a?: string;
  note_b?: string;
}

/** A note's markdown inline text as plain text: links to their words, code and emphasis bare. */
export function plainNote(markdown: string): string {
  return markdown
    .replace(/\[([^\]]*)\]\([^)]*\)/g, '$1')
    .replace(/`([^`]*)`/g, '$1')
    .replace(/(^|[\s(])(\*\*|__|\*|_)(\S[^*_]*?)\2(?=$|[\s).,;:!?])/g, '$1$3')
    .replace(/\s+/g, ' ')
    .trim();
}

/** The key one side of an edge is stored under. */
const keyOf = (from: string, to: string): string => `${from}>${to}`;

/**
 * Every side of every edge, as `from>to` → plain note, the first note found
 * for a pair kept (a pair joined by two verbs reads its first record's).
 */
export function notesFrom(relations: readonly Relation[]): Map<string, string> {
  const out = new Map<string, string>();
  const put = (
    from: string | undefined,
    to: string | undefined,
    note: string | undefined,
  ): void => {
    if (from === undefined || to === undefined || note === undefined) return;
    const text = plainNote(note);
    if (text !== '' && !out.has(keyOf(from, to))) out.set(keyOf(from, to), text);
  };
  for (const r of relations) {
    put(r.a, r.b, r.note_a);
    put(r.b, r.a, r.note_b);
  }
  return out;
}

const cache = new Map<string, { stamp: number; notes: Map<string, string> }>();

/** Every note of the tree at `root`; none when it has no relations file. */
export function loadNotes(root: string): Map<string, string> {
  const file = path.join(root, RELATIONS);
  const stamp = fs.existsSync(file) ? fs.statSync(file).mtimeMs : -1;
  const hit = cache.get(root);
  if (hit !== undefined && hit.stamp === stamp) return hit.notes;
  let relations: Relation[] = [];
  if (stamp !== -1) {
    try {
      relations =
        (JSON.parse(fs.readFileSync(file, 'utf8')) as { relations?: Relation[] }).relations ?? [];
    } catch {
      relations = [];
    }
  }
  const notes = notesFrom(relations);
  cache.set(root, { stamp, notes });
  return notes;
}

/** The reason page `from` gives for linking page `to`, or undefined. */
export function reasonFor(
  notes: ReadonlyMap<string, string>,
  from: string,
  to: string,
): string | undefined {
  return notes.get(keyOf(from, to));
}
