---
name: kb-hazard-blocks
description: "Write or review any block of a hazard page: description, causes, cost, mitigation. Use when someone says 'write the causes block', 'what does this hazard cost', 'add the mitigation narrative', or a hazard names the problem without showing how it grows. Not for the fixing pattern (kb-pattern-blocks) or the mitigated-by edge (kb-edit)."
---

# The blocks of a hazard page

Six blocks, fixed order, no optional ones:

```
description  explain  causes  cost  mitigation  relationships
```

`explain` is the **kb-explain** skill; `relationships` is **kb-edit** (`kb.mjs link` writes
both sides of a `prevents-hazard` / `mitigated-by` edge); the diagrams are **diagram-draw**.
This skill owns `description`, `causes`, `cost` and `mitigation`.

**A hazard names the problem; it does not fix it.** The fix lives on the pattern one
`mitigated-by` hop away. Every block on this page is written from inside the failure, in the
words of the person suffering it — not from the vantage of the pattern that would have
prevented it.

Read before you write — the block, never the file:

```
node scripts/kb.mjs get <id> --block <name>
node scripts/kb.mjs get god-object            # the exemplar, whole
```

Register rules for all of it: second person, active voice, imperative for advice; one
concept per sentence, 2–3 per paragraph; every claim carries its consequence; no hedging
stacks and no unpriced adjectives. Emphasis is `**bold**`; **no `*italic*` or `_italic_` emphasis in
`docs/**.md`**.

## The markup

Every block is a `## <heading>` with `<!--meta block=<name>-->` on the next line (KB-003,
KB-006). The headings are conventional per kind — "What it is", "How it happens", "What it
costs" (or "Why it hurts"), "Getting out" (or "How to avoid it"). Prose, lists and figures
sit directly under it.

````markdown
## How it happens
<!--meta block=causes-->

```mermaid caption="…"
flowchart LR
    …
```

- …
- …
````

The build issues the element ids (`mintIds`) from the markdown structure; nothing runs before you cite one.

## description — recognise it, then name what makes it one

One paragraph of at most 80 words ([KB-015](../../../docs/reference/page-rules.md#KB-015)),
whose sentences do different jobs, in this order. **Do not open with a taxonomy.** What does
not fit belongs in `causes` and `cost`, not in a second paragraph.

1. **What the thing is**, concretely, and how it gets built — usually by a sequence of
   individually reasonable decisions.
2. **How you recognise it in your own system.** The symptoms someone would actually
   report: which file the merge conflicts cluster in, which query the p99 comes from.
3. **The defining trait**, separating it from the things it resembles. A god object is not
   defined by length; a stale cache is not defined by having a TTL.

The third move is what keeps the page from being a scold. Without it the reader
cannot tell whether they have this hazard or just a large class.

## causes — the loop, not a list of mistakes

3–10 items, median 6. Each names a **pressure or a missing control**, not a moral failing:
"deadline pressure rewards the fastest change, and extending an existing class beats
designing a new collaborator" beats "developers are lazy".

Most hazard pages open this block with a `flowchart` (28 of 36 carry one) showing the
**reinforcing loop** — why the hazard makes its own repair more expensive each cycle. That
figure is the block's argument; the list is its evidence. If the hazard has no loop, say so
in the list and skip the figure rather than drawing a straight line.

Name the control that is missing, because that is what the `mitigation` block will install.

## cost — what it costs the person paying it

2–7 items, median 5, each a flat `- ` item. State the cost in the terms the sufferer feels:
lost hours, blocked deploys, an incident at 3am, a test suite nobody runs. **Not** in terms
of design purity — "violates the single responsibility principle" is a diagnosis, not a
cost, and it belongs on the principle page.

Order them by who notices first. The engineer's costs come before the organisation's, and
the last one or two (onboarding, hiring, institutional memory) come last because only a staff reader is asking about them.

## mitigation — narrative, and it carries no typed edges

2–7 paragraphs, median 4, as prose. Three moves, in this order:

1. **Stop the growth before you try to reverse it.** The hazard is a loop, and shrinking
   while the loop still runs is a treadmill.
2. **How to choose the first cut** — from evidence, not from taste. Commit history,
   latency traces, the queue that actually backs up.
3. **What the half-finished repair looks like**, and how it fails again. A facade that
   starts holding state is the same class with better manners.

**The typed edges do not live here.** `mitigation` is the narrative; the patterns that
prevent the hazard are declared in `relationships`, and `kb.mjs link <pattern>
prevents-hazard <hazard>` writes both sides. Naming a pattern in this prose is good — link
it the first time — but a named pattern with no typed edge is a gap no gate can see.

The mitigation block carries no neighbour figure, because the relationships block already lists the mitigating pages.

## Worked example

`god-object` is the exemplar. Read it whole before writing a new hazard:

```
node scripts/kb.mjs get god-object
node scripts/kb.mjs get god-object --block causes
```

Its shape in one line each: description recognises the class by its gravity and then denies
that size is the trait; causes draws the loop where each shortcut raises the refactor's
price; cost runs from "any change risks unrelated behaviour" out to "onboarding stalls"; and
mitigation says stop growing, cut from commit history, and expect the facade to relapse.

## What these blocks are not

- `causes` is not `mitigation` reversed. "No owner enforces one responsibility per class" is
  a cause; "give each extracted responsibility a named owner" is the mitigation. Writing
  each list as the negation of the other produces two blocks that say one thing.
- `cost` is not `description`. The description says how you recognise it; the cost says what
  it takes from you once recognised.
- `mitigation` is not a pattern page. Do not re-explain Dependency Injection here — link it,
  declare the typed edge, and let its own page carry the mechanism.
- `solves` on a hazard is **symptom** vocabulary, and it points the other way from a
  pattern's: the phrases are what the sufferer observes ("we restart the service every night
  to keep it healthy"), never the fix. Keep it distinct from the terse `description`.
  `solves` rule: 3 to 5 phrases, each one problem stated problem first, at most 20 words, short common words, specific to this page, never a product choice or the page's name. Write them with `node scripts/kb.mjs set <id> --solves '[…]'` (the writer refuses a longer phrase); full rule in [markdown-authoring.md](../../rules/markdown-authoring.md).

## Self-check

1. Does `description` name the defining trait, so a reader can rule the hazard out?
2. Is every `causes` item a pressure or a missing control, with no blame in it?
3. Is every `cost` item something the sufferer feels, not a design-purity violation?
4. Is every pattern named in `mitigation` also a typed `prevents-hazard` edge
   (`node scripts/kb.mjs refs <id>`)?

## Done means

- The page holds no `*italic*` or `_italic_` emphasis.
- `make gen && make validate` exits 0.
