---
title: Continuous Validation
description: "Proving a release is safe before it takes traffic, and while it does"
area: themes-operating
owner: Oleksandr Derechei
tags: [testing, availability]
status: stable
---

# Continuous Validation

How to keep evidence flowing that a change is safe — before any user meets it, while a measured slice does, and afterwards by breaking it on purpose to check the safeguards still work.

## The question
<!--meta block=description-->

A test suite tells you the change does what its author intended on a machine that resembles production. It cannot tell you how the change behaves at real load, against real data, with the clients you actually have, while the dependency it calls is having a slow afternoon. Those are the conditions that produce the incidents, and they only exist in one place.

Continuous validation is the decision to keep gathering evidence past the point where testing usually stops. Prove the new version works on real infrastructure before a user reaches it. Give it a measured share of traffic and compare it against the version still serving everyone else. And separately, on a schedule, break things on purpose to check that the mechanisms which are supposed to save you actually do.

The three stages answer different questions and none substitutes for another. A smoke test against a freshly built environment answers whether it is wired up at all — certificates, secrets, connectivity. A weighted comparison answers whether the new version behaves like the old one under production conditions. A deliberately injected fault answers whether the timeouts, breakers and probes are configured correctly, which no release ever tests because a healthy release never triggers them.

What makes the evidence actionable is that every stage has a way back that costs the same as going forward. A release that ramps by traffic weight aborts by setting the weight to zero. A release that replaced infrastructure rolls back by pointing at the infrastructure that is still running. Validation without a cheap reversal is just a slower way to find out you were wrong.

The constraint underneath all of it is that two versions are live at once for the whole overlap, and they share a data store that cannot be duplicated. That forces forward compatibility as a code requirement — a version must ignore fields it does not understand rather than rejecting them — and it forces schema changes into expand-then-contract, because the moment the new version writes something the old one cannot read, the reversal you were relying on has quietly stopped working.

## Explained
<!--meta block=explain-->

Continuous validation means you keep collecting evidence about a release after your tests pass, because tests cannot show how a change behaves under real load, real data and a slow dependency. There are three stages, and none replaces another. A smoke test on freshly built infrastructure proves it is wired up. A canary, which gives the new version a small weighted share of live traffic, proves it behaves like the old version under real conditions. Deliberately injected faults prove that your timeouts and health checks work, which no healthy release ever tests. Each stage needs a reversal as cheap as going forward, such as setting the weight to zero. Choose a canary over more pre-release tests when only real traffic can show the problem. It has costs. A canary exposes some users to a bad version, so state how many you accept, and mirror traffic where none may be hurt, knowing a mirror says nothing about correctness. Thresholds age as traffic changes, so write them as ratios against the live old version and set a minimum sample, so a quiet hour cannot pass a bad release. Two versions share one data store, so new code must ignore fields it does not know, and schema changes must add first and remove later.

**Example.** A canary gets 5% of 1,000 requests a second, so 50 a second. The old version fails 0.5% of requests. The rule is: abort if the new version fails more than twice that, 1%, once 1,000 requests have been seen, which takes 20 s. The new version has a bug failing 3%. At 20 s it has served 30 failures against about 5 expected, so the gate sets the weight to zero. About 30 users saw an error. At night, with 5 requests a second, the same sample takes 200 s; without the minimum, one failure in two requests would read as 50% and abort a good release.

## The tradespace
<!--meta block=tradespace-->

The first trade is confidence against speed. Every gate you add makes a bad release less likely and a good release slower, and past some point the slowness has its own cost: teams batch changes to amortise the ceremony, batches are harder to diagnose than single changes, and the failure rate goes back up. A validation process that makes shipping expensive eventually reduces safety.

The second is how much real risk the evidence is worth. A canary means some users get the bad version — fewer, not none — and that is the price of learning under production conditions. Mirroring traffic and discarding the responses exposes nobody and cannot tell you anything about correctness that a user would have noticed. Which one is right depends on whether an affected user is an inconvenience or an incident.

The third is what the evidence costs to keep valid. A gate is only as good as its thresholds, and thresholds decay: they were set against last quarter's traffic shape and now they either fire on ordinary variance or sleep through a regression. Automated gates need the same maintenance as the code they guard, and an unmaintained gate that has never failed is indistinguishable from one that cannot.

**Every gate buys confidence and spends release speed — and a process too slow to use is spent confidence too.**

## The tour
<!--meta block=tour-->

<!-- tour:start -->

<!-- GENERATED by gen-tours from docs/data/learning-paths.json. Do not edit this block. -->

### [Blue-Green Deployment](../patterns/distributed/routing/blue-green-deployment.md) {#tour-blue-green-deployment}

The new version runs on its own complete infrastructure while the old one still serves, so it can be exercised for real before a user meets it — and the switch back costs one routing change. That reversal is what makes every later stage safe to attempt.

### [Canary Release](../patterns/distributed/routing/canary-release.md) {#tour-canary-release}

A weighted slice of live traffic goes to the candidate while the rest stays on the control, so its error rate and latency are compared against a baseline running in the same hour under the same load. It is the only stage that tests the change against conditions no environment reproduces.

### [Fault Injection](../patterns/distributed/resilience/fault-injection.md) {#tour-fault-injection}

A healthy release never exercises the failure path, so timeouts, breakers and probes go untested until an incident tests them. Injecting the fault deliberately, under load and with a stated prediction, is the only stage that produces evidence about what happens when something else breaks.

### [Deployment Stamp](../patterns/distributed/routing/deployment-stamp.md) {#tour-deployment-stamp}

When a release provisions a whole new unit rather than updating an existing one, validation gets a clean subject: the unit either passed its smoke tests before receiving traffic or it never receives any, and configuration drift cannot accumulate because nothing survives long enough to drift.

### [Feature Flag](../patterns/distributed/routing/feature-flag.md) {#tour-feature-flag}

Some risk belongs to one feature rather than to the build that carries it. A flag ramps that behaviour on its own schedule and withdraws it in seconds, which separates validating a change from validating a deployment — and gives the fastest reversal available when neither is going well.

### [API Routing](../patterns/distributed/routing/api-routing.md) {#tour-api-routing}

Gradual validation means an overlap, and an overlap means routing each caller to the version it expects — by path, header or version prefix. Without it the ramp is impossible, because there would be nowhere for the old version's traffic to go.

### [Golden Master](../patterns/testing/golden-master.md) {#tour-golden-master}

Comparing fresh output against a recorded known-good baseline catches unintended differences in output that no assertion was written for. It is the cheap pre-production analogue of the canary's comparison, and it is what makes a refactor safe to ship without a behavioural specification nobody wrote.

<!-- tour:end -->

## When to reach for what
<!--meta block=decide-->

| If you need… | Evidence about | Reach for |
| --- | --- | --- |
| To exercise the new version before any user reaches it | Is it wired up | [Blue-Green Deployment](../patterns/distributed/routing/blue-green-deployment.md) |
| To know whether it behaves under real load and real data | Candidate vs control | [Canary Release](../patterns/distributed/routing/canary-release.md) |
| To find out whether the failure path works at all | The safeguards | [Fault Injection](../patterns/distributed/resilience/fault-injection.md) |
| A release subject that is clean by construction | No drift | [Deployment Stamp](../patterns/distributed/routing/deployment-stamp.md) |
| To ramp one behaviour rather than a whole build | One feature | [Feature Flag](../patterns/distributed/routing/feature-flag.md) |
| Two versions serving their own callers during the overlap | Version routing | [API Routing](../patterns/distributed/routing/api-routing.md) |
| To catch output that changed when nothing should have | Unintended diffs | [Golden Master](../patterns/testing/golden-master.md) |

## Related areas
<!--meta block=siblings-->

- [Continuous Delivery](./continuous-delivery.md) — The pipeline that gets a commit as far as a deployable artifact. This theme starts where that one ends.
- [Health Modeling](./health-modeling.md) — Supplies the verdict every gate reads, and is itself the thing a fault injection is checking.
- [Operating a Live System](./operating-a-live-system.md) — The changes that arrive after the release — rotations, quota moves, replays — and need the same evidence.
- [Resilience](./resilience.md) — The mechanisms a fault injection exists to verify, and the reason an untested one is only a claim.
