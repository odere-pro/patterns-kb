#!/usr/bin/env node
/* build-claude.mjs — emits the per-folder CLAUDE.md files.
 *
 * Claude Code loads a folder's CLAUDE.md when work touches that folder, so each one
 * is a short, local briefing: what this band is, what lives here, and the one rule
 * that folder enforces. They are generated because their content — the band label,
 * the pattern list, the band/group a page must declare — is derived. A hand-written
 * list of 14 messaging patterns would be stale the first time one was added.
 *
 * The root CLAUDE.md and README.md are hand-written, but their headline counts are corpus
 * facts that would rot; this also rewrites the inline <!-- kb:counts --> and
 * <!-- kb:page-count --> marker regions in both, and nothing else in them.
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

Reading levels are CUMULATIVE: basic is a short whole page, advanced is basic plus
system-design depth, expert is both plus the deep dives. Every block shows at every lens;
depth varies INSIDE blocks. The mandatory \`explain\` ladder stacks — at advanced you read
the basic and advanced rungs together. \`data-kb-level\` (visible from this level up, via
\`kb.mjs level\`) is the mechanism and untagged content is the basic core;
\`data-kb-register\` (rendered at exactly that lens, via \`kb.mjs register\`) is a rare
replacement tool. One element carries at most one of them.

See the root CLAUDE.md for the data contract before editing anything here.
`;
}

function forHazards(list) {
  return `# site/hazards

**Anti-patterns** — ${list.length} of them. Not to practise, only to recognise on sight.
Every one is what the patterns elsewhere exist to prevent.

Pages here: ${list.map((n) => n.id).sort().join(", ")}

Blocks, in order: ${BLOCKS.hazard.map((b) => `\`${b}\``).join(" → ")}.
Hazards carry \`data-kb-solves\`, but pointing the other way: the phrases are what the
sufferer *observes* ("we restart the service every night to keep it healthy"), and the page
they reach names the problem rather than fixing it. Keep them out of the \`essence\`, which
stays the terse definition. No "In the wild" block. They relate to patterns through
\`mitigated-by\`, whose inverse \`prevents-hazard\` must be declared on the pattern's page too.

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
Optional: \`sizing\`, \`interface\`, \`levels\`, \`explain\` — a low-level-design kata may skip
the first two. \`levels\` is the interviewer rubric (Mid/Senior/Staff expectations);
\`explain\` is the three-level reading ladder (basic/advanced/expert) — they are different
blocks and both may exist.

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
rule of thumb you check a decision against. They sit at two altitudes, and the hub groups them
that way: **writing the code** (SOLID, DRY, KISS, YAGNI and friends) and **building the system**
(self-healing, redundancy, minimize coordination, scale out and friends). Membership and order
come from \`PRINCIPLE_GROUPS\` in \`scripts/lib/model.mjs\` — a page missing from it validates
fine and silently never appears on the hub.

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

function forCapabilities(list) {
  return `# site/capabilities

**Cloud capabilities** — ${list.length} pages (the \`capability\` kind). Each takes one category
of managed cloud service as its subject and answers the question a reader arrives with when they
are holding a console: what can I buy here, what is it called on each cloud, and which patterns
am I still on the hook to build myself. Order comes from \`CAPABILITY_ORDER\` in
\`scripts/lib/model.mjs\` — a page missing from it validates fine and silently never appears on
the hub.

Pages here: ${list.map((n) => n.id).sort().join(", ")}

Blocks, in order: ${BLOCKS.capability.map((b) => `\`${b}\``).join(" → ")}.

**The capability is the subject; the products are evidence.** \`capabilities\` names each
capability with no product in it at all, as a \`dl.variations\` card. \`mapping\` is the
cross-cloud table — \`.table-scroll\` wrapping \`table.decision\`, columns Capability / AWS /
Azure / Google Cloud / Open source. The Open source cell carries the headline self-hosted
answer only (one name, two at most) and links the \`site/comparisons/\` page that argues the
choice where one exists; the depth lives there, not in the cell. \`choosing\` argues the
decision; \`portability\` lists what breaks when you move, each item a bold label then the
difference and what it costs.

Two rules bite harder here than anywhere else in the KB. **Anti-fabrication:** every cell is a
service name you are sure of or it is omitted — "no direct equivalent" and "no direct
open-source equivalent" are true, useful answers and belong in the table; an invented product
feature is a lie that ships to a public site.
**Naming decay:** prefer the stable capability-level answer to the newest brand, because these
are the pages that go out of date first.

A capability links to the patterns it packages with
\`node ../../scripts/kb.mjs link <id> implements <pattern>\`, which writes both sides and gives
the pattern an "Implemented by" backlink — distinct from "Demonstrated by", which is a case
study showing the pattern at work. Where the platform requires a discipline of you rather than
providing it, the verb is \`prerequisite\`, not \`implements\`.

Read with \`node ../../scripts/kb.mjs get <id>\`. See the root CLAUDE.md for the contract.
`;
}

function forComparisons(list) {
  return `# site/comparisons

**Product comparisons** — ${list.length} pages (the \`comparison\` kind). Each takes one product
decision as its subject: the managed services and the open-source contenders for a single
capability area, side by side, compared on the conditions that decide the choice. Order comes
from \`COMPARISON_ORDER\` in \`scripts/lib/model.mjs\` — a page missing from it validates fine
and silently never appears on the hub.

Pages here: ${list.map((n) => n.id).sort().join(", ")}

Blocks, in order: ${BLOCKS.comparison.map((b) => `\`${b}\``).join(" → ")}.

**The decision is the subject; the products are the contenders.** \`contenders\` is a
\`dl.variations\` — each \`dt\` a product name, each \`dd\` its character in one line, its
license, and who runs it for you. \`matrix\` is the condition-by-contender table —
\`.table-scroll\` wrapping \`table.decision\`, first column Criterion, one column per contender,
rows lens-tagged with at least one untagged. \`choosing\` argues the per-condition verdicts.

Two rules bite harder here than anywhere else in the KB. **Anti-fabrication:** every cell is a
fact you verified or it is omitted — a license, a feature, a managed offering; "no managed
offering" and "no direct open-source equivalent" are true, useful answers. **Naming decay:**
licenses and product lines change (Redis, Elasticsearch and CockroachDB all relicensed); prefer
the durable behavioural difference to the claim that dates fastest.

A comparison joins the graph twice: \`node ../../scripts/kb.mjs link <id> implements <pattern>\`
(these products are the pattern, runnable or buyable — the pattern gains an "Implemented by"
backlink) and \`node ../../scripts/kb.mjs link <id> specializes <capability>\` (the capability
page is the wider, provider-neutral subject; it gains a "Generalizes" backlink).

\`data-kb-aliases\` must carry the contender product names ("kafka", "rabbitmq") so
\`kb.mjs find kafka\` resolves here. \`data-kb-solves\` carries the decision's symptoms
("should we use Kafka or SQS", "we can't use it because of the license").

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
    : dir === "capabilities" ? forCapabilities(list)
    : dir === "comparisons" ? forComparisons(list)
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

/* ---------------- root count regions ----------------
 * Two inline marker regions keep the hand-written root docs' numbers derived:
 *   <!-- kb:counts -->…<!-- /kb:counts -->          the full breakdown by kind
 *   <!-- kb:page-count -->N<!-- /kb:page-count -->  the bare page total
 * Everything outside the markers is untouched. */
const kindCount = (k) => nodes.filter((n) => n.kind === k).length;
const countsText =
  `${kindCount("pattern")} software design patterns, ${kindCount("design")} design case studies, ` +
  `${kindCount("theme")} themes, ${kindCount("hazard")} hazards, ${kindCount("principle")} principles, ` +
  `${kindCount("capability")} cloud capabilities` +
  `${kindCount("comparison") ? ` and ${kindCount("comparison")} product comparisons` : ""} — ${nodes.length} pages in all`;
const REGIONS = [
  { tag: "kb:counts", text: countsText },
  { tag: "kb:page-count", text: String(nodes.length) },
];

for (const name of ["CLAUDE.md", "README.md"]) {
  const file = join(ROOT, name);
  const cur = readFileSync(file, "utf8");
  let next = cur;
  for (const { tag, text } of REGIONS) {
    const open = `<!-- ${tag} -->`;
    if (!next.includes(open)) {
      console.error(`${name}: missing ${open} region`);
      process.exit(1);
    }
    next = next.replace(
      new RegExp(`<!-- ${tag} -->[\\s\\S]*?<!-- /${tag} -->`, "g"),
      `${open}${text}<!-- /${tag} -->`,
    );
  }
  if (next === cur) continue;
  if (CHECK) stale.push(name);
  else { writeFileSync(file, next); written++; }
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
