// The hub's facet filter, worked out at build time from the entries a hub
// lists: which chips it offers, grouped in rails, and which keys each entry
// answers to.
//
// A rail is one tag facet (topic, skill, language, in the tag file's order).
// A chip is one value two or more of the hub's
// entries share and not all of them do: a value one entry holds filters to a
// single row, and a value every entry holds filters out nothing. Within a
// rail chips add up (either), across rails they narrow (both); Facets'
// module does that part on the page, from the keys below.
import tagFile from '../../../docs/data/tags.json';

import type { HubPage } from './site-types';

/** One chip: its key (`facet:value`) and what it says. */
export interface FacetChip {
  readonly key: string;
  readonly label: string;
}

/** One rail: a facet's name and its chips. */
export interface FacetRail {
  readonly id: string;
  readonly label: string;
  readonly chips: readonly FacetChip[];
}

/** A tag's facet, from the tag file; a tag the file does not list has none. */
export function facetOf(
  tag: string,
  terms: readonly { id: string; facet: string }[] = tagFile.terms,
): string | undefined {
  return terms.find((t) => t.id === tag)?.facet;
}

/** The keys one entry answers to: `facet:tag` for each tag with a facet. */
export function entryKeys(
  entry: Pick<HubPage, 'tags'>,
  terms?: readonly { id: string; facet: string }[],
): string[] {
  const keys: string[] = [];
  for (const tag of entry.tags ?? []) {
    const facet = facetOf(tag, terms);
    if (facet !== undefined) keys.push(`${facet}:${tag}`);
  }
  return keys;
}

const capital = (s: string): string => `${s.charAt(0).toUpperCase()}${s.slice(1)}`;

/** A key's value as a chip says it: `read-optimization` → `read optimization`. */
export const chipLabel = (value: string): string => value.replace(/-/g, ' ');

/**
 * The rails a hub offers for `entries`: the tag facets in the tag file's
 * order, each holding the values shared by two or more
 * entries and not all of them, in first-seen order. A rail with no chip is
 * left out.
 */
export function facetRails(
  entries: readonly Pick<HubPage, 'tags'>[],
  facets: readonly string[] = Object.keys(tagFile.facets),
  terms?: readonly { id: string; facet: string }[],
): FacetRail[] {
  const count = new Map<string, number>();
  for (const e of entries)
    for (const k of new Set(entryKeys(e, terms))) count.set(k, (count.get(k) ?? 0) + 1);
  const rails: FacetRail[] = [];
  for (const facet of facets) {
    const chips = [...count]
      .filter(([k, n]) => k.startsWith(`${facet}:`) && n >= 2 && n < entries.length)
      .map(([k]) => ({ key: k, label: chipLabel(k.slice(facet.length + 1)) }));
    if (chips.length > 0) rails.push({ id: facet, label: capital(facet), chips });
  }
  return rails;
}
