# patterns/distributed/coordination

**IV · Network → Coordination + Data** — 30 patterns.
Keeping many services reliable, fast, and consistent across a network.

Pages here: a2a, bloom-filter, change-data-capture, conditional-write, container-orchestration, containerization, count-min-sketch, distributed-lock, external-configuration-store, federated-identity, gossip-protocol, hyperloglog, inbox, index-table, leader-election, lsm-tree, mapreduce, materialized-view, optimistic-concurrency-control, outbox, pessimistic-locking, quorum-consensus, replication, saga, sliding-window, strangler-fig, sweeper, unique-id-generation, workflow-orchestration, write-ahead-log

Every page in this folder declares `data-kb-band="distributed"`, and one of
`data-kb-group="distributed-coordination"` or `data-kb-group="distributed-data"` — these groups render as separate
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
