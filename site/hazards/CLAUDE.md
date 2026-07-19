# site/hazards

**Anti-patterns** — 13 of them. Not to practise, only to recognise on sight.
Every one is what the patterns elsewhere exist to prevent.

Pages here: anemic-domain-model, big-ball-of-mud, boat-anchor, cache-stampede, deadlock, god-object, golden-hammer, hot-key, race-condition, resource-leak, spaghetti-code, stale-cache, unbounded-queue

Blocks, in order: `description` → `causes` → `cost` → `mitigation`.
Hazards carry no `data-kb-solves` — a hazard solves nothing, it *is* the problem — and no
"In the wild" block. They relate to patterns through `mitigated-by`, whose inverse
`prevents-hazard` must be declared on the pattern's page too.

Read with `node ../../scripts/kb.mjs get <id>`. See the root CLAUDE.md for the contract.
