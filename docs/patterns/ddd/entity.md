---
title: Entity
description: "Defined by identity, not by its attributes"
area: ddd
owner: Oleksandr Derechei
tags: [domain-modeling, lifecycle, state-management]
status: stable
aliases: [reference object]
solves: [two different customers with the same name keep getting treated as one record, I edited a user's email and now my code thinks it is a different user, my object comparison breaks every time someone updates a field, I have no stable way to point at the same thing across two requests, putting my objects in a set silently deduplicated things that were not duplicates]
---

# Entity

An entity is defined by a thread of identity that runs through its whole life, not by the attributes it happens to hold right now — the same customer is still the same customer after a name change, a new address, and a dozen orders.

## What it is
<!--meta block=description-->

Comparing objects by their fields merges two different customers named John Smith, and splits one customer who changes address into two. An entity is told apart by an id of its own, fixed for life, and equality uses that id alone. Everything else can change, so the object keeps one continuous story, and you find it by asking for this id, not for matching values.

## Explained
<!--meta block=explain-->

An entity is an object you tell apart by an id of its own, not by the values it holds, so it stays the same thing while its name, address and status change. Compare by fields and two different customers called John Smith merge, while one customer who changes address splits in two. Choose an entity only where continuity through change is part of the domain; a concept fully described by its attributes is a [value object](value-object.md), and giving everything an id and setters adds weight that buys nothing.

- **State drift** Mutable state can drift into illegal states; make the entity an aggregate root so every change enters through one method.
- **Key choice** A natural key like an email may change or be reused; use a generated id and keep the email as a unique field.
- **Unsaved ids** A database-assigned id makes unsaved objects look identical and breaks sets and maps; assign the id in the constructor.

**Example.** Customer c-77, John Smith, has 3 orders and the email john<!-- -->@x.com. He moves to js<!-- -->@y.com. If the email were the identity, all 3 orders would point at an address nobody owns. Because the identity is c-77, they still point at him. A second John Smith at the same address is c-78, and comparing fields would have merged them. The cost is that uniqueness of email is no longer free: you add an explicit unique constraint on it, and the constructor generates the id, so a customer has an identity before the database ever sees it.

## How it works
<!--meta block=structure-->

```mermaid caption="The id assigned at creation stays fixed while every other attribute is free to mutate. Equality compares that id, never the attributes trailing behind it."
flowchart LR
    New["new Entity, id=42"] -->|"edit field"| M1["attributes change"]
    M1 -->|"edit again"| M2["attributes change again"]
    M2 -->|"compare instances"| Cmp{"compare by id only"}
    Cmp -->|"id unchanged"| Same["still the same entity"]
```

## Variations
<!--meta block=variations-->

- **Surrogate key identity** — Identity is a generated value — a UUID (universally unique identifier) or auto-incremented number — with no business meaning. Stable forever, but opaque outside the system.
- **Natural key identity** — Identity is a real business attribute, like an SSN or ISBN. Simpler to reason about, but fragile: natural keys can turn out to change or be reused, breaking the identity guarantee.
- **[Aggregate root](./aggregate.md)** — An entity that also serves as the sole entry point into a cluster of entities and values, responsible for enforcing invariants across the whole group.
- **[Anemic](../../hazards/anemic-domain-model.md) vs. rich entity** — An anemic entity is just an id plus public getters and setters, with all behavior pushed into external services. A rich entity keeps the behavior that enforces its own invariants alongside its state — the model DDD favors.

## Trade-offs
<!--meta block=tradeoffs-->

### Pros
<!--meta polarity=pro-->

- **Models real things** whose identity outlives any particular set of attribute values.
- **Equality reduces to one stable comparison** — the id — instead of fragile attribute matching.
- **Mutable by design**, so it naturally represents objects with a genuine lifecycle.
- **Maps cleanly onto a database row** with a primary key.

### Cons
<!--meta polarity=con-->

- **Mutability invites uncontrolled state drift** if the entity doesn't guard its own invariants.
- **Choosing the identity field** — natural key or surrogate — is a real design decision, easy to get wrong.
- **A transient entity without an assigned id yet** can't be compared reliably against a persisted one.
- **Overusing Entity for things with no real identity** fattens the model with objects that should have been values.
- **Entity or value is a call** each model makes for itself, not a property of the concept: an address is a value to a shipping context and an entity to the utility that bills the premises, so settling it once for the whole company gets it wrong at the first service boundary.

## When to use it
<!--meta block=usage-->

### Reach for it when
<!--meta polarity=when-->

- **The object has a continuous lifecycle** and an identity that must survive its own mutation — an order, a user account, a support ticket.
- **Two instances with identical attribute values** must still be distinguishable as different things.
- **Code needs a stable handle** to reference the same conceptual thing across separate lookups or requests.

### Avoid when
<!--meta polarity=avoid-->

- **The object is fully described by its attributes** and interchangeable whenever they match — that's a [Value Object](./value-object.md).
- **You're modeling an immutable measurement or descriptor**, like money, a coordinate, or a date range.
- **Cheap, safe value equality** matters more than tracking continuity through change.

## Code sketch
<!--meta block=sketch-->

```typescript summary="TypeScript — identity survives mutation"
class CustomerId {
  constructor(readonly value: string) {}
}

class Customer {
  readonly id: CustomerId; // identity, fixed for life
  name: string;
  email: string;

  constructor(id: CustomerId, name: string, email: string) {
    this.id = id;
    this.name = name;
    this.email = email;
  }

  rename(name: string): void {
    this.name = name; // attributes mutate freely
  }

  equals(other: Customer): boolean {
    return this.id.value === other.id.value; // identity only
  }
}

const c1 = new Customer(new CustomerId("42"), "Alice", "a@x.com");
c1.rename("Alicia");
const c2 = new Customer(new CustomerId("42"), "Alicia", "alicia@y.com");
console.log(c1.equals(c2)); // true — same identity, different snapshots
```

## In the wild
<!--meta block=wild-->

- **Jakarta Persistence (Java Persistence API, JPA)** — A class marked `@Entity` must declare an `@Id` field, which is the persistence provider's identity for that object, and the provider keeps one managed instance per identity within a persistence context. {#wild-jpa-entity}
- **Entity Framework Core** — Entity types are mapped with a key property, and the change tracker uses that key to keep one tracked instance per identity per context. {#wild-ef-core}

## In production
<!--meta block=production-->

### Tuning knobs
<!--meta polarity=knob-->

- **Identity generation strategy** — A generated surrogate key (a UUID or a database sequence) versus a natural business key. The choice binds you at write volume as well as in the model — sequential keys cluster inserts, random ones scatter them.
- **Where identity is assigned** — At construction (client-generated, for example a UUID created in code) versus at persistence (database-assigned). Client-side assignment lets a transient entity be compared and referenced before it is ever saved.
- **Concurrency control on updates** — Whether the entity carries a version field checked on write (optimistic locking) or relies on row locks. A version check costs a column and a retry path; no check lets two writers overwrite each other.

### Signals to watch
<!--meta polarity=signal-->

- **Duplicate rows per business key** — Count of entities sharing one natural key, such as one email on two accounts. A nonzero count means identity is not what the system believes it is.
- **Optimistic-lock conflict rate** — Failed version checks per update on a hot entity. A rising rate shows many writers contending for one identity.
- **Insert latency on the key index** — Time per insert as the table grows, which reveals a hotspot caused by monotonic keys.

### Failure modes under load
<!--meta polarity=failure-->

- **Write hotspot on monotonic keys** — Auto-increment or otherwise monotonically increasing primary keys concentrate every insert on the rightmost leaf of the index, serializing writes under high insert throughput.
- **Natural key turns out mutable or reused** — A business attribute chosen for identity, such as an SSN, email, or ISBN, is later changed or reused upstream, breaking the identity guarantee and orphaning references.
- **Lost update** — Two requests load the same entity, change different fields and save. The second write silently erases the first unless a version check rejects it.

### Readiness checklist
<!--meta polarity=check-->

- Define equality and hashing by identity alone, never by mutable attributes.
- Assign identity at construction rather than at save, so transient and persisted instances compare correctly.
- Prefer a stable surrogate key over a natural one unless the natural key is genuinely immutable and never reused.
- Test that two concurrent updates to one entity either serialize or one fails visibly.

## Where it shows up
<!--meta block=fluency-->

<!-- fluency:start -->

<!-- GENERATED by gen-tours from docs/data/learning-paths.json. Do not edit this block. -->

- [Service Boundaries](../../themes/service-boundaries.md) — Identity that outlives the attributes {#fluency-service-boundaries}

<!-- fluency:end -->

## How it relates
<!--meta block=relationships-->

<!-- relationships:start -->

<!-- GENERATED by gen-relations from docs/data/relations.json. Do not edit this block. -->

**Combines with**

- [Repository](../enterprise/repository.md) — Looked up and stored by identity, not by its fields
- [Domain Service](./domain-service.md) — An entity delegates a rule spanning other entities to a domain service

**Part of**

- [Aggregate](./aggregate.md) — An aggregate is a graph of entities and values

**Often confused with**

- [Value Object](./value-object.md) — Identity matters vs. only the values matter
- [Active Record](../enterprise/active-record.md) — Domain identity vs. an object that saves its own row

<!-- relationships:end -->
