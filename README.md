# patterns-kb — an HTML5 knowledge base

A cross-linked reference of **<!-- kb:counts -->169 software design patterns, 40 design case studies, 25 themes, 14 hazards and 11 principles — 259 pages in all<!-- /kb:counts -->**, written to be
learned from: every page answers the same questions in the same order, and every page says
how it relates to its neighbours.

Live at **https://odere-pro.github.io/patterns-kb/**.

## What's in it

| Kind | What it is |
|---|---|
| **Patterns** | the mechanisms — GoF, concurrency, caching, distributed systems, enterprise integration |
| **Designs** | worked case studies: system-design and low-level-design katas, arguing the hard sub-problems |
| **Themes** | narratives that cut across patterns (CAP, streaming, traffic spikes, auth) |
| **Hazards** | anti-patterns, and what they cost |
| **Principles** | design maxims (SOLID, DRY, KISS, YAGNI) — including how each fails when overapplied |

Every page of a kind carries the same blocks in the same order. A pattern is always
`description → structure → variations → tradeoffs → usage → sketch → relationships`; a
principle always ends with an honest `overreach` block. Same question, same place, on every
page — that is what makes it readable as a course rather than a pile of articles.

## Three ways to learn from it

**Browse the hub.** [`site/index.html`](site/index.html) is an "elevation map": patterns
grouped by band, each with a one-line essence. Start anywhere and follow the typed links.

**Search by symptom.** Type the problem you actually have — "one slow dependency blocks my
threads" — and the hub filters in place. Matches stay in their band, so you see not just
*which* patterns fit but *where they sit*. Works offline by double-clicking `index.html`; no
server needed.

**Follow the relationships.** Every page ends with typed neighbours — `combines-with`,
`variant-of`, `alternative-to`, `prevents-hazard`, `demonstrated-by` — each with a note
saying *why* they relate. The 15 verbs are a closed vocabulary, published at
[`site/vocab.html`](site/vocab.html), and each edge is declared on both pages it joins. The
overview lives at [`site/map/graph.html`](site/map/graph.html).

Every claim has a stable id, so it can be cited precisely:
`…/circuit-breaker.html#tradeoffs-con-2`.

## Reading it from a terminal — without opening the HTML

The corpus is ~490k tokens and half of any page is markup. `scripts/kb.mjs` strips styles,
scripts, diagrams and chrome, and returns the metadata and prose:

```
node scripts/kb.mjs find "one slow dependency blocks my threads"   # symptom → pattern
node scripts/kb.mjs get circuit-breaker --block usage              # one block, ~180 tokens
node scripts/kb.mjs related circuit-breaker                        # typed neighbours + notes
node scripts/kb.mjs ls --band caching
```

`find` searches the full prose of all <!-- kb:page-count -->259<!-- /kb:page-count --> pages and prints the line that matched. It weights
differently depending on whether you are naming a pattern ("circuit breaker") or describing a
symptom, because in the second case a name match is usually incidental. Add `--json` for
structured output.

## The idea behind the format

Most knowledge bases store content in Markdown and render it to HTML. This one inverts that:
**the HTML pages are the source of truth**, and everything else — the relationship graph, the
search index, the hub, the ontology page — is *derived* from them by `make all`.

Why HTML instead of Markdown? Because **Markdown has no attribute mechanism.** Metadata can
only bolt on as page-level frontmatter; you cannot attach anything to a heading, a paragraph
or a single list item. HTML5 gives semantic elements, `id`/`class`, arbitrary `data-*`
attributes and JSON-LD natively — so a page carries its own meaning at **three levels**
(page, block, element) instead of one.

| Level | Carrier | Example |
|---|---|---|
| **Page** | attributes on the doc root | `data-kb-id` · `kind` · `band` · `essence` · `tags` · `solves` |
| **Block** | `data-kb-block` on each `<section>` — the `id` is anchor *and* semantic key | `<section id="tradeoffs" data-kb-block="tradeoffs">` |
| **Element** | typed attributes on individual items | `data-kb-rel` / `data-kb-to` · `data-kb-polarity` |

> **`class` is presentation. `data-kb-*` and JSON-LD are data. They never touch.**
>
> Data is never inferred from a class name or from where prose sits on a page. That
> separation is what lets the site be restyled without damaging knowledge, and re-authored
> without damaging structure.

The filesystem is part of the model too: patterns nest by band, with a group level only where
a band is actually subdivided, and `make check` fails if a page's location disagrees with the
band it declares.

```
site/patterns/gof/creational/singleton.html
site/patterns/distributed/resilience/circuit-breaker.html
site/patterns/concurrency/thread-pool.html
```

## Contributing

Metadata is written through a validated CLI, never by hand-editing an attribute string:

```
node scripts/kb.mjs set <id> --aliases '["breaker","CB"]' --tags '[…]' --solves '[…]'
```

Prose inside a block is edited directly in the HTML. **Never edit a `<!-- kb:generated -->`
region** — `make all` overwrites it. The full contract, including how to add a page, is in
**[.claude/rules/html5-authoring.md](.claude/rules/html5-authoring.md)**.

```
make            # list every target
make all        # regenerate every derived artifact from the pages
make check      # verify everything is in sync — the one definition of "valid"
make serve      # static file server at http://localhost:8000
```

**`make check` is the contract**, and CI runs the same one command. It enforces that
relations are bidirectional, that the relation and tag vocabularies stay closed, that a
page's path matches its band, that no internal link dangles, and that every generated
artifact is in sync.

**Zero-dependency by design**: no `package.json`, no `node_modules`, no npm anywhere,
including CI. Mermaid and the HTML parser are vendored. Links are relative only, so the same
files work from `file://` and from GitHub Pages.

## Notes

Each pattern page and the hub share a "practiced" toggle stored in `localStorage`; nothing
leaves your machine. Known follow-ups are in [TODO.md](TODO.md).
