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
  theme:     ["framing", "architecture", "tradespace", "tour", "decide", "siblings"],
  principle: ["statement", "rationale", "applying", "overreach", "relationships"],
  /* A design is a worked case study — a whole system broken down the way a strong
   * interview answer would: requirements, a diagram of how it is built, the hard
   * sub-problems argued out, and the patterns it puts to work (via the typed
   * `relationships` block, so `kb.mjs link … demonstrates …` wires both sides). */
  design:    ["problem", "requirements", "estimation", "entities", "interface", "architecture", "deepdives", "tradeoffs", "levels", "relationships"],
};
/* Blocks that may legitimately be absent. `fluency` is only on patterns that a theme
 * tours; `wild` and `production` only where honest content exists; `architecture` is
 * only on themes that walk a concrete system (the ML case studies) and carry a diagram
 * of how it is built. On a design, `estimation` (back-of-envelope math) and `interface`
 * (the API surface) lean system-design and a low-level-design page may skip them, and
 * `levels` (the Mid/Senior/Staff rubric) is optional everywhere; the rest are mandatory. */
export const OPTIONAL_BLOCKS = new Set(["fluency", "wild", "production", "architecture", "estimation", "interface", "levels"]);

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
  "throughput", "transactions", "transformation", "ui-architecture", "validation",
  "machine-learning", "system-design", "low-level-design"
]);

/* Quick-filter facets for the hub search. A CLOSED, authored mapping — like TAGS and the
 * relation verbs, this is the ONE place the FE/BE/DB/AI and goal groupings are defined.
 * build.mjs resolves each chip's predicate against every node and ships the resulting id
 * lists into catalog.js, so search.js only intersects id sets and never re-derives meaning.
 *
 * A chip matches a node if its band is in `bands`, OR any of its tags is in `tags`, OR its
 * kind is in `kinds`, OR (`hasExample` and the node carries real-world examples). Fields are
 * OR-ed within a chip; the UI ANDs across rails and unions within a rail.
 *
 * Backend and Database have no band of their own, so they are expressed here as a mapping
 * over existing bands + tags. No page is re-tagged and nothing moves. */
export const FACETS = [
  { rail: "Layer", chips: [
    { id: "fe", label: "Frontend", bands: ["frontend"] },
    { id: "be", label: "Backend",
      bands: ["enterprise", "architecture", "distributed", "messaging", "concurrency"] },
    { id: "db", label: "Database", bands: ["caching"],
      tags: ["persistence", "data-access", "transactions", "replication", "partitioning", "data-modeling", "read-optimization"] },
    { id: "ai", label: "AI / ML", bands: ["ml"], tags: ["machine-learning"] },
  ] },
  { rail: "Goal", chips: [
    { id: "scalability",   label: "Scale",         tags: ["scalability", "throughput"] },
    { id: "resilience",    label: "Resilience",    tags: ["resilience", "availability"] },
    { id: "performance",   label: "Performance",   tags: ["performance", "latency"] },
    { id: "consistency",   label: "Consistency",   tags: ["consistency", "transactions"] },
    { id: "security-goal", label: "Security",      tags: ["security", "access-control", "authentication"] },
    { id: "observability", label: "Observability", tags: ["observability"] },
  ] },
  { rail: "Lens", chips: [
    { id: "distributed", label: "Distributed", bands: ["distributed"] },
    { id: "caching",     label: "Caching",     bands: ["caching"] },
    { id: "messaging",   label: "Messaging",   bands: ["messaging"] },
    { id: "concurrency", label: "Concurrency", bands: ["concurrency"] },
    { id: "testing",     label: "Testing",     bands: ["testing"] },
    { id: "ddd",         label: "DDD",         bands: ["ddd"] },
    { id: "functional",  label: "Functional",  bands: ["functional"] },
  ] },
  { rail: "Kind", chips: [
    { id: "pattern",   label: "Patterns",     kinds: ["pattern"] },
    { id: "hazard",    label: "Hazards",      kinds: ["hazard"] },
    { id: "theme",     label: "Themes",       kinds: ["theme"] },
    { id: "principle", label: "Principles",   kinds: ["principle"] },
    { id: "design",    label: "Case studies", kinds: ["design"] },
  ] },
  { rail: "Extras", chips: [
    { id: "has-example", label: "Has real-world example", hasExample: true },
  ] },
];

/** Does a facet chip's predicate match a node? Fields are OR-ed. The single definition of
 *  chip membership — build.mjs uses it to project resolved id lists into the catalog. */
export function chipMatches(chip, node) {
  if (chip.bands && chip.bands.includes(node.band)) return true;
  if (chip.tags && (node.tags || []).some((t) => chip.tags.includes(t))) return true;
  if (chip.kinds && chip.kinds.includes(node.kind)) return true;
  if (chip.hasExample && (node.examples || []).length > 0) return true;
  return false;
}

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
  /* A worked design puts a pattern to use; the pattern is shown at work by that design.
   * The design side is written by `kb.mjs link <design> demonstrates <pattern>`; the
   * inverse gives every pattern a "Demonstrated by" list of the real systems that use it. */
  "demonstrates":        { label: "Demonstrates",    inverse: "demonstrated-by" },
  "demonstrated-by":     { label: "Demonstrated by", inverse: "demonstrates" },
};

/* Canonical display order of relation groups on a page. */
export const REL_ORDER = [
  "Combines with", "Alternative to", "Has variant", "Variant of", "Generalizes",
  "Specializes", "Enables", "Requires", "Composed of", "Part of",
  "Often confused with", "Prevents", "Mitigated by",
  "Demonstrates", "Demonstrated by",
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

export const KIND_DIR = { pattern: "patterns", hazard: "hazards", theme: "themes", principle: "principles", design: "designs" };

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
  { id: "frontend",    kind: "lens", label: "Frontend",             short: "Frontend",    anchor: "lens-fe-h",    groups: [{ id: "frontend",    label: null }] },
  { id: "ml",          kind: "lens", label: "Machine Learning",     short: "ML",          anchor: "lens-ml-h",    groups: [{ id: "ml",          label: null }] },
];

export const THEME_ORDER = [
  "system-design-interview", "ml-system-design",
  "cap-theorem", "streaming", "realtime-updates", "spike-handling", "long-running-tasks",
  "multi-step-processes", "performance", "auth-and-access", "api-design",
  "frontend-architecture",
  "scalability", "scaling-reads", "scaling-writes", "consistency-and-replication",
  "observability", "resilience", "genai-scale", "caching",
  "dealing-with-contention", "proximity-search",
];
/* ML System Design case studies. Kept OUT of THEME_ORDER so they render as their own
 * dedicated hub + graph section ("ML System Design — Case Studies") rather than in the
 * general themes grid. They are ordinary theme-kind pages in every other respect. */
export const ML_CASE_STUDIES = [
  "harmful-content", "bot-detection", "video-recommendations",
];
/* System-design case studies — the `design` kind. Worked end-to-end solutions (the
 * HelloInterview katas) that break a real system down and `demonstrates` the patterns
 * they use. Kept in their own array (like ML_CASE_STUDIES) so they render as a dedicated
 * hub + graph section rather than in the themes grid. Editorial order runs roughly
 * simple → hard, then the low-level-design (OOP) katas, which carry the
 * `low-level-design` tag; the system-design katas carry `system-design`. The two ids
 * `design-distributed-cache` and `design-rate-limiter` are prefixed to avoid colliding
 * with the existing `distributed-cache` / `rate-limiter` pattern pages (ids are a global
 * key). The hub filters this list to pages that exist, so it can be populated one at a time. */
export const DESIGN_ORDER = [
  // system design (30)
  "bitly", "design-distributed-cache", "distributed-rate-limiter", "web-crawler",
  "top-k", "ad-click-aggregator", "metrics-monitoring",
  "fb-news-feed", "instagram", "fb-post-search", "google-news",
  "yelp", "gopuff", "uber", "tinder", "strava",
  "whatsapp", "fb-live-comments", "google-docs", "online-chess", "leetcode",
  "dropbox", "youtube", "chatgpt",
  "ticketmaster", "online-auction", "robinhood", "payment-system",
  "camelcamelcamel", "job-scheduler",
  // low-level design (9)
  "parking-lot", "elevator", "amazon-locker", "connect-four", "file-system",
  "logging-service", "inventory-management", "bookmyshow", "design-rate-limiter",
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
