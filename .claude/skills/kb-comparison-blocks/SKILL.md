---
name: kb-comparison-blocks
description: Write or review any block of a patterns-kb comparison page — description, contenders, matrix, choosing. Use when someone asks to "write the contenders block", "compare Kafka and RabbitMQ properly", "fill the comparison matrix", "is the matrix still accurate", "write the choosing block", "add a product comparison", or says a comparison page ranks products instead of arguing conditions. Also use to review, evaluate, critique, audit or grade an existing comparison block, including when the ask names it by file path or URL fragment (`…/<comparison>.html#matrix`, `#contenders`, `#choosing`).
---

# The blocks of a comparison page

Six blocks, fixed order, none optional:

```
description  explain  contenders  matrix  choosing  relationships
```

`explain` is the **kb-explain** skill; `relationships` is **kb-edit** — a comparison joins
the graph through `specializes` (its capability page is the wider subject) and `implements`
(these products ARE the pattern, runnable or buyable). This skill owns `description`,
`contenders`, `matrix` and `choosing`.

**A comparison takes ONE product decision as its subject** — the managed services and
open-source contenders for a single capability area, side by side, compared on the
conditions that decide the choice. The subject is the decision, not any product; the page
never ranks, it routes.

**Anti-fabrication bites hardest here, and decays fastest.** The matrix and contender
cards carry license, ownership, managed-offering and scale claims about named products —
and licenses change (Redis did, RabbitMQ changed owners, Redpanda's BSL converts on a
clock). Every such claim must be one you are sure of at time of writing; when unsure, omit
the claim rather than the contender. These pages are standing **kb-fact-check** targets.

Read before you write — the block, never the file:

```
node scripts/kb.mjs get <id> --block <name>
node scripts/kb.mjs get message-brokers       # the exemplar, whole
```

Register rules: second person, active voice; every claim carries its consequence; no
unpriced adjectives. Emphasis is `<strong>`; **`<em>` and `<i>` are not in the vocabulary**.
Comparison pages carry `data-kb-solves` like a pattern, take product names as `aliases`
(that is how "alternative to Kafka" resolves here), live flat in `site/comparisons/`, and
their hub order comes from `COMPARISON_ORDER` in `scripts/lib/model.mjs` — ordered to
shadow `CAPABILITY_ORDER`, so a comparison sits where its capability area sits.

## The markup

Every block is a `<section class="doc-section">` with its `data-kb-block`, an
`aria-labelledby` and an `<h2 class="doc-h">`. The headings are uniform across the eight
pages: "What this compares", "The contenders", "How they compare", "Choosing between
them".

## description — the one distinction that decides most of the choice

Three paragraphs under "What this compares".

1. **The products hiding behind the vague ask**: several products hide behind "we need a
   queue" — name the self-hosted contenders and the managed services in one breath each.
2. **The one distinction that decides most of the choice**, priced in consequences: a queue
   deletes on acknowledgement, a log keeps records — "pick the queue, then need replay, and
   the records were acknowledged away".
3. **What the rest is**: degree. Name the remaining axes (routing, operational attention,
   protocols, ownership) so the matrix's criteria arrive expected.

## contenders — one honest card per product

A `<dl class="variations">` (same card shape as a pattern's `variations`), 4–7 pairs. Each
`<dt>` is the product; each `<dd>` is 2–3 sentences carrying, in rough order:

- **what shape it is** (partitioned log, AMQP broker, small pub/sub core);
- **license and owner**, stated plainly — "Apache-2.0, from the Apache Software
  Foundation", "MPL-2.0, owned by Broadcom since the VMware acquisition" — including the
  clause that bites: "it ships under the Business Source License, converting to Apache-2.0
  four years after each release — read that clause before you sell what you build on it";
- **where to rent it**, or that no hyperscaler sells it.

The cloud's own services usually share one card ("The cloud's own services") that maps the
job across AWS / Azure / Google Cloud in a sentence each. Deeper contenders (Redpanda,
Pulsar) carry `data-kb-level` up a lens; the headline contenders never do.

## matrix — conditions down the side, contenders across the top

A `table.decision` inside a `.table-scroll`, under "How they compare". Columns: Criterion,
then one per contender (the minor ones may fold into a shared "Cloud-native services"
column — 5–7 columns total). Rows: 6–11 criteria, each id-minted (`matrix-row-N`).

The rules:

1. **Every criterion is a condition that decides the choice**, phrased operationally —
   "After a consumer reads it", "Adding throughput", "Running it yourself" — never a
   feature checklist ("supports pub/sub: yes/yes/yes" decides nothing).
2. **Every cell is a fact with its consequence**, compressed: "More partitions; a group
   cannot exceed them". No marketing adjectives, no scores, no ✓/✗.
3. **One row carries license and owner** — the row that decays, and the reason fact-check
   sweeps land here.
4. **At least one `<tr>` stays untagged** — `make check` strips `<thead>` before asking
   whether anything survived a lens, so tagging every row up fails the build.

The **alt-pick** skill reads this block cell by cell to strike contenders against a user's
constraints, and cites rows by id (`…#matrix-row-3`) — a vague cell breaks that filter.

## choosing — verdicts per condition, opening with "run none of them"

5–7 paragraphs of prose under "Choosing between them". The shape:

1. **Start with the null option** where one honestly exists: "start by running no broker" —
   a job table in the database you already have — and the metric that tells you to move
   off it.
2. **Then the default** (usually the cloud's own service) and the specific reasons to
   leave it — "you must replay records a consumer has read, or you must run the same
   design on another cloud".
3. **Then one paragraph per remaining contender**, each opening "Choose X when…" with the
   condition, not the feature — and pricing the operational bill ("budget people before
   machines"; "staff for BookKeeper").
4. **Close with the decision that outlives the product**: "write every consumer to survive
   seeing a message twice — that decision outlives the broker you chose it for."

Minority-case paragraphs carry `data-kb-level="advanced"`; the null option and the default
never do.

## Worked example

`message-brokers` is the exemplar. Read it whole before writing a new comparison:

```
node scripts/kb.mjs get message-brokers
node scripts/kb.mjs get message-brokers --block matrix
node scripts/kb.mjs get message-brokers --level basic
```

Its shape in one line each: description reduces "we need a queue" to consumed-versus-
replayed; contenders gives six cards each carrying shape, license, owner and where to rent
it; the matrix runs eight operational criteria across five columns; choosing starts at "no
broker", defaults to the cloud queue, and hands each contender its one condition.

## What these blocks are not

- `contenders` is not the `capabilities` taxonomy. A capability page names **shapes** with
  no products; a comparison names **products** — that is the split `specializes` records,
  and why the two kinds exist.
- `matrix` is not a scorecard. No winner column, no totals; the reader's conditions do the
  ranking, in `choosing`.
- `choosing` is not a review roundup. Each verdict is "choose X **when**" — a condition
  the reader can test against their own situation, with the bill attached.
- The `solves` field is symptom vocabulary ("our queue deletes messages we later needed"),
  and `aliases` carry the product names — that is what routes "alternative to Kafka" to
  this page.

## Self-check

1. Is every license, owner and managed-offering claim one you are certain of today — and
   is anything you were unsure of omitted rather than guessed?
2. Is every matrix criterion a deciding condition, every cell a fact plus consequence, and
   at least one `<tr>` untagged so the table survives the basic lens?
3. Does `choosing` open with the null option or the default, and does every contender
   verdict start from the reader's condition?
4. Do the product names appear in `aliases`, so alt-pick can resolve "alternative to X"?
5. Are `specializes` (to the capability page) and `implements` (to the patterns these
   products sell) both declared (`node scripts/kb.mjs refs <id>`)?
6. `grep -n '<em>\|<i>'` on the page — nothing.
7. `node scripts/report-lens.mjs --kind comparison` — the page sits in its 700–1200 word
   basic band.
8. `make all && make check`.
