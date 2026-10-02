---
name: kb-design-tradeoffs
description: "Write or review the tradeoffs block (\"Limitations & trade-offs\") of a design page: a lead naming the biggest flaw, then \"What it buys\" and \"What it gives up\" lists of at most 7 items. Use when asked to \"write the tradeoffs block\", \"list pros and cons\", \"name the biggest flaw\", or to review it. Not for reviewing the whole page (kb-design-review)."
---

# Writing the Limitations & trade-offs block

**A tradeoff item states what is good or what is bad — it does not argue, justify, or
re-litigate the design.** The arguments already happened in the deep dives and
Right-sizing; this block is the ledger a reader scans in thirty seconds to know what the
design wins and what it accepts. Three parts, in order: a lead that names the biggest
flaw, a "What it buys" column, a "What it gives up" column. (Older pages title them
Strengths / Risks; the polarity facts, pro and con, make them the same thing.)

## The markup

```markdown
## Limitations & trade-offs
<!--meta block=tradeoffs-->

**The biggest flaw, named first: …** One plain sentence on what follows from it.

### What it buys
<!--meta polarity=pro-->

- **Short claim.** One sentence of substance.
- One plain sentence.

### What it gives up
<!--meta polarity=con-->

- **Short claim.** One sentence, at most a pointer (see dive 4).
- One plain sentence.
```

The first items of each list are main points, the rest additional. The block is
hand-written markdown — no `kb.mjs` writer exists for it; the `kb-shape` gate checks
structure ([KB-006](../../../docs/reference/page-rules.md#KB-006),
[KB-007](../../../docs/reference/page-rules.md#KB-007)), not content. **Never hand-write a
`{#id}` on an item** — the build issues `tradeoffs-pro-N` / `tradeoffs-con-N` positionally
from the top-level items under each `polarity` heading. Keep both lists flat: the ids count
top-level items only, so a nested list hides a second claim inside one id.

## The three-part shape

### 1. The lead — the biggest flaw, named first

One paragraph straight under the block heading, two sentences at most. The first sentence
is bold and names the single biggest flaw as a deliberate choice; the second says
what follows from it, plainly. The levels block's top bar points at this sentence
("defends X as the design's biggest flaw"), so the flaw named here and the one named
there must be the same flaw. No history, no defence — the naming *is* the point.

### 2. What it buys

What the design gets, stated as facts it earns by construction — not adjectives.
"The write/publish gap is closed by construction" earns its line; "the design is robust"
does not. A strength that is true only if something else goes right belongs in What it gives up.

### 3. What it gives up

What the design accepts, stated as the bad thing itself. Each item says what breaks,
stalls, or costs — and stops. If a risk was taken deliberately, one clause may say so
("a procurement lever, not an engineering one"); it may not grow a rebuttal.

### Limits — both columns

- **Hard cap: 7 items per column.** Over the cap means merge or cut; merge into the item
  saying the same kind of thing (two region risks are one region risk).
- **3–4 main points, first.** A main point opens with a short bold claim — a
  sentence fragment of a few words — then one plain sentence. Everything after the main
  points is additional: one plain sentence, no bold.
- **Order is the hierarchy.** Main points first, biggest first. Ids are positional, so
  reordering re-points every existing `…#tradeoffs-con-N` citation and every textual
  "(con N)" reference on the page — reorder deliberately and re-check both.

## Wording rules

- **A limit item is bold claim + fact.** It names what the design wins or accepts and
  stops there. It does not advise the reader and does not give the reason behind the
  choice — a ledger records decisions, and the reasoning it records already happened in
  the deep dives and Right-sizing.
- **State it, don't defend it.** One sentence per item. A risk followed by three
  mitigations is an essay, and the block stops being scannable.
- **The bold claim is the only emphasis.** `**bold**` opens the item, backticks name an
  identifier, and that is the whole inline vocabulary — no `*italic*`, no `_italic_`. The
  corpus carries none, so an italic run reads as a second emphasis level that does not exist.
- **The claim opens the item, and it is the only bold run in it.** A reader scans a column
  by its bold openers, so an item that buries the claim mid-sentence drops out of the scan —
  which is the point. Never bold a second run inside the item: a bold claim per line only
  ranks the list while there is exactly one per item.
- **Mitigations are pointers, not paragraphs.** At most a parenthetical — `(see dive 4)`,
  "named in Right-sizing" — the argument lives where the pointer aims. Verify every
  pointer against the actual dive numbering before writing it.
- **Use plain words.** Say handled, covered, kept in check. No coined verbs, no
  "blunted", no "Blunt it:" — if a word needs the page to define it, it doesn't belong.
- **No repeated openers.** Every item carrying the same prefix ("It risks…", "Blunt
  it:…") is a template showing through; vary the sentence, keep the shape.

## Worked example

> ❌ *The sanctions collector is a join that can hang if a leg dies silently. Blunt it:
> per-leg deadlines, sweeper escalation on overdue legs, and a collector that
> transitions only on the full set — a hang is bounded by the SLA, then surfaced,
> never indefinite.*

> ✅ *The sanctions collector can hang on a silently dead leg until the sweeper
> escalates it (see dive 3).*

The first re-argues deep dive 3 inside a list item; the second states the risk and
points at the argument.

## Consistency with the rest of the page

The lead's flaw must be the flaw the levels block's top bar defends. Every `(see dive N)`
must point at a real, correctly numbered dive ([kb-design-architecture](../kb-design-architecture/SKILL.md));
every "named in Right-sizing" exit must exist there ([kb-design-sizing](../kb-design-sizing/SKILL.md)).
What it gives up trades against the NFRs ([kb-design-requirements](../kb-design-requirements/SKILL.md)) —
a risk that maps to no requirement usually means the requirement is missing, not the risk.
On disagreement, the upstream blocks win: fix this block, and report a real upstream
mismatch rather than silently editing it from here.

## What this block is not

- **Not a mitigation catalogue.** How each risk is handled is the deep dives' job; here a
  mitigation is at most a pointer.
- **Not a requirements restatement.** "Meets the residency requirement" is not a
  strength; what the design earns *by construction* is.
- **Not a sales pitch.** The columns carry equal weight — a "What it gives up" column shorter and
  vaguer than "What it buys" reads as advertising, and the reader notices.

**Older pages**: five pages still title the columns `Strengths` / `Risks`. They carry the same
`polarity` facts (pro / con), so the two names are one shape. Write new and reworked blocks
with `What it buys` / `What it gives up`; rename an older page only when its block is being
reworked on purpose, not as a side effect of a small edit.

## Done means

- The scan test passes: after 30 seconds a reader can name the biggest flaw, the three
  things the design wins, and the three things it accepts, with no item needing re-reading.
- The lead is ≤2 sentences, and its flaw is the one the levels block defends.
- Each column holds ≤7 flat items — 3–4 bold-led main points first, plain one-liners
  after — with no hand-written `{#id}` on an item.
- Every item is one sentence stating a fact, with any mitigation at most a pointer
  that resolves to a real dive or Right-sizing exit.
- Any reorder or merge left `#tradeoffs-con-N` anchors and textual "(con N)"
  references on the page re-checked.
- `make gen && make validate` pass, and `node scripts/kb.mjs get <id> --block tradeoffs`
  scans as: lead, WHAT IT BUYS (bold claims first), WHAT IT GIVES UP (bold claims first).
