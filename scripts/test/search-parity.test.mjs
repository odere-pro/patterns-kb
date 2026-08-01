/* search-parity.test.mjs — pins the hub scorer (site/assets/search.js) to its CLI twin,
 * run with `node --test`.
 *
 * The two are deliberately parallel implementations: search.js must run as a plain
 * file:// script, so it cannot import scripts/lib/search.mjs. This suite is the contract
 * that keeps them converged, and it is now EXACT rather than approximate.
 *
 * The seam is `bodyOf`. `scoreQuery` without it reads nothing but the catalog — which is
 * all the browser has — so the two are not merely similar, they are the same arithmetic.
 * Assert that directly: identical ids AND identical scores, on every fixture query.
 * Containment ("hub top-1 somewhere in CLI top-5") was the old contract, and it passed
 * happily while both scorers agreed on the wrong answer.
 *
 * The CLI's extra reach — page prose, and the length normalisation that comes with it —
 * lives entirely inside the `bodyOf` branch, so it cannot break this contract by
 * construction. What it can do is shuffle podiums, which the last test bounds.
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { spawnSync } from "node:child_process";
import { createContext, runInContext } from "node:vm";
import { SYNONYMS } from "../lib/model.mjs";
import { corpusVocabulary, mergedSynonyms, STOP } from "../lib/expansions.mjs";
import { indexNodes, proseIndexer, scoreQuery, stemVariant } from "../lib/search.mjs";

const HERE = dirname(fileURLToPath(import.meta.url));
const REPO = join(HERE, "..", "..");
const SITE = join(REPO, "site");
const ASSETS = join(SITE, "assets");

/* Load catalog.js + search.js the way a browser would, minus the DOM: mount() looks for
 * .controls, finds none, and early-returns — exactly what happens on the graph page. */
function loadHub() {
  const window = {};
  const document = {
    readyState: "complete",
    querySelector: () => null,
    querySelectorAll: () => [],
    addEventListener: () => {},
  };
  const ctx = createContext({ window, document });
  runInContext(readFileSync(join(ASSETS, "catalog.js"), "utf8"), ctx);
  runInContext(readFileSync(join(ASSETS, "search.js"), "utf8"), ctx);
  assert.equal(typeof window.KB_MATCHES, "function", "search.js should export window.KB_MATCHES");
  return window;
}

const catalog = JSON.parse(readFileSync(join(ASSETS, "catalog.json"), "utf8"));
const index = indexNodes(catalog.nodes);
const syn = mergedSynonyms(SYNONYMS);

/* The hub keeps only what scores within a band of the best hit — it filters chips in
 * place, so weak matches near the top of the page would otherwise bury strong ones. Apply
 * the same cut here; the cut is presentation, the scores under it are the contract. */
const HUB_CUT = 0.35;
function cliScores(q) {
  const ranked = scoreQuery({ index, q, syn });          // no bodyOf — the hub's algorithm
  if (!ranked.length) return {};
  const cut = ranked[0].score * HUB_CUT;
  const out = {};
  for (const { n, score } of ranked) if (score >= cut) out[n.id] = score;
  return out;
}

/* The hub's result object was created in the vm realm, whose Object prototype fails
 * assert/strict's deepEqual even for identical data. Round-trip it; JSON preserves a
 * double exactly, so the scores stay comparable to the last bit. */
const plain = (o) => (o === null ? null : JSON.parse(JSON.stringify(o)));

/* Symptom queries drawn from across the corpus, plus the short lookups that flip the
 * scorer onto its naming weights and the prototype-key queries that once crashed it. */
const QUERIES = [
  "one slow dependency blocks my threads",
  "my thread pool is exhausted and every request hangs",
  "the same webhook fires twice and we charge the customer double",
  "one noisy tenant hogs the whole cluster",
  "adding a new export format means editing a giant switch statement",
  "my cache is stale after the source changed",
  "requests pile up faster than we can drain them",
  "I fixed the same bug in three places because the logic was copy-pasted",
  "every trivial change has to thread through five layers of indirection",
  "we restart the service every night to keep it healthy",
  "two services write the same row and one of them loses",
  "my constructor takes eleven arguments and half of them are null",
  "the queue backs up whenever the downstream service slows down",
  "reads are fast but writes lock the whole table",
  "a deploy takes the site down for ten minutes",
  "the same event is processed twice after a retry",
  "our tests pass locally and fail in CI at random",
  "one giant class does everything and every change touches it",
  "everyone piles on at once after the cache expires",
  "I cannot tell which service caused the latency spike",
  "adding a payment provider means editing a huge switch",
  "the report query scans the whole table every night",
  "a schema change means a coordinated release of six services",
  "circuit breaker",
  "bulkhead",
  "outdated cache",
  "rate limiting",
  "leader election",
  "bbom",
  "constructor",
  "toString",
  "sharding",
];

test("hub and CLI-without-bodies score every fixture query identically", () => {
  const { KB_MATCHES } = loadHub();
  let scored = 0;
  for (const q of QUERIES) {
    const hub = plain(KB_MATCHES(q)) ?? {};
    const cli = cliScores(q.toLowerCase());
    assert.deepEqual(hub, cli, `"${q}": hub and CLI-no-body diverged`);
    if (Object.keys(cli).length) scored++;
  }
  /* "toString" is in the fixture precisely because it matches nothing — the contract is
   * that both scorers agree on the empty answer rather than one of them throwing. The
   * rest must retrieve, or an equality suite over two broken scorers would pass. */
  assert.ok(scored >= QUERIES.length - 1, `only ${scored}/${QUERIES.length} queries retrieved anything`);
});

test("hub returns nothing for queries with no scorable terms", () => {
  const { KB_MATCHES } = loadHub();
  assert.equal(KB_MATCHES("   "), null);
  assert.deepEqual(plain(KB_MATCHES("the and for")), {});
  assert.deepEqual(cliScores("the and for"), {});
});

/* The CLI's podium may shuffle against the hub's — it reads prose the browser cannot —
 * but the two must still be answering the same question. Overlap is measured, not
 * asserted per query; the floor catches weight drift in either scorer.
 *
 * Recorded value: 26/30. Expect it to fall when the CLI gains something the hub cannot
 * have — body-length normalisation deflates a long page's prose bonus, and a catalog-only
 * scorer has no way to reproduce that. A fall for any other reason is drift. */
test("hub and CLI podiums still overlap once prose joins the CLI", () => {
  const { KB_MATCHES } = loadHub();
  const bodyOf = proseIndexer(SITE, null);
  const podium = QUERIES.slice(0, 10);
  let total = 0;
  for (const q of podium) {
    const hub = Object.entries(KB_MATCHES(q) ?? {}).sort((a, b) => b[1] - a[1]).slice(0, 3).map(([id]) => id);
    assert.ok(hub.length, `hub returned nothing for "${q}"`);
    const cli = new Set(scoreQuery({ index, q, syn, bodyOf, limit: 5 }).map((x) => x.n.id));
    assert.ok(cli.has(hub[0]), `"${q}": hub top-1 ${hub[0]} not in CLI top-5 (${[...cli].join(", ")})`);
    total += hub.filter((id) => cli.has(id)).length;
  }
  assert.ok(total >= Math.floor(podium.length * 1.7),
    `podium overlap degraded across the fixture set: ${total}/${podium.length * 3}`);
});

/* One spawn, not ten: the suite above scores in-process, so this is the only thing that
 * proves the shipped CLI is wired to the scorer under test rather than to a stale copy. */
test("kb.mjs find is wired to the shared scorer", () => {
  const q = "one slow dependency blocks my threads";
  const r = spawnSync(process.execPath, [join(REPO, "scripts", "kb.mjs"), "find", q, "--json", "--n", "8"], { encoding: "utf8" });
  assert.equal(r.status, 0, `kb.mjs find failed: ${r.stderr}`);
  const shipped = JSON.parse(r.stdout).map((x) => x.id);
  const inProcess = scoreQuery({ index, q, syn, bodyOf: proseIndexer(SITE, null), limit: 8 }).map((x) => x.n.id);
  assert.deepEqual(shipped, inProcess);
});

/* The STOP list is pinned by reading search.js's source; the stemmer is six rules with
 * length guards and ordering, which no regex over the source could compare. Run the real
 * thing instead: every word the corpus can be searched for, through both implementations.
 * Milliseconds, and drift stops being possible. */
test("hub and CLI stem every corpus word identically", () => {
  const { KB_STEM } = loadHub();
  assert.equal(typeof KB_STEM, "function", "search.js should export window.KB_STEM");
  const vocab = [...corpusVocabulary(catalog.nodes)].sort();
  assert.ok(vocab.length > 2000, `expected a real vocabulary, got ${vocab.length} words`);
  const hub = {}, cli = {};
  for (const w of vocab) { hub[w] = KB_STEM(w); cli[w] = stemVariant(w); }
  assert.deepEqual(plain(hub), cli);
  // …and the rules do something: these are the pairs the change exists for.
  for (const [word, stem] of [["threads", "thread"], ["blocked", "block"], ["queries", "query"],
    ["batches", "batch"], ["blocking", "block"], ["retried", "retry"]])
    assert.equal(stemVariant(word), stem, `expected ${word} -> ${stem}`);
  // Short words and the ones a guard protects keep their shape.
  for (const w of ["class", "cache", "ties", "less", "used", "ring"])
    assert.equal(stemVariant(w), null, `"${w}" should not be stemmed`);
});

test("hub stopword list matches the shared STOP set", () => {
  const src = readFileSync(join(ASSETS, "search.js"), "utf8");
  const m = src.match(/var STOP = \{([\s\S]*?)\};/);
  assert.ok(m, "search.js should declare a STOP object literal");
  const hubStop = new Set([...m[1].matchAll(/([a-z]+):\s*1/g)].map((x) => x[1]));
  assert.deepEqual([...hubStop].sort(), [...STOP].sort());
});

test("projected catalog synonyms equal the curated-over-expansions merge", () => {
  const { KB_CATALOG } = loadHub();
  assert.deepEqual(plain(KB_CATALOG.synonyms), mergedSynonyms(SYNONYMS));
});
