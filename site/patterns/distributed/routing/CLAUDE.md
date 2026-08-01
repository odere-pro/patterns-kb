# patterns/distributed/routing

**IV · Network → Routing + Scale** — 29 patterns.
Keeping many services reliable, fast, and consistent across a network.

Pages here: ambassador, api-gateway, api-routing, api-versioning, async-request-reply, autoscaling, bff, blue-green-deployment, canary-release, cdn, compute-resource-consolidation, consistent-hashing, deployment-stamp, feature-flag, functional-partitioning, gatekeeper, geode, geohash, load-balancer, object-storage, pagination, reverse-proxy, service-mesh, sharding, sidecar, stateless-service, sticky-session, valet-key, vertical-partitioning

Every page in this folder declares `data-kb-band="distributed"`, and one of
`data-kb-group="distributed-routing"` or `data-kb-group="distributed-scale"` — these groups render as separate
subsections on the hub but SHARE this one directory, via the `dir` alias in `BANDS`
(`../../../../scripts/lib/model.mjs`). The path is checked against the band and group —
`make check` fails if a page is filed anywhere else. Changing which of these groups a page
belongs to is an attribute edit and no file move; changing its band is both.

Read a page with `node ../../../../scripts/kb.mjs get <id>` — never open the .html to read it
(that costs ~3.6k tokens of markup for ~1.2k of prose).

Reading levels are CUMULATIVE: basic is a short whole page, advanced is basic plus
system-design depth, expert is both plus the deep dives. Every block shows at every lens;
depth varies INSIDE blocks. The mandatory `explain` ladder stacks — at advanced you read
the basic and advanced rungs together. `data-kb-level` (visible from this level up, via
`kb.mjs level`) is the mechanism and untagged content is the basic core;
`data-kb-register` (rendered at exactly that lens, via `kb.mjs register`) is a rare
replacement tool. One element carries at most one of them.

See the root CLAUDE.md for the data contract before editing anything here.
