---
title: Data Mapper
description: "Moves data between objects and a database, decoupled"
area: enterprise
owner: Oleksandr Derechei
tags: [persistence, decoupling, testability]
status: stable
solves: [my entity classes all extend a database base class so I cannot construct one in a test, someone renamed a column and now my business rules will not compile, my object model uses inheritance but the tables are flat and nothing lines up, another team owns the schema and refuses to reshape it around my classes, I want to write a plain class with real behavior instead of a bag of columns]
---

# Data Mapper

Moves data between plain domain objects and the database that stores them, so neither the object model nor the schema has to bend to accommodate the other.

## What it is
<!--meta block=description-->

A domain model wants inheritance and rich behaviour while a relational schema wants normalized tables, and wiring one into the other bends both. A data mapper is a separate layer that moves data between plain objects and tables: it builds an object from a row and takes it apart into columns. Neither side knows about the other, so each changes on its own schedule.

## Explained
<!--meta block=explain-->

A data mapper is a layer whose only job is moving data between plain in-memory objects and database tables. It builds an object from a row and takes an object apart into columns, and neither side knows about the other: the object has no SQL and the schema ignores the object model. A schema change that alters no behaviour stops at the mapper, and a model change that needs no new storage never reaches the database team. Choose it over an [active record](active-record.md), where each object saves itself, when the domain has real behaviour, inheritance or rules that do not map to one table, or when the schema is old or owned by another team. For a thin wrapper over one table the extra layer only adds code.

- **Two shapes to keep in step.** Object graph and schema drift apart, so cover the mapping with tests that save and reload.
- **Chatty loads.** A naive mapper loads a graph one query at a time, so load related rows with a join or batched query.
- **Duplicate objects.** Without an \[identity map\](identity-map.md), the same row becomes two objects whose edits overwrite each other.

**Example.** A table renames zip to postal_code. Only the mapper changes: one file, while 30 methods on the Customer object stay as they are. Loading 50 orders and then the lines of each takes 1 + 50 = 51 queries. Fetching all lines with one query where order_id is in the list takes 2. Without an identity map, two code paths in one request load customer 7 as separate objects, one changes the address, the other changes the phone, and the second save overwrites the first. The cost is the mapper code and a mapping test for each object.

## How it works
<!--meta block=structure-->

```mermaid caption="Where does SQL stop? Steps 2, 3 and 7 are the only places a table or column name appears, and all three happen inside the mapper — everything in the boundary is a plain object you can build in a test."
flowchart LR
    subgraph Domain["Domain side — no SQL, no table names"]
        App["Application code"]
        Obj["Order object"]
    end
    Mapper["Order Mapper"]
    DB[("orders table")]
    App -->|"1 find(42)"| Mapper
    Mapper -->|"2 SELECT row"| DB
    DB -->|"3 row"| Mapper
    Mapper -->|"4 hydrate"| Obj
    App -->|"5 change fields"| Obj
    App -->|"6 save(order)"| Mapper
    Mapper -->|"7 UPDATE columns"| DB
```

## Variations
<!--meta block=variations-->

- **Metadata-driven mapping** — An ORM (object-relational mapper) (Hibernate, TypeORM, Doctrine) generates the mapper from annotations or a mapping file instead of hand-written code — far less boilerplate on typical entities, at the cost of some transparency.
- **Hand-written mapper** — Every field mapped explicitly in code. More typing, but no reflection magic and a straightforward stack trace the moment a mapping breaks.
- **[Repository](./repository.md)** — Wraps one or more mappers behind a collection-like interface — add, remove, find — so callers query for objects without ever seeing SQL or the mapper itself.
- **Identity Map integration** — The mapper checks an identity map before building a new instance, so loading the same row twice in one unit of work returns the same object instead of a duplicate.
- **Table Data [Gateway](./gateway.md)** — A lighter cousin: the gateway wraps a table and hands back raw rows or a cursor; a data mapper goes one step further and turns those rows into full domain objects.

## Trade-offs
<!--meta block=tradeoffs-->

### Pros
<!--meta polarity=pro-->

- **Domain objects stay plain** — no base class, no persistence API, trivial to unit test without a database.
- **The object model and the schema evolve independently**; a normalized junction table or a renamed column doesn't touch business logic.
- **All mapping logic lives in one place**, so a query or translation bug is fixed once instead of chased across the domain.
- **Handles domain shapes** that don't map 1:1 to tables — inheritance hierarchies, value objects, aggregates spanning several tables.

### Cons
<!--meta polarity=con-->

- **More upfront code and an extra layer** compared to a simple, single-table entity.
- **Two representations to keep mentally in sync** — the object graph and the relational schema — even though neither knows about the other.
- **A naive mapper is chatty**: without deliberate batching or joins, loading a graph turns into N+1 queries.
- **Without an identity map alongside it**, the same row can be hydrated into two different objects in one request.

## When to use it
<!--meta block=usage-->

### Reach for it when
<!--meta polarity=when-->

- **The domain model has real behavior**, inheritance, or invariants that don't map cleanly onto a single table.
- **You need to unit-test business rules** without spinning up a database.
- **The schema is normalized**, legacy, or owned by another team, and shouldn't be reshaped around the object model.

### Avoid when
<!--meta polarity=avoid-->

- **The domain is a thin wrapper** over one table — reach for [Active Record](./active-record.md) instead and skip the extra layer.
- **No one is going to own keeping** the mapping code in sync as either side changes.

## Code sketch
<!--meta block=sketch-->

```typescript summary="TypeScript — a minimal mapper over a plain entity"
// Plain domain object — no SQL, no table name, no base class.
class User {
  constructor(
    public readonly id: number,
    public name: string,
    public email: string,
  ) {}
}

interface UserRow {
  id: number;
  full_name: string;
  email: string;
}

class UserMapper {
  constructor(private readonly db: Database) {}

  async find(id: number): Promise<User | null> {
    const row = await this.db.queryOne<UserRow>(
      "SELECT id, full_name, email FROM users WHERE id = ?", [id],
    );
    return row ? new User(row.id, row.full_name, row.email) : null;
  }

  async save(user: User): Promise<void> {
    await this.db.execute(
      "UPDATE users SET full_name = ?, email = ? WHERE id = ?",
      [user.name, user.email, user.id],
    );
  }
}

// Caller never sees a column name.
const mapper = new UserMapper(db);
const user = await mapper.find(42);
if (user) {
  user.email = "new@example.com";
  await mapper.save(user);
}
```

## In the wild
<!--meta block=wild-->

- **SQLAlchemy** — Maps plain Python classes onto tables, and imperative mapping (registry.map_imperatively) can map an existing class without altering it; the Session doubles as identity map and unit of work, with lazy or eager relationship loading set per attribute. {#wild-sqlalchemy}
- **Hibernate** — Builds mappers from annotations or XML mapping so plain old Java objects (POJOs) carry no SQL; fetch mode is lazy or eager per association, collection loads batch via default_batch_fetch_size, and the Session first-level cache acts as an identity map. {#wild-hibernate}
- **Doctrine ORM** — The PHP ORM that names itself a Data Mapper in contrast to Active Record; entities are plain objects with mapping declared in attributes, XML, or YAML, while the EntityManager holds the unit of work and identity map. {#wild-doctrine}
- **Entity Framework Core** — Maps classes to tables through a separately declared model, tracks changes on loaded entities and writes them on save — so the domain classes carry no persistence code of their own. {#wild-entity-framework}

## In production
<!--meta block=production-->

### Tuning knobs
<!--meta polarity=knob-->

- **Fetch strategy (lazy vs eager)** — Whether an association loads lazily on first access or eagerly by join; eager avoids extra round trips but over-fetches, lazy risks N+1 and access-after-close errors.
- **Batch fetch size** — How many parent rows a collection fetch folds into one IN-query; larger batches cut round trips at the cost of wider queries.
- **Identity-map / session cache scope** — The window over which one row maps to one in-memory object; too wide serves stale objects, too narrow re-hydrates duplicates.

### Signals to watch
<!--meta polarity=signal-->

- **Queries per request** — Query count for one logical load; a climb that tracks result-set size is the N+1 signature.
- **Rows fetched vs rows used** — Rows hydrated against rows actually read; a large gap points to an over-eager fetch or a cartesian join.
- **Hydration time** — Time spent building objects from rows, separate from query time; it grows with graph size.

### Failure modes under load
<!--meta polarity=failure-->

- **N+1 query explosion** — A naive mapper issues one query per associated row; a list that was fast at ten rows overwhelms the database at ten thousand.
- **Lazy load after the session closed** — Touching a lazily-mapped association once its loading unit of work has closed throws instead of fetching.
- **Duplicate objects without an identity map** — The same row hydrated twice in one request becomes two objects that can diverge, so an update on one is silently lost.
- **Cartesian blow-up from eager joins** — Eagerly join-fetching several collections at once multiplies rows combinatorially and returns far more data than the graph holds.

### Readiness checklist
<!--meta polarity=check-->

- Count the SQL a hot path issues and confirm it does not grow with result-set size.
- Choose lazy or eager fetch deliberately per association instead of accepting the default everywhere.
- Put an identity map in front of the mapper so one row maps to one object within a unit of work.
- Keep the mapping in sync whenever the schema or the model gains a field.

## Where it shows up
<!--meta block=fluency-->

<!-- fluency:start -->

<!-- GENERATED by gen-tours from docs/data/learning-paths.json. Do not edit this block. -->

- [Enterprise Application Patterns](../../themes/enterprise-application-patterns.md) — Move rows to domain objects and back in a layer the objects know nothing about. {#fluency-enterprise-application-patterns}

<!-- fluency:end -->

## How it relates
<!--meta block=relationships-->

<!-- relationships:start -->

<!-- GENERATED by gen-relations from docs/data/relations.json. Do not edit this block. -->

**Combines with**

- [Repository](./repository.md) — Repositories sit on top of a data mapper
- [Unit of Work](./unit-of-work.md) — Mappers write what the change-tracker decided must be written
- [Identity Map](./identity-map.md) — The mapper registers each object it builds in the identity map.

**Alternative to**

- [Active Record](./active-record.md) — Row owns its persistence vs. a separate mapper

**Prevents**

- [Anemic Domain Model](../../hazards/anemic-domain-model.md) — A persistence-free domain object is free to carry real behaviour

<!-- relationships:end -->
