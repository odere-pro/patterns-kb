---
title: Cache Stampede
description: A popular key expires and a herd of misses hits the source at once
area: hazards
owner: Oleksandr Derechei
tags: [caching, latency, throughput]
status: stable
aliases: [dogpile, single-flight]
solves: [one popular entry expires and hundreds of identical queries hit the database at once, traffic is flat but the database sees a burst of duplicate reads on a regular clock, many requests rebuild the same expensive value in parallel, database load spikes every few minutes matching our expiry time]
favourite: true
---

# Cache Stampede

A single hot cache entry expires, and the flood of concurrent requests that all miss at the same instant stampede straight through to the source of truth — turning one query into thousands and overwhelming the very database the cache was there to protect.

## What it is
<!--meta block=description-->

A **cache stampede** — also called a dogpile — is what happens when one heavily-read cache entry expires and every request that wanted it misses at once. With the entry gone, there is nothing to serve them, so they all fall through to the source of truth simultaneously and try to rebuild the same value in parallel. A single expiry becomes a synchronized wave of identical, expensive queries.

The trap is that everything looks healthy right up to the moment it isn't. A cache with a 99% hit rate is doing its job; the source sees a trickle of traffic and is sized for that trickle. Then a popular key's time-to-live elapses, the hit rate for that key instantly drops to zero, and the source is asked to absorb the full unshielded read volume in the width of a single refresh window. The cache didn't fail — it did exactly what it was told, and the failure is in what happens the instant a hot entry is briefly absent.

## Explained
<!--meta block=explain-->

A cache stampede is a crowd of identical requests that all hit the database at once because a popular cached value has just expired. The cache did nothing wrong: it served the key at a 99% hit rate, so the database was sized for a trickle, and then the entry's time to live ran out and every request for that key missed together. It gets worse by itself, because the slower the database gets, the longer the entry stays missing and the more requests pile on. Fixed expiry times on busy keys, and many keys sharing one expiry after a restart or flush, make it recur on a clock. Choose protection built into the cache layer over asking each caller to behave. Let only the first miss rebuild the value while the rest wait for its result, which is single-flight. Serve the old value for a few seconds while that rebuild runs, at the cost of slightly stale data. Reload hot keys shortly before they expire, and add a random few seconds to each expiry so keys do not go cold together.

**Example.** A product page key is read 2,000 times a second and rebuilt by a 3 s query. The database handles about 50 such queries a second, so 150 in 3 s. When the 60 s expiry hits, every read in the next 3 s misses and starts a query: 2,000 times 3 is 6,000 identical queries, 40 times capacity, and unrelated pages slow down too. With single-flight, 1 query runs and the other readers wait for it. With serve-stale as well, they get the 60-second-old value at once. The cost is that price changes can show up to 3 s late, and the lock needs a cap so a crashed rebuilder cannot block the key forever.

## How it happens
<!--meta block=causes-->

```mermaid caption="The herd is created by the gap between one entry expiring and any single request refilling it — every request that arrives in that gap misses."
flowchart TB
    A["Hot key cached with a fixed TTL"] -->|"TTL elapses, entry evicted"| B["Key goes cold"]
    B -->|"gap before any refill"| C["N concurrent requests all miss"]
    C -->|"no coordination between callers"| D["Every miss queries the source"]
    D -->|"duplicates not suppressed"| E["One query becomes thousands at once"]
    E -->|"source overloaded"| F["Latency climbs for everyone"]
```

- A fixed TTL on a popular key: the busier the key, the more requests land in the refill gap the instant it expires.
- [Cache-aside](../patterns/caching/cache-aside.md) reads with no coordination — each caller that misses independently loads and repopulates, so nothing suppresses the duplicates.
- Synchronized expiry: many keys sharing the same TTL, or a whole cache flushed or restarted at once, so a crowd of entries goes cold together (a cold-cache stampede after a deploy or scale-up).
- A source expensive enough that rebuilding one value is slow, widening the window in which still more requests pile up behind the first.

## What it costs
<!--meta block=cost-->

- **The source takes the full unshielded load.** The database is provisioned for the post-cache trickle, not the raw request rate; a stampede hands it the raw rate with no warning.
- **The work is almost entirely wasted.** Thousands of requests compute the identical value at the same time; all but one of those computations is redundant.
- **It cascades.** A saturated source slows every query routed through it, not just the [hot key](./hot-key.md)'s — so an expiry on one entry degrades unrelated traffic and can tip into a broader outage.
- **It recurs on a clock.** Left unaddressed, the stampede repeats every time that key's TTL elapses, making it a predictable, self-inflicted load spike rather than a one-off.

## How to avoid it
<!--meta block=mitigation-->

Two moves defuse it. **[Request coalescing](../patterns/distributed/resilience/request-coalescing.md)** (single-flight): when several requests miss the same key at once, let only the first one rebuild the value while the rest wait for its result — collapsing the herd back into a single source query. And **proactive refresh** (cache warming): instead of waiting for a hot key to expire and miss, reload it in the background just before its TTL runs out, so the entry is never actually absent under load. A short jitter added to TTLs also helps, by desynchronizing entries that would otherwise expire together.

## How it relates
<!--meta block=relationships-->

<!-- relationships:start -->

<!-- GENERATED by gen-relations from docs/data/relations.json. Do not edit this block. -->

**Often confused with**

- [Thundering Herd](./thundering-herd.md) — The general form: any crowd released at once, not only cache missers
- [Metastable Failure](./metastable-failure.md) — A stampede that keeps the cache from refilling can become a metastable failure.

**Mitigated by**

- [Refresh-Ahead](../patterns/caching/refresh-ahead.md) — Reload the hot key before its TTL expires, so it never goes cold under load
- [Read-Through](../patterns/caching/read-through.md) — One load path per key lets the cache coalesce concurrent misses into a single fetch
- [Request Coalescing](../patterns/distributed/resilience/request-coalescing.md) — Bound the recomputation to a single in-flight call, so only one miss reaches the source

<!-- relationships:end -->
