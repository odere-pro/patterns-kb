# patterns/concurrency

**Concurrency (lens)** — 8 patterns.
A lens: it reshapes how you build at any elevation, rather than being a rung on the ladder.

Pages here: actor-model, backpressure, future-promise, monitor-object, producer-consumer, reactor, rw-lock, thread-pool

Every page in this folder declares `data-kb-band="concurrency"` and
`data-kb-group="concurrency"`. The path is checked against them — `make check` fails if a
page is filed anywhere else, so moving a page means changing its band or group, not just
its location.

Read a page with `node ../../../scripts/kb.mjs get <id>` — never open the .html to read it
(that costs ~3.6k tokens of markup for ~1.2k of prose).

See the root CLAUDE.md for the data contract before editing anything here.
