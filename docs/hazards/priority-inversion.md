---
title: Priority Inversion
description: A high-priority task waits on a lock held by a low-priority one while medium-priority work runs
area: hazards
owner: Oleksandr Derechei
tags: [concurrency, latency]
status: stable
solves: [my most urgent task misses its deadline while the CPU is not busy and it is waiting on a lock, a background job holding a lock keeps getting pushed aside and the important task stays blocked behind it, our watchdog reset the system even though every task was making progress, raising a thread's priority did not make it faster because a lower thread holds what it needs]
---

# Priority Inversion

A high-priority task waits for a lock held by a low-priority task, and medium-priority work keeps the low-priority task off the processor, so the most urgent work is delayed by the least urgent for as long as the middle tasks choose to run.

## What it is
<!--meta block=description-->

**Priority inversion** is a scheduling failure in which the priority order you set is reversed in practice. Three things are needed. A low-priority task holds a lock. A high-priority task needs that lock and blocks. And a medium-priority task, which needs neither, becomes runnable. The scheduler always prefers the medium task over the low one, so the low task never runs long enough to release the lock, and the high task waits behind work it outranks.

The well-documented case is the Mars Pathfinder lander in 1997. A high-priority bus management task shared a lock with a low-priority task that collected weather data. A medium-priority communications task preempted the low one while it held the lock. The bus task missed its deadline, a watchdog timer saw it and reset the computer, and the lander lost the data it had gathered that day. Engineers reproduced it on the ground and fixed it by turning on the priority inheritance option in the operating system, which was then uploaded to Mars.

You recognise it by a deadline missed with the CPU not saturated: the urgent task is not slow, it is blocked, and a trace shows it waiting on a lock whose holder is runnable but not running. It is not a [Deadlock](./deadlock.md), because the holder does finish given enough time, and it is not [Starvation](./starvation.md) by policy: the low task is not denied by a rule against it, it is outcompeted by a task unrelated to the lock.

## Explained
<!--meta block=explain-->

Priority inversion is a low-priority task holding a lock that a high-priority task needs, while a medium-priority task keeps the low one from running. The scheduler always runs the highest task that is ready. The high task is blocked on the lock, so it is not ready, and the medium task runs instead. The low task never gets time to finish and release the lock, so the urgent work waits behind work that ranks below it, for as long as the medium task runs. It looks like a slow system, but CPU use is fine and nothing has crashed. Fix it with priority inheritance: while a task holds a lock, it takes the priority of the highest task waiting for it. A priority ceiling gives each lock the highest priority of any user, at the cost of knowing every user. Better, avoid the sharing: keep the critical section short, pass work through a queue and measure how long high-priority tasks wait on locks.

**Example.** A spacecraft has three tasks. A bus task at high priority, a weather task at low priority and a radio task at medium priority. The weather task takes the lock on the data bus. The radio task wakes and runs for 200 ms, which keeps the weather task off the processor. The bus task needs the lock, waits, and misses its 100 ms deadline. A watchdog resets the computer. With priority inheritance, the weather task runs at the bus task's priority while holding the lock, finishes in 2 ms and releases it. The cost is that every lock needs the option turned on.

## How it happens
<!--meta block=causes-->

The hazard needs a shared lock between tasks of different priority, and a scheduler that always runs the highest-priority task that is ready. A lock is a promise that one task at a time holds a resource, so any task that wants it must wait for the holder, whatever its own priority. The scheduler knows nothing of that wait: it sees the blocked high task as not ready and the medium task as ready, and runs the medium one.

- A lock shared across priority levels, so a low-priority task can hold what a high-priority task needs.
- A scheduler that is strictly priority-based and preemptive, so a ready medium task always beats a runnable low one.
- A medium-priority task that can run for a long or unbounded time, because a short one lets the low task finish quickly and the delay stays small.
- A lock implementation with no priority inheritance, so the holder keeps its low priority while a high-priority task waits on it.
- A real-time deadline or a watchdog, which turns a delay into a failure, since without one the inversion only costs time.
- Chains of dependency, where the high task waits on a lock held by a task that is itself waiting on a lower one, so the delay stacks up.

## What it costs
<!--meta block=cost-->

- **Missed deadlines on the work you ranked highest.** The task that matters most waits as long as the middle tasks run, which can be unbounded.
- **A reset or crash instead of a slowdown.** In a system with a watchdog, a delayed task is read as a hung task and the whole system restarts, as on Pathfinder.
- **A bug that appears only under load.** It needs all three tasks to line up, so it passes tests and shows up rarely and in production, with no error to point at.
- **Hard diagnosis.** CPU use looks fine and no task has crashed, so the first sign is a missed deadline whose cause is a lock held by an idle-looking task.
- **Priorities that mean nothing.** Once a team learns the order is not honoured, tuning priorities stops being a safe way to control latency.

## Getting out
<!--meta block=mitigation-->

Let the lock holder inherit the priority of the highest task waiting for it. With **priority inheritance**, the low task is raised for as long as it holds the lock, so the medium task can no longer preempt it, it finishes its short critical section and releases the lock, and the high task runs. Many real-time operating systems offer this as an option on their locks, and it was the fix for Pathfinder. It must be on for the locks that cross priorities, and the raised priority drops back when the lock is released.

A stricter form is a **priority ceiling**: give each lock the priority of the highest task that ever uses it, and run any holder at that level. It prevents the inversion before it starts, and as a bonus rules out some [Deadlock](./deadlock.md) cases, at the price of knowing every user of each lock in advance.

Better still, avoid the sharing. Keep the critical section as short as possible, since the delay is bounded by how long the holder takes. Pass data between priorities through a queue or message instead of a shared lock, so a high-priority task never waits on a low one; a [Priority Queue](../patterns/messaging/priority-queue.md) puts the ordering in the data rather than in a lock. Where you can, use lock-free structures between the levels. And measure: log how long high-priority tasks wait on locks, so an inversion shows up as a number before it shows up as a reset.

## How it relates
<!--meta block=relationships-->

<!-- relationships:start -->

<!-- GENERATED by gen-relations from docs/data/relations.json. Do not edit this block. -->

**Often confused with**

- [Deadlock](./deadlock.md) — Both wait on a lock, but here the holder finishes given time.
- [Starvation](./starvation.md) — The low task is outcompeted by unrelated work, not denied by policy.
- [Priority Queue](../patterns/messaging/priority-queue.md) — Priority is set on messages there and on locking tasks here.

<!-- relationships:end -->
