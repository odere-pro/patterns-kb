# patterns/messaging

**Messaging (lens)** — 21 patterns.
Moving work between components as messages rather than calls, which changes the failure modes at any elevation.

Pages here: aggregator, claim-check, competing-consumers, content-based-router, correlation-identifier, dead-letter-channel, fan-in, fan-out, idempotency, message-encoding, message-queue, message-router, message-translator, messaging-bridge, priority-queue, pubsub, recipient-list, scatter-gather, sequential-convoy, splitter, wire-tap

Every page in this folder declares `data-kb-band="messaging"` and
`data-kb-group="messaging"`. The path is checked against them — `make check` fails if a
page is filed anywhere else, so moving a page means changing its band or group, not just
its location.

Read a page with `node ../../../scripts/kb.mjs get <id>` — never open the .html to read it
(a page is ~7k tokens, over half of it markup; one block through `get --block` is ~180).

Reading levels are CUMULATIVE: basic is a short whole page, advanced is basic plus
system-design depth, expert is both plus the deep dives. Every block shows at every lens;
depth varies INSIDE blocks. The mandatory `explain` ladder stacks — at advanced you read
the basic and advanced rungs together. `data-kb-level` (visible from this level up, via
`kb.mjs level`) is the mechanism and untagged content is the basic core;
`data-kb-register` (rendered at exactly that lens, via `kb.mjs register`) is a rare
replacement tool. One element carries at most one of them.

See the root CLAUDE.md for the data contract before editing anything here.
