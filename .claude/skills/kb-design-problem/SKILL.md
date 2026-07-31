---
name: kb-design-problem
description: Write or review the "Understanding the problem" block of a patterns-kb design page — the interview that turns an underspecified task statement into requirements. Use when someone asks to "write the problem section", "frame the problem", "do the requirements interview", "add clarifying questions to a design", or says a design's problem block rambles or doesn't connect to its requirements.
---

# Writing "Understanding the problem"

**The problem block is an interview, not an introduction.** Its job is to turn an
underspecified task statement into the requirements block that follows — every sentence
in it must land somewhere: in an FR, an NFR, or an explicit out-of-scope entry.

## The markup

```html
<section class="doc-section" id="problem" aria-labelledby="h-problem" data-kb-block="problem">
  <h2 class="doc-h" id="h-problem">Understanding the problem</h2>
  <div class="prose"> … </div>
</section>
```

The heading text is always **"Understanding the problem"**. The block is hand-edited
HTML; the PostToolUse hook checks structure, not content.

## Two forms — pick by how specified the task is

**Light form** — one dense paragraph (the corpus default, used by most designs). Use it
when the task statement already carries its numbers and boundaries, and the paragraph
only has to restate the ask, name the load-bearing constraint, and set the stakes.

**Interview form** — a numbered Q&A (see `persona-identification`). Use it when the task
statement is underspecified — no volumes, no jurisdictions, no data rules — and the
design's shape depends on answers nobody gave. The questions *are* the work: they show
what a strong candidate asks before drawing boxes.

The light form's paragraph is dense because it is compressed, not because it is run-on:
three or four sentences, one concept each, opening with the ask rather than with
scene-setting or history. Address the reader in second person, and let every claim carry
its consequence — the constraint, then what it costs the design.

## The interview form contract

Open with one framing paragraph: what the task states, what it omits, and the promise
that each answer lands in a requirement below. Then one `<p>` per question:

```html
<p><strong>Q1 — How many flows a week?</strong><br>
Assumed, not given: ~100 a week, with headroom designed to 10k.
Confirm this first: every capacity decision below is priced against it.
→ NFR: scale.</p>
```

- **Question stem** in `<strong>`, numbered `Qn — …?`, followed by `<br>`.
- **Answer in 1–2 sentences.** A question whose answer needs more is two questions.
  When the answer is genuinely a list (what data is held, what is deliberately not
  built), a short `<ul>` may follow the question `<p>`, with the routing tag in its own
  closing `<p>`.
- **Mark invented numbers** with `Assumed, not given:` — an assumption stated
  as fact is a lie the reader can't audit.
- **End with exactly one routing tag**: `→ FR: label.`, `→ NFR: label.`, or
  `→ Out of scope.` (combinations join with `;`).
  The label is informal but must match a requirement the reader can find.
- **Mark unresolved questions** with `(open)` in the stem and say who owes the
  answer. An honest open question beats a fabricated answer.
- **No italics.** The arrow and the colon carry the routing tag; `<em>` on top of them is
  noise. `<strong>` on the question stem is fine — the no-formatting rule binds the
  requirements block, not this one.
- **It reads as a crisp Q&A, not an essay.** Question, answer, tag — nothing connective
  between entries, because prose that bridges two questions is prose the reader has to
  parse before finding the next one. Anything that is not a question or its answer
  belongs in the framing paragraph.

Good interview questions probe: volume and growth, one-shot vs ongoing obligation, what
data is held and under which rules, store vs pass through, push vs pull for results,
residency and failover, and what is deliberately not built. Ask what changes the design's
shape; skip what doesn't.

## The bidirectional trace rule

- Every question routes to at least one FR, NFR, or out-of-scope entry.
- Every FR and NFR traces back to a question or to the task statement itself.
- No orphan answers, no unsourced requirements. If an answer routes nowhere, either the
  requirements block is missing an item or the question wasn't worth asking.

The requirements side of this contract lives in
[kb-design-requirements](../kb-design-requirements/SKILL.md) — apply the two skills
together when writing a page.

## Self-check

1. Does the framing paragraph say what the task omits and promise where answers land?
2. Is every answer 1–2 sentences (or a short list) with exactly one routing tag?
3. Is every invented number marked "Assumed, not given", every unresolved question
   "(open)" — and is all of it plain text, with no `<em>` anywhere in the block?
4. Walk the trace both ways — every tag resolves to a requirement, every requirement has
   a source. This is the check that does the work.
5. `make all && make check`, then `node scripts/kb.mjs get <id> --block problem` — the
   reader output should read as a crisp Q&A, not an essay.
