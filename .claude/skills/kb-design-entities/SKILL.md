---
name: kb-design-entities
description: Write or review the entities block ("Core entities & data design") of a patterns-kb design page — a short observations lead, then entities grouped by domain role, each with a name, a one-line description, and a trimmed-DDL schema expanded by default. Use when someone asks to "write the entities block", "format core entities", "restructure the data design", "group the entities", "show the schema per entity", or says the data design is unreadable or hidden behind a click.
---

# Writing the Core entities & data design block

**The entities block *is* the data design, and it is read as the prerequisite for the
interface block.** A reader who has scanned it must be able to design the API: what the
resources are, who owns them, which store each lives in, and which constraints carry the
business rules. Every schema is visible on load — collapsible is fine, collapsed is not:
`<details class="sketch" open>`, never a closed one. Two sections, in order: a short
observations lead, then the entities in groups.

## The markup

```html
<section class="doc-section" id="entities" aria-labelledby="h-entities" data-kb-block="entities">
  <h2 class="doc-h" id="h-entities">Core entities &amp; data design</h2>
  <div class="prose">
    <p>… observations: 2–4 claim sentences …</p>
  </div>
  <div class="entity-group">
    <h3>Group name — store(s)</h3>
    <div class="entity">
      <h4>EntityName</h4>
      <p>One sentence: what it is and the rule it carries.</p>
      <details class="sketch" open>
        <summary>schema — table_name</summary>
<pre><code class="language-sql" data-kb-lang="sql">CREATE TABLE …</code></pre>
      </details>
    </div>
    …
  </div>
  …
</section>
```

The heading is **"Core entities & data design"**. The block is hand-edited HTML — no
`kb.mjs` writer exists for it; the PostToolUse hook checks structure, not content.
`entity-group` / `entity` are presentation-only classes (styled in
`site/assets/pattern.css`); the meaning lives in the element structure, not the class
names. Each schema's `<summary>` names its table (`schema — flow`) so the block stays
scannable when someone collapses it. Always keep `data-kb-lang` on the `<code>` —
`sketch.js` highlights open sketches on load, and without the attribute they render
unhighlighted.

## The two-part shape

### 1. Observations

One `<div class="prose">` with a single `<p>` — 2–4 sentences, each a claim about the
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
entity genuinely stands alone (an audit log usually does). The `<h3>` names the group
*and* the store(s) it lives in after an em-dash — `Flow lifecycle — operational
Postgres` — so the sizing block's store count stays visible here.

Every entity appears in **exactly one** group, as one `<div class="entity">` with three
parts:

- **`<h4>` name** — the entity's PascalCase name, nothing else.
- **One-line description** — what it is and the rule it carries, one sentence, maybe two
  short ones. The rule is the point: "written *before* the presigned upload so a failed
  upload leaves a visible stub" earns its line; "stores document metadata" does not.
- **Schema** — trimmed DDL in a `<details class="sketch" open>` whose `<summary>`
  names the table; expanded by default, collapsible by the reader.

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

The one-line descriptions are prose: `<code>` for a column, table or type name,
`<strong>` for a run-in label, `<a>` for a page the KB has. **No `<em>` and no `<i>`** —
the corpus carries none and no stylesheet renders italic. A column worth stressing is
already in `<code>`, which is emphasis enough.

## Consistency with the rest of the page

The entity set is **derived from the FR/NFR/sizing blocks, never invented**. Every
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
list (lead `<p>` + one `<ul>`, no schemas). That shape stays valid; this format is
currently applied only to `persona-identification`. Migrate another page to it only when
its entities block is being reworked on purpose — not as a side effect of a small edit.

## Self-check

1. Scan test: after 20 seconds, can a reader name the groups, the stores, and the two or
   three constraints that carry the rules? If any schema is collapsed on load, it fails.
2. Is the observations lead ≤4 sentences, every one a claim?
3. Does every entity appear in exactly one group, with name + one-line rule + visible
   schema — and does every group heading name its store(s)?
4. Do the schemas show every named constraint in full, and elide everything else with a
   comment?
5. Does every entity trace to an FR, NFR, or sizing verdict — and every store in a
   heading to the sizing block's store count?
6. `make all && make check`, then `node scripts/kb.mjs get <id> --block entities` — the
   output should scan as: observations, then group → entity → schema, repeating.
