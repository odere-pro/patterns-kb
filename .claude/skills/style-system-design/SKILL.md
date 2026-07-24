---
name: style-system-design
description: Apply the system-design writing style — verdict-first, claim+reason, exact terms, precise confidence — to any document about a design problem. Use when writing or rewriting design docs, case studies, tradeoff writeups, architecture decisions, interview feedback, or when someone asks to "write this in the system design style", "make this decision-ready", or "tighten this design doc".
---

# Writing style for system design problems

**Reader:** someone senior who reads to decide, not to learn. They have three minutes.
They know the domain vocabulary. Every rule below serves that reader.

## The five rules

### 1. Verdict first

Open every section with the conclusion. Support it after. Never build up to it.
The reader should be able to stop after the first line of any section and still have
the answer.

### 2. Claim, then reason — in one sentence

No claim stands alone. Attach the *because* immediately.

> Postgres as the task queue. Volume is too low to justify a broker.

Two sentences, one idea. Not a paragraph of setup.

### 3. Exact terms, plain connective tissue

Keep the domain word. Outbox, idempotency, DLQ, backpressure, RLS, fan-out — these are
precise and shorter than their explanations. Never soften them into description.
Everything around them is plain English. Short words. No Latin where Saxon works.

| Cut | Use |
|---|---|
| in order to | to |
| utilise / leverage | use |
| it is worth noting that | *(delete)* |
| demonstrates the ability to | can |
| a number of | some, or the number |
| subsequently | then |
| facilitate | let, help |
| significant / substantial | the actual figure |

### 4. Humble means precise about confidence

Not softer language — clearer marking of what you know.

- Say what is sourced and what is inferred
- Say "unclear" when it is unclear; "I don't know" over a confident guess
- Where two sources disagree, show both and stop — do not resolve it for the reader
- No stacked hedges: "may possibly be somewhat" is one hedge doing three jobs badly

Confidence markers earn their place. Softeners do not.

### 5. Land it

Every section closes on a conclusion, including a partial one. An open loop is a defect.
If something is unresolved, say so explicitly and move on. Do not trail off.

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

## Grounding from the KB

When the document makes claims about patterns, verify them against the KB instead of
memory — the reader will check:

```
node scripts/kb.mjs find "<the symptom in the doc's own words>"
node scripts/kb.mjs get <id> --block tradeoffs
node scripts/kb.mjs related <id>
```

Cite stable ids (`patterns/distributed/resilience/circuit-breaker.html#tradeoffs-con-2`).
Never assert a tradeoff from memory when the KB has the page. For finding the right
pattern, the `kb-find` skill is the full workflow.

## Self-check before shipping

1. Can the reader decide from the first three lines?
2. Does every claim carry its reason?
3. Any term softened that had an exact word?
4. Any hedge that is not a confidence marker?
5. Any section that ends without landing?
6. What can be deleted with no loss?

Question 6 is the one that does the work. Run it twice.
