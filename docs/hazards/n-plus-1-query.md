---
title: N+1 Query
description: One query per row instead of one batched query — 1 + N round-trips
area: hazards
owner: Oleksandr Derechei
tags: [performance, data-access, latency, throughput]
status: stable
aliases: [N+1 problem, N+1 selects]
solves: [the endpoint issues one query per row inside a loop, a list of 100 items fires 101 database queries, the page got slower as the result set grew even though each query is fast, query count scales with the rows returned instead of staying constant]
---

# N+1 Query

A request loads a list of N parent rows, then issues one more query for each row to fetch its related child — turning what should be a single joined or batched query into 1 + N database round-trips. It looks fine on the handful of rows in development and collapses under a production-sized result set.

## What it is
<!--meta block=description-->

An **N+1 query** is a request that fetches a list of N parent rows with a single query, then issues one more query for every parent to load its related child — so displaying N items costs 1 + N queries where one or two would do. The name is the arithmetic: 1 query for the parents, N for the children. Picture an endpoint returning 100 events, each with its venue: the code loads the 100 events in one query, then loops and looks up each event's venue individually — 100 more queries, 101 in total.

What makes it insidious is that it is rarely written on purpose. A lazy-loading ORM (object-relational mapper) or a per-item resolver makes the extra queries invisible — reading `event.venue` inside a loop looks like a field access, not a network round-trip to the database. And it hides during development, where the result set is tiny: five rows means six queries, imperceptible. The same code path meets a production-sized list of ten thousand rows and quietly becomes ten thousand and one queries, and the request that was instant in testing now times out.

## Explained
<!--meta block=explain-->

An N+1 query is a request that loads a list of N rows with one query, then runs one more query for each row to fetch its related data, so N items cost 1 + N queries when one or two would do. It is rarely written on purpose. A lazy-loading ORM, a library that fetches related rows only when you touch them, makes reading event.venue inside a loop look like a field access, not a trip to the database. It hides in development, where five rows means six quick queries, and appears in production, where the same code meets hundreds of rows and the page time grows with the row count. Collapse the child queries into one. A batching loader gathers the keys requested during one tick and runs one query for all of them. A join or eager load fetches parents and children together. Pick a join when one place owns the read, and batching when many places ask for the parents. When one shape is read far more than it changes, precompute it as a materialized view, a stored result that is refreshed on a schedule. A review rule fails on the next caller, so make the data layer raise an error on any unplanned lazy load.

**Example.** An endpoint returns 100 events with their venues. Each query costs 2 ms, so the lazy version runs 1 + 100 = 101 queries, 202 ms. With 5 test rows it ran 6 queries, 12 ms, and nobody noticed. At 50 requests a second, production sends 5,050 queries a second. A batched version runs one query for the events and one for the venues with a list of their keys, 2 queries and about 4 ms. The cost is that the keys now travel in one large list, so cap its size, and strict loading will fail the tests where someone brings the loop back.

## How it happens
<!--meta block=causes-->

```mermaid caption="One query returns the parents; each parent then triggers its own child query inside the loop, so the total is 1 + N — here 1 + 100 = 101 — instead of a single batched or joined query."
flowchart TB
    A["1 query — fetch N parent rows"] -->|"SELECT * FROM events"| B{"for each of the N rows"}
    B -->|"touch the lazy relation"| C["+1 query — fetch that row's child"]
    C -->|"SELECT venue WHERE id = ? · once per row"| D["1 + N queries total"]
```

- **A lazy-loading ORM.** A relation is configured to load on first access, and that access happens inside a loop over the parents — so each iteration silently fires its own query without any of it appearing in the code.
- **A resolver that fetches per item.** A GraphQL or representational state transfer (REST) resolver loads a related entity once for every element of a list — 100 events, each triggering a separate venue lookup — with no batching between the calls.
- **Iterating a collection and touching a relation on each element,** so the ORM's convenient association traversal (`order.customer`, `event.venue`) turns into one round-trip per row.
- **Serializers or view code that walk nested objects,** dereferencing an un-prefetched association for every parent as the response is rendered.

## What it costs
<!--meta block=cost-->

- **Latency scales with N.** Each of the N child queries is a separate network round-trip to the database, and they run one after another — so response time grows linearly with the size of the result set, and the round-trip cost, not the query work, dominates.
- **The database is hammered with tiny queries.** Instead of planning and running one query once, the engine parses, plans, and executes N nearly-identical trivial lookups, and the connection pool churns through them for a single request.
- **It degrades silently.** On a handful of rows in development it is invisible; the identical code path against a production-sized result set becomes thousands of queries and a request that times out — with no error to point at, only slowness.
- **It caps throughput.** Each request holds its database connection far longer while it drains N queries, so under real load the pool saturates and unrelated requests queue behind it.

## Getting out
<!--meta block=mitigation-->

Collapse the N child queries into one. The direct fix is to **batch** the child fetch into a single query keyed by the parent ids — one `SELECT ... WHERE parent_id IN (…)` in place of one query per parent. The DataLoader pattern automates exactly this: it coalesces the per-item requests made during one tick into a single batched call, so a resolver can keep asking for one venue at a time while only one query is actually issued.

Alternatively, fetch parents and children together with a **JOIN**, or an eager-load / prefetch, so the relation arrives alongside the parents in one round-trip instead of being pulled lazily row by row. And when the joined shape is read far more often than it changes, precompute it as a **[materialized view](../patterns/distributed/coordination/materialized-view.md)**, turning the read into a single lookup against an already-assembled result. The through-line under all three is the same: stop asking once per row — ask once for the whole set.

Fixing today's loop is not the same as preventing tomorrow's. Most data-access layers can be told to treat an unplanned lazy load as an error rather than as a query — Rails calls it strict loading, and offers both a strict form that raises on any lazily loaded association and a narrower one that raises only where the access would produce N+1. Turn it on for the queries you have already planned, and a reintroduced loop fails in a test run instead of degrading quietly in production. The cost is that the layer now refuses convenience: every association a caller wants has to be declared in the query that fetches it.

## How it relates
<!--meta block=relationships-->

<!-- relationships:start -->

<!-- GENERATED by gen-relations from docs/data/relations.json. Do not edit this block. -->

**Specializes**

- [Chatty I/O](./chatty-io.md) — One instance of a wider failure that also covers per-field HTTP APIs and per-record file writes

**Mitigated by**

- [Batching](../patterns/concurrency/batching.md) — Coalesce the per-item fetches into one batched, keyed query — the DataLoader move
- [Materialized View](../patterns/distributed/coordination/materialized-view.md) — Precompute the joined shape so the N follow-up queries disappear entirely

<!-- relationships:end -->
