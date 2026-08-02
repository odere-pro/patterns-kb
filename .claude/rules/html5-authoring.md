# HTML5 authoring rules

> The data contract for `patterns-kb`. The root [CLAUDE.md](../../CLAUDE.md) is the summary;
> this is the detail. Read it before writing or editing a page.

## Why HTML and not Markdown

Markdown has no attribute mechanism. Metadata can only bolt on as page-level frontmatter,
and you cannot attach anything to a block or a list item. HTML5 gives semantic elements,
`id`/`class`, arbitrary attributes and standard structured-data vocabularies natively — so
the page can carry its own meaning at three levels instead of one. That is the whole reason
the pages are the source of truth rather than a rendering of something else.

## The separation

| | carries |
|---|---|
| `class` | **presentation only.** Styling hooks. Never read it for meaning. |
| `data-kb-*` | **data.** Identity, structure, relationships. |
| JSON-LD | **derived.** Projected from `data-kb-*`; never hand-written. |

Data is never inferred from a class name or from prose position. A relation is real because
`data-kb-rel` says so, not because it sits inside `.rel-group`.

## The three levels

```html
<main class="doc-wrap"
      data-kb-id="circuit-breaker" data-kb-kind="pattern"
      data-kb-band="distributed" data-kb-group="distributed-resilience"
      data-kb-order="46" data-kb-essence="Stops calling a service that's already failing"
      data-kb-aliases='["breaker","CB"]'
      data-kb-tags='["resilience","isolation","latency"]'
      data-kb-solves='["my thread pool is exhausted and every request hangs", …]'>

  <section class="doc-section" id="tradeoffs" data-kb-block="tradeoffs">   <!-- block -->
    <li id="tradeoffs-con-1" data-kb-polarity="con">…</li>                 <!-- element -->

  <div class="rel-item" data-kb-rel="combines-with" data-kb-to="bulkhead">
    <a href="./bulkhead.html">Bulkhead</a><span class="rel-note">why they relate</span>
  </div>
```

The section `id` is both the anchor and the semantic key — they are deliberately the same
string. `aliases`/`tags`/`solves` are **JSON-valued** because solves are whole sentences and
a comma-delimited attribute would break on the first comma in the prose.

## Field rules

**`essence`** — the terse one-liner used by the hub chip and the index. It is *not* the
page's `<p class="doc-essence">`, which is longer and reads as a definition. Both exist; do
not collapse them.

**`solves`** (patterns, principles, hazards and designs, 3-5) — the single highest-value field,
and the easy one to get wrong. It is **not** a restatement of the `usage` block's "Reach for it
when", which is prescriptive and already exists. It is **symptomatic**: the words someone types
when they have the problem and do not yet know this page exists.

- ✅ `"my thread pool is exhausted and every request hangs"`
- ✅ `"adding a new export format means editing a giant switch statement"`
- ❌ `"You call a remote service that can fail"` — prescriptive, useless for search
- ❌ `"circuit breaker pattern"` — if they knew the name they would have searched it

Avoid the page's own name and its jargon inside `solves`. Use the vocabulary of the
symptom, not of the solution.

On a **hazard** the field reads the same way but points the other direction: the phrases are
what the sufferer *observes*, and the page they reach names it rather than fixing it — the fix
is a `mitigated-by` hop away. A hazard is the one kind whose `solves` and `essence` are close
in kind, so keep them distinct: the essence is the terse definition the hub chip renders, the
`solves` are the messy sentences nobody would put in a definition ("we restart the service
every night to keep it healthy"). Symptom vocabulary belongs here, not crammed into the
essence. **Themes carry no `solves`** — a theme is a tour, not a problem, and its essence
still carries the search weight (`kb.mjs find` and `search.js` both score the essence at the
`solves` weight on any page that has no `solves`).

**`tags`** (2-5) — a **closed vocabulary**: `TAGS` in [`scripts/lib/model.mjs`](../../scripts/lib/model.mjs).
`make check` rejects anything else. Tags exist to group and filter; a tag on one page groups
nothing. Adding one is deliberate — put it in `TAGS` first, and only if it will honestly
apply to 3+ pages. (The first sweep of this KB, written by 18 agents with no shared list,
produced 280 tags of which 154 were used exactly once. Hence the closed list.)

All three numbers above are **build rules, not advice**. `validate.mjs` fails a page outside
2-5 and `kb.mjs set --tags` refuses one before it reaches a file; `audit-vocab.mjs` fails any
tag in `TAGS` used on fewer than 3 pages, and warns when a tag lands on every page of one
kind and nowhere else — that tag groups what `data-kb-kind` already groups. Retiring a tag
means retagging every page that carries it, so it is its own change: the **kb-vocab** skill.

**`aliases`** — only genuinely used alternate names ("CB", "pub/sub", "Policy", "The Blob").
`[]` is a perfectly good answer; many patterns have none. Do not invent nicknames.

**`favourite`** (optional) — `data-kb-favourite="true"` marks a page as an editorial pick. It is the
only boolean field: present-and-true or absent, written with `kb.mjs set <id> --favourite true|false`.
The build projects it into `graph.json`, and the hub renders a `★` chip plus a **★ Favourites**
filter that collapses the map to the picks. Favourite a page because it is worth reading first,
not because it is good.

What you are authoring is the **default**, not the answer. `favourites.js` reads the rendered
state as its seed and lets the visitor toggle any page from the hub star, the page metarow or the
floating `★`; their choices live in `localStorage` under `kb-favourites-v1` and win over yours.
That store holds **overrides only** — a page appears in it only while the visitor disagrees with
you — so re-curating the picks here still moves every visitor who never expressed an opinion.
It remains a separate store and a separate question from the "Practiced" tracker: *worth reading
first* versus *I have worked through this*.

**"In the wild"** (optional block) — real, well-known implementations only. This is the one
place you can do real damage: a fabricated library name is a lie that ships to a public site.
Include an entry only if you are confident it exists *and* genuinely exemplifies the pattern.
**If in doubt, leave it out** — plenty of patterns have no such block and that is fine. Avoid vague
claims ("most web frameworks"), and never attribute a feature to a product unless you are
sure that product has it. Feature-specific claims are the ones that turn out wrong.

## Prose links

Link a page the first time its prose names another page — "that is
[Scatter-Gather](…)" sends the reader where the corpus already has the answer, and an
unlinked name makes them search for it. Once per page is enough; a second link to the same
target is noise.

**Four blocks cannot carry a link, and this is mechanical rather than editorial.**
`explain`, `production` and `wild` are written by `kb.mjs` from text arguments it escapes on
write, so an `<a>` lands as visible `&lt;a&gt;` rather than a link — and one hand-injected
into the HTML is destroyed by the next `kb.mjs explain`/`production`/`wild` call on that
page. `production` and `wild` pass `<code>` through as the single exception, because their
items name parameters and API calls; every other tag is still escaped. `relationships` is
generated by `kb.mjs link` and already carries typed links. Everywhere else is hand-authored
HTML, and that is where a prose link belongs.

`node scripts/report-links.mjs [<id>…]` lists prose that names a page it never links. It
reports and does not gate: name matching is a heuristic ("Gateway", "Saga" and "Repository"
are ordinary English at least as often as they are page titles), so the output is a
worklist to review, not a build failure to clear.

## Prose markup — the inline vocabulary

Four inline elements, and no others: `<a>` for a link, `<strong>` for a run-in label,
`<code>` for an identifier, and `<abbr>` where an acronym earns a gloss.

**`<em>` and `<i>` are not in the vocabulary.** The corpus carries zero of them and no
stylesheet renders italic — `.hljs-comment` was the last italic rule and is gone. Emphasis
that survives is bold; emphasis that does not survive was doing the work a better sentence
should do. When you catch yourself reaching for italic contrast, move the stressed word to
where the sentence already stresses it, or split the sentence in two.

```html
<!-- no  --> the totals have to be computed <em>before</em> anyone asks for them
<!-- yes --> the totals are computed ahead of the question, not in answer to it
<!-- no  --> <em>Security:</em> the code can exfiltrate data
<!-- yes --> <strong>Security:</strong> the code can exfiltrate data
```

This is a house rule with no build gate behind it, so it holds only while authors keep it.
`grep -rn '<em>\|<i>' site --include='*.html'` should always return nothing.

**`<span class="subline">` is the one structural span**, and it is not a fifth inline
element: it is the second line of a **title**, not markup you reach for in a sentence. A
title's qualifier — a routing tag (`→ NFR: scale`), the store a group of entities lives in,
the scope clause of a requirements tier, the verdict opening an answer — goes inside the
heading (or inside the question paragraph whose `<strong>` stem acts as one):

```html
<h3 id="deepdives-dive-4">4 · Draining a backlog you did not choose<span class="subline">→ NFR: scale</span></h3>
```

It sits **inside** the title element rather than beside it because `build-pages.mjs` mints
ids off child combinators — `.prose > h3`, `.prose > p`, `.nonfunctional > ul > li` — so
anything inserted between one of those parents and its children freezes the ids, and the
build reports nothing when it happens. Inside the heading, the qualifier also survives
`kb.mjs get`, which reads the heading's text. The class is `display: block`, so it carries
no `<br>` on either side.

## Blocks

Fixed vocabulary, fixed order, per kind — see `BLOCKS` in `scripts/lib/model.mjs`.
`make check` fails on a missing, unknown or out-of-order block.

Every kind extends ONE base skeleton: it opens `description` → `explain` and closes
`relationships`; only the middle is kind-specific (`BASE_OPEN`/`BASE_CLOSE` in model.mjs).
The opener's *anchor* is `description` on every kind — the visible heading stays
kind-flavoured ("The question", "Understanding the problem") — so
`kb.mjs get <any-id> --block description` works everywhere.

| kind | blocks |
|---|---|
| pattern | `description` `explain` `structure` `variations` `tradeoffs` `usage` `sketch` `wild`* `production`* `fluency`* `relationships` |
| hazard | `description` `explain` `causes` `cost` `mitigation` `relationships` |
| theme | `description` `explain` `architecture`* `tradespace` `tour` `decide` `siblings` `relationships`* |
| principle | `description` `explain` `rationale` `applying` `overreach` `relationships` |
| design | `description` `explain`* `requirements` `sizing`* `entities` `interface`* `architecture` `deepdives` `tradeoffs` `levels`* `relationships` |
| capability | `description` `explain` `capabilities` `mapping` `choosing` `portability` `relationships` |
| comparison | `description` `explain` `contenders` `matrix` `choosing` `relationships` |

`*` optional (per kind — see `OPTIONAL_BLOCKS` in model.mjs; a theme's `relationships` is
optional because themes join the graph through tour membership). A **design** is a worked
case study (a system-design or low-level-design kata):
its `description` ("Understanding the problem") frames it, `requirements` states FR + NFR, `sizing` ("Right-sizing") argues from those
requirements to the cheapest set of technology capabilities the numbers allow, `architecture` carries the primary mermaid
diagram, `deepdives` argues the hard sub-problems, and the typed `relationships` block joins it to the
patterns it uses via `demonstrates` (see Relationships). Designs carry `data-kb-solves` like a pattern,
tag OOP katas `low-level-design`, and live flat in `site/designs/`. A distributed kata carries no
kind tag at all: `system-design` was one until it reached 31 of the 40 case studies and spent a slot
at the five-tag ceiling to say what the section already said, so the hub badges a case study
**System design** whenever it claims neither `low-level-design` nor `machine-learning`. Same question,
same place, on every page — that is what makes block-level extraction possible.

A **principle** is a design maxim (SOLID, DRY, KISS, YAGNI, …), not a mechanism: its
`description` ("What it says") states it, `rationale` why it helps, `applying` how to honour
it, and `overreach` — a mandatory, honest block — how it fails when taken too far.
Principles carry `solves` and link into the typed graph (usually `combines-with` a pattern
that embodies them, or `prevents-hazard` an anti-pattern they guard against). Hazards carry
a real `relationships` block like every other kind, so `kb.mjs link` writes both sides of a
`prevents-hazard`/`mitigated-by` edge — the `mitigation` block keeps its prose narrative
and any figure, but no typed edges.

A **capability** is one category of managed cloud service — storage, messaging, identity —
taking the **capability** as its subject and the vendors' products as evidence. Its
`capabilities` block is the provider-neutral taxonomy (a `dl.variations`, same card shape as
a pattern's `variations`, and no product names inside it at all); `mapping` is the
cross-cloud table, a `table.decision` inside a `.table-scroll` with columns Capability / AWS
/ Azure / Google Cloud; `choosing` argues the decision; `portability` lists what breaks when
you move, each item a bold label then the difference and what it costs. Capabilities carry
`data-kb-solves` like a pattern, always carry the `cloud` tag, and live flat in
`site/capabilities/`. Order on the hub comes from `CAPABILITY_ORDER` in model.mjs.

The `mapping` table must keep **at least one untagged `<tr>`**, for the same reason every
list must: a block may not render empty at any lens. A table header is furniture and does not
count as content — `make check` strips `<thead>` before asking whether anything survived, so
tagging every row up a lens fails the build rather than quietly leaving a basic reader with
a headed, empty table.

Two rules bite harder here than anywhere else in the KB. The **anti-fabrication** rule below
governs every cell of the mapping table: a service name you are sure of, or
"no first-party equivalent", or no row — an invented product feature is a lie that ships to a
public site. And **naming decay** is the standing cost of these pages, so prefer the stable
capability-level answer to the newest brand; the capability column is the durable part of
the table and the product columns are replaceable evidence.

They join the graph through `implements` (see Relationships), which gives each pattern an
"Implemented by" list — distinct from "Demonstrated by", which is a case study showing the
pattern at work rather than a product you can buy. Where the platform **requires** a
discipline of you instead of providing it — elastic compute needs your service to be
stateless — the verb is `prerequisite`, not `implements`.

A **comparison** takes ONE product decision as its subject — the managed services and the
open-source contenders for a single capability area, side by side. Where a capability page
names provider-neutral **shapes** and keeps products out of its taxonomy, a comparison
names the **products**: `contenders` is a `dl.variations` of one card per product, each
carrying its shape, its license and owner, and where to rent it; `matrix` is a
`table.decision` in a `.table-scroll` with the deciding conditions down the side and the
contenders across the top; `choosing` argues the per-condition verdicts, opening with the
null option or the cloud default. The matrix keeps **at least one untagged `<tr>`** for the
same reason `mapping` must. Comparisons carry `data-kb-solves` like a pattern, take the
product names as `aliases` (that is how "alternative to Kafka" resolves), live flat in
`site/comparisons/`, and take their hub order from `COMPARISON_ORDER` in model.mjs, which
shadows `CAPABILITY_ORDER`. They join the graph through `specializes` (the capability page
is the wider subject) and `implements` (these products ARE the pattern, runnable or
buyable).

The **anti-fabrication** rule bites hardest of all on a comparison, and decays fastest:
the contender cards and the matrix carry license, ownership, managed-offering and scale
claims about named products, and licenses change — Redis relicensed, RabbitMQ changed
owners, Redpanda's BSL converts on a clock. State only what you are sure of at time of
writing; when unsure, omit the claim rather than the contender. These pages are standing
targets for the **kb-fact-check** sweep.

**`variations`** — a `<dl class="variations">` of `<dt>` name / `<dd>` explanation pairs.
CSS renders each pair as one card, so the `<dt>` is the card's heading: keep it short, and
never let a `<dt>` stand without its `<dd>`.

**When a variation names a page the KB already has, the `<dt>` links it.** Wrap only the
page-name portion and leave the qualifier as plain text — the variation is usually that
pattern applied here, not the pattern itself:

```html
<dt id="variations-item-2"><a href="../routing/api-gateway.html">API Gateway</a> routing</dt>
<dt id="variations-item-1"><a href="./sidecar.html">Sidecar</a> data plane</dt>
```

Link the page, not the word. "Streaming Gateway" is not the `streaming` theme and
"Per-aggregate stream" is not the `aggregate` pattern — a name collision is not a
reference, and a wrong link costs the reader more than a missing one.

**`structure`** (patterns) — opens with a **numbered topology walk**, basic-visible. For an
implementation pattern (distributed, messaging, caching, enterprise, architecture,
concurrency, security) that walk is a `flowchart`: component nodes and data-store nodes
(`[( )]` cylinders), the critical boundary drawn as a `subgraph` (for the outbox: "One
atomic transaction" wrapping the state table and the outbox table), numbered edge labels
`1..N` tracing the happy path, ≤9 nodes. It answers one question — how does the happy path
cross the components? The **sequence diagram**, which carries timing and the failure
branches, follows it at `data-kb-level="advanced"`; a junior gets the board, a senior gets
both. Conceptual bands (gof, functional, testing, ddd, frontend, ml) keep their class-style
diagram, untagged. Exemplar: `outbox`. Drawing rules are the **diagram-draw** skill.

**`production`** (patterns only, optional) — the system-builder block: what it takes to *run*
the pattern, written through the validated writer:

```
node scripts/kb.mjs production <id> \
  --knobs '[{"label":"pool size","note":"…"}]' --signals '[…]' \
  --failures '[…]' --checklist '["…"]'
```

Four labeled lists — **Tuning knobs** (the configuration surfaces), **Signals to watch**
(observable quantities: queue depth, replication lag, p99 latency), **Failure modes under
load** (what breaks first and how it looks), **Readiness checklist** (gates before shipping).
Any list may be empty; its card is simply omitted. The writer replaces the whole block, so
re-supply every list on edit — get them with `kb.mjs get <id> --block production --json`,
whose `items` field returns the four lists in exactly the shape the writer takes. Do not
re-type them from the rendered prose: it carries neither the `data-kb-level` tags nor the
inline `<code>`, and a hand-typed re-supply silently deletes both. The same `items` dump
covers `wild`. Anti-fabrication rule, same standard as "In the wild": every
knob must be a real, verifiable configuration surface — either a named parameter you are
certain exists (`corePoolSize`, `max_connections`) or a generic dial described without
attributing it to a product. Signals must be observable quantities, not aspirations. Never
invent a metric name, default value, or product feature. When unsure, omit — a three-item
list of true things beats a five-item list with one lie. Conceptual pages (GoF, functional)
may skip the block entirely; a forced block is how fabrication happens.

## Reading levels

Every page reads at three depths — the closed `LEVELS` vocabulary in
`scripts/lib/model.mjs` — and **the lenses are cumulative**: **`basic`** is a short,
AWS-doc-style complete page; **`advanced`** is basic **plus** enough detail to run an
advanced system design; **`expert`** is basic plus advanced **plus** the deep dives
(limitations, cost bills, sharp edges). A higher lens never replaces what a lower one
said — it adds under the same headings. **Every block shows at every lens — the skeleton
never changes; the depth adapts inside the blocks.** The site's lens toggle (lens.js) and
the reader's `--level` flag both honour it:

```
node scripts/kb.mjs get circuit-breaker --level basic     # the junior's whole page, short
node scripts/kb.mjs find "cache is stale" --level basic   # search only basic-visible prose
```

`data-kb-level` is THE mechanism — *accretion*: "visible from this level up". Untagged is
the basic core everyone sees; higher lenses see MORE (extra tradeoff items, mechanics,
operational nuance, the sequence diagram). Written with
`node scripts/kb.mjs level <id> <element-id> <basic|advanced|expert|none>`. On a rich page
the default inverts: most existing depth carries `advanced`/`expert`, and what stays
untagged is the small page a junior reads end to end. Sizing bands per kind, and the
`report-lens.mjs` QA gate that enforces them, are in the **kb-explain** skill.

`data-kb-register` — *replacement*: "rendered at exactly this lens" — still exists, but it
is a **rare** tool. Use it only where showing both versions would be actively wrong: the
deeper text substitutes for the simpler one (near-verbatim restatement, a simplified
diagram versus its failure-state twin) rather than continuing it. If the deeper text would
read fine *after* the simpler one, it is a `level` tag. A maximal run of **adjacent**
registered siblings is one group; registers within it must ascend without repeats. Written
with `node scripts/kb.mjs register <id> <element-id> <basic|advanced|expert|none>`.

An element with neither attribute is universal. One element carries at most ONE of the
two (`make check` enforces the XOR), sections never carry either (blocks always show),
and **nothing labelled may render empty at any lens** — `make check` fails a section whose
lens-filtered content comes back blank, which is what forces at least one
basic-visible item into every mandatory list. The test runs at two granularities,
because `production` renders **four independently labelled cards** and the block-level
test alone cannot see them: tag every knob, signal and failure mode up a lens and the
block still passes on its surviving checklist items, while a reader at basic meets
"Tuning knobs" with no knobs under it. So each `.prod-group` is checked by name too —
basic keeps one knob, one signal, one failure mode and its checklist gates. Element ids
are minted by `make all`
(`<block>-p-N` on prose paragraphs, `<block>-sketch-N` on a collapsed sketch outside the
`sketch` block, `requirements-{fr,nfr}-N` on a design's requirement rows, keyed ids like
`wild-envoy`, `tour-<member>`, `deepdives-dive-N`) — positional ids renumber when a
paragraph is inserted, so re-run `make all` before tagging. An element with no id cannot be
moved by a lens and renders at basic forever; where a page needs one the build does not
mint — a grouped block's `h3`/`h4`, a whole list — hand-mint it in the same shape and tag
it, and the build will leave it alone. `deepdives-dive-N` is the ONLY heading id the build
mints, so a sizing part's heading, a requirements tier and a labelled step inside a dive all
carry hand-minted `<block>-h-<slug>` ids (`sizing-h-capabilities`,
`requirements-h-additional`, `deepdives-h-boundary-1`). Tag such a heading with the same
`data-kb-level` as the content under it, or a lens leaves it standing over nothing —
`make check` cannot see that, because it strips `h2` and `h3` before testing a block for
emptiness. Figures take these attributes too — the primary topology
diagram stays untagged, the sequence diagram carries `data-kb-level="advanced"` — and
lens.js re-renders mermaid on lens change.

**`explain`** (mandatory on every kind but `design`) — the three-rung ladder, and the canonical use of
`data-kb-level`: one short paragraph per level, **stacked** (at advanced the basic and
advanced rungs both render; at expert all three), written through the validated writer
(which replaces the whole block — re-supply all three on edit):

```
node scripts/kb.mjs explain <id> --basic "…" --advanced "…" --expert "…"
```

Rung rules: `basic` tells the failure-first story in plain words — what goes wrong without
the pattern, then the simple fix — no jargon, no pattern names; `advanced` names the
mechanism precisely in one breath, variants included, **continuing** the basic rung rather
than re-telling it; `expert` argues selection criteria and the tradeoff bill *and how to
pay it* — each major con names its counter-move. A sentence repeated across rungs is a
defect, because the reader sees the lower rungs too. The full spec — the stacking rule, the
per-lens audit, tagging heuristics — is the **kb-explain** skill; the house prose register
is [tone.md](./tone.md). `make check` fails an explain block that does not hold exactly one
`.explain-item` per level in basic → advanced → expert order. The `explain` ladder is a
different thing from a design's `levels` block (the Mid/Senior/Staff interviewer rubric);
both may exist on a design page. A design may also carry neither: a case study already
argues at three depths through its interview, its sizing verdicts, its per-NFR deep dives
and its rubric, so a ladder that only compresses those blocks is dropped rather than
written. When to keep one is the **kb-explain** skill.

## Relationships

Declared on **both** pages, each side with its own `data-kb-rel` / `data-kb-to`. `make check`
fails on one-way, dangling or contradictory edges. The 17 verbs are closed and paired
(`variant-of` ↔ `has-variant`, `prevents-hazard` ↔ `mitigated-by`, `demonstrates` ↔
`demonstrated-by`); see [site/vocab.html](../../site/vocab.html). `demonstrates` runs from a **design**
page to a pattern or principle it puts to work — write it with `kb.mjs link <design> demonstrates
<pattern>`, which adds the "Demonstrated by" backlink on the pattern.

`implements` runs from a **capability** page to a pattern the cloud sells ready-made —
`kb.mjs link <capability> implements <pattern>` adds the "Implemented by" backlink. The two
verbs are deliberately separate: "Demonstrated by" is a worked system showing the pattern at
work, "Implemented by" is a product category you can buy it from. When the platform requires
the pattern of you rather than providing it, use `prerequisite` instead.

Retiring an edge goes through `kb.mjs unlink <a> <b>`. It removes both sides whatever verb
each declared, and takes the `rel-group` with its last item. Re-typing an edge is `unlink`
then `link`.
`kb.mjs refs <id>` lists everything a page points at, read live off the page, so an edit that
changed what the page uses can be reconciled before the build.

Each side may phrase its **note** its own way — "Screen at the gate, then hand out scoped
keys" reads correctly from `gatekeeper`, while `valet-key` may say something else. Only the
edge and its type must agree.

**Theme membership is two-sided in the same way, and it is the one pairing no writer
maintains for you.** The theme's `.tour-step[data-kb-member]` is the source of truth — the
build projects it into `graph.json` and the JSON-LD — but a pattern's visible "Where it
shows up" block is hand-authored HTML, so the two drift silently. `make check` now fails
either half alone: `TOUR WITHOUT FLUENCY` when a theme tours a pattern that never names it
back, `FLUENCY WITHOUT TOUR` when a pattern claims a theme whose tour omits it. Adding a
tour step means adding the matching `.fluency-item[data-kb-theme]` on the pattern, whose
`href` depth follows the pattern's own folder. The **wording** is free — a tour role is
terse by design ("Keep the GPU busy") and the pattern's line often extends it. Only
presence must agree.

## Generated regions — do not edit

Marked `<!-- kb:generated -->`. Currently the JSON-LD block, the element-level ids
(`tradeoffs-con-1`, `data-kb-polarity`), the **"Mentioned by"** list and the **`<head>`
asset pair**. They are projected from the page's own attributes and `make all` will
overwrite anything you write there. `make check` fails if they are stale.

**The `<head>` asset pair** is a page's ENTIRE asset wiring — one stylesheet link, one
loader script — from `PAGE_ASSETS` in [`scripts/lib/model.mjs`](../../scripts/lib/model.mjs),
keyed by kind, at the `../` depth the page's own path implies:

```html
<link rel="stylesheet" href="../assets/kb-page.css">
<script src="../assets/kb.js" data-profile="pattern"></script>
```

Nothing else lives at the body end any more. `kb.js` is the manifest — which scripts a
profile loads, in what order, pre-paint or deferred — so adding a client script is one
array entry there, not a sweep across 382 pages: the authored tags once drifted into nine
different shapes and 53 pages had silently lost `favourites.js`, so the favourite control
did not exist on them. `kb.js` writes `theme.js` and `lens.js` WITHOUT `defer` — they must
run before first paint or the reader sees a flash of the wrong theme — and writes
everything else WITH `defer`, which is what makes it safe for a single `<script>` tag to
carry a profile's whole tail. `scripts/audit-assets.mjs` gates the shape: every page
carries exactly one stylesheet link and one loader script, the loader's `data-profile` is
a key of `kb.js`'s manifest, and no other `<script>` survives on the page.

**"Mentioned by"** is the one region projected from OTHER pages: the `<aside class="mentions">`
before the footer nav lists every page that links here in prose without declaring a typed
relationship. build.mjs derives both directions into `graph.json`, build-pages.mjs renders the
inbound half. To change what a page says there, change the prose that links to it — or promote
the link to a real edge with `kb.mjs link`, which takes it out of the list (a typed relation is
never also a mention). The rendered links carry no `data-kb-*` and are excluded from the
derivation (`PROSE_LINK_EXCLUDE` in model.mjs), so the list can never feed itself.

## Adding a page

1. Copy the shape of an exemplar: **`circuit-breaker`** (pattern), **`cap-theorem`** (theme),
   **`dry`** (principle) or **`storage`** (capability). Read it with
   `node scripts/kb.mjs get circuit-breaker`. Or scaffold directly:
   `node scripts/kb.mjs new <id> --kind principle --name "…" --order <n>` (a non-pattern kind
   needs no `--band`).
2. File it at `site/patterns/<band>/[<group>/]<id>.html` (patterns) or `site/<kind>s/<id>.html`
   (hazards, themes, principles, designs, capabilities) — the path must match the band and
   group it declares, as resolved by `folderFor()` in model.mjs. A group carrying an optional
   `dir` alias in `BANDS` shares another group's directory, so under
   `site/patterns/distributed/` the folder alone does not name the group: `routing/` holds
   `distributed-routing` and `distributed-scale`, `coordination/` holds
   `distributed-coordination` and `distributed-data`.
3. Give it a `data-kb-order`. Pattern order is editorial, not alphabetical: it drives the hub
   and prev/next. Insert it where it belongs pedagogically and renumber its neighbours.
4. Add every block for its kind, in order.
5. Declare each relationship on **both** pages.
6. `node scripts/kb.mjs set <id> --aliases … --tags … --solves …`
7. `make all && make check`.

A **pattern** now appears in the hub, the graph, the catalog, the search and its
neighbours' backlinks automatically — that is the point of deriving everything from the
pages. **Every other kind needs one more step:** its id must go in the editorial ordering
array for its kind in `scripts/lib/model.mjs` (`HAZARD_ORDER`, `THEME_GROUPS`,
`DESIGN_GROUPS`, `PRINCIPLE_GROUPS`, `CAPABILITY_ORDER`, `COMPARISON_ORDER`), because the
hub's order is editorial rather than derivable. `build-hub.mjs` fails on a page that is in
none of them, rather than shipping a page nothing links to.
