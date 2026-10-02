---
name: kb-pattern-blocks
description: "Write or review any block of a pattern page: description, structure, variations, tradeoffs, usage, sketch, wild, production. Use when someone says 'write the pros and cons', 'when should you reach for this', 'add variations', or a block is thin. Not for explain (kb-explain), sketch syntax (kb-sketch) or design pages (kb-design-*)."
---

# The blocks of a pattern page

Twelve blocks, fixed order, after the `description` → `explain` opening and before the
`relationships` close:

```
description  explain  structure  variations  tradeoffs  usage  sketch  wild*  production*  fluency*  selfcheck*  relationships
```

`*` optional. `selfcheck` (optional) is three blockquotes, each one bold question of at most 25 words and an answer of at most 60 words that links a `#element-id` it rests on (KB-016). `explain` (the paragraph, its costs list and its example) is the **kb-explain**
skill; `relationships` is **kb-edit**; the diagrams inside `structure` are **diagram-draw**.
This skill owns the other seven.

Read before you write — the block, never the file:

```
node scripts/kb.mjs get <id> --block <name>
node scripts/kb.mjs get circuit-breaker            # the exemplar, whole
```

Register rules for all of it: second person, active voice, imperative for advice; one
concept per sentence, 2–3 per paragraph; every claim carries its consequence; no hedging
stacks and no unpriced adjectives ("robust", "scalable", "significant" — give the mechanism
or the figure instead). Emphasis is `**bold**`; **no `*italic*` or `_italic_` emphasis in
`docs/**.md`**.

## description — the failure, then the mechanism, then the chain it breaks

One paragraph of at most 80 words ([KB-015](../../../docs/reference/page-rules.md#KB-015)),
whose sentences do three different jobs, in this order. **Do not open with a definition.** What
does not fit belongs in `structure`, `variations` or `tradeoffs`, not in a second paragraph.

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

The **sequence diagram**, carrying timing and the failure branches, follows it. Conceptual bands (gof, functional, testing, ddd, frontend, ml) keep a class-style diagram.
Exemplar: `outbox`. Drawing rules: **diagram-draw**.

## variations — a list, one card per item

Each item is `- **<heading>** — <body>`: the bold heading is the card heading, short, and
never without its body. **When a variation names a page the KB has, the heading links it**
— wrap only the page-name portion, inside the bold, and leave the qualifier as plain text,
because the variation is usually that pattern applied here:

```markdown
- **[API Gateway](../routing/api-gateway.md) routing** — …
```

Link the page, not the word. "Streaming Gateway" is not the `streaming` theme; a name
collision is not a reference, and a wrong link costs the reader more than a missing one.
To find candidates, check each variation's name with `node scripts/kb.mjs find "<name>"`.

## tradeoffs — PROS and CONS, and the cons do the real work

Each item is one line: a claim plus what it costs or buys. Pros are easy and rarely wrong.
The cons are what makes the page trustworthy, so:

- **Name the tuning surface**, not just "needs tuning" — bad thresholds cause flapping or
  false trips.
- **A major con should name its counter-move** in the same item: an open breaker can mask a
  mildly degraded dependency, so pair it with health checks.
- **Say where a real choice lives**: in-process versus shared state, and what each costs.

Four and four is a good shape.

The markdown skeleton, tradeoffs then usage (exemplar: `docs/patterns/gof/creational/singleton.md`):

```markdown
## Trade-offs
<!--meta block=tradeoffs-->

### Pros
<!--meta polarity=pro-->

- **Hidden global state** — every user depends on it without declaring it.

### Cons
<!--meta polarity=con-->

- **Hard to test** — shared mutable state leaks between cases.

## When to use it
<!--meta block=usage-->

### Reach for it when
<!--meta polarity=when-->

- **One real resource** — a hardware device, an OS handle, one log sink.

### Avoid when
<!--meta polarity=avoid-->

- **Convenient access only** — prefer injection so dependencies stay visible.
```

**Every item in all four lists opens with a bold lead of 2 to 8 words that names the
point**, then a dash and the claim. The site renders each list as a card with a check or a
cross per item, and the bold lead is what a reader scans. A page with three pros and one grudging con has not been
thought about. Never a bare adjective and never a con that is secretly a pro.

## usage — the reader's situation, never the pattern's features

Two lists, `### Reach for it when` and `### Avoid when`, phrased as circumstances the reader
recognises about themselves:

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

## production — what it takes to run it

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

## fluency — "Where it shows up", generated from the tour data

One item per theme that tours this pattern. The block is a generated marked block: `gen-tours`
writes it from `docs/data/learning-paths.json` and `make gen` rewrites it, so never edit
between its `fluency:start` and `fluency:end` markers. To change a line, edit the `fluency`
sentence in this pattern's `notes` entry for that theme; the theme's tour step comes from the
same entry, so the two halves cannot drift. Wording may differ from the tour role, and
usually should: the role is terse and this line extends it. The `learning-paths` gate fails
a note or stage that names no page.

## Writing `wild` and `production` — do not re-type them

Both are written by `kb.mjs`, which **replaces the whole block**, and both escape their
input except for `<code>`. So a hand-typed re-supply from the rendered prose silently drops every inline `<code>`. Dump them in the writer's own shape,
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

- `description` is not `explain` — the explanation argues the mechanism, selection and costs with one example; see **kb-explain**.
- `tradeoffs` here is PROS/CONS. A **design** page's tradeoffs block is a different shape
  (lead + Strengths/Risks columns) — that is **kb-design-tradeoffs**.
- `usage` is not `solves`. `solves` is symptom vocabulary for search ("my thread pool is
  exhausted and every request hangs"); `usage` is prescriptive advice. Both exist.
  `solves` rule: 3 to 5 phrases, each one problem stated problem first, at most 20 words, short common words, specific to this page, never a product choice or the page's name. Write them with `node scripts/kb.mjs set <id> --solves '[…]'` (the writer refuses a longer phrase); full rule in [markdown-authoring.md](../../rules/markdown-authoring.md).

## Self-check

1. Every `wild` entry and every `production` knob is something you are sure exists.
2. `node scripts/kb.mjs get <id> --block <name>` reads back what you meant.

## Done means

- The page holds no `*italic*` or `_italic_` emphasis.
- Every item in the pros, cons, reach-for-it and avoid lists opens with a bold lead of 2 to 8 words.
- `make gen && make validate` exits 0.
