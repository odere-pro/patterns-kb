---
title: Health Modeling
description: Turning a wall of metrics into one answer a router and an operator can act on
area: themes-operating
owner: Oleksandr Derechei
tags: [observability, availability]
status: stable
---

# Health Modeling

How raw telemetry becomes a single verdict per user flow — healthy, degraded or not serving — that a router can route on and an operator can act on without reading a dashboard.

## The question
<!--meta block=description-->

A well-instrumented system emits thousands of numbers and answers none of the questions anyone asks during an incident. Is the product working? For whom? Should traffic still be going here? A dashboard of green tiles with one amber square in the corner does not answer that, and neither does an alert saying processor usage is at eighty percent, because nobody knows whether eighty percent matters this afternoon.

A health model is the missing layer. It says, explicitly, what "healthy" means for each user-facing flow — which measures count, what thresholds separate healthy from degraded from failing, and how the parts roll up into one verdict for the whole. The output is small enough to act on: a colour per flow, and one at the root that says whether the business is being served.

Building it forces the questions instrumentation lets you avoid. Which flows actually matter, and what does each one depend on? What does degraded mean, as distinct from broken — and is a degraded flow still worth serving? At what threshold does a number become a state change rather than a wiggle? Those are product decisions written in metrics, and the modelling is where they get made rather than improvised at 3am.

The verdict is worth computing precisely because two consumers can act on it. A router can pull a whole region out of rotation when its root verdict turns red, which makes failover automatic rather than a page. And an alert fired on the root node tells the operator that users are affected, rather than that a metric moved — so the alert is worth waking someone for, and quiet dashboards stay quiet.

Two engineering constraints shape the implementation and are usually discovered late. The verdict is queried far more often than anyone expects — a global router probes from every edge location it has — so the answer is computed periodically and served from a short-lived cache rather than recomputed per probe, which trades a few seconds of detection delay for not turning health checks into load. And the telemetry has to outlive the thing that produced it: on disposable infrastructure the evidence of an incident is destroyed along with the component unless logs and metrics were written somewhere with a longer lifetime.

## Explained
<!--meta block=explain-->

A health model is a written rule that turns thousands of metrics into one answer per user-facing flow, such as healthy, degraded or failing, and rolls those up into one verdict for the whole system. Without it, a wall of green tiles and an alert that processor use is at 80% tell nobody whether users are being served. With it, a router can pull a failing region out of rotation on its own, and an alert on the root verdict means users are affected. The trade that decides the design is fast against stable. A short window and a tight threshold catch a real failure in seconds but flip on a blip, and a flipping verdict is worse than a slow one because traffic bounces between regions. A longer window needs several bad readings in a row, which costs errors served for the length of the window. Choose stable when moving traffic is expensive. Compute the verdict on a timer and serve it from memory for a few seconds, because every edge location probes it and a fresh check on each probe becomes load. Write telemetry somewhere that outlives the machine, or an incident's evidence disappears with it.

**Example.** A checkout flow is checked every 20 s. It turns failing when 3 checks in a row show more than 10% errors, and healthy again after 3 clean ones. At 1,000 requests a second, a 20 s blip with 40% errors changes nothing. A real outage with 100% errors is called after 60 s, and about 60,000 requests fail before the router drains the region. Flipping on the first bad check would cut that to 20,000, but the blip would also move the region's 1,000 requests a second onto its neighbours for nothing. Pick the window by what a needless move costs.

## The tradespace
<!--meta block=tradespace-->

The first trade is between a verdict that is easy to trust and one that is easy to explain. A model that checks a few dependencies is cheap, fast and occasionally wrong in both directions — it says healthy while a feature nobody probed is broken, and it says unhealthy when one non-critical check times out. A model that considers every measure is accurate and slow, and when it turns red nobody can say which of the forty inputs did it.

The second is between reacting quickly and reacting stably. A short evaluation window and a tight threshold detect a real failure in seconds, and they also flip on a blip — and a flipping verdict is worse than a slow one, because traffic moves back and forth and neither destination settles. Longer windows and hysteresis buy stability at the cost of serving errors for the length of the window.

The third is what the verdict is allowed to depend on. Checking a dependency directly gives a definitive answer and makes that dependency's slowness part of your health, so a store that is merely slow can report you as down. Inferring health from the traffic you are already serving costs nothing extra and says nothing at all when traffic is low — which is exactly when a synthetic check earns its place.

**A verdict is only useful if something acts on it automatically; anything a human has to interpret is a dashboard, not a model.**

## The tour
<!--meta block=tour-->

<!-- tour:start -->

<!-- GENERATED by gen-tours from docs/data/learning-paths.json. Do not edit this block. -->

### [Health Endpoint Monitoring](../patterns/distributed/resilience/health-endpoint.md) {#tour-health-endpoint}

The model's output has to be reachable, and this is where it surfaces. An endpoint that reports the rolled-up verdict rather than merely that the process is alive is what turns the model from a dashboard into a control: the router reads it, and an unhealthy region stops receiving traffic without anybody being paged.

### [In-Process Cache](../patterns/caching/in-process-cache.md) {#tour-in-process-cache}

Every edge location of a global router probes independently, so an endpoint that checks its dependencies on each request generates far more load than the traffic it is protecting. Computing the verdict on a timer and serving it from memory for a few seconds costs a little detection delay and removes the whole problem.

### [Circuit Breaker](../patterns/distributed/resilience/circuit-breaker.md) {#tour-circuit-breaker}

Breaker state is the cheapest input a model can have, because it has already done the judging: open means this specific dependency is failing right now. Rolling breaker states into the verdict gives an answer that says which dependency is at fault rather than only that something is.

### [Distributed Tracing](../patterns/distributed/resilience/distributed-tracing.md) {#tour-distributed-tracing}

The model says a flow is degraded; the trace says which hop in that flow spent the time. Modelling health per user flow only pays off if the flow can be followed across the services it crosses, which is what makes the verdict a starting point for diagnosis rather than the end of the information.

### [Wire Tap](../patterns/messaging/wire-tap.md) {#tour-wire-tap}

Health of an asynchronous path is invisible from either end — the producer only knows it published, and the consumer only knows what it received. Copying messages to an inspection point gives the model evidence about the part of the flow that has no request to measure.

### [Secure Logger](../patterns/security/secure-logger.md) {#tour-secure-logger}

A model is only as good as what it is allowed to record, and the usual reason for thin telemetry is that turning it up would put credentials or personal data in a log store. Redacting at the point of writing is what makes generous logging a decision about cost rather than about compliance.

<!-- tour:end -->

## When to reach for what
<!--meta block=decide-->

| If you need… | Move | Reach for |
| --- | --- | --- |
| A verdict something else can route on | Publish it | [Health Endpoint Monitoring](../patterns/distributed/resilience/health-endpoint.md) |
| Health checks not to outweigh real traffic | Compute on a timer | [In-Process Cache](../patterns/caching/in-process-cache.md) |
| The verdict to name which dependency is failing | Reuse breaker state | [Circuit Breaker](../patterns/distributed/resilience/circuit-breaker.md) |
| To find which hop made a flow slow | Follow the request | [Distributed Tracing](../patterns/distributed/resilience/distributed-tracing.md) |
| Evidence from a path with no request to measure | Copy the messages | [Wire Tap](../patterns/messaging/wire-tap.md) |
| To log generously without creating a compliance incident | Redact on write | [Secure Logger](../patterns/security/secure-logger.md) |

## Related areas
<!--meta block=siblings-->

- [Observability](./observability.md) — Collecting the raw signals. This theme is the layer above: deciding what they mean and reducing them to one answer.
- [Global Traffic & Ingress](./global-traffic-and-ingress.md) — The main consumer of the verdict — a router that acts on it turns a regional failure into a routing event.
- [Continuous Validation](./continuous-validation.md) — Injecting a fault is how you find out the model would actually have noticed.
- [Resilience](./resilience.md) — The mechanisms whose state the model reads, and whose engagement it should make visible.
