/**
 * The one search ranking this repository has: how a query is scored against
 * pages (spec kb.pagedata.search, ranking). Pure functions, no DOM, no file
 * system, no imports, because two very different programs run it:
 *
 *   site/src/components/Search/search.client.ts   the search box, bundled into
 *                                                 kb.js and run from a folder
 *   tools/src/kb/**                               kb.mjs v2's `find` and `brief`
 *
 * `rankItems` is the rule. It is generic over what it ranks: the search box
 * hands it payload pages (`searchPages` below does that), kb.mjs hands it its
 * catalog rows, and each says through `factsOf` where a page's declared facts
 * are. The shapes after it are the site's contract with
 * tools/src/site/gen-search-index.ts, which writes `window.kb`.
 *
 * What a reader expects, in order: the page with that name, then the pages
 * filed under that word (its category), then the pages tagged with it, and
 * last the pages that say it. Two kinds of query are typed, and they are
 * ranked differently:
 *
 *   A lookup, one or two words ("circuit breaker", "gen", "ai", "resilience",
 *   "case study"). Each word scores the best tier it is found in: the title,
 *   then an alias or the id, the category, a tag (its id or its label), a
 *   `solves` phrase, the description, a heading, the prose. A tier is worth
 *   more than the one under it even at its worst (a word start against a whole
 *   word), so a title hit always beats a category hit and a category hit
 *   always beats a tag hit; the other tiers a page also reaches add a tenth of
 *   their value, which orders pages of one tier. A query equal to a page's id,
 *   title or alias adds EXACT_BONUS, and one equal to a category (the word
 *   "case study" is the category of every case study) adds CATEGORY_BONUS. A
 *   lookup lists every page that has the word.
 *
 *   A description, three words or more ("one slow dependency blocks my
 *   threads"). A name match is usually by chance there, and what the page says
 *   matters more than what it is called, so the words score by DESCRIPTION_WEIGHTS
 *   with the `solves` phrase the query is about counted most, and only the
 *   pages within SCORE_BAND of the best are listed.
 *
 * A word matches whole, at the start of a word, or inside one from four
 * letters (`wordHit`): "ai" is a word and never "maintain", and "gen" starts
 * "generation" and is not in "agent". A query keeps its two-letter words
 * ("ai", "ml", "cb"), and drops the function words in STOP. A synonym from
 * docs/data/search-synonyms.json or a stem scores half.
 *
 * Measured over the page tree (418 pages, 367 with `solves`), facts only as
 * the search box reads them, in per cent:
 *
 *   query                                          top-1    top-3
 *   a page's first `solves` phrase, as written      99.7     100.0
 *   the same, each long word's plural flipped       99.7     100.0
 *   a page's title                                  99.3     100.0
 *   a one-word title with one adjacent swap         98.2      99.1
 *   an alias (753 of them)                          99.7    100.0
 *
 * An alias counts as found when a page that owns the name is first: 20 names
 * belong to two or three pages ("blob storage", "authn"), and only one of them
 * can lead. The two real misses are "pipeline" and "message brokers", each
 * also another page's title. Through kb.mjs `find`, which reads the prose
 * too: the `solves` phrase as written 99.2, plural flipped 98.6, over both
 * 98.9 top-1 and 99.9 top-3.
 * A kind word ("case study", "pattern", "hazard", "principle", "theme",
 * "comparison", "capability") fills the first ten hits with that kind. The
 * search oracle (docs/data/search-oracle.json, check-search-oracle.ts) holds
 * the named queries on both paths. The spec's rule, one fuzzy subsequence of
 * the title, headings, tags and body, lists nothing for a sentence, which is
 * never a dense subsequence of anything but itself, and is not used.
 *
 * It keeps the spec's parts that do not compete with the rule: the one-typo
 * retry (search-C10), the area boost (C8), the anchor rule (C9) and the
 * glossary match. The site's search box and kb.mjs find both score through it.
 */

// ---------------------------------------------------------------------------
// The rule
// ---------------------------------------------------------------------------

/** A page's declared facts: all the rule reads besides its prose. */
export interface Facts {
  /** The page's slug. */
  readonly id: string;
  readonly title: string;
  readonly description: string;
  readonly aliases: readonly string[];
  /** Tag ids and their labels: a reader types either ("machine-learning", "Machine learning"). */
  readonly tags: readonly string[];
  /**
   * The shelves the page sits on: its area chain's labels, outermost first,
   * then its kind in the words a reader uses ("Patterns", "Network",
   * "Resilience", "pattern"; "Case Studies", "Foundational", "case study").
   */
  readonly categories: readonly string[];
  /** Symptom phrases: what someone types when this page is the answer. */
  readonly solves: readonly string[];
  /**
   * The page's headings and row labels. They score at the lowest weight, with
   * every other field a term is found in but no named one, so a query only a
   * heading answers still lists its page, and the anchor rule lands on it.
   */
  readonly headings?: readonly string[];
}

/** A page's prose, indexed: per word the number of lines holding it and the first of them, plus its length. */
export interface Prose {
  readonly hits: ReadonlyMap<string, { n: number; line: string }>;
  readonly tokens: number;
}

/** Query word → the words it also stands for. */
export type Synonyms = Readonly<Record<string, readonly string[]>>;

/** One ranked item: its score, and the prose line that matched when prose was read. */
export interface Scored<T> {
  readonly item: T;
  readonly score: number;
  readonly why: string | null;
}

/** The query words that are never scored. */
export const STOP: ReadonlySet<string> = new Set([
  'the', 'and', 'for', 'are', 'but', 'not', 'you', 'all', 'any', 'can',
  'with', 'that', 'this', 'from', 'into', 'when', 'what', 'why', 'how', 'does', 'has', 'have',
  'its', 'his', 'her', 'their', 'them', 'they', 'was', 'were', 'will', 'would', 'should',
  'is', 'to', 'of', 'in', 'on', 'my', 'it', 'an', 'or', 'be', 'do', 'as', 'at', 'by', 'if', 'we', 'no', 'so', 'up', 'me', 'us', 'he',
]);

/** Own-property lookup, so a query word like `constructor` never reads Object.prototype. */
export function own(map: Synonyms, key: string): readonly string[] {
  return Object.prototype.hasOwnProperty.call(map, key) ? (map[key] as readonly string[]) : [];
}

/** Query words worth scoring: two letters or more, not a stopword, each once. */
export function queryTerms(q: string): string[] {
  return [...new Set(q.toLowerCase().split(/\s+/).filter((t) => t.length > 1 && !STOP.has(t)))];
}

const WORD_CHAR = /[a-z0-9]/;

/** How one occurrence of `v` at `i` in `text` counts: 2 whole word, 1 word start or long substring, 0 not at all. */
function strengthAt(text: string, i: number, v: string): 0 | 1 | 2 {
  const before = i === 0 || !WORD_CHAR.test(text.charAt(i - 1));
  const after = i + v.length >= text.length || !WORD_CHAR.test(text.charAt(i + v.length));
  if (before && after) return 2;
  if (v.length <= 2) return 0;
  return before || v.length >= 4 ? 1 : 0;
}

/**
 * How `v` is in `text` (both lower case): 2 when it is a whole word, 1 when
 * it starts a word, and inside a word only when `v` is four letters or more.
 * A word of one or two letters counts whole only, so "ai" never finds "maintain"
 * or "aim", and a three-letter word must start a word, so "gen" finds
 * "generation" and not "agent". Every field match in this file goes through it.
 */
export function wordHit(text: string, v: string): 0 | 1 | 2 {
  if (v === '') return 0;
  let best: 0 | 1 | 2 = 0;
  for (let i = text.indexOf(v); i >= 0; i = text.indexOf(v, i + 1)) {
    const s = strengthAt(text, i, v);
    if (s === 2) return 2;
    if (s > best) best = s;
  }
  return best;
}

/** The best `wordHit` of `v` over a list of texts. */
function bestHit(list: readonly string[], v: string): 0 | 1 | 2 {
  let best: 0 | 1 | 2 = 0;
  for (const text of list) {
    const h = wordHit(text, v);
    if (h > best) best = h;
    if (best === 2) break;
  }
  return best;
}

/** The most query terms a lookup has; a query of more is a description. */
export const LOOKUP_MAX_TERMS = 2;

/** Is `q` a lookup (a name, a shelf, a tag) and not a description of a symptom? */
export function isLookup(q: string): boolean {
  return queryTerms(q.toLowerCase()).length <= LOOKUP_MAX_TERMS;
}

/** The bonus a query equal to a page's id, title or alias adds: the named page comes first. */
export const EXACT_BONUS = 1000;

/**
 * The bonus a query equal to one of a page's categories adds: "case study"
 * lists every case study, "resilience" every page on that shelf, before a
 * page that only says the words. Low enough that the area boost (1.25 times)
 * never lifts a shelf page above the page the query names.
 */
export const CATEGORY_BONUS = 700;

/**
 * A lookup's tiers, the value of the best place a term is found in. A hit in
 * a tier at the word-start rate is worth more than a whole-word hit in the tier
 * under it plus the tie-break on top of that, so a title hit always beats a
 * category hit, a category hit any tag hit, and so on down. Prose counts up to
 * three mentions, which stay under the lowest named tier at its word-start rate.
 */
export const TIERS = { title: 100, alias: 60, category: 30, tag: 15, solves: 8, description: 4, headings: 2, body: 0.3 } as const;

/** A lookup term's value: its best tier plus this share of the other tiers it also reached. */
export const TIE_SHARE = 0.1;

/** What a word start is worth against a whole word in a lookup. */
export const START_RATE = 0.7;

/**
 * A description's weights: where a term was found, per field. A long query is
 * a symptom, where a name match is usually by chance and what the page says
 * matters more than what it is called.
 */
export const DESCRIPTION_WEIGHTS = { id: 2, name: 2, solves: 6, tags: 3, categories: 2, essence: 3, curated: 1, body: 2 } as const;

/**
 * What a `solves` word is worth when it sits in a phrase other than the best
 * one, as a share of its worth in the best one. A symptom is often worded
 * differently from any one phrase of the page that answers it, so a page
 * whose phrases between them cover the words is still a fair answer, though
 * a weaker one than a page whose one phrase covers them. Only the word as
 * typed and its stem count there; a synonym never reaches into a phrase that
 * is not the best one.
 */
export const OTHER_SOLVES_SHARE = 0.5;

/**
 * The share of a symptom's words one `solves` phrase of a case study must
 * cover for the case study to be listed as an answer to it. A case study is
 * one worked system, and its phrases say what that system's design problems
 * are; a symptom that only brushes one of them ("one slow dependency blocks
 * my threads" against "one slow file write blocks my console output") is
 * answered by the pattern page, which comes first.
 */
export const DESIGN_COVER = 0.75;

/** What a case study's score is multiplied by when its best phrase covers less than DESIGN_COVER. */
export const DESIGN_DAMP = 0.5;

/**
 * Six suffix rules, the first that fits wins. Not a stemmer and not trying to
 * be one: it lets "threads" or "blocked" reach a page that says "thread" and
 * "blocks". A bad stem is cheap, because matching is by word and the word
 * as typed still scores in full; a stem scores half.
 */
const STEM_RULES: readonly (readonly [RegExp, number, (w: string) => string])[] = [
  [/ies$/, 6, (w) => `${w.slice(0, -3)}y`],
  [/(?:ss|sh|ch|x|z)es$/, 6, (w) => w.slice(0, -2)],
  [/[^s]s$/, 5, (w) => w.slice(0, -1)],
  [/ing$/, 7, (w) => w.slice(0, -3)],
  [/ied$/, 6, (w) => `${w.slice(0, -3)}y`],
  [/ed$/, 6, (w) => w.slice(0, -2)],
];

/**
 * The one suffix rule that fits, or null. Each rule's minimum length leaves at
 * least four letters and always changes the word, so no further guard is needed.
 */
export function stemVariant(term: string): string | null {
  const rule = STEM_RULES.find(([re, min]) => term.length >= min && re.test(term));
  return rule === undefined ? null : rule[2](term);
}

/** A term's variants in scoring order: itself in full, then its synonyms and its stem at half. */
export function termVariants(term: string, syn: Synonyms): string[] {
  const out = [term, ...own(syn, term)];
  const stem = stemVariant(term);
  if (stem !== null && !out.includes(stem)) out.push(stem);
  return out;
}

/**
 * Index prose lines for the rule: lines split again at sentence ends, only
 * lines longer than 25 characters, each word of three letters or more counted
 * once per line. `tokens` is the page's length, for the long-page deflation.
 */
export function indexProse(lines: readonly string[]): Prose {
  const text = lines.join('\n').replace(/[ \t]+/g, ' ');
  const hits = new Map<string, { n: number; line: string }>();
  for (const raw of text.split(/\n|(?<=[.!?])\s+/)) {
    const line = raw.trim();
    if (line.length <= 25) continue;
    for (const w of new Set(line.toLowerCase().split(/[^a-z]+/).filter((x) => x.length > 2))) {
      const cur = hits.get(w);
      if (cur !== undefined) cur.n += 1;
      else hits.set(w, { n: 1, line });
    }
  }
  return { hits, tokens: (text.toLowerCase().match(/[a-z]{3,}/g) ?? []).length };
}

/** Lower-cased, every run of anything but a letter or digit one space. */
export const normalize = (text: string): string =>
  text
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, ' ')
    .trim();

interface Indexed<T> {
  readonly item: T;
  readonly id: string;
  readonly name: string;
  readonly essence: string;
  readonly aliases: readonly string[];
  readonly tags: readonly string[];
  readonly categories: readonly string[];
  readonly solves: readonly string[];
  readonly headings: readonly string[];
  /** Every `solves` phrase joined: whether looking for a best phrase is worth it. */
  readonly solvesText: string;
  /** Every field joined, categories too: a variant absent here is absent from all of them. */
  readonly hay: string;
  /** The declared facts' length, for the tie-break: fewer facts is the more specific page. */
  readonly size: number;
  /** The normalized names a whole query may equal. */
  readonly names: ReadonlySet<string>;
  readonly shelves: ReadonlySet<string>;
}

function indexFacts<T>(items: readonly T[], factsOf: (item: T) => Facts): Indexed<T>[] {
  return items.map((item) => {
    const f = factsOf(item);
    const declared = [f.id, f.title, f.description, ...f.aliases, ...f.tags, ...f.solves, ...(f.headings ?? [])].join(' ').toLowerCase();
    return {
      item,
      id: f.id,
      name: f.title.toLowerCase(),
      essence: f.description.toLowerCase(),
      aliases: f.aliases.map((a) => a.toLowerCase()),
      tags: f.tags.map((t) => t.toLowerCase()),
      categories: f.categories.map((c) => c.toLowerCase()),
      solves: f.solves.map((s) => s.toLowerCase()),
      headings: (f.headings ?? []).map((h) => h.toLowerCase()),
      solvesText: f.solves.join(' ').toLowerCase(),
      hay: `${declared} ${f.categories.join(' ').toLowerCase()}`,
      size: declared.length,
      names: new Set([f.id, f.title, ...f.aliases].map(normalize)),
      shelves: new Set(f.categories.map(normalize)),
    };
  });
}

/**
 * The one `solves` phrase the query is about: the one covering the most query
 * terms, the first winning a tie. Scoring every phrase would give a page with
 * five of them five times the surface, and let a long page collect one word
 * from one symptom and the next from another it never wrote together.
 */
function bestSolvesPhrase(solves: readonly string[], variantsByTerm: readonly string[][], curatedHit: Uint8Array, offset: readonly number[]): string | null {
  let best: string | null = null;
  let bestN = 0;
  for (const phrase of solves) {
    let n = 0;
    variantsByTerm.forEach((vs, j) => {
      const base = offset[j] as number;
      if (vs.some((v, k) => curatedHit[base + k] === 1 && wordHit(phrase, v) > 0)) n += 1;
    });
    if (n > bestN) {
      bestN = n;
      best = phrase;
    }
  }
  return best;
}

/** A word start counts START_RATE of a whole word; no hit counts nothing. */
const strength = (h: 0 | 1 | 2): number => (h === 2 ? 1 : h === 1 ? START_RATE : 0);

/** One variant's value in a lookup: its best tier, plus TIE_SHARE of the other tiers it reached. */
function lookupValue<T>(e: Indexed<T>, v: string): number {
  const tiers = [
    TIERS.title * strength(wordHit(e.name, v)),
    TIERS.alias * strength(Math.max(wordHit(e.id, v), bestHit(e.aliases, v)) as 0 | 1 | 2),
    TIERS.category * strength(bestHit(e.categories, v)),
    TIERS.tag * strength(bestHit(e.tags, v)),
    TIERS.solves * strength(bestHit(e.solves, v)),
    TIERS.description * strength(wordHit(e.essence, v)),
    TIERS.headings * strength(bestHit(e.headings, v)),
  ];
  const top = Math.max(...tiers);
  return top + (TIE_SHARE * (tiers.reduce((a, b) => a + b, 0) - top));
}

export interface RankInput<T> {
  readonly q: string;
  /** Where each item's declared facts are. */
  readonly factsOf: (item: T) => Facts;
  readonly syn?: Synonyms;
  /** An item's prose. Omit it and only the declared facts score. */
  readonly bodyOf?: (item: T) => Prose;
  readonly limit?: number;
}

/**
 * Score `q` against `items`, best first; an item that matched nothing is not
 * listed. A query equal to an item's id, title or alias adds EXACT_BONUS, and
 * one equal to a category CATEGORY_BONUS. The rest depends on how long the
 * query is, because two kinds of query are typed:
 *
 *   a lookup (one or two words) is a name, a shelf or a tag: each word scores
 *   its best place, by TIERS (title, then alias or id, category, tag,
 *   `solves`, description, headings, prose), so the page named by the word
 *   beats the page filed under it, which beats the page merely tagged with it;
 *
 *   a description (three words or more) is a symptom: each word scores its
 *   best variant by DESCRIPTION_WEIGHTS, the `solves` phrase most of all.
 *
 * Either way a word counts whole, at a word start, or inside a word when it
 * has four letters or more (`wordHit`); a synonym or a stem counts half; prose
 * mentions count up to three, deflated on pages longer than the average; and
 * the sum is raised by the share of words that matched at all: covering more
 * of what was asked beats saying one word a lot.
 *
 * A tie goes to the item with fewer declared facts (its joined facts are
 * shorter), then to the smaller id, so the order never depends on the order
 * items arrive in, and the search box and kb.mjs agree. A page that matched as
 * much while saying less is the more specific answer.
 */
export function rankItems<T>(items: readonly T[], { q, factsOf, syn = {}, bodyOf, limit }: RankInput<T>): Scored<T>[] {
  const index = indexFacts(items, factsOf);
  const whole = normalize(q);
  const terms = queryTerms(q.toLowerCase());
  const lookup = isLookup(q);
  const W = DESCRIPTION_WEIGHTS;
  const variantsByTerm = terms.map((t) => termVariants(t, syn));
  const flat: string[] = [];
  const offset: number[] = [];
  for (const vs of variantsByTerm) {
    offset.push(flat.length);
    flat.push(...vs);
  }
  const curatedHit = new Uint8Array(flat.length);
  const bodies = bodyOf === undefined ? null : index.map((e) => bodyOf(e.item));
  const Lavg = bodies !== null && bodies.length > 0 ? bodies.reduce((a, b) => a + b.tokens, 0) / bodies.length : 0;

  const out: (Scored<T> & { readonly size: number; readonly id: string })[] = [];
  index.forEach((e, i) => {
    const body = bodies?.[i] ?? null;
    const norm = body !== null && Lavg > 0 ? Math.max(1, 0.25 + (0.75 * body.tokens) / Lavg) : 1;
    let bonus = 0;
    if (whole !== '' && e.names.has(whole)) bonus += EXACT_BONUS;
    if (whole !== '' && e.shelves.has(whole)) bonus += CATEGORY_BONUS;
    let phrase: string | null = null;
    if (!lookup) {
      let touchesSolves = false;
      flat.forEach((v, k) => {
        const h = wordHit(e.hay, v) > 0;
        curatedHit[k] = h ? 1 : 0;
        if (h && wordHit(e.solvesText, v) > 0) touchesSolves = true;
      });
      phrase = touchesSolves ? bestSolvesPhrase(e.solves, variantsByTerm, curatedHit, offset) : null;
    }

    let why: string | null = null;
    let matched = 0;
    let sum = 0;
    let covered = 0;
    terms.forEach((_, ti) => {
      const variants = variantsByTerm[ti] as string[];
      let best = 0;
      let bestWhy: string | null = null;
      variants.forEach((t, vi) => {
        const mult = vi === 0 ? 1 : 0.5;
        let s = 0;
        let line: string | null = null;
        const hits = body?.hits.get(t);
        if (lookup) {
          s = lookupValue(e, t);
          if (hits !== undefined) s += (Math.min(hits.n, 3) * TIERS.body) / norm;
        } else {
          if (curatedHit[(offset[ti] as number) + vi] === 1) {
            if (wordHit(e.id, t) > 0) s += W.id;
            if (wordHit(e.name, t) > 0) s += W.name;
            if (phrase !== null && wordHit(phrase, t) > 0) s += W.solves;
            else if (phrase !== null && (vi === 0 || t === stemVariant(terms[ti] as string)) && wordHit(e.solvesText, t) > 0) s += W.solves * OTHER_SOLVES_SHARE;
            if (bestHit(e.tags, t) > 0) s += W.tags;
            if (bestHit(e.categories, t) > 0) s += W.categories;
            // A page with no solves carries its symptom words in the description.
            if (wordHit(e.essence, t) > 0) s += e.solves.length > 0 ? W.essence : W.solves;
            else s += W.curated;
          }
          if (hits !== undefined) s += (Math.min(hits.n, 3) * W.body) / norm;
        }
        if (hits !== undefined) line = hits.line;
        if (s * mult > best) {
          best = s * mult;
          bestWhy = line;
        }
      });
      if (best > 0) {
        sum += best;
        matched += 1;
        why ??= bestWhy;
      }
      if (phrase !== null && variants.some((v) => wordHit(phrase as string, v) > 0)) covered += 1;
    });
    let score = sum * (1 + matched / Math.max(terms.length, 1));
    if (!lookup && e.categories.includes('case study') && covered < DESIGN_COVER * terms.length) score *= DESIGN_DAMP;
    score += bonus;
    if (score > 0) out.push({ item: e.item, score, why, size: e.size, id: e.id });
  });
  out.sort((a, b) => b.score - a.score || a.size - b.size || (a.id < b.id ? -1 : a.id > b.id ? 1 : 0));
  const ranked = out.map(({ item, score, why }) => ({ item, score, why }));
  return limit === undefined ? ranked : ranked.slice(0, limit);
}

// ---------------------------------------------------------------------------
// The payload, and the search box's use of the rule
// ---------------------------------------------------------------------------

/**
 * One page in the payload, as gen-search-index.ts writes it: the page's
 * declared facts and the places a hit can land, never its prose. Search is a
 * way to reach a page, and the facts are all the rule ranks by.
 */
export interface SearchPage {
  /** Path from the built site's root, e.g. `/patterns/gof/creational/builder.html`. */
  route: string;
  title: string;
  /**
   * What sort of page it is: the id of the top area its own area nests under
   * in docs/data/site-structure.json (`patterns`, `hazards`, `designs`, …,
   * `reference`, `map`), which is its own area for a top area's page.
   */
  kind: string;
  description: string;
  area: string;
  /** The page's declared status: draft, stable or deprecated (maturity-C6). */
  status: string;
  tags: string[];
  /** The shelves the page sits on: its area chain's labels, then its kind (`Facts.categories`). */
  categories: string[];
  aliases: string[];
  solves: string[];
  /** Every H2 and H3 of the manifest, then every row anchor: each place a hit can land. */
  headings: { id: string; text: string }[];
  /**
   * The page's prerequisite edges (prerequisites-C9), each the neighbour
   * pages' routes in docs/data/prerequisites.json's order; absent on a page
   * with no edge.
   */
  requires?: string[];
  related?: string[];
  /** The page's own `favourite: true` (an editors' pick); absent otherwise. The marks page lists these as "Suggested". */
  favourite?: true;
}

/**
 * One heading as the payload file spells it: the bare text when it has no id
 * (nothing to land on), else `[id, text]`. A pair is a third the size of
 * `{ id, text }` and a bare string a seventh, over some eight thousand headings.
 */
export type WireHeading = string | readonly [id: string, text: string];

/** A page as `window.kb` holds it: a `SearchPage` whose headings are wire headings. */
export type WirePage = Omit<SearchPage, 'headings'> & { headings: readonly WireHeading[] };

/** Headings for the wire, in order; none is dropped, since each one is scored. */
export function encodeHeadings(headings: readonly { id: string; text: string }[]): WireHeading[] {
  return headings.map((h) => (h.id === '' ? h.text : [h.id, h.text]));
}

/**
 * The wire's headings back to `{ id, text }`; the reader of the payload runs
 * this once per page. An `{ id, text }` object is kept as it is, so a payload
 * built before the compact form still reads.
 */
export function decodeHeadings(wire: readonly (WireHeading | { id: string; text: string })[]): { id: string; text: string }[] {
  return wire.map((h) => {
    if (typeof h === 'string') return { id: '', text: h };
    return Array.isArray(h) ? { id: h[0] as string, text: h[1] as string } : (h as { id: string; text: string });
  });
}

/** A wire page as a `SearchPage`. */
export function decodePage(page: WirePage | SearchPage): SearchPage {
  return { ...page, headings: decodeHeadings(page.headings) };
}

/** One glossary term, as gen-search-index.ts copies it from docs/data/glossary.json. */
export interface SearchTerm {
  id: string;
  term: string;
  definition: string;
  aliases: string[];
}

/** What `window.kb` holds, once its pages are decoded. */
export interface SearchPayload {
  pages: SearchPage[];
  terms: SearchTerm[];
  /** Tag id → label, so a reader who types the label finds the tag's pages. */
  tagLabels: Record<string, string>;
  /** The search synonym table the rule scores with, curated over expansions. */
  synonyms: Record<string, string[]>;
}

/** `window.kb` as the file spells it: the payload with wire pages. */
export type WirePayload = Omit<SearchPayload, 'pages'> & { pages: WirePage[] };

/** Tag id → label. */
export type TagLabels = Readonly<Record<string, string>>;

/** The page kinds: the top area's id, kb.mjs's kind, and the words a reader types for it. */
const KINDS: readonly (readonly [area: string, kind: string, word: string])[] = [
  ['patterns', 'pattern', 'pattern'],
  ['hazards', 'hazard', 'hazard'],
  ['designs', 'design', 'case study'],
  ['themes', 'theme', 'theme'],
  ['principles', 'principle', 'principle'],
  ['capabilities', 'capability', 'capability'],
  ['comparisons', 'comparison', 'comparison'],
];

/** The words a reader types for a kind, given its kb.mjs kind (`design`) or its top area id (`designs`); empty for neither. */
export function kindWord(kind: string): string {
  return KINDS.find(([area, id]) => area === kind || id === kind)?.[2] ?? '';
}

/** The kb.mjs kind of a top area id (`designs` → `design`), or the id itself when it names no kind. */
export function kindOfArea(area: string): string {
  return KINDS.find(([id]) => id === area)?.[1] ?? area;
}

/** A page's categories: its area chain's labels, outermost first, then its kind's word when it has one. */
export function pageCategories(chainLabels: readonly string[], kind: string): string[] {
  const word = kindWord(kind);
  return word === '' ? [...chainLabels] : [...chainLabels, word];
}

/**
 * A payload page's facts: its slug is its route's last part, less `.html`,
 * and each tag id is joined by its label when `tagLabels` has one.
 */
export function pageFacts(page: SearchPage, tagLabels: TagLabels = {}): Facts {
  const last = page.route.slice(page.route.lastIndexOf('/') + 1);
  return {
    id: last.replace(/\.html$/, ''),
    title: page.title,
    description: page.description,
    aliases: page.aliases,
    tags: page.tags.flatMap((t) => (Object.prototype.hasOwnProperty.call(tagLabels, t) ? [t, tagLabels[t] as string] : [t])),
    categories: page.categories,
    solves: page.solves,
    headings: page.headings.map((h) => h.text),
  };
}

/**
 * A page in the reader's own area scores this many times more (search-C8). A
 * multiplier, so a page that matched nothing is still not listed.
 */
export const AREA_BOOST = 1.25;

/** One listed page, and the heading a reader lands on when a heading is why it matched. */
export interface PageHit {
  page: SearchPage;
  score: number;
  anchor: string | null;
}

/** How much of a query's terms a text holds: each term's best variant, a stem or synonym at half. */
function coverage(text: string, variantsByTerm: readonly string[][]): number {
  const low = text.toLowerCase();
  let sum = 0;
  for (const vs of variantsByTerm) {
    const at = vs.findIndex((v) => wordHit(low, v) > 0);
    if (at >= 0) sum += at === 0 ? 1 : 0.5;
  }
  return sum;
}

/**
 * The heading to land on, or null (search-C9): the heading, or row anchor,
 * holding the most of the query's terms, the first winning a tie, offered only
 * when two times its share beats three times the title's, so a reader who typed
 * the title is never scrolled past it. An empty id offers nothing.
 */
export function anchorFor(page: SearchPage, q: string, syn: Synonyms = {}): string | null {
  const variantsByTerm = queryTerms(q).map((t) => termVariants(t, syn));
  let best: { id: string; score: number } | null = null;
  for (const h of page.headings) {
    const score = coverage(h.text, variantsByTerm);
    if (score > 0 && (best === null || score > best.score)) best = { id: h.id, score };
  }
  if (best === null || best.id === '') return null;
  return 2 * best.score > 3 * coverage(page.title, variantsByTerm) ? best.id : null;
}

export interface SearchOptions {
  /** The area of the page being read: its pages score AREA_BOOST times more. */
  readonly area?: string;
  readonly syn?: Synonyms;
  /** Tag id → label, read as facts beside the ids. */
  readonly tagLabels?: TagLabels;
}

/**
 * The band a description's result must score within to be listed: at least
 * this share of the best hit's score. A lookup has no band: it lists every page
 * that has the word, and the tiers order them. A symptom sentence weakly matches most of the corpus —
 * "my thread pool is exhausted" names a word on forty pages — and a list of
 * forty buries the five that answer it. The HTML hub's search keeps the same
 * band (site/assets/search.js, `max * 0.35`); the CLI lists by rank and a
 * limit instead, so `rankItems` itself applies none.
 */
export const SCORE_BAND = 0.35;

/**
 * The search box's ranking: `rankItems` over the payload's declared facts,
 * the area boost, the score band (a description's only), then each hit's anchor; a tie after the
 * boost keeps `rankItems`' order. It reads no prose:
 * the fixture scores the facts alone best, and the payload carries none, so
 * the box downloads the site's facts and nothing more before its first result.
 */
export function searchPages(q: string, pages: readonly SearchPage[], { area, syn = {}, tagLabels = {} }: SearchOptions = {}): PageHit[] {
  const boost = (page: SearchPage): number => (area !== undefined && page.area === area ? AREA_BOOST : 1);
  const scored = rankItems(pages, { q, factsOf: (p) => pageFacts(p, tagLabels), syn }).map((s) => ({ item: s.item, score: s.score * boost(s.item) }));
  const best = Math.max(0, ...scored.map((s) => s.score));
  // A lookup lists every page that has the word, best tier first: the tiers
  // already put the named page above the tagged one. Only a description is cut.
  return scored
    .filter((s) => isLookup(q) || s.score >= best * SCORE_BAND)
    .map((s) => ({ page: s.item, score: s.score, anchor: anchorFor(s.item, q, syn) }))
    .sort((a, b) => b.score - a.score);
}

// ---------------------------------------------------------------------------
// The one-typo retry (search-C10)
// ---------------------------------------------------------------------------

/**
 * The shortest and longest query worth retrying after a typo. Under three
 * characters every edit is another word, not a correction; past 24 a query is
 * a sentence, one wrong character is not why it found nothing, and the
 * variants (36 per character) stop being cheap on a keystroke.
 */
export const RETRY_MIN_LENGTH = 3;
export const RETRY_MAX_LENGTH = 24;

/** What a mistyped character could have been: a lower-case letter or a digit. */
const ALPHABET = 'abcdefghijklmnopqrstuvwxyz0123456789';

/**
 * Every query one typo away, in the order they are tried: adjacent swaps first
 * (the commonest typo, and one the others cannot reach: "brekaer" is two
 * replacements from "breaker" and one swap), then single replacements by a
 * letter or digit, then single deletions. Never insertions: they turn a short
 * query into a long list of other plausible words.
 */
export function variants(query: string): string[] {
  const q = normalize(query);
  if (q.length < RETRY_MIN_LENGTH || q.length > RETRY_MAX_LENGTH) return [];
  const out: string[] = [];
  const seen = new Set([q]);
  const add = (candidate: string): void => {
    const v = normalize(candidate);
    if (v.length < 2 || seen.has(v)) return;
    seen.add(v);
    out.push(v);
  };
  for (let i = 0; i + 1 < q.length; i += 1) add(q.slice(0, i) + q.charAt(i + 1) + q.charAt(i) + q.slice(i + 2));
  for (let i = 0; i < q.length; i += 1) {
    for (const ch of ALPHABET) if (ch !== q[i]) add(q.slice(0, i) + ch + q.slice(i + 1));
  }
  for (let i = 0; i < q.length; i += 1) add(q.slice(0, i) + q.slice(i + 1));
  return out;
}

/** The words a page names itself with: its title, description, tags, aliases and headings. */
function names(page: SearchPage): string[] {
  return [page.title, page.description, ...page.tags, ...page.aliases, ...page.headings.map((h) => h.text)].map(normalize);
}

/** What `searchWithRetry` found, and which query found it. */
export interface Ranked {
  /** The query the hits answer: what was typed, or the correction that worked. */
  query: string;
  hits: PageHit[];
  /** True when `query` is not what the reader typed; the surface must say so. */
  retried: boolean;
}

/**
 * `searchPages`, and one more try when it lists nothing. A variant is ranked
 * only when it is found whole in some page's names, so the retry never offers
 * a word this site does not use; the first variant that lists a page wins,
 * and the caller names it beside the query.
 */
export function searchWithRetry(q: string, pages: readonly SearchPage[], options: SearchOptions = {}): Ranked {
  const hits = searchPages(q, pages, options);
  if (hits.length > 0) return { query: q, hits, retried: false };
  const corpus = pages.map(names);
  for (const variant of variants(q)) {
    if (!corpus.some((fields) => fields.some((field) => field.includes(variant)))) continue;
    const again = searchPages(variant, pages, options);
    if (again.length > 0) return { query: variant, hits: again, retried: true };
  }
  return { query: q, hits, retried: false };
}

// ---------------------------------------------------------------------------
// Glossary cards and snippets
// ---------------------------------------------------------------------------

/** The glossary terms a query asks for: the ones it names, and the ones it only begins to type. */
export interface TermMatches {
  /** The query is the term or one of its aliases, or that name followed by more words. */
  readonly exact: SearchTerm[];
  /** The query is the start of a name ("gen" → "generalizes"): a guess, which a reader may not want above the pages. */
  readonly loose: SearchTerm[];
}

/**
 * Glossary terms the query asks for. A definition card says "this is what the
 * word means", and a loose overlap would put the wrong one above the right
 * page, so the two kinds are told apart and the caller places them: exact
 * above the pages, loose below. A term is exact when the query equals its name
 * or an alias, or is that name followed by more words; loose when the query
 * is only the start of a name.
 */
export function matchTerms(query: string, terms: readonly SearchTerm[]): TermMatches {
  const q = normalize(query);
  if (q.length < 2) return { exact: [], loose: [] };
  const names = (term: SearchTerm): string[] => [term.term, ...term.aliases].map(normalize);
  const exact = terms.filter((term) => names(term).some((name) => name === q || q.startsWith(`${name} `)));
  const loose = terms.filter((term) => !exact.includes(term) && names(term).some((name) => name.startsWith(q)));
  return { exact, loose };
}

/** One stretch of a snippet: `hit` is a query word, and gets a mark. */
export interface SnippetRun {
  text: string;
  hit: boolean;
}

/** How much text a result row shows (interfaces/manifest-and-search.md: 160 characters). */
export const SNIPPET_WIDTH = 160;

/**
 * The line or sentence of `body` holding the most of the query's terms, cut to about
 * `width` characters around its first match, as plain runs and marked runs,
 * each cut end an ellipsis; empty when no sentence holds a term. A body that
 * opens with `description` has that stretch skipped, since the row already
 * shows it. The search box hands it a page's `solves` phrases, one per line,
 * so a row says which symptom it answers. Runs keep markup out of this file:
 * the caller appends a text node per run and a mark per hit.
 */
export function snippet(q: string, body: string, description = '', syn: Synonyms = {}, width = SNIPPET_WIDTH): SnippetRun[] {
  const variantsByTerm = queryTerms(q).map((t) => termVariants(t, syn));
  const words = [...new Set(variantsByTerm.flat())].sort((a, b) => b.length - a.length);
  if (words.length === 0) return [];
  const prose = description !== '' && body.startsWith(description) ? body.slice(description.length) : body;
  let best = '';
  let bestScore = 0;
  for (const raw of prose.split(/\n|(?<=[.!?])\s+/)) {
    const score = coverage(raw, variantsByTerm);
    if (score > bestScore) {
      bestScore = score;
      best = raw.trim();
    }
  }
  if (bestScore === 0) return [];

  const low = best.toLowerCase();
  const marks: [number, number][] = [];
  for (let i = 0; i < low.length; ) {
    const w = words.find((x) => low.startsWith(x, i) && strengthAt(low, i, x) > 0);
    if (w === undefined) i += 1;
    else {
      marks.push([i, i + w.length]);
      i += w.length;
    }
  }
  const [first, firstEnd] = marks[0] as [number, number];
  let left = Math.max(0, Math.min(first - Math.floor(width / 4), best.length - width));
  let right = Math.min(best.length, Math.max(left + width, firstEnd));
  while (left > 0 && left < first && !/\s/.test(best.charAt(left - 1))) left += 1;
  while (right < best.length && right > firstEnd && !/\s/.test(best.charAt(right))) right -= 1;

  const runs: SnippetRun[] = [];
  let cursor = left;
  for (const [s, e] of marks) {
    if (s < left || e > right) continue;
    if (s > cursor) runs.push({ text: best.slice(cursor, s), hit: false });
    runs.push({ text: best.slice(s, e), hit: true });
    cursor = e;
  }
  if (cursor < right) runs.push({ text: best.slice(cursor, right), hit: false });
  if (left > 0) runs.unshift({ text: '…', hit: false });
  if (right < best.length) runs.push({ text: '…', hit: false });
  return runs;
}
