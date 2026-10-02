---
name: style-system-design
description: "Apply the system-design writing style — verdict first, claim plus reason, exact terms, precise confidence — to any design document. Use when writing design docs, tradeoff writeups or ADRs, or asked to \"tighten this design doc\" or \"make this decision-ready\". Not for running a whole design (sys-design) or one design-page block (kb-design-*)."
---

# Writing style for system design problems

**Reader:** someone senior who reads to decide, not to learn. They have three minutes.
They know the domain vocabulary. Every rule below serves that reader.

## The rules

- **Verdict first.** Open every section with the conclusion. Support it after. Never
  build up to it. The reader should be able to stop after the first line of any section
  and still have the answer.
- **Claim, then reason — in one sentence.** No claim stands alone. Attach the *because*
  immediately.

  > Postgres as the task queue. Volume is too low to justify a broker.

  Two sentences, one idea. Not a paragraph of setup.
- **Exact terms, plain connective tissue.** Keep the domain word. Outbox, idempotency,
  DLQ, backpressure, RLS, fan-out — these are precise and shorter than their
  explanations. Never soften them into description. Everything around them is plain
  English. Short words. No Latin where Saxon works.

  The [glossary](../../../docs/reference/glossary.md) lists the words banned outright, each
  with the word to write; the vocabulary gate fails them in any markdown prose. Review cuts
  the rest:

  | Cut | Use |
  |---|---|
  | it is worth noting that | nothing: delete it |
  | significant / substantial | the actual figure |
- **Humble means precise about confidence** — not softer language, clearer marking of
  what you know.

  - Say what is sourced and what is inferred
  - Say "unclear" when it is unclear; "I don't know" over a confident guess
  - Where two sources disagree, show both and stop — do not resolve it for the reader
  - No stacked hedges: "may possibly be somewhat" is one hedge doing three jobs badly

  Confidence markers earn their place. Softeners do not.
- **Land it.** Every section closes on a conclusion, including a partial one. An open
  loop is a defect. If something is unresolved, say so explicitly and move on. Do not
  trail off.
- **Recommendations name the reader's situation.** A recommendation describes when
  *they* are in this position, not what the option offers.

  > ✅ Use Postgres as the queue when volume stays under a few thousand jobs a day and you
  > already run Postgres.
  > ❌ Postgres provides transactional enqueue and requires no extra infrastructure.

  Give the inverse too — the conditions under which the recommendation flips. A
  recommendation with no stated inverse is a preference.
- **Emphasis is bold, never italic.** On a KB page that means `<strong>` for a run-in
  label, `<code>` for an identifier, and no `<em>` or `<i>` anywhere — the corpus
  carries none and no stylesheet renders italic. A verdict-first sentence rarely needs
  emphasis at all: the claim is already in first position, which is where the stress
  lands. If you reach for italic contrast, the sentence is carrying two claims and
  wants splitting.

## Shape

| Element | Limit |
|---|---|
| Document opening | 3 lines, decision-ready |
| Sentence | one idea, ~15–20 words |
| Paragraph | 3 sentences |
| Run of prose before a break | ~120 words |
| Bullet nesting | 2 levels |
| Section | fits one screen |

**Tables for anything comparative** — options, trade-offs, before/after. Prose for
reasoning that has a sequence. **Bold the load-bearing phrase**, not the whole sentence;
one per paragraph at most.

**Cut on sight:** intros that restate the heading, transitions ("with that said"),
summaries of what you just wrote, adverb intensifiers, "note that".

## Worked example

**Before**

> Took the lead and explained his process upfront. Clarified functional and non-functional requirements before designing. Identified the multi-sanctions-list concurrency problem himself. Dove to DB request level to demonstrate concurrent task execution guarantees. Named security as the biggest flaw unprompted and proposed a concrete fix.

**After**

> **Passed on unprompted work.** Found the sanctions concurrency problem, named security as the top flaw, proposed the fix — none of it asked for. Went to DB-lock level when pushed.

Verdict moved to the front. Same facts, half the words.

## Write it

1. **Ground every claim about a pattern in the KB, not memory** — the reader will
   check:

   ```
   node scripts/kb.mjs find "<the symptom in the doc's own words>"
   node scripts/kb.mjs get <id> --block tradeoffs
   node scripts/kb.mjs related <id>
   ```

   Cite stable ids (`patterns/distributed/resilience/circuit-breaker.md#tradeoffs-con-2`).
   Never assert a tradeoff from memory when the KB has the page. For finding the right
   pattern, the `kb-find` skill is the full workflow.
2. **Draft verdict-first**, applying the rules above one at a time and holding every
   element to the shape table above.
3. **Tighten it against the worked example**, cutting on sight per the table above.
4. **Run the checks below before shipping** — the last one is the check that does the
   work, so run it twice.

## Done means

- The reader can decide from the first three lines.
- Every claim carries its reason.
- No term is softened where an exact word exists.
- No hedge survives that is not a confidence marker.
- Every section lands on a conclusion; none trail off.
- Every recommendation names the reader's situation, and its inverse.
- Nothing remains that could be deleted with no loss.
