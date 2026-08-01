#!/usr/bin/env node
/* audit-vocab.mjs — holds the vocabularies and the page documenting them to each other.
 *
 * vocab.html claims that every term a page describes itself with resolves to a fragment
 * there. Nothing enforced that claim, so the corpus grew attributes the ontology never
 * heard of: `data-kb-maps` shipped validated and fail-hard with no definition anywhere,
 * and `data-kb-example` / `data-kb-lang` had been undocumented since they were added.
 * check-links.mjs cannot catch it — it ignores #fragments by design.
 *
 * Ten checks. Everything but T3 fails the build.
 *
 *   V1  every data-kb-* the corpus uses is in ATTRIBUTES
 *   V2  every term in every closed vocabulary has a fragment on vocab.html
 *   V3  every kb: term a page's JSON-LD emits has a fragment on vocab.html
 *   V4  every data-kb-polarity / data-kb-lang value the corpus uses is a set member
 *   K1  KINDS names the same seven kinds as BLOCKS and KIND_DIR
 *   K2  TAGS and TAG_DESC name the same tags, in both directions
 *   T2  every tag in TAGS is used on 3+ pages
 *   T4  every polarity and sketch language in the closed sets is used on 1+ page
 *   S1  every curated synonym target is a word the corpus actually contains
 *   T3  a tag that maps 1:1 onto a kind groups nothing the Kind facet does not (WARN)
 *
 * T2, T4 and S1 are corpus-scale and skipped under KB_ROOT: a 3-page fixture cannot carry
 * them, the same reason build.mjs guards its expansion drift check. T3 is scale-free, so
 * it runs everywhere and stays testable.
 *
 * Exit 1 on any problem but T3.
 */
import { readFileSync, existsSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join, resolve } from "node:path";
import { parse } from "./vendor/node-html-parser.mjs";
import {
  RELATION_TYPES, JSONLD_PROPS, ATTRIBUTES, TAGS, SYNONYMS,
  KINDS, BLOCKS, BLOCK_DESC, KIND_DIR, POLARITIES, SKETCH_LANGS, BANDS, LEVELS, TAG_DESC,
} from "./lib/model.mjs";
import { corpusVocabulary } from "./lib/expansions.mjs";

const ROOT = process.env.KB_ROOT
  ? resolve(process.env.KB_ROOT)
  : join(dirname(fileURLToPath(import.meta.url)), "..");
const SITE = join(ROOT, "site");
const FIXTURE = Boolean(process.env.KB_ROOT);

const graph = JSON.parse(readFileSync(join(SITE, "assets", "graph.json"), "utf8"));
const problems = [];
const warnings = [];

/* ---- the fragments vocab.html actually offers ---- */
const vocabFile = join(SITE, "vocab.html");
if (!existsSync(vocabFile)) {
  console.error("vocab.html is missing — run: node scripts/build-vocab.mjs");
  process.exit(1);
}
const vocabIds = new Set(
  [...readFileSync(vocabFile, "utf8").matchAll(/\sid="([^"]+)"/g)].map((m) => m[1]),
);

/* ---- V2: the model and the page it generates must name the same terms ----
 * Runs first: a stale vocab.html makes V1's and V3's messages misleading, since every
 * term would look undocumented. */
for (const type of Object.keys(RELATION_TYPES))
  if (!vocabIds.has(type)) problems.push(`V2 NO FRAGMENT: relation verb "${type}" has no id on vocab.html`);
for (const [prop] of JSONLD_PROPS)
  if (!vocabIds.has(prop)) problems.push(`V2 NO FRAGMENT: JSON-LD property "kb:${prop}" has no id on vocab.html`);
for (const a of ATTRIBUTES)
  if (!vocabIds.has(`data-kb-${a.name}`)) problems.push(`V2 NO FRAGMENT: attribute "data-kb-${a.name}" has no id on vocab.html`);
/* The rest of the closed vocabularies. Their ids are PREFIXED because the sets collide —
 * five tags are also bands (caching, concurrency, messaging, security, testing), and every
 * unsubdivided band's group id equals the band id. Only the labelled groups are rendered,
 * for the same reason: an unsubdivided band would otherwise get two identical entries. */
const NAMESPACED = [
  ["page kind", KINDS.map(([k]) => k), (k) => `kind-${k}`],
  ["block", Object.keys(BLOCK_DESC), (b) => `block-${b}`],
  ["polarity", POLARITIES.map((p) => p.name), (p) => `polarity-${p}`],
  ["band", BANDS.map((b) => b.id), (b) => `band-${b}`],
  ["group", BANDS.flatMap((b) => b.groups.filter((g) => g.label).map((g) => g.id)), (g) => `group-${g}`],
  ["tag", [...TAGS], (t) => `tag-${t}`],
  ["sketch language", SKETCH_LANGS.map((l) => l.id), (l) => `lang-${l}`],
];
for (const [kind, names, toId] of NAMESPACED)
  for (const n of names)
    if (!vocabIds.has(toId(n))) problems.push(`V2 NO FRAGMENT: ${kind} "${n}" has no id on vocab.html`);
for (const l of LEVELS)
  if (!vocabIds.has(l)) problems.push(`V2 NO FRAGMENT: reading level "${l}" has no id on vocab.html`);

/* ---- K2: every tag needs its gloss, and no gloss may outlive its tag ----
 * The page renders TAG_DESC, so a tag added to TAGS alone would render an empty row — and
 * a gloss left behind after a tag is retired is dead prose nothing would ever surface. */
for (const t of TAGS)
  if (!TAG_DESC[t]) problems.push(`K2 NO GLOSS: tag "${t}" is in TAGS but has no TAG_DESC entry`);
for (const t of Object.keys(TAG_DESC))
  if (!TAGS.has(t)) problems.push(`K2 ORPHAN GLOSS: TAG_DESC has "${t}", which is not a tag`);

/* ---- K1: KINDS must name the same seven kinds as the tables it keys ----
 * BLOCKS, OPTIONAL_BLOCKS and KIND_DIR are all indexed by kind, and KINDS is the only one
 * of the four that carries prose — so it is the one that can silently fall behind. */
const kindNames = JSON.stringify(KINDS.map(([k]) => k));
if (kindNames !== JSON.stringify(Object.keys(BLOCKS)))
  problems.push(`K1 KIND DRIFT: KINDS is ${kindNames} but BLOCKS is keyed by ${JSON.stringify(Object.keys(BLOCKS))}`);
if (kindNames !== JSON.stringify(Object.keys(KIND_DIR)))
  problems.push(`K1 KIND DRIFT: KINDS is ${kindNames} but KIND_DIR is keyed by ${JSON.stringify(Object.keys(KIND_DIR))}`);

/* ---- walk the corpus ---- */
const documented = new Set(ATTRIBUTES.map((a) => a.name));
const seenAttrs = new Map();  // attribute name -> first page that used it
const tagPages = new Map();   // tag -> Set of page ids
const kindPages = new Map();  // kind -> page count
const tagKinds = new Map();   // tag -> Map(kind -> count)
const polarityNames = new Set(POLARITIES.map((p) => p.name));
const langIds = new Set(SKETCH_LANGS.map((l) => l.id));
const usedPolarities = new Set();
const usedLangs = new Set();
let pages = 0;

for (const node of Object.values(graph.nodes)) {
  const file = join(SITE, node.path);
  if (!existsSync(file)) { problems.push(`MISSING FILE: ${node.path}`); continue; }
  pages++;
  const src = readFileSync(file, "utf8");

  /* V1. The `=` is load-bearing: the generated-region comment says "derived from
   * data-kb-*", which is prose about the vocabulary, not a use of it. */
  for (const m of src.matchAll(/\sdata-kb-([a-z][a-z-]*)=/g)) {
    if (!seenAttrs.has(m[1])) seenAttrs.set(m[1], node.path);
  }

  /* V3. Read the emitted terms off the JSON-LD block rather than guessing them from the
   * projection code, so a term added there without a definition is caught at once. */
  const ld = parse(src, { comment: true }).querySelector('script[type="application/ld+json"]');
  if (ld) {
    for (const m of ld.text.matchAll(/"kb:([a-z][a-z-]*)"/g)) {
      if (!vocabIds.has(m[1]))
        problems.push(`V3 UNDEFINED TERM: ${node.path} emits "kb:${m[1]}", which has no fragment on vocab.html`);
    }
  }

  /* V4. The corpus-scale half of the polarity/lang membership check validate.mjs runs per
   * page — same belt-and-braces the tag vocabulary already gets from build.mjs plus
   * validate.mjs plus here. Both are read off the raw source: `data-kb-lang` sits inside a
   * <pre>, which the parser hands back as raw text, so a DOM query would never see it. */
  for (const [attr, allowed, seen] of [
    ["polarity", polarityNames, usedPolarities],
    ["lang", langIds, usedLangs],
  ]) {
    for (const m of src.matchAll(new RegExp(`data-kb-${attr}="([^"]*)"`, "g"))) {
      seen.add(m[1]);
      if (!allowed.has(m[1]))
        problems.push(`V4 UNKNOWN VALUE: ${node.path} uses data-kb-${attr}="${m[1]}", which is not in the closed set`);
    }
  }

  kindPages.set(node.kind, (kindPages.get(node.kind) ?? 0) + 1);
  for (const t of node.tags ?? []) {
    if (!tagPages.has(t)) tagPages.set(t, new Set());
    tagPages.get(t).add(node.id);
    if (!tagKinds.has(t)) tagKinds.set(t, new Map());
    const byKind = tagKinds.get(t);
    byKind.set(node.kind, (byKind.get(node.kind) ?? 0) + 1);
  }
}

for (const [name, where] of seenAttrs) {
  if (!documented.has(name))
    problems.push(`V1 UNDOCUMENTED: data-kb-${name} is used (first seen in ${where}) but has no ATTRIBUTES entry in scripts/lib/model.mjs`);
}

/* ---- T2/T3: the tag rules the closed list only asserted in prose ---- */
/* T2 needs a corpus big enough for "3 pages" to mean anything, so it is the one check the
 * 3-page fixture cannot carry — the same reason build.mjs guards its expansion drift
 * check. T3 is a warning and scale-free, so it runs everywhere and stays testable. */
if (!FIXTURE) {
  for (const tag of TAGS) {
    const n = tagPages.get(tag)?.size ?? 0;
    if (n < 3)
      problems.push(`T2 UNDER-USED TAG: "${tag}" is on ${n} page(s); a tag exists to group, and needs 3+ or it groups nothing. Retire it, or tag the pages that earn it.`);
  }

  /* T4: the mirror of T2 for the two value vocabularies. Both are closed AGAINST THE
   * CORPUS rather than aspirationally — they were extracted from what the pages already
   * used — so a member nothing uses is drift, not a reserved slot. Deliberately sensitive:
   * five of the nine languages are on one page each, so deleting that page turns this red
   * and forces the decision instead of leaving a dead term documented forever. */
  for (const [kind, names, used] of [
    ["POLARITY", polarityNames, usedPolarities],
    ["SKETCH LANGUAGE", langIds, usedLangs],
  ]) {
    for (const n of names)
      if (!used.has(n))
        problems.push(`T4 UNUSED ${kind}: "${n}" is in the closed set but no page uses it. Retire it, or use it.`);
  }
}
/* ---- S1: the curated synonym map gets the check the generated table already had ----
 * validateExpansions guards every target in expansion-synonyms.json, but SYNONYMS in
 * model.mjs was guarded by nothing — and it had drifted: `stale -> outdated`,
 * `concurrency -> parallelism`, `duplicate -> duplication`, `database -> db` all pointed
 * at words no page contains, so those bridges could never fire. A target outside the
 * vocabulary is not an error of taste, it is a bridge to nowhere. Corpus-scale, so the
 * fixture is exempt for the same reason as T2. */
if (!FIXTURE) {
  const vocab = corpusVocabulary(Object.values(graph.nodes));
  for (const [key, targets] of Object.entries(SYNONYMS)) {
    for (const t of targets) {
      if (!vocab.has(t))
        problems.push(`S1 DEAD SYNONYM: SYNONYMS["${key}"] -> "${t}" is not in the corpus vocabulary, so the bridge can never match`);
    }
  }
}

/* A tag that covers one kind entirely and appears nowhere else is a kind marker: the Kind
 * facet already groups those pages, so the tag spends one of the page's 2-5 slots to say
 * what data-kb-kind already says. Retiring one means retagging every page that carries it,
 * so this warns rather than fails. */
for (const [tag, byKind] of tagKinds) {
  if (byKind.size !== 1) continue;
  const [kind, n] = [...byKind][0];
  if (n === kindPages.get(kind))
    warnings.push(`T3 KIND MARKER: "${tag}" is on all ${n} ${kind} page(s) and nothing else — it groups what kind:${kind} already groups.`);
}

console.log(`Checked ${pages} pages against ${ATTRIBUTES.length} attributes, ${Object.keys(RELATION_TYPES).length} verbs, ${JSONLD_PROPS.length} properties, ${Object.keys(BLOCK_DESC).length} blocks, ${POLARITIES.length} polarities, ${SKETCH_LANGS.length} sketch languages${FIXTURE ? "" : ` and ${TAGS.size} tags`}.`);
for (const w of warnings) console.log("  WARN: " + w);
if (problems.length) {
  console.error(`\n${problems.length} vocabulary problem(s) found.`);
  for (const p of problems.slice(0, 25)) console.error("  " + p);
  process.exit(1);
}
console.log("Every term the pages use is defined, and every defined term is used.");
