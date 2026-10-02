---
title: Anemic Domain Model
description: Data objects with no real behavior of their own
area: hazards
owner: Oleksandr Derechei
tags: [anti-pattern, encapsulation, validation, code-smell]
status: stable
aliases: [anemic model, anemic domain]
solves: [my domain classes are nothing but getters and setters, the same validation rule is copy-pasted across three service classes, any caller can set a total to a negative number and nothing refuses it, business rules live in services while the entities are just data bags]
---

# Anemic Domain Model

Data objects with no real behavior of their own — every field has a getter and setter, but the rules that make sense of them all live somewhere else.

## What it is
<!--meta block=description-->

An **anemic domain model** is a set of classes named after real domain concepts — `Order`, `Customer`, `Invoice` — that hold state but carry almost no behavior. Each class is little more than a bag of fields with a getter and a setter for every one of them. All the logic that actually understands what an `Order` is allowed to do lives elsewhere, in an `OrderService`, an `OrderValidator`, or a controller method that reaches into the object and pushes its fields around directly.

You recognize it by counting methods. A domain class with twenty properties and twenty accessor pairs, and not a single method that expresses a business rule, is anemic. So is a `totalAmount` that any caller can set to a negative number, because nothing on the object itself refuses it. The tell is procedural code sitting right next to object-oriented names: the classes look like a domain model, but the code that manipulates them reads like a script — fetch the record, check a few conditions, mutate a few fields, save it back.

Martin Fowler named the smell in 2003 specifically to contrast it with a rich domain model, where behavior and the data it governs live in the same place. An anemic model isn't wrong because it's simple — it's wrong because the object's own boundary no longer protects its own consistency; anything holding a reference and a setter can put it into a state that makes no sense.

## Explained
<!--meta block=explain-->

An anemic domain model is a set of classes named after real business things, such as Order or Invoice, that hold fields but enforce no rules. The rules live in separate service classes that reach in and change the fields. Teams fall into it because layered designs put data and logic in separate tiers, code generators make one class per table, and each new rule follows the path the last one took. The cost is that every service writes the same check a little differently, and anything holding the object can put it in a state the business forbids. The way out is to move one rule at a time into a named method on the object it is about, send callers through that method, and then delete the setter it replaced, because a setter left behind is a route around the rule. Choose a rich model where rules are real and keep changing, such as pricing, and keep a plain script for a bulk import, which is honest as a script. The bill lands at the edges: rich objects fight database mapping, so put a mapper between table and model. A rule spanning two objects has no owner, so give it a named service and keep that list short.

**Example.** Four services set an order's discount: checkout, admin, refunds and a nightly import. Each copies the rule "discount at most 30%". Marketing cuts the cap to 25%, and the team edits three services but misses the import. The import loads 200 orders a night averaging 100 euros, and each carries up to 5 euros too much discount, so the company loses up to 1,000 euros a night until someone notices. The fix is one method, \`Order.applyDiscount(percent)\`, that refuses anything over 25. You move the four callers onto it, then delete \`setDiscount\`. The next cap change is one edit, and the price is the mapper you now maintain between the orders table and Order.

## How it happens
<!--meta block=causes-->

```mermaid caption="The reinforcing loop: each rule added to a service makes the next one land there too."
flowchart TB
    A["New business rule needed"] -->|"add to a service, easier to test"| B["Add it to a Service method"]
    B -->|"no behavior lands on the entity"| C["Entity keeps only getters and setters"]
    C -->|"the path is carved"| D["Next rule follows the same shortcut"]
    D -->|"another rule appears"| A
    D -->|"logic accretes outside"| E["Entity becomes a passive record"]
```

- Layered-architecture conventions split "data" and "logic" into separate tiers, so entities hold state and services hold behavior by default.
- ORMs (object-relational mappers) and code generators scaffold entities as one-field-one-column classes, reinforcing the idea that an entity is a row wrapper, not a model.
- Testing a plain data class is trivial and testing a service in isolation is straightforward, so logic gravitates toward services for the sake of easy tests.
- The same class gets reused as an API payload, a persistence record, and a domain object, so behavior is stripped out to keep it a neutral, serializable shape.
- No one owns the question of where a rule belongs, so each new rule just follows the path the last one carved.
- The model is built from the database schema rather than from the business, so the classes are tables with getters and there was never a place for behaviour to go — which is also why [Active Record](../patterns/enterprise/active-record.md) and [Transaction Script](../patterns/enterprise/transaction-script.md) so often appear alongside it.

## Why it hurts
<!--meta block=cost-->

- Business rules get duplicated across every service that touches the entity, because there is no single method to call, so each caller re-implements the check slightly differently.
- Invariants are not guaranteed. Any code holding a reference can set a field to a value the domain would never allow, because nothing on the object refuses it.
- Domain knowledge moves into procedural method bodies instead of named domain concepts, so the ubiquitous language the team agreed on stops matching the code.
- Behavior tests end up exercising the [service layer](../patterns/enterprise/service-layer.md), not the entity, so the entity itself has no enforced contract and can drift silently as fields are added.
- Moving or fixing a rule means hunting down every service that duplicated it, instead of changing one method in one place.
- The model still costs what a domain model costs — the object graph, and the mapping layer that keeps it in step with the database — while the behavior that would repay that cost sits in services. The team pays for a domain model and gets a [transaction script](../patterns/enterprise/transaction-script.md), which makes the real choice enriching the model or dropping it for a script that admits what it is.
- It is self-reinforcing: a rich method looks out of place next to a hundred plain accessors, so the next rule lands in the service layer too.

## How to avoid it
<!--meta block=mitigation-->

Move one rule at a time, and start with the one you have already had to fix twice. Find every place that check is written, give the class the rule is about a named method that does it, and send those callers through the method. The duplication is what is costing you this month, and one method ends it — the rest of the class can wait.

Close the door behind each move, in that order: add the method, migrate the callers, then delete the setter it replaced. A setter left in place is a route around the rule, and a route around the rule is how the second copy gets written. Leave persistence until last, and put a mapper between the table and the model, so the shape the rules want is not negotiated with the schema every time.

Decide where a rule that spans two objects lives, before it decides itself. Such a rule has no owner among them, so give it a named domain service and keep that a list you can recite, rather than the tier everything drifts back into. Move the tests with the behaviour too: while the only test of a rule runs through the service, the object has no enforced contract, and the next field added to it can break one quietly.

## How it relates
<!--meta block=relationships-->

<!-- relationships:start -->

<!-- GENERATED by gen-relations from docs/data/relations.json. Do not edit this block. -->

**Often confused with**

- [Transaction Script](../patterns/enterprise/transaction-script.md) — Same procedures over data-only classes, but chosen on purpose because the logic is simple

**Mitigated by**

- [Aggregate](../patterns/ddd/aggregate.md) — Behavior on the aggregate keeps the model rich
- [Data Mapper](../patterns/enterprise/data-mapper.md) — Keeping SQL out of the model removes the pressure to flatten it
- [Encapsulation](../principles/encapsulation.md) — The anaemic model is precisely what its absence produces: public state, rules elsewhere

<!-- relationships:end -->
