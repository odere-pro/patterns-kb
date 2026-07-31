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

Reading levels: every block shows at every lens; depth varies INSIDE blocks. The
mandatory `explain` ladder is a variant group — each lens renders only its own rung.
Two authored element attributes: `data-kb-level` (accretion — visible from this level
up, via `kb.mjs level`) and `data-kb-register` (variant — rendered at exactly that
lens, via `kb.mjs register`); one element carries at most one of them.

See the root CLAUDE.md for the data contract before editing anything here.
