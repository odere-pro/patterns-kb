---
name: kb-theme-blocks
description: Write or review any block of a patterns-kb theme page — description, architecture, tradespace, tour, decide, siblings. Use when someone asks to "write the tradespace block", "add a tour step", "write the decide table", "frame the theme's question", "add a sibling theme", "map this concrete system on a theme", or says a theme reads as a pattern list instead of a guided tour. Also use to review, evaluate, critique, audit or grade an existing theme block, including when the ask names it by file path or URL fragment (`…/<theme>.html#tradespace`, `#tour`, `#decide`).
---

# The blocks of a theme page

Seven blocks, fixed order, two optional:

```
description  explain  architecture*  tradespace  tour  decide  siblings  relationships*
```

`architecture` appears only on themes that walk one concrete system (3 of 37 — the ML case
studies `bot-detection`, `harmful-content`, `video-recommendations`); `relationships` is
optional because a theme joins the graph through tour membership, not typed edges.
`explain` is the **kb-explain** skill; the diagrams are **diagram-draw**. This skill owns
the rest.

**A theme is a guided tour through the patterns that answer one recurring question.** It is
not a category: the tour steps are ordered, each names the role its pattern plays here, and
the theme owns the membership — the pattern's own `fluency` item is the required echo.

Two theme-only facts to hold onto:

- **Themes carry no `solves`.** A theme is a tour, not a problem; its `essence` carries the
  search weight instead (both `kb.mjs find` and search.js score it at the `solves` weight).
- **Tour membership is the one two-sided pairing no writer maintains.** Adding a
  `.tour-step` means hand-adding the matching `.fluency-item[data-kb-theme]` on the
  pattern; `make check` fails either half alone (`TOUR WITHOUT FLUENCY` /
  `FLUENCY WITHOUT TOUR`). Wording is free — the tour role is terse, the pattern's line
  extends it — presence is not.

Read before you write — the block, never the file:

```
node scripts/kb.mjs get <id> --block <name>
node scripts/kb.mjs get cap-theorem           # the exemplar, whole
```

Register rules for all of it: second person, active voice, imperative for advice; one
concept per sentence, 2–3 per paragraph; every claim carries its consequence; no unpriced
adjectives. Emphasis is `<strong>`; **`<em>` and `<i>` are not in the vocabulary**.

## The markup

Every block is a `<section class="doc-section">` with its `data-kb-block`, an
`aria-labelledby` and an `<h2 class="doc-h">`. The `description` heading is "The question";
the others vary by page ("The trade-space", "Patterns that implement the choice", "When to
reach for what", "Related areas") — the anchor and `data-kb-block` are what must not vary.

```html
<div class="tour-step" data-kb-member="replication"
     data-kb-role="The copies whose agreement CAP is about" id="tour-replication">
  <h3><a href="../patterns/distributed/coordination/replication.html">Replication</a></h3>
  <p id="tour-p-2" data-kb-level="advanced">…</p>
</div>
```

`data-kb-member` is the pattern's id and `data-kb-role` the terse role — both are **data**,
projected into `graph.json` and the JSON-LD. The step's id is keyed (`tour-<member>`), so it
survives reordering.

## description — the question, then the vocabulary to ask it with

Two or three paragraphs under the heading "The question".

1. **The moment the question becomes unavoidable**, concretely: the network drops messages
   between nodes, and a node "has two honest choices".
2. **The named concepts** the rest of the page will use — CAP's three properties, each
   glossed in one clause — so the tradespace can argue without stopping to define.

No tour preview, no "in this theme we will". The description frames; the tour walks.

## architecture (optional) — one concrete system, walked

Only on themes that are themselves a worked ML case study. The lead paragraph walks the
pipeline naming each stage in `<strong>`, basic-visible; the operational nuance follows at
`data-kb-level="advanced"`. Heading: "How the system is built". If the theme is a decision
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

The first paragraph stays untagged; the deeper readings carry `advanced`. A closing
`flowchart` showing the decision fork is common and earns its place when it shows the
branch, not a vocabulary diagram.

## tour — ordered steps, each naming the role the pattern plays HERE

3–12 steps, median 7. Each `.tour-step` carries:

- `data-kb-member` — the pattern's id (this is the source of truth for theme membership);
- `data-kb-role` — the terse role, a phrase not a sentence ("Tune the
  consistency/availability dial with read/write quorums");
- an `<h3>` linking the pattern, and one paragraph saying what the pattern does **for this
  theme's question** — not what the pattern is. Its own page says what it is.

Order is pedagogical: the dial itself first, then the mechanisms under it, then the
looser cousins. The first step's paragraph stays untagged; later steps commonly carry
`advanced`.

**Every step you add or remove has a second half**: the matching `fluency` item on the
pattern page (owned by **kb-pattern-blocks**), at the `href` depth the pattern's folder
implies. `make check` fails on either half alone.

## decide — the table that picks a member

A `table.decision` inside a `.table-scroll`, 3–11 rows, median 6. Three columns in the
house shape: the reader's situation ("If you need…" / "When the symptom is…"), the lean or
strategy, and "Reach for" — the member patterns, **linked**. Heading: "When to reach for
what" (or "How to decide").

Every row's condition is the reader's situation, never the pattern's feature — the same
rule as a pattern's `usage`. Every pattern a row reaches for should be on the tour; a
decide row pointing at a non-member is a sign the tour is missing a step.

Keep at least one `<tr>` untagged — a table whose every row moved up a lens renders as a
headed, empty table at basic, and `make check` strips `<thead>` before deciding.

## siblings — where this theme stops

3–6 items, median 3, in a `.fluency-list`. Each `.fluency-item` links a neighbouring theme
and says in one clause **where the boundary runs** — "the mechanics behind the CAP choice"
tells the reader which page to be on, which is the entire job. Heading: "Related areas".

Not a see-also list: a sibling entry that could describe this page too ("also about
distributed systems") draws no line and earns no slot.

## Worked example

`cap-theorem` is the exemplar. Read it whole before writing a new theme:

```
node scripts/kb.mjs get cap-theorem
node scripts/kb.mjs get cap-theorem --block tour
node scripts/kb.mjs get cap-theorem --level basic
```

Its shape in one line each: description puts the reader at the moment of partition and
names C, A and P; tradespace kills "pick two", prices CP against AP and adds PACELC one
lens up; the tour runs from the dial (quorum) through the mechanisms (replication, leader
election, WAL) to the AP cousins (saga, gossip); decide maps four situations to linked
members; siblings draw the line to Consistency & Replication, Scalability and Resilience.

## What these blocks are not

- `tour` is not a pattern catalogue. A step explains the pattern's role in **this**
  question; the mechanism lives on the pattern's page.
- `decide` is not `tradespace` as a table. The tradespace argues the axes; decide assumes
  them and routes the reader.
- `siblings` is not `relationships`. Siblings are editorial prose about boundaries; typed
  edges (rare on themes) go through `kb.mjs link`.
- A theme's essence is not decoration — with no `solves`, it is the page's entire search
  surface. Write it as the question's terse answer.

## Self-check

1. Every list and table has at least one **untagged** item or row, or the block renders
   empty at basic and `make check` fails.
2. Does every `.tour-step` have its matching `fluency` item on the pattern page —
   `make check` reports `TOUR WITHOUT FLUENCY` otherwise?
3. Is every `data-kb-role` a terse role phrase, and every step paragraph about the role
   here rather than the pattern in general?
4. Does every `decide` row reach for a linked tour member, phrased as the reader's
   situation?
5. Does each `siblings` entry draw a boundary a reader could route by?
6. `grep -n '<em>\|<i>'` on the page — nothing.
7. `make all && make check` — this is the pairing the build actually enforces.
