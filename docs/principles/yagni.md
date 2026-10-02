---
title: You Aren't Gonna Need It (YAGNI)
description: Build capability only when a real present requirement demands it
area: principles-craft
owner: Oleksandr Derechei
tags: [low-level-design, maintainability, extensibility, code-smell]
status: stable
aliases: [YAGNI]
solves: [I built a flexible framework for a case that never came, we added config options and plugin hooks nobody has ever used, half this abstraction exists for requirements that got cancelled, there's a pile of just-in-case code we're now afraid to touch, we spent the sprint making it generic instead of shipping the feature]
---

# You Aren't Gonna Need It (YAGNI)

Do not build a capability until a real, present requirement asks for it. The future you are designing for is a guess, and code written for a guess is waste when the guess is wrong and a liability even when it is right.

## What it says
<!--meta block=description-->

“You Aren't Gonna Need It.” Implement a capability when a real requirement actually demands it — not when you merely foresee that it might, one day, be useful. The phrase comes out of Extreme Programming on the C3 project, where Kent Beck answered a colleague's “we're going to need it” with it; Ron Jeffries is the one who articulated and popularised the reasoning behind it.

The target is speculative generality: the extra parameter no caller passes, the interface with one implementation, the plugin system built for plugins that were never requested. Each is written to serve an imagined future, and the honest observation behind YAGNI is that most of those futures never arrive — and the ones that do rarely match the shape you guessed.

## Explained
<!--meta block=explain-->

YAGNI says you build a capability only when a real requirement needs it today, not when you expect it might be useful someday. Code written for an imagined future still has to be read, tested and kept working through every change, yet no real use exercises it, and when the real need arrives in a different shape you first have to remove the wrong guess. Choose it over building ahead when a wrong guess is cheap to fix later, as with a spare parameter, an interface with one implementation or a plugin system nobody asked for. Choose deliberate up-front design instead when a choice is cheap now and ruinous later, such as a data format, a public API contract or a security boundary. Deferring costs a refactor done in public, under a deadline. Make that cheap in advance: keep call sites few, name things for today's behaviour, test behaviour rather than structure, and refactor as you go. When you hear we might need it, write the idea down and build nothing.

**Example.** A team builds an export that writes one CSV for one customer. A colleague proposes an exporter interface with pluggable formats, 4 classes and a config file, because JSON may follow. Nobody has asked for it in 12 months, so the team ships one 30-line function. Eight months later a customer asks for JSON. The team now has two real cases and splits the code in half a day, shaped by what both actually need. That half day under a deadline is the cost of deferring. In the same sprint they do not defer the CSV column order: customers load it into their own systems, so it is a public contract, and they fix and document it now.

## Why it helps
<!--meta block=rationale-->

Work done for a requirement that never lands is pure waste — time spent building, and time everyone else spends reading and stepping around code that does nothing for them. But the deeper cost is risk. Speculative code is, by definition, code no real use case exercises: it is untested by usage, it can rot silently, and it still has to be understood and kept working during every future change.

Worse, unused abstraction constrains. A generalized seam built for the wrong future is not a neutral spare part — it shapes the code around it, and when the real need finally arrives in a different shape, you must first dismantle the wrong guess before you can build the right thing. Deferring the decision keeps your options open and lets the actual requirement, once known, inform a design that fits it.

## Applying it
<!--meta block=applying-->

Let present requirements — not imagined ones — pull capability into being:

- Build for the case in front of you. When a second real case appears, generalize then, informed by two concrete points instead of one hypothetical.
- Resist the parameter, hook, or config flag with exactly one value today. Add it when a second caller genuinely needs a second value.
- Prefer designs that are cheap to extend later over structures that are expensive to unwind. Deferring is only safe when the door stays easy to open.
- When you catch yourself saying “we might need…”, treat it as a signal to stop, not to start. Write down the possibility; do not yet build for it.

The rule of thumb: implement what today's requirement demands, and no more — but keep the code simple enough that tomorrow's requirement is cheap to add.

## Taken too far
<!--meta block=overreach-->

YAGNI defers speculation, not judgement. Used as a blanket excuse to skip a need you genuinely already know is coming — or to omit a load-bearing seam that would be far cheaper to place now than to retrofit — it stops being discipline and becomes short-termism. Some structure is not speculative: it is the honest architecture the known requirements demand, and refusing it guarantees expensive rework, not savings.

Deferring also has a bill to pay elsewhere, and it comes due on the practices that keep the door open: refactoring as you go, tests you trust enough to change code behind, and integrating often enough that the change is small. Effort spent on those is not a YAGNI violation — it is what makes deferring cheap. Skip them and every deferred decision lands in a codebase that got harder to change while you waited, which is rework rather than savings.

The distinction that matters is cost asymmetry. Choices that are cheap to change later are exactly the ones YAGNI says to defer. But some decisions are cheap now and ruinous later — a data-model or persistence-format choice, a public API contract, a security boundary — and reversing them once data and callers exist is enormously expensive. There, “we aren't gonna need it” is the wrong lens; you weigh the cost of getting it wrong, and you decide deliberately rather than defaulting to defer.

## How it relates
<!--meta block=relationships-->

<!-- relationships:start -->

<!-- GENERATED by gen-relations from docs/data/relations.json. Do not edit this block. -->

**Combines with**

- [Keep It Simple (KISS)](./kiss.md) — Its partner in restraint: build only what is needed now, and keep it simple.
- [Prefer Managed Services](./managed-services.md) — A platform nobody needed yet is the most expensive thing to build early
- [Build for the Needs of the Business](./build-for-business.md) — A non-functional target is a present requirement, not a speculative feature
- [Transaction Script](../patterns/enterprise/transaction-script.md) — Shipping a plain procedure now defers the domain model until the rules actually demand one

**Prevents**

- [Boat Anchor](../hazards/boat-anchor.md) — Build only what is needed now and there is no speculative code left to fossilise.

**Demonstrated by**

- [Parking Lot](../designs/parking-lot.md) — Parking Lot resists a Strategy abstraction while a single flat rate suffices
- [Elevator](../designs/elevator.md) — abstractions are deliberately deferred until a requirement actually demands them rather than built up front
- [Amazon Locker](../designs/amazon-locker.md) — at a few dozen doors the plain linear scan and single-phase flow beat the clever machinery that is not yet needed
- [Connect Four](../designs/connect-four.md) — Declining an extension point for a requirement that will never change is the canonical YAGNI call
- [BookMyShow](../designs/bookmyshow.md) — classes are deferred until a measured hot-screening bottleneck earns them
- [Rate Limiter](../designs/design-rate-limiter.md) — deferring speculative config-mutation surface until it is needed is YAGNI applied to the API

<!-- relationships:end -->
