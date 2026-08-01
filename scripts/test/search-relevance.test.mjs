/* search-relevance.test.mjs — does search actually retrieve the right page?
 *
 * The parity suite proves the two scorers agree; nothing proved they agree on anything
 * USEFUL. This is the measuring instrument: every page's own `data-kb-solves` is ground
 * truth ("someone who types this symptom wants this page"), so the corpus supplies ~317
 * labelled queries for free, and re-phrasing them asks whether retrieval survives the way
 * people actually type.

 * Two phrasings are gated on every run; `report` and `full` add two more that are useful
 * for tuning but too slow to pay for every time. Their last measured CLI top-1:
 * keyword 98.4%, inflected-keyword 94.6%.
 *
 * It asserts RATES, never per-query expectations. A 317-entry expectation list would go
 * red every time an author rewrote a `solves` phrase, and nobody would trust it by the
 * second week. Every number in GATES is a ratchet: raise it when a change improves
 * retrieval, and treat a fall as the regression it is.
 *
 * In-process on purpose — `kb.mjs find` costs ~0.5s per spawn and this runs thousands of
 * queries; indexing the whole corpus costs ~0.4s once.
 *
 *   KB_RELEVANCE=full     every solves phrase, not just the first — for tuning
 *   KB_RELEVANCE=report   print the metric table and skip the assertions
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { SYNONYMS } from "../lib/model.mjs";
import { mergedSynonyms, STOP } from "../lib/expansions.mjs";
import { indexNodes, proseIndexer, scoreQuery } from "../lib/search.mjs";

const HERE = dirname(fileURLToPath(import.meta.url));
const REPO = join(HERE, "..", "..");
const SITE = join(REPO, "site");

const MODE = process.env.KB_RELEVANCE ?? "";
const FULL = MODE === "full";
const REPORT = MODE === "report";

/* ---------------- gates ----------------
 * One table, rates only. Ceilings are marked `max`; everything else is a floor. */
const GATES = {
  //                     gate    measured   before the scoring rework
  cliTop1: {
    verbatim:            0.982,  //  98.7%   98.4%
    inflected:           0.985,  //  99.1%   67.5%
  },
  cliTop3:               0.995,  // 100.0%   94.6%   pooled over the gated phrasings
  cliMrr:                0.989,  //  0.994   0.912
  hubTop1:               0.986,  //  99.1%   90.0%
  maxDesignStealsTop1:   0.008,  //   0.2%    3.8%   over non-design queries
  maxDesignInTop5:       0.420,  //  38.4%   65.3%   over non-design queries
};

/* ---------------- phrasings ----------------
 * Every phrasing is normalised the same way — words stripped to [a-z0-9-] — so the
 * comparison measures wording, not punctuation. A searcher's comma is a real miss under
 * substring matching, but it is the same miss in all four columns and only adds noise. */
const words = (s) =>
  s.toLowerCase().split(/\s+/).map((w) => w.replace(/[^a-z0-9-]/g, "")).filter(Boolean);

/* What someone types when they cannot be bothered to type the sentence: the meaty words
 * only, in the order they appeared. */
const keywords = (list) => list.filter((w) => w.length >= 5 && !STOP.has(w));

/* A mechanical number flip on the words long enough to carry one: singulars become
 * plurals and plurals singulars, which is precisely the mismatch a searcher hits when the
 * author wrote "every thread" and they typed "threads". */
const inflect = (list) =>
  list.map((w) => (w.length <= 4 ? w : w.endsWith("s") ? w.slice(0, -1) : w + "s"));

/* The fourth phrasing stacks both mutations, which is a harsher query than anyone
 * really types — it stays out of the gated set and exists for tuning under `full`. */
const PHRASINGS = {
  verbatim: (list) => list,
  keyword: keywords,
  inflected: inflect,
  "inflected-keyword": (list) => inflect(keywords(list)),
};
/* Two phrasings on every run, four under `full`/`report`. Scoring 354 nodes against a
 * six-term query costs ~4ms, so each extra phrasing is ~2.5s of `make test` — and the two
 * kept here are the ones that move: verbatim is the ceiling, inflected is what the query
 * stemmer exists for. */
const GATED = ["verbatim", "inflected"];
const RUNNING = FULL || REPORT ? Object.keys(PHRASINGS) : GATED;

/* ---------------- the run ---------------- */

function buildQueries(nodes) {
  const out = [];
  for (const n of nodes) {
    const solves = n.solves ?? [];
    if (!solves.length) continue;               // themes carry none — nothing to label
    for (const phrase of FULL ? solves : solves.slice(0, 1)) {
      const list = words(phrase);
      for (const phrasing of RUNNING) {
        const q = PHRASINGS[phrasing](list).join(" ");
        if (q.split(" ").filter((w) => w.length > 2 && !STOP.has(w)).length < 2) continue;
        out.push({ id: n.id, kind: n.kind, phrasing, q });
      }
    }
  }
  return out;
}

function blankTally() {
  return { n: 0, top1: 0, top3: 0, rr: 0, steals: 0, designTop5: 0, nonDesign: 0 };
}

function measure(queries, index, syn, bodyOf) {
  const byPhrasing = {}, all = blankTally();
  for (const { id, kind, phrasing, q } of queries) {
    const hits = scoreQuery({ index, q, syn, bodyOf, limit: 10 });
    const rank = hits.findIndex((h) => h.n.id === id) + 1;   // 0 when absent
    const tally = (byPhrasing[phrasing] ??= blankTally());
    /* The pooled row covers the gated phrasings only, so `report` and `full` print a
     * number the default run can be held to. */
    for (const t of GATED.includes(phrasing) ? [tally, all] : [tally]) {
      t.n++;
      if (rank === 1) t.top1++;
      if (rank >= 1 && rank <= 3) t.top3++;
      if (rank >= 1) t.rr += 1 / rank;
      /* "Design steals the top" only means anything when the answer is not a design. */
      if (kind !== "design") {
        t.nonDesign++;
        if (hits[0]?.n.kind === "design") t.steals++;
        if (hits.slice(0, 5).some((h) => h.n.kind === "design")) t.designTop5++;
      }
    }
  }
  return { byPhrasing, all };
}

const rates = (t) => ({
  top1: t.top1 / t.n, top3: t.top3 / t.n, mrr: t.rr / t.n,
  steals: t.nonDesign ? t.steals / t.nonDesign : 0,
  designTop5: t.nonDesign ? t.designTop5 / t.nonDesign : 0,
});
const pct = (x) => (x * 100).toFixed(1) + "%";

const catalog = JSON.parse(readFileSync(join(SITE, "assets", "catalog.json"), "utf8"));
const index = indexNodes(catalog.nodes);
const syn = mergedSynonyms(SYNONYMS);
const queries = buildQueries(catalog.nodes);

const cli = measure(queries, index, syn, proseIndexer(SITE, null));
/* No bodyOf: by the parity contract that is the hub's algorithm, number for number. */
const hub = measure(queries, index, syn, undefined);

if (REPORT) {
  const line = (label, t) => {
    const r = rates(t);
    console.log(`${label.padEnd(22)} n=${String(t.n).padStart(5)}  top1=${pct(r.top1)}  top3=${pct(r.top3)}  mrr=${r.mrr.toFixed(3)}  steals=${pct(r.steals)}  d@5=${pct(r.designTop5)}`);
  };
  console.log(`\nqueries: ${queries.length}${FULL ? " (full)" : ""}\n`);
  for (const [p, t] of Object.entries(cli.byPhrasing)) line(`CLI ${p}`, t);
  line("CLI all", cli.all);
  for (const [p, t] of Object.entries(hub.byPhrasing)) line(`HUB ${p}`, t);
  line("HUB all", hub.all);
  console.log("");
}

const atLeast = (got, bar, what) =>
  assert.ok(got >= bar, `${what}: ${pct(got)} is below the ${pct(bar)} gate`);
const atMost = (got, bar, what) =>
  assert.ok(got <= bar, `${what}: ${pct(got)} is above the ${pct(bar)} ceiling`);

test("the fixture covers the corpus it claims to", { skip: REPORT }, () => {
  const withSolves = catalog.nodes.filter((n) => (n.solves ?? []).length).length;
  assert.ok(withSolves > 300, `expected 300+ labelled pages, got ${withSolves}`);
  assert.ok(queries.length > withSolves * 1.5, `expected a phrasing set per page, got ${queries.length}`);
});

test("CLI retrieves the page its own symptom text describes", { skip: REPORT }, () => {
  for (const [phrasing, bar] of Object.entries(GATES.cliTop1))
    atLeast(rates(cli.byPhrasing[phrasing]).top1, bar, `CLI top-1 (${phrasing})`);
  atLeast(rates(cli.all).top3, GATES.cliTop3, "CLI top-3 (all phrasings)");
  atLeast(rates(cli.all).mrr, GATES.cliMrr, "CLI MRR (all phrasings)");
});

test("the hub retrieves it too, reading no prose at all", { skip: REPORT }, () => {
  atLeast(rates(hub.all).top1, GATES.hubTop1, "HUB top-1 (all phrasings)");
});

/* Designs are worked case studies: ~20k chars against a pattern's ~11.7k, and their own
 * `solves` are authored in the same symptomatic register. Left alone they crowd the
 * podium of questions that are not about them. */
test("designs do not crowd out the pattern that answers the question", { skip: REPORT }, () => {
  atMost(rates(cli.all).steals, GATES.maxDesignStealsTop1, "design steals top-1");
  atMost(rates(cli.all).designTop5, GATES.maxDesignInTop5, "design in top-5");
});
