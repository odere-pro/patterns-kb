/* model.mjs — the single source of truth for the KB's taxonomy and ontology.
 *
 * Before this module the band/group tables were copied into three scripts
 * (build-graph, build-hub, build-specs), which meant adding a band required
 * touching all three and nothing caught a disagreement.
 *
 * Labels are stored as PLAIN TEXT. Consumers escape at render time — do not
 * bake "&amp;" into a label here.
 */

/* The namespace for KB-specific terms in JSON-LD. It is an identifier, not a fetch
 * target — nothing dereferences it — but it points at the published vocab page so a
 * reader can look a term up. One constant, so a repo rename is a one-line change. */
export const VOCAB_NS = "https://odere-pro.github.io/patterns-kb/vocab.html#";
export const KB_NAME = "Patterns KB";

/* Blocks each kind of page is expected to carry, in order. The section id doubles as
 * the anchor and the semantic key, so this is both a vocabulary and a lint rule. */
export const BLOCKS = {
  pattern:   ["description", "structure", "variations", "tradeoffs", "usage", "sketch", "wild", "production", "relationships", "fluency"],
  hazard:    ["description", "causes", "cost", "mitigation"],
  theme:     ["framing", "tradespace", "tour", "decide", "siblings"],
  principle: ["statement", "rationale", "applying", "overreach", "relationships"],
};
/* Blocks that may legitimately be absent. `fluency` is only on patterns that a theme
 * tours; `wild` and `production` only where honest content exists; the rest are
 * mandatory. */
export const OPTIONAL_BLOCKS = new Set(["fluency", "wild", "production"]);

/* Tags are a CLOSED vocabulary, like the relation verbs. They exist to group and
 * filter — a tag used on one page groups nothing. The first sweep of this KB was
 * written by 18 agents with no shared list and produced 280 tags, 154 of them used
 * exactly once; consolidating them yielded these. Adding one is a deliberate act:
 * put it here first, and only if it will honestly apply to three or more pages. */
export const TAGS = new Set([
  "abstraction", "access-control", "api-design", "asynchrony", "authentication",
  "availability", "backpressure", "batching", "boundaries", "buffering", "caching",
  "code-smell", "composition", "concurrency", "consistency", "coordination", "data-access",
  "data-modeling", "decoupling", "domain-modeling", "durability", "edge", "encapsulation",
  "error-handling", "event-driven", "extensibility", "immutability", "instantiation-control",
  "integration", "isolation", "latency", "legacy", "lifecycle", "load-balancing",
  "maintainability", "messaging", "modularity", "observability", "partitioning", "performance",
  "persistence", "polymorphism", "read-optimization", "readability", "replication",
  "resilience", "resource-management", "routing", "scalability", "security",
  "separation-of-concerns", "state-management", "test-doubles", "testability", "testing",
  "throughput", "transactions", "transformation", "ui-architecture", "validation"
]);

/* ---- ontology: the closed relation vocabulary ---- */
export const RELATION_TYPES = {
  "combines-with":       { label: "Combines with",      symmetric: true },
  "alternative-to":      { label: "Alternative to",     symmetric: true },
  "often-confused-with": { label: "Often confused with", symmetric: true },
  "variant-of":          { label: "Variant of",   inverse: "has-variant" },
  "has-variant":         { label: "Has variant",  inverse: "variant-of" },
  "specializes":         { label: "Specializes",  inverse: "generalizes" },
  "generalizes":         { label: "Generalizes",  inverse: "specializes" },
  "prerequisite":        { label: "Requires",     inverse: "enables" },
  "enables":             { label: "Enables",      inverse: "prerequisite" },
  "composed-of":         { label: "Composed of",  inverse: "part-of" },
  "part-of":             { label: "Part of",      inverse: "composed-of" },
  "prevents-hazard":     { label: "Prevents",     inverse: "mitigated-by" },
  "mitigated-by":        { label: "Mitigated by", inverse: "prevents-hazard" },
};

/* Canonical display order of relation groups on a page. */
export const REL_ORDER = [
  "Combines with", "Alternative to", "Has variant", "Variant of", "Generalizes",
  "Specializes", "Enables", "Requires", "Composed of", "Part of",
  "Often confused with", "Prevents", "Mitigated by",
];

// A small curated synonym bridge for search: a symptom phrased as "stale" should still
// reach a page that only says "outdated". Synonym hits score at half weight so the author's
// own vocabulary still wins ties. The single source of truth — kb.mjs `find` imports it, and
// build.mjs projects it into catalog.js so the offline hub search reads the same map.
export const SYNONYMS = {
  stale: ["outdated", "expired"], outdated: ["stale"],
  slow: ["latency", "lag"], latency: ["slow", "delay"], delay: ["latency"],
  crash: ["failure", "outage"], failure: ["crash", "fault", "outage"], outage: ["failure"],
  queue: ["backlog", "buffer"], backlog: ["queue"],
  timeout: ["deadline"], deadline: ["timeout"],
  spike: ["burst", "surge"], burst: ["spike", "surge"], surge: ["spike"],
  overload: ["saturated", "overwhelmed"], saturated: ["overload"],
  throttle: ["rate", "limit"], concurrency: ["parallelism"], parallelism: ["concurrency"],
  cache: ["caching", "cached"], caching: ["cache"],
  duplicate: ["duplication", "dedupe"], config: ["configuration"],
  auth: ["authentication", "authorization"], database: ["db"],
  retry: ["retries", "reattempt"], hang: ["hangs", "block", "stuck"], stuck: ["hang", "block"],
};

export const KIND_DIR = { pattern: "patterns", hazard: "hazards", theme: "themes", principle: "principles" };

/* ---- taxonomy ----
 * `kind: "elevation"` bands are the I-IV ladder; `kind: "lens"` bands cut across it.
 * A band whose groups are a single entry with `label: null` is not subdivided —
 * its group id equals its band id, and no group heading renders.
 */
export const BANDS = [
  {
    id: "gof", kind: "elevation", numeral: "I",
    label: "Objects & Classes", short: "GoF", anchor: "band-gof-h",
    desc: "Gang of Four, 1994 — the 23 patterns everything else stands on, plus a few essentials the book missed",
    groups: [
      { id: "gof-creational", label: "Creational" },
      { id: "gof-structural", label: "Structural" },
      { id: "gof-behavioral", label: "Behavioral" },
      { id: "gof-extra",      label: "Also Essential" },
    ],
  },
  {
    id: "enterprise", kind: "elevation", numeral: "II",
    label: "Application", short: "Enterprise", anchor: "band-ent-h",
    desc: "Organizing one app's business logic and data access (Fowler, PoEAA)",
    groups: [{ id: "enterprise", label: null }],
  },
  {
    id: "architecture", kind: "elevation", numeral: "III",
    label: "Architecture", short: "Architecture", anchor: "band-arch-h",
    desc: "Shaping how a whole system's components are arranged",
    groups: [{ id: "architecture", label: null }],
  },
  {
    id: "distributed", kind: "elevation", numeral: "IV",
    label: "Network", short: "Distributed", anchor: "band-dist-h",
    desc: "Keeping many services reliable, fast, and consistent across a network",
    groups: [
      { id: "distributed-resilience",   label: "Resilience" },
      { id: "distributed-routing",      label: "Routing & Scale" },
      { id: "distributed-coordination", label: "Coordination & Data" },
    ],
  },

  { id: "concurrency", kind: "lens", label: "Concurrency",          short: "Concurrency", anchor: "lens-conc-h",  groups: [{ id: "concurrency", label: null }] },
  { id: "messaging",   kind: "lens", label: "Messaging",            short: "Messaging",   anchor: "lens-msg-h",   groups: [{ id: "messaging",   label: null }] },
  { id: "caching",     kind: "lens", label: "Caching",              short: "Caching",     anchor: "lens-cache-h", groups: [{ id: "caching",     label: null }] },
  { id: "ddd",         kind: "lens", label: "Domain-Driven Design",  short: "DDD",         anchor: "lens-ddd-h",   groups: [{ id: "ddd",         label: null }] },
  { id: "functional",  kind: "lens", label: "Functional",           short: "Functional",  anchor: "lens-fp-h",    groups: [{ id: "functional",  label: null }] },
  { id: "testing",     kind: "lens", label: "Testing",              short: "Testing",     anchor: "lens-test-h",  groups: [{ id: "testing",     label: null }] },
  { id: "security",    kind: "lens", label: "Security",             short: "Security",    anchor: "lens-sec-h",   groups: [{ id: "security",    label: null }] },
];

export const THEME_ORDER = [
  "system-design-interview",
  "cap-theorem", "streaming", "realtime-updates", "spike-handling", "long-running-tasks",
  "multi-step-processes", "performance", "auth-and-access", "api-design",
  "scalability", "scaling-reads", "scaling-writes", "consistency-and-replication",
  "observability", "resilience", "genai-scale", "caching",
  "dealing-with-contention", "proximity-search",
];
export const HAZARD_ORDER = [
  "god-object", "spaghetti-code", "big-ball-of-mud", "anemic-domain-model",
  "golden-hammer", "boat-anchor",
  "cache-stampede", "hot-key", "stale-cache",
  "race-condition", "deadlock", "unbounded-queue", "resource-leak", "n-plus-1-query",
];
/* Editorial order for the principle section: universal heuristics first, then SOLID,
 * then the OO-structural maxims. Drives the hub's Principles grid. */
export const PRINCIPLE_ORDER = [
  "dry", "kiss", "yagni",
  "single-responsibility", "open-closed", "liskov-substitution",
  "interface-segregation", "dependency-inversion",
  "composition-over-inheritance", "law-of-demeter", "separation-of-concerns",
];

/* ---- derived lookups ---- */
const BY_ID = new Map(BANDS.map((b) => [b.id, b]));

export const ELEVATION_BANDS = new Set(
  BANDS.filter((b) => b.kind === "elevation").map((b) => b.id),
);

export const band = (id) => BY_ID.get(id);
export const isElevation = (id) => ELEVATION_BANDS.has(id);

/** Group label, or null when the band is not subdivided. */
export function groupLabel(groupId) {
  for (const b of BANDS) {
    const g = b.groups.find((g) => g.id === groupId);
    if (g) return g.label;
  }
  return null;
}

/** The band a group belongs to. */
export function bandOfGroup(groupId) {
  return BANDS.find((b) => b.groups.some((g) => g.id === groupId));
}

/** Escape text for interpolation into HTML. */
export const esc = (s) =>
  String(s).replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");

/** Directory a node's page lives in, relative to site/.
 *  Patterns nest by band, plus a group level only where the band is subdivided.
 *  Hazards and themes stay flat. */
export function folderFor({ kind, band: bandId, group }) {
  if (kind !== "pattern") return KIND_DIR[kind];
  const b = BY_ID.get(bandId);
  if (!b) throw new Error(`unknown band: ${bandId}`);
  const subdivided = b.groups.length > 1 || b.groups[0].label !== null;
  const leaf = subdivided ? `/${group.replace(`${bandId}-`, "")}` : "";
  return `patterns/${bandId}${leaf}`;
}
