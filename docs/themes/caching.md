---
title: Caching
description: "Where to place a cache, how reads and writes flow, and what to evict"
area: themes-data
owner: Oleksandr Derechei
tags: [caching, latency, read-optimization]
status: stable
favourite: true
---

# Caching

Caching trades a little storage and some staleness for a large speed win. The design space is three separate questions: where the cache sits relative to the request, how reads and writes move through it, and what gets evicted when it fills.

## The question
<!--meta block=description-->

A cache is a bet that the same data will be asked for again soon, and that a copy kept somewhere faster is worth keeping. Memory reads take about 100 ns, database reads 1 ms, a cross-continent trip hundreds of ms. But every copy is a second source of truth that can drift or vanish. So "add a cache" is three decisions: where the copy lives, how reads and writes flow through it, and what is evicted when memory fills.

## Explained
<!--meta block=explain-->

A cache keeps a copy of data somewhere faster than where it normally lives, so repeated reads skip the slow trip. Without one, every read pays the full cost of the database, about a millisecond, or of a distant server, hundreds of milliseconds, and the source falls over when traffic grows. Each copy is also a second version of the truth that can go stale, so you decide three things. Where it lives: [in your process](../patterns/caching/in-process-cache.md) (fastest, but each copy of your service holds its own), in a [shared store](../patterns/caching/distributed-cache.md) such as Redis (one extra network hop, one view for all), or at the [network edge](../patterns/distributed/routing/cdn.md) near the user. How writes flow: fill the cache after a miss ([cache-aside](../patterns/caching/cache-aside.md)), the safe default, or write to cache and store together ([write-through](../patterns/caching/write-through.md)) when a read must never be stale. What leaves when memory is full: the entry unused longest, the least often read, or whatever passed its expiry time.

- **Staleness.** A copy can lag its source, so bound it with an expiry time you can defend to users.
- **Stampedes.** When a popular entry expires a crowd hits the source together, so let one request refill it or \[refresh it ahead\](../patterns/caching/refresh-ahead.md).
- **Extra hop.** A shared store adds a network hop per read, so keep the hottest entries in process if that hop matters.

**Example.** A product page gets 1,000 reads a second and the database answers in 5 ms. A shared cache with 90% hits sends only 100 reads a second to the database, a tenfold cut. Entries expire after 60 s, so a price change can show up to a minute late, which is the price you pay. One hot product takes 300 reads a second. When its entry expires and refilling takes 50 ms, about 15 requests reach the database at once. With a rule that only one request refills while the others wait, it is 1. The cache holds 100,000 of 1 million products and drops the least recently used.

## The trade-space
<!--meta block=tradespace-->

**Where to place it** is a spectrum from closest-to-the-request to most-shared. A client-side cache — the browser's HTTP cache, an app's on-device storage — is the fastest of all because the data never leaves the device, but you have the least control over freshness once it's out there. A content delivery network (CDN) or edge cache moves static and semi-static content to points of presence near the user, trading a continental round trip for a single-digit-millisecond one. An external shared cache like Redis or Memcached runs as its own service so every application instance sees the same entries — the default in most designs, at the cost of one network hop. An in-process cache lives in the application's own memory: the fastest server-side option because there's no hop at all, but each instance has its own copy, so entries can diverge and memory is duplicated across the fleet. The [Instagram](../designs/instagram.md) case study pushes media to the edge, and [Bitly](../designs/bitly.md) serves every redirect from memory.

**How reads and writes flow** is the second axis. On reads, the cache can be filled lazily — populated only after a miss — or eagerly refreshed before entries expire. On writes, the choice is where durability sits: write to the store synchronously so a read can never see stale data, or write to the cache now and let the store catch up asynchronously so the caller never waits. Lazy-and-shared is the safe default; the eager and asynchronous variants buy latency at the price of more moving parts and weaker guarantees.

**What to evict** is the third, and it only matters because memory is finite. Least Recently Used (LRU) drops whatever hasn't been touched in the longest time — the balanced default that suits most workloads. Least Frequently Used (LFU) drops whatever is asked for least often, which fits sharply skewed access where a few keys dominate. First-In-First-Out (FIFO) drops the oldest entry regardless of use — dead simple, and rarely the right call. Time-To-Live (TTL) sidesteps the ranking entirely: each entry simply expires after a set time, which is what you want when freshness, not popularity, is the thing that decays.

```mermaid caption="Where can a cache sit — the first placement axis, from closest to the request to most-shared? Each miss falls through to the next, more-shared tier, ending at the origin store."
flowchart LR
    Req["Incoming request"] -->|"check on device first"| CC["Client-side cache"]
    CC -->|"miss, go to nearest PoP"| CDN["CDN / edge cache"]
    CDN -->|"miss, reach app server memory"| IP["In-process cache — no hop"]
    IP -->|"miss, one network hop"| Shared["Shared cache — Redis / Memcached"]
    Shared -->|"miss, authoritative read"| Store[("Origin store")]
```

## Patterns that implement the choice
<!--meta block=tour-->

<!-- tour:start -->

<!-- GENERATED by gen-tours from docs/data/learning-paths.json. Do not edit this block. -->

### [Distributed Cache](../patterns/caching/distributed-cache.md) {#tour-distributed-cache}

A caching service in its own tier — Redis, Memcached — that every application instance reaches over the network, so they all share one view of the cached data. It's where most designs put the cache, precisely because it's shared and outlives any single process.

### [In-Process Cache](../patterns/caching/in-process-cache.md) {#tour-in-process-cache}

Keeps the hottest, smallest data in the application process's own memory, so a hit needs no network hop at all. The fastest cache there is — at the cost of each instance holding its own copy — and a natural L1 in front of a shared tier.

### [Client-Side Cache](../patterns/caching/client-side-cache.md) {#tour-client-side-cache}

Stores data on the user's own device — the browser's HTTP cache, local storage — so a repeated read makes no network request at all. Fastest of all and offline-capable, but with the least control over freshness.

### [Cache-Aside](../patterns/caching/cache-aside.md) {#tour-cache-aside}

The application checks the cache first, and on a miss reads the source of truth and populates the cache itself. It's the default read strategy precisely because the cache can be empty, stale, or evicted at any moment without breaking correctness — the source is still there to fall back to.

### [Read-Through](../patterns/caching/read-through.md) {#tour-read-through}

Moves the fetch-or-populate dance into the caching layer itself: callers ask the cache, and the cache asks the backing store on a miss. Every call site stops reimplementing the same logic — and the single load path is where [request coalescing](../patterns/distributed/resilience/request-coalescing.md) can shield the store from a herd of simultaneous misses.

### [Write-Through](../patterns/caching/write-through.md) {#tour-write-through}

Every write updates the cache and the backing store together, synchronously, so a read that follows a write can never see a stale value. The price is write latency and a cache that fills with data nobody may ever read back.

### [Write-Behind](../patterns/caching/write-behind.md) {#tour-write-behind}

Acknowledges a write the moment it lands in the cache and flushes it to the store asynchronously, usually in batches. Writes feel instant to the caller; the durability guarantee shifts to whatever drains the flush queue, and a crash before the flush loses data.

### [Refresh-Ahead](../patterns/caching/refresh-ahead.md) {#tour-refresh-ahead}

Instead of waiting for a [hot key](../hazards/hot-key.md) to expire and miss, a background reload refreshes it just before its time to live (TTL) runs out, so the entry never actually goes cold under load. It's the direct antidote to a popular key expiring and triggering a stampede.

### [CDN](../patterns/distributed/routing/cdn.md) {#tour-cdn}

Pushes static and semi-static content to edge nodes near the requester, so a read is answered a few milliseconds away instead of crossing a continent to origin. It's caching applied at the network layer — the same miss-then-fill logic, moved to where latency is geography, not disk.

<!-- tour:end -->

## When to reach for what
<!--meta block=decide-->

| If you need… | Approach | Reach for |
| --- | --- | --- |
| A shared cache across many app instances | Put it in its own tier | [Distributed Cache](../patterns/caching/distributed-cache.md) |
| Sub-millisecond reads on tiny, hot data | Keep it in the process | [In-Process Cache](../patterns/caching/in-process-cache.md) |
| Zero network calls, offline support | Cache on the device | [Client-Side Cache](../patterns/caching/client-side-cache.md) |
| Read-heavy traffic hitting a slow source | Cache the read lazily | [Cache-Aside](../patterns/caching/cache-aside.md), [Read-Through](../patterns/caching/read-through.md) |
| Reads that must never return stale data | Write both, synchronously | [Write-Through](../patterns/caching/write-through.md) |
| Writes that can't block the caller | Buffer, flush async | [Write-Behind](../patterns/caching/write-behind.md) |
| A hot key that herds the source when it expires | Refresh before expiry | [Refresh-Ahead](../patterns/caching/refresh-ahead.md) |
| Static assets served to a global audience | Push to the edge | [CDN](../patterns/distributed/routing/cdn.md) |
| A general-purpose eviction default | Drop what's gone unused longest | LRU |
| Sharply skewed access, a few keys dominating | Keep the frequently-read | LFU |
| Data that goes stale on a clock, not on use | Expire on a timer | TTL |

## Related areas
<!--meta block=siblings-->

- [Performance](./performance.md) — Caching is one arm of performance; the theme also spans load balancing and cutting memory churn.
- [Handling Spikes](./spike-handling.md) — An edge or read cache is the cheapest way to absorb a sudden surge before it reaches origin.
- [Consistency & Replication](./consistency-and-replication.md) — The mechanics behind a cache's staleness window — how copies of data are kept in agreement.
