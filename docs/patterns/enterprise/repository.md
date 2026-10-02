---
title: Repository
description: Collection-like interface over data storage
area: enterprise
owner: Oleksandr Derechei
tags: [persistence, decoupling, testability, data-access]
status: stable
aliases: [repo]
solves: [the same SQL query is copy-pasted in five different service files, I cannot test my business logic without spinning up a real database, raw SQL strings are scattered all through my domain code, I want to swap Postgres for a document store but queries are hardcoded everywhere, my service classes know way too much about table names and column layouts]
---

# Repository

Presents your stored domain objects as if they sat in an in-memory collection — you add, remove, and query them, while the messy mapping to rows and tables stays hidden behind the seam.

## What it is
<!--meta block=description-->

Query strings and storage calls leak into business logic, the same lookup is rewritten in five places, and the domain can only be tested against a live database. A repository gives domain code a collection-like interface over a data store: ask for objects by identity or criteria, add or remove them as if the set lived in memory. SQL or an ORM sits behind it.

## Explained
<!--meta block=explain-->

A repository gives your domain code a collection-like interface over a data store. You ask it for objects by identity or by a named query, such as findById or findActiveSubscribers, and add or remove them as if the whole set lived in memory. Behind it sits the SQL, the ORM (object-relational mapper) session or the remote call. Business code then reads as intent, a lookup is written once, and a test swaps in an in-memory fake with no database. Choose it over calling the ORM directly when the domain is rich enough that storage details would leak into the rules, or the same query is repeated in several places. For plain create-read-update-delete over tables, where the ORM already reads clearly, a repository is only a layer.

- **Thin wrappers.** A method that wraps one ORM call adds nothing, so give each method a domain name or drop it.
- **Generic repositories.** A Repository of anything ignores \[aggregate\](../ddd/aggregate.md) boundaries, so make one per aggregate root.
- **Hidden cost.** Hiding the store hides its cost, so findAll can return a million rows: require paging or a limit.

**Example.** A subscription query, active subscribers with an expired card, is written in 5 places. One SubscriberRepository with findActiveWithExpiredCard() replaces them, and a unit test uses an in-memory fake that returns 3 prepared subscribers in 1 ms. A developer later adds findAll() and a report calls it on 1,000,000 rows, taking the service down. The team removes it and adds findPage(offset, 100), so a caller must say how many rows it wants. The cost is that every new query needs a method on the repository first.

## How it works
<!--meta block=structure-->

```mermaid caption="Where does the query actually run? The service asks by name and gets domain objects back; only the implementation inside the seam knows there is SQL, and a test binds that same name to a fake."
flowchart LR
    Svc["Billing Service"]
    Repo["InvoiceRepository interface"]
    subgraph Seam["Behind the seam"]
        Impl["SQL implementation"]
        DB[("invoices table")]
    end
    Fake["In-memory fake"]:::ext
    Svc -->|"1 findOverdue"| Repo
    Repo -->|"2 bound to one implementation"| Impl
    Impl -->|"3 SELECT overdue rows"| DB
    DB -->|"4 rows"| Impl
    Impl -->|"5 Invoice objects"| Svc
    Repo -.->|"tests bind here instead"| Fake
    classDef ext stroke-dasharray:4 4
```

## Variations
<!--meta block=variations-->

- **Generic repository** — A single `Repository<T>` parameterised over entity type and wired up once. Convenient, but tends to expose a lowest-common-denominator CRUD (create, read, update, delete) surface that ignores what each aggregate actually needs to query.
- **Per-aggregate repository** — One hand-written repository per aggregate root, exposing only the queries the domain really uses. More verbose, but honest about intent and easy to reason about.
- **Specification-based queries** — Compose query criteria as first-class specification objects instead of a sprawl of `findByX` methods, so callers build predicates the repository translates. The specification is a domain object in its own right, combinable with and, or and not — and the same object answers "does this instance satisfy the rule?" in memory, which is why the criterion used to fetch overdue invoices is the criterion used to validate one.
- **In-memory [fake](../testing/fake-object.md)** — A collection-backed implementation of the same interface, letting domain and service tests run fast without touching a real database.
- **Read-side query repository** — Under CQRS (Command Query Responsibility Segregation), split the write repository that loads full aggregates from thin read repositories that return denormalised, view-shaped projections.
- **Query object instead of a repository** — Drop the repository from the read path entirely: each query becomes its own object, dispatched to a handler that issues exactly the query that screen needs. Nothing accumulates on a shared interface, which is the failure mode the generic repository above has — and the write side keeps its repository, because loading an aggregate is a different job from projecting a view.

## Trade-offs
<!--meta block=tradeoffs-->

### Pros
<!--meta polarity=pro-->

- **Isolates domain logic from persistence** — swap SQL for a document store without touching callers.
- **Centralises query logic in one place** instead of scattering SQL across services.
- **Makes the domain testable** by substituting an in-memory fake for the real store.
- **Reads as domain language** rather than raw storage calls, keeping intent legible.

### Cons
<!--meta polarity=con-->

- **Easily degenerates into a thin pass-through** over the ORM that adds indirection with no value.
- **A generic** `Repository<T>` tempts you toward leaky CRUD that ignores aggregate boundaries.
- **Hiding the datastore can hide its cost** — an innocent `findAll` may drag back a million rows.
- **Another layer to maintain**; small CRUD apps may be simpler calling the ORM directly.

## When to use it
<!--meta block=usage-->

### Reach for it when
<!--meta polarity=when-->

- **Your domain model is rich enough** that persistence details would otherwise bleed into business logic.
- **You want to unit-test domain and service code** without standing up a live database.
- **You need one clear place to express** and reuse the queries an aggregate supports.

### Avoid when
<!--meta polarity=avoid-->

- **The app is essentially CRUD over tables** and an ORM or query builder already reads clearly.
- **Each method would only wrap** a single ORM call, adding a layer for its own sake.
- **You need fine-grained control over query shape** that a uniform interface would obscure.

## Code sketch
<!--meta block=sketch-->

```typescript summary="TypeScript — an interface and an in-memory implementation"
interface Repository<T> {
  findById(id: string): Promise<T | null>;
  findAll(): Promise<T[]>;
  add(entity: T): void;
  remove(entity: T): void;
}

// A concrete, collection-backed implementation — ideal for tests.
class InMemoryUserRepository implements Repository<User> {
  private store = new Map<string, User>();

  async findById(id: string): Promise<User | null> {
    return this.store.get(id) ?? null;
  }

  async findAll(): Promise<User[]> {
    return [...this.store.values()];
  }

  add(user: User): void {
    this.store.set(user.id, user);
  }

  remove(user: User): void {
    this.store.delete(user.id);
  }
}
```

## In the wild
<!--meta block=wild-->

- **Spring Data JPA** — Generates repository implementations at runtime from interface method names like findByLastNameAndActive; teams escape to @Query for anything the naming scheme cannot express, and pass Pageable parameters to keep list methods bounded. {#wild-spring-data-jpa}
- **Doctrine ORM** — Ships an EntityRepository per entity that callers extend with domain-specific finder methods, typically built on the QueryBuilder or DQL so raw SQL stays behind the repository seam. {#wild-doctrine-orm}

## In production
<!--meta block=production-->

### Tuning knobs
<!--meta polarity=knob-->

- **fetch strategy** — lazy or eager loading of related entities behind each finder; the wrong default turns one innocent findById into a query storm or drags half the object graph into memory
- **transaction boundary** — whether each call commits itself or joins a unit of work owned by the caller; per-call commits quietly make multi-aggregate operations non-atomic
- **result-set bound** — whether list-returning methods paginate or cap; an unbounded findAll works on the demo dataset and melts on the production table
- **read caching** — whether repeated lookups in one request hit the store or a per-request identity map; trades staleness for load, and hides writes made outside the seam

### Signals to watch
<!--meta polarity=signal-->

- **queries per request** — the N+1 problem shows up here first — a list endpoint that issues one query per row looks like clean domain code
- **rows fetched per call** — a method whose row count grows with the table is a missing bound waiting to be found by production
- **per-method latency at the seam** — the interface is the natural place to instrument; p95 by method name tells you which query the domain actually pays for

### Failure modes under load
<!--meta polarity=failure-->

- **N+1 query storm** — a collection-like interface plus lazy relations: iterating the result fires one query per element, invisible in the calling code
- **unbounded findAll** — the collection illusion hides cost — a method that returned 50 rows at launch returns 5 million two years later and takes the connection pool with it
- **full-aggregate reads** — loading the whole aggregate to answer a two-field question; read-heavy paths deserve thin, view-shaped queries instead

### Readiness checklist
<!--meta polarity=check-->

- put a bound or pagination on every method that returns a list — no exceptions for tables that are small today
- run the same contract test suite against the real implementation and the in-memory fake, or the fake will drift into a lie
- keep transaction control in the caller — a service or unit of work — not inside repository methods
- watch query count per request in a staging environment and treat a sudden multiplication as a regression

## Where it shows up
<!--meta block=fluency-->

<!-- fluency:start -->

<!-- GENERATED by gen-tours from docs/data/learning-paths.json. Do not edit this block. -->

- [Enterprise Application Patterns](../../themes/enterprise-application-patterns.md) — Give domain objects a collection-like interface over the data store. {#fluency-enterprise-application-patterns}

<!-- fluency:end -->

## How it relates
<!--meta block=relationships-->

<!-- relationships:start -->

<!-- GENERATED by gen-relations from docs/data/relations.json. Do not edit this block. -->

**Combines with**

- [Unit of Work](./unit-of-work.md) — The repo reads; the unit of work commits the changes
- [Data Mapper](./data-mapper.md) — Repositories sit on top of a data mapper
- [Aggregate](../ddd/aggregate.md) — One repository per aggregate root
- [Service Layer](./service-layer.md) — Services orchestrate repositories
- [Fake Object](../testing/fake-object.md) — The interface is what lets a fake stand in for storage
- [Entity](../ddd/entity.md) — Fetches entities by the identity that defines them
- [Identity Map](./identity-map.md) — A repository keeps one object per row by consulting the identity map.
- [Specification](./specification.md) — A repository can accept a specification as its query.

<!-- relationships:end -->
