# site/capabilities

**Cloud capabilities** — 9 pages (the `capability` kind). Each takes one category
of managed cloud service as its subject and answers the question a reader arrives with when they
are holding a console: what can I buy here, what is it called on each cloud, and which patterns
am I still on the hook to build myself. Order comes from `CAPABILITY_ORDER` in
`scripts/lib/model.mjs` — a page missing from it validates fine and silently never appears on
the hub.

Pages here: compute, data-analytics, databases, identity, messaging, networking, regions, resources, storage

Blocks, in order: `description` → `explain` → `capabilities` → `mapping` → `choosing` → `portability` → `relationships`.

**The capability is the subject; the products are evidence.** `capabilities` names each
capability with no product in it at all, as a `dl.variations` card. `mapping` is the
cross-cloud table — `.table-scroll` wrapping `table.decision`, columns Capability / AWS /
Azure / Google Cloud / Open source. The Open source cell carries the headline self-hosted
answer only (one name, two at most) and links the `site/comparisons/` page that argues the
choice where one exists; the depth lives there, not in the cell. `choosing` argues the
decision; `portability` lists what breaks when you move, each item a bold label then the
difference and what it costs.

Two rules bite harder here than anywhere else in the KB. **Anti-fabrication:** every cell is a
service name you are sure of or it is omitted — "no direct equivalent" and "no direct
open-source equivalent" are true, useful answers and belong in the table; an invented product
feature is a lie that ships to a public site.
**Naming decay:** prefer the stable capability-level answer to the newest brand, because these
are the pages that go out of date first.

A capability links to the patterns it packages with
`node ../../scripts/kb.mjs link <id> implements <pattern>`, which writes both sides and gives
the pattern an "Implemented by" backlink — distinct from "Demonstrated by", which is a case
study showing the pattern at work. Where the platform requires a discipline of you rather than
providing it, the verb is `prerequisite`, not `implements`.

Add `data-kb-maps="mapping-row-N"` to that edge to pin it to the one row naming the products,
which is what `site/map/stack.html` copies into its cells; an unpinned edge degrades to a link
to the whole table, and for a pattern that genuinely needs the whole table — Big Data wants both
the batch and the streaming path — that is the honest answer rather than a shortfall. **Row ids
are minted positionally**, so inserting a row renumbers every row below it and silently
repoints the pins on that page: add rows below the last pin, or re-check each pin resolves to
the label it did before.

The product names in these cells are what `scripts/lib/products.mjs` turns into outbound links
to vendor documentation, matched per column so "Application Load Balancer" resolves to AWS in
one column and Google Cloud in another. Register the base product name, not the whole cell:
"SQS" links inside "SQS FIFO queues" and leaves the feature words as prose. `make check` runs
`audit-products.mjs`, which fails a registry entry no cell uses and reports cells naming
products the registry has not got.

Read with `node ../../scripts/kb.mjs get <id>`. See the root CLAUDE.md for the contract.
