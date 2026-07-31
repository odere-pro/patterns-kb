# TODO — deferred work

Follow-ups that were consciously left out of the HTML5-knowledge-layer build. None of them
blocks the KB; each is a distinct, self-contained piece of work. Ordered roughly by
value-to-effort.

## 0. Lens model v2 sweep — cumulative lenses, AWS-short basic, topology walks

**What.** Owner review corrected the lens model: lenses are CUMULATIVE (basic = AWS-short
untagged core; advanced = basic + system-design depth; expert = everything), the explain
ladder stacks its rungs, `data-kb-register` is demoted to a rare replacement tool, and
implementation patterns gain an AWS-style numbered topology-walk diagram (subgraph
boundary, steps 1..N) with the sequence diagram demoted to advanced. The corpus still
implements v1. Ready-to-execute plans live in `tmp/plans/levels/` (gitignored —
regenerate id lists from graph.json if lost): **M0** mechanism flip → **C0** .claude
assets → **F0** redo the 38 v1-swept pages (outbox first, the exemplar) → **L1–L8** the
remaining ~235. Sizing bands and the full spec are in that index.

**Small riders from the same overhaul:** reconcile hot-key's "also called a hot partition"
and cache-stampede's "also called a thundering herd" lines against the new hazard pages;
give sweeper a theme home (long-running-tasks); fact-check claim-check's SQS 1 MiB claim;
consider request-coalescing/single-flight and load-shedding pattern pages (several
mitigation blocks want the edge); a fluency↔tour make-check integrity rule.

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

## Task ideas

- add attempts to the SQL table to move poisoned message to DLQ
- competing consumers - multiple sanction lists
- add schedulers, for retres, DLQs
- Do I need message routing?
- Do I need fan-in to merge (converge) the result? Fan in should block the conclusion
- Outbox - State and event commit together; a relay delivers afterwards to fix double writes
- Event Sourcing - One append is both state and event, so nothing diverges
- 

## Questions

- how to scale Queues, with different topics, partitions, how to make it durable?
- what is the difference between worker and consumer?
- Poison message redelivery loop for fanout what to do?
- Publish-burst amplification - what to do?
- How to make backpreasure?
- What is relay?
- How to resolve race or prevent condition? How to make atomic read and write?
- 
