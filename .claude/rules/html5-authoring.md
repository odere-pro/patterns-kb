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

**`solves`** (patterns only, 3-5) — the single highest-value field, and the easy one to get
wrong. It is **not** a restatement of the `usage` block's "Reach for it when", which is
prescriptive and already exists. It is **symptomatic**: the words someone types when they
have the problem and do not yet know this pattern exists.

- ✅ `"my thread pool is exhausted and every request hangs"`
- ✅ `"adding a new export format means editing a giant switch statement"`
- ❌ `"You call a remote service that can fail"` — prescriptive, useless for search
- ❌ `"circuit breaker pattern"` — if they knew the name they would have searched it

Avoid the pattern's own name and its jargon inside `solves`. Use the vocabulary of the
symptom, not of the solution. Hazards and themes carry no `solves`.

**`tags`** (2-5) — a **closed vocabulary**: `TAGS` in [`scripts/lib/model.mjs`](../../scripts/lib/model.mjs).
`make check` rejects anything else. Tags exist to group and filter; a tag on one page groups
nothing. Adding one is deliberate — put it in `TAGS` first, and only if it will honestly
apply to 3+ pages. (The first sweep of this KB, written by 18 agents with no shared list,
produced 280 tags of which 154 were used exactly once. Hence the closed list.)

**`aliases`** — only genuinely used alternate names ("CB", "pub/sub", "Policy", "The Blob").
`[]` is a perfectly good answer; 43 of 131 patterns have none. Do not invent nicknames.

**"In the wild"** (optional block) — real, well-known implementations only. This is the one
place you can do real damage: a fabricated library name is a lie that ships to a public site.
Include an entry only if you are confident it exists *and* genuinely exemplifies the pattern.
**If in doubt, leave it out** — 12 patterns have no such block and that is fine. Avoid vague
claims ("most web frameworks"), and never attribute a feature to a product unless you are
sure that product has it. Feature-specific claims are the ones that turn out wrong.

## Blocks

Fixed vocabulary, fixed order, per kind — see `BLOCKS` in `scripts/lib/model.mjs`.
`make check` fails on a missing, unknown or out-of-order block.

| kind | blocks |
|---|---|
| pattern | `description` `structure` `variations` `tradeoffs` `usage` `sketch` `wild`* `relationships` `fluency`* |
| hazard | `description` `causes` `cost` `mitigation` |
| theme | `framing` `tradespace` `tour` `decide` `siblings` |

`*` optional. Same question, same place, on every page — that is what makes block-level
extraction possible.

## Relationships

Declared on **both** pages, each side with its own `data-kb-rel` / `data-kb-to`. `make check`
fails on one-way, dangling or contradictory edges. The 13 verbs are closed and paired
(`variant-of` ↔ `has-variant`, `prevents-hazard` ↔ `mitigated-by`); see
[site/vocab.html](../../site/vocab.html).

Each side may phrase its **note** its own way — "Screen at the gate, then hand out scoped
keys" reads correctly from `gatekeeper`, while `valet-key` may say something else. Only the
edge and its type must agree.

## Generated regions — do not edit

Marked `<!-- kb:generated -->`. Currently the JSON-LD block and the element-level ids
(`tradeoffs-con-1`, `data-kb-polarity`). They are projected from the page's own attributes
and `make all` will overwrite anything you write there. `make check` fails if they are stale.

## Adding a page

1. Copy the shape of an exemplar: **`circuit-breaker`** (pattern) or **`cap-theorem`** (theme).
   Read it with `node scripts/kb.mjs get circuit-breaker`.
2. File it at `site/patterns/<band>/[<group>/]<id>.html` — the path must match the band and
   group it declares.
3. Give it a `data-kb-order`. Pattern order is editorial, not alphabetical: it drives the hub
   and prev/next. Insert it where it belongs pedagogically and renumber its neighbours.
4. Add every block for its kind, in order.
5. Declare each relationship on **both** pages.
6. `node scripts/kb.mjs set <id> --aliases … --tags … --solves …`
7. `make all && make check`.

The page appears in the hub, the graph, the catalog, the search and its neighbours'
backlinks automatically. That is the point of deriving everything from the pages.
