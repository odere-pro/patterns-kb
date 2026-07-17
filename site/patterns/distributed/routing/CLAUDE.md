# patterns/distributed/routing

**IV · Network → Routing & Scale** — 11 patterns.
Keeping many services reliable, fast, and consistent across a network

Pages here: ambassador, api-gateway, autoscaling, bff, cdn, consistent-hashing, gatekeeper, load-balancer, sharding, sidecar, valet-key

Every page in this folder declares `data-kb-band="distributed"` and
`data-kb-group="distributed-routing"`. The path is checked against them — `make check` fails if a
page is filed anywhere else, so moving a page means changing its band or group, not just
its location.

Read a page with `node ../../../../scripts/kb.mjs get <id>` — never open the .html to read it
(that costs ~3.6k tokens of markup for ~1.2k of prose).

See the root CLAUDE.md for the data contract before editing anything here.
