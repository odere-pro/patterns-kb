# patterns/gof/extra

**I · Objects & Classes → Also Essential** — 6 patterns.
Gang of Four, 1994 — the 23 patterns everything else stands on, plus a few essentials the book missed

Pages here: dependency-injection, lazy-initialization, monostate, null-object, object-pool, service-locator

Every page in this folder declares `data-kb-band="gof"` and
`data-kb-group="gof-extra"`. The path is checked against them — `make check` fails if a
page is filed anywhere else, so moving a page means changing its band or group, not just
its location.

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
