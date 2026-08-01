#!/usr/bin/env node
/* lint-claude.mjs — holds the .claude/ assets to the shape the harness routes by.
 *
 * A malformed SKILL.md — bad frontmatter, a name: disagreeing with its directory, a
 * duplicate name — does not error anywhere: the skill silently fails to register and
 * every request it should own falls through to a generic path. That is exactly the
 * silent-failure mode that let design-review requests load no skill for months, so the
 * routing surface gets the same treatment the vocabularies get from audit-vocab.mjs.
 *
 * Seven checks. Everything but W1 fails the build.
 *
 *   S1  every .claude/skills/<dir>/SKILL.md has parseable frontmatter with name: + description:
 *   S2  a skill's name: matches its directory name
 *   S3  no duplicate names across skills and agents
 *   A1  every .claude/agents/<file>.md has name/description/tools/model, name matching the filename
 *   X1  every **bold** kb-/sys-/style- token in .claude/** and CLAUDE.md resolves to a
 *       real skill or agent — the cross-reference web the skills route each other by.
 *       Scoped by prefix because bold hyphenated prose ("anti-fabrication",
 *       "quote-or-drop") is not a reference; a rename outside those prefixes is on you.
 *   K1  every kind in KINDS has an owning block skill (kb-<kind>-blocks; design is owned
 *       by the kb-design-* family) — the check that would have caught five kinds of page
 *       having no skill at all
 *   W1  (WARN) a block skill's description carries no review verb, or any description is
 *       shorter than the routing threshold — short descriptions are how routing misses
 *
 * The .claude/ directory is repo config, not corpus: the KB_ROOT fixture does not carry
 * one, and the staged-tree pre-commit runs from a bare checkout that might not either —
 * so an absent directory exits 0 cleanly (the precedent is audit-vocab.mjs skipping its
 * corpus-scale checks under KB_ROOT).
 *
 * Exit 1 on any problem but W1.
 */
import { readFileSync, readdirSync, existsSync, statSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join, resolve } from "node:path";
import { KINDS } from "./lib/model.mjs";

const ROOT = process.env.KB_ROOT
  ? resolve(process.env.KB_ROOT)
  : join(dirname(fileURLToPath(import.meta.url)), "..");
const CLAUDE = join(ROOT, ".claude");

if (!existsSync(CLAUDE)) {
  console.log("No .claude/ directory here — nothing to lint.");
  process.exit(0);
}

const problems = [];
const warnings = [];

/* Frontmatter is the harness's registration record: the block between the opening and
 * closing `---`, one `key: value` per line (agent tools: [...] arrays stay one line). */
function frontmatter(src, file) {
  const m = src.match(/^---\r?\n([\s\S]*?)\r?\n---/);
  if (!m) return null;
  const fields = {};
  for (const line of m[1].split(/\r?\n/)) {
    const kv = line.match(/^([A-Za-z][\w-]*):\s*(.*)$/);
    if (kv) fields[kv[1]] = kv[2].trim();
    else if (line.trim() && !/^\s/.test(line))
      problems.push(`S1 BAD FRONTMATTER: ${file} has an unparseable line: ${line.slice(0, 60)}`);
  }
  return fields;
}

/* ---- S1/S2: every skill directory registers, under its own name ---- */
const SKILLS = join(CLAUDE, "skills");
const skillNames = new Map(); // name -> path, for S3
if (existsSync(SKILLS)) {
  for (const dir of readdirSync(SKILLS).sort()) {
    const full = join(SKILLS, dir);
    if (!statSync(full).isDirectory()) continue;
    const file = join(full, "SKILL.md");
    const rel = `.claude/skills/${dir}/SKILL.md`;
    if (!existsSync(file)) {
      problems.push(`S1 NO SKILL.md: ${rel} is missing — the directory registers nothing`);
      continue;
    }
    const fm = frontmatter(readFileSync(file, "utf8"), rel);
    if (!fm) { problems.push(`S1 NO FRONTMATTER: ${rel} has no ---…--- block`); continue; }
    if (!fm.name) problems.push(`S1 NO NAME: ${rel} frontmatter has no name:`);
    if (!fm.description) problems.push(`S1 NO DESCRIPTION: ${rel} frontmatter has no description:`);
    if (fm.name && fm.name !== dir)
      problems.push(`S2 NAME MISMATCH: ${rel} declares name: ${fm.name} but lives in ${dir}/`);
    if (fm.name) {
      if (skillNames.has(fm.name))
        problems.push(`S3 DUPLICATE: skill name "${fm.name}" in ${rel} already used by ${skillNames.get(fm.name)}`);
      else skillNames.set(fm.name, rel);
    }
    if (fm.description) describeCheck(fm.name ?? dir, fm.description);
  }
}

/* ---- A1: agents carry the four routing fields, named after their file ---- */
const AGENTS = join(CLAUDE, "agents");
const agentNames = new Map();
if (existsSync(AGENTS)) {
  for (const f of readdirSync(AGENTS).sort()) {
    if (!f.endsWith(".md")) continue;
    const rel = `.claude/agents/${f}`;
    const fm = frontmatter(readFileSync(join(AGENTS, f), "utf8"), rel);
    if (!fm) { problems.push(`A1 NO FRONTMATTER: ${rel} has no ---…--- block`); continue; }
    for (const key of ["name", "description", "tools", "model"])
      if (!fm[key]) problems.push(`A1 NO ${key.toUpperCase()}: ${rel} frontmatter has no ${key}:`);
    const base = f.replace(/\.md$/, "");
    if (fm.name && fm.name !== base)
      problems.push(`A1 NAME MISMATCH: ${rel} declares name: ${fm.name} but the file is ${f}`);
    if (fm.name) {
      if (skillNames.has(fm.name) || agentNames.has(fm.name))
        problems.push(`S3 DUPLICATE: agent name "${fm.name}" in ${rel} collides with ${skillNames.get(fm.name) ?? agentNames.get(fm.name)}`);
      agentNames.set(fm.name, rel);
    }
  }
}
const known = new Set([...skillNames.keys(), ...agentNames.keys()]);

/* ---- X1: the bold cross-references the skills route each other by ---- */
const REF = /\*\*((?:kb|sys|style)-[a-z0-9-]+)\*\*/g;
function* mdFiles(dir) {
  for (const e of readdirSync(dir, { withFileTypes: true })) {
    /* .claude/worktrees holds other sessions' full checkouts — their .claude is a
     * snapshot of an older tree, not part of this one's routing surface. */
    if (e.isDirectory() && e.name === "worktrees") continue;
    const p = join(dir, e.name);
    if (e.isDirectory()) yield* mdFiles(p);
    else if (e.name.endsWith(".md")) yield p;
  }
}
const refSources = [...mdFiles(CLAUDE)];
if (existsSync(join(ROOT, "CLAUDE.md"))) refSources.push(join(ROOT, "CLAUDE.md"));
for (const f of refSources) {
  const src = readFileSync(f, "utf8");
  for (const m of src.matchAll(REF)) {
    if (!known.has(m[1]))
      problems.push(`X1 DANGLING REFERENCE: ${f.slice(ROOT.length + 1)} names **${m[1]}**, which is no skill or agent`);
  }
}

/* ---- K1: every page kind has an owning block skill ----
 * pattern → kb-pattern-blocks and so on; design is the one kind split across a family,
 * so any kb-design-* skill counts as its owner. This is the check that would have caught
 * 112 pages (five kinds) routing to nothing. */
for (const [kind] of KINDS) {
  const owned = kind === "design"
    ? [...skillNames.keys()].some((n) => n.startsWith("kb-design-"))
    : skillNames.has(`kb-${kind}-blocks`);
  if (!owned)
    problems.push(`K1 ORPHAN KIND: "${kind}" has no owning block skill (expected kb-${kind}-blocks) — its pages route to nothing`);
}

/* ---- W1: routing quality — warn, don't fail ----
 * The Part-1 bug was descriptions that quoted only authoring triggers, so review asks
 * loaded no skill. Block skills must carry the review half; and any description short
 * enough loses routing matches it should win. Warns because prose quality is a judgment,
 * not a shape. */
function describeCheck(name, desc) {
  const isBlockSkill = /-blocks$/.test(name) || /^kb-design-/.test(name);
  if (isBlockSkill && !/review|evaluate|critique|audit|grade/i.test(desc))
    warnings.push(`W1 NO REVIEW VERB: ${name} is a block skill but its description quotes no review trigger`);
  if (desc.length < 200)
    warnings.push(`W1 SHORT DESCRIPTION: ${name}'s description is ${desc.length} chars — thin routing surface`);
}

console.log(`Checked ${skillNames.size} skills and ${agentNames.size} agents against ${KINDS.length} kinds and ${refSources.length} referencing files.`);
for (const w of warnings) console.log("  WARN: " + w);
if (problems.length) {
  console.error(`\n${problems.length} .claude problem(s) found.`);
  for (const p of problems.slice(0, 25)) console.error("  " + p);
  process.exit(1);
}
console.log("Every skill and agent registers, every reference resolves, every kind is owned.");
