# site/hazards

**Anti-patterns** — 33 of them. Not to practise, only to recognise on sight.
Every one is what the patterns elsewhere exist to prevent.

Pages here: anemic-domain-model, big-ball-of-mud, boat-anchor, busy-database, busy-front-end, cache-stampede, cascading-failure, chatty-io, connection-pool-exhaustion, deadlock, distributed-monolith, dual-write-inconsistency, extraneous-fetching, god-object, golden-hammer, host-header-rewriting, hot-key, hot-partition, improper-instantiation, monolithic-persistence, n-plus-1-query, no-caching, noisy-neighbour, race-condition, resource-leak, retry-storm, spaghetti-code, split-brain, stale-cache, starvation, synchronous-io, thundering-herd, unbounded-queue

Blocks, in order: `description` → `explain` → `causes` → `cost` → `mitigation` → `relationships`.
Hazards carry `data-kb-solves`, but pointing the other way: the phrases are what the
sufferer *observes* ("we restart the service every night to keep it healthy"), and the page
they reach names the problem rather than fixing it. Keep them out of the `essence`, which
stays the terse definition. No "In the wild" block. They relate to patterns through
`mitigated-by`, whose inverse `prevents-hazard` must be declared on the pattern's page too.

Read with `node ../../scripts/kb.mjs get <id>`. See the root CLAUDE.md for the contract.
