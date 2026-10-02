/**
 * The prerequisite card: what a page asks a reader to know first, and what
 * sits beside it (spec kb.learning.prerequisites, card; prerequisites-C8).
 *
 * The graph lives in one file, docs/data/prerequisites.json (built from
 * docs/data/relations.json by tools/src/gen/gen-prerequisites.ts, and held
 * acyclic, resolved, reciprocal and reached by the prerequisites gate). The
 * site's card (site/src/components/PrerequisiteCard) shows one record on the
 * page at its `route`: one link per `requires` id, then one per `related` id,
 * in array order, each named by that record's `label`, pointing at its
 * `route`, with its `definition` as the link's title. A class-free wrapper
 * states both lists as facts, `data-requires` and `data-related`, ids joined
 * by commas. A record with no edge gets no card, and neither does a page
 * with no record; a tree with no prerequisite file shows no card anywhere.
 *
 * The labels, definitions and routes are read from the file, never from the
 * pages: the file is the one home of the graph (prerequisites-C10), and the
 * page facts it copies are held equal to the pages by its freshness gate.
 *
 * Pure but for `loadCards`, which reads the file again only when it changed —
 * a build asks for it once per page, and `astro dev` must see an edit to the
 * file without a restart (the file is read with fs, so Vite never watches it).
 */

import fs from 'node:fs';
import path from 'node:path';

/** The prerequisite file, repo-relative. */
export const PREREQUISITES = 'docs/data/prerequisites.json';

/** The two facts a card states on its class-free wrapper, in this order. */
export const CARD_FACTS = ['data-requires', 'data-related'] as const;

/**
 * Is an element, by its attributes, a card's wrapper? Class-free and carrying
 * either fact: a classed element is paint, whatever it carries. The built
 * round-trip and the search payload find the card this way.
 */
export function isCardWrapper(attrs: readonly { readonly name: string }[]): boolean {
  return !attrs.some((a) => a.name === 'class') && attrs.some((a) => (CARD_FACTS as readonly string[]).includes(a.name));
}

/** One record of the file, as far as the card reads it. */
export interface CardRecord {
  readonly id: string;
  readonly label: string;
  readonly definition: string;
  readonly route: string;
  readonly requires: readonly string[];
  readonly related: readonly string[];
}

/** One link on a card: a neighbour record, by id, label, definition and route. */
export interface CardLink {
  readonly id: string;
  readonly label: string;
  readonly definition: string;
  readonly route: string;
}

/** One page's card: the records to read first, then the ones beside it. */
export interface Card {
  readonly requires: readonly CardLink[];
  readonly related: readonly CardLink[];
}

/** A card's two facts: the ids of each list, joined by commas, no spaces. */
export function cardFacts(card: Card): { requires: string; related: string } {
  return {
    requires: card.requires.map((l) => l.id).join(','),
    related: card.related.map((l) => l.id).join(','),
  };
}

/**
 * Route → card, for every record with at least one edge. An edge naming an id
 * no record declares throws, naming the file, the record and the id: the
 * prerequisites gate fails that file before any build, and a card with a hole
 * in it would state a fact its links do not show.
 */
export function cardsFrom(records: readonly CardRecord[]): Map<string, Card> {
  const byId = new Map(records.map((r) => [r.id, r]));
  const link = (from: CardRecord, id: string): CardLink => {
    const to = byId.get(id);
    if (to === undefined) {
      throw new Error(`${PREREQUISITES}: record '${from.id}' names '${id}', which no record declares — run: make gate G=check-prerequisites`);
    }
    return { id: to.id, label: to.label, definition: to.definition, route: to.route };
  };
  const cards = new Map<string, Card>();
  for (const r of records) {
    if (r.requires.length === 0 && r.related.length === 0) continue;
    cards.set(r.route, { requires: r.requires.map((id) => link(r, id)), related: r.related.map((id) => link(r, id)) });
  }
  return cards;
}

const cache = new Map<string, { stamp: number; cards: Map<string, Card> }>();

/**
 * Every card of the tree at `root`, by route; none when the tree has no
 * prerequisite file. Read again only when the file's modification time moves.
 */
export function loadCards(root: string): Map<string, Card> {
  const file = path.join(root, PREREQUISITES);
  const stamp = fs.existsSync(file) ? fs.statSync(file).mtimeMs : -1;
  const hit = cache.get(root);
  if (hit !== undefined && hit.stamp === stamp) return hit.cards;
  const records = stamp === -1 ? [] : ((JSON.parse(fs.readFileSync(file, 'utf8')) as { records?: CardRecord[] }).records ?? []);
  const cards = cardsFrom(records);
  cache.set(root, { stamp, cards });
  return cards;
}
