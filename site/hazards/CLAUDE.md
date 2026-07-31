# site/hazards

**Anti-patterns** — 22 of them. Not to practise, only to recognise on sight.
Every one is what the patterns elsewhere exist to prevent.

Pages here: anemic-domain-model, big-ball-of-mud, boat-anchor, cache-stampede, cascading-failure, connection-pool-exhaustion, deadlock, dual-write-inconsistency, god-object, golden-hammer, hot-key, hot-partition, n-plus-1-query, noisy-neighbour, race-condition, resource-leak, retry-storm, spaghetti-code, split-brain, stale-cache, thundering-herd, unbounded-queue

Blocks, in order: `description` → `explain` → `causes` → `cost` → `mitigation` → `relationships`.
Hazards carry no `data-kb-solves` — a hazard solves nothing, it *is* the problem — and no
"In the wild" block. They relate to patterns through `mitigated-by`, whose inverse
`prevents-hazard` must be declared on the pattern's page too.

Read with `node ../../scripts/kb.mjs get <id>`. See the root CLAUDE.md for the contract.
