---
name: stack-pick
description: Compose a full technology stack for a task from patterns-kb — decompose the task into needs, find the pattern for each, follow its "Implemented by" edges to the capability and comparison pages, and read the chosen vendor's column (AWS by default, Azure / Google Cloud / open source on request). Use when someone asks to "pick a stack for this", "what AWS services do I need for X", "build this on Azure/GCP", "which managed services should this use", "same stack but open source", or describes a system and wants the concrete services to build it from.
---

# stack-pick — from a task to a vendor's stack

The deliverable is a stack: one row per need, each row a pattern and the service that sells
it, all from ONE vendor — **AWS unless the user names another** (Azure, Google Cloud, or
open source / self-hosted). Grounded in the KB's mapping tables first, certain knowledge
second, fabrication never. The neighbour skill `pattern-tech-map` maps ONE pattern to its
technologies; this one composes a whole stack. Never read `site/**/*.html` directly — every
step below goes through `node scripts/kb.mjs` (~600 tokens per grounded answer).

## The workflow

1. **Decompose the task into needs.** A "task" hides several: where state lives, how
   services talk, what fronts the traffic, who signs the users in, what runs the code.
   List the needs before touching the KB — 3 to 7 is typical. Keep the user's own words
   for each.

2. **Find the pattern for each need.** `node scripts/kb.mjs find "<the need, in their
   words>"` — the `solves` phrases are written as symptoms, so the raw complaint beats a
   paraphrase. Confirm fit with `kb.mjs get <id> --block usage` when the hit is not
   obvious; check "Avoid when".

3. **Follow the pattern to its products.** `node scripts/kb.mjs related <pattern>` and
   read the **Implemented by** entries. A `capability` page (e.g. `messaging`) carries the
   cross-cloud mapping table; a `comparison` page (e.g. `message-brokers`) argues the
   product choice in depth. No "Implemented by" edge means the cloud does not sell this
   pattern — you build it; say so in the row.

4. **Read the vendor's column.** `node scripts/kb.mjs get <capability> --block mapping`
   and take the requested vendor's cell for the row that matches the need. For an
   open-source stack, or when the user asks "which of these products", switch to the
   comparison page: `kb.mjs get <comparison> --block matrix` for the facts and
   `--block choosing` for the verdict logic. The derived page `site/map/stack.html` is the
   reader-facing flat index of the same join — point the user at it.

5. **Answer as a stack table, then a verdict.** Columns: `Need | Pattern | Service | Why`.
   One vendor consistently down the Service column. Always include the **do-less row** —
   the need the user can meet with what they already run (a database table as queue, the
   framework's session auth). Close with 2–3 sentences on the one or two decisions that
   actually shape this stack, citing stable ids
   (`patterns/messaging/message-queue.html#usage`).

## Anti-fabrication

Every service name comes from a KB cell or from knowledge you are certain of. "The KB has
no mapping for this need" is a good row. Never invent a service, a feature, or a price;
never guess a license — the comparison pages carry the verified ones.

## Self-check

1. Can every Service cell be traced to a mapping-table cell, a comparison page, or certain
   knowledge?
2. Is the Service column one vendor top to bottom (with deviations called out explicitly)?
3. Is the do-less option present?
4. Did you cite at least one stable id per pattern picked?
