#!/usr/bin/env node
/* report-vocab.mjs — the worklist behind every vocabulary decision. READ-ONLY except
 * for --restamp. Not part of `make check`: it reports judgement calls, and a warning
 * nobody can act on is a warning people learn to ignore.
 *
 *   node scripts/report-vocab.mjs              the five sections below
 *   node scripts/report-vocab.mjs --json       the same data, for an orchestrator
 *   node scripts/report-vocab.mjs --restamp    re-sort keys + refresh meta (the ONE write)
 *
 * Section 2 corrects the obvious-but-wrong way to size this job. Both scorers
 * substring-match, so a corpus word ALWAYS retrieves itself: a page arriving with the word
 * "clickstream" needs no bridge for "clickstream". A bridge pays only where the word a
 * searcher types DIFFERS from the word the corpus uses — which is why 295 of the 416
 * existing keys are themselves corpus words. The table is morphological and near-synonym
 * bridging, not vocabulary import, so counting "new words since the stamp" measures
 * nothing. The measure that produces work is per PAGE: can a searcher reach it without
 * already knowing its name?
 */
import { readFileSync } from "node:fs";
import { writeAtomic } from "./lib/atomic.mjs";
import { fileURLToPath } from "node:url";
import { dirname, join, resolve } from "node:path";
import { SYNONYMS, TAGS } from "./lib/model.mjs";
import { loadExpansions, corpusVocabulary, vocabularyHash, validateExpansions, STOP } from "./lib/expansions.mjs";

const ROOT = process.env.KB_ROOT
  ? resolve(process.env.KB_ROOT)
  : join(dirname(fileURLToPath(import.meta.url)), "..");
const DATA = join(ROOT, "scripts", "data", "expansion-synonyms.json");
const JSON_OUT = process.argv.includes("--json");
const RESTAMP = process.argv.includes("--restamp");

/* The editorial policy of section 2, named because someone will want to move it.
 * BROAD_DF caps a candidate: bridging to a word that already appears on forty pages
 * floods every result set it touches. */
const BROAD_DF = 40;

const graph = JSON.parse(readFileSync(join(ROOT, "site", "assets", "graph.json"), "utf8"));
const nodes = Object.values(graph.nodes);
const vocab = corpusVocabulary(nodes);
const hash = vocabularyHash(vocab);
const data = loadExpansions();
const { expansions, meta } = data;

/* Document frequency over the SAME fields corpusVocabulary reads, so df and membership
 * can never disagree about what a word is. */
const df = new Map();
for (const n of nodes) {
  const words = new Set();
  for (const f of [n.id, n.name, n.essence, ...(n.aliases ?? []), ...(n.tags ?? []), ...(n.solves ?? [])]) {
    for (const w of String(f ?? "").toLowerCase().split(/[^a-z]+/)) {
      if (w.length > 2 && !STOP.has(w)) words.add(w);
    }
  }
  for (const w of words) df.set(w, (df.get(w) ?? 0) + 1);
}

/* ---- 1. drift ledger ---- */
const { errors, drift } = validateExpansions(data, vocab);
const ledger = {
  vocabNow: vocab.size, vocabStamped: meta?.vocabSize ?? null,
  hashNow: hash, hashStamped: meta?.corpusHash ?? null,
  entries: Object.keys(expansions).length, pages: nodes.length,
  errors, drifted: Boolean(drift),
};

/* ---- 2. unbridged pages ----
 * The useful question is not "which words lack a bridge" — ranked that way the list is
 * led by generic fragments of compound titles ("back" from Write-Back, "through" from
 * Write-Through), which is backwards: a broad word is the LAST thing to bridge to. The
 * question that produces work is per PAGE: can a searcher reach it typing anything other
 * than its own name? A page is bridged when some expansion or curated key targets one of
 * its distinctive naming words. The rest are reachable only by already knowing them,
 * which is exactly the reader `solves` exists to help. */
const targeted = new Set();
for (const ts of Object.values(expansions)) for (const t of ts) targeted.add(t);
for (const ts of Object.values(SYNONYMS)) for (const t of ts) targeted.add(t);

const namingWords = (n) => {
  const out = new Set();
  for (const f of [n.id, n.name, ...(n.aliases ?? [])]) {
    for (const w of String(f ?? "").toLowerCase().split(/[^a-z]+/)) {
      /* Skip words too broad to identify the page: bridging to them reaches everything. */
      if (w.length > 2 && !STOP.has(w) && (df.get(w) ?? 0) < BROAD_DF) out.add(w);
    }
  }
  return out;
};
const unbridged = nodes
  .map((n) => ({ n, words: namingWords(n) }))
  .filter(({ words }) => ![...words].some((w) => targeted.has(w)))
  .map(({ n, words }) => ({
    id: n.id, kind: n.kind,
    words: [...words].sort((a, b) => (df.get(a) ?? 0) - (df.get(b) ?? 0)),
  }))
  .sort((a, b) => a.kind.localeCompare(b.kind) || a.id.localeCompare(b.id));

/* ---- 3. table health ---- */
const collisions = Object.keys(expansions).filter((k) => SYNONYMS[k]).map((k) => ({
  key: k, expansion: expansions[k], curated: SYNONYMS[k],
  /* The shadowed targets are the dead half: the curated entry wins wholesale, so any
   * target only the table names never reaches a scorer. */
  shadowed: expansions[k].filter((t) => !SYNONYMS[k].includes(t)),
}));
const broad = [...targeted].filter((t) => (df.get(t) ?? 0) >= BROAD_DF)
  .map((t) => [t, df.get(t)]).sort((a, b) => b[1] - a[1]);
const fanout = {};
for (const ts of Object.values(expansions)) fanout[ts.length] = (fanout[ts.length] ?? 0) + 1;
const deadTargets = [...targeted].filter((t) => !vocab.has(t));

/* ---- 4. tag audit ---- */
const tagPages = new Map(), tagKinds = new Map(), kindPages = new Map(), kindTagTotal = new Map();
for (const n of nodes) {
  kindPages.set(n.kind, (kindPages.get(n.kind) ?? 0) + 1);
  kindTagTotal.set(n.kind, (kindTagTotal.get(n.kind) ?? 0) + (n.tags?.length ?? 0));
  for (const t of n.tags ?? []) {
    tagPages.set(t, (tagPages.get(t) ?? 0) + 1);
    if (!tagKinds.has(t)) tagKinds.set(t, new Map());
    tagKinds.get(t).set(n.kind, (tagKinds.get(t).get(n.kind) ?? 0) + 1);
  }
}
const tagCounts = [...TAGS].map((t) => [t, tagPages.get(t) ?? 0]).sort((a, b) => b[1] - a[1]);
const kindMarkers = [...tagKinds].filter(([, byKind]) => {
  if (byKind.size !== 1) return false;
  const [kind, n] = [...byKind][0];
  return n === kindPages.get(kind);
}).map(([t, byKind]) => ({ tag: t, kind: [...byKind][0][0], n: [...byKind][0][1] }));
const perKind = [...kindPages].map(([k, pages]) => ({
  kind: k, pages, avg: +(kindTagTotal.get(k) / pages).toFixed(2),
})).sort((a, b) => a.avg - b.avg);

/* ---- 5. --restamp: the one write ----
 * JSON.stringify(data, null, 1) + "\n" round-trips this file byte-identically, so an
 * unchanged table re-stamps to a diff of exactly the meta lines. */
if (RESTAMP) {
  const sorted = {};
  for (const k of Object.keys(expansions).sort()) sorted[k] = expansions[k];
  const next = {
    meta: {
      ...meta,
      corpusHash: hash,
      vocabSize: vocab.size,
      entries: Object.keys(sorted).length,
    },
    expansions: sorted,
  };
  writeAtomic(DATA, JSON.stringify(next, null, 1) + "\n");
  console.log(`re-stamped: ${next.meta.entries} entries, vocabSize ${vocab.size}, corpusHash ${hash}`);
  console.log("now run: make all   (the merged map is projected into catalog.json/catalog.js)");
  process.exit(0);
}

if (JSON_OUT) {
  console.log(JSON.stringify({ ledger, unbridged, collisions, broad, fanout, deadTargets, tagCounts, kindMarkers, perKind }, null, 2));
  process.exit(0);
}

const h = (s) => `\n${s}\n${"-".repeat(s.length)}`;
console.log(h("1. Drift ledger"));
console.log(`  corpus        ${ledger.pages} pages, ${ledger.vocabNow} searchable words`);
console.log(`  stamped at    ${ledger.vocabStamped ?? "?"} words (${meta?.generated ?? "?"})`);
console.log(`  hash now      ${ledger.hashNow}`);
console.log(`  hash stamped  ${ledger.hashStamped ?? "?"}  ${ledger.drifted ? "← DRIFTED" : "(match)"}`);
console.log(`  table         ${ledger.entries} keys`);
console.log(`  hard errors   ${errors.length}`);
for (const e of errors.slice(0, 10)) console.log(`      ${e}`);

console.log(h("2. Unbridged pages"));
console.log(`  ${unbridged.length} of ${nodes.length} pages have no synonym bridge pointing at them —`);
console.log("  reachable only by typing a word from their own name. Each page's naming words");
console.log("  follow, most specific first; write a bridge FROM what a searcher would type.");
for (const u of unbridged.slice(0, 50)) console.log(`      ${u.id.padEnd(34)} ${u.words.join(" ")}`);
if (unbridged.length > 50) console.log(`      … ${unbridged.length - 50} more (--json for all)`);

console.log(h("3. Table health"));
console.log(`  targets per key   ${Object.entries(fanout).sort().map(([k, v]) => `${k}:${v}`).join("  ")}`);
console.log(`  dead targets      ${deadTargets.length}${deadTargets.length ? " — " + deadTargets.join(", ") : ""}`);
console.log(`  broad targets     ${broad.length} at df >= ${BROAD_DF}${broad.length ? " — " + broad.slice(0, 8).map(([t, n]) => `${t}(${n})`).join(", ") : ""}`);
console.log(`  curated shadows   ${collisions.length}`);
for (const c of collisions) {
  console.log(`      "${c.key}": curated [${c.curated}] wins over table [${c.expansion}]`);
  if (c.shadowed.length) console.log(`          DEAD: ${c.shadowed.join(", ")} — fold into SYNONYMS or drop from the table`);
}

console.log(h("4. Tag audit"));
console.log(`  ${TAGS.size} tags over ${nodes.length} pages`);
console.log(`  thinnest:  ${tagCounts.slice(-8).reverse().map(([t, n]) => `${t}(${n})`).join(", ")}`);
console.log(`  per kind:  ${perKind.map((p) => `${p.kind} ${p.avg}`).join("  ")}`);
console.log(`  kind markers: ${kindMarkers.length ? kindMarkers.map((m) => `${m.tag} (all ${m.n} ${m.kind})`).join(", ") : "none"}`);

console.log(h("5. Next"));
console.log("  author bridges into scripts/data/expansion-synonyms.json, then:");
console.log("    node scripts/report-vocab.mjs --restamp && make all && make check && make test");
