# patterns/distributed/coordination

**IV · Network → Coordination & Data** — 20 patterns.
Keeping many services reliable, fast, and consistent across a network

Pages here: bloom-filter, change-data-capture, conditional-write, distributed-lock, federated-identity, gossip-protocol, inbox, leader-election, lsm-tree, mapreduce, materialized-view, optimistic-concurrency-control, outbox, pessimistic-locking, quorum-consensus, replication, saga, strangler-fig, workflow-orchestration, write-ahead-log

Every page in this folder declares `data-kb-band="distributed"` and
`data-kb-group="distributed-coordination"`. The path is checked against them — `make check` fails if a
page is filed anywhere else, so moving a page means changing its band or group, not just
its location.

Read a page with `node ../../../../scripts/kb.mjs get <id>` — never open the .html to read it
(that costs ~3.6k tokens of markup for ~1.2k of prose).

See the root CLAUDE.md for the data contract before editing anything here.
