---
name: pattern-tech-map
description: Map a software design pattern to the concrete technologies that implement it, with why each fits, its tradeoffs, and its operational risks. Use when someone asks "what technology implements X", "which tool/library should I use for the outbox pattern", "map this pattern to real tech", "what would I actually run in production for this", or gives a symptom and wants a technology recommendation.
---

# Mapping a pattern to technology

The deliverable is a decision aid: which real technologies embody the pattern, why each
fits, and what each costs to run. Grounded in the KB first, general knowledge second,
fabrication never.

## The workflow

**1. Resolve the pattern.** If they named it, `get` it. If they described a symptom,
find it — and check `related`, because a `combines-with` neighbour often changes the
technology choice (circuit breaker alone points at a library; combined with bulkhead it
points at a proxy/mesh).

```
node scripts/kb.mjs find "<their words>"
node scripts/kb.mjs get <id> --block usage
node scripts/kb.mjs related <id>
```

**2. Start from KB ground truth.** Two blocks are pre-vetted for exactly this job:

```
node scripts/kb.mjs get <id> --block wild          # real, verified implementations
node scripts/kb.mjs get <id> --block production    # knobs, signals, failure modes
```

The `wild` block is the seed list of technologies; the `production` block's failure
modes and tuning knobs are the raw material for the Risks column.

**3. Extend beyond the KB only with certainty.** Same anti-fabrication standard as the
KB's "In the wild" rule ([html5-authoring.md](../../rules/html5-authoring.md)): include a
technology only if you are confident it exists *and* genuinely implements the pattern.
Never attribute a feature to a product unless you are sure that product has it —
feature-specific claims are the ones that turn out wrong. **If in doubt, leave it out.**
Three true rows beat five rows with one lie.

**4. Output shape.** A table, then short prose on the decisive factors:

| Technology | Why it fits | Tradeoffs | Risks |
|---|---|---|---|

- **Always include the simpler-primitive row when honest** — "Postgres as the queue;
  volume too low to justify a broker" is often the right answer, and omitting it makes
  the table a sales sheet.
- The closing prose names what actually decides it: scale, team familiarity, what is
  already in the stack. One paragraph, verdict first.

**5. Risks are operational, not generic.** "Vendor lock-in" alone says nothing. Say what
breaks under load, what it costs to run (another stateful thing to tune, thresholds that
flap), and what the migration out looks like. Pull these from the `production` block's
failure modes where the KB has them; cite the stable id.

## Self-check

1. Is every technology row something you are certain exists and does this?
2. Does the table include the do-less option?
3. Are risks specific to running this tech for this pattern, not boilerplate?
4. Did `related` get checked — would a combining pattern change the recommendation?
