# TODO — deferred work

Follow-ups that were consciously left out of the HTML5-knowledge-layer build. None of them
blocks the KB; each is a distinct, self-contained piece of work. Ordered roughly by
value-to-effort.

## Improve connected KB pages sections

The goal is to have visual represantagtion of knowladge tree

- I want to be able to understand how connected pages are related
- Is it developement, what principals, lensces and hasard are releated
- what alternatives
- what variations
- what tradeoffs
- what page led to this one 1 level back and forward

## Task ideas

- add attempts to the SQL table to move poisoned message to DLQ
- competing consumers - multiple sanction lists
- add schedulers, for retres, DLQs
- Do I need message routing?
- Do I need fan-in to merge (converge) the result? Fan in should block the conclusion
- Outbox - State and event commit together; a relay delivers afterwards to fix double writes
- Event Sourcing - One append is both state and event, so nothing diverges
- What is better for inbox and outbox pessimistic or optimistic lock? (Does not span connections, services, or time — it lives and dies with one transaction, so it is not a distributed lock.)
- Should I use wire tap pattern for observability?
- where to use autoscaling (min-max up-down) and redundency? <https://odere-pro.github.io/patterns-kb/themes/spike-handling.html>, how to tell producer to slowdown (backpreasure)
- availability for email photo send, and consistency (strong or evantual) for the result

## Questions

- how to scale Queues, with different topics, partitions, how to make it durable?
- what is the difference between worker and consumer?
- Poison message redelivery loop for fanout what to do?
- Publish-burst amplification - what to do?
- How to make backpreasure?
- What is relay?
- How to resolve race or prevent condition? How to make atomic read and write?
