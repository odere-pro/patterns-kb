---
title: Operating a Live System
description: "The changes a running system needs, made without a hand on the box"
area: themes-operating
owner: Oleksandr Derechei
tags: [operations, lifecycle, availability, maintainability]
status: stable
---

# Operating a Live System

The work a running system needs that no release plan contains — rotations, backlogs, quotas, replays — and how to do it without anyone logging into production.

## The question
<!--meta block=description-->

A system that is never touched still changes. Keys expire, quotas are reached, a message arrives that nothing can process, a dependency starts refusing traffic, and demand falls overnight and returns at eight. None of this is a release, none of it appears in a backlog, and all of it has to happen while the system keeps serving.

The whole discipline reduces to one rule: every change goes through the same automated path as a deployment, and nothing is done by hand on a live machine. A manual change is invisible to everyone who was not present, it is undone by the next deployment, and it cannot be reviewed, reversed or repeated. The work is therefore to make each of these routine changes something a pipeline or a running process can perform.

Most of them can be made to happen on their own. Capacity follows demand from a signal rather than from a person watching a graph. Periodic maintenance runs on a clock instead of in someone's calendar. Work that failed by never happening is found by a process that scans for it rather than by a customer complaint. Automating these is not only about effort — an unattended action happens at three in the morning too.

A few genuinely need a person, and those are the ones worth rehearsing. Messages that failed every retry need someone to look, decide and replay them. A restore from backup needs a decision nobody should automate. Raising a quota needs a request to somebody outside the system. Each of these is a procedure that will be run under pressure by whoever is on call, which is exactly why it should be written down and practised while nothing is wrong.

Rotation is the operation that most often causes the outage it was meant to prevent, and its difficulty is proportional to how widely the credential is shared. A secret held inside one disposable unit needs no rotation at all, because the unit will be replaced before the secret matters. A secret every component holds needs a coordinated sequence — introduce the new one, restart everything that caches it, retire the old one — and each step has to be verified across the whole fleet before the next begins.

## Explained
<!--meta block=explain-->

Operating a live system means making the routine changes a running system needs, such as renewing keys, resizing, replaying failed messages and raising quotas, through the same automated path as a deployment, never by hand on a live machine. A hand change is invisible to anyone who was not there, is undone by the next deployment and cannot be reviewed or reversed. Split the work by how often it happens. Frequent changes get full automation: resizing on a signal, running maintenance on a clock, and scanning for work that silently never happened. Rare and dangerous ones get a written procedure that you rehearse, because a restore script nobody has run is a plan, not a capability. Automation acts on whatever signal it is given, including a wrong one, so a person still checks the signals it trusts. Urgent changes tempt people to bypass the pipeline, so build a fast path inside it. Credentials hurt most when they are long-lived and widely shared: give out narrow tokens that expire on their own, so there is no fleet-wide rotation to coordinate.

**Example.** Forty copies of a service share one database password. Rotating it by hand means adding the new password, restarting in 4 batches of 10 at 2 minutes each, then retiring the old one. That takes 8 minutes, and if you retire the old password after batch 3, the 10 copies not yet restarted fail. With tokens that expire after 15 minutes, nothing is rotated and no step is coordinated. The cost is that the token service becomes critical: if it is down for 15 minutes, every copy loses access.

## The tradespace
<!--meta block=tradespace-->

The first trade is between acting automatically and acting correctly. An automated response is fast, consistent and available at three in the morning, and it acts on whatever signal it was given — including a signal that is wrong. A human is slow and can tell that the graph is lying, and is only present for a third of the day.

The second is between the pipeline and the console. Making every change go through the pipeline makes it reviewable, repeatable and reversible, and it makes urgent changes slower, which is precisely when the temptation to reach for the console is strongest. The resolution is a fast path inside the pipeline rather than a policy nobody follows during an incident, because a change made outside it is gone at the next deployment and nobody will know why the symptom returned.

The third is what to automate at all. Every automated procedure is code to maintain, and one that runs rarely is code nobody has exercised — a restore script that has never been run is a plan rather than a capability. Frequent operations earn full automation, rare ones earn a written and rehearsed procedure, and the mistake is treating a rare dangerous operation as though writing the script were the same as being able to perform it.

**Automate what happens often; rehearse what happens rarely; and never let either bypass the pipeline.**

## The tour
<!--meta block=tour-->

<!-- tour:start -->

<!-- GENERATED by gen-tours from docs/data/learning-paths.json. Do not edit this block. -->

### [Autoscaling](../patterns/distributed/routing/autoscaling.md) {#tour-autoscaling}

The most frequent operational change, and the one nobody should be making by hand. Resizing on a signal keeps a growing backlog or a morning ramp from becoming an incident, and it keeps off-peak hours from being charged at peak. Its limits are where the operational failures live: it cannot add what a quota will not allow.

### [Dead Letter Channel](../patterns/messaging/dead-letter-channel.md) {#tour-dead-letter-channel}

Messages that fail every attempt end up somewhere visible instead of blocking the queue or vanishing. It is the clearest example of a manual operation designed for on purpose: the system stops trying, and a person inspects, corrects and replays — which means the replay tooling has to exist before the first message arrives.

### [Feature Flag](../patterns/distributed/routing/feature-flag.md) {#tour-feature-flag}

The fastest lever an operator has. Shedding an expensive path or disabling a misbehaving integration becomes a value change rather than a release, which matters most in the minutes when a build is too slow to help. The discipline it demands is that the flip is recorded like a deployment, or an incident review will find no change at the time everything started.

### [Health Endpoint Monitoring](../patterns/distributed/resilience/health-endpoint.md) {#tour-health-endpoint}

The same endpoint the router polls is also a manual control: make it report unhealthy and traffic drains away without touching the router configuration. That is how a region is emptied for maintenance, and it is a safer lever than editing routing rules under pressure.

### [Valet Key](../patterns/distributed/routing/valet-key.md) {#tour-valet-key}

Rotation hurts in proportion to how long a credential lives and how many components hold it. Issuing narrow tokens that expire on their own converts a coordinated fleet-wide procedure into something that happens continuously and unremarkably, which is the only reliable fix for the class of outage caused by an expired secret.

### [Scheduling](../patterns/concurrency/scheduling.md) {#tour-scheduling}

Retention trimming, certificate renewal, index maintenance and report generation are all work that must happen at a time rather than in response to a request. Putting them on a scheduler makes them observable and repeatable, instead of a task someone remembers to do.

### [Sweeper](../patterns/distributed/coordination/sweeper.md) {#tour-sweeper}

The hardest failures to notice are the ones with no error: a job that was never picked up, a reservation that was never released, a callback that never arrived. A process that periodically scans for work that should have completed by now is the only thing that finds them, and it turns a class of silent inconsistency into an ordinary retry.

<!-- tour:end -->

## When to reach for what
<!--meta block=decide-->

| If you need… | Operation | Reach for |
| --- | --- | --- |
| Capacity to track demand without anyone watching | Resize on a signal | [Autoscaling](../patterns/distributed/routing/autoscaling.md) |
| Somewhere for messages that will never succeed | Inspect and replay | [Dead Letter Channel](../patterns/messaging/dead-letter-channel.md) |
| To disable something in seconds during an incident | Flip a value | [Feature Flag](../patterns/distributed/routing/feature-flag.md) |
| To drain a region for maintenance | Report unhealthy | [Health Endpoint Monitoring](../patterns/distributed/resilience/health-endpoint.md) |
| Rotation that is not a fleet-wide coordination exercise | Short-lived tokens | [Valet Key](../patterns/distributed/routing/valet-key.md) |
| Maintenance that happens at a time, not on request | Put it on a clock | [Scheduling](../patterns/concurrency/scheduling.md) |
| To find work that failed silently by never happening | Scan for the gap | [Sweeper](../patterns/distributed/coordination/sweeper.md) |

## Related areas
<!--meta block=siblings-->

- [Continuous Validation](./continuous-validation.md) — The same pipeline, and the same argument that an unrehearsed procedure is a plan rather than a capability.
- [Health Modeling](./health-modeling.md) — Supplies the signals these operations react to, and the verdict that decides whether one is needed at all.
- [Securing Availability](./securing-availability.md) — Why the shared long-lived credential is the rotation that hurts, and what removes the need for it.
- [Observability](./observability.md) — The raw telemetry an operator reads once an automated response has done what it can.
