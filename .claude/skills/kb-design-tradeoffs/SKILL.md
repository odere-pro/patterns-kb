---
name: kb-design-tradeoffs
description: Write or review the tradeoffs block ("Limitations & trade-offs") of a patterns-kb design page — a one-two sentence lead naming the biggest flaw, then a Strengths column and a Risks column, each a flat list of at most 7 items with 3–4 bold-led main points first. Use when someone asks to "write the tradeoffs block", "list the pros and cons", "rewrite strengths and risks", "name the biggest flaw", or says the tradeoffs read as over-explained essays instead of a scannable ledger. Also use to review, evaluate, critique, audit or grade an existing tradeoffs block, including when the ask names it by file path or URL fragment (`…/<page>.html#tradeoffs`).
---

# Writing the Limitations & trade-offs block

**A tradeoff item states what is good or what is bad — it does not argue, justify, or
re-litigate the design.** The arguments already happened in the deep dives and
Right-sizing; this block is the ledger a reader scans in thirty seconds to know what the
design wins and what it accepts. Three parts, in order: a lead that names the biggest
flaw, a Strengths column, a Risks column.

## The markup

```html
<section class="doc-section" id="tradeoffs" aria-labelledby="h-trade" data-kb-block="tradeoffs">
  <h2 class="doc-h" id="h-trade">Limitations &amp; trade-offs</h2>
  <div class="prose">
    <p><strong>The biggest flaw, named first: …</strong> One plain sentence on what follows from it.</p>
  </div>
  <div class="tradeoffs">
    <div class="col pros">
      <h3>Strengths</h3>
      <ul>
        <li><strong>Short claim.</strong> One sentence of substance.</li>   <!-- main -->
        <li>One plain sentence.</li>                                       <!-- additional -->
      </ul>
    </div>
    <div class="col cons">
      <h3>Risks</h3>
      <ul>
        <li><strong>Short claim.</strong> One sentence, at most a pointer (see dive 4).</li>
        <li>One plain sentence.</li>
      </ul>
    </div>
  </div>
</section>
```

The block is hand-edited HTML — no `kb.mjs` writer exists for it; the PostToolUse hook
checks structure, not content. **Never hand-write `id` or `data-kb-polarity` on the
`<li>`s** — `make all` stamps `tradeoffs-pro-N` / `tradeoffs-con-N` positionally. Keep
both lists flat: a nested `<li>` would be stamped too and renumber the sequence.

## The three-part shape

### 1. The lead — the biggest flaw, named first

One `<div class="prose">` with a single `<p>`, two sentences at most. The first sentence
is `<strong>` and names the single biggest flaw as a deliberate choice; the second says
what follows from it, plainly. The levels block's top bar points at this sentence
("defends X as the design's biggest flaw"), so the flaw named here and the one named
there must be the same flaw. No history, no defence — the naming *is* the point.

### 2. Strengths

What the design gets, stated as facts it earns by construction — not adjectives.
"The write/publish gap is closed by construction" earns its line; "the design is robust"
does not. A strength that is true only if something else goes right belongs in Risks.

### 3. Risks

What the design accepts, stated as the bad thing itself. Each item says what breaks,
stalls, or costs — and stops. If a risk was taken deliberately, one clause may say so
("a procurement lever, not an engineering one"); it may not grow a rebuttal.

### Limits — both columns

- **Hard cap: 7 items per column.** Over the cap means merge or cut; merge into the item
  saying the same kind of thing (two region risks are one region risk).
- **3–4 main points, first.** A main point opens with a short `<strong>` claim — a
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
- **The bold claim is the only emphasis.** `<strong>` opens the item, `<code>` names an
  identifier, and that is the whole inline vocabulary — no `<em>`, no `<i>`. The corpus
  carries none and no stylesheet renders italic, so an italic run reads as a second
  emphasis level that does not exist.
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
Risks trade against the NFRs ([kb-design-requirements](../kb-design-requirements/SKILL.md)) —
a risk that maps to no requirement usually means the requirement is missing, not the risk.
On disagreement, the upstream blocks win: fix this block, and report a real upstream
mismatch rather than silently editing it from here.

## What this block is not

- **Not a mitigation catalogue.** How each risk is handled is the deep dives' job; here a
  mitigation is at most a pointer.
- **Not a requirements restatement.** "Meets the residency requirement" is not a
  strength; what the design earns *by construction* is.
- **Not a sales pitch.** The columns carry equal weight — a Risks column shorter and
  vaguer than Strengths reads as advertising, and the reader notices.

**Legacy note**: the standard corpus shape for this block is `What it buys` / `What it
gives up` with 3–4 plain items per column. That shape stays valid; the Strengths/Risks
format is currently applied only to `persona-identification`. Migrate another page to it
only when its tradeoffs block is being reworked on purpose — not as a side effect of a
small edit.

## Self-check

1. Scan test: after 30 seconds, can a reader name the biggest flaw, the three things the
   design wins, and the three things it accepts? If any item needs re-reading, it fails.
2. Is the lead ≤2 sentences, and is its flaw the one the levels block defends?
3. Does each column hold ≤7 flat items — 3–4 bold-led main points first, plain one-liners
   after — with no hand-written `id`/`data-kb-polarity`?
4. Is every item one sentence stating a fact, with mitigation as at most a pointer that
   resolves to a real dive or Right-sizing exit?
5. Did any reorder or merge happen — and if so, were `#tradeoffs-con-N` anchors and
   textual "(con N)" references on the page re-checked?
6. `make all && make check`, then `node scripts/kb.mjs get <id> --block tradeoffs` — the
   output should scan as: lead, STRENGTHS (bold claims first), RISKS (bold claims first).
