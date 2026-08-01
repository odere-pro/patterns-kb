/* expansions.mjs — the machine-generated synonym layer for search.
 *
 * scripts/data/expansion-synonyms.json is a word → nearest-corpus-words table: the
 * vocabulary a searcher types, bridged to the vocabulary the catalog actually uses.
 * It is authored offline (the file's own meta block records how and from what corpus)
 * and committed like any other data — no model runs at build time or in the browser.
 *
 * Curated SYNONYMS always win: mergedSynonyms() layers the expansions UNDER the
 * hand-written map. kb.mjs `find` and build.mjs's catalog projection both go through
 * here, so the CLI and the offline hub score the same bridge.
 */
import { readFileSync, existsSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { createHash } from "node:crypto";
import { dirname, join } from "node:path";

const FILE = join(dirname(fileURLToPath(import.meta.url)), "..", "data", "expansion-synonyms.json");

/* The query stopwords both scorers share. site/assets/search.js keeps an inline copy
 * (it must run as a plain file:// script) — the parity test pins the two together. */
export const STOP = new Set(["the", "and", "for", "are", "but", "not", "you", "all", "any", "can",
  "with", "that", "this", "from", "into", "when", "what", "why", "how", "does", "has", "have",
  "its", "his", "her", "their", "them", "they", "was", "were", "will", "would", "should"]);

export function loadExpansions() {
  if (!existsSync(FILE)) return { meta: null, expansions: {} };
  return JSON.parse(readFileSync(FILE, "utf8"));
}

export function mergedSynonyms(curated) {
  return { ...loadExpansions().expansions, ...curated };
}

/* The searchable vocabulary: every 3+-letter non-stopword in the catalog fields the
 * scorers match against. An expansion target outside this set can never score —
 * that is the structural invariant validateExpansions enforces. */
export function corpusVocabulary(nodes) {
  const vocab = new Set();
  for (const n of nodes) {
    const fields = [n.id, n.name, n.essence, ...(n.aliases ?? []), ...(n.tags ?? []), ...(n.solves ?? [])];
    for (const f of fields) {
      for (const w of String(f ?? "").toLowerCase().split(/[^a-z]+/)) {
        if (w.length > 2 && !STOP.has(w)) vocab.add(w);
      }
    }
  }
  return vocab;
}

export function vocabularyHash(vocab) {
  return "sha256:" + createHash("sha256").update([...vocab].sort().join("\n")).digest("hex").slice(0, 16);
}

/* Structural check for real builds. Returns { errors, drift }: errors are hard build
 * failures (a target word no longer exists anywhere in the corpus — a rename or a
 * rewrite orphaned it); drift is a warning only (the vocabulary grew or changed since
 * the table was generated — coverage degrades, nothing is wrong). */
export function validateExpansions({ meta, expansions }, vocab) {
  const errors = [];
  const keys = Object.keys(expansions);
  for (const [key, targets] of Object.entries(expansions)) {
    if (!/^[a-z][a-z-]{2,}$/.test(key)) errors.push(`expansion key "${key}" is not a lowercase word`);
    if (STOP.has(key)) errors.push(`expansion key "${key}" is a stopword`);
    if (!Array.isArray(targets) || !targets.length || targets.length > 4)
      errors.push(`expansion "${key}" must map to 1–4 words (got ${Array.isArray(targets) ? targets.length : typeof targets})`);
    const seen = new Set();
    for (const t of targets ?? []) {
      if (t === key) errors.push(`expansion "${key}" references itself`);
      else if (!vocab.has(t)) errors.push(`expansion "${key}" → "${t}": target is not in the corpus vocabulary`);
      /* The scorers substring-match, so a target CONTAINING its key can never add a hit:
       * anything the target matches, the shorter key already matched. The reverse
       * (`alerting` → `alert`) is the whole point of the table — inflection stripping —
       * so this rule is directional, and the symmetric reading would reject 92 good
       * bridges. */
      if (t !== key && t.includes(key))
        errors.push(`expansion "${key}" → "${t}": the target contains the key, so the bridge can never add a match`);
      if (seen.has(t)) errors.push(`expansion "${key}" lists "${t}" twice`);
      seen.add(t);
    }
  }
  /* Sorted keys keep a re-stamp's diff to the stamp, and `entries` is what tells a reader
   * the file was not hand-edited past its own bookkeeping. */
  const sorted = [...keys].sort();
  for (let i = 0; i < keys.length; i++) {
    if (keys[i] !== sorted[i]) {
      errors.push(`expansion keys are not sorted — "${keys[i]}" appears where "${sorted[i]}" belongs; run: node scripts/report-vocab.mjs --restamp`);
      break;
    }
  }
  if (meta) {
    if (meta.entries !== keys.length)
      errors.push(`meta.entries says ${meta.entries} but the table holds ${keys.length}`);
    if (!/^sha256:[0-9a-f]{16}$/.test(String(meta.corpusHash ?? "")))
      errors.push(`meta.corpusHash "${meta.corpusHash}" is not a sha256:<16 hex> stamp`);
    if (!Number.isInteger(meta.vocabSize) || meta.vocabSize <= 0)
      errors.push(`meta.vocabSize "${meta.vocabSize}" is not a positive integer`);
  }
  const drift = meta && meta.corpusHash !== vocabularyHash(vocab)
    ? `corpus vocabulary changed since expansion-synonyms.json was generated ` +
      `(now ${vocab.size} words, was ${meta.vocabSize ?? "?"}) — regenerate per its meta.regenerate note`
    : null;
  return { errors, drift };
}
