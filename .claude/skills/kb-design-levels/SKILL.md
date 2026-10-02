---
name: kb-design-levels
description: "Write or review the levels block (\"What's expected at each level\") of a design page: one section per seniority level, each a short list of demonstrable behaviours. Use when asked to \"write the levels block\", \"what's expected at each level\", \"add a staff-level bar\", or to review it. Not for the Explained block (kb-explain)."
---

# Writing the What's expected at each level block

**The block is a rubric, not a paragraph.** A reader who has just worked the problem must be
able to run down it and check themselves off, line by line, and land on a level. A single
sentence of semicolon-joined clauses cannot be checked off — it can only be read and agreed
with, which is not the same thing. One section per level, each a short list of behaviours
that are visibly present or visibly absent.

## The markup

```markdown
## What's expected at each level
<!--meta block=levels-->

### Mid-level

- One demonstrable behaviour.
- …

### Senior

- …

### Staff+

- …
```

The heading is fixed at **"What's expected at each level"**. Each level is a `###` with a
plain list under it — the same shape the `deepdives` block already uses, so nothing new is
styled: the level names take heading rank 3 and read at the same weight as a dive title. A level
name takes no subline — it is one word, and there is no qualifier to carry. The block is
hand-written markdown; no `kb.mjs` writer exists for it, and the `kb-shape` gate checks
only that the block sits in block order ([KB-003](../../../docs/reference/page-rules.md#KB-003))
— never its internal structure. The discipline below is this skill's job, not the build's.

`levels` is optional ([content-model.json](../../../docs/data/content-model.json) marks it so
for the design kind). Omit it rather than fill it with generic advice.

## 1. Pick the level triple

Pick by the page's own tag, not by taste:

| page tag | levels |
|---|---|
| `system-design` | **Mid-level** → **Senior** → **Staff+** |
| `low-level-design` | **Junior** → **Mid-level** → **Senior** |

An LLD kata has no staff-level bar to describe — the design is one class diagram deep — so
it starts a rung lower. Three levels always; never two, never four.

## 2. Write the bullets

Third person binds the **rubric bullets only** — they describe a candidate's behaviour,
which is why they read "Separates operation state…" rather than "you separate…". Every
other block on the page addresses the reader directly, and so does this skill's own
advisory prose; do not carry third person out of the list items.

- **Verb-first, third person, one line.** "Separates operation state from business state
  unprompted" — not "should be able to separate…". The reader is matching against a
  behaviour, so lead with the behaviour.
- **No italics.** `**bold**` for a level label, backticks for an identifier, nothing else —
  the corpus carries no `*italic*` or `_italic_`. A behaviour worth stressing is
  one to state more plainly, not to slant.
- **One demonstrable thing per bullet.** If a bullet contains a semicolon, it is two bullets.
  This is the single edit that turns the legacy shape into this one.
- **3-5 bullets per level.** Past five you are transcribing the page; below three you have
  not said enough to separate the level from the one under it.
- **Cumulative-delta.** A level lists only what is *new* at that level. Never restate a lower
  level's bullets — the reader is assumed to have read upward.
- **Every bullet must trace to something already on the page** — a deep dive, an NFR, a
  tradeoff, a sizing verdict. A bullet that could appear on any design page is noise: "asks
  clarifying questions", "considers scalability", "thinks about edge cases". Cut them.
- **Unprompted is the currency.** The difference between levels is usually *who raises it*,
  not *who can discuss it*. Say "unprompted" and "when prompted" where they discriminate.

## 3. Give the top level its two duties

The highest level on the page (Staff+, or Senior on an LLD kata) must include both of:

- **Naming the design's biggest flaw as a chosen trade** — the same flaw the `tradeoffs`
  block leads with. Recognising the cost and defending the choice is the bar.
- **Pricing the deferred exits against their triggers** — the ones `sizing` deferred, by
  name and by threshold, not "would scale it later".

If the page has no named flaw and no deferred exits, the fault is upstream in `tradeoffs` or
`sizing` — fix it there, don't invent one here.

## Worked example

❌ The legacy shape — one list item, five clauses, nothing checkable:

> **Staff+** — answers the duplicate-that-arrives-first trap (sender-keyed inbox, same
> transaction as the effect); names where breaker state lives and what updates the fallback
> weights, mechanisms included; states the CAP position and where the one eventually-consistent
> surface is; prices the broker and engine exits against real thresholds — and defends the
> single-writer Postgres as the biggest flaw, chosen.

✅ The same content as a rubric:

> **Staff+**
> - Answers the duplicate-that-arrives-first trap: a sender-keyed inbox row in the same transaction as the effect.
> - Names where breaker state lives and what moves the fallback weights — the mechanism, not just the intent.
> - States the CAP position and points at the one eventually-consistent surface.
> - Prices the broker and workflow-engine exits against the triggers set in Right-sizing.
> - Defends the single-writer Postgres as the design's biggest flaw, chosen deliberately.

Nothing was added and nothing was cut — the semicolons became line breaks. That is the whole
migration, and it is why it never needs a rewrite of the argument.

## 4. Point every bullet at the block that backs it

Levels is the **last block that makes a claim**, and it claims about the rest of the page.
Every bullet should be answerable by pointing at a block above it: the sequencing bullet at
`requirements`, the exits bullet at [kb-design-sizing](../kb-design-sizing/SKILL.md), the
flaw bullet at `tradeoffs`, the mechanism bullets at `deepdives`. If a bullet has nowhere to
point, either the page is missing an argument or the bullet is filler — decide which, and fix
the right one.

## What this block is not

- **Not an interview rubric in general.** It grades *this* problem. Generic competency
  language belongs nowhere in the KB.
- **Not a summary.** It names what a person does, not what the system does.
- **Not a scoring scheme.** No points, no percentages, no "must hit 4 of 5".

**Legacy note**: the corpus shape for this block is a single list of three
`- **Level** — one long sentence` items. That shape stays valid; this format is
currently applied only to `persona-identification`. Migrate another page when its levels block
is being reworked on purpose — not as a side effect of a small edit.

## Done means

- A reader can run down the block and check themselves off — no semicolon chain
  stands in for a bullet.
- Every bullet names one behaviour, verb-first, in one line — 3-5 per level.
- Each level lists only what is new at that level, with no restatement from below.
- Every bullet points at the block that backs it, and the top level names the
  biggest flaw and prices the deferred exits.
- `make gen && make validate` pass, and `node scripts/kb.mjs get <id> --block levels`
  renders as three headed lists, each line standing on its own.
