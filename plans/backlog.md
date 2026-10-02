# Backlog

Ideas and open questions that have no phase yet. None of them blocks the KB, and each list
is ordered roughly by value to effort. A plain list with no gate: one bullet per item,
deleted when it ships or is dropped. A trap, something that bit a session, goes to the
[inbox](../docs/inbox.md) instead, where a gate caps it.

## Features

- A skill that uses the case studies as references to successful designs.
- Make the graph page agnostic and useful: `map/graph.html` on the built site, drawn by
  `site/src/components/GraphExplorer/`.

- Tags, parked by the owner on 2026-09-29: add a 3+-pages-per-tag rule to the tags gate (the
  retired `audit-vocab` script only warned); decide whether a practice/process topic earns
  architecture-documentation and its kin; an editorial pass adding honest skills to the 88
  pages with two tags; F9, filing `distributed-monolith` under the anti-pattern topic (it holds
  five tags, the ceiling, so one goes).
- From the 2026-09-30 docs sweep, each needing an owner call:
  - Ban `terminal` through a `house` term's `avoid` list in `docs/data/glossary.json`; about
    100 lines in `CLAUDE.md`, `docs/` and `.claude/rules` use it today, so the ban comes with
    their rewrite. The trap inbox holds the entry until then.
  - The route gate's `WRITES` list (`tools/src/gates/check-harness-routes.ts`) has no `mkdir`,
    so `Bash(mkdir -p tmp/designs/)` in `.claude/settings.json` passes as a read. Add `mkdir`
    and keep that entry as a named exception, or drop the entry.
  - json-sanity prints V8's parse message for `not json` across two stderr lines: collapse
    whitespace in `tidy` (`tools/src/gates/check-json.ts`), as `tools/src/lib/data-json.ts` does.

- From the 2026-10-01 site evaluation ([record](../docs/records/2026-10-01-site-evaluation.md)),
  round 3 closed every item but one:
  - **Sketch languages.** 96% of pattern sketches are TypeScript; the concurrency patterns
    (semaphore, lock-free, rw-lock, thread-pool) would read more truly in Go, Java or Rust.

## Pages

- Groom the `persona-identification` design page, `docs/designs/persona-identification.md`
  (its `-v2` sibling may deserve the same pass).

- Thin pages from the same evaluation: `parking-lot` (the shortest design in eight blocks);
  34 of 41 designs have fewer than three diagrams; `cache-stampede`,
  `bot-detection` and `harmful-content` sit in the bottom 5% of their blocks; 73 pages have no
  inbound prose link; `transaction-script` and `dummy-object` have no real-world entry.
- 70 of the pattern sketches run past 30 lines (`repr` 43, `vertical-slice` 37).

## Questions

Each may be a page gap. The ids after each question are the top `kb.mjs find` hits, the
place to start before writing anything new.

- How do you scale a queue across topics and partitions, and keep it durable?
  (scaling-writes, long-running-tasks, job-scheduler)
- What is the difference between a worker and a consumer? (competing-consumers,
  load-leveling, message-queue)
- What stops a poison message from looping through redelivery in a fan-out? (fan-out,
  message-queue, dead-letter-channel)
- What do you do about publish-burst amplification? (fan-out, recipient-list)
- How do you apply backpressure? (backpressure, unbounded-queue, streaming)
- What is a relay? (messaging-bridge, outbox, dual-write-inconsistency)
- How do you resolve or prevent a race condition, and make a read-then-write atomic?
  (conditional-write, race-condition, copy-on-write)
