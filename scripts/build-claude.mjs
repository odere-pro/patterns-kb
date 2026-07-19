#!/usr/bin/env node
/* build-claude.mjs — emits the per-folder CLAUDE.md files.
 *
 * Claude Code loads a folder's CLAUDE.md when work touches that folder, so each one
 * is a short, local briefing: what this band is, what lives here, and the one rule
 * that folder enforces. They are generated because their content — the band label,
 * the pattern list, the band/group a page must declare — is derived. A hand-written
 * list of 14 messaging patterns would be stale the first time one was added.
 *
 * The root CLAUDE.md is hand-written and is NOT touched by this.
 *
 * Run:  node scripts/build-claude.mjs   (add --check to fail if any is stale)
 */
import { readFileSync, writeFileSync, existsSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";
import { BANDS, BLOCKS, band as bandOf, groupLabel } from "./lib/model.mjs";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");
const SITE = join(ROOT, "site");
const CHECK = process.argv.includes("--check");
const graph = JSON.parse(readFileSync(join(SITE, "assets", "graph.json"), "utf8"));

const nodes = Object.values(graph.nodes);
const byDir = {};
for (const n of nodes) (byDir[n.dir] ||= []).push(n);

/** How deep this folder sits, for the relative hop back to the repo root. */
const up = (dir) => "../".repeat(dir.split("/").length + 1);

function forPatternFolder(dir, list) {
  const b = bandOf(list[0].band);
  const group = list[0].group;
  const gLabel = groupLabel(group);
  const heading = b.kind === "elevation"
    ? `${b.numeral} · ${b.label}${gLabel ? ` → ${gLabel}` : ""}`
    : `${b.label} (lens)`;

  return `# ${dir}

**${heading}** — ${list.length} pattern${list.length === 1 ? "" : "s"}.
${b.desc ?? `A lens: it reshapes how you build at any elevation, rather than being a rung on the ladder.`}

Pages here: ${list.map((n) => n.id).sort().join(", ")}

Every page in this folder declares \`data-kb-band="${list[0].band}"\` and
\`data-kb-group="${group}"\`. The path is checked against them — \`make check\` fails if a
page is filed anywhere else, so moving a page means changing its band or group, not just
its location.

Read a page with \`node ${up(dir)}scripts/kb.mjs get <id>\` — never open the .html to read it
(that costs ~3.6k tokens of markup for ~1.2k of prose).

See the root CLAUDE.md for the data contract before editing anything here.
`;
}

function forHazards(list) {
  return `# site/hazards

**Anti-patterns** — ${list.length} of them. Not to practise, only to recognise on sight.
Every one is what the patterns elsewhere exist to prevent.

Pages here: ${list.map((n) => n.id).sort().join(", ")}

Blocks, in order: ${BLOCKS.hazard.map((b) => `\`${b}\``).join(" → ")}.
Hazards carry no \`data-kb-solves\` — a hazard solves nothing, it *is* the problem — and no
"In the wild" block. They relate to patterns through \`mitigated-by\`, whose inverse
\`prevents-hazard\` must be declared on the pattern's page too.

Read with \`node ../../scripts/kb.mjs get <id>\`. See the root CLAUDE.md for the contract.
`;
}

function forThemes(list) {
  return `# site/themes

**Themes** — ${list.length} guided tours. Not a rung and not a lens: each one answers a single
systems question by walking through the patterns that combine to address it.

Pages here: ${list.map((n) => n.id).sort().join(", ")}

Blocks, in order: ${BLOCKS.theme.map((b) => `\`${b}\``).join(" → ")}.

A theme's \`tour\` block is the **source of truth for theme membership**. Each
\`.tour-step\` carries \`data-kb-member\` (which pattern) and \`data-kb-role\` (its terse role in
*this* narrative — distinct from the step's own prose). The build inverts those onto each
pattern as its "Where it shows up" list, so adding a pattern to a tour is what puts the
theme on the pattern's page. Themes carry no \`data-kb-solves\`.

Read with \`node ../../scripts/kb.mjs get <id>\`. See the root CLAUDE.md for the contract.
`;
}

function forDesigns(list) {
  return `# site/designs

**Case studies** — ${list.length} worked designs (the \`design\` kind). Each breaks one real
system down the way a strong interview answer would, and \`demonstrates\` the patterns it uses.

Pages here: ${list.map((n) => n.id).sort().join(", ")}

Blocks, in order: ${BLOCKS.design.map((b) => `\`${b}\``).join(" → ")}.
Optional: \`estimation\`, \`interface\`, \`levels\` — a low-level-design kata may skip the first two.

The \`architecture\` block carries the primary mermaid diagram (a \`flowchart\` for a distributed
design, a \`classDiagram\` for a low-level one). A design links to the patterns it uses through the
typed \`relationships\` block — \`node ../../scripts/kb.mjs link <id> demonstrates <pattern>\` writes
both sides, giving each pattern a "Demonstrated by" backlink. Tag distributed katas
\`system-design\` and OOP katas \`low-level-design\`; designs carry \`data-kb-solves\` like a pattern.

Read with \`node ../../scripts/kb.mjs get <id>\`. See the root CLAUDE.md for the contract.
`;
}

function forPrinciples(list) {
  return `# site/principles

**Principles** — ${list.length} design maxims. Not a rung, not a lens, not a pattern: each is a
rule of thumb for writing good code at any elevation (SOLID, DRY, KISS, YAGNI, and friends).

Pages here: ${list.map((n) => n.id).sort().join(", ")}

Blocks, in order: ${BLOCKS.principle.map((b) => `\`${b}\``).join(" → ")}.

A principle carries \`data-kb-solves\` (symptomatic search phrases) like a pattern, and links
into the typed relationship graph — most often it \`combines-with\` a pattern that embodies it,
or \`prevents-hazard\` an anti-pattern it guards against. The \`overreach\` block is mandatory:
every principle has a way of being taken too far, and saying so is what keeps the KB out of
dogma.

Read with \`node ../../scripts/kb.mjs get <id>\`. See the root CLAUDE.md for the contract.
`;
}

let written = 0;
const stale = [];
for (const [dir, list] of Object.entries(byDir)) {
  const body =
    dir === "hazards" ? forHazards(list)
    : dir === "themes" ? forThemes(list)
    : dir === "principles" ? forPrinciples(list)
    : dir === "designs" ? forDesigns(list)
    : forPatternFolder(dir, list);
  const file = join(SITE, dir, "CLAUDE.md");
  const cur = existsSync(file) ? readFileSync(file, "utf8") : "";
  if (cur === body) continue;
  if (CHECK) stale.push(`site/${dir}/CLAUDE.md`);
  else { writeFileSync(file, body); written++; }
}

/* An intermediate folder (patterns/gof) holds no pages of its own but is still a place
 * you can be working, so it gets a signpost to its subdivisions. */
for (const b of BANDS) {
  if (b.groups.length === 1 && b.groups[0].label === null) continue;
  const dir = `patterns/${b.id}`;
  const subs = b.groups.map((g) => g.id.replace(`${b.id}-`, ""));
  const body = `# ${dir}

**${b.numeral} · ${b.label}** — ${b.desc}

This band is subdivided; the pages live one level down, in ${subs.map((s) => `\`${s}/\``).join(", ")}.
Each subfolder has its own CLAUDE.md.

A page belongs to exactly one subfolder, decided by its \`data-kb-group\`, and \`make check\`
fails if the two disagree. See the root CLAUDE.md for the data contract.
`;
  const file = join(SITE, dir, "CLAUDE.md");
  const cur = existsSync(file) ? readFileSync(file, "utf8") : "";
  if (cur === body) continue;
  if (CHECK) stale.push(`site/${dir}/CLAUDE.md`);
  else { writeFileSync(file, body); written++; }
}

if (CHECK) {
  if (stale.length) {
    console.error(`${stale.length} CLAUDE.md file(s) STALE — run: node scripts/build-claude.mjs`);
    for (const s of stale) console.error("  " + s);
    process.exit(1);
  }
  console.log("per-folder CLAUDE.md files are up to date.");
} else {
  console.log(`per-folder CLAUDE.md: ${written} written.`);
}
