/* search.mjs — the scoring core behind `kb.mjs find` and `kb.mjs brief`.
 *
 * It lives here rather than in kb.mjs so a test can score the whole corpus in-process:
 * indexing the prose costs ~0.4s once, against ~0.5s per process spawn, and the relevance
 * fixture runs thousands of queries.
 *
 * TWO SCORERS, ONE ALGORITHM. site/assets/search.js is a hand-written ES5 twin of
 * everything below — it must run as a plain file:// script, so it cannot import this.
 * The contract is exact: `scoreQuery` WITHOUT a `bodyOf` argument is, number for number,
 * what the hub computes. scripts/test/search-parity.test.mjs asserts it on every query it
 * knows. Change anything here and change search.js in the same commit.
 *
 * The synonym bridge is passed in (curated SYNONYMS from lib/model.mjs layered over the
 * generated table in lib/expansions.mjs); build.mjs projects the same merge into
 * catalog.js so the browser scores the same map.
 *
 * Two different questions wear the same clothes. "circuit breaker" is a lookup — the name
 * is the answer. "one slow dependency blocks my threads" is a description, where a name
 * match is usually incidental (every hit on "dependency" would drag in Dependency
 * Injection) and what the page SAYS matters more than what it is called. Hence two weight
 * tables, chosen by query length.
 */
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { parse } from "../vendor/node-html-parser.mjs";
import { pruneForLens } from "./lens.mjs";
import { own, STOP } from "./expansions.mjs";

/* Query words worth scoring: 3+ letters, not a stopword, each counted once. A repeated
 * word must not score twice. */
export function queryTerms(q) {
  return [...new Set(String(q).toLowerCase().split(/\s+/).filter((t) => t.length > 2 && !STOP.has(t)))];
}

export function weightsFor(terms) {
  return terms.length <= 2
    ? { id: 6, name: 5, solves: 5, tags: 3, essence: 3, curated: 2, body: 1 }
    : { id: 2, name: 2, solves: 6, tags: 3, essence: 3, curated: 1, body: 2 };
}

/* Six suffix rules, first match wins, each with its own minimum length. Not a general
 * stemmer and not trying to be: it exists so a searcher who types "threads" or "blocked"
 * reaches a page whose author wrote "thread" and "blocks".
 *
 * Over-stemming is safe here, and that is why the rules can be this crude. Matching is by
 * substring, so an over-stem is always a PREFIX of the word it came from and can only hit
 * inside the same word family — and the unstemmed term still scores at full weight as
 * variant 0, so a bad stem costs nothing and a good one is worth half a term.
 *
 *   ies -> y   (>=6)   queries -> query      ing  -> ""  (>=7)  blocking -> block
 *   [sxz|ss|sh|ch]es   (>=6)   batches -> batch      ied -> y   (>=6)  retried  -> retry
 *   [^s]s      (>=5)   threads -> thread     ed   -> ""  (>=6)  blocked  -> block
 *
 * Mirrored in site/assets/search.js as window.KB_STEM; search-parity.test.mjs runs the
 * whole corpus vocabulary through both implementations. */
const STEM_RULES = [
  [/ies$/, 6, (w) => w.slice(0, -3) + "y"],
  [/(?:ss|sh|ch|x|z)es$/, 6, (w) => w.slice(0, -2)],
  [/[^s]s$/, 5, (w) => w.slice(0, -1)],
  [/ing$/, 7, (w) => w.slice(0, -3)],
  [/ied$/, 6, (w) => w.slice(0, -3) + "y"],
  [/ed$/, 6, (w) => w.slice(0, -2)],
];

export function stemVariant(term) {
  for (const [re, min, cut] of STEM_RULES) {
    if (term.length < min || !re.test(term)) continue;
    const stem = cut(term);
    return stem.length >= 4 && stem !== term ? stem : null;
  }
  return null;
}

/* Every variant of a term, in scoring order: the term itself at full weight, then its
 * synonyms and its stem at half. Order matters — a tie between variants keeps the first,
 * so both scorers must build this list the same way. */
export function termVariants(term, syn) {
  const out = [term, ...own(syn ?? {}, term)];
  const stem = stemVariant(term);
  if (stem && !out.includes(stem)) out.push(stem);
  return out;
}

/* ---------------- the index ---------------- */

/* Lowercase every field the scorer matches against, once per catalog rather than once per
 * query — the relevance fixture scores the same 354 nodes a thousand times over. */
export function indexNodes(nodes) {
  return nodes.map((n) => ({
    n,
    id: n.id,
    name: (n.name ?? "").toLowerCase(),
    essence: (n.essence ?? "").toLowerCase(),
    aliases: (n.aliases ?? []).map((a) => a.toLowerCase()),
    tags: (n.tags ?? []).map((t) => t.toLowerCase()),
    solves: (n.solves ?? []).map((s) => s.toLowerCase()),
    /* Two concatenations that exist only as miss gates: `curated` covers every field, so a
     * term absent from it is absent from all of them; `solvesText` says whether picking a
     * best `solves` phrase is worth the scan at all. */
    solvesText: (n.solves ?? []).join(" ").toLowerCase(),
    curated: [n.id, n.name, n.essence, ...(n.aliases ?? []), ...(n.tags ?? []), ...(n.solves ?? [])]
      .join(" ").toLowerCase(),
  }));
}

/* ---------------- prose bodies ---------------- */

const PARSE_OPTS = { comment: true };
/* .mentions is the generated "Mentioned by" list: navigation derived from other pages'
 * prose, so indexing it would score a page against words it never wrote. */
const NOISE = "script, style, link, .crumb, .docnav, .doc-metarow, .practice, .mentions";

/* A memoized `bodyOf(node)` over the site's prose: a sentence-level word index plus the
 * page's token count. Reading all pages costs disk, not context — only the output is
 * charged in tokens — so `find` searches the full prose and returns the line that matched.
 *
 * The cache key carries the level: the same path scoped to two reading levels holds two
 * different texts, and a path-only key would serve the wrong one. */
export function proseIndexer(site, level = null) {
  const cache = new Map();
  return function bodyOf(n) {
    const key = level ? `${n.path}@${level}` : n.path;
    const cached = cache.get(key);
    if (cached) return cached;

    const full = parse(readFileSync(join(site, n.path), "utf8"), PARSE_OPTS);
    // Only the visible document — <head> would otherwise contribute the title and the
    // JSON-LD, matching every query against machine metadata rather than prose.
    const root = full.querySelector("main") ?? full;
    for (const el of root.querySelectorAll(NOISE)) el.remove();
    for (const el of root.querySelectorAll("figure.diagram")) el.remove();
    pruneForLens(root, level);

    const text = root.text.replace(/[ \t]+/g, " ");
    const lines = text.split(/\n|(?<=[.!?])\s+/).map((l) => l.trim()).filter((l) => l.length > 25);
    const hits = new Map();
    for (const line of lines) {
      const low = line.toLowerCase();
      for (const w of new Set(low.split(/[^a-z]+/).filter((w) => w.length > 2))) {
        const cur = hits.get(w);
        if (cur) cur.n++;
        else hits.set(w, { n: 1, line });
      }
    }
    const v = { hits, tokens: (text.toLowerCase().match(/[a-z]{3,}/g) ?? []).length };
    cache.set(key, v);
    return v;
  };
}

/* ---------------- the scorer ---------------- */

/* The ONE `solves` phrase a query is really about.
 *
 * Every phrase used to be OR-ed, so a page with five of them had five times the surface
 * area of a page with one, and a long case study could collect `W.solves` for "thread"
 * from one symptom and "blocks" from another it never wrote together. Score the single
 * phrase that covers the most query terms instead: cohesion, not coverage. First phrase
 * wins a tie, and both scorers walk `solves` in catalog order, so the choice is
 * deterministic.
 *
 * Pages with no `solves` — themes — are untouched; they keep scoring their essence at the
 * solves weight. */
/* `curatedHit` narrows the scan to the variants this node can possibly match: a variant
 * absent from `curated` is absent from `solves`, which `curated` contains. On a typical
 * node that leaves one or two variants to try instead of a dozen. */
function bestSolvesPhrase(solves, variantsByTerm, curatedHit, offset) {
  let best = null, bestN = 0;
  for (let i = 0; i < solves.length; i++) {
    const phrase = solves[i];
    let n = 0;
    for (let j = 0; j < variantsByTerm.length; j++) {
      const vs = variantsByTerm[j], base = offset[j];
      for (let k = 0; k < vs.length; k++) {
        if (curatedHit[base + k] && phrase.includes(vs[k])) { n++; break; }
      }
    }
    if (n > bestN) { bestN = n; best = phrase; }
  }
  return best;
}

/* A plain loop rather than .some(): this runs 354 nodes deep inside a per-term,
 * per-variant loop, and the closure .some() allocates costs more than the search. */
function anyIncludes(list, t) {
  for (let i = 0; i < list.length; i++) if (list[i].includes(t)) return true;
  return false;
}

/* Score one query against an index built by indexNodes().
 *
 * `bodyOf` is optional and IS the seam: omit it and this function is the hub's algorithm
 * exactly, which is what search-parity.test.mjs pins. Supply it and page prose joins the
 * scoring — the CLI's one structural advantage over a catalog-only browser search.
 *
 * Returns `{ n, score, why }` sorted best first; `why` is the prose line that matched. */
export function scoreQuery({ index, q, syn, bodyOf, limit }) {
  const query = String(q).toLowerCase();
  const terms = queryTerms(query);
  const W = weightsFor(terms);
  const variantsByTerm = terms.map((t) => termVariants(t, syn));

  /* Every variant flattened, plus where each term's run starts. `curated` is the only
   * string each variant is ever searched for twice — once to decide whether the node is
   * worth scoring at all, once inside the term loop — so search it once into `curatedHit`
   * and read the answer twice. On a corpus-wide sweep that halves the dominant cost. */
  const flat = [];
  const offset = [];
  for (const vs of variantsByTerm) { offset.push(flat.length); for (const v of vs) flat.push(v); }
  const curatedHit = new Uint8Array(flat.length);

  /* Bodies are indexed before anything is scored, because the length normalisation below
   * needs the mean over the candidate set. Under --tag/--kind that mean is over the
   * FILTERED candidates, which is the intent: long means long for this question. */
  const bodies = bodyOf ? index.map((e) => bodyOf(e.n)) : null;
  const Lavg = bodies && bodies.length
    ? bodies.reduce((a, b) => a + b.tokens, 0) / bodies.length
    : 0;

  const out = [];
  for (let i = 0; i < index.length; i++) {
    const e = index[i];
    const body = bodies ? bodies[i] : null;
    /* One deflation factor per page, not one per term — it depends on nothing else. */
    const norm = body && Lavg > 0 ? Math.max(1, 0.25 + 0.75 * body.tokens / Lavg) : 1;
    let score = 0;
    if (e.id === query || e.name === query || e.aliases.indexOf(query) >= 0) score += 100;

    /* One pass over the flattened variants. `curated` concatenates every field scored
     * below, so a miss here is a miss in all of them, and a node no variant touches costs
     * nothing further. */
    let touchesSolves = false;
    for (let k = 0; k < flat.length; k++) {
      const h = e.curated.includes(flat[k]);
      curatedHit[k] = h ? 1 : 0;
      /* Only a variant already known to be somewhere in this node is worth looking for in
       * its `solves`, which is why this second search is inside the branch. */
      if (h && !touchesSolves && e.solvesText.includes(flat[k])) touchesSolves = true;
    }
    const phrase = touchesSolves ? bestSolvesPhrase(e.solves, variantsByTerm, curatedHit, offset) : null;

    let why = null, matched = 0;
    for (let ti = 0; ti < terms.length; ti++) {
      /* Score the term itself at full weight, then its variants at half; a term counts as
       * matched once, on its best variant. */
      const variants = variantsByTerm[ti];
      let best = 0, bestWhy = null;
      for (let vi = 0; vi < variants.length; vi++) {
        const t = variants[vi];
        const mult = vi === 0 ? 1 : 0.5;
        let s = 0, line = null;
        if (curatedHit[offset[ti] + vi]) {
          if (e.id.includes(t)) s += W.id;
          if (e.name.includes(t)) s += W.name;
          if (phrase !== null && phrase.includes(t)) s += W.solves;
          if (anyIncludes(e.tags, t)) s += W.tags;
          /* A page with no solves (themes) carries what symptom vocabulary it has in the
           * essence — score it at the solves weight there, so a one-field page is not
           * silently outranked by pages with five. */
          if (e.essence.includes(t)) s += (e.solves.length ? W.essence : W.solves);
          else s += W.curated;
        }
        if (body) {
          const hits = body.hits.get(t);
          /* The prose bonus caps at three mentions, which every page of any length
           * clears — so the flat version simply paid long pages more. Deflate it by how
           * much longer than average this page is. The floor of 1 means only long pages
           * are touched: a short page is never rewarded for being short, because a
           * one-line page mentioning a word once is not thereby a better answer. */
          if (hits) { s += Math.min(hits.n, 3) * W.body / norm; line = hits.line; }
        }
        if (s * mult > best) { best = s * mult; bestWhy = line; }
      }
      if (best > 0) { score += best; matched++; why ||= bestWhy; }
    }
    /* Covering more of what was asked beats mentioning one word a lot. Guard the divisor:
     * a query of only short words ("CB") leaves no terms, and NaN would silently drop an
     * otherwise exact alias hit. */
    score *= 1 + matched / Math.max(terms.length, 1);
    if (score > 0) out.push({ n: e.n, score, why });
  }
  out.sort((a, b) => b.score - a.score);
  return limit ? out.slice(0, limit) : out;
}
