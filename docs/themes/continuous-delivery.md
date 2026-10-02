---
title: Continuous Delivery
description: "Shipping each service on its own schedule, safely and often"
area: themes-operating
owner: Oleksandr Derechei
tags: [operations, lifecycle, maintainability]
status: stable
aliases: [CI/CD, continuous deployment, release engineering]
---

# Continuous Delivery

Getting a change from a merge to production on one team's schedule, often enough that releasing is ordinary and rolling back is rehearsed.

## The question
<!--meta block=description-->

Can the team that owns one service ship it this afternoon without asking anyone? That is the promise of splitting a system into services, and it is the part of the promise hardest to fake. Everything on this page exists to make the answer yes, and to keep it yes on the day the change turns out to be wrong.

Three terms get used interchangeably and mean different things. **Continuous integration** is merging into the main branch often, with an automated build and test suite keeping main at production quality. **Continuous delivery** publishes whatever passes those gates to a production-like environment automatically, so the code is always ready to deploy — the last step to live may still want a human to approve it. **Continuous deployment** removes that human. Reach the second, then decide deliberately whether you want the third.

It matters more here than in a monolith because of what a monolith forces. One pipeline produces one artifact, so every team's work feeds the same queue: an urgent fix has to be integrated, tested and published before any feature can ship, and one team's problem becomes everybody's schedule. Services are supposed to end that queue. If yours have not, look for a [Distributed Monolith](../hazards/distributed-monolith.md) — you are paying for the split without collecting on it.

The promise has a precondition that is easy to skip past. Shipping daily works only when regressions are rare and recovery is fast, so the pipeline has to earn trust before the cadence rises. A team that releases often with no way back has not got continuous delivery; it has an unusually efficient way to break production.

## Explained
<!--meta block=explain-->

To ship a change safely you pick a release strategy, and the constraint picks it for you. If the change breaks a contract that callers use, no strategy that runs two versions side by side is safe, so serve both shapes until the last caller has moved. Otherwise the choice is speed against exposure. A rolling update replaces copies one at a time and needs no spare capacity, but any request may hit either version. Blue-green stands up a second complete set and switches once, which gives the cleanest rollback and costs double capacity while both exist. A canary sends a weighted slice of real users to the new version, which catches what no test environment shows, and needs routing that splits traffic by percentage plus metrics good enough to judge by. The other bills are organizational. When every team deploys alone, the knowledge of how the system ships scatters, so share pipeline templates with one accountable owner. Automation with no gates lets an unreviewed artifact reach production, so encode approvals as rules that run without a person: required checks, and cluster rules that refuse anything your pipeline did not build and sign.

**Example.** A service runs on 10 copies and takes 2,000 requests a second. A release has a bug that fails 20% of requests. Splitting by copy count, the smallest slice is one copy, 10% of traffic: 200 requests a second reach the bug and 40 fail every second. Weighted routing at 2% sends 40 requests a second and 8 fail. Spotted after one minute, that is 480 failed requests instead of 2,400. Releasing to all 10 copies at once would fail 400 every second. The price is a router that supports weights and a dashboard comparing the new version's errors to the old one's.

## The trade-space
<!--meta block=tradespace-->

The first tension is **autonomy against coherence**. Let every team build its own pipeline and each one fits its stack perfectly, while knowledge of how to deploy the whole system scatters until nobody can answer a question about it. Centralize the pipeline and you get one answer, one standard, and one queue — the queue you split the system to escape. The usual settlement is shared templates rather than a shared pipeline: common build, test, scan and deploy steps a team adopts and can override, so standardization is a default instead of a gate.

Templates standardize the steps; they do not make one build agent able to build every team's stack. Move the toolchain into the build itself — each service builds inside a container carrying its own compiler and dependencies — and the build system only has to know how to run containers. A team then adopts a language without asking anyone to install anything.

The second is **speed against exposure**, and it is what separates the release strategies. A rolling update needs no spare capacity but leaves both versions serving while it runs, so any request may hit either. Blue-green removes that mixed window by standing up two complete sets and switching once, and charges double capacity for the service while both exist. A canary exposes a slice of real users first, which catches what no test environment will, and needs routing that can split traffic by weight — dividing by replica count alone gives steps no finer than one replica in your total.

The third is **fidelity against cost**. Teams release at their own pace and their services depend on each other, so the honest integration test is the whole system, which nobody can afford one copy of per team. Two things buy most of that confidence for a fraction of the price: short-lived preview environments created per change and destroyed after it merges, and contract tests that pin what each side of an interface promises, so an incompatibility fails in a build instead of in production.

Underneath all three sits a governance question that gets mistaken for a technical one. Every team should be **able** to deploy, which is not the same as every person having permission to. A named release manager approving each deploy throttles exactly the velocity the architecture was bought for. The alternative is not ungoverned — it is governed by policy that runs without a person: environment gates, required checks, and cluster-side rules that refuse an artifact the pipeline did not build and sign. Signing proves the image is the one you built; it says nothing about what is inside it. Two further gates answer that: a bill of materials generated at build time records the dependencies the image actually shipped, so the next disclosed vulnerability is a query rather than an investigation, and a scan that blocks the pipeline stops a known-bad dependency reaching a registry at all. Make the scan blocking or do not run it — a warning nobody has to clear is a report, not a gate.

One more choice cuts across all of it, and both answers are in production at large companies. A single repository makes shared code, cross-service refactoring and one standard easy, and makes a change to shared code able to touch everything at once. Separate repositories give each team clear ownership and enforce decoupling by making sharing awkward, at the price of discoverability and duplicated tooling. Whichever you pick, scope the build triggers by path, or every commit rebuilds and redeploys services that did not change.

Last, the pipeline can push the change or the cluster can pull it, and the difference is where the credential lives. A pushing pipeline authenticates to the cluster and applies the change itself, so every pipeline that deploys holds cluster access. A pulling cluster reads its desired state from version control and converges on it, so the pipeline's job ends at publishing a signed image and no build job holds cluster credentials at all — see [Container Orchestration](../patterns/distributed/coordination/container-orchestration.md). Pull also gives you the deployment history for free, because the history is the repository. It costs you the straight line from commit to running change: the cluster converges when it next reconciles, not when the pipeline says so. Both models assume you have already chosen where the services run, and that choice answers to three things: what it costs two services to talk to each other, whether one can be given capacity without the others, and whether one can be released without the others. A platform that fails the third makes everything on this page moot.

```mermaid caption="Compatibility decides first, because an incompatible change rules out every strategy that mixes versions. Capacity and how much you need to learn from real users decide the rest."
flowchart TB
    Q{"Is the change compatible with the version already serving?"}
    Q -->|"No"| Side["Serve both versions until every client migrates"]
    Q -->|"Yes"| Cap{"Can you afford double capacity briefly?"}
    Cap -->|"Yes"| BG["Blue-green: validate the new set, switch once"]
    Cap -->|"No"| Learn{"Do you need real traffic to judge it?"}
    Learn -->|"Yes"| Can["Canary: a slice first, then widen"]
    Learn -->|"No"| Roll["Rolling update: a few instances at a time"]
```

## The tour
<!--meta block=tour-->

<!-- tour:start -->

<!-- GENERATED by gen-tours from docs/data/learning-paths.json. Do not edit this block. -->

### [Stateless Service](../patterns/distributed/routing/stateless-service.md) {#tour-stateless-service}

Every strategy on this page assumes an instance can be taken away without anyone noticing. That holds only when the instance carries nothing a user needs — no session in memory, no half-finished work on local disk. Move that state to a store both versions can read and a deploy stops being an event your users can feel.

### [Container Orchestration](../patterns/distributed/coordination/container-orchestration.md) {#tour-container-orchestration}

Once the fleet is described by a declaration rather than a runbook, a release is an edit to that declaration and a rollback is the opposite edit. The same control loop that replaces a dead instance raises the new version and retires the old one, so deploying stops being a separate mechanism with failure modes of its own.

### [Health Endpoint Monitoring](../patterns/distributed/resilience/health-endpoint.md) {#tour-health-endpoint}

An automated rollout needs a truthful answer to "is this new instance actually serving?" before it retires an old one. An endpoint that checks the dependencies the service really needs turns a bad release into a stalled rollout with the previous version still up, which is the difference between a non-event and an outage.

### [Blue-Green Deployment](../patterns/distributed/routing/blue-green-deployment.md) {#tour-blue-green-deployment}

Stand the new version up complete, exercise it while it takes no live traffic, then move everyone across at once. Nobody ever meets a mix of versions, and recovery is moving the traffic back — the fastest rollback available anywhere on this page. You pay for it in capacity, briefly, twice over.

### [Canary Release](../patterns/distributed/routing/canary-release.md) {#tour-canary-release}

Some failures appear only under real traffic, real data and real client versions, and no staging environment will show them to you. Send a small share of users to the new version, compare its error rate and latency against the old, and widen only while the comparison holds. The price is routing that can split traffic by weight rather than by instance count.

### [API Versioning](../patterns/distributed/routing/api-versioning.md) {#tour-api-versioning}

Independent deployment fails the first time a service changes a contract its callers depend on, because now two teams have to ship on the same day. Publishing the new shape beside the old one, and retiring the old only when the last caller has moved, turns one coordinated release into two ordinary ones.

### [Strangler Fig](../patterns/distributed/coordination/strangler-fig.md) {#tour-strangler-fig}

If everything still ships together today, the way out is not a rewrite that ends in a big-bang cutover. Put a facade in front, move the slice with the fewest dependencies behind it, and give that slice its own pipeline. Every slice that gains its own cadence is a permanent reduction in how many teams have to be in the room.

<!-- tour:end -->

## When to reach for what
<!--meta block=decide-->

| If you need… | Strategy | Reach for |
| --- | --- | --- |
| An instance you can remove mid-release without losing a user's work | Keep nothing in the instance | [Stateless Service](../patterns/distributed/routing/stateless-service.md) |
| To roll a version across a fleet, and back, without a runbook | Edit the declared state | [Container Orchestration](../patterns/distributed/coordination/container-orchestration.md) |
| A rollout that stops itself when the new version cannot serve | Gate every step on readiness | [Health Endpoint Monitoring](../patterns/distributed/resilience/health-endpoint.md) |
| To validate the new version fully before any user reaches it | Two complete sets, one switch | [Blue-Green Deployment](../patterns/distributed/routing/blue-green-deployment.md) |
| To learn from real traffic before committing everyone to it | A slice first, then widen | [Canary Release](../patterns/distributed/routing/canary-release.md) |
| To change a contract that callers still depend on | Both shapes served at once | [API Versioning](../patterns/distributed/routing/api-versioning.md) |
| To reach independent deployment from a system that has none | One slice at a time, behind a facade | [Strangler Fig](../patterns/distributed/coordination/strangler-fig.md) |
| To choose a platform that will not block independent deployment | Judge the runtime, not the price | [Compute](../capabilities/compute.md) |

## Related areas
<!--meta block=siblings-->

- [Microservices Design](./microservices-design.md) — Where the boundaries fall decides how much independent deployment you can get at all — no pipeline recovers what a bad split gave away.
- [Observability](./observability.md) — A canary is a comparison, so it is only as good as the signals compared; a release you cannot watch is a release you cannot roll back in time.
- [Resilience](./resilience.md) — Releasing often means meeting more failures in production on purpose, which pays off only if a bad version degrades instead of cascading.
