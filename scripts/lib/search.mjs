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

/* Every variant of a term, in scoring order: the term itself at full weight, then its
 * synonyms and its stem at half. */
export function termVariants(term, syn) {
  const out = [term, ...own(syn ?? {}, term)];
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

  const bodies = bodyOf ? index.map((e) => bodyOf(e.n)) : null;

  const out = [];
  for (let i = 0; i < index.length; i++) {
    const e = index[i];
    const body = bodies ? bodies[i] : null;
    let score = 0;
    if (e.id === query || e.name === query || e.aliases.some((a) => a === query)) score += 100;

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
        /* `curated` concatenates every field below, so a miss here is a miss in all of
         * them — one substring search instead of five on the ~95% of nodes a given term
         * never touches. The relevance fixture runs ~2,000 queries over 354 nodes, and
         * this gate is most of what keeps it under a second. */
        if (e.curated.includes(t)) {
          if (e.id.includes(t)) s += W.id;
          if (e.name.includes(t)) s += W.name;
          if (e.solves.some((x) => x.includes(t))) s += W.solves;
          if (e.tags.some((x) => x.includes(t))) s += W.tags;
          /* A page with no solves (themes) carries what symptom vocabulary it has in the
           * essence — score it at the solves weight there, so a one-field page is not
           * silently outranked by pages with five. */
          if (e.essence.includes(t)) s += (e.solves.length ? W.essence : W.solves);
          else s += W.curated;
        }
        if (body) {
          const hits = body.hits.get(t);
          if (hits) { s += Math.min(hits.n, 3) * W.body; line = hits.line; }
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
