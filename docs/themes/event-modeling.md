---
title: Event Modeling
description: "Laying a system out as a timeline of screens, commands, events and read models — one blueprint you can build from"
area: themes-starting
owner: Oleksandr Derechei
tags: [event-driven, read-optimization, testability]
status: stable
---

# Event Modeling

Draws the whole system as one timeline in four swimlanes — what the user sees, what they ask for, what happened, and what gets shown back — so every screen traces to the events behind it and every event traces to something that caused it.

## The question
<!--meta block=description-->

Where [event storming](./event-storming.md) asks what happens in the business, **event modeling asks what the system must be built out of**. Adam Dymitruk's technique takes the events you agreed on and lays them along one timeline with a lane each for the interface, the commands users issue, the events the system records, and the read models it shows back. The result is a blueprint rather than a discovery exercise: it is specific enough to estimate from and to build from.

The discipline is the constraint that everything must connect. A screen showing information must trace back to a read model, that read model must be built from events, and every event must have a command that caused it. **A gap in the drawing is a gap in the system** — and unlike a gap in a document, it is visible, because a lane has a hole in it.

Two patterns are named on the wall and worth learning as pairs. **Given-When-Then**: given these events already happened, when this command arrives, then these events follow — which is a specification of a command handler and a test case at the same time. **Given-Then**: given these events, then the read model looks like this — which specifies a projection. A model made of these two shapes decomposes into work items with no further analysis.

Its usefulness is not conditional on [event sourcing](../patterns/architecture/event-sourcing.md), and confusing the two is the most common mistake made with it. The timeline describes what happened and what is shown, which is true of any system; storing those events as the source of truth is a separate and much more expensive decision. A team can model this way and persist state in ordinary tables, and often should — what they keep is the traceability from screen to cause, which is where most of the value was.

## Explained
<!--meta block=explain-->

Event modeling lays out a system on one timeline with four lanes: the screens, the commands users issue (a request to do something), the events the system records (a fact that happened), and the read models that screens display (data shaped for one view). Every item must connect to its neighbours, so a screen with no read model behind it, or an event no command causes, shows up as a hole in the drawing before anyone writes code. Choose it over plain iterative delivery when the flow is known and complex, such as a payment lifecycle, because you can estimate and slice work from the drawing. Do not choose it for a product still finding its shape, where you redraw faster than you build. It costs days of up-front effort, so model one flow at a time and expect the drawing to age into a snapshot. It also tempts you to store events as the source of truth, a much larger commitment called event sourcing. Choose that only when you must rebuild past state or audit every change, and otherwise keep the model and store ordinary rows.

**Example.** A payments team models the refund flow in 2 days. The drawing has 4 screens, 6 commands, 9 events and 4 read models. Tracing the Refund status screen back, they find no event records the date a refund was paid, a gap found before any code. Each command becomes a spec: given PaymentCaptured of 50, when RequestRefund of 60 arrives, then RefundRejected follows. With about 3 such cases per command, that is 18 tests and work items. No one must reconstruct past balances, so they keep ordinary tables, not event sourcing.

## The trade-space
<!--meta block=tradespace-->

The technique buys completeness and charges for it in up-front effort. Drawing every screen, command, event and read model for a whole system takes days, and the drawing is only correct while the system matches it — so the choice is between maintaining it as a living artifact and accepting that it is a snapshot that was useful once. Most teams get the value in the first pass and let it age, which is fine as long as nobody later mistakes it for documentation.

The sharper trade is against ordinary iterative delivery. A complete model before implementation is a plan, and plans assume the requirements hold still. The technique is at its strongest where the flow is genuinely known and complex — a regulated process, a payment lifecycle, a fulfilment chain — and at its weakest on a product still discovering what it is, where the model is redrawn faster than it can be built.

The third trade is architectural gravity. A model expressed as commands, events and projections makes an event-sourced, read-model-projecting implementation look like the obvious next step, because the drawing is already shaped like one. That is a real risk: the notation should not decide the persistence strategy. Ask whether you need to reconstruct past state and audit every change — and if the answer is no, keep the model and store rows.

```mermaid caption="Every element must connect to the lane on either side of it. A read model with no events feeding it, or an event with no command causing it, is a hole in the design that the drawing makes impossible to overlook."
flowchart LR
    subgraph L["The four lanes, read left to right in time"]
        UI["Interface — what the user sees"]
        CMD["Commands — what they ask for"]
        EVT["Events — what happened"]
        RM["Read models — what is shown back"]
    end
    UI -->|"1 user acts"| CMD
    CMD -->|"2 given past events, when this, then"| EVT
    EVT -->|"3 given these events, then"| RM
    RM -->|"4 renders into"| UI
```

## What the lanes become
<!--meta block=tour-->

<!-- tour:start -->

<!-- GENERATED by gen-tours from docs/data/learning-paths.json. Do not edit this block. -->

### [Command](../patterns/gof/behavioral/command.md) {#tour-command}

The second lane is this pattern by construction: an intent captured as an object, separate from whatever decides to accept it. Modelling it explicitly is what makes the given-when-then specification writable, because the command is the "when".

### [Domain Event](../patterns/ddd/domain-event.md) {#tour-domain-event}

The third lane. Each note is a past-tense fact, and the rule that every event needs a command in front of it is what stops the model containing effects that nothing causes.

### [Materialized View](../patterns/distributed/coordination/materialized-view.md) {#tour-materialized-view}

The fourth lane is a projection: a shape maintained from events specifically so a screen can be answered in one read. Drawing it per screen is what surfaces how many distinct read shapes a system actually needs, which is almost always more than anyone guessed.

### [CQRS](../patterns/architecture/cqrs.md) {#tour-cqrs}

The notation separates the two sides before you decide anything, so the split is an observation rather than a commitment: commands go one way through the events, queries come the other way out of the projections.

### [Saga](../patterns/distributed/coordination/saga.md) {#tour-saga}

Wherever the model says one event automatically triggers a later command, there is a long-running process with its own state and its own failure branches. The drawing names it; this pattern is what it costs to build.

### [Event Sourcing](../patterns/architecture/event-sourcing.md) {#tour-event-sourcing}

The model looks like an event-sourced system because it is drawn in events, and that resemblance is not an argument. Adopt it if you need to reconstruct past state or audit every change; otherwise keep the timeline and store ordinary rows.

<!-- tour:end -->

## When to reach for what
<!--meta block=decide-->

| If you need… | Signal | Reach for |
| --- | --- | --- |
| To agree what the domain even is, before designing anything | Vocabulary disputed | [Event Storming](./event-storming.md) |
| A blueprint complete enough to estimate and slice into work | Flow known, design not | A full four-lane model |
| To specify one command's behaviour and its test in one line | Given-When-Then | [Command](../patterns/gof/behavioral/command.md) |
| To answer a screen in one read rather than assembling it | Given-Then | [Materialized View](../patterns/distributed/coordination/materialized-view.md) |
| To handle an event that automatically triggers later work | Policy with failure branches | [Saga](../patterns/distributed/coordination/saga.md) |
| To reconstruct any past state, or audit every change | History is a requirement | [Event Sourcing](../patterns/architecture/event-sourcing.md) |

## Related areas
<!--meta block=siblings-->

- [Event Storming](./event-storming.md) — The prequel: agree what happens in the domain before laying it out as a design.
- [Multi-Step Processes](./multi-step-processes.md) — The policies the model draws are exactly what these patterns implement.
- [Scaling Reads](./scaling-reads.md) — Once every screen has its own projection, keeping them current is the read-side problem.
