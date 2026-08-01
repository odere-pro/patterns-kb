---
name: kb-design-relationships
description: Write, group and maintain the relationships block ("Patterns it demonstrates") of a patterns-kb design page — the rows are written by kb.mjs link/unlink, and once a page carries more than about ten of them the flat list is regrouped by concern. Use when someone asks to "group the patterns it demonstrates", "the demonstrates list is too long", "add a pattern to this design", "why did kb.mjs link put the row at the bottom", "reorder the relationship groups", or says a design's pattern list reads as an undifferentiated wall. Also use to review, evaluate, critique, audit or grade an existing relationships block, including when the ask names it by file path or URL fragment (`…/<page>.html#relationships`).
---

# Grouping the Patterns it demonstrates block

**The rows are tool-owned; only the grouping is yours.** Every `rel-item` is written by
`kb.mjs link` on *both* pages at once, and the graph is built by reading their attributes
back. What a human adds on top is the arrangement: past roughly ten rows, a flat list stops
being a list and becomes a wall, and the reader loses the one thing the block could tell them
— *where in this design each pattern actually shows up.*

## The markup

```html
<section class="doc-section" id="relationships" aria-labelledby="h-rel" data-kb-block="relationships">
  <h2 class="doc-h" id="h-rel">Patterns it demonstrates</h2>

  <div class="rel-group">
    <p class="rel-type">Orchestration &amp; state</p>
    <div class="rel-list">
      <div class="rel-item" data-kb-rel="demonstrates" data-kb-to="saga"><a href="…">Saga</a><span class="rel-note">…</span></div>
      …
    </div>
  </div>

  <div class="rel-group">
    <p class="rel-type">Vendor resilience</p>
    …
  </div>
</section>
```

The heading is fixed at **"Patterns it demonstrates"**. `rel-group` / `rel-type` / `rel-list`
/ `rel-item` are presentation-only classes, already styled in
[`site/assets/pattern.css`](../../site/assets/pattern.css) — grouping needs **no CSS change
and no script change.**

## The one hard rule: never hand-write a rel-item

An edge lives on two pages. Typing a `rel-item` into one of them produces a one-way edge, and
`build.mjs` fails the build on it. Always go through the writer:

```
node scripts/kb.mjs link <design> demonstrates <pattern> --note "…" --note-back "…"
node scripts/kb.mjs unlink <design> <pattern>
```

`link` writes the design's row *and* the pattern's "Demonstrated by" backlink. Re-typing a
note is `unlink` then `link` — there is no edit-in-place. When you regroup, move the
`rel-item` lines **byte-identically**: `data-kb-rel`, `data-kb-to`, the `href` and the
`rel-note` text are all read by the build, and a stray edit to any of them desyncs the graph.

## Why repurposing `.rel-type` is safe

On a pattern page, `.rel-type` names the relation verb — "Combines with", "Variant of" — and
that label is doing real work, because a pattern page carries many verbs. **A design page
carries exactly one**: `demonstrates`. So the label "Demonstrates" repeats the `<h2>` directly
above it and tells the reader nothing. Replacing it with a concern name is strictly more
information in the same slot.

This is safe because the build never reads the label. `build.mjs` collects relations from the
`data-kb-rel` / `data-kb-to` attributes and the `.rel-note` text; `kb.mjs unlink` resolves an
item by `data-kb-to`, and still takes an emptied group with it. Verified by `make check` —
`audit-relations` compares every rendered relationship against `graph.json`.

## The threshold

**Group past roughly ten rows.** Below that, one flat `.rel-group` labelled `Demonstrates` is
correct and 39 of the 40 design pages stay that way — a corpus page carries about eight rows,
where headings would add structure to something that has none. Grouping is a response to
volume, not a default.

## Grouping rules

- **The `rel-note` says why the pattern is here, in one clause.** It is the only prose the
  block carries, and it is what tells the reader where in this design the pattern shows
  up — the mechanism belongs in `deepdives`, the choice in
  [kb-design-sizing](../kb-design-sizing/SKILL.md).
- **Group by concern in *this* design, not by KB taxonomy.** "Vendor resilience" tells the
  reader where to look; "Distributed · resilience" only repeats the URL the link already goes
  to. The band is one click away; the role in this system is not written down anywhere else.
- **3-6 groups.** Fewer and you have not decomposed the wall; more and each group is a row or
  two, which is the flat list again with extra headings.
- **Every row in exactly one group.** A pattern that genuinely serves two concerns goes in the
  one its `rel-note` argues for.
- **Group names must be findable on the page** — a reader should be able to match each name to
  a stage in `architecture` or a dive in `deepdives`. If a group name names nothing on the
  page, either the grouping is invented or the design is missing the argument.
- **Order the groups to follow the architecture**, so the block reads in the same direction as
  the page above it. Alphabetical order throws away that alignment for nothing.
- Short noun phrases, `&amp;` escaped, no trailing punctuation.

## The maintenance contract

Once a page is grouped, `kb.mjs link` can no longer find a group labelled "Demonstrates", so
it **appends a fresh flat "Demonstrates" group at the end of the section**. This is expected
and visible, not a failure. The follow-up is two steps:

1. Move the new `rel-item` line into the concern group where it belongs.
2. Delete the leftover empty `Demonstrates` group.

Then `make all && make check`. Do it in the same edit as the `link`, or the page ships with a
stray group at the bottom. `unlink` needs no follow-up — it finds the item by `data-kb-to`
wherever it sits.

## Worked example

❌ `persona-identification` before — 20 rows, one label, no way in:

> **Demonstrates**
> Saga · Workflow Orchestration · Circuit Breaker · Retry with Backoff · Timeout / Deadline ·
> Queue-Based Load Leveling · Dead Letter Channel · Idempotency · Outbox · Object Storage ·
> Claim Check · Correlation Identifier · Rate Limiter · Secure Logger · Bulkhead · Inbox ·
> Scatter-Gather · Competing Consumers · KISS · Sweeper

✅ After — the same 20 rows, unchanged, under five concerns that follow the architecture:

> **Orchestration & state** — Saga · Workflow Orchestration · Outbox · Inbox
> **Vendor resilience** — Circuit Breaker · Retry with Backoff · Timeout / Deadline · Bulkhead · Sweeper
> **Queue & delivery** — Queue-Based Load Leveling · Competing Consumers · Dead Letter Channel · Scatter-Gather · Idempotency · Correlation Identifier
> **Payloads & PII** — Object Storage · Claim Check · Secure Logger
> **Tenancy & restraint** — Rate Limiter · Keep It Simple (KISS)

Not one row, note or attribute changed — the graph is byte-identical. The whole edit is the
wrappers, which is what makes it safe to do on a page whose relationships are already correct.

## What this block is not

- **Not a place to argue.** A row records that the design uses the pattern; the mechanism
  is argued in `deepdives` and the choice in [kb-design-sizing](../kb-design-sizing/SKILL.md).
- **Not a bibliography.** Only patterns the design actually puts to work. A pattern mentioned
  once in passing does not earn a row.
- **Not hand-maintainable.** Reconciling what a page links to after an edit is
  `node scripts/kb.mjs refs <id>` and the guidance in
  [kb-edit](../kb-edit/references/reconcile-links.md).

**Legacy note**: the flat single-group shape is the corpus standard and stays valid. This
format is currently applied only to `persona-identification`, the one page over the threshold.
Group another page when its relationship set is being reworked on purpose.

## Self-check

1. Was every row written by `kb.mjs link` — and did the regrouping move the `rel-item` lines
   without editing a single character inside them?
2. Does the page actually clear the threshold? Under ~10 rows, a flat group is the right
   answer.
3. Do the group names name concerns in this design, findable in `architecture` or
   `deepdives` — 3-6 of them, in the page's own order, every row in exactly one?
4. After any `kb.mjs link` on a grouped page: was the appended flat "Demonstrates" group
   drained and deleted?
5. `make all && make check` — `audit-relations` reporting "All rendered relationships match
   the graph" is the check that does the work here. Then
   `node scripts/kb.mjs get <id> --block relationships` to read it back.
