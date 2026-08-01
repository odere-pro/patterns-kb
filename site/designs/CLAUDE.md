# site/designs

**Case studies** — 41 worked designs (the `design` kind). Each breaks one real
system down the way a strong interview answer would, and `demonstrates` the patterns it uses.

Pages here: ad-click-aggregator, amazon-locker, bitly, bookmyshow, camelcamelcamel, chatgpt, connect-four, design-distributed-cache, design-rate-limiter, distributed-rate-limiter, dropbox, elevator, fb-live-comments, fb-news-feed, fb-post-search, file-system, google-docs, google-news, gopuff, instagram, inventory-management, job-scheduler, leetcode, logging-service, metrics-monitoring, online-auction, online-chess, parking-lot, payment-system, persona-identification, persona-identification-v2, robinhood, strava, ticketmaster, tinder, top-k, uber, web-crawler, whatsapp, yelp, youtube

Blocks, in order: `description` → `explain` → `requirements` → `sizing` → `entities` → `interface` → `architecture` → `deepdives` → `tradeoffs` → `levels` → `relationships`.
Optional: `sizing`, `interface`, `levels`, `explain` — a low-level-design kata may skip
the first two. `levels` is the interviewer rubric (Mid/Senior/Staff expectations);
`explain` is the three-level reading ladder (basic/advanced/expert) — they are different
blocks and both may exist.

The `architecture` block carries the primary mermaid diagram (a `flowchart` for a distributed
design, a `classDiagram` for a low-level one). A design links to the patterns it uses through the
typed `relationships` block — `node ../../scripts/kb.mjs link <id> demonstrates <pattern>` writes
both sides, giving each pattern a "Demonstrated by" backlink. Tag OOP katas
`low-level-design`; a distributed kata carries no kind tag and the hub badges it System design
by default. Designs carry `data-kb-solves` like a pattern.

Read with `node ../../scripts/kb.mjs get <id>`. See the root CLAUDE.md for the contract.
