/**
 * The page block's contract: which keys a page's frontmatter carries, and the
 * closed lists two of them take (spec: kb.content.frontmatter, page-block and
 * value-lists). One home for each list; the frontmatter gate and the site's
 * schema read them here.
 *
 * The third closed list, `area`, is the area ids of
 * `docs/data/site-structure.json`, and the fourth, `tags`, the term ids of
 * `docs/data/tags.json`: each lives in its data file, never here.
 */

/**
 * The difficulty an exercise declares, easiest first (`level`). A page
 * carries no level; only the exercise regime (`EXERCISE_KEYS`) reads this list.
 */
export const LEVELS = ['beginner', 'intermediate', 'advanced'] as const;

/**
 * Maturity (`status`). Required with no default: this KB builds the optional
 * kb.learning parent, whose maturity unit makes the key required
 * (maturity-C1), and the frontmatter gate is the one gate that reports it.
 */
export const STATUSES = ['draft', 'stable', 'deprecated'] as const;

/** The keys every page declares, non-empty, in the order a page writes them. */
export const REQUIRED = ['title', 'description', 'area', 'owner', 'tags', 'status'] as const;
export type RequiredKey = (typeof REQUIRED)[number];

/** `source`: the single source a generated page is rendered from (spec: output-ownership). */
export const OPTIONAL = ['source'] as const;

/**
 * The KB's own keys, each held by a KB rule of `docs/reference/page-rules.md`
 * (the kb-shape gate decides their values): `aliases` and `solves` are inline
 * lists, `favourite` is `true` or absent.
 */
export const KB_KEYS = ['aliases', 'solves', 'favourite'] as const;

/** Every key a page block may declare; the block is closed. */
export const PAGE_KEYS: readonly string[] = [...REQUIRED, ...OPTIONAL, ...KB_KEYS];

/**
 * Keys the exercise regime allows, and no others (frontmatter-C8). The KB has
 * no exercise tree yet; the regime is held so one can be added under
 * `EXERCISES` without a new gate.
 */
export const EXERCISE_KEYS = ['description', 'area', 'type', 'level', 'tags', 'related'] as const;
export const EXERCISE_TYPES = ['exercise', 'index'] as const;

/** The longest description, in characters: where a search result cuts it off (frontmatter-C4, PAGE-005). */
export const DESCRIPTION_MAX = 160;

/**
 * What is wrong with a description as written (read with `--raw`), or null
 * when nothing is: a block scalar, whose length means nothing, or more than
 * `DESCRIPTION_MAX` characters once one layer of quotes is dropped.
 * Characters, not bytes: an em dash counts once. An empty value is the
 * missing-key finding's, not this one's.
 */
export function descriptionProblem(raw: string): string | null {
  if (/^[>|]/.test(raw)) return 'description is a block scalar — write it as one plain line so its length means something';
  const quoted = raw.length > 1 && ((raw.startsWith('"') && raw.endsWith('"')) || (raw.startsWith("'") && raw.endsWith("'")));
  const length = [...(quoted ? raw.slice(1, -1) : raw)].length;
  return length > DESCRIPTION_MAX ? `description is ${String(length)} characters — ${String(DESCRIPTION_MAX)} is where search results cut off` : null;
}
