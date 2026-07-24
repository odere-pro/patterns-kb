---
name: style-technical
description: Describe a solution or pattern in precise, high-level technical language for engineers — architecture reviews, ADRs, senior/staff-level discussion. Use when someone asks for "the technical description", "how would you present this to architects", "write this for an ADR", "describe the solution at a high level", or wants the engineer-facing counterpart of a simple explanation.
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

## Structure

Context → decision → consequence, in that order, per decision. Tables for alternatives:

| Option | Guarantee | Cost |
|---|---|---|

For the prose style itself — verdict first, claim+reason, shape limits — this skill
composes with `style-system-design`; that skill governs *how* sentences read, this one
governs *what* a technical description must contain.

## Grounding from the KB

Pattern claims come from the KB, not memory. The blocks that matter at this altitude:

```
node scripts/kb.mjs get <id> --block tradeoffs      # pro/con with stable ids
node scripts/kb.mjs get <id> --block production     # knobs, signals, failure modes
node scripts/kb.mjs related <id>                    # typed neighbours + why they relate
```

Cite stable ids for load-bearing claims
(`patterns/distributed/resilience/circuit-breaker.html#tradeoffs-con-2`). If the KB and
your recollection disagree, the KB wins or the discrepancy gets stated.

## Self-check

1. Are all guarantees stated precisely (delivery, ordering, consistency)?
2. Does every decision carry its cost?
3. Are failure modes named, not implied?
4. Any number that could replace an adjective?
5. Is anything below architecture altitude that doesn't need to be?
