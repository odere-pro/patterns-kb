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

**`solves`** (patterns and principles, 3-5) — the single highest-value field, and the easy
one to get wrong. It is **not** a restatement of the `usage` block's "Reach for it when",
which is prescriptive and already exists. It is **symptomatic**: the words someone types when
they have the problem and do not yet know this pattern (or principle) exists.

- ✅ `"my thread pool is exhausted and every request hangs"`
- ✅ `"adding a new export format means editing a giant switch statement"`
- ❌ `"You call a remote service that can fail"` — prescriptive, useless for search
- ❌ `"circuit breaker pattern"` — if they knew the name they would have searched it

Avoid the page's own name and its jargon inside `solves`. Use the vocabulary of the
symptom, not of the solution. Hazards and themes carry no `solves`.

**`tags`** (2-5) — a **closed vocabulary**: `TAGS` in [`scripts/lib/model.mjs`](../../scripts/lib/model.mjs).
`make check` rejects anything else. Tags exist to group and filter; a tag on one page groups
nothing. Adding one is deliberate — put it in `TAGS` first, and only if it will honestly
apply to 3+ pages. (The first sweep of this KB, written by 18 agents with no shared list,
produced 280 tags of which 154 were used exactly once. Hence the closed list.)

**`aliases`** — only genuinely used alternate names ("CB", "pub/sub", "Policy", "The Blob").
`[]` is a perfectly good answer; many patterns have none. Do not invent nicknames.

**`favourite`** (optional) — `data-kb-favourite="true"` marks a page as an editorial pick. It is the
only boolean field: present-and-true or absent, written with `kb.mjs set <id> --favourite true|false`.
The build projects it into `graph.json`, and the hub renders a `★` chip plus a **★ Favourites**
filter that collapses the map to the picks. It is fixed page metadata — the same for every visitor —
and is **not** the per-visitor "Practiced" tracker, which lives in `localStorage` and shares nothing
with it. Favourite a page because it is worth reading first, not because it is good.

**"In the wild"** (optional block) — real, well-known implementations only. This is the one
place you can do real damage: a fabricated library name is a lie that ships to a public site.
Include an entry only if you are confident it exists *and* genuinely exemplifies the pattern.
**If in doubt, leave it out** — plenty of patterns have no such block and that is fine. Avoid vague
claims ("most web frameworks"), and never attribute a feature to a product unless you are
sure that product has it. Feature-specific claims are the ones that turn out wrong.

## Blocks

Fixed vocabulary, fixed order, per kind — see `BLOCKS` in `scripts/lib/model.mjs`.
`make check` fails on a missing, unknown or out-of-order block.

Every kind extends ONE base skeleton: it opens `description` → `explain` and closes
`relationships`; only the middle is kind-specific (`BASE_OPEN`/`BASE_CLOSE` in model.mjs).
The opener's *anchor* is `description` on all five kinds — the visible heading stays
kind-flavoured ("The question", "Understanding the problem") — so
`kb.mjs get <any-id> --block description` works everywhere.

| kind | blocks |
|---|---|
| pattern | `description` `explain` `structure` `variations` `tradeoffs` `usage` `sketch` `wild`* `production`* `fluency`* `relationships` |
| hazard | `description` `explain` `causes` `cost` `mitigation` `relationships` |
| theme | `description` `explain` `architecture`* `tradespace` `tour` `decide` `siblings` `relationships`* |
| principle | `description` `explain` `rationale` `applying` `overreach` `relationships` |
| design | `description` `explain` `requirements` `sizing`* `entities` `interface`* `architecture` `deepdives` `tradeoffs` `levels`* `relationships` |

`*` optional (per kind — see `OPTIONAL_BLOCKS` in model.mjs; a theme's `relationships` is
optional because themes join the graph through tour membership). A **design** is a worked
case study (a system-design or low-level-design kata):
its `description` ("Understanding the problem") frames it, `requirements` states FR + NFR, `sizing` ("Right-sizing") argues from those
requirements to the cheapest set of technology capabilities the numbers allow, `architecture` carries the primary mermaid
diagram, `deepdives` argues the hard sub-problems, and the typed `relationships` block joins it to the
patterns it uses via `demonstrates` (see Relationships). Designs carry `data-kb-solves` like a pattern,
tag distributed katas `system-design` and OOP ones `low-level-design`, and live flat in `site/designs/`. Same question, same place, on every page — that is what makes block-level
extraction possible.

A **principle** is a design maxim (SOLID, DRY, KISS, YAGNI, …), not a mechanism: its
`description` ("What it says") states it, `rationale` why it helps, `applying` how to honour
it, and `overreach` — a mandatory, honest block — how it fails when taken too far.
Principles carry `solves` and link into the typed graph (usually `combines-with` a pattern
that embodies them, or `prevents-hazard` an anti-pattern they guard against). Hazards carry
a real `relationships` block like every other kind, so `kb.mjs link` writes both sides of a
`prevents-hazard`/`mitigated-by` edge — the `mitigation` block keeps its prose narrative
and any figure, but no typed edges.

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
re-supply every list on edit. Anti-fabrication rule, same standard as "In the wild": every
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
(`<block>-p-N` on prose paragraphs, keyed ids like `wild-envoy`, `tour-<member>`,
`deepdives-dive-N`) — positional ids renumber when a paragraph is inserted, so re-run
`make all` before tagging. Figures take these attributes too — the primary topology
diagram stays untagged, the sequence diagram carries `data-kb-level="advanced"` — and
lens.js re-renders mermaid on lens change.

**`explain`** (mandatory, all kinds) — the three-rung ladder, and the canonical use of
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
both may exist on a design page.

## Relationships

Declared on **both** pages, each side with its own `data-kb-rel` / `data-kb-to`. `make check`
fails on one-way, dangling or contradictory edges. The 15 verbs are closed and paired
(`variant-of` ↔ `has-variant`, `prevents-hazard` ↔ `mitigated-by`, `demonstrates` ↔
`demonstrated-by`); see [site/vocab.html](../../site/vocab.html). `demonstrates` runs from a **design**
page to a pattern or principle it puts to work — write it with `kb.mjs link <design> demonstrates
<pattern>`, which adds the "Demonstrated by" backlink on the pattern.

Retiring an edge goes through `kb.mjs unlink <a> <b>`. It removes both sides whatever verb
each declared, and takes the `rel-group` with its last item. Re-typing an edge is `unlink`
then `link`.
`kb.mjs refs <id>` lists everything a page points at, read live off the page, so an edit that
changed what the page uses can be reconciled before the build.

Each side may phrase its **note** its own way — "Screen at the gate, then hand out scoped
keys" reads correctly from `gatekeeper`, while `valet-key` may say something else. Only the
edge and its type must agree.

## Generated regions — do not edit

Marked `<!-- kb:generated -->`. Currently the JSON-LD block and the element-level ids
(`tradeoffs-con-1`, `data-kb-polarity`). They are projected from the page's own attributes
and `make all` will overwrite anything you write there. `make check` fails if they are stale.

## Adding a page

1. Copy the shape of an exemplar: **`circuit-breaker`** (pattern), **`cap-theorem`** (theme),
   or **`dry`** (principle). Read it with `node scripts/kb.mjs get circuit-breaker`. Or scaffold
   directly: `node scripts/kb.mjs new <id> --kind principle --name "…" --order <n>` (a
   non-pattern kind needs no `--band`).
2. File it at `site/patterns/<band>/[<group>/]<id>.html` (patterns) or `site/<kind>s/<id>.html`
   (hazards, themes, principles) — the path must match the band and group it declares.
3. Give it a `data-kb-order`. Pattern order is editorial, not alphabetical: it drives the hub
   and prev/next. Insert it where it belongs pedagogically and renumber its neighbours.
4. Add every block for its kind, in order.
5. Declare each relationship on **both** pages.
6. `node scripts/kb.mjs set <id> --aliases … --tags … --solves …`
7. `make all && make check`.

The page appears in the hub, the graph, the catalog, the search and its neighbours'
backlinks automatically. That is the point of deriving everything from the pages.
