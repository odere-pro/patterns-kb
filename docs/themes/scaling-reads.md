---
title: Scaling Reads
description: "Escalating from a single database to replicas, caches, and the edge as reads grow"
area: themes-scale
owner: Oleksandr Derechei
tags: [scalability, read-optimization, latency]
status: stable
aliases: [read scaling]
---

# Scaling Reads

The read-path scaling ladder — climb from one database up through indexing and materialized views, then read replicas and sharding, then an application cache, and finally the content delivery network (CDN) edge. Each rung buys more read capacity at more operational cost; you stop climbing the moment the load fits.

## The question
<!--meta block=description-->

Read-heavy is the normal shape of a successful product, with read-to-write ratios from 10:1 past 100:1. CPU, memory and disk I/O have hard ceilings, so past them no query tuning makes one database serve more reads. This theme is the ladder for that case, cheapest rung first: less work inside the database, then more copies and slices of it, then caching in memory and at the edge.

## Explained
<!--meta block=explain-->

Scaling reads means serving the same data to more people without sending every request to your one database. Read-heavy is the normal shape: ratios start near 10 reads per write and pass 100. You climb a ladder and take the cheapest rung first. Do less work inside the database: index the columns you filter on, store joined results in a [materialized view](../patterns/distributed/coordination/materialized-view.md), or build your own [index table](../patterns/distributed/coordination/index-table.md). Then add [replicas](../patterns/distributed/coordination/replication.md), which are extra copies that serve reads, and [shard](../patterns/distributed/routing/sharding.md) only when the dataset outgrows one machine. Reach for a cache ([cache-aside](../patterns/caching/cache-aside.md) in the app, a [CDN](../patterns/distributed/routing/cdn.md) at the edge) last, because it adds staleness and new failure modes.

- **Replica lag.** Replicas trail the primary. Decide how many seconds old a read may be.
- **Invalidation.** A cache serves stale data. Give entries a time limit or a version in the key.
- **Stampede on expiry.** A hot entry expiring makes every reader miss at once. Let one request rebuild it while the rest wait.

**Example.** A listing page takes 20,000 reads a second. The primary serves 4,000, so 4 replicas plus the primary cover it, at the price of reads a few seconds old. A cache with a 90% hit rate would instead leave 2,000 reads a second for the database. Then the hottest listing expires while 10,000 readers a second want it. A rebuild takes 200 ms, so 2,000 requests miss together and hit the database at once. If one request per app server rebuilds and the others wait, 20 servers send 20 queries, not 2,000.

## The tradespace
<!--meta block=tradespace-->

Every rung trades something. Indexing and denormalization trade write cost and storage for faster reads — and a compound index only helps queries whose leading columns it matches: an index on `(status, created_at)` speeds a filter on `status`, or on both, but does nothing for a filter on `created_at` alone, so column order is a real decision, not a formality. Replication trades a staleness budget: how many seconds a follower may lag before a stale read becomes a correctness bug is what decides synchronous versus asynchronous. Sharding trades query locality: pick a key that keeps each request on one shard, or pay fan-out on every read.

Caching moves the trade from throughput to freshness — and to the failure modes of concentration. A cache assumes load spreads across many keys; when everyone wants the same key, one node's CPU and network become the bottleneck even though the value sits trivially in memory. Two answers: **[request coalescing](../patterns/distributed/resilience/request-coalescing.md)** (single-flight) collapses concurrent misses for one key into a single backend fetch, so the database sees one request per app server instead of one per user; and **cache-key fan-out** stores identical copies of a scorching value under a handful of keys, so 500k req/s for one key becomes 50k across ten. Both cost something — coalescing needs a shared in-flight future, fan-out multiplies memory and complicates invalidation. The [Facebook News Feed](../designs/fb-news-feed.md) and [Google News](../designs/google-news.md) case studies show precomputed feeds and cached reads at scale, and [Gopuff](../designs/gopuff.md) pairs fast aggregated reads with serialized orders.

Expiry is its own hazard. When a hot entry's time to live (TTL) lapses, every reader misses at the same instant and stampedes the database — a self-inflicted spike. Serializing rebuilds behind a lock helps but is fragile if the rebuild is slow; **probabilistic early refresh** is smarter, giving each request a small, rising chance of refreshing in the background as the TTL nears, so the load smears across the last few minutes instead of spiking at zero. And invalidation itself is the famously hard part: **versioned cache keys** — bump a version in the row's own transaction so readers move to a fresh key with no delete race — work cleanly for single entities like a profile, while computed results such as feeds and search often need a small **deleted-items cache** filtered in front of the big structure while it rebuilds behind.

```mermaid caption="The read-path ladder: exhaust in-database optimization first, scale the database horizontally next, and reach for external caching last — climbing only as far as the load demands."
flowchart TB
    Q["Reads outgrowing one database"]
    Q -->|"do less work first"| A["Index, denormalize, materialized views"]
    A -->|"still saturated"| B{"Read volume or dataset size"}
    B -->|"Read volume"| C["Read replicas: multiply copies"]
    B -->|"Dataset size"| D["Shard: split data across nodes"]
    C -->|"still too slow"| E["Cache hot keys in memory (cache-aside)"]
    D -->|"still too slow"| E
    E -->|"shared responses"| F["Push shared responses to the CDN edge"]
```

## The tour
<!--meta block=tour-->

<!-- tour:start -->

<!-- GENERATED by gen-tours from docs/data/learning-paths.json. Do not edit this block. -->

### [Materialized View](../patterns/distributed/coordination/materialized-view.md) {#tour-materialized-view}

The first rung is to do less work per read. A materialized view precomputes an expensive query — a multi-table join, or an aggregate like average rating per product — into a maintained table that a background job refreshes, so a page load reads one row instead of recomputing the join every time. It trades storage and write-time upkeep for reads that no longer pay the computation. Denormalization is the same move in miniature; a materialized view is denormalization the database keeps up to date for you.

### [Index Table](../patterns/distributed/coordination/index-table.md) {#tour-index-table}

When the store has no secondary index for the field you filter on, a second table keyed by that field turns a full scan into two cheap lookups. You pay in storage and in keeping it in step with the data, and you own that staleness.

### [Inverted Index](../patterns/distributed/coordination/inverted-index.md) {#tour-inverted-index}

Reads for a keyword never scan the documents. The index lists the documents for each term, so the read touches only those lists and write cost is paid once at indexing time.

### [Replication](../patterns/distributed/coordination/replication.md) {#tour-replication}

When one primary can no longer serve the read volume — a rough interview trigger is somewhere around 50k–100k reads/sec on a well-indexed database — copy it. Leader–follower replication sends every write to the primary and spreads reads across read-only followers, so read capacity grows with the number of copies (and a follower can be promoted on failover). The catch is replication lag: an asynchronous follower can be seconds stale, so a user may not see their own just-written change — the classic trade of synchronous consistency against asynchronous speed.

### [Sharding](../patterns/distributed/routing/sharding.md) {#tour-sharding}

Replicas multiply reads, but every copy still holds the whole dataset. Sharding splits the data across nodes by key, so each node answers from a smaller slice and reads spread across the fleet. On the read path it earns its keep mainly when the dataset itself is too big for one machine, or when a natural key — functional or geographic partitioning — keeps most queries on a single shard; a query that must fan out to every shard gives much of the gain back.

### [Cache-Aside](../patterns/caching/cache-aside.md) {#tour-cache-aside}

Real read traffic is wildly skewed — millions hit the same viral post, thousands the same product page — so the same rows get re-fetched endlessly. A cache-aside layer checks an in-memory store first and falls back to the database on a miss, populating the cache on the way back; hot data stays resident at sub-millisecond latency while cold data expires by time to live (TTL). The hard part is invalidation — short TTLs as a safety net, plus active invalidation ([write-through](../patterns/caching/write-through.md), versioned keys) for data that must stay fresh.

### [CDN](../patterns/distributed/routing/cdn.md) {#tour-cdn}

The last rung pushes the cache out to the user. A content delivery network (CDN) caches read-heavy responses — modern ones cache application programming interface (API) responses and query results, not just static assets — at edge locations near the client, so a request is served nearby instead of round-tripping to a distant origin, and origin load drops sharply for shared content. It only pays off for data shared across users; personal, per-requester data gets no hit-rate benefit and should not be cached at the edge.

<!-- tour:end -->

## How to decide
<!--meta block=decide-->

| If you need… | Lean | Reach for |
| --- | --- | --- |
| Queries slowing as the dataset grows | Do less work per read | Indexing + [Materialized View](../patterns/distributed/coordination/materialized-view.md) |
| The store can only look records up by id, and everything else is a full scan | Build the index yourself | [Index Table](../patterns/distributed/coordination/index-table.md) |
| Read volume outgrowing one primary | Multiply copies | [Replication](../patterns/distributed/coordination/replication.md) |
| Dataset too big for one node, or reads keyed to a region or domain | Partition it | [Sharding](../patterns/distributed/routing/sharding.md) |
| The same hot rows re-fetched endlessly | Cache in memory | [Cache-Aside](../patterns/caching/cache-aside.md) |
| Shared responses served to a global audience | Push to the edge | [CDN](../patterns/distributed/routing/cdn.md) |
| A single key too hot for one cache node | Coalesce and fan out | Request coalescing + key fan-out (within [Cache-Aside](../patterns/caching/cache-aside.md)) |

## Sibling themes
<!--meta block=siblings-->

- [Scalability](./scalability.md) — The general capacity theme; these read-path patterns overlap with it, but here they are ordered as a single ladder climbed one rung at a time as reads grow.
- [Caching](./caching.md) — The caching rungs this ladder ends on, treated in depth — invalidation strategies, stampede protection, and the cache patterns themselves.
- [Consistency & Replication](./consistency-and-replication.md) — Replicas and caches buy read capacity by trading freshness; this is the staleness side of that same bargain.
