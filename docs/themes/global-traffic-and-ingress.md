---
title: Global Traffic & Ingress
description: "Getting every request to a healthy region, and screening it on the way in"
area: themes-operating
owner: Oleksandr Derechei
tags: [routing, availability, load-balancing, edge]
status: stable
---

# Global Traffic & Ingress

How a request finds a healthy part of a system spread across regions, what it passes through on the way in, and what the entry point owes you when a region stops answering.

## The question
<!--meta block=description-->

Once a system runs in more than one place, a request has to be sent somewhere, and that choice is now a reliability decision rather than a routing detail. Send it to the nearest region and it is fast until that region is the broken one. Send it anywhere and the fast path is wasted. Send it to a region that has just started failing and the user gets an error the system already knew about.

So the entry point has two jobs, and they are separable. It has to know which regions are currently able to serve — which means asking them, continuously, rather than assuming. And it has to be the only way in, so that whatever screening happens there cannot be bypassed by anyone who learns a backend address.

Health-based routing is the part people underestimate. The router probes each region and stops sending traffic to any that answers badly, which turns a regional outage into a routing event nobody has to be paged for. What the probe checks is therefore a design decision with consequences: a probe that reports only that a process is running will keep routing traffic into a region whose database is unreachable, and one that checks every dependency on every probe becomes load in its own right, because a global router probes from every edge location it has.

The second job is why the entry point is a single one. Screening, rate limiting and request validation are only guarantees if no path skips them, so the backends have to reject anything that did not arrive through the front door. Without that check the whole edge is advisory, and anyone who finds a regional address gets an unscreened route to the application.

The uncomfortable consequence is that the entry point becomes the one component whose failure is total. Everything behind it can be redundant across regions, and none of that helps if the thing choosing between them is down or misconfigured. That is the trade the design accepts: concentrate the routing decision, then spend disproportionately on the availability of the place where it is made — and treat its configuration as production code, because a wrong rule there is indistinguishable from an outage.

## Explained
<!--meta block=explain-->

Global traffic routing sends each request to a region that is working right now, and makes one entry point the only way in so that checks on requests cannot be skipped. The router asks each region whether it is healthy, continuously, and stops sending traffic to one that answers badly, so a regional outage becomes a routing change rather than an incident. The choice that matters is how fast to react. A strict, frequent check removes a region at its first stumble, but a blip then shifts its load onto the other regions. A forgiving, rare check leaves users on a broken region until the interval runs out. Choose one entry point over several when you need every request screened the same way. Its cost is that its failure is total, so spend on its availability and review its rules like production code. Have each backend reject anything that did not come through the front door, or a leaked address gives an unscreened route. Make the health check test only what a request needs, since a check of every dependency becomes load of its own.

**Example.** Three regions each take 1,000 requests a second and can hold 1,500. The router checks each every 10 s and removes a region after 3 failures. If region A dies, 30 s pass before removal and about 30,000 requests fail. Then A's 1,000 requests split 500 each to B and C, which now sit at exactly 1,500. Removing after 1 failure cuts the loss to about 10,000 requests. But a one-off blip would then also push the neighbours to their limit. Neither setting is free: you trade failed requests against needless shifts.

## The tradespace
<!--meta block=tradespace-->

The first tension is between reacting fast and reacting correctly. Probe often and with a strict threshold, and a region leaves rotation the moment it stumbles — including when the stumble was a blip, and the traffic you shifted away lands on neighbours that now carry it too. Probe rarely and forgivingly, and users meet a broken region for as long as the interval lasts.

The second is between concentrating and spreading. One entry point makes every guarantee enforceable and makes failover a single decision, and it is also the component whose failure nothing behind it can survive. Spreading the decision — several entry points, or resolution-level failover — removes that single point and gives up the ability to say that every request was screened the same way.

A third runs underneath both: how much the edge should do. Caching, compression and screening at the edge cut work and latency for the whole fleet, and each one is behaviour that now lives somewhere the application team does not deploy. Every capability moved to the edge makes the edge more load-bearing, which raises the cost of the outage the first tension already told you to expect.

**The entry point is where availability is won and where it is concentrated — the same property, read twice.**

## The tour
<!--meta block=tour-->

<!-- tour:start -->

<!-- GENERATED by gen-tours from docs/data/learning-paths.json. Do not edit this block. -->

### [Health Endpoint Monitoring](../patterns/distributed/resilience/health-endpoint.md) {#tour-health-endpoint}

Health-based routing is only as good as the answer the probe gets. An endpoint that checks the dependencies a request actually needs is what lets a region take itself out of rotation, and it is also the manual lever: make it report unhealthy and traffic drains away without touching the router.

### [Load Balancer](../patterns/distributed/routing/load-balancer.md) {#tour-load-balancer}

The decision itself, taken globally rather than within a rack: spread requests across the regions that are currently serving, and stop sending to one that is not. Weighted distribution is the same mechanism used deliberately — it is how a release ramps and how a region is drained for maintenance.

### [Gatekeeper](../patterns/distributed/routing/gatekeeper.md) {#tour-gatekeeper}

Malicious and malformed requests are cheapest to reject at the edge, before they consume a connection, a thread or a database call anywhere behind it. Putting the check in front of the regions means it runs once and protects all of them, and it is what makes the entry point worth concentrating on.

### [Content Delivery Network](../patterns/distributed/routing/cdn.md) {#tour-cdn}

Static assets answered at the edge never become regional load at all, and cached content keeps a page usable when the origin behind it is struggling. It is the cheapest capacity in the system, and the reason a partial outage often looks like a slow page rather than a broken one.

### [Reverse Proxy](../patterns/distributed/routing/reverse-proxy.md) {#tour-reverse-proxy}

Inside each region, one hop terminates connections and forwards to instances, which is where per-region concerns land: certificate handling, connection reuse, and the check that a request really did arrive through the global entry point rather than around it.

### [API Routing](../patterns/distributed/routing/api-routing.md) {#tour-api-routing}

What in the request names its destination — path, host, header, version prefix — is what makes it possible to run two API versions at once and route each to its own backends. During a gradual release that is not a convenience; it is the mechanism the release depends on.

### [Sticky Session](../patterns/distributed/routing/sticky-session.md) {#tour-sticky-session}

Sometimes the routing decision must not be made freshly on every request: a user part-way through a session should not flip between two versions of a front end mid-flow. Affinity buys that consistency and gives up even distribution, and it makes draining a destination slower because its users have to be released rather than simply redirected.

<!-- tour:end -->

## When to reach for what
<!--meta block=decide-->

| If you need… | Move | Reach for |
| --- | --- | --- |
| Traffic spread across regions and pulled away from failing ones | Route on health | [Load Balancer](../patterns/distributed/routing/load-balancer.md) |
| The router to know a region cannot serve, before users do | Ask, don't assume | [Health Endpoint Monitoring](../patterns/distributed/resilience/health-endpoint.md) |
| Bad requests rejected before they cost anything | Screen at the edge | [Gatekeeper](../patterns/distributed/routing/gatekeeper.md) |
| Static content served without touching a region | Cache at the edge | [Content Delivery Network](../patterns/distributed/routing/cdn.md) |
| One place per region to terminate connections and enforce entry | Front the instances | [Reverse Proxy](../patterns/distributed/routing/reverse-proxy.md) |
| Two API versions live at once during a release | Route by version | [API Routing](../patterns/distributed/routing/api-routing.md) |
| A user not to flip between versions mid-session | Pin the destination | [Sticky Session](../patterns/distributed/routing/sticky-session.md) |

## Related areas
<!--meta block=siblings-->

- [Scale Units & Stamps](./scale-units-and-stamps.md) — What the router is choosing between, and why the destinations are interchangeable in the first place.
- [Health Modeling](./health-modeling.md) — What "healthy" should mean in the answer the probe returns, and how that answer is assembled.
- [Securing Availability](./securing-availability.md) — The screening the entry point performs, and why bypassing it is the failure that matters most.
- [Performance](./performance.md) — Balancing, caching and edge delivery read as latency work as much as availability work.
