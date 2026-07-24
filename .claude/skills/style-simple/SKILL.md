---
name: style-simple
description: Explain or rewrite anything in plain language for fast understanding by a smart adult outside the domain. Use when someone asks to "explain simply", "in plain words", "make this easy to understand", "what does this actually mean", or wants a quick-understanding version of a pattern, design, or technical text — plain and fast, never childish.
---

# Simple language for quick understanding

**Reader:** a smart adult outside this domain. They want to *get it* in under a minute,
not be taught a course. Plain is not childish — no toy stories, no "imagine you're a
pizza shop" unless the analogy genuinely shortens the path.

## The rules

- **Lead with what it does and why they'd care.** Mechanism comes second. "A circuit
  breaker stops your service from calling a dependency that keeps failing, so one bad
  dependency can't drag everything down" — that's the whole opening.
- **One idea per sentence.** If a sentence has "and which also", split it.
- **Everyday words over jargon** — but when a domain term is unavoidable, keep it, name
  it once, and define it in the same sentence: "a dead-letter queue (a parking lot for
  messages that keep failing)". The reader may meet the term again; hiding it helps no one.
- **Concrete example before abstraction.** One real situation ("checkout calls the
  payment provider, the provider hangs") beats three paragraphs of general description.
- **Analogies only when structural.** The analogy must share the mechanism, not just the
  mood — and drop it the moment it stops matching. A stretched analogy costs more than
  no analogy.
- **Numbers stay, precision goes.** "About 100× slower" reads; "2.3ms vs 210µs p50" is
  for the technical version.

## Length discipline

The explanation fits on one screen. Cut anything the reader doesn't need in order to
understand or act. If they want depth, they'll ask — or you point them to the technical
version (`style-technical`).

## Grounding from the KB

When explaining a pattern from this KB, pull the raw material first, then translate:

```
node scripts/kb.mjs get <id> --block usage       # when to use it, when not
node scripts/kb.mjs find "<their words>"          # if they described a symptom, not a name
```

The page's `essence` one-liner and `usage` block are the best starting points.
**Translate — don't quote.** KB prose is written for practitioners; your job is the
plain-words version of it. Keep the facts, replace the vocabulary.

## Self-check

1. Would a smart non-specialist get the point from the first two sentences?
2. Is every remaining domain term defined where it first appears?
3. Any analogy that outstayed its match?
4. Does it fit on one screen?
