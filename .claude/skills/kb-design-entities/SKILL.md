---
name: kb-design-entities
description: "Write or review the entities block (\"Core entities & data design\") of a design page: a short lead, then entities grouped by role, each with a one-line description and a trimmed-DDL sketch. Use when asked to \"write the entities block\", \"group the entities\", \"show the schema per entity\", or to review it. Not for the API surface (kb-design-interface)."
---

# Writing the Core entities & data design block

**The entities block *is* the data design, and it is read as the prerequisite for the
interface block.** A reader who has scanned it must be able to design the API: what the
resources are, who owns them, which store each lives in, and which constraints carry the
business rules. Every schema ships **collapsed** — a sketch fence, which the site renders
as a closed `<details>`: sixteen expanded schemas push the argument that owns the page off
the screen, and the reader scrolls past the prose to reach the next one. What makes that readable rather than
hidden is the fence's `summary`, so it names its table. Two sections, in order: a short
observations lead, then the entities in groups.

## The markup

````markdown
## Core entities & data design
<!--meta block=entities-->

… observations: 2–4 claim sentences …

### Group name — store(s) {#entities-group-1}

- **EntityName** — One sentence: what it is and the rule it carries.

  ```sql summary="schema — table_name"
  CREATE TABLE …
  ```
- …
````

The heading is **"Core entities & data design"**, with the `<!--meta block=entities-->`
fact on the line under it. The block is hand-written markdown in the page under
`docs/designs/` — no `kb.mjs` writer exists for it; the `kb-shape` gate in `make validate`
checks its structure, not its content. A group is a `###` heading and a `-` list; an entity
is one item of that list, its sketch fence nested under it (indented to the item's text).
Each fence's `summary` names its table (`schema — flow`): collapsed, that line is the whole
entity's schema, so `schema` alone costs the reader a click to find out which table. The
fence's language (`sql`) is what the site highlights and what the `kb-shape` gate checks
against the closed sketch-language list (KB-010) — a fence with no language renders the
schema in flat ink and fails the gate.
Full sketch contract, including the closed language set: the **kb-sketch** skill.

## The two-part shape

### 1. Observations

One paragraph — 2–4 sentences, each a claim about the
data design, no filler. What belongs here: the seams the design cuts along (business
truth vs operational bookkeeping, PII vs everything else), how state is held
(materialised current state, append-only history), and the constraints that do the most
work, by name. What does not: restated requirements, table-by-table narration, anything
an entity's own description already says. If a sentence could be deleted without losing
a claim, delete it.

- **No hedging, no marketing adjectives.** "May potentially be somewhat denormalised"
  hedges three times to say one thing, and "a robust, scalable schema" prices nothing —
  state the constraint, the seam or the figure instead. One hedge is a confidence marker
  and is fine; a stack of them means the claim was never made.

### 2. Grouped entities

**Group by domain role, not by physical store** — groups should map to the resources the
interface block will expose. Typical groups: tenancy & identity, the core lifecycle,
evidence, integration & delivery, governance. 3–6 groups; a group of one is fine when the
entity genuinely stands alone (an audit log usually does). The `###` heading names the
group and its store(s) follow after ` — ` — `### Flow lifecycle — operational Postgres` — so the
sizing block's store count stays visible here. That is the page-wide title-and-qualifier
idiom: the same ` — ` carries the scope clause on a requirements tier, and a routing tag
follows a deep-dive heading after a single space.

Every entity appears in **exactly one** group, as one list item with three parts:

- **Bold lead** — the entity's PascalCase name, nothing else, then ` — `.
- **One-line description** — what it is and the rule it carries, one sentence, maybe two
  short ones. The rule is the point: "written *before* the presigned upload so a failed
  upload leaves a visible stub" earns its line; "stores document metadata" does not.
- **Schema** — trimmed DDL in a `sql` sketch fence nested under the item, whose `summary`
  names the table; collapsed by default, opened by the reader one at a time.

### Trimmed-DDL rules

Real SQL, cut to what argues:

- **Only load-bearing columns** — keys, references, state, and every column a rule or a
  clock reads. Elide the rest with a comment: `-- … timestamps, jurisdiction …`.
- **Named constraints and indexes in full** — a partial unique index or an RLS policy
  that *is* a business rule is the most important line in the block; never elide it.
- **Comments carry the why**, one short clause: `-- NULL = still owed to the client`.
- **Types and enums** stay with the entity that owns them (`CREATE TYPE flow_state` sits
  with Flow).
- A store that is not the operational database (a PII vault, an object store) still gets
  a schema — open it with a comment saying where it lives; for blobs, show the metadata
  row and say where the bytes are.
- ~6–12 lines per entity. Past that, you are documenting, not arguing — trim.

## Inline markup

The one-line descriptions are prose: a code span for a column, table or type name, bold
for a run-in label, a relative `[link](../patterns/….md)` for a page the KB has. **No
`*italic*` or `_italic_`** — the corpus carries none. A column worth stressing is already in
a code span, which is emphasis enough.

## Consistency with the rest of the page

The entity set is **worked out from the FR/NFR/sizing blocks, never invented**. Every
entity must trace to a requirement or a sizing decision (the queue-as-a-table verdict is
the `task` schema; the outbox verdict is the `outbox` schema), and every store named in a
group heading must appear in the sizing block's store count. On disagreement the
requirements win — fix the entities, and if the mismatch is real on the other side,
report it rather than silently editing FR/NFR/sizing from here. Downstream, the
`interface` block should need no data the entities don't show.

## What this block is not

- **Not the sizing block.** Stores are named in group headings; counting and justifying
  them happened upstream ([kb-design-sizing](../kb-design-sizing/SKILL.md)).
- **Not the deep dives.** A constraint is *shown* here; the race it defeats is argued in
  `deepdives`. Link by mention ("deep dive 2"), don't inline the argument.
- **Not a full DDL dump.** Migrations live in repositories; this block carries the
  columns and constraints that make the design's argument, nothing more.

**Legacy note**: the standard corpus shape for this block is a minimal `Core entities`
list (a lead paragraph + one `-` list, no schemas). That shape stays valid; this format is
currently applied only to `persona-identification`. Migrate another page to it only when
its entities block is being reworked on purpose — not as a side effect of a small edit.

## Self-check the draft

- Scan test: after 20 seconds and **without opening a schema**, can a reader name the
  groups, the stores, and which entity carries which rule? That is what the group
  headings, the one-line descriptions and the fences' `summary` lines are for. A
  `summary` that says only `schema` fails it.
- Is the observations lead ≤4 sentences, every one a claim?
- Do the schemas show every named constraint in full, and elide everything else with a
  comment?
- Does every entity trace to an FR, NFR, or sizing verdict — and every store in a
  heading to the sizing block's store count?
- Run `node scripts/kb.mjs get <id> --block entities` — the output should scan as:
  observations, then group → entity → schema, repeating.

## Done means

- Every entity appears in exactly one group, as a list item with a bold name, a one-line
  rule, and a nested `sql` sketch fence whose `summary` names its table.
- Every group heading names its store(s) after ` — `, in the heading itself.
- `make gen && make validate` exits 0.
