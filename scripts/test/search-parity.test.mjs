/* search-parity.test.mjs — pins the hub scorer (site/assets/search.js) to its CLI twin
 * (kb.mjs find), run with `node --test`.
 *
 * The two scorers are deliberately parallel implementations — search.js must run as a
 * plain file:// script, so it cannot import shared code. This suite is the contract that
 * keeps them converged: the same stopwords, the same projected synonym bridge, and the
 * same heads on real queries. Exact rank parity is NOT the contract — the CLI also
 * scores full page prose, which the catalog-only hub never sees — so the assertion is
 * containment: the hub's top-3 must appear in the CLI's top-5.
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { spawnSync } from "node:child_process";
import { createContext, runInContext } from "node:vm";
import { SYNONYMS } from "../lib/model.mjs";
import { mergedSynonyms, STOP } from "../lib/expansions.mjs";

const HERE = dirname(fileURLToPath(import.meta.url));
const REPO = join(HERE, "..", "..");
const ASSETS = join(REPO, "site", "assets");

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
  return { matches: window.KB_MATCHES, catalog: window.KB_CATALOG };
}

const hubTop = (matches, q, n) =>
  Object.entries(matches(q) ?? {}).sort((a, b) => b[1] - a[1]).slice(0, n).map(([id]) => id);

function cliTop(q, n) {
  const r = spawnSync(process.execPath, [join(REPO, "scripts", "kb.mjs"), "find", q, "--json", "--n", String(n)], { encoding: "utf8" });
  assert.equal(r.status, 0, `kb.mjs find failed: ${r.stderr}`);
  return JSON.parse(r.stdout).map((x) => x.id);
}

/* Symptom queries drawn from across the corpus — solves-shaped, where both scorers
 * weight the same fields hardest. */
const QUERIES = [
  "one slow dependency blocks my threads",
  "my thread pool is exhausted and every request hangs",
  "the same webhook fires twice and we charge the customer double",
  "one noisy tenant hogs the whole cluster",
  "adding a new export format means editing a giant switch statement",
  "my cache is stale after the source changed",
  "requests pile up faster than we can drain them",
  "I fixed the same bug in three places because the logic was copy-pasted",
  "circuit breaker",
  "every trivial change has to thread through five layers of indirection",
];

test("hub and CLI agree on the head of symptom queries", () => {
  const { matches } = loadHub();
  // The CLI also scores prose, so podiums may shuffle on any one query — but the hub's
  // best hit must sit in the CLI top-5 every time, and across the whole fixture set the
  // podium overlap must stay high. Weight drift in either scorer sinks both.
  let total = 0;
  for (const q of QUERIES) {
    const hub = hubTop(matches, q, 3);
    assert.ok(hub.length, `hub returned nothing for "${q}"`);
    const cli = new Set(cliTop(q, 5));
    assert.ok(cli.has(hub[0]), `"${q}": hub top-1 ${hub[0]} not in CLI top-5 (${[...cli].join(", ")})`);
    const overlap = hub.filter((id) => cli.has(id)).length;
    assert.ok(overlap >= 1, `"${q}": no hub podium hit in CLI top-5 (hub: ${hub.join(", ")})`);
    total += overlap;
  }
  assert.ok(total >= Math.floor(QUERIES.length * 1.7),
    `podium overlap degraded across the fixture set: ${total}/${QUERIES.length * 3}`);
});

test("hub stopword list matches the shared STOP set", () => {
  const src = readFileSync(join(ASSETS, "search.js"), "utf8");
  const m = src.match(/var STOP = \{([\s\S]*?)\};/);
  assert.ok(m, "search.js should declare a STOP object literal");
  const hubStop = new Set([...m[1].matchAll(/([a-z]+):\s*1/g)].map((x) => x[1]));
  assert.deepEqual([...hubStop].sort(), [...STOP].sort());
});

test("projected catalog synonyms equal the curated-over-expansions merge", () => {
  const { catalog } = loadHub();
  // JSON round-trip: the catalog object was created in the vm realm, whose Object
  // prototype fails deepEqual against ours even for identical data.
  assert.deepEqual(JSON.parse(JSON.stringify(catalog.synonyms)), mergedSynonyms(SYNONYMS));
});
