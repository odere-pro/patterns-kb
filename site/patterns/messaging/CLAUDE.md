# patterns/messaging

**Messaging (lens)** — 15 patterns.
A lens: it reshapes how you build at any elevation, rather than being a rung on the ladder.

Pages here: aggregator, claim-check, competing-consumers, content-based-router, correlation-identifier, dead-letter-channel, fan-out, idempotency, message-queue, message-router, message-translator, pubsub, scatter-gather, splitter, wire-tap

Every page in this folder declares `data-kb-band="messaging"` and
`data-kb-group="messaging"`. The path is checked against them — `make check` fails if a
page is filed anywhere else, so moving a page means changing its band or group, not just
its location.

Read a page with `node ../../../scripts/kb.mjs get <id>` — never open the .html to read it
(that costs ~3.6k tokens of markup for ~1.2k of prose).

See the root CLAUDE.md for the data contract before editing anything here.
