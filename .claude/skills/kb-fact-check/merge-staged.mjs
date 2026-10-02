#!/usr/bin/env node
// kb-fact-check/merge-staged.mjs — assemble staging/{wild,production,prose}/<id>.json into
// findings/<kind>/<id>.eval.json. Deterministic, no network, no model.
//   node .claude/skills/kb-fact-check/merge-staged.mjs <id,id,...>|--all-staged [--captured-at ISO]
import { readFileSync, writeFileSync, existsSync, readdirSync, mkdirSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const HERE = dirname(fileURLToPath(import.meta.url));
function findRepoRoot(s) { let d = s; for (let i = 0; i < 12; i++) { if (existsSync(join(d, "scripts", "kb.mjs"))) return d; const u = dirname(d); if (u === d) break; d = u; } throw new Error("could not locate repo root"); }
const OUT = join(findRepoRoot(HERE), "tmp", "kb-fact-check");
const idx = JSON.parse(readFileSync(join(OUT, "index.json"), "utf8")).entries;
const argv = process.argv.slice(2);
const capIdx = argv.indexOf("--captured-at");
const capturedAt = capIdx >= 0 ? argv[capIdx + 1] : "unknown";
const CLASSES = ["wild", "production", "prose"];

let ids;
if (argv[0] === "--all-staged") {
  ids = [...new Set(CLASSES.flatMap(c => {
    const d = join(OUT, "staging", c);
    return existsSync(d) ? readdirSync(d).filter(f => f.endsWith(".json")).map(f => f.slice(0, -5)) : [];
  }))];
} else {
  ids = (argv[0] || "").split(",").map(s => s.trim()).filter(Boolean);
}
if (!ids.length) { console.error("no ids"); process.exit(1); }

let written = 0, skipped = [];
for (const id of ids) {
  const e = idx[id];
  if (!e) { skipped.push(`${id}: not in index`); continue; }
  const staged = [];
  for (const c of CLASSES) {
    const p = join(OUT, "staging", c, `${id}.json`);
    if (existsSync(p)) staged.push({ cls: c, data: JSON.parse(readFileSync(p, "utf8")) });
  }
  if (!staged.length) { skipped.push(`${id}: nothing staged`); continue; }
  const findings = staged.flatMap(s => s.data.findings || []);
  const tokenVerdicts = staged.flatMap(s => (s.data.tokenVerdicts || []).map(t => ({ ...t, blockClass: s.cls })));
  const sourceIds = [...new Set([
    ...findings.flatMap(f => (f.sources || []).map(s => s.sid)),
    ...tokenVerdicts.map(t => t.sid).filter(Boolean),
  ])].sort();
  const out = {
    schema: "kb-eval/1",
    kbId: id,
    kbKind: e.kind,
    kbPath: e.path,
    evaluatedAt: capturedAt,
    stagedClasses: staged.map(s => s.cls),
    sourceIds,
    findings,
    tokenVerdicts,
    notes: [],
  };
  const dir = join(OUT, "findings", e.kind);
  mkdirSync(dir, { recursive: true });
  writeFileSync(join(dir, `${id}.eval.json`), JSON.stringify(out, null, 2) + "\n");
  written++;
}
console.log(`merged ${written} page(s)${skipped.length ? `; skipped ${skipped.length}` : ""}`);
skipped.forEach(s => console.log("  " + s));
