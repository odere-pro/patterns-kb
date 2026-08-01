/* model.mjs — the single source of truth for the KB's taxonomy and ontology.
 *
 * Before this module the band/group tables were copied into three scripts
 * (build-graph, build-hub, build-specs), which meant adding a band required
 * touching all three and nothing caught a disagreement.
 *
 * Labels are stored as PLAIN TEXT. Consumers escape at render time — do not
 * bake "&amp;" into a label here.
 */

/* Where the site publishes. Used for absolute links in exports (the graph page's
 * "Copy as Markdown") and as the base of the JSON-LD namespace below. */
export const SITE_URL = "https://odere-pro.github.io/patterns-kb/";

/* The namespace for KB-specific terms in JSON-LD. It is an identifier, not a fetch
 * target — nothing dereferences it — but it points at the published vocab page so a
 * reader can look a term up. One constant, so a repo rename is a one-line change. */
export const VOCAB_NS = SITE_URL + "vocab.html#";
export const KB_NAME = "Patterns KB";

/* ---- the seven page kinds ----
 * The closed vocabulary `data-kb-kind` takes, and the key BLOCKS, OPTIONAL_BLOCKS and
 * KIND_DIR are all indexed by — audit-vocab.mjs asserts the four agree, which is the only
 * thing stopping this list drifting from the tables it keys. Ordered as the hub meets
 * them, not alphabetically. Descriptions interpolate raw, so they may carry <code>. */
export const KINDS = [
  ["pattern", "A reusable solution to a recurring problem, filed at one rung of the elevation ladder or under one lens. The largest kind, and the one the other six point at."],
  ["hazard", "A failure mode with a name — what goes wrong, what it costs, and which patterns keep it from happening. A hazard names the problem rather than fixing it; the fix is a <code>mitigated-by</code> hop away."],
  ["theme", "A guided tour through the patterns that answer one recurring question. A theme owns its membership: its tour steps are the source of truth, and each pattern names the theme back."],
  ["principle", "A design maxim — SOLID, DRY, KISS, YAGNI. Not a mechanism you build but a rule you honour, which is why it carries a mandatory block on how it fails when taken too far."],
  ["design", "A worked case study — a system-design or low-level-design kata argued end to end, from requirements through the hard sub-problems. It joins the graph through <code>demonstrates</code>."],
  ["capability", "One category of managed cloud service, taking the capability as its subject and the vendors' products as evidence. It joins the graph through <code>implements</code>."],
  ["comparison", "One product decision: the managed services and open-source contenders for a single capability area, side by side, compared on the conditions that decide the choice."],
];

/* Blocks each kind of page is expected to carry, in order. The section id doubles as
 * the anchor and the semantic key, so this is both a vocabulary and a lint rule.
 *
 * Every kind extends ONE base skeleton: it opens `description` → `explain` and closes
 * `relationships`; only the middle is kind-specific. The opener id is `description` on
 * every kind — the visible heading may still be kind-flavoured ("The question",
 * "Understanding the problem") but the anchor and the semantic key are shared, so
 * `kb.mjs get <any-id> --block description` works on every kind. */
const BASE_OPEN  = ["description", "explain"];
const BASE_CLOSE = ["relationships"];
const KIND_BLOCKS = {
  pattern:   ["structure", "variations", "tradeoffs", "usage", "sketch", "wild", "production", "fluency"],
  hazard:    ["causes", "cost", "mitigation"],
  theme:     ["architecture", "tradespace", "tour", "decide", "siblings"],
  principle: ["rationale", "applying", "overreach"],
  /* A design is a worked case study — a whole system broken down the way a strong
   * interview answer would: requirements, a diagram of how it is built, the hard
   * sub-problems argued out, and the patterns it puts to work (via the typed
   * `relationships` block, so `kb.mjs link … demonstrates …` wires both sides). */
  design:    ["requirements", "sizing", "entities", "interface", "architecture", "deepdives", "tradeoffs", "levels"],
  /* A capability is a category of thing the cloud sells — managed queues, object stores,
   * elastic compute. It takes the CAPABILITY as its subject and the vendors' products as
   * evidence: `capabilities` is the provider-neutral taxonomy, `mapping` the cross-cloud
   * table, `choosing` the decision, `portability` what breaks when you move. It joins the
   * pattern graph through `implements`, so a pattern page gains an "Implemented by" list
   * of the cloud capabilities that package it. */
  capability: ["capabilities", "mapping", "choosing", "portability"],
  /* A comparison takes ONE product decision as its subject — the managed services and
   * the open-source contenders for a single capability area, side by side. `contenders`
   * names the products (license and managed offerings included), `matrix` compares them
   * on the conditions that decide the choice, `choosing` argues the per-condition
   * verdicts. It joins the graph through `implements` (these products ARE the pattern,
   * runnable or buyable) and `specializes` (its capability page is the wider subject). */
  comparison: ["contenders", "matrix", "choosing"],
};
export const BLOCKS = Object.fromEntries(
  Object.entries(KIND_BLOCKS).map(([kind, mid]) => [kind, [...BASE_OPEN, ...mid, ...BASE_CLOSE]]),
);
/* Blocks that may legitimately be absent, PER KIND. `fluency` is only on patterns that
 * a theme tours; `wild` and `production` only where honest content exists; theme
 * `architecture` is only on themes that walk a concrete system (the ML case studies);
 * a theme's `relationships` is optional because themes join the graph through tour
 * membership, not typed edges. On a design, `sizing` and `interface` lean
 * system-design and a low-level-design page may skip them, and `levels` (the
 * Mid/Senior/Staff rubric) is optional everywhere. `explain` is mandatory on every
 * kind — the ladder is the per-level explanation the lens shows. */
export const OPTIONAL_BLOCKS = {
  pattern:   new Set(["wild", "production", "fluency"]),
  hazard:    new Set([]),
  theme:     new Set(["architecture", "relationships"]),
  principle: new Set([]),
  design:    new Set(["sizing", "interface", "levels"]),
  capability: new Set([]),
  comparison: new Set([]),
};

/* ---- what each block is for ----
 * BLOCKS says which blocks a kind carries and in what order; this says what each one
 * ANSWERS. Ordered the way the skeleton is built: the two openers, then the kind-specific
 * middles in KIND_BLOCKS order, then the shared closer. A block appearing on more than one
 * kind (`architecture`, `tradeoffs`, `choosing`) is described once, in terms both kinds
 * recognise. Descriptions interpolate raw, so they may carry <code>. */
export const BLOCK_DESC = {
  description: "Frames the subject. Its heading is kind-flavoured — &ldquo;The question&rdquo;, &ldquo;Understanding the problem&rdquo; — but the anchor is <code>description</code> on every kind, so one call fetches the opener of any page.",
  explain: "The three-rung ladder: one paragraph per reading level, stacked. Mandatory on every kind, because it is the per-level explanation the lens shows.",

  structure: "How the happy path crosses the components, as a numbered topology walk. The sequence diagram carrying timing and the failure branches follows it one lens up.",
  variations: "The named forms the pattern takes, each a card: what changes, and what that buys.",
  tradeoffs: "What the choice costs and what it buys, argued from both sides. On a design it reads as strengths against risks, biggest flaw named first.",
  usage: "When to reach for it and when not to — the reader's situation, not the pattern's features.",
  sketch: "The smallest code that shows the mechanism working. Collapsed by default; the language selects the highlighter.",
  wild: "Real, well-known implementations that genuinely exemplify the pattern. Optional, and empty is a better answer than a guess.",
  production: "What it takes to run: the tuning knobs, the signals to watch, what breaks first under load, and the gates before shipping.",
  fluency: "Where the pattern shows up — the themes whose tours visit it. Hand-authored, and it must agree with the tour that owns it.",

  causes: "What produces the hazard — the decisions and pressures that end in this failure mode.",
  cost: "What the hazard costs once it lands, in the terms the person paying it feels.",
  mitigation: "How to keep it from happening, as narrative. The typed edges to the patterns that prevent it live in <code>relationships</code>.",

  architecture: "The primary diagram and the walk through it. On a theme it maps a concrete system; on a design it is the board plus the trace from every functional requirement to the component that satisfies it.",
  tradespace: "The axes the theme's decision moves along, and what trading one for another actually costs.",
  tour: "The ordered walk through the theme's patterns, each step naming the role that pattern plays here. This is the source of truth for theme membership.",
  decide: "The decision table — the conditions that pick one member of the theme over another.",
  siblings: "The neighbouring themes, and the line where this one stops and that one starts.",

  rationale: "Why the principle helps — the mechanism behind the maxim, not a restatement of it.",
  applying: "How to honour it in practice, at the grain of a decision someone actually makes.",
  overreach: "How it fails when taken too far. Mandatory on every principle, because a maxim with no stated limit is advice nobody can argue with.",

  requirements: "What the system must do (functional) and how well (non-functional). Everything downstream argues from here.",
  sizing: "Right-sizing: the interaction shape, the numbers run, and each candidate technology adopted, rejected or deferred with a reason.",
  entities: "The core entities and their data design — each with its role, a one-line description and a trimmed schema.",
  interface: "The API surface, grouped by caller, each endpoint with its method, path and contract.",
  deepdives: "One argued deep dive per non-functional requirement, each carrying its own zoom or an iterated board.",
  levels: "What a Mid, Senior and Staff candidate demonstrably does with this problem. A rubric, distinct from the <code>explain</code> ladder.",

  capabilities: "The provider-neutral taxonomy of what this category of service does. No product names — those are evidence, and they live in the mapping.",
  mapping: "The cross-cloud table: each capability against what AWS, Azure and Google Cloud call it, or an honest &ldquo;no first-party equivalent&rdquo;.",
  choosing: "The decision argued out — which option wins under which conditions, and why.",
  portability: "What breaks when you move between providers, and what each break costs.",

  contenders: "The products in the running, with their licenses and whether a managed offering exists.",
  matrix: "The contenders compared on the conditions that decide the choice, one row per condition.",

  relationships: "The typed edges to other pages. Generated by <code>kb.mjs link</code>, declared on both pages, and the reason the graph exists.",
};

/* ---- the closed polarity vocabulary ----
 * Which side of a multi-sided block an item argues. Three families, one per block that has
 * sides, in BLOCKS.pattern order. CLOSED as of this change: the shape was declared "closed"
 * in ATTRIBUTES from the start, but nothing enforced membership, so a typo would have
 * shipped as a silently unstyled item. validate.mjs rejects a value outside this set,
 * audit-vocab.mjs mirrors that at corpus scale, and build-vocab.mjs renders it. */
export const POLARITIES = [
  { name: "pro", block: "tradeoffs", desc: "An argument for adopting the page's subject — what it buys you." },
  { name: "con", block: "tradeoffs", desc: "An argument against — what it costs, stated as a fact rather than hedged." },
  { name: "when", block: "usage", desc: "A situation that calls for the pattern, written as the reader's circumstance." },
  { name: "avoid", block: "usage", desc: "A situation where reaching for it makes things worse." },
  { name: "knob", block: "production", desc: "A configuration surface you actually turn — a named parameter, or a dial described without attributing it to a product." },
  { name: "signal", block: "production", desc: "An observable quantity worth watching: queue depth, replication lag, p99 latency." },
  { name: "failure", block: "production", desc: "What breaks first under load, and how it looks when it does." },
  { name: "check", block: "production", desc: "A gate to clear before shipping." },
];

/* ---- the closed sketch-language vocabulary ----
 * `data-kb-lang` on a code sketch selects the highlighter (site/assets/sketch.js). Closed
 * against the corpus rather than aspirational: these nine are the nine in use, and
 * audit-vocab.mjs fails on a member nothing uses. The tail is one page each, so that check
 * is deliberately one page-deletion away from red — which is the point. Ordered by use. */
export const SKETCH_LANGS = [
  { id: "typescript", label: "TypeScript", desc: "The corpus default. Most sketches are TypeScript because it types the shapes without demanding a runtime." },
  { id: "http", label: "HTTP", desc: "Raw request and response exchanges, where the wire format is the thing being shown." },
  { id: "python", label: "Python", desc: "Used where the pattern's home is data or ML tooling." },
  { id: "sql", label: "SQL", desc: "Schema and query sketches, where the mechanism lives in the database." },
  { id: "json", label: "JSON", desc: "A payload or config shape shown on its own." },
  { id: "javascript", label: "JavaScript", desc: "Used where the sketch must run untyped, as shipped browser code does." },
  { id: "protobuf", label: "Protocol Buffers", desc: "A schema definition where the contract, not the code, is the point." },
  { id: "lua", label: "Lua", desc: "Embedded scripting, as a gateway or cache runs it." },
  { id: "text", label: "Plain text", desc: "No highlighting — for output, logs and anything that is not a language." },
];

/* ---- reading levels ----
 * Every page reads at three depths — the SAME block skeleton at every lens, with the
 * content adapted inside the blocks. Two authored attributes, two semantics:
 *
 *   data-kb-level    = "visible from this level up" (min-level ACCRETION). Higher
 *                      lenses see MORE items — extra tradeoffs, operational nuance.
 *   data-kb-register = "rendered at EXACTLY this lens" (VARIANT). Adjacent siblings
 *                      carrying registers form one variant group — the same idea,
 *                      re-explained in the register of each level. The explain
 *                      ladder is the canonical variant group.
 *
 * An element with neither attribute is universal. An element carries at most ONE of
 * the two (make check enforces the XOR), and no section may render empty at any lens.
 * The vocabulary is CLOSED, like TAGS and the relation verbs. */
export const LEVELS = ["basic", "advanced", "expert"];   // ordered, ascending depth
export const LEVEL_LABELS = { basic: "Basic", advanced: "Advanced", expert: "Expert" };
/** Rank of a level for comparisons; unknown levels rank as -1. */
export const levelRank = (l) => LEVELS.indexOf(l);

/* Per-kind whole-block visibility policy — RETIRED with the 2026-08 register
 * mechanism: every block is visible at every lens, and depth varies INSIDE blocks
 * (registers + element levels). The stamping machinery in build-pages.mjs is kept
 * and self-cleaning, so an empty policy strips any stale section-level stamp. */
export const BLOCK_LEVELS = {
  pattern:   {},
  hazard:    {},
  theme:     {},
  principle: {},
  design:    {},
  capability: {},
  comparison: {},
};

/* Tags are a CLOSED vocabulary, like the relation verbs. They exist to group and
 * filter — a tag used on one page groups nothing. The first sweep of this KB was
 * written by 18 agents with no shared list and produced 280 tags, 154 of them used
 * exactly once; consolidating them yielded these. Adding one is a deliberate act:
 * put it here first, and only if it will honestly apply to three or more pages.
 *
 * Three rules, all machine-enforced — membership by build.mjs and validate.mjs, the
 * other two by audit-vocab.mjs and validate.mjs:
 *   1. every tag on a page is in this set;
 *   2. every page carries 2-5 tags;
 *   3. every tag in this set is used on 3+ pages.
 * Alphabetical, so a new tag has one obvious home and the diff stays readable. A tag that
 * lands on every page of one kind and nowhere else groups nothing the Kind facet does not
 * already group; audit-vocab.mjs warns on those rather than failing, because retiring one
 * means retagging every page that carries it. */
export const TAGS = new Set([
  "abstraction", "access-control", "api-design", "asynchrony", "authentication",
  "availability", "backpressure", "batching", "boundaries", "buffering", "caching",
  "cloud", "code-smell", "composition", "concurrency", "consistency", "coordination",
  "data-access", "data-modeling", "decoupling", "domain-modeling", "durability", "edge",
  "encapsulation", "error-handling", "event-driven", "extensibility", "immutability",
  "instantiation-control", "integration", "isolation", "latency", "legacy", "lifecycle",
  "load-balancing", "low-level-design", "machine-learning", "maintainability", "messaging",
  "modularity", "observability", "operations", "partitioning", "performance",
  "persistence", "polymorphism", "read-optimization", "readability", "replication",
  "resilience", "resource-management", "routing", "scalability", "security",
  "separation-of-concerns", "state-management", "test-doubles",
  "testability", "testing", "throughput", "transactions", "transformation",
  "ui-architecture", "validation",
]);

/* What earns each tag, for the reader browsing the vocabulary rather than the build.
 * One line per tag, saying what a page must be ABOUT to carry it — not restating the tag,
 * which is the failure mode a generated gloss falls into ("groups pages about caching").
 * audit-vocab.mjs holds this to TAGS in both directions, so a new tag needs its line here
 * in the same change. Descriptions interpolate raw, so they may carry <code>. */
export const TAG_DESC = {
  abstraction: "Hiding a concrete thing behind a name, so callers depend on the name.",
  "access-control": "Deciding who may do what, once identity is already established.",
  "api-design": "The shape of a contract between a caller and a service.",
  asynchrony: "Work that continues after the caller stops waiting for it.",
  authentication: "Establishing who the caller actually is.",
  availability: "Staying answerable when parts of the system are not.",
  backpressure: "Letting a slow consumer push back on a fast producer instead of drowning.",
  batching: "Trading latency for throughput by handling many items as one.",
  boundaries: "Where one part of a system stops and the next begins.",
  buffering: "Holding work in the middle to absorb a mismatch in rate.",
  caching: "Keeping a copy closer or cheaper to read, and paying the staleness bill.",
  cloud: "Managed platform services, and what depending on them costs.",
  "code-smell": "A structure that works but signals a design going wrong.",
  composition: "Building behaviour by assembling parts rather than extending a type.",
  concurrency: "More than one thing in flight, and the coordination that demands.",
  consistency: "Which readers see which writes, and when.",
  coordination: "Getting independent participants to agree on something.",
  "data-access": "How code reaches storage, and what that coupling costs.",
  "data-modeling": "Choosing the shapes data is stored and queried in.",
  decoupling: "Removing a dependency so two parts can change apart.",
  "domain-modeling": "Letting the business domain, not the database, shape the code.",
  durability: "Surviving a crash with the accepted writes intact.",
  edge: "Work done near the user rather than at the origin.",
  encapsulation: "Keeping state private so invariants have one owner.",
  "error-handling": "What happens on the unhappy path, deliberately.",
  "event-driven": "Reacting to things that happened rather than being told what to do.",
  extensibility: "Adding a case without editing what already works.",
  immutability: "Values that never change, so nothing changes underneath a reader.",
  "instantiation-control": "Deciding what gets created, when, and by whom.",
  integration: "Joining systems that were not designed together.",
  isolation: "Containing a failure or a workload so it cannot spread.",
  latency: "How long one operation takes, as felt by the caller.",
  legacy: "Working with a system you cannot rewrite.",
  lifecycle: "Creation, reuse and disposal, and who is responsible for each.",
  "load-balancing": "Spreading work across interchangeable workers.",
  "low-level-design": "Class-and-object design: an interview kata at the scale of one component.",
  "machine-learning": "Serving or training models as a systems problem.",
  maintainability: "How cheaply the next person can change it safely.",
  messaging: "Passing work as messages instead of calls.",
  modularity: "Splitting a system into parts that can be understood alone.",
  observability: "Being able to tell what the system is doing from outside it.",
  operations: "Running the thing: deploys, capacity, incidents.",
  partitioning: "Splitting data or work so no single node holds all of it.",
  performance: "Doing the same work with less time or less hardware.",
  persistence: "Storing state so it outlives the process.",
  polymorphism: "One call site, several behaviours, chosen at run time.",
  "read-optimization": "Shaping storage around how it is read rather than written.",
  readability: "Code a stranger can follow without a guide.",
  replication: "Keeping more than one copy, and reconciling them.",
  resilience: "Degrading rather than collapsing when a dependency fails.",
  "resource-management": "Bounding scarce things — connections, memory, threads.",
  routing: "Choosing where a request goes.",
  scalability: "Handling more load by adding capacity rather than rewriting.",
  security: "Keeping a hostile caller from getting what they want.",
  "separation-of-concerns": "One reason to change per part.",
  "state-management": "Where mutable state lives and who may touch it.",
  "test-doubles": "Standing in for a real collaborator during a test.",
  testability: "Designing so the thing can be checked in pieces.",
  testing: "How the system is proved to work.",
  throughput: "How much work completes per unit of time.",
  transactions: "Grouping changes so they land together or not at all.",
  transformation: "Converting data from one shape into another.",
  "ui-architecture": "Structuring a client: rendering, state and data fetching.",
  validation: "Rejecting bad input at the boundary, before it becomes state.",
};

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
    { id: "capability", label: "Cloud capabilities", kinds: ["capability"] },
    { id: "comparison", label: "Comparisons", kinds: ["comparison"] },
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

/* ---- ontology: the closed relation vocabulary ----
 * Each verb carries a `desc`: one sentence saying what the edge asserts, written from the
 * declaring page's side ("this page" is the side the edge is authored on). build-vocab.mjs
 * renders it on vocab.html, so the ontology and the prose describing it stay the same
 * thing. Two verbs render under a label that does not echo their id — `prerequisite` shows
 * as "Requires" and `prevents-hazard` as "Prevents" — and their descriptions say so. */
export const RELATION_TYPES = {
  "combines-with": { label: "Combines with", symmetric: true,
    desc: "The two are used together, each covering what the other leaves open." },
  "alternative-to": { label: "Alternative to", symmetric: true,
    desc: "Either one solves the problem, so you choose between them rather than adopting both." },
  "often-confused-with": { label: "Often confused with", symmetric: true,
    desc: "The two get mistaken for each other; know the difference before you pick one." },
  "variant-of": { label: "Variant of", inverse: "has-variant",
    desc: "This page is a narrower form of the target, differing in one deliberate way." },
  "has-variant": { label: "Has variant", inverse: "variant-of",
    desc: "The target is a narrower form of this page, differing in one deliberate way." },
  /* `specializes` carries two meanings, both load-bearing: a pattern narrowing a wider
   * pattern, and a product comparison narrowing the capability area it compares within. */
  "specializes": { label: "Specializes", inverse: "generalizes",
    desc: "This page narrows the target to one case — a tighter pattern, or a product comparison sitting under the capability area it compares within." },
  "generalizes": { label: "Generalizes", inverse: "specializes",
    desc: "This page is the wider subject that the target narrows to one case." },
  "prerequisite": { label: "Requires", inverse: "enables",
    desc: "You cannot adopt this page without the target already in place, which is why it renders as Requires." },
  "enables": { label: "Enables", inverse: "prerequisite",
    desc: "Having this page in place is what makes the target possible." },
  "composed-of": { label: "Composed of", inverse: "part-of",
    desc: "The target is one of the parts this page is built from." },
  "part-of": { label: "Part of", inverse: "composed-of",
    desc: "This page is one of the parts the target is built from." },
  "prevents-hazard": { label: "Prevents", inverse: "mitigated-by",
    desc: "Adopting this page keeps the target hazard from happening, which is why it renders as Prevents." },
  "mitigated-by": { label: "Mitigated by", inverse: "prevents-hazard",
    desc: "The target is what you adopt to keep this hazard from happening." },
  /* A worked design puts a pattern to use; the pattern is shown at work by that design.
   * The design side is written by `kb.mjs link <design> demonstrates <pattern>`; the
   * inverse gives every pattern a "Demonstrated by" list of the real systems that use it. */
  "demonstrates": { label: "Demonstrates", inverse: "demonstrated-by",
    desc: "This worked case study puts the target to use, so you can read the pattern at work in a real system." },
  "demonstrated-by": { label: "Demonstrated by", inverse: "demonstrates",
    desc: "The target is a worked case study that puts this page to use." },
  /* A cloud capability or a product comparison ships a pattern ready-made; the pattern is
   * available off the shelf from it. Written by `kb.mjs link <capability|comparison>
   * implements <pattern>`. Kept distinct from `demonstrates` because the two answer
   * different questions: a case study shows a pattern AT WORK in one system, a capability
   * or comparison says you can BUY or RUN it. Where the platform instead DEMANDS the
   * pattern of you — elastic compute needs your service stateless — the verb is
   * `prerequisite`. */
  "implements": { label: "Implements", inverse: "implemented-by",
    desc: "This service category or product comparison ships the target ready-made, so you can buy or run it instead of building it." },
  "implemented-by": { label: "Implemented by", inverse: "implements",
    desc: "The target is a service category or set of products you can get this page ready-made from." },
};

/* Canonical display order of relation groups on a page. */
export const REL_ORDER = [
  "Combines with", "Alternative to", "Has variant", "Variant of", "Generalizes",
  "Specializes", "Enables", "Requires", "Composed of", "Part of",
  "Often confused with", "Prevents", "Mitigated by",
  "Demonstrates", "Demonstrated by", "Implements", "Implemented by",
];

/* ---- the JSON-LD term set ----
 * The `kb:` properties build-pages.mjs emits into every page's <script type="application/
 * ld+json">, BEYOND the 17 relation verbs. This list is COMPLETE by construction and
 * audit-vocab.mjs proves it: every term appearing in any page's JSON-LD must resolve to a
 * fragment on vocab.html, and every entry here must have one. Three of these are projected
 * rather than authored — `note` comes from a relation's .rel-note text, `in-theme` and
 * `tours` are the two directions of theme membership derived from `data-kb-member`. They
 * have no attribute of their own; see ATTRIBUTES for the layer authors actually write.
 * Descriptions are interpolated raw, so they may carry <code> markup. */
export const JSONLD_PROPS = [
  ["kind", "Which of the seven page kinds this is — <code>pattern</code>, <code>hazard</code>, <code>theme</code>, <code>principle</code>, <code>design</code> (a worked case study), <code>capability</code> (a category of managed cloud service), or <code>comparison</code> (a product decision: managed services and open-source contenders side by side)."],
  ["band", "The elevation band or lens the pattern belongs to. Also its folder."],
  ["group", "The subdivision within a band, where one exists. Also its folder."],
  ["note", "Why two things relate, from this side. Each side may phrase it its own way; only the edge and its verb must agree."],
  ["role", "What a pattern does in the service of one particular theme."],
  ["in-theme", "A theme whose tour visits this pattern. The inverse of <code>kb:tours</code>."],
  ["tours", "A pattern this theme's tour visits. The inverse of <code>kb:in-theme</code>."],
];

/* ---- the authored attribute layer ----
 * Every `data-kb-*` an author writes by hand or through kb.mjs. Distinct from
 * JSONLD_PROPS: that is what the page EMITS, this is what someone WROTE. audit-vocab.mjs
 * fails if the corpus carries an attribute missing from here, so adding one to the
 * toolchain means adding it here in the same change.
 *
 *   scope     root    on <main data-kb-id> — one per page
 *             section on a <section data-kb-block>
 *             element on an individual item
 *   shape     text | json-array | closed (a fixed vocabulary) | boolean | id-ref
 *   required  true when every page (or every element of that kind) must carry it
 *
 * Two entries are available but unexercised: `register` (the rare replacement variant, no
 * authored use in the corpus) and `maps` (validated and consumed by build-stack-page.mjs,
 * awaiting the first comparison page). They are documented because the toolchain enforces
 * them, not because the corpus uses them. */
export const ATTRIBUTES = [
  { name: "id", scope: "root", required: true, shape: "text",
    desc: "The page's stable identifier, and the target every relationship and citation names. It must match the file name and the page's place on disk." },
  { name: "kind", scope: "root", required: true, shape: "closed",
    desc: "One of the seven page kinds. It fixes which blocks the page must carry and which folder it lives in." },
  { name: "band", scope: "root", required: true, shape: "closed",
    desc: "The elevation band or lens. The page's path must agree with it, and <code>make check</code> fails if they diverge." },
  { name: "group", scope: "root", required: true, shape: "closed",
    desc: "The subdivision within a band, where one exists. Also part of the path." },
  { name: "order", scope: "root", required: true, shape: "text",
    desc: "Editorial sort key within the band or kind. It drives hub order and the prev/next links, so it is pedagogical rather than alphabetical." },
  { name: "essence", scope: "root", required: true, shape: "text",
    desc: "The terse one-liner the hub chip and the index render. Distinct from the page's longer <code>p.doc-essence</code>, which reads as a definition; both exist and neither replaces the other." },
  { name: "tags", scope: "root", required: true, shape: "json-array",
    desc: "Two to five tags from the closed set below. JSON-valued so the attribute survives a comma." },
  { name: "solves", scope: "root", required: false, shape: "json-array",
    desc: "Three to five symptoms in the reader's own words — what someone types who has the problem and does not yet know this page exists. Never the page's own name or jargon. Themes carry none; their essence takes the search weight instead." },
  { name: "aliases", scope: "root", required: false, shape: "json-array",
    desc: "Genuinely used alternate names, so a search for one finds the page. An empty list is a good answer; invented nicknames are not." },
  { name: "favourite", scope: "root", required: false, shape: "boolean",
    desc: "Marks an editorial pick — a &#9733; chip on the hub and a filter that collapses the map to the picks. It is the authored default only: a visitor's own stars are stored locally and win." },
  { name: "block", scope: "section", required: true, shape: "closed",
    desc: "Which block this section is. The section's <code>id</code> is the same string, so the anchor and the semantic key never drift apart." },
  { name: "rel", scope: "element", required: true, shape: "closed",
    desc: "The relation verb this item declares, from the 17 above. Every edge is declared on both pages it joins." },
  { name: "to", scope: "element", required: true, shape: "id-ref",
    desc: "The page id at the other end of the relation. A target that names no page fails the build." },
  { name: "level", scope: "element", required: false, shape: "closed",
    desc: "The reading level this element is visible <strong>from</strong> — the lenses are cumulative, so a higher one shows it and everything below. Absent means the element is part of the basic core every reader sees." },
  { name: "register", scope: "element", required: false, shape: "closed",
    desc: "The single lens an element renders at, replacing its simpler sibling instead of adding to it. A rare tool, for the few places where showing both versions at once would be wrong; <code>data-kb-level</code> is the default. An element carries at most one of the two." },
  { name: "polarity", scope: "element", required: false, shape: "closed",
    desc: "Which side of a multi-sided block an item argues. A closed set of eight, across the three blocks that have sides — <a href=\"#polarities\">listed above</a>." },
  { name: "example", scope: "element", required: false, shape: "text",
    desc: "Identifies one real-world implementation in the &ldquo;In the wild&rdquo; block, so it can be cited and lens-tagged individually." },
  { name: "lang", scope: "element", required: true, shape: "closed",
    desc: "The language of a code sketch, which selects the highlighter. Required on every sketch." },
  { name: "role", scope: "element", required: true, shape: "text",
    desc: "What a pattern does in the service of one theme, written on the theme's tour step." },
  { name: "member", scope: "element", required: true, shape: "id-ref",
    desc: "The pattern a theme's tour step visits. This is the source of truth for theme membership, and the build projects it both ways." },
  { name: "theme", scope: "element", required: true, shape: "id-ref",
    desc: "The theme a pattern's &ldquo;Where it shows up&rdquo; item claims. Hand-authored, so it can drift from the tour that owns it — <code>make check</code> fails either half alone." },
  { name: "maps", scope: "element", required: false, shape: "id-ref",
    desc: "Pins an <code>implements</code> edge to one row of this page's own mapping or matrix table, so the stack index can show the services that package the pattern rather than link a whole table. Optional; when present it must name a real row." },
];

// A small curated synonym bridge for search: a symptom phrased as "stale" should still
// reach a page that only says "outdated". Synonym hits score at half weight so the author's
// own vocabulary still wins ties. The single source of truth — kb.mjs `find` imports it, and
// build.mjs projects it into catalog.js so the offline hub search reads the same map.
export const SYNONYMS = {
  stale: ["expired"], outdated: ["stale"],
  slow: ["latency", "lag"], latency: ["slow", "delay"], delay: ["latency"],
  crash: ["failure", "outage"], failure: ["crash", "fault", "outage"], outage: ["failure"],
  queue: ["backlog", "buffer"], backlog: ["queue"],
  timeout: ["deadline"], deadline: ["timeout"],
  spike: ["burst", "surge"], burst: ["spike", "surge"], surge: ["spike"],
  overload: ["overwhelmed"], saturated: ["overload"],
  throttle: ["rate", "limit"], parallelism: ["concurrency"],
  cache: ["caching", "cached"], caching: ["cache"],
  config: ["configuration"],
  auth: ["authentication", "authorization"],
  retry: ["retries"], hang: ["hangs", "block", "stuck"], stuck: ["hang", "block"],
  intermittent: ["flaky"], skew: ["drift"], diverged: ["drift"],
  hotspot: ["bottleneck"], chokepoint: ["bottleneck"],
  rollback: ["undo"], revert: ["undo"], mismatch: ["inconsistent"],
  starvation: ["exhausted"], starved: ["exhausted"],
  frozen: ["freeze", "stuck", "hangs"], unresponsive: ["stuck", "freeze"],
  redelivery: ["replay", "redelivered"],
};

/* A prose link is any internal link that is NOT one of the typed carriers rendering
 * itself as a link, page furniture, or the generated "Mentioned by" list. That last
 * exclusion is load-bearing: the list is derived FROM prose links, so indexing it
 * would feed the derivation its own output and grow a new mention every build. Shared
 * by the derivation in build.mjs and by `kb.mjs refs`, which must agree on what counts. */
export const PROSE_LINK_EXCLUDE =
  "[data-kb-rel], [data-kb-member], .fluency-item, .crumb, .docnav, .mentions";

export const KIND_DIR = { pattern: "patterns", hazard: "hazards", theme: "themes", principle: "principles", design: "designs", capability: "capabilities", comparison: "comparisons" };

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
    /* Five subsections, and two of them carry a `dir` alias. "Routing & Scale" and
     * "Coordination & Data" had each grown past 25 patterns — a heading joined by "&" is
     * a heading doing two jobs, and a subsection that long stops being a subsection. Each
     * split in two. The folders did NOT move: `dir` points the two new groups at the
     * directories their pages already sit in, so the split cost 27 attribute edits instead
     * of 27 file moves plus every relative link into and out of them. See folderFor(). */
    groups: [
      { id: "distributed-resilience",   label: "Resilience" },
      { id: "distributed-routing",      label: "Routing" },
      { id: "distributed-scale",        label: "Scale",       dir: "routing" },
      { id: "distributed-coordination", label: "Coordination" },
      { id: "distributed-data",         label: "Data",        dir: "coordination" },
    ],
  },

  /* The nine lenses. Each `desc` is read in three places — the bands section of vocab.html,
   * the section lead on map/stack.html (build-stack-page.mjs), and the briefing line in
   * site/patterns/<lens>/CLAUDE.md (build-claude.mjs) — so each one keeps the "cuts across
   * the ladder rather than being a rung on it" framing that the CLAUDE.md fallback used to
   * supply. Adding or reworking one rewrites all three artifacts; `make all` converges. */
  { id: "concurrency", kind: "lens", label: "Concurrency",          short: "Concurrency", anchor: "lens-conc-h",
    desc: "Sharing work across threads and cores without sharing the bugs — a concern at every elevation, not a rung on the ladder",
    groups: [{ id: "concurrency", label: null }] },
  { id: "messaging",   kind: "lens", label: "Messaging",            short: "Messaging",   anchor: "lens-msg-h",
    desc: "Moving work between components as messages rather than calls, which changes the failure modes at any elevation",
    groups: [{ id: "messaging",   label: null }] },
  { id: "caching",     kind: "lens", label: "Caching",              short: "Caching",     anchor: "lens-cache-h",
    desc: "Trading freshness for speed, and paying the invalidation bill that comes with it — applicable wherever a read is expensive",
    groups: [{ id: "caching",     label: null }] },
  { id: "ddd",         kind: "lens", label: "Domain-Driven Design",  short: "DDD",         anchor: "lens-ddd-h",
    desc: "Letting the business domain shape the code's boundaries, which reshapes how you build at every elevation",
    groups: [{ id: "ddd",         label: null }] },
  { id: "functional",  kind: "lens", label: "Functional",           short: "Functional",  anchor: "lens-fp-h",
    desc: "Composing behaviour from values and pure transformations instead of mutable state — a style you apply at any elevation",
    groups: [{ id: "functional",  label: null }] },
  { id: "testing",     kind: "lens", label: "Testing",              short: "Testing",     anchor: "lens-test-h",
    desc: "Making a system provable in pieces, which is a property you design in at every elevation rather than add at the end",
    groups: [{ id: "testing",     label: null }] },
  { id: "security",    kind: "lens", label: "Security",             short: "Security",    anchor: "lens-sec-h",
    desc: "Deciding who may do what, and containing the blast when that decision is wrong — a concern that cuts through every rung",
    groups: [{ id: "security",    label: null }] },
  { id: "frontend",    kind: "lens", label: "Frontend",             short: "Frontend",    anchor: "lens-fe-h",
    desc: "Structuring the client — state, rendering and data fetching — with the same forces that shape a server, one layer closer to the user",
    groups: [{ id: "frontend",    label: null }] },
  { id: "ml",          kind: "lens", label: "Machine Learning",     short: "ML",          anchor: "lens-ml-h",
    desc: "Serving and training models as a system problem: throughput, freshness and cost, rather than the modelling itself",
    groups: [{ id: "ml",          label: null }] },
];

/* Editorial groups for the Themes section, in five subsections because 34 tiles under one
 * heading is a wall rather than a section. The order inside each group is the order you
 * meet the questions, not alphabetical. Drives the hub — a page missing from here still
 * builds and validates and simply never appears on the map, which is why build-hub.mjs
 * asserts that every non-pattern page is placed in exactly one ordered list. */
export const THEME_GROUPS = [
  {
    id: "starting",
    label: "Starting a design",
    note: "The frameworks that turn a vague prompt into a design you can defend.",
    ids: ["system-design-interview", "ml-system-design"],
  },
  {
    id: "shaping",
    label: "Shaping the system",
    note: "Where the boundaries go, what crosses them, and who is allowed through.",
    ids: [
      "architecture-styles", "service-boundaries", "microservices-design",
      "api-design", "frontend-architecture", "auth-and-access",
    ],
  },
  {
    id: "data",
    label: "Moving and storing data",
    note: "What it costs to keep copies in step, and how work gets from one place to another.",
    ids: [
      "cap-theorem", "consistency-and-replication", "streaming", "realtime-updates",
      "long-running-tasks", "multi-step-processes", "caching", "proximity-search",
    ],
  },
  {
    id: "scale",
    label: "Scale and speed",
    note: "Serving more load than one machine can, and answering faster than the naive path allows.",
    ids: [
      "scalability", "scaling-reads", "scaling-writes", "performance",
      "spike-handling", "dealing-with-contention", "genai-scale",
    ],
  },
  {
    id: "operating",
    label: "Running it in production",
    note: "The design areas of an always-on workload, in the order you meet them: what the pieces are, how they are bundled, how traffic reaches them, where state lives, how you know it is well, how you change it safely, and how you run it.",
    ids: [
      "resilience", "observability", "continuous-delivery",
      "workload-composition", "scale-units-and-stamps", "global-traffic-and-ingress",
      "data-platform", "health-modeling", "continuous-validation",
      "securing-availability", "operating-a-live-system",
    ],
  },
];
export const THEME_ORDER = THEME_GROUPS.flatMap((g) => g.ids);
/* Case studies — worked end-to-end solutions that break a real system down and
 * `demonstrates` the patterns they use. Grouped by how much the exercise asks of you, NOT
 * by what kind of exercise it is: a reader picks the next one by whether they are ready
 * for it, and the kind is already on the tile as a badge read from the page's own
 * `data-kb-tags` (`low-level-design` / `machine-learning`, and System design where the
 * page claims neither).
 *
 * That is why the three ML case studies sit here rather than in a section of their own —
 * they are the same exercise at the same three depths. They remain ordinary theme-kind
 * pages in site/themes/; only where they render changed.
 *
 * The two ids `design-distributed-cache` and `design-rate-limiter` are prefixed to avoid
 * colliding with the existing `distributed-cache` / `rate-limiter` pattern pages (ids are
 * a global key). The hub filters these lists to pages that exist, so a tier can be
 * populated one page at a time. */
export const DESIGN_GROUPS = [
  {
    id: "foundational",
    label: "Foundational",
    note: "One clear bottleneck each, and a design that fits on a whiteboard. Start here — every later study assumes these moves.",
    ids: [
      "bitly", "design-distributed-cache", "distributed-rate-limiter", "top-k",
      "web-crawler", "metrics-monitoring",
      "parking-lot", "elevator", "connect-four", "amazon-locker",
      "design-rate-limiter", "file-system", "logging-service",
    ],
  },
  {
    id: "intermediate",
    label: "Intermediate",
    note: "Several subsystems that have to agree, and a read or write path hot enough to shape the whole design.",
    ids: [
      "ad-click-aggregator", "fb-news-feed", "instagram", "fb-post-search", "google-news",
      "yelp", "gopuff", "strava", "whatsapp", "fb-live-comments", "dropbox",
      "camelcamelcamel", "inventory-management", "bookmyshow",
      "harmful-content", "bot-detection",
    ],
  },
  {
    id: "advanced",
    label: "Advanced",
    note: "Contention, correctness under concurrency, or money and safety on the line — where the interesting answer is a trade-off rather than a component.",
    ids: [
      "uber", "tinder", "google-docs", "online-chess", "leetcode", "youtube", "chatgpt",
      "ticketmaster", "online-auction", "robinhood", "payment-system",
      "job-scheduler", "persona-identification",
      "video-recommendations",
    ],
  },
];
export const DESIGN_ORDER = DESIGN_GROUPS.flatMap((g) => g.ids);
/* Cloud capability categories — the `capability` kind. Each takes one category of managed
 * service as its subject, names the provider-neutral capabilities inside it, maps them
 * across AWS / Azure / Google Cloud, and links the patterns the category packages. Order
 * runs foundation-first: the things you provision, then the things that carry traffic
 * between them, then the things that govern the whole account. The hub filters this list
 * to pages that exist, so it can be populated one at a time. */
export const CAPABILITY_ORDER = [
  "compute", "storage", "databases", "messaging", "networking", "identity",
  "regions", "resources", "data-analytics",
];
/* Product comparisons — the `comparison` kind. One page per product decision, ordered to
 * shadow CAPABILITY_ORDER: the comparisons for a capability area sit where that area sits.
 * The hub filters this list to pages that exist, so it can be populated one at a time. */
export const COMPARISON_ORDER = [
  "object-stores", "relational-databases", "key-value-stores", "search-engines",
  "message-brokers", "workflow-orchestrators", "load-balancers-and-gateways",
  "identity-providers",
];
export const HAZARD_ORDER = [
  "god-object", "spaghetti-code", "big-ball-of-mud", "distributed-monolith", "anemic-domain-model",
  "golden-hammer", "boat-anchor",
  "cache-stampede", "hot-key", "stale-cache", "no-caching", "hot-partition",
  "split-brain", "dual-write-inconsistency",
  "race-condition", "deadlock", "starvation", "unbounded-queue", "resource-leak", "improper-instantiation",
  "n-plus-1-query", "chatty-io", "extraneous-fetching",
  "busy-database", "monolithic-persistence",
  "synchronous-io", "busy-front-end", "connection-pool-exhaustion", "host-header-rewriting",
  "retry-storm", "thundering-herd", "cascading-failure", "noisy-neighbour",
];
/* Editorial order for the principle section, in two groups because the maxims work at two
 * different altitudes and a reader looking for one is never looking for the other. Within
 * `craft`: universal heuristics first, then SOLID, then the OO-structural maxims. Within
 * `systems`: reliability, then scale, then operations, then the strategic pair. Drives the
 * hub's Principles grid — a page missing from here still builds and validates, and simply
 * never appears on the hub, so add new ids to the right group. */
export const PRINCIPLE_GROUPS = [
  {
    id: "craft",
    label: "Writing the code",
    note: "Maxims that hold inside a single codebase — what keeps it simple, decoupled and cheap to change.",
    ids: [
      "dry", "kiss", "yagni", "least-astonishment", "fail-fast",
      "single-responsibility", "open-closed", "liskov-substitution",
      "interface-segregation", "dependency-inversion",
      "composition-over-inheritance", "law-of-demeter", "separation-of-concerns",
      "postels-law",
    ],
  },
  {
    id: "systems",
    label: "Building the system",
    note: "Maxims that hold across processes, machines and regions — what keeps a running system available, scalable and operable.",
    ids: [
      "self-healing", "redundancy", "failure-mode-analysis",
      "minimize-coordination", "scale-out", "partition-around-limits",
      "design-for-operations", "managed-services", "identity-as-perimeter",
      "design-for-evolution", "build-for-business",
    ],
  },
];
export const PRINCIPLE_ORDER = PRINCIPLE_GROUPS.flatMap((g) => g.ids);

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
  if (!subdivided) return `patterns/${bandId}`;
  /* `dir` is an OPTIONAL per-group folder alias, so two groups may share one directory.
   * It exists to let a group that grew too big be split for the hub without moving its
   * pages and rewriting every relative link into and out of them. Absent — the normal
   * case — the folder is still the group id minus its band prefix, so the path keeps
   * naming the group.
   *
   * Optional chaining, not a lookup-or-throw: build.mjs calls this OUTSIDE a try/catch,
   * so throwing on an unknown group would turn its tidy "lives in X but its band/group
   * means Y" failure into a raw stack trace. validate.mjs does catch it. */
  const g = b.groups.find((x) => x.id === group);
  return `patterns/${bandId}/${g?.dir ?? group.replace(`${bandId}-`, "")}`;
}
