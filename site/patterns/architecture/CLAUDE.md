# patterns/architecture

**III · Architecture** — 10 patterns.
Shaping how a whole system's components are arranged

Pages here: cqrs, eda, event-sourcing, hexagonal, layered, microkernel, mvc, mvp, mvvm, pipe-filter

Every page in this folder declares `data-kb-band="architecture"` and
`data-kb-group="architecture"`. The path is checked against them — `make check` fails if a
page is filed anywhere else, so moving a page means changing its band or group, not just
its location.

Read a page with `node ../../../scripts/kb.mjs get <id>` — never open the .html to read it
(that costs ~3.6k tokens of markup for ~1.2k of prose).

Reading levels: the optional `explain` block ladders a page as basic → advanced → expert,
and `data-kb-level` marks the level an element appears from. Section-level values are
stamped from `BLOCK_LEVELS` in `scripts/lib/model.mjs` (generated — change the policy, not
the page); element-level values are authored via `kb.mjs level`.

See the root CLAUDE.md for the data contract before editing anything here.
