# site/themes

**Themes** — 13 guided tours. Not a rung and not a lens: each one answers a single
systems question by walking through the patterns that combine to address it.

Pages here: api-design, auth-and-access, caching, cap-theorem, consistency-and-replication, genai-scale, observability, performance, resilience, scalability, spike-handling, streaming, system-design-interview

Blocks, in order: `framing` → `tradespace` → `tour` → `decide` → `siblings`.

A theme's `tour` block is the **source of truth for theme membership**. Each
`.tour-step` carries `data-kb-member` (which pattern) and `data-kb-role` (its terse role in
*this* narrative — distinct from the step's own prose). The build inverts those onto each
pattern as its "Where it shows up" list, so adding a pattern to a tour is what puts the
theme on the pattern's page. Themes carry no `data-kb-solves`.

Read with `node ../../scripts/kb.mjs get <id>`. See the root CLAUDE.md for the contract.
