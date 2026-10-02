/**
 * The tag list, read one way by every tool that needs it (spec: kb.data.tags).
 *
 * `docs/data/tags.json` is the one list of tags: which exist, which facet each
 * sits in, which heading a topic groups under, and which page class may use
 * each. The tags gate holds the pages and the flat tuple to it; gen-taxonomy
 * renders it; a hub generator groups entries by it. Shared here so all of them
 * read the same shape.
 *
 * A page's `tags` value is read through the frontmatter door with `lists`
 * (lib/frontmatter.ts), which already answers "an inline list, and its items"
 * or "not a list" — so nothing here splits a frontmatter value.

 */

import fs from 'node:fs';
import path from 'node:path';

/** The tag list every reader here is pointed at, relative to the repo root. */
export const TAG_LIST = 'docs/data/tags.json';

/**
 * Facets in the order a page writes them, which is also the order a reader
 * scans them: what the page is about, what the reader does, what machinery it
 * names. `topic` is first because it is the one a hub groups by, and a
 * grouping key buried in the middle of a list is one nobody can predict.
 */
export const FACETS = ['topic', 'skill', 'language'] as const;
export type Facet = (typeof FACETS)[number];

/** The two page classes a term's `applies` may name. */
export const CLASSES = ['page', 'exercise'] as const;
export type PageClass = (typeof CLASSES)[number];

/**
 * How many tags each class carries (tags-C2). A page has one topic; an
 * exercise may span. The ceilings are one number on purpose: an exercise is
 * mirrored onto the site as a page, whose schema refuses a sixth tag far from
 * the frontmatter. The gate and the reference page both read this, so the
 * bounds the page states are the bounds the gate holds.
 */
export const COUNTS: Readonly<Record<PageClass, { readonly min: number; readonly max: number }>> = {
  page: { min: 2, max: 5 },
  exercise: { min: 3, max: 5 },
};

/**
 * The exercise tree: graded practice pages with their own frontmatter regime
 * (spec: kb.content.frontmatter, exercise regime). This KB has none today; the
 * root is named so the day one lands, its pages are held to the exercise half
 * of the tag rules rather than to the page half.
 */
export const EXERCISES = 'docs/exercises/';

/**
 * One term, as the list holds it. Every field is `unknown` because the file
 * is data nothing has validated yet — the gate narrows it, and a finding that
 * interpolated an object would read `[object Object]` and hide the fault.
 */
export interface Term {
  id?: unknown;
  facet?: unknown;
  label?: unknown;
  definition?: unknown;
  applies?: unknown;
  owner?: unknown;
}

export interface TagList {
  facets?: unknown;
  terms?: unknown;
}

/** The list parsed out of text, or null when the text is not a JSON object. */
export function parseTagList(text: string): TagList | null {
  try {
    const data = JSON.parse(text) as unknown;
    return data !== null && typeof data === 'object' && !Array.isArray(data) ? (data as TagList) : null;
  } catch {
    return null;
  }
}

/**
 * The list read from the repo being measured.
 *
 * Read from `root` rather than imported: a gate is pointed at a repo, and an
 * import would read this checkout's copy however a fixture was built.
 */
export function loadTagList(root: string): TagList {
  const abs = path.join(root, TAG_LIST);
  if (!fs.existsSync(abs)) throw new Error(`${TAG_LIST}: missing`);
  const data = parseTagList(fs.readFileSync(abs, 'utf8'));
  if (data === null) throw new Error(`${TAG_LIST}: is not a JSON object`);
  return data;
}

/** The terms as a list, empty when the file is not in that shape. */
export function termsOf(data: TagList): Term[] {
  return Array.isArray(data.terms) ? (data.terms as Term[]) : [];
}

/** Every term id mapped to its facet — the lookup every caller actually wants. */
export function facetById(data: TagList): Map<string, string> {
  const m = new Map<string, string>();
  for (const t of termsOf(data)) {
    if (typeof t.id === 'string' && typeof t.facet === 'string') m.set(t.id, t.facet);
  }
  return m;
}

/**
 * A topic's heading, for the group a hub renders it as. Falls back to the id
 * so a term that reaches a page before it has a label still renders as
 * something — the gate is what refuses the missing label, not a generator.
 */
export function labelById(data: TagList): Map<string, string> {
  const m = new Map<string, string>();
  for (const t of termsOf(data)) {
    if (typeof t.id !== 'string') continue;
    m.set(t.id, typeof t.label === 'string' && t.label !== '' ? t.label : t.id);
  }
  return m;
}

/** Where a facet sits in writing order, or the end for one nobody declared. */
export function facetRank(facet: string | undefined): number {
  const i = (FACETS as readonly string[]).indexOf(facet ?? '');
  return i < 0 ? FACETS.length : i;
}

/**
 * A page's topic: the first of its tags the list files as a topic, or
 * undefined. The one key a hub groups the page under.
 */
export function topicOf(tags: readonly string[], facet: ReadonlyMap<string, string>): string | undefined {
  return tags.find((t) => facet.get(t) === 'topic');
}
