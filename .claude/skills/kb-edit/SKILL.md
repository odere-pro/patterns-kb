---
name: kb-edit
description: Change something in patterns-kb — fix or rewrite a block's prose, add or drop a relationship, retag a page, fix a wrong real-world example, or update the metadata on an existing page. Also use when an edit changed which other pages a page uses, and the links across the project need adding or cleaning up. Use when someone reports something wrong, out of date, or missing on a page that already exists.
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
| "In production" block | `kb.mjs production --knobs … --signals … --failures … --checklist …` — rewrites the whole block |
| adding a relationship | `kb.mjs link <from> <verb> <to> --note … --note-back …` — writes both pages |
| removing a relationship | `kb.mjs unlink <a> <b>` — removes both sides, whatever verb each used |
| re-typing a relationship | `unlink`, then `link` with the new verb |
| a relationship's note | edit the `.rel-note` on **both** pages by hand — each side phrases it its own way |
| anything in `<!-- kb:generated -->` | **do not.** `make all` overwrites it |

`kb.mjs set` validates the JSON before it lands and never guesses placement. Hand-editing a
`data-kb-solves='[…]'` string is how you get an unparseable attribute. After any edit,
`node scripts/kb.mjs validate <id>` (~50ms) names what broke, if anything — the hook runs it
for you on every page edit.

## Relationships live on two pages, and one command writes both

`kb.mjs link` adds an edge; `kb.mjs unlink` retires one. Both write **both** sides, so
neither can leave you with:

```
one-way: bulkhead -combines-with-> circuit-breaker has no "combines-with" back
```

That error now only means you hand-edited a `rel-item` instead of using the writer. Check
what exists before you change it:

```
node scripts/kb.mjs related <id>
node scripts/kb.mjs backlinks <id>    # inbound edges as the OTHER side phrases them
```

Directional verbs are paired (`variant-of` ↔ `has-variant`, `prevents-hazard` ↔
`mitigated-by`), so the two sides use *different* verbs — `unlink` is verb-agnostic and
removes whatever each side declared, which is also why it works on the hazard side of a
`mitigated-by` edge, where `link` cannot write. See
[site/vocab.html](../../../site/vocab.html). The **notes** may differ per side by design —
each page describes the relationship from its own end.

## When an edit changes what the page uses

Rewriting prose routinely changes which other pages a page leans on, and none of that shows
up in the diff of the page you edited. A cross-page reference rides on **four** carriers —
the typed relation, the prose link, a mermaid `click`, and hand-authored membership (a
theme's `data-kb-member`, a pattern's `.fluency-item`, a hazard's `mitigation` list). Only
the first has a writer.

```
node scripts/kb.mjs refs <id>          # everything this page points AT, read live off the page
```

Not `backlinks` — that reads `graph.json`, which is stale until `make all` runs, and the
question here is what the *unbuilt* edit just changed. Snapshot `refs <id> --json` before
you start (or `git diff` the page after), then reconcile the difference:

1. **Started using something** — write the prose link into the sentence that uses it, then
   `kb.mjs link <id> <verb> <other> --note "…" --note-back "…"`. A design → pattern edge is
   always `demonstrates`. Write the two notes from each page's own end; they should read
   differently.
2. **Stopped using it** — `kb.mjs unlink <id> <other>`, then sweep the carriers no writer
   can see: the prose link, any mermaid `click`, the theme tour step, the fluency item, the
   hazard `mitigation` entry.
3. **Still uses it, differently** — do **not** unlink. Rewrite the `.rel-note` on both
   pages. This is the most common case and the one that rots silently.

> A typed relation is a claim about the design, not a by-product of a hyperlink. Unlink when
> the page genuinely no longer does the thing — not because a link moved out of a paragraph.

`refs` ends with an **untyped** line: pages linked in prose with no typed relation. That is
usually a relation you owe, occasionally a passing mention that deserves none. `make check`
cannot make that call; it only catches the halves you left behind.

Carrier-by-carrier detail, a worked example and the failure signatures:
[references/reconcile-links.md](references/reconcile-links.md).

## Retagging

Tags are a closed vocabulary (`TAGS` in `scripts/lib/model.mjs`). `make check` rejects
anything not in it:

```
ERROR: singleton: tag(s) not in the closed vocabulary: made-up-tag
```

That is not an obstacle to route around. A tag exists to group patterns; inventing one for
a single page is how the vocabulary rotted last time (see the tag rules in
[html5-authoring.md](../../rules/html5-authoring.md)). If the tag genuinely applies to 3+
pages, add it to `TAGS` and say which pages.

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
