#!/usr/bin/env node
// kb-fact-check/rollup.mjs — aggregate findings/<kind>/<id>.eval.json into a ranked roll-up the
// human reads instead of 259 files. REJECTED findings are counted but kept out of the action lists.
//
//   node .claude/skills/kb-fact-check/rollup.mjs [--captured-at <ISO>]
//
// Writes tmp/kb-fact-check/rollup.json and rollup.md. Exit 0.

import { existsSync, readFileSync, readdirSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { writeFileSync, mkdirSync } from "node:fs";

const HERE = dirname(fileURLToPath(import.meta.url));
function findRepoRoot(s) { let d = s; for (let i = 0; i < 12; i++) { if (existsSync(join(d, "scripts", "kb.mjs"))) return d; const u = dirname(d); if (u === d) break; d = u; } throw new Error("no repo root"); }
const REPO = findRepoRoot(HERE);
const OUT = join(REPO, "tmp", "kb-fact-check");
const FINDINGS = join(OUT, "findings");
const argv = process.argv.slice(2);
const CAPTURED_AT = (() => { const i = argv.indexOf("--captured-at"); return i >= 0 ? argv[i + 1] : "unknown"; })();

const SEV_WEIGHT = { CRITICAL: 100, HIGH: 20, MEDIUM: 5, LOW: 1, NOTE: 0 };
// Group by the KIND of edit, not by the writer — every finding names the same writer (kb-edit),
// so keying on it collapses the whole corpus into one bucket and defeats fix-class review.
const FIX_OF = f => f.proposedFix?.action || "hand-edit prose";
// Per-class listing cap: budget the human's reading, but count what is not listed instead of
// dropping it. CRITICAL and HIGH are never capped.
const CLASS_CAP = Number((() => { const i = argv.indexOf("--cap"); return i >= 0 ? argv[i + 1] : 25; })());

function loadFindings() {
  const pages = [];
  if (!existsSync(FINDINGS)) return pages;
  for (const kind of readdirSync(FINDINGS)) {
    const kdir = join(FINDINGS, kind);
    for (const f of readdirSync(kdir)) {
      if (!f.endsWith(".eval.json")) continue;
      try { pages.push(JSON.parse(readFileSync(join(kdir, f), "utf8"))); } catch { /* skip */ }
    }
  }
  return pages;
}

function loadIndex() { const p = join(OUT, "index.json"); return existsSync(p) ? JSON.parse(readFileSync(p, "utf8")) : { entries: {} }; }

const pages = loadFindings();
const idx = loadIndex();
const active = f => f.verdict !== "REJECTED"; // NOTE-dims have no verdict → kept

const totals = { CRITICAL: 0, HIGH: 0, MEDIUM: 0, LOW: 0, NOTE: 0 };
const byDimension = {}, byFix = {}, byPage = [];
let rejected = 0, notesCount = 0;

for (const pg of pages) {
  const counts = { CRITICAL: 0, HIGH: 0, MEDIUM: 0, LOW: 0, NOTE: 0 };
  for (const f of pg.findings ?? []) {
    if (!active(f)) { rejected++; continue; }
    const sev = f.severity || "MEDIUM";
    totals[sev] = (totals[sev] ?? 0) + 1; counts[sev] = (counts[sev] ?? 0) + 1;
    (byDimension[f.dimension] ??= []).push({ fid: f.fid, kbId: pg.kbId, severity: sev, verdict: f.verdict, claim: f.claim });
    // Fix classes are a worklist: a NOTE records that we checked something, not work to do.
    if (sev !== "NOTE") (byFix[FIX_OF(f)] ??= []).push(f.fid);
  }
  for (const n of pg.notes ?? []) { totals.NOTE++; notesCount++; (byDimension[n.dimension] ??= []).push({ fid: n.fid, kbId: pg.kbId, severity: "NOTE", claim: n.claim }); }
  const score = Object.entries(counts).reduce((a, [s, n]) => a + n * (SEV_WEIGHT[s] ?? 0), 0);
  const worst = ["CRITICAL", "HIGH", "MEDIUM", "LOW"].find(s => counts[s] > 0) ?? (counts.NOTE ? "NOTE" : "clean");
  byPage.push({ kbId: pg.kbId, kbKind: pg.kbKind, worst, counts, score, notes: (pg.notes ?? []).length });
}
byPage.sort((a, b) => b.score - a.score);

const evaluatedIds = new Set(pages.map(p => p.kbId));
const unsourced = Object.values(idx.entries)
  .filter(e => evaluatedIds.has(e.id) && (!e.wikipedia || e.wikipedia.useForEvaluation === false) && !(e.alt ?? []).some(a => a.status === "ok"))
  .map(e => e.id);
const zeroFinding = byPage.filter(p => p.worst === "clean" || p.worst === "NOTE").map(p => p.kbId);

const rollup = {
  schema: "kb-eval-rollup/1", generatedAt: CAPTURED_AT,
  pagesEvaluated: pages.length, rejectedFindings: rejected, notes: notesCount,
  totals, zeroFinding, unsourced, byDimension, byFixCommand: byFix, byPage,
};
mkdirSync(OUT, { recursive: true });
writeFileSync(join(OUT, "rollup.json"), JSON.stringify(rollup, null, 2) + "\n");

// ---- markdown
const L = [];
L.push(`# kb-fact-check roll-up`, "", `Generated: ${CAPTURED_AT} · ${pages.length} page(s) evaluated · ${rejected} finding(s) rejected by the verify pass.`, "");
L.push(`## Severity counts`, "", "| CRITICAL | HIGH | MEDIUM | LOW | NOTE |", "|---|---|---|---|---|", `| ${totals.CRITICAL} | ${totals.HIGH} | ${totals.MEDIUM} | ${totals.LOW} | ${totals.NOTE} |`, "");
L.push(totals.CRITICAL === 0 ? `**No CRITICAL findings.** Nothing ships a lie right now.` : `**${totals.CRITICAL} CRITICAL finding(s) — fix before anything else.**`, "");
L.push(`Pages with no actionable finding (healthy null results): ${zeroFinding.length ? zeroFinding.join(", ") : "none"}.`, "");
if (unsourced.length) L.push(`Pages with no external source (evaluated internally / KB's own synthesis): ${unsourced.join(", ")}.`, "");

const sevRank = { CRITICAL: 0, HIGH: 1, MEDIUM: 2, LOW: 3, NOTE: 4 };
const line = (pg, f) => `- **${f.severity}** \`${pg}\` [${f.dimension}] ${f.verdict ? `(${f.verdict})` : ""} — ${f.claim}`;

// The worklist: everything that ships an untruth, uncapped, read first and in one sitting.
const urgent = [];
for (const pg of pages) for (const f of pg.findings ?? []) if (active(f) && (f.severity === "CRITICAL" || f.severity === "HIGH")) urgent.push({ pg: pg.kbId, f });
urgent.sort((a, b) => (sevRank[a.f.severity] ?? 9) - (sevRank[b.f.severity] ?? 9));
L.push("", `## Worklist — CRITICAL + HIGH (${urgent.length})`, "", urgent.length
  ? `Apply these before the MEDIUM tail: each asserts something the sources contradict.`
  : `Nothing at CRITICAL or HIGH.`, "");
for (const { pg, f } of urgent) L.push(`${line(pg, f)}  \n  → \`${FIX_OF(f)}\`: ${f.proposedFix?.intent ?? ""}`);

L.push("", `## By fix class`, "", `Fix one class in one sitting to keep the KB's voice consistent. Each class lists up to ${CLASS_CAP} findings; any remainder is counted, not dropped — read it from \`findings/<kind>/<id>.eval.json\`.`, "");
for (const [fix, fids] of Object.entries(byFix).sort((a, b) => b[1].length - a[1].length)) {
  const rows = [];
  for (const pg of pages) for (const f of pg.findings ?? []) if (active(f) && f.severity !== "NOTE" && FIX_OF(f) === fix) rows.push({ pg: pg.kbId, f });
  rows.sort((a, b) => (sevRank[a.f.severity] ?? 9) - (sevRank[b.f.severity] ?? 9));
  const shown = rows.filter(r => r.f.severity === "CRITICAL" || r.f.severity === "HIGH").length;
  const limit = Math.max(CLASS_CAP, shown); // never cap away a CRITICAL/HIGH
  L.push(`### \`${fix}\` — ${fids.length}`, "");
  for (const { pg, f } of rows.slice(0, limit)) L.push(line(pg, f));
  if (rows.length > limit) L.push("", `_… ${rows.length - limit} further finding(s) in this class not listed here (unreviewed, not dropped)._`);
  L.push("");
}
L.push(`## By page (ranked by damage score)`, "", "| page | kind | worst | C/H/M/L | notes | score |", "|---|---|---|---|---|---|");
for (const p of byPage) L.push(`| ${p.kbId} | ${p.kbKind} | ${p.worst} | ${p.counts.CRITICAL}/${p.counts.HIGH}/${p.counts.MEDIUM}/${p.counts.LOW} | ${p.notes} | ${p.score} |`);
L.push("", `## Notes recorded (restraint signal)`, "");
for (const pg of pages) for (const n of pg.notes ?? []) L.push(`- \`${pg.kbId}\` [${n.dimension}] — ${n.claim}`);
L.push("");

writeFileSync(join(OUT, "rollup.md"), L.join("\n"));
console.error(`rollup: ${pages.length} page(s) → ${join(OUT, "rollup.md")} (C${totals.CRITICAL} H${totals.HIGH} M${totals.MEDIUM} L${totals.LOW} N${totals.NOTE}, ${rejected} rejected)`);
