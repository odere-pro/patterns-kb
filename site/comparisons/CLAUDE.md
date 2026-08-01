# site/comparisons

**Product comparisons** — 10 pages (the `comparison` kind). Each takes one product
decision as its subject: the managed services and the open-source contenders for a single
capability area, side by side, compared on the conditions that decide the choice. Order comes
from `COMPARISON_ORDER` in `scripts/lib/model.mjs` — a page missing from it validates fine
and silently never appears on the hub.

Pages here: application-platforms, identity-providers, infrastructure-as-code, key-value-stores, load-balancers-and-gateways, message-brokers, object-stores, relational-databases, search-engines, workflow-orchestrators

Blocks, in order: `description` → `explain` → `contenders` → `matrix` → `choosing` → `relationships`.

**The decision is the subject; the products are the contenders.** `contenders` is a
`dl.variations` — each `dt` a product name, each `dd` its character in one line, its
license, and who runs it for you. `matrix` is the condition-by-contender table —
`.table-scroll` wrapping `table.decision`, first column Criterion, one column per contender,
rows lens-tagged with at least one untagged. `choosing` argues the per-condition verdicts.

Two rules bite harder here than anywhere else in the KB. **Anti-fabrication:** every cell is a
fact you verified or it is omitted — a license, a feature, a managed offering; "no managed
offering" and "no direct open-source equivalent" are true, useful answers. **Naming decay:**
licenses and product lines change (Redis, Elasticsearch and CockroachDB all relicensed); prefer
the durable behavioural difference to the claim that dates fastest.

A comparison joins the graph twice: `node ../../scripts/kb.mjs link <id> implements <pattern>`
(these products are the pattern, runnable or buyable — the pattern gains an "Implemented by"
backlink) and `node ../../scripts/kb.mjs link <id> specializes <capability>` (the capability
page is the wider, provider-neutral subject; it gains a "Generalizes" backlink).

`data-kb-aliases` must carry the contender product names ("kafka", "rabbitmq") so
`kb.mjs find kafka` resolves here. `data-kb-solves` carries the decision's symptoms
("should we use Kafka or SQS", "we can't use it because of the license").

Read with `node ../../scripts/kb.mjs get <id>`. See the root CLAUDE.md for the contract.
