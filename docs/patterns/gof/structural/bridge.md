---
title: Bridge
description: Decouples an abstraction from its implementation
area: gof-structural
owner: Oleksandr Derechei
tags: [low-level-design, decoupling, composition, extensibility, abstraction]
status: stable
aliases: [handle/body, pimpl]
solves: [every time I add a shape I have to add one subclass per platform too, my class count doubles whenever a new backend shows up, one class is doing both what it means and how it draws it and I cannot untangle them, I want to pick the storage backend at startup but it is baked into the class hierarchy, changing a private field forces every file that includes this header to rebuild]
---

# Bridge

Splits a class into two hierarchies — an abstraction and its implementation — joined by a reference, so each can evolve on its own without dragging the other along.

## What it is
<!--meta block=description-->

A bridge splits one class that varies along two independent dimensions into an abstraction that clients use and an implementation it delegates to. The abstraction holds a reference to the implementation, and either side grows without touching the other. It turns a subclass explosion of m times n classes into m plus n.

## Explained
<!--meta block=explain-->

A bridge splits one class that varies in two independent ways into two small hierarchies: the abstraction your code uses, and the implementation it hands the work to. The abstraction holds a reference to an implementation, and either side grows without touching the other. Choose it over one subclass per combination when both ways of varying are independent and both will keep growing: 3 shapes on 4 platforms is 12 classes as one tree, but 3 plus 4 as a bridge.

- **Early indirection.** With one implementation it is an extra hop and file for a call that could be direct, so wait for the second one.
- **Wrong axes.** Things that always change together now change in two places, so check past changes that the axes really move apart.
- **Late retrofit.** Adding a bridge to a class that already fuses both concerns is expensive, so decide early.

**Example.** A report class has 3 kinds (sales, stock, audit) and must export to 4 formats (PDF, CSV, HTML, XLSX). As subclasses that is 12 classes, and a fifth format adds 3 more. As a bridge you write 3 report classes and 4 exporters, 7 in all, and the fifth format adds 1. But if each report only ever ships as PDF, the 4 exporters cost you with no return. And if audit reports need a special layout in every format, the axes are not independent, and the exporters fill with checks on report kind.

## How it works
<!--meta block=structure-->

```mermaid caption="Two hierarchies, one link. The abstraction holds an implementor and forwards the real work to it, so each side is subclassed independently."
classDiagram
    class Abstraction {
      -impl Implementor
      +operation()
    }
    class RefinedAbstraction
    class Implementor {
      +operationImpl()
    }
    class ConcreteImplA
    class ConcreteImplB
    Abstraction <|-- RefinedAbstraction
    Abstraction o-- Implementor
    Implementor <|.. ConcreteImplA
    Implementor <|.. ConcreteImplB
```

## Variations
<!--meta block=variations-->

- **Pimpl idiom** — C++'s pointer-to-implementation: a class exposes a stable public face while its private members live behind an opaque pointer — a compiler firewall that keeps ABI and build dependencies in check.
- **Handle / Body** — The classic name for the same split — a lightweight handle that clients pass around, backed by a heavier body object it can share or swap.
- **Runtime-swappable implementor** — The abstraction chooses or replaces its implementation at runtime — selecting a platform driver, a storage backend, or a rendering engine based on configuration or environment.
- **Hierarchical implementor** — The implementation side itself grows a small tree (a base implementor with specialised variants), letting a family of related backends share behaviour behind one interface.

## Trade-offs
<!--meta block=tradeoffs-->

### Pros
<!--meta polarity=pro-->

- **Two things vary on their own**, so you add classes instead of one per combination — 3+4, not 3×4.
- **You can pick or swap the implementation** while the program runs, not hard-wire it at build time.
- **Hides the implementation from callers**, acting as a firewall between them and the details.
- **You can extend either side** — the abstraction or the implementation — without touching the other.

### Cons
<!--meta polarity=con-->

- **Adds an extra layer** and more moving parts before any payoff shows up.
- **Overkill when there's only one implementation** and no sign of a second.
- **The split is more to hold in your head** — readers follow one extra hop to reach the real work.
- **You have to plan the split early**; adding a bridge to an already-fused class later is costly.

## When to use it
<!--meta block=usage-->

### Reach for it when
<!--meta polarity=when-->

- **One type varies along two separate axes** that each keep growing on their own.
- **You want to switch the underlying implementation** at runtime, not lock one in at build time.
- **You need to hide a platform or backend** behind one stable, published interface.

### Avoid when
<!--meta polarity=avoid-->

- **There's only one implementation** and no realistic prospect of a second.
- **The two axes aren't really independent** — they always change together.
- **A plain strategy object or simple composition** already handles the variation.

## Code sketch
<!--meta block=sketch-->

```typescript summary="TypeScript — notifications bridged over delivery channels"
// Implementation side — the "how" a message actually goes out.
interface Channel { send(to: string, text: string): void }

class EmailChannel implements Channel {
  send(to: string, text: string) { console.log(`email ${to}: ${text}`); }
}
class SmsChannel implements Channel {
  send(to: string, text: string) { console.log(`sms ${to}: ${text}`); }
}

// Abstraction side — the "what", holding a Channel: this reference is the bridge.
abstract class Notification {
  constructor(protected readonly channel: Channel) {}
  abstract notify(to: string, event: string): void;
}

class StandardNotification extends Notification {
  notify(to: string, event: string) {
    this.channel.send(to, `Update: ${event}`);
  }
}
class UrgentNotification extends Notification {
  notify(to: string, event: string) {
    this.channel.send(to, `URGENT — ${event}, respond now`);
  }
}

// Two kinds × two channels, from just 2 + 2 classes — mix them freely.
new UrgentNotification(new SmsChannel()).notify("+15550100", "server down");
new StandardNotification(new EmailChannel()).notify("ops@co", "deploy ok");
```

## In the wild
<!--meta block=wild-->

- **Java Database Connectivity (JDBC)** — Application code writes against the java.sql interfaces (Connection, Statement, ResultSet); a vendor driver registered with DriverManager supplies the implementation, so the same query code runs against PostgreSQL, MySQL or Oracle by swapping the driver jar and the connection URL. {#wild-jdbc}
- **Java AWT peers** — Each java.awt.Component delegates its real drawing and native event handling to a ComponentPeer created by the platform Toolkit, keeping the widget hierarchy separate from the per-OS windowing implementation behind it. {#wild-awt-peers}

## In production
<!--meta block=production-->

### Tuning knobs
<!--meta polarity=knob-->

- **Where the split is drawn** — Which part is the abstraction and which is the implementor. A split on the wrong axis gives no benefit.
- **How the implementor is chosen** — Passed in at construction, from config, or by a factory.
- **Implementor interface size** — A narrow interface keeps new implementors cheap. A wide one makes each costly.
- **Swap at run time** — Whether the implementor can change after construction.

### Signals to watch
<!--meta polarity=signal-->

- **Class count against product of the dimensions** — Classes that grow as the product of two variations mean the bridge is missing.
- **Implementor leaks** — Abstraction code that tests the concrete implementor type.
- **Interface churn** — Changes to the implementor interface, since each one touches every implementor.
- **Implementors per abstraction** — How many of each exist. One of either means the split is premature.

### Failure modes under load
<!--meta polarity=failure-->

- **Wrong axis** — Both sides vary together, so the bridge adds a layer and no freedom.
- **Fat implementor interface** — Every new abstraction needs a new method on all implementors.
- **Leaky implementor** — The abstraction casts to a concrete implementor to reach a feature.
- **Premature bridge** — Only one implementor exists and the second never comes.

### Readiness checklist
<!--meta polarity=check-->

- Both sides have, or are expected to have, more than one variant
- The abstraction never names a concrete implementor
- Each implementor passes the same contract tests
- The implementor interface is as narrow as the abstraction allows

## Where it shows up
<!--meta block=fluency-->

<!-- fluency:start -->

<!-- GENERATED by gen-tours from docs/data/learning-paths.json. Do not edit this block. -->

- [Object Structure](../../../themes/object-structure.md) — Separate an abstraction from its implementation so each varies alone. {#fluency-object-structure}

<!-- fluency:end -->

## How it relates
<!--meta block=relationships-->

<!-- relationships:start -->

<!-- GENERATED by gen-relations from docs/data/relations.json. Do not edit this block. -->

**Combines with**

- [Composition over Inheritance](../../../principles/composition-over-inheritance.md) — Favours composing the two hierarchies over inheriting every combination.
- [Abstract Factory](../creational/abstract-factory.md) — A factory picks and configures which implementor the abstraction gets

**Often confused with**

- [Adapter](./adapter.md) — Fix a mismatch after vs. design the split up front
- [Strategy](../behavioral/strategy.md) — Split two hierarchies structurally vs. swap one algorithm at runtime

<!-- relationships:end -->
