---
name: kb-theme-blocks
description: "Write or review any block of a theme page: description, architecture, tradespace, tour, decide, siblings. Use when someone says 'write the tradespace block', 'add a tour step', 'write the decide table', or a theme reads as a pattern list. Not for where a theme sits on the hub (its row in docs/data/site-structure.json)."
---

# The blocks of a theme page

Seven blocks, fixed order, two optional:

```
description  explain  architecture*  tradespace  tour  decide  siblings  relationships*
```

`architecture` appears only on themes that walk one concrete system (3 of 42 — the ML case
studies `bot-detection`, `harmful-content`, `video-recommendations`); `relationships` is
optional because a theme joins the graph through tour membership, not typed edges.
`explain` is the **kb-explain** skill; the diagrams are **diagram-draw**. This skill owns
the rest.

**A theme is a guided tour through the patterns that answer one recurring question.** It is
not a category: the tour steps are ordered, each names the role its pattern plays here, and
the theme owns the membership — the pattern's `fluency` item is generated from the same
data.

Two theme-only facts to hold onto:

- **Themes carry no `solves`** (KB-013). A theme is a tour, not a problem; its frontmatter
  `description` carries the search weight instead: with no `solves`, the shared scorer
  (`tools/src/lib/search-score.ts`, behind both `kb.mjs find` and the site search) scores
  its words at the `solves` weight.
- **Tour membership lives in one data file.** The theme's profile in
  `docs/data/learning-paths.json` lists its members as `stages`, and each member's `notes`
  entry holds, per theme, the `role`, the `tour` paragraph and the `fluency` line. `make gen`
  writes the theme's `tour` block and the pattern's `fluency` item from that one entry, so
  the halves cannot drift. Wording is free — the role is terse, the fluency line extends it.

Read before you write — the block, never the file:

```
node scripts/kb.mjs get <id> --block <name>
node scripts/kb.mjs get cap-theorem           # the exemplar, whole
```

Register rules for all of it: second person, active voice, imperative for advice; one
concept per sentence, 2–3 per paragraph; every claim carries its consequence; no unpriced
adjectives. Emphasis is `**bold**`; **no `*italic*` or `_italic_` emphasis in `docs/**.md`**.

## The markup

Every block is a `## <heading>` with `<!--meta block=<name>-->` on the next line (KB-003,
KB-006). The `description` heading is "The question"; the others vary by page ("The
trade-space", "Patterns that implement the choice", "When to reach for what", "Related
areas") — the `block` fact is what must not vary.

The tour steps are data. A step is a stage in the theme's profile plus a note on the member,
both in `docs/data/learning-paths.json`:

```json
"/patterns/distributed/coordination/replication.html": {
  "cap-theorem": {
    "role": "The copies whose agreement CAP is about",
    "tour": "…",
    "fluency": "…",
    "tourLevel": "advanced",
    "fluencyLevel": "advanced"
  }
}
```

The stage is the pattern's route and `role` the terse role. The generated step heading
carries a keyed id (`tour-<member>`), so it survives reordering.

## description — the question, then the vocabulary to ask it with

One paragraph of at most 80 words ([KB-015](../../../docs/reference/page-rules.md#KB-015))
under the heading "The question"; the two moves are its sentences.

1. **The moment the question becomes unavoidable**, concretely: the network drops messages
   between nodes, and a node "has two honest choices".
2. **The named concepts** the rest of the page will use — CAP's three properties, each
   glossed in one clause — so the tradespace can argue without stopping to define.

No tour preview, no "in this theme we will". The description frames; the tour walks.

## architecture (optional) — one concrete system, walked

Only on themes that are themselves a worked ML case study. The lead paragraph walks the
pipeline naming each stage in bold; the operational nuance follows. Heading: "How the system is built". If the theme is a decision
space rather than a system, this block does not exist — do not force one.

## tradespace — the axes, and what moving along them costs

2–5 paragraphs of prose, often closing with a figure. The jobs, in order:

1. **Correct the naive framing** first, where one exists: "pick two of three is a little
   misleading — P is not optional".
2. **Name the real axes** and price both ends: what a CP store refuses, what an AP store
   admits, and why neither is better — anchor each end to a workload (bank ledger, shopping
   cart).
3. **Read the labels narrowly** — the advanced paragraphs carry the precision that stops
   misuse (CAP's availability is the literal 100% kind; Spanner is formally CP).

The first paragraph states the dial; the deeper readings follow. A closing
`flowchart` showing the decision fork is common and earns its place when it shows the
branch, not a vocabulary diagram.

## tour — ordered steps, each naming the role the pattern plays HERE

3–12 steps, median 7. The block is a generated marked block (`gen-tours`, rewritten by
`make gen`); never edit between its `tour:start` and `tour:end` markers. Each step is:

- a stage in the theme's profile `stages` — the pattern's route (this is the source of truth
  for theme membership, and the stage order is the step order);
- a `role` in the member's note — the terse role, a phrase not a sentence ("Tune the
  consistency/availability dial with read/write quorums");
- a `tour` paragraph in the same note, saying what the pattern does **for this theme's
  question** — not what the pattern is. Its own page says what it is. The generated step
  heading links the pattern (a `heading` in the note rewords it).

Order is pedagogical: the dial itself first, then the mechanisms under it, then the
looser cousins. The first step's paragraph stays unmarked; later steps commonly carry
`stepLevel` or `tourLevel` `advanced` in their note.

**Every step you add or remove changes a second page**: the pattern's `fluency` item
(owned by **kb-pattern-blocks**) comes from the same note, so write its `fluency` line when
you add the stage. The `learning-paths` gate fails a stage or note that names no page.

## decide — the table that picks a member

A table, 3–11 rows, median 6. Three columns in the
house shape: the reader's situation ("If you need…" / "When the symptom is…"), the lean or
strategy, and "Reach for" — the member patterns, **linked**. Heading: "When to reach for
what" (or "How to decide").

Every row's condition is the reader's situation, never the pattern's feature — the same
rule as a pattern's `usage`. Every pattern a row reaches for should be on the tour; a
decide row pointing at a non-member is a sign the tour is missing a step.


## siblings — where this theme stops

3–6 items, median 3, in a list. Each item, `- [<theme>](<theme>.md) — <boundary>`, links a
neighbouring theme and says in one clause **where the boundary runs** — "the mechanics behind the CAP choice"
tells the reader which page to be on, which is the entire job. Heading: "Related areas".

Not a see-also list: a sibling entry that could describe this page too ("also about
distributed systems") draws no line and earns no slot.

## Worked example

`cap-theorem` is the exemplar. Read it whole before writing a new theme:

```
node scripts/kb.mjs get cap-theorem
node scripts/kb.mjs get cap-theorem --block tour
```

Its shape in one line each: description puts the reader at the moment of partition and
names C, A and P; tradespace kills "pick two", prices CP against AP and adds PACELC after them; the tour runs from the dial (quorum) through the mechanisms (replication, leader
election, WAL) to the AP cousins (saga, gossip); decide maps four situations to linked
members; siblings draw the line to Consistency & Replication, Scalability and Resilience.

## What these blocks are not

- `tour` is not a pattern catalogue. A step explains the pattern's role in **this**
  question; the mechanism lives on the pattern's page.
- `decide` is not `tradespace` as a table. The tradespace argues the axes; decide assumes
  them and routes the reader.
- `siblings` is not `relationships`. Siblings are editorial prose about boundaries; typed
  edges (rare on themes) go through `kb.mjs link`.
- A theme's `description` is not decoration — with no `solves`, it is the page's entire search
  surface. Write it as the question's terse answer.

## Self-check

1. Does every stage in the theme's profile have a note with its `role`, `tour` paragraph
   and `fluency` line — the `learning-paths` gate reports one that names no page?
2. Is every `role` a terse role phrase, and every step paragraph about the role
   here rather than the pattern in general?
3. Does every `decide` row reach for a linked tour member, phrased as the reader's
   situation?
4. Does each `siblings` entry draw a boundary a reader could route by?

## Done means

- The page holds no `*italic*` or `_italic_` emphasis.
- `make gen && make validate` exits 0 — `make gen` writes the tour and fluency blocks, and
  the `learning-paths` gate holds the data they come from.
