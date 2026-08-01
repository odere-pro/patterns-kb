---
name: kb-pattern-blocks
description: Write or review any block of a patterns-kb pattern page — description, structure, variations, tradeoffs, usage, sketch, wild, production, fluency. Use when someone asks to "write the description block", "add variations", "write the pros and cons", "when should you reach for this", "add a code sketch", "add a real-world example", "write the production block", "add the Where it shows up block", or says a pattern page's block is thin, wrong-shaped, or reads like marketing. Also use to review, evaluate, critique, audit or grade an existing block of a pattern page, including when the ask names it by file path or URL fragment (`…/<pattern>.html#tradeoffs`, `#variations`, `#usage`).
---

# The blocks of a pattern page

Nine blocks, fixed order, after the `description` → `explain` opening and before the
`relationships` close:

```
description  explain  structure  variations  tradeoffs  usage  sketch  wild*  production*  fluency*  relationships
```

`*` optional. `explain` is the **kb-explain** skill; `relationships` is **kb-edit**; the
diagrams inside `structure` are **diagram-draw**. This skill owns the other seven.

Read before you write — the block, never the file:

```
node scripts/kb.mjs get <id> --block <name>
node scripts/kb.mjs get circuit-breaker            # the exemplar, whole
```

Register rules for all of it: second person, active voice, imperative for advice; one
concept per sentence, 2–3 per paragraph; every claim carries its consequence; no hedging
stacks and no unpriced adjectives ("robust", "scalable", "significant" — give the mechanism
or the figure instead). Emphasis is `<strong>`; **`<em>` and `<i>` are not in the
vocabulary** and `grep -rn '<em>\|<i>' site --include='*.html'` must stay empty.

## description — the failure, then the mechanism, then the chain it breaks

Three paragraphs, and they do three different jobs. **Do not open with a definition.**

1. **What goes wrong without it**, concretely, in the reader's own situation. Name the
   resource that runs out.
2. **What the pattern is**, mechanically — the states, the parts, the moving piece.
3. **The failure it prevents**, one level up: why this matters beyond the one call site.

Link a page the first time the prose names another page. Once per page is enough.

## structure — the numbered topology walk

Opens with a numbered walk of the happy path across components, basic-visible. For an
implementation band (distributed, messaging, caching, enterprise, architecture,
concurrency, security) that is a `flowchart`: ≤9 nodes, data stores as `[( )]` cylinders,
the critical boundary drawn as a `subgraph`, edges labelled `1..N`. It answers exactly one
question — how does the happy path cross the components?

The **sequence diagram**, carrying timing and the failure branches, follows it at
`data-kb-level="advanced"`. A junior gets the board; a senior gets both. Conceptual bands
(gof, functional, testing, ddd, frontend, ml) keep a class-style diagram, untagged.
Exemplar: `outbox`. Drawing rules: **diagram-draw**.

## variations — `<dl class="variations">`, one card per pair

`<dt>` is the card heading: short, and never without its `<dd>`. **When a variation names a
page the KB has, the `<dt>` links it** — wrap only the page-name portion and leave the
qualifier as plain text, because the variation is usually *that pattern applied here*:

```html
<dt id="variations-item-2"><a href="../routing/api-gateway.html">API Gateway</a> routing</dt>
```

Link the page, not the word. "Streaming Gateway" is not the `streaming` theme; a name
collision is not a reference, and a wrong link costs the reader more than a missing one.
`node scripts/report-variation-links.mjs` lists candidates.

## tradeoffs — PROS and CONS, and the cons do the real work

Each item is one line: a claim plus what it costs or buys. Pros are easy and rarely wrong.
The cons are what makes the page trustworthy, so:

- **Name the tuning surface**, not just "needs tuning" — *bad thresholds cause flapping or
  false trips*.
- **A major con should name its counter-move** in the same item: *an open breaker can mask a
  mildly degraded dependency — pair it with health checks*.
- **Say where a real choice lives**: in-process versus shared state, and what each costs.

Four and four is a good shape. A page with three pros and one grudging con has not been
thought about. Never a bare adjective and never a con that is secretly a pro.

## usage — the reader's situation, never the pattern's features

Two lists, `REACH FOR IT WHEN` and `AVOID WHEN`, phrased as circumstances the reader
recognises about *themselves*:

- ✅ "Calls to it hold a resource the rest of your service shares."
- ❌ "This pattern provides fault isolation." — that is a feature, and it belongs nowhere.

The avoid list must be honest and specific. "Failures are permanent, not transient — fix the
call, don't trip around it" is useful; "when you don't need it" is not. Three and three.

## sketch — the smallest thing that works

One runnable-looking snippet with a one-line caption naming the language and the scope
("the smallest breaker that works, state in this process"). It demonstrates the mechanism
the `structure` block drew — not a framework, not configuration, not error handling you
would really write. If the snippet needs a paragraph of setup to make sense, it is too big.

## wild — real implementations only, and the one place you can do real damage

A fabricated library name is a lie that ships to a public site. Include an entry only if you
are confident the thing exists **and** genuinely exemplifies the pattern. **If in doubt,
leave it out** — plenty of patterns have no such block, and that is fine. No vague claims
("most web frameworks"), and never attribute a feature to a product unless you are sure that
product has it. Feature-specific claims are the ones that turn out wrong.

## production — what it takes to *run* it

Four labelled lists, any of which may be empty (its card is simply omitted): **Tuning knobs**
(configuration surfaces), **Signals to watch** (observable quantities — queue depth,
replication lag, p99), **Failure modes under load** (what breaks first and how it looks),
**Readiness checklist** (gates before shipping).

Same anti-fabrication standard: a knob is either a named parameter you are certain of
(`corePoolSize`, `max_connections`) or a generic dial described without attributing it to a
product. Signals are measurable, not aspirational. Never invent a metric name, a default
value or a product feature. A three-item list of true things beats a five-item list with one
lie. Conceptual pages may skip the block entirely — **a forced block is how fabrication
happens.**

## fluency — "Where it shows up", and it is one half of a pair

One item per theme that tours this pattern. The theme's `.tour-step[data-kb-member]` is the
source of truth, but this block is **hand-authored HTML** and drifts silently — so
`make check` fails either half alone (`TOUR WITHOUT FLUENCY` / `FLUENCY WITHOUT TOUR`).
Wording may differ, and usually should: the tour role is terse and this line extends it.
Presence may not. The `href` depth follows the pattern's own folder.

## Writing `wild` and `production` — do not re-type them

Both are written by `kb.mjs`, which **replaces the whole block**, and both escape their
input except for `<code>`. So a hand-typed re-supply from the rendered prose silently drops
every `data-kb-level` tag and every inline `<code>`. Dump them in the writer's own shape,
edit the one entry, hand the lot back:

```
node scripts/kb.mjs get <id> --block wild --json         # → .items.wild
node scripts/kb.mjs get <id> --block production --json   # → .items.production.{knobs,signals,failures,checklist}
node scripts/kb.mjs wild <id> --items '[…]'
node scripts/kb.mjs production <id> --knobs '[…]' --signals '[…]' --failures '[…]' --checklist '[…]'
```

For the same reason, **these two blocks cannot carry a prose link** — an `<a>` lands as
visible `&lt;a&gt;`. Put the link in a hand-authored block instead.

## What these blocks are not

- `description` is not `explain` — the ladder is per-level and stacked; see **kb-explain**.
- `tradeoffs` here is PROS/CONS. A **design** page's tradeoffs block is a different shape
  (lead + Strengths/Risks columns) — that is **kb-design-tradeoffs**.
- `usage` is not `solves`. `solves` is symptom vocabulary for search ("my thread pool is
  exhausted and every request hangs"); `usage` is prescriptive advice. Both exist.

## Self-check

1. Every list has at least one **untagged** item, or the block renders empty at basic and
   `make check` fails.
2. `grep -n '<em>\|<i>'` on the page — nothing.
3. Every `wild` entry and every `production` knob is something you are sure exists.
4. `node scripts/kb.mjs get <id> --block <name>` reads back what you meant, and
   `--level basic` still reads as a complete short page.
5. `make all && make check`.
