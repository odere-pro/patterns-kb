# site/designs

**Case studies** — 40 worked designs (the `design` kind). Each breaks one real
system down the way a strong interview answer would, and `demonstrates` the patterns it uses.

Pages here: ad-click-aggregator, amazon-locker, bitly, bookmyshow, camelcamelcamel, chatgpt, connect-four, design-distributed-cache, design-rate-limiter, distributed-rate-limiter, dropbox, elevator, fb-live-comments, fb-news-feed, fb-post-search, file-system, google-docs, google-news, gopuff, instagram, inventory-management, job-scheduler, leetcode, logging-service, metrics-monitoring, online-auction, online-chess, parking-lot, payment-system, persona-identification, robinhood, strava, ticketmaster, tinder, top-k, uber, web-crawler, whatsapp, yelp, youtube

Blocks, in order: `problem` → `requirements` → `estimation` → `entities` → `interface` → `architecture` → `deepdives` → `tradeoffs` → `levels` → `relationships`.
Optional: `estimation`, `interface`, `levels` — a low-level-design kata may skip the first two.

The `architecture` block carries the primary mermaid diagram (a `flowchart` for a distributed
design, a `classDiagram` for a low-level one). A design links to the patterns it uses through the
typed `relationships` block — `node ../../scripts/kb.mjs link <id> demonstrates <pattern>` writes
both sides, giving each pattern a "Demonstrated by" backlink. Tag distributed katas
`system-design` and OOP katas `low-level-design`; designs carry `data-kb-solves` like a pattern.

Read with `node ../../scripts/kb.mjs get <id>`. See the root CLAUDE.md for the contract.
