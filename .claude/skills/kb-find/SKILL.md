---
name: kb-find
description: Find the right software design pattern for a problem, and answer with grounded citations. Use whenever someone describes a symptom ("my thread pool is exhausted", "adding a payment provider means editing a huge switch"), asks which pattern fits a situation, asks how two patterns differ, or asks what a named pattern is. Works from the patterns-kb knowledge base without loading the corpus.
---

# Finding a pattern for a problem

The corpus is ~490k tokens. Never read the `.html` files. Everything below goes through
`scripts/kb.mjs`, which strips markup and returns prose — a full grounded answer costs
about 600 tokens.

## The loop

**1. Search with the user's own words.** Do not translate their symptom into pattern
vocabulary first — the index is built for exactly this. `solves` phrases are written as
symptoms ("one failing dependency took down my whole service"), so the raw complaint
searches better than your paraphrase of it.

```
node scripts/kb.mjs find "one slow dependency blocks my threads"
```

Each hit prints the line that matched, so you can often judge relevance without opening
anything. `find` weights differently depending on whether you are naming a pattern
("circuit breaker") or describing a symptom — so pass the whole sentence, not keywords.

**2. Open only the blocks you need.** Usually `usage` (when to reach for it, when not to)
and `tradeoffs`. Rarely the whole page.

```
node scripts/kb.mjs get circuit-breaker --block usage
node scripts/kb.mjs get bulkhead --block tradeoffs
```

**3. Check the neighbours before answering.** Patterns are rarely the whole answer, and the
relation notes say *why* two go together. This is where the KB earns its keep.

```
node scripts/kb.mjs related circuit-breaker
```

`combines-with` → often both are the real answer. `alternative-to` → name the trade-off, do
not pick silently. `often-confused-with` → say so explicitly; that confusion is probably
why they are asking.

**4. Answer with citations.** Every claim has a stable id. Cite it:
`patterns/distributed/resilience/circuit-breaker.html#tradeoffs-con-2`.

## Answering well

- **Usually more than one pattern applies.** "One slow dependency blocks my threads" is
  Bulkhead (isolate the pool) *and* Circuit Breaker (stop calling it) — they combine. Say
  that rather than picking one.
- **Lead with the trade-off, not the name.** The user wants to fix a problem, not collect a
  pattern. Say what it costs: another stateful thing to tune, thresholds that flap.
- **Check `avoid-when` before recommending.** If their case is in it, say so. "A simple
  timeout plus a bounded retry already covers the risk" is often the honest answer.
- **Hazards are answers too.** If the symptom describes an anti-pattern (`kind: hazard` in
  the results), the fix is in its `mitigation` block.
- **Themes answer "how do I think about X".** For a broad question ("how do I handle traffic
  spikes"), a theme's `decide` block is a literal problem→pattern table.

## If nothing good comes back

Try the symptom a second way — different words, no jargon. If it is still thin, say so
plainly rather than forcing a weak match; `ls --band <band>` lets you browse an area
instead. A wrong pattern is worse than none.
