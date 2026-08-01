# site/themes

**Themes** — 42 guided tours. Not a rung and not a lens: each one answers a single
systems question by walking through the patterns that combine to address it.

Pages here: api-design, architecture-styles, auth-and-access, bot-detection, caching, cap-theorem, cloud-native, consistency-and-replication, continuous-delivery, continuous-validation, data-platform, dealing-with-contention, event-modeling, event-storming, frontend-architecture, genai-scale, global-traffic-and-ingress, harmful-content, harness-engineering, health-modeling, long-running-tasks, microservices-design, ml-system-design, multi-step-processes, observability, operating-a-live-system, performance, proximity-search, realtime-updates, resilience, scalability, scale-units-and-stamps, scaling-reads, scaling-writes, securing-availability, service-boundaries, spike-handling, streaming, system-design-interview, twelve-factor, video-recommendations, workload-composition

Blocks, in order: `description` → `explain` → `architecture` → `tradespace` → `tour` → `decide` → `siblings` → `relationships`.

A theme's `tour` block is the **source of truth for theme membership**. Each
`.tour-step` carries `data-kb-member` (which pattern) and `data-kb-role` (its terse role in
*this* narrative — distinct from the step's own prose). The build inverts those onto each
pattern as its "Where it shows up" list, so adding a pattern to a tour is what puts the
theme on the pattern's page. Themes carry no `data-kb-solves`.

Read with `node ../../scripts/kb.mjs get <id>`. See the root CLAUDE.md for the contract.
