#!/usr/bin/env node
// kb-fact-check/eval-check.mjs — the mechanical guardrail gate for findings files.
//
// A finding is only actionable if it survives these checks. Runs Node built-ins only (imports the
// repo's own model.mjs for BLOCKS/TAGS/RELATION_TYPES). It never trusts the evaluator's prose — it
// re-verifies every quote and anchor against ground truth on disk / from scripts/kb.mjs.
//
//   node .claude/skills/kb-fact-check/eval-check.mjs [--only a,b] [--json]
//
// Gates (see SKILL.md §guardrails):
//   G1 quote-or-drop     every sources[].quote is a verbatim substring of the stored .norm.txt
//   G2 anchor-or-drop    kb.block ∈ BLOCKS[kind]; kb.quote is a substring of that block's text
//   G3 prove-the-absence every missing-*/… absence needs absenceEvidence, terms genuinely absent
//   G4 no-laundering     no 8-word shingle of proposedFix.intent appears in any stored source
//   G5 severity-ceiling  CRITICAL/HIGH needs ≥2 sources or 1 tier-1 source
//   G6 closed-enums      dimension ∈ DIMENSIONS; tag-gap tag ∈ TAGS; relationship verb ∈ RELATION_TYPES
//   G7 restraint         a page with ≥5 findings and 0 notes is flagged for re-review
//
// Exit: 0 all clean · 2 nothing to check (no findings yet) · 3 one or more issues.

import { execFileSync } from "node:child_process";
import { existsSync, readFileSync, readdirSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

const HERE = dirname(fileURLToPath(import.meta.url));
const argv = process.argv.slice(2);

function findRepoRoot(start) {
  let dir = start;
  for (let i = 0; i < 12; i++) {
    if (existsSync(join(dir, "scripts", "kb.mjs"))) return dir;
    const up = dirname(dir); if (up === dir) break; dir = up;
  }
  console.error("eval-check.mjs: cannot find repo root"); process.exit(1);
}
const REPO = findRepoRoot(HERE);
const OUT = join(REPO, "tmp", "kb-fact-check");
const FINDINGS = join(OUT, "findings");
const KB = join(REPO, "scripts", "kb.mjs");
const { BLOCKS, TAGS, RELATION_TYPES } = await import(pathToFileURL(join(REPO, "scripts", "lib", "model.mjs")).href);

const DIMENSIONS = new Set([
  "factual-error", "wild-false", "production-false", "relationship-wrong", "essence-mismatch",
  "solves-defect", "wild-stale", "missing-tradeoff", "missing-variation", "missing-relationship",
  "block-gap", "provenance-gap", "alias-gap", "tag-gap",
  "estimation-arithmetic", "demonstrates-unsupported", "demonstrates-missing", "tour-stale", "decide-stale",
  "kb-ahead", "source-weak", "verified-clean",
]);
const NOTE_DIMS = new Set(["kb-ahead", "source-weak", "verified-clean"]);
// self-evidencing design/theme checks — the KB's own blocks are the evidence, no external source needed
const INTERNAL_DIMS = new Set(["estimation-arithmetic", "demonstrates-unsupported", "demonstrates-missing", "tour-stale", "decide-stale"]);
const MISSING_DIMS = new Set(["missing-tradeoff", "missing-variation", "missing-relationship", "block-gap", "alias-gap", "provenance-gap", "tag-gap"]);
const SEVERITIES = new Set(["CRITICAL", "HIGH", "MEDIUM", "LOW", "NOTE"]);

function hasFlag(f) { return argv.includes(f); }
function optVal(f) { const i = argv.indexOf(f); return i >= 0 && i + 1 < argv.length ? argv[i + 1] : undefined; }
const only = (() => { const v = optVal("--only"); return v ? new Set(v.split(",").map(s => s.trim())) : null; })();
const asJson = hasFlag("--json");

const norm = s => (s ?? "").replace(/\s+/g, " ").trim().toLowerCase();

// KB page text, cached; --diagrams so mermaid captions/labels are visible for design/structure
const kbCache = new Map();
function kbGet(id) {
  if (kbCache.has(id)) return kbCache.get(id);
  const out = execFileSync("node", [KB, "get", id, "--json", "--diagrams"], { cwd: REPO, maxBuffer: 1 << 26 }).toString();
  const o = JSON.parse(out);
  kbCache.set(id, o);
  return o;
}

// stored normalised source text, cached per id
const srcCache = new Map();
function srcText(id, sid) {
  const key = `${id}/${sid}`;
  if (srcCache.has(key)) return srcCache.get(key);
  const dir = join(OUT, "sources", id);
  let text = "";
  const wiki = join(dir, "wikipedia.norm.txt");
  const alt = join(dir, `${sid}.norm.txt`);
  if (sid === "wikipedia" && existsSync(wiki)) text = readFileSync(wiki, "utf8");
  else if (existsSync(alt)) text = readFileSync(alt, "utf8");
  const n = norm(text);
  srcCache.set(key, n);
  return n;
}
function allSrcText(id) {
  const dir = join(OUT, "sources", id);
  if (!existsSync(dir)) return "";
  return readdirSync(dir).filter(f => f.endsWith(".norm.txt")).map(f => norm(readFileSync(join(dir, f), "utf8"))).join("  ");
}

function collectFindingsFiles() {
  if (!existsSync(FINDINGS)) return [];
  const out = [];
  for (const kind of readdirSync(FINDINGS)) {
    const kdir = join(FINDINGS, kind);
    if (!existsSync(kdir) || !readdirSync(kdir)) continue;
    for (const f of readdirSync(kdir)) {
      if (!f.endsWith(".eval.json")) continue;
      const id = f.replace(/\.eval\.json$/, "");
      if (only && !only.has(id)) continue;
      out.push({ id, path: join(kdir, f) });
    }
  }
  return out;
}

function shingles(text, n = 8) {
  const w = norm(text).split(" ").filter(Boolean);
  const out = [];
  for (let i = 0; i + n <= w.length; i++) out.push(w.slice(i, i + n).join(" "));
  return out;
}

function checkFile({ id, path }, problems) {
  let doc;
  try { doc = JSON.parse(readFileSync(path, "utf8")); } catch (e) { problems.push(`${id}: unreadable findings file (${e.message})`); return; }
  const kb = kbGet(id);
  const blockNames = new Set(Object.keys(kb.blocks));
  const validBlocks = new Set(BLOCKS[kb.kind] ?? []);
  const findings = doc.findings ?? [];
  const notes = doc.notes ?? [];

  // G7 restraint
  if (findings.filter(f => !NOTE_DIMS.has(f.dimension)).length >= 5 && notes.length === 0)
    problems.push(`${id}: WARN restraint — ${findings.length} findings, 0 notes (probably rationalising every divergence)`);

  for (const f of [...findings, ...notes]) {
    const at = `${id}/${f.fid ?? "?"}`;
    // G6 closed enums
    if (!DIMENSIONS.has(f.dimension)) { problems.push(`${at}: dimension "${f.dimension}" not in closed set`); continue; }
    if (f.severity && !SEVERITIES.has(f.severity)) problems.push(`${at}: severity "${f.severity}" invalid`);
    const isNote = NOTE_DIMS.has(f.dimension);

    // G2 anchor-or-drop — an ACTIONABLE finding must target a real block whose text carries its
    // quote. NOTES are provenance, not edits (a verified-clean note may cite page metadata like an
    // alias), so they skip block validation — but their source quotes are still gated by G1 below.
    const kbref = f.kb ?? {};
    if (!isNote) {
      if (kbref.block && !validBlocks.has(kbref.block)) problems.push(`${at}: kb.block "${kbref.block}" not a ${kb.kind} block`);
      else if (kbref.block && !blockNames.has(kbref.block)) problems.push(`${at}: kb.block "${kbref.block}" absent on this page`);
      if (kbref.quote && kbref.block && blockNames.has(kbref.block)) {
        if (!norm(kb.blocks[kbref.block]).includes(norm(kbref.quote)))
          problems.push(`${at}: kb.quote not found in block "${kbref.block}"`);
      }
    }

    // G1 quote-or-drop — every source quote must be a substring of that stored source
    for (const s of f.sources ?? []) {
      if (!s.quote) { problems.push(`${at}: source ${s.sid} has no quote`); continue; }
      const hay = srcText(id, s.sid);
      if (!hay) { problems.push(`${at}: source ${s.sid} has no stored .norm.txt`); continue; }
      if (!hay.includes(norm(s.quote))) problems.push(`${at}: source quote (${s.sid}) not a substring of stored text`);
    }

    // G3 prove-the-absence
    if (MISSING_DIMS.has(f.dimension)) {
      const ae = kbref.absenceEvidence;
      if (!ae) { problems.push(`${at}: ${f.dimension} needs kb.absenceEvidence`); }
      else {
        if ((ae.blocksSearched ?? []).length < 3) problems.push(`${at}: absenceEvidence.blocksSearched < 3`);
        const pageText = norm(Object.values(kb.blocks).join(" "));
        for (const term of ae.termsAbsent ?? []) {
          if (pageText.includes(norm(term))) problems.push(`${at}: claims "${term}" absent but it IS present on the page`);
        }
      }
    }

    // G5 severity ceiling (external-corroboration rule; internal design/theme checks are exempt)
    if ((f.severity === "CRITICAL" || f.severity === "HIGH") && !isNote && !INTERNAL_DIMS.has(f.dimension)) {
      const srcs = f.sources ?? [];
      const tier1 = srcs.some(s => Number(s.tier) === 1);
      if (srcs.length < 2 && !tier1) problems.push(`${at}: ${f.severity} needs ≥2 sources or 1 tier-1 (has ${srcs.length}, tier1=${tier1})`);
    }

    // G6 relationship verb / tag closure
    if (f.dimension === "missing-relationship" || f.dimension === "relationship-wrong") {
      const verb = f.proposedFix?.verb ?? f.verb;
      if (verb && !(verb in RELATION_TYPES)) problems.push(`${at}: relation verb "${verb}" not in the closed 15`);
    }
    if (f.dimension === "tag-gap") {
      const tag = f.proposedFix?.tag ?? f.tag;
      if (tag && !TAGS.has(tag)) problems.push(`${at}: tag "${tag}" not in the closed TAGS vocabulary`);
    }

    // G4 no-laundering — intent must not reproduce an 8-word run of any source
    const intent = f.proposedFix?.intent;
    if (intent) {
      const hay = allSrcText(id);
      for (const sh of shingles(intent, 8)) { if (hay.includes(sh)) { problems.push(`${at}: proposedFix.intent reproduces source text verbatim ("${sh.slice(0, 40)}…")`); break; } }
    }
  }
}

// ---- run
const files = collectFindingsFiles();
if (!files.length) {
  if (asJson) process.stdout.write(JSON.stringify({ status: "pending", files: 0 }, null, 2) + "\n");
  else console.error("eval-check: no findings files yet (pending)");
  process.exit(2);
}
const problems = [];
for (const f of files) checkFile(f, problems);
const hard = problems.filter(p => !p.includes("WARN"));
if (asJson) {
  process.stdout.write(JSON.stringify({ status: hard.length ? "issues" : "clean", files: files.length, problems }, null, 2) + "\n");
} else {
  if (!problems.length) console.error(`eval-check: OK — ${files.length} findings file(s), all gates pass.`);
  else { console.error(`eval-check: ${problems.length} issue(s) across ${files.length} file(s):`); for (const p of problems) console.error(`  - ${p}`); }
}
process.exit(hard.length ? 3 : 0);
