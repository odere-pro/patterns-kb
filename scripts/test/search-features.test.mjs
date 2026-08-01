/* search-features.test.mjs — behavioral coverage for the search stack, run with `node --test`.
 *
 * Three layers under test:
 *   1. lib/expansions.mjs units — merge precedence, tokenization, hashing, validation.
 *   2. The live expansion table (scripts/data/expansion-synonyms.json) against the live
 *      catalog — the structural invariants make check also enforces, pinned as a test.
 *   3. End-to-end retrieval behaviors of both scorers — the hub (vm-loaded search.js)
 *      and the CLI (kb.mjs find) — including the semantic bridges: curated synonyms,
 *      machine-generated expansions, and the no-solves essence weight that lets a
 *      hazard win the symptom query that names it.
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { spawnSync } from "node:child_process";
import { createContext, runInContext } from "node:vm";
import { SYNONYMS } from "../lib/model.mjs";
import { loadExpansions, mergedSynonyms, corpusVocabulary, vocabularyHash, validateExpansions } from "../lib/expansions.mjs";

const HERE = dirname(fileURLToPath(import.meta.url));
const REPO = join(HERE, "..", "..");
const ASSETS = join(REPO, "site", "assets");

/* ---------------- 1. lib units ---------------- */

test("mergedSynonyms: a curated key shadows the expansion table's", () => {
  const { expansions } = loadExpansions();
  const someKey = Object.keys(expansions)[0];
  assert.ok(someKey, "expansion table should not be empty");
  const merged = mergedSynonyms({ [someKey]: ["curated-wins"] });
  assert.deepEqual(merged[someKey], ["curated-wins"]);
  // Non-colliding expansion keys pass through untouched.
  const other = Object.keys(expansions).find((k) => k !== someKey);
  assert.deepEqual(merged[other], expansions[other]);
});

test("corpusVocabulary: lowercases, splits on non-letters, drops short words and stopwords", () => {
  const vocab = corpusVocabulary([{
    id: "x-y", name: "Cache-Aside!", essence: "The cache is DB2-backed, not slow",
    aliases: ["CB"], tags: ["caching"], solves: ["my thread pool is exhausted"],
  }]);
  for (const w of ["cache", "aside", "backed", "slow", "caching", "thread", "pool", "exhausted"])
    assert.ok(vocab.has(w), `vocab should hold "${w}"`);
  for (const w of ["the", "not", "is", "cb", "db", "my", "DB2", "Cache"])
    assert.ok(!vocab.has(w), `vocab should not hold "${w}"`);
});

test("vocabularyHash: insertion order does not matter", () => {
  assert.equal(vocabularyHash(new Set(["b", "a", "c"])), vocabularyHash(new Set(["c", "a", "b"])));
  assert.notEqual(vocabularyHash(new Set(["a"])), vocabularyHash(new Set(["a", "b"])));
});

test("validateExpansions: rejects structural violations, warns on drift", () => {
  const vocab = new Set(["leak", "cache", "leaking"]);
  const meta = { corpusHash: vocabularyHash(vocab), vocabSize: 3, entries: 7 };
  const bad = validateExpansions({ meta, expansions: {
    "growing": ["leak"],          // fine
    "Bad-Key!": ["leak"],         // not a lowercase word
    "the": ["leak"],              // stopword key
    "self": ["self"],             // self-reference (also dangling)
    "dangling": ["gone"],         // target not in vocab
    "toomany": ["leak", "cache", "leak", "cache", "leak"],  // > 4 targets (also duplicated)
    "leak": ["leaking"],          // target CONTAINS the key — the bridge can never add a hit
  } }, vocab);
  assert.ok(bad.errors.some((e) => e.includes("Bad-Key!")));
  assert.ok(bad.errors.some((e) => e.includes(`"the" is a stopword`)));
  assert.ok(bad.errors.some((e) => e.includes("references itself")));
  assert.ok(bad.errors.some((e) => e.includes(`"gone": target is not in the corpus vocabulary`)));
  assert.ok(bad.errors.some((e) => e.includes("1–4 words")));
  assert.ok(bad.errors.some((e) => e.includes("the target contains the key")), "E1");
  assert.ok(bad.errors.some((e) => e.includes(`lists "leak" twice`)), "E2");
  assert.ok(bad.errors.some((e) => e.includes("not sorted")), "E5");
  assert.equal(bad.drift, null, "matching hash should not report drift");

  /* Well-formed meta, stale hash: drift and nothing else. A malformed stamp would now
   * raise a structural error too, which is a different failure. */
  const drifted = validateExpansions({
    meta: { corpusHash: `sha256:${"0".repeat(16)}`, vocabSize: 1, entries: 1 },
    expansions: { growing: ["leak"] },
  }, vocab);
  assert.deepEqual(drifted.errors, []);
  assert.ok(drifted.drift && drifted.drift.includes("regenerate"));

  /* And the stamp's own shape is checked, so a hand-edited meta cannot go unnoticed. */
  const malformed = validateExpansions({
    meta: { corpusHash: "sha256:stale", vocabSize: 0, entries: 99 },
    expansions: { growing: ["leak"] },
  }, vocab);
  assert.ok(malformed.errors.some((e) => e.includes("is not a sha256")), "E6 hash shape");
  assert.ok(malformed.errors.some((e) => e.includes("is not a positive integer")), "E6 vocabSize");
  assert.ok(malformed.errors.some((e) => e.includes("meta.entries says 99")), "E5 entries");
});

/* ---------------- 2. the live table ---------------- */

test("live expansion table is structurally sound against the live catalog", () => {
  const data = loadExpansions();
  assert.equal(data.meta?.method, "claude-authored");
  assert.equal(data.meta.entries, Object.keys(data.expansions).length);
  const catalog = JSON.parse(readFileSync(join(ASSETS, "catalog.json"), "utf8"));
  const { errors } = validateExpansions(data, corpusVocabulary(catalog.nodes));
  assert.deepEqual(errors, []);
  // The classic bridge shapes the table exists for.
  assert.ok(data.expansions.growing?.includes("leak"), `"growing" should bridge to "leak"`);
  assert.deepEqual(data.expansions.behaviour, ["behavior"], "British spelling bridge");
});

/* ---------------- 3. retrieval behaviors ---------------- */

function loadHub() {
  const window = {};
  const document = { readyState: "complete", querySelector: () => null, querySelectorAll: () => [], addEventListener: () => {} };
  const ctx = createContext({ window, document });
  runInContext(readFileSync(join(ASSETS, "catalog.js"), "utf8"), ctx);
  runInContext(readFileSync(join(ASSETS, "search.js"), "utf8"), ctx);
  return window.KB_MATCHES;
}
const ranked = (hits) => Object.entries(hits ?? {}).sort((a, b) => b[1] - a[1]).map(([id]) => id);

test("hub: empty and stopword-only queries return nothing", () => {
  const matches = loadHub();
  assert.equal(matches("   "), null, "blank query means no constraint");
  assert.deepEqual(Object.keys(matches("the and for") ?? {}), [], "stopwords alone match nothing");
});

test("hub: exact name and alias matches take the top", () => {
  const matches = loadHub();
  assert.equal(ranked(matches("circuit breaker"))[0], "circuit-breaker");
  assert.equal(ranked(matches("bbom"))[0], "big-ball-of-mud", "alias BBoM should pin the top");
});

test("hub: repeated query words score once (term dedupe)", () => {
  const matches = loadHub();
  assert.deepEqual(matches("leak leak leak"), matches("leak"));
});

test("hub: curated synonym bridges the query to the author's vocabulary", () => {
  // SYNONYMS maps outdated -> stale; the stale-cache hazard says "stale", never "outdated".
  assert.ok(SYNONYMS.outdated.includes("stale"), "fixture assumes the curated pair");
  const matches = loadHub();
  assert.equal(ranked(matches("outdated cache"))[0], "stale-cache");
});

test("hub: expansions + essence weight let hazards answer symptom queries", () => {
  const matches = loadHub();
  const giant = ranked(matches("one giant class does everything and every change touches it"));
  assert.ok(giant.includes("god-object"), `giant-class symptom should reach god-object (got ${giant.slice(0, 8).join(", ")})`);
  const piles = ranked(matches("everyone piles on at once after the cache expires"));
  assert.ok(piles.slice(0, 5).includes("cache-stampede"), `stampede symptom should reach cache-stampede top-5 (got ${piles.slice(0, 5).join(", ")})`);
});

function cli(...args) {
  const r = spawnSync(process.execPath, [join(REPO, "scripts", "kb.mjs"), "find", ...args, "--json"], { encoding: "utf8" });
  assert.equal(r.status, 0, `kb.mjs find failed: ${r.stderr}`);
  return JSON.parse(r.stdout);
}

test("cli: --kind filters and --n limits results", () => {
  const hazards = cli("race", "--kind", "hazard");
  assert.ok(hazards.length, "should find hazard hits for 'race'");
  assert.ok(hazards.every((x) => x.kind === "hazard"));
  assert.ok(cli("cache", "--n", "2").length <= 2);
});

test("cli: semantic bridges reach the symptom's page", () => {
  const giant = cli("one giant class does everything and every change touches it", "--n", "5").map((x) => x.id);
  assert.ok(giant.includes("god-object"), `expected god-object in top-5, got ${giant.join(", ")}`);
  const outdated = cli("outdated cache", "--n", "5").map((x) => x.id);
  assert.ok(outdated.includes("stale-cache"), `expected stale-cache in top-5, got ${outdated.join(", ")}`);
});
