---
title: Connection-Pool Exhaustion
description: "Every pool slot is held by a slow call, so requests hang instead of failing"
area: hazards
owner: Oleksandr Derechei
tags: [resilience, resource-management, availability]
status: stable
aliases: [pool exhaustion]
solves: [requests hang waiting for a database connection instead of failing, the database looks idle but our app times out on every query, one slow query made every unrelated endpoint slow too, we ran out of pool slots long before the database ran out of capacity]
---

# Connection-Pool Exhaustion

A downstream dependency slows down, so every borrowed connection is held longer, until every slot in the pool is occupied and new requests queue for a connection instead of failing — and a service that is merely slow underneath becomes a service that answers nothing at all.

## What it is
<!--meta block=description-->

**Connection-pool exhaustion** is the state where every connection in a pool is checked out and in use, so the next caller has to wait for one to come back. The pool is doing its job — connections are expensive to open, so a fixed set is created once and shared — and the trouble is what happens when the work each borrower does gets slower. How many connections you need is arrival rate multiplied by how long each one is held, so a query that goes from ten milliseconds to one second needs a hundred times the slots to serve the same traffic. The pool runs out long before the database does.

The symptom is the surprising part: requests hang rather than fail. With no limit on how long a caller may wait for a slot, the queue in front of the pool grows without a single error being logged, so nothing upstream sees a failure it could react to. CPU is low, memory is fine, the process is alive and answering nothing. The evidence lives in places you have to go looking for — waiters and wait time on the pool, threads all parked on the same acquire call — which is why this failure is usually diagnosed by elimination.

It is not the same failure as a [resource leak](./resource-leak.md), though it looks identical from outside. A leak is a connection that is never given back, usually on an error path, so capacity falls permanently and never recovers. Exhaustion is every connection legitimately in use at once: stop the traffic and the pool comes back. That difference is the diagnosis — watch whether utilization returns to baseline when load stops.

## Explained
<!--meta block=explain-->

Connection-pool exhaustion is the state where every connection in a shared pool is checked out, so the next caller must wait for one to come back. A pool exists because opening a connection is slow, so you keep a fixed set and lend them out. The number you need is arrival rate times how long each borrower holds one, so a downstream service that merely gets slower can empty the pool while traffic stays flat. The surprise is that requests hang instead of failing: with no limit on the wait, the line in front of the pool grows silently, the processor stays idle and nothing logs an error. It differs from a resource leak, where a connection is never returned. Here every connection is legitimately busy, and stopping traffic lets the pool recover. Do not just enlarge the pool, because that hands the same queue to the database and slows every other client. Put a timeout on acquiring a connection, so the hang becomes a fast error your alerts can see. Hold each connection for as short a time as possible, never across an outside call. Give each workload its own pool so a slow report cannot starve logins, and alert on waiters.

**Example.** A service has a pool of 20 connections and takes 100 requests a second, each holding one for 100 ms, so 10 are busy. The database slows and each hold becomes 400 ms. The pool now serves 20 / 0.4 = 50 requests a second, and 50 a second join the line. After 10 s, 500 callers are waiting and each waits 10 s, with no error logged. With a 500 ms acquire timeout the line holds at about 25 and the other 50 a second get a fast error, which a circuit breaker can see. The cost is that half of the requests fail visibly during the slowdown.

## How it happens
<!--meta block=causes-->

Nothing has to break for this to happen. Traffic stays the same and something downstream simply gets slower, so each request keeps its connection a little longer than it used to. Borrowed slots pile up, the last free one is taken, and everyone who arrives after that stands in line. The ordinary conditions below get you there.

The governing relation is concurrency equals arrival rate times holding time, so the pool saturates when downstream latency rises even though the offered rate has not moved. What turns saturation into a hang is the absence of a bound on the wait: with no acquire timeout the queue in front of the pool is unbounded, and overload is converted into latency rather than into errors. Each condition below supplies either the extra holding time or the missing bound.

The design mistake underneath is treating the pool as a buffer when it is really an admission control device: its size is the maximum concurrency you have decided to send downstream. The conditions below are how that decision goes unmade.

```mermaid caption="Slow, not broken: an unbounded wait for a slot turns one sluggish dependency into a service that answers nothing."
flowchart LR
    D["Downstream query slows"] -->|"each call holds its slot longer"| H["Checked-out connections rise to the cap"]
    H -->|"no slot free"| W["New requests queue for the pool"]
    W -->|"no acquire timeout"| Q["Threads park; requests hang instead of erroring"]
```

- Downstream latency rising: at the same traffic, a query that takes ten times longer needs ten times the slots, so a slow dependency exhausts the pool without any change in load.
- No timeout on acquiring a connection: the caller waits indefinitely for a slot, which is what converts overload into a hang instead of a fast, visible error.
- No statement or transaction timeout: a query blocked on a lock or a table scan holds its connection until the database decides to end it, and until then the slot is gone.
- Holding a slot across work that does not need it — an external API call, a file write, user think-time inside a transaction — which multiplies holding time for no benefit.
- Nested acquisition: a request holding one connection asks for a second, so with enough concurrent requests every slot is held by someone waiting for a slot and the pool deadlocks.
- A size chosen by default rather than by measurement, with no relation to how many workers can be in flight or how much concurrency the database can actually serve.

## What it costs
<!--meta block=cost-->

- **Requests hang instead of failing.** No error is returned, so no breaker trips, no retry budget is spent and no alert on error rate fires — the failure is invisible to every mechanism you built to catch failures.
- **The stall propagates upstream.** Callers waiting on your unanswered response hold their own threads and connections, so one slow query can occupy resources several services away from it.
- **The outage is total, not proportional.** Endpoints that never touch the slow query fail as well, because they draw from the same pool — a report page can take down the login path.
- **Health checks report the wrong thing.** A check that does not use the pool says the instance is fine while it serves nothing; a check that does use it fails, and the instance is evicted just as its peers are getting the redistributed load.
- **Diagnosis is slow at the worst time.** CPU, memory and error rate all look healthy, so the answer only appears in pool metrics or a thread dump — evidence many teams first collect during the incident.

Sizing is where this gets expensive, because the intuitive fix is the wrong one. Every connection is memory and a session on the database, which is the scarcer, shared resource, so enlarging the pool to stop the waiting hands the same queue to the server where it slows every other client too — past a point, more concurrency buys less throughput, since the work spends its time contending rather than executing. A rejection you can see costs a retry; a wait you cannot see costs the whole service.

## Getting out
<!--meta block=mitigation-->

Put a bound on every wait. A timeout on acquiring a connection, a timeout on the statement, a deadline on the request as a whole — each one turns an invisible hang into a fast error that your alerts, your breakers and your callers can all act on. Choose the acquire timeout deliberately: it is how long you are willing to let a caller queue before you would rather refuse them.

Then hold each slot for as little time as possible. Take the connection inside the unit of work and give it back immediately after, never across an external call, a file write or anything waiting on a person. Split the pool by workload so a slow analytical query cannot consume the slots the login path needs, and fix the double-borrow: a request that holds one connection while asking for another will [deadlock](./deadlock.md) the pool under enough concurrency.

Size it from the downstream's real concurrency limit, not from your request rate, and confirm it with a load test that pushes latency up rather than traffic. Alert on the two numbers that move first — waiters on the pool and time spent waiting for a slot — because both rise well before any request-level metric does. When a dependency is slow rather than broken, a breaker in front of it releases the slots your service is spending on calls that will not finish in time. And if pool utilization does not fall back after traffic stops, stop tuning the size: what you have is a leak, not exhaustion.

## How it relates
<!--meta block=relationships-->

<!-- relationships:start -->

<!-- GENERATED by gen-relations from docs/data/relations.json. Do not edit this block. -->

**Mitigated by**

- [Timeout / Deadline](../patterns/distributed/resilience/timeout-deadline.md) — Acquire and statement timeouts turn a hang into a visible error
- [Bulkhead](../patterns/distributed/resilience/bulkhead.md) — Per-workload pools stop one slow query starving every path
- [Circuit Breaker](../patterns/distributed/resilience/circuit-breaker.md) — Releases slots spent on calls that cannot finish in time

<!-- relationships:end -->
