---
name: alt-pick
description: Pick the most compatible alternative to a service or product under the user's real conditions — resolve the named service to a patterns-kb comparison page (product names are aliases), filter its contenders through the stated constraints (managed vs self-hosted, license, team size, existing infra, scale), and return one verdict plus a runner-up. Use when someone asks for an "alternative to Kafka", "open-source replacement for X", "self-hosted version of X", "we can't use X because of the license", "cheaper option than X", or "what should we use instead of X".
---

# alt-pick — the most compatible alternative, under your conditions

The deliverable is a verdict: **one recommendation and one runner-up**, each tied to the
condition that decides it and the cost it carries — not a ranked listicle. Grounded in the
KB's comparison pages (`site/comparisons/`), whose contender licenses and managed offerings
are verified; the neighbour skill `pattern-tech-map` answers "what technology implements
this pattern", this one answers "what replaces this product for me". Never read
`site/**/*.html` directly — everything goes through `node scripts/kb.mjs`.

## The workflow

1. **Resolve the product to its comparison page.** `node scripts/kb.mjs find "<the
   product or the need>"` — contender names (kafka, redis, keycloak…) are aliases on the
   comparison pages, so the bare product name resolves. No comparison page covers it →
   fall back to the pattern's own `wild` block via `pattern-tech-map`, and say the
   comparison is not in the KB.

2. **Collect the conditions before reading the matrix.** The ones that decide these
   choices: managed vs self-hosted, license constraints (copyleft? source-available
   acceptable?), team size and ops capacity, what already runs in the stack, scale and
   growth shape. Take them from the user's message; ask only for the ones that would flip
   the answer, and say which default you assumed for the rest.

3. **Filter, don't rank.** `node scripts/kb.mjs get <id> --block contenders`, then
   `--block matrix`, then `--block choosing`. Strike every contender a condition
   eliminates (a license the user cannot take, an ops burden the team cannot carry) and
   note what struck it. What survives is usually two or three products; `choosing` carries
   the per-condition verdict logic to break the tie.

4. **Verdict first.** The recommendation, the condition that decides it, the cost it
   carries — in the first sentence. Then the runner-up and what would flip to it. Always
   weigh **"keep what you have"**: migration has a price the matrix does not show, and "no
   contender fits better than the incumbent" is a valid, useful answer. Cite stable ids
   (`comparisons/message-brokers.html#matrix-row-3`).

5. **Licenses: the page beats memory.** Redis, Elasticsearch, CockroachDB and ZITADEL all
   relicensed within recent memory. If your recollection and the KB cell disagree, trust
   the cell and flag the disagreement for a fact-check rather than silently "correcting"
   it.

## Self-check

1. Did the conditions actually eliminate contenders, or did you produce a generic ranking?
2. Is every license claim taken from the comparison page?
3. Is a runner-up named, with the condition that would flip to it?
4. Was "keep what you have" weighed?
