#!/usr/bin/env node
/* build-hub.mjs — AUTHORING-TIME tool (not a site build step).
 * Emits site/index.html (the Software Design Atlas hub) from site/assets/graph.json, so the
 * tile list, per-section counts, and links stay in sync with the single source of truth.
 * Run:  node scripts/build-hub.mjs   (add --check to fail if index.html is stale)
 *
 * THE HUB IS ELEVEN SECTIONS AND ONE TILE SHAPE.
 * Both halves of that used to be untrue and both cost real bugs, so they are load-bearing:
 *
 *  - One `section()` helper builds all eleven, numbered POSITIONALLY from SECTIONS. The
 *    four elevation bands and the seven other sections were two markup families, and the
 *    jumpnav was a third, hand-written copy of the numerals — which is how #lens-fe-h came
 *    to be referenced 18 times from the corpus and linked from the nav zero times.
 *  - One `tile()` shape for every kind. A pattern chip and a case-study card were different
 *    elements, so search.js carried three loops and derived ids by parsing hrefs, and the
 *    card nested a <button> inside an <a>. Now everything is a `.chip` carrying its own
 *    `data-id`, and the client scripts each need one selector.
 *
 * ANCHORS ARE A PUBLIC CONTRACT. scripts/lib/template.mjs bakes `index.html#<anchor>` into
 * every page's breadcrumb and prev/next — ~757 links — and check-links.mjs strips the
 * fragment before resolving, so a renamed anchor is silently dead. Every id emitted here
 * must keep its spelling. That includes `ml-cases-h`, which outlived the section it named
 * and now sits on the case-study tier holding the ML studies.
 */
import { readFileSync, existsSync } from "node:fs";
import { writeAtomic } from "./lib/atomic.mjs";
import { fileURLToPath } from "node:url";
import { dirname, join, resolve } from "node:path";
import { BANDS, THEME_GROUPS, DESIGN_GROUPS, THEME_ORDER, DESIGN_ORDER, HAZARD_ORDER, PRINCIPLE_ORDER, PRINCIPLE_GROUPS, CAPABILITY_ORDER, COMPARISON_ORDER, esc } from "./lib/model.mjs";

/* KB_ROOT lets the smoke tests — and the pre-commit staged-tree check — point this
 * builder at another corpus. Without it a `KB_ROOT=... make check` silently validated
 * the working tree instead, which is the hole a staged-tree check exists to close.
 * Same contract as build.mjs. */
const ROOT = process.env.KB_ROOT
  ? resolve(process.env.KB_ROOT)
  : join(dirname(fileURLToPath(import.meta.url)), "..");
const OUT = join(ROOT, "site", "index.html");
const graph = JSON.parse(readFileSync(join(ROOT, "site", "assets", "graph.json"), "utf8"));
const N = graph.nodes;

const patternsIn = (group) =>
  Object.values(N).filter((n) => n.kind === "pattern" && n.group === group);
const bandTotal = (band) =>
  Object.values(N).filter((n) => n.kind === "pattern" && n.band === band).length;

/* Numerals come from POSITION in SECTIONS, not from BANDS — the ladder and the seven other
 * sections stopped being two numbering systems. BANDS[].numeral survives because
 * build-claude.mjs and build-stack-page.mjs still read it. */
const ROMAN = ["I", "II", "III", "IV", "V", "VI", "VII", "VIII", "IX", "X", "XI", "XII"];

/* ---------------------------------------------------------------- tiles ---- */

/* The favourite marker. `data-kb-favourite` on the page is the DEFAULT, not the answer:
 * favourites.js reads the rendered state as its seed and applies the visitor's own toggles
 * over it. So the star ships on every tile, pressed or not, and stays a real button — a
 * visitor curating from the map needs something to click on the ones nobody starred yet.
 * Without JS the markup still shows the authored picks and the buttons simply do nothing. */
const favAttrOf = (n) => (n.favourite ? ' data-fav="1"' : "");
const favStarOf = (n) =>
  `<button class="chip-fav" type="button" data-fav-id="${n.id}" aria-pressed="${
    n.favourite ? "true" : "false"
  }" aria-label="${n.favourite ? "Favourite — click to unmark" : "Mark favourite"}: ${esc(
    n.name,
  )}">★</button>`;

/* ONE tile for the whole hub. `data-id` sits on the tile itself, not only on its checkbox,
 * so a selector finds it whether or not it has one and no id is ever re-derived from an
 * href. n.path is site-relative and the hub sits at site/, so it needs no adjustment.
 *   sect  — the collapse key of the section this tile is counted under
 *   taxo  — ' data-band=… data-group=…', patterns only: it is the taxonomy, and it is also
 *           what lets progress.js compute a patterns-only total with no extra markup
 *   badge — data from the PAGE's own tags, never a second editorial list here
 *   card  — the wider variant with an accent stripe (everything that is not a pattern) */
function tile(n, { sect, taxo = "", badge = "", card = true, indent = "          " }) {
  const box = `<input class="chip-box" type="checkbox" data-id="${n.id}"${taxo} data-sect="${sect}" aria-label="Mark ${esc(n.name)} practiced">`;
  const bdg = badge ? `<span class="chip-badge">${esc(badge)}</span>` : "";
  return `${indent}<div class="chip${card ? " chip--card" : ""}" data-id="${n.id}"${favAttrOf(n)}>${box}<a class="chip-name" href="${n.path}">${esc(n.name)}</a>${bdg}<span class="chip-note">${esc(n.essence)}</span>${favStarOf(n)}</div>`;
}

const chip = (n, sect) =>
  tile(n, { sect, card: false, indent: "            ", taxo: ` data-band="${n.band}" data-group="${n.group}"` });
const chipsIn = (group, sect) => patternsIn(group).map((n) => chip(n, sect)).join("\n");
const cards = (ids, sect, badge) =>
  ids.map((id) => tile(N[id], { sect, badge: badge ? badge(N[id]) : "" })).join("\n");

/* A case study declares what KIND of exercise it is in its own data-kb-tags, which
 * build.mjs carries into graph.json — so the badge cannot disagree with the page.
 *
 * System design is the DEFAULT rather than a tag of its own: it was one, on 31 of the 40
 * case studies, and a tag every page of a kind carries but nine groups nothing the Kind
 * facet does not already group — it only spent a slot at the five-tag ceiling. The two
 * departures from the norm stay explicit, and the badge is what keeps the split readable
 * on the tile now that it is no longer selectable as a chip. */
const KIND_BADGES = [
  ["low-level-design", "Low-level design"],
  ["machine-learning", "Machine learning"],
];
const badgeOf = (n) =>
  KIND_BADGES.find(([t]) => (n.tags || []).includes(t))?.[1] ?? "System design";

/* ------------------------------------------------------- sections & subs ---- */

/* A subsection: band groups, lens cards, and the editorial theme / case-study / principle
 * groups. Same disclosure as a section, no numeral.
 *
 * `count` names which counter dimension the heading shows — "group" for a band's groups and
 * "band" for a lens (both patterns-only, both pre-existing), "sect" for the editorial
 * groups. `countKey` is deliberately SEPARATE from `key`: `key` is the collapse-store id
 * and is namespaced to stay unique across sections, while the counter has to match what
 * progress.js reads off the tiles themselves — a chip's own `data-group` / `data-band`,
 * which are taxonomy and not ours to rename. Conflating them silently freezes every
 * subsection counter at its build-time value. */
function sub({ key, anchor, label, note, count, countKey, total, body }) {
  const c = count ? ` <span class="count" data-count-${count}="${countKey ?? key}">0/${total}</span>` : "";
  return `        <details class="sub" open data-collapse="${key}">
          <summary><h3${anchor ? ` id="${anchor}"` : ""}>${esc(label)}${c}</h3></summary>
          <div class="sub-body">
${note ? `            <p class="sub-note">${esc(note)}</p>\n` : ""}${body}
          </div>
        </details>`;
}

/* A top-level section. The LEAD SITS IN THE BODY, not the summary: a <summary> is exposed
 * as a button and its text becomes the accessible name, so a two-sentence lead there would
 * be read out as a two-sentence button. The <h2> may live inside a <summary> and keeps the
 * heading outline intact, which is also why no aria-labelledby is wanted — a <details> is
 * not a labelled region, and its summary already names it. */
function section(s, i) {
  return `    <details class="sec" open data-collapse="${s.key}"${s.tone ? ` data-tone="${s.tone}"` : ""}>
      <summary class="sec-head">
        <span class="marker" aria-hidden="true"><span class="numeral">${ROMAN[i]}</span></span>
        <h2 id="${s.anchor}">${esc(s.title)}</h2>
        <span class="count" data-count-sect="${s.key}">0/${s.total}</span>
      </summary>
      <div class="sec-body">
        <p class="sec-lead">${s.lead}</p>
${s.body}
      </div>
    </details>`;
}

/* ---- I-IV: the elevation ladder ---- */
const elevationSections = BANDS.filter((b) => b.kind === "elevation").map((b) => {
  const key = b.anchor.replace(/-h$/, "");
  const single = b.groups.length === 1 && b.groups[0].label === null;
  const body = single
    ? `        <div class="chips">\n${chipsIn(b.groups[0].id, key)}\n        </div>`
    : b.groups.map((g) => sub({
        key: `${key}-${g.id.replace(`${b.id}-`, "")}`, countKey: g.id,
        label: g.label, count: "group", total: patternsIn(g.id).length,
        body: `            <div class="chips">\n${chipsIn(g.id, key)}\n            </div>`,
      })).join("\n");
  return { key, anchor: b.anchor, title: b.label, lead: esc(b.desc), total: bandTotal(b.id), body };
});

/* ---- V: hazards ---- */
/* A hazard now carries a checkbox like everything else. It reads as "worked through", not
 * "adopted" — recognising an anti-pattern on sight is something you can have done. */
const hazardSection = {
  key: "sec-hazards", anchor: "hazards-h", title: "Hazards & Antipatterns", tone: "hazard",
  lead: "Not to practice, just to recognize on sight. Every one is what the patterns above exist to prevent.",
  total: HAZARD_ORDER.length,
  body: `        <div class="chips">\n${cards(HAZARD_ORDER, "sec-hazards")}\n        </div>`,
};

/* ---- VI: case studies ---- */
const designSection = {
  key: "sec-cases", anchor: "design-cases-h", title: "Case Studies",
  lead: 'Worked end-to-end designs: each takes one problem from requirements to a diagram of the built system, argues the hard trade-offs, and links every pattern it puts to work. Grouped by how much the exercise asks of you — the badge on each tile says what kind it is.',
  total: DESIGN_ORDER.length,
  body: DESIGN_GROUPS.map((g) => sub({
    key: `sec-cases-${g.id}`,
    label: g.label, note: g.note, count: "sect", total: g.ids.length,
    body: `            <div class="chips">\n${cards(g.ids, `sec-cases-${g.id}`, badgeOf)}\n            </div>`,
  })).join("\n"),
};

/* ---- VII: themes ---- */
const themeSection = {
  key: "sec-themes", anchor: "themes-h", title: "Themes — building fluency",
  lead: "Not a rung and not a lens: each theme is a guided tour of how many patterns combine to answer one systems question.",
  total: THEME_ORDER.length,
  body: THEME_GROUPS.map((g) => sub({
    key: `sec-themes-${g.id}`, label: g.label, note: g.note,
    count: "sect", total: g.ids.length,
    body: `            <div class="chips">\n${cards(g.ids, `sec-themes-${g.id}`)}\n            </div>`,
  })).join("\n"),
};

/* ---- VIII: lenses ---- */
/* Each lens is a subsection keeping its own `lens-*-h` anchor — 199 links across the corpus
 * point at those, and they are the only per-lens targets that ever existed. */
const LENSES = BANDS.filter((b) => b.kind === "lens");
const lensSection = {
  key: "sec-lenses", anchor: "lenses-h", title: "Lenses", tone: "brass",
  lead: "Not another rung on the ladder — these reshape how you build at whatever elevation you're already working.",
  total: LENSES.reduce((t, b) => t + bandTotal(b.id), 0),
  body: LENSES.map((b) => sub({
    key: b.anchor.replace(/-h$/, ""), countKey: b.id, anchor: b.anchor, label: b.label,
    count: "band", total: bandTotal(b.id),
    body: `            <div class="chips">\n${chipsIn(b.id, "sec-lenses")}\n            </div>`,
  })).join("\n"),
};

/* ---- IX: principles ---- */
const principleSection = {
  key: "sec-principles", anchor: "principles-h", title: "Principles — how to do it well",
  lead: "A principle is a rule of thumb you check a decision against. They come at two altitudes — the maxims that keep a codebase simple, decoupled and cheap to change, and the maxims that keep a running system available, scalable and operable. Each page cross-links to the patterns that embody it and the hazards it guards against.",
  total: PRINCIPLE_ORDER.filter((id) => N[id]).length,
  body: PRINCIPLE_GROUPS
    .map((g) => ({ ...g, ids: g.ids.filter((id) => N[id]) }))
    .filter((g) => g.ids.length)
    .map((g) => sub({
      key: `sec-principles-${g.id}`, anchor: `principles-${g.id}-h`,
      label: g.label, note: g.note, count: "sect", total: g.ids.length,
      body: `            <div class="chips">\n${cards(g.ids, `sec-principles-${g.id}`)}\n            </div>`,
    })).join("\n"),
};

/* ---- X, XI: cloud capabilities and product comparisons ---- */
/* Both filtered to pages that exist, so each can be populated one page at a time; a section
 * with nothing in it drops out of SECTIONS entirely rather than shipping a bare heading. */
const CAPABILITIES = CAPABILITY_ORDER.filter((id) => N[id]);
const capabilitySection = {
  key: "sec-capabilities", anchor: "capabilities-h", title: "Cloud Capabilities — what you can buy",
  lead: "One page per category of managed service. Each names the capabilities in provider-neutral terms, maps them across AWS, Azure and Google Cloud, and links the patterns the category packages for you — and the ones you are still on the hook to build. Services are matched, never feature-for-feature equivalent.",
  total: CAPABILITIES.length,
  body: `        <div class="chips">\n${cards(CAPABILITIES, "sec-capabilities")}\n        </div>`,
};

const COMPARISONS = COMPARISON_ORDER.filter((id) => N[id]);
const comparisonSection = {
  key: "sec-comparisons", anchor: "comparisons-h", title: "Comparisons — picking the product",
  lead: "One page per product decision: the managed services and the open-source contenders for one capability, compared on the conditions that decide the choice — license, ops burden, scaling shape, and what each one locks you into.",
  total: COMPARISONS.length,
  body: `        <div class="chips">\n${cards(COMPARISONS, "sec-comparisons")}\n        </div>`,
};

const SECTIONS = [
  ...elevationSections,
  hazardSection, designSection, themeSection, lensSection,
  principleSection, capabilitySection, comparisonSection,
].filter((s) => s.total);

/* Every non-pattern page must appear in exactly one ordered list, or it is a page nobody
 * can reach from the hub — which validates clean and stays invisible until someone happens
 * to notice. It already had: `host-header-rewriting` was written, linked and shipped, and
 * was on no section of the map. Patterns are exempt because their band and group place
 * them automatically. */
const placed = new Set([
  ...THEME_ORDER, ...DESIGN_ORDER, ...PRINCIPLE_ORDER,
  ...HAZARD_ORDER, ...CAPABILITY_ORDER, ...COMPARISON_ORDER,
]);
const orphans = Object.values(N).filter((n) => n.kind !== "pattern" && !placed.has(n.id));
if (orphans.length) {
  console.error(`on no hub section — add each to its ordered list in scripts/lib/model.mjs:`);
  for (const n of orphans) console.error(`  ${n.kind}: ${n.id}`);
  process.exit(1);
}

const totalPatterns = Object.values(N).filter((n) => n.kind === "pattern").length;
const totalPages = Object.keys(N).length;

const html = `<!doctype html>
<html lang="en">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <title>The Software Design Atlas</title>
  <meta name="description" content="A cross-linked map of ${totalPages} pages on software and system design — ${totalPatterns} patterns, plus worked case studies, hazards, principles, cloud capabilities and theme tours.">
  <link rel="stylesheet" href="assets/kb-hub.css">
  <script src="assets/kb.js" data-profile="hub"></script>
</head>
<body>
<div class="page">
  <header class="masthead">
    <p class="eyebrow">Software Design · Reference</p>
    <h1>The Software Design Atlas</h1>
    <div class="controls">
      <span class="progress" id="global-progress" title="Progress is saved locally in this browser. Nothing leaves your machine.">— practiced</span>
      <button class="reset-btn" id="reset-btn" type="button">Reset progress</button>
      <button class="fav-filter-btn" id="fav-filter-btn" type="button" aria-pressed="false">★ Favourites</button>
    </div>
    <nav class="jumpnav" aria-label="Jump to section">
${SECTIONS.map((s, i) => `      <a href="#${s.anchor}">${ROMAN[i]} · ${esc(s.title.split(" — ")[0])}</a>`).join("\n")}
      <a href="map/graph.html">Graph ↗</a>
      <a href="map/stack.html">Stack ↗</a>
      <a href="vocab.html">Vocabulary ↗</a>
    </nav>
  </header>

  <main>

${SECTIONS.map(section).join("\n\n")}

  </main>
</div>
</body>
</html>
`;

if (process.argv.includes("--check")) {
  const cur = existsSync(OUT) ? readFileSync(OUT, "utf8") : "";
  if (cur !== html) { console.error("index.html is STALE — run: node scripts/build-hub.mjs"); process.exit(1); }
  console.log("index.html is up to date.");
} else {
  writeAtomic(OUT, html);
  console.log(`index.html written: ${SECTIONS.length} sections, ${totalPages} tiles (${totalPatterns} patterns).`);
}
