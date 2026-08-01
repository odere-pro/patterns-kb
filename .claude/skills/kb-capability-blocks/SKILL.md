---
name: kb-capability-blocks
description: Write or review any block of a patterns-kb capability page — description, capabilities, mapping, choosing, portability. Use when someone asks to "write the capabilities taxonomy", "fill the cross-cloud mapping table", "what does AWS/Azure/GCP call this", "write the choosing block", "list what breaks when you move clouds", "document a cloud service category", or says a capability page reads as vendor marketing. Also use to review, evaluate, critique, audit or grade an existing capability block, including when the ask names it by file path or URL fragment (`…/<capability>.html#mapping`, `#capabilities`, `#portability`).
---

# The blocks of a capability page

Seven blocks, fixed order, none optional:

```
description  explain  capabilities  mapping  choosing  portability  relationships
```

`explain` is the **kb-explain** skill; `relationships` is **kb-edit** — a capability joins
the graph through `implements` ("Implemented by" on the pattern; the cloud sells the
pattern ready-made) and `prerequisite` where the platform **demands** a discipline instead
of providing it. This skill owns the other five.

**A capability takes the category as its subject and the vendors' products as evidence.**
The capability column is the durable part of every table; the product columns are
replaceable evidence. Naming decay is the standing cost of these pages — prefer the stable
capability-level answer to the newest brand.

**Anti-fabrication bites hardest here.** Every cell of the mapping table is a factual claim
about a named product. The three legal cell values: a service name you are sure of, "no
first-party equivalent" / "no direct open-source equivalent", or no row at all. An invented
product feature is a lie that ships to a public site. When unsure, omit.

Read before you write — the block, never the file:

```
node scripts/kb.mjs get <id> --block <name>
node scripts/kb.mjs get storage               # the exemplar, whole
```

Register rules: second person, active voice; every claim carries its consequence; no
unpriced adjectives. Emphasis is `<strong>`; **`<em>` and `<i>` are not in the vocabulary**.
Capability pages carry `data-kb-solves` like a pattern, always carry the `cloud` tag, live
flat in `site/capabilities/`, and their hub order comes from `CAPABILITY_ORDER` in
`scripts/lib/model.mjs`.

## The markup

Every block is a `<section class="doc-section">` with its `data-kb-block`, an
`aria-labelledby` and an `<h2 class="doc-h">`. The headings are uniform across the nine
pages: "What the cloud gives you here", "The capabilities", "What each cloud calls it",
"Choosing between them", "What does not port".

## description — the shapes, then the trap, then what is not mechanical

Two or three paragraphs under "What the cloud gives you here".

1. **The shapes every cloud sells**, each in one sentence, and why the choice binds: "the
   shape you pick decides the API you write against for the life of the system".
2. **The most-misread member**, priced: archive "is a bargain until you read it".
3. **What the mapping cannot do mechanically** — the settings (redundancy scope, access
   control) where two providers use the same words for different guarantees. This sets up
   `portability`.

No product names in the description. They arrive in `mapping`.

## capabilities — the provider-neutral taxonomy

A `<dl class="variations">` (same card shape as a pattern's `variations`), ~11–12 pairs.
Each `<dt>` is a capability name; **no product names anywhere in this block** — the block
is the durable half of the page and it must survive every rebrand.

Each `<dd>` is two sentences: what the capability is, then when to reach for it or the trap
in it ("never the only copy of anything", "a tier is only cheaper if your guess about
future reads was right"). When a `<dt>` names a pattern page the KB has, link the page-name
portion — `storage` links its first card to the `object-storage` pattern.

## mapping — the cross-cloud table, and every cell a claim

A `table.decision` inside a `.table-scroll`, columns exactly **Capability / AWS / Azure /
Google Cloud / Open source**, 12–16 rows. Rows carry minted ids (`mapping-row-N`); deeper
rows (SMB file shares, parallel file systems) carry `data-kb-level="advanced"`.

The rules, in force order:

1. **Anti-fabrication**: a name you are sure of, or "no first-party equivalent", or no
   row. Never a guessed product, never a feature attributed on hope.
2. **At least one `<tr>` stays untagged** — `make check` strips `<thead>` before asking
   whether anything survived a lens, so tagging every row up a lens fails the build.
3. **Capability column first, brands second**: name the row by the durable capability
   ("Delegated access URL"), and let each cell carry that cloud's brand (pre-signed URL /
   shared access signature / signed URL).
4. A cell may link a comparison page where one exists — `storage` links MinIO to
   `object-stores`.

The **stack-pick** skill reads this table by column (`kb.mjs get <id> --block mapping`) to
build vendor stacks — a wrong cell propagates into recommended architectures.

## choosing — the default, then the questions that move you off it

Prose plus a `table.decision`, under "Choosing between them".

1. **Open with the default and the burden of proof**: "start from object storage and
   justify anything else" — then the one or two questions that move you off it.
2. **The decision table**: If you need… / Choose / Because — situations, not features, with
   the Because column carrying the mechanism or the bill.
3. **The quiet failure mode** gets its own paragraph: the tiering trap, the minimum
   storage duration — the mistake the bill will not explain.
4. **Where the money actually goes**: "the bill for storage is rarely storage" — name the
   dominating charge and its counter-move.

## portability — what breaks when you move, each item priced

A `<ul>` of 5–7 items under "What does not port". Each item: a **bold claim** stating the
difference, then the mechanism and what it costs — "**A cross-region copy is not always a
readable copy**: … a disaster-recovery plan that assumes the first and gets the second does
not work on the day it matters."

The items are the non-mechanical residue the description promised: same words, different
guarantees (redundancy scope), different layer counts (access control), different
lifetimes (signed URLs). Close with the honest one: egress pricing is the real lock-in.
Deeper items carry `advanced`; the first never does.

## Worked example

`storage` is the exemplar. Read it whole before writing a new capability:

```
node scripts/kb.mjs get storage
node scripts/kb.mjs get storage --block mapping
node scripts/kb.mjs get storage --level basic
```

Its shape in one line each: description names the four shapes and flags redundancy scope as
the non-mechanical part; capabilities runs eleven provider-neutral cards from object
storage to managed backup; mapping fills the four vendor columns with names or an honest
"no equivalent"; choosing defaults to object storage and prices the tiering trap; and
portability lists seven ways the same words mean different guarantees.

## What these blocks are not

- `capabilities` is not `mapping` in card form. The taxonomy is provider-neutral by
  contract; a product name inside it is a defect, not a convenience.
- `choosing` is not a comparison page. It picks a **shape** within one category; picking a
  **product** within one shape is the `comparison` kind (**kb-comparison-blocks**), joined
  via `specializes`.
- `portability` is not a list of vendor complaints. Every item is a checkable difference
  with a cost, phrased so the reader can verify it against their own targets.
- `implements` is not `demonstrates`. "Implemented by" is a product category you can buy;
  "Demonstrated by" is a worked case study. And where the platform requires the pattern of
  you (elastic compute needs stateless services), the verb is `prerequisite`.

## Self-check

1. Zero product names inside the `capabilities` block.
2. Every `mapping` cell is a name you are sure of or an explicit "no equivalent" — and at
   least one `<tr>` is untagged so the table survives the basic lens.
3. Does `choosing` open with a default and the questions that move you off it, situations
   not features?
4. Does every `portability` item carry a bold claim, a mechanism and a price?
5. Is every ready-made pattern declared as an `implements` edge, and every demanded
   discipline as `prerequisite` (`node scripts/kb.mjs refs <id>`)?
6. `grep -n '<em>\|<i>'` on the page — nothing.
7. `node scripts/report-lens.mjs --kind capability` — the page sits in its 700–1200 word
   basic band.
8. `make all && make check`.
