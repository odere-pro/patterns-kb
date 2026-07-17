---
name: kb-edit
description: Change something in patterns-kb — fix or rewrite a block's prose, correct a relationship, retag a page, fix a wrong real-world example, or update the metadata on an existing page. Use when someone reports something wrong, out of date, or missing on a page that already exists.
---

# Editing a page

The pages are the data, so an edit can break the graph, a link, the hub or a closed
vocabulary — none of which shows up in the diff you just made. That is why `make check`
runs after every edit (a hook does it automatically, ~0.8s).

## Read the block first — not the file

```
node scripts/kb.mjs get <id> --block tradeoffs
```

Element ids make the target exact: if someone says "the second con on circuit-breaker is
wrong", that is `#tradeoffs-con-2`, and you can quote it before changing it.

## What you may edit, and how

| what | how |
|---|---|
| prose in a block | edit the HTML directly — it is authored |
| aliases / tags / solves | `kb.mjs set` — **never** hand-edit the attribute |
| "In the wild" examples | `kb.mjs wild --items '[…]'` — rewrites the whole list |
| a relationship | edit **both** pages (see below) |
| anything in `<!-- kb:generated -->` | **do not.** `make all` overwrites it |

`kb.mjs set` validates the JSON before it lands and never guesses placement. Hand-editing a
`data-kb-solves='[…]'` string is how you get an unparseable attribute.

## Relationships take two edits

Every relationship is declared on both pages it joins. Removing one from Circuit Breaker
without removing its inverse from Bulkhead fails `make check` with:

```
one-way: bulkhead -combines-with-> circuit-breaker has no "combines-with" back
```

That error means you did half the edit. Check what exists first:

```
node scripts/kb.mjs related <id>
```

Directional verbs are paired (`variant-of` ↔ `has-variant`, `prevents-hazard` ↔
`mitigated-by`), so the two sides use *different* verbs. See
[site/vocab.html](../../../site/vocab.html). The **notes** may differ per side by design —
each page describes the relationship from its own end.

## Retagging

Tags are a closed vocabulary (`TAGS` in `scripts/lib/model.mjs`). `make check` rejects
anything not in it:

```
ERROR: singleton: tag(s) not in the closed vocabulary: made-up-tag
```

That is not an obstacle to route around. A tag exists to group patterns; inventing one for
a single page is how the vocabulary rotted last time (280 tags, 154 used once). If the tag
genuinely applies to 3+ pages, add it to `TAGS` and say which pages.

## Fixing a wrong real-world example

Rewriting beats deleting — a corrected note usually teaches more than the claim it replaces.
When Sidekiq was wrongly credited with re-queueing jobs from dead workers, the fix documented
the actual gap (open-source uses BRPOP and loses in-flight jobs; durable re-queue is Pro),
which is more useful than the original claim. But if you cannot make it accurate, drop it —
a fabricated example on a public site is worse than a missing one.

`wild --items` replaces the whole list, so pass the entries you are keeping too.

## Finish

```
make all && make check
```

`make all` regenerates the derived artifacts (JSON-LD, graph, catalog, hub, vocab). If you
only changed prose, `make check` alone will tell you whether anything is stale.
