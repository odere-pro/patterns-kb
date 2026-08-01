# patterns-kb — the Software Design Atlas

A cross-linked reference of **<!-- kb:counts -->202 software design patterns, 40 design case studies, 37 themes, 33 hazards, 25 principles, 9 cloud capabilities and 8 product comparisons — 354 pages in all<!-- /kb:counts -->**, written to be
learned from: every page answers the same questions in the same order, and every page says
how it relates to its neighbours.

Live at **https://odere-pro.github.io/patterns-kb/**.

## What you'll find

| Kind | What it is |
|---|---|
| **Patterns** | the mechanisms — GoF, concurrency, caching, distributed systems, enterprise integration |
| **Designs** | worked case studies: system-design and low-level-design katas, arguing the hard sub-problems |
| **Themes** | narratives that cut across patterns (CAP, streaming, traffic spikes, auth) |
| **Hazards** | anti-patterns, and what they cost |
| **Principles** | design maxims (SOLID, DRY, KISS, YAGNI) — including how each fails when overapplied |
| **Capabilities** | categories of managed cloud service, mapped across AWS/Azure/Google Cloud and back to the patterns they package |

Every page of a kind carries the same blocks in the same order — a pattern is always
`description → structure → variations → tradeoffs → usage → sketch → relationships`. Same
question, same place, on every page: that is what makes it readable as a course rather
than a pile of articles.

## Three ways to use it

- **Browse the hub.** [`site/index.html`](site/index.html) — eleven sections, each tile
  with a one-line essence, a practiced checkbox and a favourite star. Works offline by
  double-clicking; no server needed.
- **Search by symptom.** Type the problem you actually have — "one slow dependency blocks
  my threads" — and the hub filters to the patterns that fix it, shown in context.
- **Follow the relationships.** Every page ends with typed neighbours — `combines-with`,
  `alternative-to`, `prevents-hazard` — each with a note saying why. The whole web renders
  as an interactive graph at [`site/map/graph.html`](site/map/graph.html).

## From a terminal

`scripts/kb.mjs` searches the full prose of all <!-- kb:page-count -->354<!-- /kb:page-count --> pages and returns clean text, so you
never have to open the HTML:

```
node scripts/kb.mjs find "one slow dependency blocks my threads"   # symptom → pattern
node scripts/kb.mjs get circuit-breaker --block usage              # one block, ~180 tokens
node scripts/kb.mjs related circuit-breaker                        # typed neighbours + notes
```

Every claim has a stable id, so it can be cited precisely:
`…/circuit-breaker.html#tradeoffs-con-2`.

---

Your practiced and favourite marks stay in `localStorage`; nothing leaves your machine.
Contributing — the data format, the build, how to add a page — is covered in
[.claude/rules/html5-authoring.md](.claude/rules/html5-authoring.md).
