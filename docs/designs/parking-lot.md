---
title: Parking Lot
description: "Assign a compatible spot, issue a ticket, and price the stay — an object-oriented design about where each piece of state belongs"
area: designs-foundational
owner: Oleksandr Derechei
tags: [low-level-design, encapsulation, separation-of-concerns, state-management]
status: stable
aliases: [parking garage, parking system]
solves: [where should this piece of state live — on the entity or on the manager that owns it, my data class is quietly turning into a calculator with its own business rules, two requests both see the same resource as free and both claim it, how do I keep a record object from reaching deep into my domain model, every rule about which item fits where lives in one giant if-else at the top]
---

# Parking Lot

A parking lot assigns an arriving vehicle a compatible spot, issues a ticket, and charges by the hour on exit. As a low-level design it is almost entirely about placement: which object owns occupancy, where pricing lives, and how far a record is allowed to reach.

## Understanding the problem
<!--meta block=description-->

On entry, the system finds an available spot matching the vehicle's type and hands back a ticket; on exit, it validates the ticket, charges for the time parked, and frees the spot. There is no distributed scale here — one lot, a few hundred spots — so the whole exercise is object modelling: name the right classes, give each exactly the state and behaviour it needs, and resist the pull to over-build. The interesting decisions are all about where things belong.

## Explained
<!--meta block=explain-->

A parking lot design keeps spots and tickets as plain data and puts every rule in one lot object: it finds a free spot of the right type, issues an immutable ticket, and on exit prices the stay and frees the spot. Occupancy is kept as a set of taken spot ids that the lot maintains, not as a flag on each spot. Choose that set over a flag when occupancy is a relationship the system manages rather than a physical fact; a locker door really holds a parcel whether or not the software agrees, so there a flag fits. The set is computed from the tickets, so update both together, and find-and-claim must run inside one lock or two entrances can claim the same bay. Keep pricing as a method on the lot until a second fee rule exists, since a pricing-strategy interface answers a need nobody has yet and can be added later as one class. First-match allocation ignores how close a spot is and how full each floor is, so add a placement rule when that matters. Store fees as whole cents.

**Example.** A lot has 200 spots and cars stay about 2 hours, so entries arrive at about 200 / 7,200 = 0.03 a second. One lock around enter(), a scan of 200 entries and two memory writes, takes microseconds, so it is never the bottleneck. At 500 cents an hour, a car that stays 2 hours 10 minutes is rounded up to 3 hours and pays 1,500 cents. Exit removes the spot id from the occupied set and deletes the ticket, so a second exit with the same ticket is rejected as invalid.

## Requirements
<!--meta block=requirements-->

### Functional
<!--meta requirement=fr-->

1. Support three vehicle types — motorcycle, car, large — each matching a spot type.
2. On entry, automatically assign an available compatible spot and issue a ticket.
3. On exit, validate the ticket, charge an hourly fee rounded up, and free the spot.
4. Reject entry when no compatible spot is free; reject exit for an invalid or already-used ticket.

Out of scope: payments, gate hardware, cameras, UI, and reservations — the core is spot assignment, ticket lifecycle, and fee calculation.

### Non-functional (constraints)
<!--meta requirement=nfr-->

- **Correctness** — one spot is never assigned to two vehicles at once.
- **Encapsulation** — only the lot exposes a public API; internals stay hidden.
- **Money safety** — fees are integer cents, never floating point.
- **Evolvability** — multi-floor, per-type pricing, and concurrent entrances should slot in without a rewrite.

## Core entities
<!--meta block=entities-->

Three classes, and one deliberate omission:

- **ParkingLot** — the orchestrator and the only public surface. Owns the spots, tracks which are occupied and which tickets are active, and enforces pricing.
- **ParkingSpot** — a pure data holder: an `id` and a `spotType`. It knows nothing about tickets, pricing, or (by the chosen design) even its own occupancy.
- **Ticket** — an immutable record of one session: `id`, `spotId`, `vehicleType`, `entryTime`. Read-only after creation, with no behaviour.
- **Vehicle — not a class.** It is external and never tracked, so it collapses to a `VehicleType` enum used only to match a spot. Modelling it as a class would be state with no owner.

## The interface
<!--meta block=interface-->

The lot exposes exactly two operations — deliberately no `getAvailableSpots()` or `getStatus()`, which would leak internals the core workflow never needs:

```python summary="Pseudocode — the public API"
class ParkingLot:
    enter(vehicleType) -> Ticket   # assigns a spot, issues a ticket; raises if the lot is full
    exit(ticketId)     -> long     # validates, charges cents, frees the spot; raises if invalid
```

## How the system is built
<!--meta block=architecture-->

The lot holds its spots, an `occupiedSpotIds` set, and a map of active tickets keyed by id. `enter` scans for a free compatible spot, marks it occupied, issues a ticket, and returns it; `exit` looks the ticket up, computes the fee, and clears both the occupancy entry and the ticket. Spot and Ticket stay dumb; all the rules live in the lot.

```mermaid caption="The lot orchestrates; the spot and ticket are pure data. The ticket references its spot by id string, not by object."
classDiagram
    class ParkingLot {
        -List~ParkingSpot~ spots
        -Set~String~ occupiedSpotIds
        -Map~String,Ticket~ activeTickets
        -long hourlyRateCents
        +enter(vehicleType) Ticket
        +exit(ticketId) long
        -findAvailableSpot(vehicleType) ParkingSpot
        -computeFee(entry, exit) long
    }
    class ParkingSpot {
        -String id
        -SpotType spotType
        +getId() String
        +getSpotType() SpotType
    }
    class Ticket {
        -String id
        -String spotId
        -VehicleType vehicleType
        -long entryTime
    }
    ParkingLot "1" o-- "*" ParkingSpot : owns
    ParkingLot "1" ..> "*" Ticket : issues
    Ticket ..> ParkingSpot : references by id
```

## Deep dives
<!--meta block=deepdives-->

### 1 · Who tracks occupancy — the spot or the lot?

The tell is whether a fact is intrinsic to an entity or a relationship the system manages.

- **Flag on the spot.** An `occupied` boolean on `ParkingSpot` is simple and the spot "knows" its own state — but it duplicates truth (the active tickets already imply occupancy), so the two must be kept in sync or a spot gets double-assigned. Defensible with discipline; it is exactly the choice the [Amazon Locker](./amazon-locker.md) design makes, because there occupancy really is physical.
- **Compute it from tickets.** A spot is occupied iff an active ticket references it — no stored state at all, conceptually the cleanest. But every entry rescans all tickets and, under concurrency, must lock the whole ticket map.
- **Occupancy index (chosen).** Keep the spot a pure data holder and let the lot maintain a `Set<String> occupiedSpotIds` — a maintained index, like a database index. It is technically redundant with ticket data, but it gives O(1) checks and, crucially, a clean concurrency boundary: you can lock just the set when claiming a spot instead of the whole ticket map.

### 2 · Where does fee calculation live?

Pricing is a business policy, not a property of a receipt.

- **On the Ticket.** A `calculateFee()` method forces the ticket to also store the rate and turns a record into a calculator — two reasons to change, so it breaks [single responsibility](../principles/single-responsibility.md) and makes the ticket mutable. Rejected.
- **On the lot (chosen).** `computeFee()` lives in `ParkingLot` beside the other rules; the ticket stays a pure receipt. This is [separation of concerns](../principles/separation-of-concerns.md) — data records stay simple, policy is centralised and independently testable. The rate lives on the lot as `hourlyRateCents` (integer cents — never floats for money).
- **A PricingStrategy interface.** A [strategy](../patterns/gof/behavioral/strategy.md) pattern lets pricing be swapped at runtime — genuinely useful once rules diverge (surge, discounts, per-lot tariffs). For a single flat hourly rate it is [over-abstraction](../principles/yagni.md): hold it in reserve as the answer to "what if pricing gets complex?", don't build it up front.

### 3 · Concurrent entrances

Two entrances can both see one spot as free and both claim it — a race in the window between checking availability and recording the claim. The pragmatic interview answer is a coarse lock around the whole of `enter()`: a 200-spot lot turning over every couple of hours needs ~0.03 vehicles/sec, while a synchronised `enter()` — an uncontended monitor around a 200-entry scan and two in-memory writes — runs in microseconds and so sustains hundreds of thousands of calls a second, millions of times the demand. The lock is nowhere near the bottleneck, and correctness wins over cleverness. When contention is real, a [read-write lock](../patterns/concurrency/rw-lock.md) lets many entrances search concurrently and takes the exclusive lock only to claim, re-checking after acquiring it and retrying if another thread got there first. Notably, the ticket stores its spot as an `id` string rather than a spot reference — keeping the record from reaching into the domain model, in the spirit of the [Law of Demeter](../principles/law-of-demeter.md).

## Limitations & trade-offs
<!--meta block=tradeoffs-->

### What it buys
<!--meta polarity=pro-->

- Occupancy in one place (the index) — O(1) checks and a tight lock scope for claiming a spot.
- Dumb data classes and a rules-owning orchestrator, so pricing and allocation change without touching Spot or Ticket.
- Immutable tickets and integer-cent money remove whole classes of bug.

### What it gives up
<!--meta polarity=con-->

- The occupancy index is computed from tickets — it must be updated in lockstep with them or it drifts.
- "Never existed" and "already used" collapse into one "invalid ticket" error; splitting them needs a used-ticket set.
- First-match allocation ignores placement quality (proximity, floor balancing) until a strategy is added.

## What's expected at each level
<!--meta block=levels-->

- **Junior** — a working system: spots, tickets, an orchestrator; `enter` assigns and returns a ticket, `exit` charges and frees, with basic rejection of a full lot and invalid tickets. May need a hint on where pricing belongs.
- **Mid-level** — clean separation without prompting (lot orchestrates, spot holds properties, ticket is a data holder), sees that Vehicle needn't be a class, handles double-exit, and justifies the map and the pricing placement.
- **Senior** — class boundaries are obvious; volunteers the occupancy and enum trade-offs, catches edge cases unprompted, and walks the multi-floor and concurrency extensions — simple solution first, then when a Strategy pattern earns its keep.

## Patterns it demonstrates
<!--meta block=relationships-->

<!-- relationships:start -->

<!-- GENERATED by gen-relations from docs/data/relations.json. Do not edit this block. -->

**Often confused with**

- [Amazon Locker](./amazon-locker.md) — Both assign a resource and free it later; they differ on whether occupancy is intrinsic to the slot or a relationship the manager tracks

**Demonstrates**

- [Value Object](../patterns/ddd/value-object.md) — The Ticket is an immutable record — set once at entry, read-only after
- [Strategy](../patterns/gof/behavioral/strategy.md) — Held in reserve for pricing and floor-allocation once the rules genuinely diverge
- [Read-Write Lock](../patterns/concurrency/rw-lock.md) — Fine-grained locking lets entrances search concurrently and claim a spot exclusively
- [Single Responsibility Principle](../principles/single-responsibility.md) — Fee logic stays out of Ticket so the record isn't also a pricing calculator
- [Separation of Concerns](../principles/separation-of-concerns.md) — Business rules live in the orchestrator; Spot and Ticket stay dumb data
- [You Aren't Gonna Need It (YAGNI)](../principles/yagni.md) — A PricingStrategy interface is deferred until pricing actually gets complex
- [Law of Demeter](../principles/law-of-demeter.md) — The Ticket stores a spot id string, not a spot object, so it can't reach into the model

<!-- relationships:end -->
