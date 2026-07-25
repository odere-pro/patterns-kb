# patterns/distributed/coordination

**IV · Network → Coordination & Data** — 23 patterns.
Keeping many services reliable, fast, and consistent across a network

Pages here: bloom-filter, change-data-capture, conditional-write, count-min-sketch, distributed-lock, federated-identity, gossip-protocol, hyperloglog, inbox, leader-election, lsm-tree, mapreduce, materialized-view, optimistic-concurrency-control, outbox, pessimistic-locking, quorum-consensus, replication, saga, strangler-fig, sweeper, workflow-orchestration, write-ahead-log

Every page in this folder declares `data-kb-band="distributed"` and
`data-kb-group="distributed-coordination"`. The path is checked against them — `make check` fails if a
page is filed anywhere else, so moving a page means changing its band or group, not just
its location.

Read a page with `node ../../../../scripts/kb.mjs get <id>` — never open the .html to read it
(that costs ~3.6k tokens of markup for ~1.2k of prose).

Reading levels: the optional `explain` block ladders a page as basic → advanced → expert,
and `data-kb-level` marks the level an element appears from. Section-level values are
stamped from `BLOCK_LEVELS` in `scripts/lib/model.mjs` (generated — change the policy, not
the page); element-level values are authored via `kb.mjs level`.

See the root CLAUDE.md for the data contract before editing anything here.
