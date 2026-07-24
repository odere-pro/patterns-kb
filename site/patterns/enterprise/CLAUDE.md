# patterns/enterprise

**II · Application** — 8 patterns.
Organizing one app's business logic and data access (Fowler, PoEAA)

Pages here: active-record, data-mapper, dto, gateway, repository, service-layer, transaction-script, unit-of-work

Every page in this folder declares `data-kb-band="enterprise"` and
`data-kb-group="enterprise"`. The path is checked against them — `make check` fails if a
page is filed anywhere else, so moving a page means changing its band or group, not just
its location.

Read a page with `node ../../../scripts/kb.mjs get <id>` — never open the .html to read it
(that costs ~3.6k tokens of markup for ~1.2k of prose).

See the root CLAUDE.md for the data contract before editing anything here.
