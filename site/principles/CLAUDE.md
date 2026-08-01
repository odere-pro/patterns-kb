# site/principles

**Principles** — 25 design maxims. Not a rung, not a lens, not a pattern: each is a
rule of thumb you check a decision against. They sit at two altitudes, and the hub groups them
that way: **writing the code** (SOLID, DRY, KISS, YAGNI and friends) and **building the system**
(self-healing, redundancy, minimize coordination, scale out and friends). Membership and order
come from `PRINCIPLE_GROUPS` in `scripts/lib/model.mjs` — a page missing from it validates
fine and silently never appears on the hub.

Pages here: build-for-business, composition-over-inheritance, dependency-inversion, design-for-evolution, design-for-operations, dry, fail-fast, failure-mode-analysis, identity-as-perimeter, interface-segregation, kiss, law-of-demeter, least-astonishment, liskov-substitution, managed-services, minimize-coordination, open-closed, partition-around-limits, postels-law, redundancy, scale-out, self-healing, separation-of-concerns, single-responsibility, yagni

Blocks, in order: `description` → `explain` → `rationale` → `applying` → `overreach` → `relationships`.

A principle carries `data-kb-solves` (symptomatic search phrases) like a pattern, and links
into the typed relationship graph — most often it `combines-with` a pattern that embodies it,
or `prevents-hazard` an anti-pattern it guards against. The `overreach` block is mandatory:
every principle has a way of being taken too far, and saying so is what keeps the KB out of
dogma.

Read with `node ../../scripts/kb.mjs get <id>`. See the root CLAUDE.md for the contract.
