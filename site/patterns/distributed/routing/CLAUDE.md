# patterns/distributed/routing

**IV · Network → Routing & Scale** — 18 patterns.
Keeping many services reliable, fast, and consistent across a network

Pages here: ambassador, api-gateway, api-routing, autoscaling, bff, cdn, consistent-hashing, gatekeeper, geohash, load-balancer, object-storage, reverse-proxy, service-mesh, sharding, sidecar, stateless-service, sticky-session, valet-key

Every page in this folder declares `data-kb-band="distributed"` and
`data-kb-group="distributed-routing"`. The path is checked against them — `make check` fails if a
page is filed anywhere else, so moving a page means changing its band or group, not just
its location.

Read a page with `node ../../../../scripts/kb.mjs get <id>` — never open the .html to read it
(that costs ~3.6k tokens of markup for ~1.2k of prose).

Reading levels: every block shows at every lens; depth varies INSIDE blocks. The
mandatory `explain` ladder is a variant group — each lens renders only its own rung.
Two authored element attributes: `data-kb-level` (accretion — visible from this level
up, via `kb.mjs level`) and `data-kb-register` (variant — rendered at exactly that
lens, via `kb.mjs register`); one element carries at most one of them.

See the root CLAUDE.md for the data contract before editing anything here.
