---
title: Transaction Script
description: One procedure per business transaction
area: enterprise
owner: Oleksandr Derechei
tags: [domain-modeling, readability, separation-of-concerns, data-access]
status: stable
solves: [this endpoint is two validations and an insert but the architecture wants six classes, I spent two days on entities and mappers before writing a single feature, I have to follow a request through five layers to find where the work actually happens, my team thinks in SQL and the object model just gets in the way, "I need to ship this one operation today, not design a domain model first"]
---

# Transaction Script

Handles each business transaction as a single straight-line procedure — pull in the data it needs, apply the rules inline, write the results back out — with no domain model standing between the request and the database.

## What it is
<!--meta block=description-->

Building a full domain model costs more than it repays when a request is a handful of checks and one write. A transaction script is one procedure that handles one request from start to finish: it reads the rows, applies the checks and calculations, writes the rows back and returns, with no domain objects in between.

## Explained
<!--meta block=explain-->

A transaction script is one procedure that handles one request from start to finish. It reads the rows it needs, applies the checks and calculations, writes the rows back and returns, with the logic in the procedure and no domain objects deciding behaviour. Choose it over a domain model, objects that hold their own rules, when each operation is a handful of checks and one write, because it is quick to write and easy to follow from top to bottom. It grows with the number of procedures, not with the cleverness of any one of them. Once many operations share rules, a [service layer](service-layer.md) over a domain model pays for itself.

- **Copied rules.** A rule shared by several scripts gets duplicated, so move it into one function that all of them call.
- **Unenforced consistency.** Nothing makes scripts apply the same check, so write a test for each script.
- **Tied to data access.** Scripts need a database to test, so pass data into a pure function where you can.

**Example.** A shop has 6 scripts that give customers over 1,000 in yearly spend a 10% discount, each with its own copy of that rule. Marketing raises it to 12%. The team edits 5 copies and misses one, so a refund script still computes 10%. Moving the rule into one function, discountFor(spend), makes it a one-line change. Testing that function needs no database, while each script's test still needs one. The cost is that the shared function is the first piece of a domain model, and the scripts begin to depend on it.

## How it works
<!--meta block=structure-->

```mermaid caption="Where does the business rule live? Inside the one procedure — it reads the credit limit, decides, and writes every row in a single transaction that commits or rolls back whole."
flowchart LR
    Req["POST /orders"]
    Script["placeOrder procedure"]
    subgraph Tx["One database transaction"]
        Customers[("customers")]
        Orders[("orders")]
        Items[("order_items")]
    end
    Req -->|"1 call with input"| Script
    Script -->|"2 read credit limit"| Customers
    Script -->|"3 insert order"| Orders
    Script -->|"4 insert lines"| Items
    Script -->|"5 commit, return order id"| Req
```

```mermaid caption="What does the caller get when a check fails? The same procedure returns the error and nothing is written — the rollback is the transaction it opened, not a compensating step elsewhere."
sequenceDiagram
    autonumber
    participant C as Client
    participant S as placeOrder script
    participant DB as Database
    C->>S: call with input data
    S->>DB: read rows needed
    S->>S: validate, compute, decide
    alt checks pass
        S->>DB: write results
        S-->>C: return result
    else validation fails
        S-->>C: return error, nothing written
    end
```

## Variations
<!--meta block=variations-->

- **Scripts as free functions** — Each transaction is a standalone function grouped by module or file — no class at all, just procedures and the data access calls they make.
- **Scripts as class methods** — Related transactions are grouped as methods on a class named for the subject area (e.g. `OrderTransactions`), purely for organization — the class carries no state or behavior of its own.
- **Scripts as stored procedures** — The procedure is written and executed inside the database itself, pushing the whole transaction — logic and data access both — into the DB tier.
- **Shared subroutine extraction** — Common steps — parsing input, formatting a response, a repeated validation — are pulled into helper functions called by several scripts, trimming duplication without introducing a domain model.

## Trade-offs
<!--meta block=tradeoffs-->

### Pros
<!--meta polarity=pro-->

- **Simple and direct** — the whole transaction reads top to bottom in one place.
- **No upfront design cost**: no domain model, no object-relational mapping to build.
- **Matches procedural and SQL-heavy teams' existing mental model**.
- **Cheap to add a new transaction** — write one more procedure, nothing else to touch.

### Cons
<!--meta polarity=con-->

- **Business rules shared across transactions** get copy-pasted instead of reused.
- **No object enforces invariants**, so the same rule can be checked inconsistently — or forgotten — in different scripts.
- **Business logic is welded to data access**, making it hard to unit-test without a database.
- **Scripts grow long and tangled** as more rules and edge cases pile onto one procedure.

## When to use it
<!--meta block=usage-->

### Reach for it when
<!--meta polarity=when-->

- **The logic per transaction is a handful** of validations and one write — genuinely simple.
- **The team and codebase already think procedurally**, and a domain model wouldn't be rewarded with reuse.
- **You need to ship a transaction now**, without first designing a domain model.

### Avoid when
<!--meta polarity=avoid-->

- **Business rules are numerous**, interrelated, and start duplicating across scripts — a [Service Layer](./service-layer.md) over a real domain model earns its cost.
- **You need to unit-test business rules independently** of the database — a script's logic is welded to its data access.
- **Several transactions should share and enforce** the same invariants, not just similar data access.

Piling ever more logic into procedures while the domain classes stay pure data bags is exactly how a codebase ends up with an [Anemic Domain Model](../../hazards/anemic-domain-model.md).

## Code sketch
<!--meta block=sketch-->

```typescript summary="TypeScript — one procedure, one transaction"
// One function does the whole transaction: read, decide, write, return.
async function placeOrder(db: Database, input: PlaceOrderInput): Promise<OrderResult> {
  const customer = await db.queryOne(
    "SELECT id, credit_limit FROM customers WHERE id = $1", [input.customerId],
  );
  if (!customer) throw new Error("unknown customer");

  const total = input.items.reduce((sum, i) => sum + i.price * i.qty, 0);
  if (total > customer.credit_limit) {
    throw new Error("order exceeds credit limit");
  }

  const orderId = await db.insert("orders", {
    customer_id: input.customerId,
    total,
    status: "placed",
  });
  for (const item of input.items) {
    await db.insert("order_items", { order_id: orderId, ...item });
  }

  await db.commit();
  return { orderId, total };
}
```

## In production
<!--meta block=production-->

### Tuning knobs
<!--meta polarity=knob-->

- **Transaction isolation level** — The isolation each script runs its read-modify-write at; too low risks lost updates, too high risks contention.
- **Statement / transaction timeout** — A ceiling on how long a script may hold its transaction before the database aborts it.

### Signals to watch
<!--meta polarity=signal-->

- **Transaction duration** — How long each script holds its transaction open; long scripts hold locks.
- **Deadlock rate** — Frequency of deadlocks; scripts that lock rows in inconsistent order deadlock under concurrency.
- **Lock wait time** — Time scripts spend blocked waiting for locks held by other scripts.

### Failure modes under load
<!--meta polarity=failure-->

- **Deadlock from inconsistent lock ordering** — With no single object enforcing order, different scripts lock the same rows in different sequences and deadlock under load.
- **Long script holds locks** — A script that does heavy computation or an external call mid-transaction holds its row locks the whole time, blocking others.

### Readiness checklist
<!--meta polarity=check-->

- Keep each script short and its transaction brief — do not do external I/O mid-transaction.
- Lock rows in a consistent order across scripts to avoid deadlocks.
- Wrap the script in an explicit transaction that rolls back fully on any error.

## Where it shows up
<!--meta block=fluency-->

<!-- fluency:start -->

<!-- GENERATED by gen-tours from docs/data/learning-paths.json. Do not edit this block. -->

- [Enterprise Application Patterns](../../themes/enterprise-application-patterns.md) — Put each business transaction in one procedure from request to database. {#fluency-enterprise-application-patterns}

<!-- fluency:end -->

## How it relates
<!--meta block=relationships-->

<!-- relationships:start -->

<!-- GENERATED by gen-relations from docs/data/relations.json. Do not edit this block. -->

**Combines with**

- [Active Record](./active-record.md) — The script loads, mutates and saves rows through record objects
- [Keep It Simple (KISS)](../../principles/kiss.md) — Choosing a script over a domain model is the simplicity call, until the rules start duplicating
- [You Aren't Gonna Need It (YAGNI)](../../principles/yagni.md) — A script is the unspeculative start, and the pattern says when to graduate to a model

**Alternative to**

- [Service Layer](./service-layer.md) — A rich operations boundary vs. one procedure per transaction
- [Aggregate](../ddd/aggregate.md) — Logic in the procedure vs. logic on the objects it touches

**Often confused with**

- [Anemic Domain Model](../../hazards/anemic-domain-model.md) — Same procedures over data-only classes; the smell is a domain model that lost its behavior, the script never claimed any

<!-- relationships:end -->
