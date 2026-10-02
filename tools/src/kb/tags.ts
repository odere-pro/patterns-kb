/**
 * The rules a page's tag list is held to, for kb.mjs v2's writers (`set
 * --tags`, `new --tags`) and its lint (`validate`): the page half of the tags
 * gate's rules, in the gate's words, read from docs/data/tags.json.
 *
 *   always       each tag once, each one a page may carry (its `applies`)
 *   once faceted topics first, then skills, then languages; exactly one topic
 *
 * "Faceted" means the list files at least one term as a topic. Until the P3b
 * retag lands every term sits in `skill`, and a one-topic rule would refuse
 * every list; the rules switch on with the first topic, as the gate does.
 *
 * Whether each tag is a term, and the 2-5 count, stay with the callers, in
 * scripts/kb.mjs's words. The tags lane's gate (tools/src/gates/check-tags.ts
 * `tagFindings`) states the same rules for `make validate`; at the merge this
 * module can call it instead, and tags.test.ts holds the words equal.
 */

/** The facets in the order a page writes them. */
export const FACET_ORDER = ['topic', 'skill', 'language'] as const;

export interface TagRules {
  /** term id → its facet and the page classes it applies to. */
  readonly terms: ReadonlyMap<string, { readonly facet: string; readonly applies: readonly string[] }>;
  /** Does the list file any term as a topic? */
  readonly faceted: boolean;
}

/** The rules as docs/data/tags.json states them: `terms` is its term list. */
export function tagRules(terms: unknown): TagRules {
  const out = new Map<string, { facet: string; applies: string[] }>();
  for (const t of Array.isArray(terms) ? (terms as unknown[]) : []) {
    if (t === null || typeof t !== 'object' || typeof (t as Record<string, unknown>)['id'] !== 'string') continue;
    const { id, facet, applies } = t as Record<string, unknown>;
    out.set(id as string, {
      facet: typeof facet === 'string' ? facet : '',
      // As the gate reads it: a term with no `applies` applies to nothing.
      applies: Array.isArray(applies) ? (applies as unknown[]).map(String) : [],
    });
  }
  return { terms: out, faceted: [...out.values()].some((t) => t.facet === 'topic') };
}

const rankOf = (facet: string): number => {
  const i = (FACET_ORDER as readonly string[]).indexOf(facet);
  return i < 0 ? FACET_ORDER.length : i;
};

/** What is wrong with a page's tag list beyond unknown tags and the count, as the gate says it. */
export function tagListProblems(tags: readonly string[], rules: TagRules): string[] {
  const out: string[] = [];
  for (const t of new Set(tags.filter((x, i) => tags.indexOf(x) !== i))) out.push(`tag "${t}" is written twice`);
  const known = tags.filter((t) => rules.terms.has(t));
  const facet = (t: string): string => (rules.terms.get(t) as { facet: string }).facet;
  for (const t of known) {
    if (!(rules.terms.get(t) as { applies: readonly string[] }).applies.includes('page')) out.push(`tag "${t}" does not apply to a page — widen its applies or pick another`);
  }
  if (!rules.faceted) return out;
  const at = known.findIndex((t, i) => i > 0 && rankOf(facet(t)) < rankOf(facet(known[i - 1] as string)));
  if (at > 0) out.push(`tags are out of facet order at "${known[at] as string}" — topics first, then skills, then languages`);
  const topics = known.filter((t) => facet(t) === 'topic');
  if (topics.length === 0) out.push('no topic tag — what the page is about is the one tag it must carry, written first');
  else if (topics.length > 1) out.push(`${String(topics.length)} topic tags (${topics.join(', ')}) — a page has one, and it decides which hub group the page joins`);
  return out;
}
