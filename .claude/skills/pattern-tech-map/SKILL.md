---
name: pattern-tech-map
description: "Map one design pattern to the technologies that implement it, with why each fits, its tradeoffs and risks. Use when someone asks \"what technology implements X\", \"which tool for the outbox pattern\", \"map this pattern to real tech\" or \"what would I run in production\". Not for a whole stack (stack-pick) or one product's replacement (alt-pick)."
---

# Mapping a pattern to technology

The deliverable is a decision aid: which real technologies embody the pattern, why each
fits, and what each costs to run. Grounded in the KB first, general knowledge second,
fabrication never.

## The workflow

1. **Resolve the pattern.** If they named it, `get` it. If they described a symptom,
   find it — and check `related`, because a `combines-with` neighbour often changes the
   technology choice (circuit breaker alone points at a library; combined with bulkhead it
   points at a proxy/mesh).

   ```
   node scripts/kb.mjs find "<their words>"
   node scripts/kb.mjs get <id> --block usage
   node scripts/kb.mjs related <id>
   ```

2. **Start from KB ground truth.** Two blocks are pre-vetted for exactly this job:

   ```
   node scripts/kb.mjs get <id> --block wild          # real, verified implementations
   node scripts/kb.mjs get <id> --block production    # knobs, signals, failure modes
   ```

   The `wild` block is the seed list of technologies; the `production` block's failure
   modes and tuning knobs are the raw material for the Risks column.

3. **Extend beyond the KB only with certainty.** Same anti-fabrication standard as the
   KB's "In the wild" rule ([markdown-authoring.md](../../rules/markdown-authoring.md)): include a
   technology only if you are confident it exists *and* genuinely implements the pattern.
   Never attribute a feature to a product unless you are sure that product has it —
   feature-specific claims are the ones that turn out wrong. **If in doubt, leave it out.**
   Three true rows beat five rows with one lie.

4. **Output shape.** A table, then short prose on the decisive factors:

   | Technology | Why it fits | Tradeoffs | Risks |
   |---|---|---|---|

   - **Always include the simpler-primitive row when honest** — "Postgres as the queue;
     volume too low to justify a broker" is often the right answer, and omitting it makes
     the table a sales sheet.
   - The closing prose names what actually decides it: scale, team familiarity, what is
     already in the stack. One paragraph, verdict first.

5. **Risks are operational, not generic.** "Vendor lock-in" alone says nothing. Say what
   breaks under load, what it costs to run (another stateful thing to tune, thresholds that
   flap), and what the migration out looks like. Pull these from the `production` block's
   failure modes where the KB has them; cite the stable id.

## Done means

- Every technology row names something you are certain exists and genuinely implements
  the pattern, and attributes no feature you are not sure of.
- The table includes the do-less / simpler-primitive row when honest.
- Risks are specific to running this tech for this pattern, not boilerplate
  ("vendor lock-in").
- `related` was checked, and a combining pattern's effect on the recommendation was
  considered.
