# patterns/gof/extra

**I · Objects & Classes → Also Essential** — 5 patterns.
Gang of Four, 1994 — the 23 patterns everything else stands on, plus a few essentials the book missed

Pages here: dependency-injection, lazy-initialization, null-object, object-pool, service-locator

Every page in this folder declares `data-kb-band="gof"` and
`data-kb-group="gof-extra"`. The path is checked against them — `make check` fails if a
page is filed anywhere else, so moving a page means changing its band or group, not just
its location.

Read a page with `node ../../../../scripts/kb.mjs get <id>` — never open the .html to read it
(that costs ~3.6k tokens of markup for ~1.2k of prose).

See the root CLAUDE.md for the data contract before editing anything here.
