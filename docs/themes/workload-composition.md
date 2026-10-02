---
title: Workload Composition
description: "Splitting a workload into parts that scale alone, with a write path that never makes the caller wait"
area: themes-operating
owner: Oleksandr Derechei
tags: [scalability, decoupling, asynchrony, separation-of-concerns]
status: stable
---

# Workload Composition

How to cut one application into components that scale on their own signals and fail on their own, so a slow database or a busy worker never becomes a slow front end.

## The question
<!--meta block=description-->

An application that does everything in the request thread has one load pattern and one failure mode, and both belong to the slowest thing it touches. A user posts a comment, the request holds a thread while the database write commits, and every other user waiting behind that thread is now paying for the database's afternoon. Add capacity and you add it to everything at once, because there is only one thing to add capacity to.

Composition is the decision to stop that. Cut the workload along the lines where load actually differs — the part users wait on, the part that grinds through work nobody is watching, the part that answers a probe — and let each scale, fail and be replaced without the others noticing. The cut is not free: the moment a write leaves the request it becomes a message someone has to deliver, and delivered messages arrive twice.

Three properties make the pieces genuinely independent, and dropping any one puts the coupling back. Components hold no per-user state, so any instance serves any request and instances can be added or killed without a migration. Slow writes go through a buffer rather than down the wire, so the front end returns in milliseconds regardless of what the store is doing. And every component reports its own health, so the thing in front of it can route around it rather than discovering the problem through user-facing errors.

The write path is where the design earns its keep and where it gets hard. Accepting a write means acknowledging something you have not done yet, which is a promise rather than a fact. The client gets an identifier and a place to look; the work happens behind the buffer at whatever rate the workers can sustain; and because the buffer will redeliver, every handler has to produce the same result the second time it runs.

What you lose is the single transaction and the single stack trace. The write is no longer atomic with the response, so the client has to be told how to find out what happened rather than being told the answer. The failure is no longer one exception, so a request that crossed three components leaves three unrelated log streams unless something threads them together. Both are recoverable, and both cost work a single process never had to do — which is the honest reason not to compose a workload that has no scaling problem.

## Explained
<!--meta block=explain-->

Workload composition means cutting an application along the lines where load differs, so each part scales, fails and is replaced on its own, and the slow part of a write never holds the caller. In a single process every request holds a thread until the slowest thing it touches finishes, so a slow database slows everyone. Three properties keep the pieces independent. Components keep no per-user state, so any copy serves any request. Slow writes go through a buffer, a queue that holds work until a worker takes it, so the front end answers in milliseconds. Each component reports its own health, so traffic routes around a failing one. Choose it where load patterns really differ, and skip it where they do not, because it is pure overhead there. It costs three things. The caller gets a receipt, not a result, so give it an identifier and a place to check. A buffer redelivers, so make each handler give the same result the second time. And one request now leaves three logs, so thread one correlation identifier through all of them.

**Example.** A comment service has 150 threads and takes 100 posts a second. In a slow patch each database write takes 2 s, so 100 x 2 = 200 threads are needed and the pool of 150 runs dry. With a queue, the front end returns after 10 ms, holding about 1 thread. If workers manage only 50 writes a second, the backlog grows 50 a second, 30,000 after 10 minutes. The cost is that comments appear late, and a redelivered message posts twice unless each carries an idempotency key.

## The tradespace
<!--meta block=tradespace-->

The tension is between answering now and answering truthfully. A request that waits for the write to commit can tell the user exactly what happened, and it holds a thread for as long as that takes. A request that hands the write to a buffer returns in milliseconds and can only say the work has been accepted — a smaller promise, and one the system can keep under load that would have collapsed the first design.

Every cut moves cost from the request path to somewhere else rather than removing it. Statelessness moves session data into a shared store, which is a network hop the process no longer avoids. Buffering moves the write into a broker, which is another thing to run, size and watch. Independent scaling means several policies to tune instead of one. The trade is worth making where the load patterns genuinely differ, and is pure overhead where they do not.

Underneath sits a requirement that is easy to skip and expensive to retrofit: once work is buffered, it will be delivered more than once. Repeat-safety has to be designed into each handler at the point where it writes, and bolting it on later means auditing every write path in the system rather than writing one guard clause.

**Answer immediately and promise less, or answer completely and hold the caller.**

## The tour
<!--meta block=tour-->

<!-- tour:start -->

<!-- GENERATED by gen-tours from docs/data/learning-paths.json. Do not edit this block. -->

### [Stateless Service](../patterns/distributed/routing/stateless-service.md) {#tour-stateless-service}

The precondition for everything else here. If no instance holds something the others lack, instances can be added, killed and replaced with no migration and no session to preserve — which is what makes independent scaling a configuration change rather than a project.

### [Idempotency](../patterns/messaging/idempotency.md) {#tour-idempotency}

A worker that dies after writing but before acknowledging will see its message again, so every handler must produce the same result the second time. This is not optional once a buffer is in the path — it is the price of the acknowledgement, and skipping it turns a crash into duplicated data.

### [Queue-Based Load Leveling](../patterns/distributed/resilience/load-leveling.md) {#tour-load-leveling}

A queue between the front end and the write lets the request return the moment the message is durable, instead of holding a thread until the store commits. The front end then serves at its own pace and the store works at its own, and a burst becomes queue depth rather than a timeout.

### [Competing Consumers](../patterns/messaging/competing-consumers.md) {#tour-competing-consumers}

The other half of the buffer: several workers pull from the same channel, each claiming its own message, so backlog turns into throughput by adding instances. It is why the worker's scaling signal is queue depth while the front end's is request rate.

### [Autoscaling](../patterns/distributed/routing/autoscaling.md) {#tour-autoscaling}

Separated components have different load shapes, so they get different policies: the front end tracks request rate and must react quickly because users are waiting, while the worker tracks queue depth and can react slowly because nobody is. One policy for both wastes capacity on one and starves the other.

### [Health Endpoint Monitoring](../patterns/distributed/resilience/health-endpoint.md) {#tour-health-endpoint}

Each component answers for itself, so an instance that has lost its store leaves rotation before users meet it. Independence is only real if the thing in front can tell which piece is unwell.

### [Correlation Identifier](../patterns/messaging/correlation-identifier.md) {#tour-correlation-identifier}

Splitting the workload splits the evidence. An id generated at the edge and carried through the buffer into the worker turns three unrelated log streams back into one story, and returning it to the caller is what lets support answer a question about one specific request.

<!-- tour:end -->

## When to reach for what
<!--meta block=decide-->

| If you need… | Move | Reach for |
| --- | --- | --- |
| To add and remove instances without migrating anything | Push state out | [Stateless Service](../patterns/distributed/routing/stateless-service.md) |
| A write that does not hold the caller while the store commits | Buffer it | [Queue-Based Load Leveling](../patterns/distributed/resilience/load-leveling.md) |
| Backlog to drain faster by adding capacity | Parallel consumption | [Competing Consumers](../patterns/messaging/competing-consumers.md) |
| A redelivered message not to double-write | Same result twice | [Idempotency](../patterns/messaging/idempotency.md) |
| Each component to scale on the signal that actually drives it | Separate policies | [Autoscaling](../patterns/distributed/routing/autoscaling.md) |
| A failing component pulled out before users notice | Report readiness | [Health Endpoint Monitoring](../patterns/distributed/resilience/health-endpoint.md) |
| One request followed across the pieces it was split into | Thread the evidence | [Correlation Identifier](../patterns/messaging/correlation-identifier.md) |

## Related areas
<!--meta block=siblings-->

- [Scale Units & Stamps](./scale-units-and-stamps.md) — Composition decides what the pieces are; the scale unit decides how they are bundled and deployed together.
- [Long-Running Tasks](./long-running-tasks.md) — The same buffer-and-worker shape, followed through to progress reporting and results the client collects later.
- [Scalability](./scalability.md) — Independent components are what make horizontal scale a choice per component rather than one decision for the whole application.
- [Health Modeling](./health-modeling.md) — Once a workload has several components, deciding whether the whole thing is healthy stops being obvious.
