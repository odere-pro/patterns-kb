/* vocab-sort.test.mjs — ordering tests for site/assets/vocab.js, run with `node --test`.
 *
 * vocab.html renders in two modes over ONE copy of the DOM: the grouped page build-vocab.mjs
 * ships, and an A-Z index vocab.js builds by relocating the same `.vocab-item` nodes. The
 * failure that mode switch invites is silent — append the nodes back in A-Z order instead of
 * the authored order and the page still renders, just with the relation verbs alphabetised
 * out of their editorial sequence and the blocks out of skeleton order. Nobody notices for
 * weeks. So the ordering is factored out of the DOM as `window.KB_VOCAB_SORT`, the way
 * graph-core.js is factored out of graph-view.js, and tested here.
 *
 * The script guards on `typeof document`, so it can be loaded for its logic alone with no
 * DOM stub at all — everything below the export is skipped.
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import vm from "node:vm";

const HERE = dirname(fileURLToPath(import.meta.url));
const SCRIPT = join(HERE, "..", "..", "site", "assets", "vocab.js");

/* Load the shipped file the way the page does, minus the page. No `document` in the
 * sandbox, which is exactly the early-return the script is written to take. */
function load() {
  const sandbox = { window: {} };
  sandbox.window.window = sandbox.window;
  vm.createContext(sandbox);
  vm.runInContext(readFileSync(SCRIPT, "utf8"), sandbox);
  return sandbox.window;
}

const { KB_VOCAB_SORT: sortTerms, KB_VOCAB_LETTER: letterOf } = load();

const item = (sort, type, id = `${type}-${sort}`) => ({ sort, type, id });

test("the shipped script exports its ordering logic without a DOM", () => {
  assert.equal(typeof sortTerms, "function");
  assert.equal(typeof letterOf, "function");
});

test("terms come back in alphabetical order by their bare sort key", () => {
  const got = sortTerms([
    item("tradeoffs", "block"), item("basic", "reading level"), item("caching", "tag"),
  ]).map((x) => x.sort);
  assert.deepEqual(got, ["basic", "caching", "tradeoffs"]);
});

test("an attribute sorts under its bare name, not under data-kb-", () => {
  // The whole reason data-vocab-sort exists: without it all 22 attributes land under "d".
  const got = sortTerms([
    item("level", "attribute", "data-kb-level"),
    item("aliases", "attribute", "data-kb-aliases"),
    item("band", "attribute", "data-kb-band"),
  ]).map((x) => x.id);
  assert.deepEqual(got, ["data-kb-aliases", "data-kb-band", "data-kb-level"]);
});

test("colliding sort keys break by type, then id — the order is total", () => {
  // `kind`, `band`, `group`, `role` and `level` are each a JSON-LD property AND something
  // else, so equal sort keys are the normal case here rather than an edge case.
  // localeCompare orders by base letter, so "attribute" precedes "JSON-LD property". The
  // point is that the pair has ONE order, not which of them wins.
  const pair = [item("band", "JSON-LD property", "band"), item("band", "attribute", "data-kb-band")];
  assert.deepEqual(sortTerms(pair).map((x) => x.type), ["attribute", "JSON-LD property"]);
  assert.deepEqual(sortTerms(pair.slice().reverse()).map((x) => x.type), ["attribute", "JSON-LD property"]);

  const tie = sortTerms([item("x", "tag", "tag-b"), item("x", "tag", "tag-a")]).map((x) => x.id);
  assert.deepEqual(tie, ["tag-a", "tag-b"]);
});

test("sorting the same input twice gives the same order on any engine", () => {
  const input = ["role", "band", "kind", "group", "level", "note", "tours"]
    .flatMap((s) => [item(s, "JSON-LD property", s), item(s, "attribute", `data-kb-${s}`)]);
  assert.deepEqual(sortTerms(input), sortTerms(input.slice().reverse()));
});

test("the snapshot the grouped view restores from is never reordered", () => {
  // applyMode() restores from this exact array, so sortTerms returning a NEW array is what
  // keeps the authored order recoverable. Mutating in place would destroy it on first toggle.
  const authored = [item("combines-with", "relation verb"), item("alternative-to", "relation verb")];
  const before = authored.slice();
  const sorted = sortTerms(authored);
  assert.notEqual(sorted, authored, "sortTerms must not return its own input");
  assert.deepEqual(authored, before, "sortTerms must not reorder the caller's array");
});

test("letters bucket A-Z, and everything else lands under #", () => {
  assert.equal(letterOf(item("caching", "tag")), "C");
  assert.equal(letterOf(item("Basic", "reading level")), "B");
  assert.equal(letterOf(item("--json", "flag")), "#");
  assert.equal(letterOf(item("3-tier", "tag")), "#");
});
