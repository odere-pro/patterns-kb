---
title: System Design Interview
description: "From a vague prompt to a design that holds up — the framework, and the patterns behind each deep dive"
area: themes-starting
owner: Oleksandr Derechei
tags: [scalability, availability, latency]
status: stable
aliases: [SDI, design interview, designing a system]
---

# System Design Interview

A system design interview asks you to architect something like Ticketmaster or Uber in boxes and arrows, not code. This is the map: the framework that carries you from a vague prompt to a working design, and the patterns you reach for to make that design scale, stay fast, and survive failure.

## The question
<!--meta block=description-->

A system design interview gives you a one-line prompt, such as design Ticketmaster or a rate limiter, and 35 to 60 minutes to draw a design in boxes and arrows. Product questions reward modelling a real feature, and infrastructure questions reward data flow and throughput. A framework balances breadth and depth against the clock, and this theme maps the patterns you reach for in the deep dives.

## Explained
<!--meta block=explain-->

A system design interview gives you a one-line prompt, such as design Ticketmaster, and 35 to 60 minutes to draw a working system in boxes and arrows. The way through is a fixed order in which each step narrows the problem. Agree the functional requirements (what it does) and non-functional ones (how fast, how large, how consistent), list the core entities, define the API, draw the high-level design, then go deep. The high-level design satisfies the functional requirements and the deep dives satisfy the non-functional ones. Keep the first sketch almost boring, so a user can book a ticket at all, and only then make it fast, correct and large. When the interviewer pushes on slow reads, reach for a [cache](../patterns/caching/cache-aside.md) or [CDN](../patterns/distributed/routing/cdn.md); on spikes, a [message queue](../patterns/messaging/message-queue.md) or [rate limiter](../patterns/distributed/resilience/rate-limiter.md); on scale, [sharding](../patterns/distributed/routing/sharding.md); and say what each costs.

- **Breadth eats depth.** Too long on breadth and you never prove expertise. Time-box the high-level design to about 10 minutes.
- **Early dives go wrong.** Going deep before requirements are agreed means going deep on the wrong thing. Fix the order.
- **Patterns without prices.** Naming a pattern earns little. Say what it costs and why you accept it.

**Example.** Ticketmaster in 45 minutes: requirements 5, entities 3, API 5, high-level design 10, leaving 22 for deep dives. The sketch is client, API, booking service, database. The deep dives answer the non-functional goals. Two users must not buy one seat, so a seat is held for 10 minutes with an expiring lock. A sale draws 500,000 users for 50,000 seats, 10 per seat, so a waiting queue admits users slowly. Reads of the seat map are cached. Each choice names its cost, such as held seats that look sold for 10 minutes.

## The trade-space
<!--meta block=tradespace-->

A reliable framework runs in order, each step narrowing the problem before the next widens it again. **Requirements** — the functional features and the non-functional qualities, agreed with the interviewer up front. **Core entities** — the nouns the system persists and the API exchanges (a user, an event, a ticket), which usually map straight onto your tables. **API / interface** — the endpoints that meet the functional requirements, most often representational state transfer (REST), sometimes GraphQL or gRPC. An optional **data flow** step for data-heavy infrastructure problems. Then **high-level design**, and finally the **deep dives**.

The split between the last two steps is the crux, and the single idea worth internalising: **the high-level design exists to satisfy the functional requirements; the deep dives exist to satisfy the non-functional ones.** Draw the simplest set of boxes that lets a user book a ticket at all — that is the high-level design, and it should be almost boring. Then, and only then, make booking low-latency, strongly consistent where money is involved, and able to scale to the numbers you agreed. Almost every pattern in this catalogue earns its place in a deep dive, not in the first sketch.

How it is scored comes down to four axes. **Problem solving**: recognise and prioritise the core challenge — for Ticketmaster that is the booking flow, not authentication. **Solution design**: a high-level design that weighs trade-offs instead of reciting one true answer. **Technical excellence**: go genuinely deep in a few areas, naming specific technologies and the places they break under load. **Communication**: explain it clearly for the better part of an hour. Depth in a few places beats shallow coverage everywhere.

**How to build the fluency:** the same way you'd grind LeetCode — work backwards from a handful of canonical problems rather than memorising answers. A widely-used progression runs Bitly, Dropbox, Ticketmaster, News Feed, [WhatsApp](../designs/whatsapp.md), LeetCode, Uber, [Web Crawler](../designs/web-crawler.md), [Ad Click Aggregator](../designs/ad-click-aggregator.md), and Post Search. Each introduces a few of the patterns in the tour below, and they recur in the next problem — so by the end the deep dives feel like variations on a theme you have already seen.

```mermaid caption="The framework runs left to right. The high-level design answers the functional requirements; the deep dives answer the non-functional ones."
flowchart LR
    R["Requirements"] -->|"the nouns it names"| E["Core Entities"]
    E -->|"endpoints exchanging them"| A["API / Interface"]
    A -->|"data-heavy problems"| D["Data Flow (optional)"]
    D -->|"draw the boxes"| H["High-Level Design"]
    H -->|"then go deep"| DD["Deep Dives"]
    H -. "satisfies functional reqs" .-> R
    DD -. "satisfies non-functional reqs" .-> R
```

## Patterns the deep dives reach for
<!--meta block=tour-->

```mermaid caption="The skeleton most high-level designs converge on: a load balancer in front of stateless servers, a database and cache behind them, a queue for async work, and object storage plus a CDN for large media. The tour walks each box."
flowchart TB
    Client["Client"]:::ext -->|"HTTP request"| LB["Load Balancer"]
    LB -->|"route to instance"| Server["Server"]
    Server -->|"read / write rows"| DB[("Database")]
    Server -->|"cache hot reads"| Cache[("Cache")]
    Server -->|"enqueue async work"| Queue["Message Queue"]
    Server -->|"store large blobs"| Blob["Object Storage"]
    Blob -->|"origin fetch"| CDN["CDN"]
    CDN -->|"serve media"| Client
    classDef ext stroke-dasharray:4 4;
```

<!-- tour:start -->

<!-- GENERATED by gen-tours from docs/data/learning-paths.json. Do not edit this block. -->

### [Stateless Service](../patterns/distributed/routing/stateless-service.md) {#tour-stateless-service}

The precondition for everything else. Push per-client state out to a shared store and any instance can serve any request — which is what makes adding, removing, and replacing servers cheap. Almost every "how does this scale?" answer starts here.

### [Load Balancer](../patterns/distributed/routing/load-balancer.md) {#tour-load-balancer}

The box in front of your server tier once it scales horizontally. It spreads incoming requests across identical instances so no single machine is the bottleneck, and is the natural place to talk about health checks and rolling deploys.

### [Sharding](../patterns/distributed/routing/sharding.md) {#tour-sharding}

Scaling storage, not compute. When one database can no longer hold or serve the data, split it across instances by a partition key — and be ready to defend your choice of key against hot-shard skew.

### [Consistent Hashing](../patterns/distributed/routing/consistent-hashing.md) {#tour-consistent-hashing}

The usual answer to "how do you decide which shard a key lives on?" A hash ring means adding or removing a node reshuffles only a fraction of keys instead of remapping everything — a favourite deep-dive follow-up.

### [Cache-Aside](../patterns/caching/cache-aside.md) {#tour-cache-aside}

The first move when reads are too slow. The app checks a cache and fills it on a miss, so repeated reads come from memory instead of the database — at the cost of a conversation about staleness and eviction.

### [CDN](../patterns/distributed/routing/cdn.md) {#tour-cdn}

A cache with geography. Copies of static and media content sit at edge locations near the user, so a request from India need not travel to a server in America. Pairs naturally with object storage for images and video.

### [Object Storage](../patterns/distributed/routing/object-storage.md) {#tour-object-storage}

Where images, video, and other large blobs belong — not in the database, which bloats and slows the moment you cram bytes into it. Keep a reference in the row and let a content delivery network (CDN) serve the object from the edge.

### [Replication](../patterns/distributed/coordination/replication.md) {#tour-replication}

The redundancy behind both fault tolerance and read scaling. Keeping copies on more than one node lets reads fan out and lets the system survive losing one — and forces the consistency-versus-latency choice the interviewer will probe.

### [Message Queue](../patterns/messaging/message-queue.md) {#tour-message-queue}

The answer to "what if this step is slow, or spikes?" A queue lets one service hand work to another asynchronously, decoupling them and absorbing bursts — the seam where load-levelling, retries, and delivery guarantees all come up.

### [Rate Limiter](../patterns/distributed/resilience/rate-limiter.md) {#tour-rate-limiter}

The protection layer, and a common infrastructure prompt in its own right. Capping how much any one client can send keeps a single abuser or a [retry storm](../hazards/retry-storm.md) from taking the system down for everyone.

### [Idempotency](../patterns/messaging/idempotency.md) {#tour-idempotency}

The correctness guardrail. The moment you add retries or an at-least-once queue, the same request can arrive twice; making its effect apply once is how you avoid double-charging a booking — a classic strong-consistency deep dive.

<!-- tour:end -->

## When the interviewer pushes on…
<!--meta block=decide-->

| If they push on… | Non-functional concern | Reach for |
| --- | --- | --- |
| Reads are too slow | Latency | [Cache-Aside](../patterns/caching/cache-aside.md), [CDN](../patterns/distributed/routing/cdn.md), read [replicas](../patterns/distributed/coordination/replication.md) |
| One database can't hold or serve the data | Storage scale | [Sharding](../patterns/distributed/routing/sharding.md), [Consistent Hashing](../patterns/distributed/routing/consistent-hashing.md) |
| Any instance must serve any user | Horizontal scale | [Stateless Service](../patterns/distributed/routing/stateless-service.md), [Load Balancer](../patterns/distributed/routing/load-balancer.md) |
| Traffic spikes swamp the system | Spike handling | [Load Levelling](../patterns/distributed/resilience/load-leveling.md), [Autoscaling](../patterns/distributed/routing/autoscaling.md), [Rate Limiter](../patterns/distributed/resilience/rate-limiter.md) |
| A dependency keeps failing or hanging | Fault isolation | [Circuit Breaker](../patterns/distributed/resilience/circuit-breaker.md), [Retry & Backoff](../patterns/distributed/resilience/retry-backoff.md), [Bulkhead](../patterns/distributed/resilience/bulkhead.md), [Timeout](../patterns/distributed/resilience/timeout-deadline.md) |
| A booking must never double-charge | Exactly-once effect | [Idempotency](../patterns/messaging/idempotency.md), [Saga](../patterns/distributed/coordination/saga.md), [Outbox](../patterns/distributed/coordination/outbox.md) / [Inbox](../patterns/distributed/coordination/inbox.md) |
| Large media bloats the database | Storage tiering | [Object Storage](../patterns/distributed/routing/object-storage.md), [CDN](../patterns/distributed/routing/cdn.md) |
| Data must survive losing a node | Durability / redundancy | [Replication](../patterns/distributed/coordination/replication.md), [Write-Ahead Log](../patterns/distributed/coordination/write-ahead-log.md) |

## Where each deep dive goes deeper
<!--meta block=siblings-->

- [Scalability](./scalability.md) — Vertical versus horizontal scaling, sharding, and consistent hashing in full — the growth deep dive.
- [Performance](./performance.md) — Load balancing, caching, and the latency budget behind every "make it faster" follow-up.
- [Resilience](./resilience.md) — Circuit breakers, bulkheads, and retries for the "what happens when it fails?" deep dive.
- [Spike Handling](./spike-handling.md) — Absorb, shed, or scale when traffic suddenly surges — the burst deep dive.
- [CAP Theorem](./cap-theorem.md) — The consistency-versus-availability choice you commit to in the non-functional requirements.
- [Consistency & Replication](./consistency-and-replication.md) — Keeping copies in agreement — replicas, quorums, and logs behind the durability answers.
