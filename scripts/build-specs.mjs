#!/usr/bin/env node
/* build-specs.mjs — AUTHORING-TIME tool. Emits one fully-resolved page spec per node
 * into the scratchpad, plus an index the fan-out Workflow consumes. Each spec carries
 * everything an authoring agent needs so it never invents a link or a structural detail:
 * metadata, badges, breadcrumb, kicker, grouped relationships (hrefs pre-resolved),
 * themes/members, neighbor list for the mini-graph, prev/next nav, and the hazard "smell".
 */
import { readFileSync, writeFileSync, mkdirSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");
const SCRATCH = process.argv[2] || "/private/tmp/claude-501/-Users-oleksandrderechei-git/535e9b5b-fd69-4d0b-96d9-1c964a7fdfc8/scratchpad";
const SPECDIR = join(SCRATCH, "specs");
mkdirSync(SPECDIR, { recursive: true });

const graph = JSON.parse(readFileSync(join(ROOT, "site", "assets", "graph.json"), "utf8"));
const N = graph.nodes;
const EXEMPLARS = new Set(["circuit-breaker", "cap-theorem"]); // hand-authored templates

const BAND = {
  gof:          { label: "Objects & Classes", short: "GoF",          anchor: "band-gof-h",  kind: "elevation" },
  enterprise:   { label: "Application",       short: "Enterprise",   anchor: "band-ent-h",  kind: "elevation" },
  architecture: { label: "Architecture",      short: "Architecture", anchor: "band-arch-h", kind: "elevation" },
  distributed:  { label: "Network",           short: "Distributed",  anchor: "band-dist-h", kind: "elevation" },
  concurrency:  { label: "Concurrency",        short: "Concurrency", anchor: "lens-conc-h", kind: "lens" },
  messaging:    { label: "Messaging",          short: "Messaging",   anchor: "lens-msg-h",  kind: "lens" },
  caching:      { label: "Caching",            short: "Caching",     anchor: "lens-cache-h",kind: "lens" },
  ddd:          { label: "Domain-Driven Design", short: "DDD",       anchor: "lens-ddd-h",  kind: "lens" },
  functional:   { label: "Functional",         short: "Functional",  anchor: "lens-fp-h",   kind: "lens" },
  testing:      { label: "Testing",            short: "Testing",     anchor: "lens-test-h", kind: "lens" },
  security:     { label: "Security",           short: "Security",    anchor: "lens-sec-h",  kind: "lens" },
};
const GROUP_LABEL = {
  "gof-creational": "Creational", "gof-structural": "Structural",
  "gof-behavioral": "Behavioral", "gof-extra": "Also Essential",
  "distributed-resilience": "Resilience", "distributed-routing": "Routing & Scale",
  "distributed-coordination": "Coordination & Data",
};
const REL_ORDER = ["Combines with", "Alternative to", "Has variant", "Variant of", "Generalizes",
  "Specializes", "Enables", "Requires", "Composed of", "Part of", "Often confused with", "Prevents", "Mitigated by"];
const THEME_ORDER = ["cap-theorem", "streaming", "spike-handling", "performance", "auth-and-access",
  "scalability", "consistency-and-replication", "observability", "resilience"];
const HAZARD_ORDER = ["god-object", "spaghetti-code", "big-ball-of-mud", "anemic-domain-model", "golden-hammer", "boat-anchor"];

const all = Object.values(N);
const patternOrder = all.filter((n) => n.kind === "pattern").map((n) => n.id); // graph insertion order
const bandPatterns = {};
for (const id of patternOrder) { const b = N[id].band; (bandPatterns[b] ||= []).push(id); }

function navLink(id) { const n = N[id]; return { label: n.name, href: `../${n.dir}/${id}.html` }; }

function groupedRelations(n) {
  const byLabel = {};
  for (const r of n.relations) (byLabel[r.label] ||= []).push({ name: r.name, href: r.href, note: r.note });
  return REL_ORDER.filter((l) => byLabel[l]).map((l) => ({ label: l, items: byLabel[l] }));
}
function neighbors(n) {
  const seen = new Set(), out = [];
  for (const r of n.relations) { if (r.href && !seen.has(r.to)) { seen.add(r.to); out.push({ name: r.name, href: r.href }); } }
  return out.slice(0, 7);
}
function smell(n) {
  for (const r of n.relations) { const t = N[r.to]; if (t && t.kind === "hazard") return { name: r.name, href: r.href }; }
  return null;
}

function spec(n) {
  const b = BAND[n.band];
  const groupLabel = GROUP_LABEL[n.group] || null;
  let kicker, crumb, badges;
  if (n.kind === "hazard") {
    kicker = "Anti-pattern";
    crumb = [["Map", "../index.html"], ["Hazards", "../index.html#hazards-h"], [n.name, null]];
    badges = [{ text: "Hazard", muted: false }];
  } else if (n.kind === "theme") {
    kicker = "Theme · Building fluency";
    crumb = [["Map", "../index.html"], ["Themes", "../index.html#themes-h"], [n.name, null]];
    badges = [{ text: "Theme", muted: false }];
  } else if (b.kind === "lens") {
    kicker = `Lens · ${b.label}`;
    crumb = [["Map", "../index.html"], ["Lenses", `../index.html#${b.anchor}`], [b.label, `../index.html#${b.anchor}`], [n.name, null]];
    badges = [{ text: b.short, muted: false }, { text: "Lens", muted: true }];
  } else {
    kicker = groupLabel ? `${b.label} · ${groupLabel}` : b.label;
    crumb = [["Map", "../index.html"], [b.label, `../index.html#${b.anchor}`]];
    if (groupLabel) crumb.push([groupLabel, `../index.html#${b.anchor}`]);
    crumb.push([n.name, null]);
    badges = [{ text: b.short, muted: false }];
    if (groupLabel) badges.push({ text: groupLabel, muted: true });
  }

  // prev/next
  let prev = null, next = null;
  if (n.kind === "pattern") {
    const list = bandPatterns[n.band]; const i = list.indexOf(n.id);
    prev = i > 0 ? navLink(list[i - 1]) : { label: b.label, href: `../index.html#${b.anchor}` };
    next = i < list.length - 1 ? navLink(list[i + 1]) : { label: "The Map", href: "../index.html" };
  } else if (n.kind === "theme") {
    const i = THEME_ORDER.indexOf(n.id);
    prev = i > 0 ? navLink(THEME_ORDER[i - 1]) : { label: "Themes", href: "../index.html#themes-h" };
    next = i < THEME_ORDER.length - 1 ? navLink(THEME_ORDER[i + 1]) : { label: "The Map", href: "../index.html" };
  } else {
    const i = HAZARD_ORDER.indexOf(n.id);
    prev = i > 0 ? navLink(HAZARD_ORDER[i - 1]) : { label: "Hazards", href: "../index.html#hazards-h" };
    next = i < HAZARD_ORDER.length - 1 ? navLink(HAZARD_ORDER[i + 1]) : { label: "The Map", href: "../index.html" };
  }

  return {
    id: n.id, name: n.name, kind: n.kind, docClass: n.docClass, essence: n.essence,
    dir: n.dir, kicker, breadcrumb: crumb, badges, hasToggle: n.kind === "pattern",
    relations: groupedRelations(n), neighbors: neighbors(n), smell: smell(n),
    themes: n.themes, members: n.memberPatterns,
    nav: { prev, next, up: { label: "The Map", href: "../index.html" } },
    titleSuffix: n.kind === "theme" ? "Themes" : n.kind === "hazard" ? "Hazards" : "Patterns",
  };
}

const index = [];
for (const n of all) {
  if (EXEMPLARS.has(n.id)) continue;
  const s = spec(n);
  writeFileSync(join(SPECDIR, `${n.id}.json`), JSON.stringify(s, null, 2));
  index.push({ id: n.id, kind: n.kind, name: n.name, docClass: n.docClass, dir: n.dir });
}
writeFileSync(join(SCRATCH, "specs-index.json"), JSON.stringify(index));
console.log(`wrote ${index.length} specs to ${SPECDIR}`);
console.log(`patterns=${index.filter((x) => x.kind === "pattern").length} themes=${index.filter((x) => x.kind === "theme").length} hazards=${index.filter((x) => x.kind === "hazard").length}`);
