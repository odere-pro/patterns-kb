# TODO — deferred work

Follow-ups that were consciously left out of the HTML5-knowledge-layer build. None of them
blocks the KB; each is a distinct, self-contained piece of work. Ordered roughly by
value-to-effort.

## Explore and validate with awesome architecture

- <https://github.com/mehdihadeli/awesome-software-architecture/blob/main/README.md>
- go through each and build KB for every pattern

## Add / update more cloud patterns

- explore <https://learn.microsoft.com/en-us/azure/architecture/patterns/>
- explore <https://learn.microsoft.com/en-us/azure/architecture/patterns/ambassador>
- explore <https://learn.microsoft.com/en-us/azure/architecture/patterns/anti-corruption-layer>
- explore <https://learn.microsoft.com/en-us/azure/architecture/patterns/asynchronous-request-reply>
- explore <https://learn.microsoft.com/en-us/azure/architecture/patterns/backends-for-frontends>
- explore <https://learn.microsoft.com/en-us/azure/architecture/patterns/bulkhead>
- explore <https://learn.microsoft.com/en-us/azure/architecture/patterns/cache-aside>
- explore <https://learn.microsoft.com/en-us/azure/architecture/patterns/choreography>
- explore <https://learn.microsoft.com/en-us/azure/architecture/patterns/circuit-breaker>
- explore <https://learn.microsoft.com/en-us/azure/architecture/patterns/claim-check>
- explore <https://learn.microsoft.com/en-us/azure/architecture/patterns/compensating-transaction>
- explore <https://learn.microsoft.com/en-us/azure/architecture/patterns/competing-consumers>
- explore <https://learn.microsoft.com/en-us/azure/architecture/patterns/compute-resource-consolidation>
- explore <https://learn.microsoft.com/en-us/azure/architecture/patterns/cqrs>
- explore <https://learn.microsoft.com/en-us/azure/architecture/patterns/deployment-stamp>
- explore <https://learn.microsoft.com/en-us/azure/architecture/patterns/event-sourcing>
- explore <https://learn.microsoft.com/en-us/azure/architecture/patterns/external-configuration-store>
- explore <https://learn.microsoft.com/en-us/azure/architecture/patterns/federated-identity>
- explore <https://learn.microsoft.com/en-us/azure/architecture/patterns/gatekeeper>
- explore <https://learn.microsoft.com/en-us/azure/architecture/patterns/gateway-aggregation>
- explore <https://learn.microsoft.com/en-us/azure/architecture/patterns/gateway-offloading>
- explore <https://learn.microsoft.com/en-us/azure/architecture/patterns/gateway-routing>
- explore <https://learn.microsoft.com/en-us/azure/architecture/patterns/geodes>
- explore <https://learn.microsoft.com/en-us/azure/architecture/patterns/health-endpoint-monitoring>
- explore <https://learn.microsoft.com/en-us/azure/architecture/patterns/index-table>
- explore <https://learn.microsoft.com/en-us/azure/architecture/patterns/leader-election>
- explore <https://learn.microsoft.com/en-us/azure/architecture/patterns/materialized-view>
- explore <https://learn.microsoft.com/en-us/azure/architecture/patterns/messaging-bridge>
- explore <https://learn.microsoft.com/en-us/azure/architecture/patterns/pipes-and-filters>
- explore <https://learn.microsoft.com/en-us/azure/architecture/patterns/priority-queue>
- explore <https://learn.microsoft.com/en-us/azure/architecture/patterns/publisher-subscriber>
- explore <https://learn.microsoft.com/en-us/azure/architecture/patterns/quarantine>
- explore <https://learn.microsoft.com/en-us/azure/architecture/patterns/queue-based-load-leveling>
- explore <https://learn.microsoft.com/en-us/azure/architecture/patterns/rate-limiting-pattern>
- explore <https://learn.microsoft.com/en-us/azure/architecture/patterns/retry>
- explore <https://learn.microsoft.com/en-us/azure/architecture/patterns/saga>
- explore <https://learn.microsoft.com/en-us/azure/architecture/patterns/scheduler-agent-supervisor>
- explore <https://learn.microsoft.com/en-us/azure/architecture/patterns/sequential-convoy>
- explore <https://learn.microsoft.com/en-us/azure/architecture/patterns/sharding>
- explore <https://learn.microsoft.com/en-us/azure/architecture/patterns/sidecar>
- explore <https://learn.microsoft.com/en-us/azure/architecture/patterns/static-content-hosting>
- explore <https://learn.microsoft.com/en-us/azure/architecture/patterns/strangler-fig>
- explore <https://learn.microsoft.com/en-us/azure/architecture/patterns/throttling>
- explore <https://learn.microsoft.com/en-us/azure/architecture/patterns/valet-key>

## Add KB pages

- Priority queue - Give latency-sensitive messages a lane that skips the backlog, while bulk or best-effort work waits behind it.
- Dead-letter queue - Move a message aside after it fails processing repeatedly, so one poison message can't block everything behind it.
- Bounded queue - Cap the queue's depth and reject or redirect once full, so an unbounded backlog can't itself become the outage.
- Static pool - A fixed number of consumer instances, sized for expected peak load. Simple to operate, wasteful when load is bursty.
- Partitioned / keyed consumption - Messages are hashed to a partition or shard by key, and each partition is owned by exactly one consumer at a time — preserves per-key order while still spreading unrelated keys across the pool (Kafka partitions, Kinesis shards).
- Exclusive delivery via lease / visibility timeout - The broker hides a delivered message from other consumers for a lease window; a consumer that crashes before acking lets it reappear for someone else to pick up.
- map-reduce pattern
- top-k pattern
- Pure broadcast vs. filtered fan-out - Every consumer receives every message, or each subscription carries a filter — by attribute or by content — so a branch only sees messages it cares about, trimming volume and cost per consumer.
- Direct fan-out vs. queue-per-consumer hybrid - The topic pushes straight to each consumer, or a durable queue sits in front of each one; the queue absorbs bursts and lets a slow branch fall behind without holding up the fast ones.
- Push vs. poll delivery - The broker pushes each copy to a consumer's endpoint, or each consumer polls its own queue and pulls at the rate it can actually handle.
- Push vs. poll delivery - The broker pushes each copy to a consumer's endpoint, or each consumer polls its own queue and pulls at the rate it can actually handle.
- Static / table-driven routing - Rules live in a lookup table — a field value mapped to a channel name — so operators can add or change destinations without redeploying router code.
- Dynamic / rule-engine routing - Conditions are expressed in a rules DSL, JSONPath/XPath predicate, or business-rule engine, letting the routing logic evolve independently of the integration code around it.
- Header-assisted routing - A cheap header check (a type or version field) narrows the candidates first, so the router only parses the full body when the header alone can't decide.
- Multi-match / recipient hybrid - When more than one condition can match the same message, it's copied to every matching channel instead of exactly one — the point where this pattern shades into a Recipient List.
- Merge vs. join (fan-in) - A merge interleaves the sources into one continuous stream — an unordered union that flows on as fast as records arrive, with no notion of "done". A join instead waits for all the sources and combines their results into a single value before releasing it. Streaming pipelines merge; a parallel-then-collect computation joins.
- Await-all vs. first-wins vs. quorum (fan-in) - When the convergence point does wait, how much does it wait for? Await-all blocks until every source returns — the slowest sets the pace. First-wins races them and takes the earliest reply, discarding the rest. Quorum settles for the first k of n, treating the stragglers as absent — the middle ground that trades completeness for a bounded tail.
- Static vs. dynamic sources (fan-in) - The set of sources is a fixed, known N — a partitioned job whose shard count you chose — or it is dynamic, with producers joining and leaving at runtime, as instances scale in and out behind a log pipeline. Dynamic fan-in cannot count on a known total, so "wait for all" stops being well defined.
- Buffered fan-in (fan-in) - The collector puts a queue in front of itself to absorb uneven producer rates, so a burst from one fast source does not overrun the sink and a lull elsewhere does not starve it. The buffer smooths the convergence, at the cost of memory and some latency — and it must be bounded, or an out-of-sync producer grows it without limit.
- Status / claim guard - The predicate names a specific row's state — WHERE seat_number='A15' AND status='available'. Guarding the actual contended thing, not a proxy for it, is the safe form: it flips exactly the row it checked.
- Counter floor - The predicate is a threshold on an aggregate — WHERE available_seats > 0. Cheap and correct for pure supply, but it proves a unit exists, not which; with several units free two writers can both pass and both land on the same specific item. Guard the real row when identity matters.
- Set-if-absent - The condition is "the key does not exist yet" — Redis SET key val NX, SQL INSERT ... ON CONFLICT DO NOTHING, Cassandra IF NOT EXISTS. This is conditional create, and it is exactly how a lease or lock is acquired: whoever writes the row first owns it.
- Version compare - The condition is that a version or revision still equals what you last read — WHERE version = 42. Generalising the guard to a monotonic token rather than a business value is what turns a single conditional write into optimistic concurrency control across a whole read-modify-write cycle.
- Guarded multi-write - When one atomic statement is not enough — decrement the counter and insert a ticket row — a bare INSERT after an UPDATE that matched zero rows still creates a "ticket with no seat", because a zero-row update is not an error. Make the second write depend on the first's affected-row count (a WITH ... RETURNING CTE feeding INSERT ... SELECT, or an explicit affected-rows check inside a transaction).
- Reader-preference vs. writer-preference - Decide who wins when both roles are waiting. Naive reader-preference lets a steady stream of readers starve a writer indefinitely; writer-preference flips the risk onto readers instead.
- Fair / ticket-queued - Queue read and write requests in arrival order so neither role starves the other, at the cost of extra bookkeeping and slightly lower peak read throughput.
- Upgradeable read lock - Lets a thread already holding a read lock promote to a write lock without releasing it first, closing the gap where another writer could sneak in between release and re-acquire.
- Recursive (reentrant) read-write lock - Allows the same thread to re-acquire a mode it already holds — needed when locked code calls other locked code — but doubles the accounting and can deadlock if reentry rules aren't precise.
- Count-based completeness - Release once a known number of related messages has arrived — simplest when the set size is fixed or announced up front.
- Timeout-based completeness - Release whatever has accumulated once a deadline passes, so one missing or late fragment can't block the aggregate forever.
- Best-effort aggregation - Combine on timeout even when incomplete, marking the missing pieces rather than discarding a partial result outright.
- Auction - Every recipient answers the same question — a price, a bid, a route — and gather keeps only the winning reply, discarding the rest.
- Distribution - The request is partitioned so each recipient handles distinct work; gather reassembles the pieces into one complete result rather than picking a winner.
- Static vs. dynamic recipient list - Recipients are a fixed, known set, or resolved at runtime from a directory or service registry — trading simplicity for the ability to add participants without redeploying.
- Timeout / quorum gather - Rather than block for every reply, gather closes after a deadline or once a minimum count has arrived, treating stragglers as absent instead of stalling the whole exchange.
- Recipient-list vs. broadcast dispatch - The EIP book splits the pattern on how the request goes out, and its variant names describe that axis: its Distribution sends to a recipient list the router controls, while its Auction broadcasts on a publish-subscribe channel for any interested participant to answer. Dispatch is independent of what gather does with the replies — either style can feed a winner-picking or a reassembling gather — so note that the book's Auction/Distribution label the dispatch, where this page's label the gather.
- check all <https://odere-pro.github.io/patterns-kb/patterns/distributed/resilience/rate-limiter.html> Variations
- 


## Task ideas

- add attempts to the SQL table to move poisoned message to DLQ
- competing consumers - multiple sanction lists
- add schedulers, for retres, DLQs
- Do I need message routing?
- Do I need fan-in to merge (converge) the result? Fan in should block the conclusion
- Outbox - State and event commit together; a relay delivers afterwards to fix double writes
- Event Sourcing - One append is both state and event, so nothing diverges
- What is better for inbox and outbox pessimistic or optimistic lock? (Does not span connections, services, or time — it lives and dies with one transaction, so it is not a distributed lock.)
- Should I use wire tap pattern for observability?
- where to use autoscaling (min-max up-down) and redundency? <https://odere-pro.github.io/patterns-kb/themes/spike-handling.html>, how to tell producer to slowdown (backpreasure)
- availability for email photo send, and consistency (strong or evantual) for the result

## Questions

- how to scale Queues, with different topics, partitions, how to make it durable?
- what is the difference between worker and consumer?
- Poison message redelivery loop for fanout what to do?
- Publish-burst amplification - what to do?
- How to make backpreasure?
- What is relay?
- How to resolve race or prevent condition? How to make atomic read and write?
- 
