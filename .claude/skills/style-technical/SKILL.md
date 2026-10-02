---
name: style-technical
description: "Describe a solution or pattern in precise, high-level technical language for engineers — architecture reviews, ADRs, staff-level discussion. Use when asked for \"the technical description\", \"present this to architects\", \"write this for an ADR\" or \"describe the solution at a high level\". Not for a reader outside the domain (style-simple)."
---

# Technical high-level language

**Reader:** engineers fluent in the vocabulary. Do not define standard terms —
idempotency, backpressure, quorum, fencing token. Using them exactly *is* the
compression. High-level means architecture altitude, not vagueness.

## The rules

- **Name the mechanism, its invariants, and its failure modes.** A description that
  omits how the thing fails is marketing, not engineering. "The outbox table makes the
  write and the publish atomic; the relay is at-least-once, so consumers must be
  idempotent" — mechanism, invariant, consequence in two sentences.
- **State guarantees precisely.** At-least-once vs exactly-once, linearizable vs
  eventual, per-key vs total ordering. If the design only holds under an assumption
  (single writer, bounded clock skew), name the assumption.
- **Quantify where possible, and mark estimates as estimates.** p99, QPS, fan-out
  factor, retention. "~10k writes/s, back-of-envelope" beats "high throughput".
- **Every design statement carries its constraint or tradeoff.** "Chose X" alone is
  incomplete; "Chose X, which costs Y" is a decision someone can review.
- **Stay at the architecture level.** Components, contracts, data flow, consistency
  boundaries. No code unless an interface contract is itself the point.
- **Motivate a mechanism with its failure branches.** Not "the system must stay
  consistent" but the branches: "if the write commits and the publish fails, consumers
  never see the change; if the publish lands and the write rolls back, consumers act on
  data that does not exist."
- **Write operational caveats as bold label, directive, reason — one line each.**
  "**Ordering**: publish in commit order, because out-of-order events break
  point-in-time replay." A caveat that names no action is trivia.
- **Emphasis is bold, never italic.** On a KB page that means `<strong>` for the label,
  `<code>` for an identifier, and no `<em>`/`<i>` anywhere — the corpus carries none and
  no stylesheet renders italic. Contrast you would have italicised is a sentence to split.

## Structure

Context → decision → consequence, in that order, per decision. Tables for alternatives:

| Option | Guarantee | Cost |
|---|---|---|

For the prose style itself — verdict first, claim+reason, shape limits — this skill
composes with `style-system-design`; that skill governs *how* sentences read, this one
governs *what* a technical description must contain.

## Write it

1. **Ground every claim in the KB, not memory** — pattern claims come from the KB. The
   blocks that matter at this altitude:

   ```
   node scripts/kb.mjs get <id> --block tradeoffs      # pro/con with stable ids
   node scripts/kb.mjs get <id> --block production     # knobs, signals, failure modes
   node scripts/kb.mjs related <id>                    # typed neighbours + why they relate
   ```

   Cite stable ids for load-bearing claims
   (`patterns/distributed/resilience/circuit-breaker.md#tradeoffs-con-2`). If the KB and
   your recollection disagree, the KB wins or the discrepancy gets stated.
2. **Draft context → decision → consequence, per decision**, with a table for the
   alternatives, as the structure above sets out.

## Done means

- Every guarantee is stated precisely (delivery, ordering, consistency).
- Every decision carries its cost.
- Failure modes are named, not implied.
- No adjective stands where a number could replace it.
- Nothing sits below architecture altitude without a reason to.
