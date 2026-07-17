# patterns — Systems-Design Fluency Knowledge Base

A small, self-contained static site for getting **fluent at building systems**: every software /
system-design pattern gets its own cross-linked page (description · variations · pros/cons ·
when-to-use · typed relationships), and **theme pages** weave those patterns into narratives for the
concerns that actually decide a design — the CAP theorem, streaming, absorbing traffic spikes,
performance (load balancer / cache / memory), and authentication / roles / policies.

## Layout

```
site/                     # the deployable site — plain static HTML, no build step to view
  index.html              # the hub: the "elevation map" — GENERATED from the pages
  patterns/<band>/[<group>/]<id>.html   # one page per pattern — the source of truth
  hazards/<id>.html       # anti-patterns to recognize
  themes/<id>.html        # systems-fluency narratives (CAP, streaming, spikes, performance, auth, …)
  map/graph.html          # global relationship overview — GENERATED
  vocab.html              # the ontology, self-describing — GENERATED
  assets/graph.json       # the relationship graph — DERIVED from the pages
  assets/                 # shared CSS + JS + vendored mermaid
scripts/                  # authoring-time tools (never needed to view the site)
```

## Viewing

- **Locally:** open `site/index.html` in a browser (double-click / `file://`) — everything works
  offline, including diagrams; there is no build step.
- **Served:** `make serve` (static file server), then browse `http://localhost:8000`.
- **Published:** pushed to GitHub Pages via `.github/workflows/pages.yml` (deploys `site/` as-is).

## Layout of the pattern tree

Patterns nest by band, with a group level only where a band is actually subdivided
(`gof` and `distributed`) — no `enterprise/enterprise/` stutter:

```
site/patterns/gof/creational/singleton.html
site/patterns/distributed/resilience/circuit-breaker.html
site/patterns/concurrency/thread-pool.html
```

The path is part of the data model: `make check` fails if a page's location disagrees
with the `data-kb-band` / `data-kb-group` it declares.

## The pages are the data

Each page is not just a rendered document — it is the **source of truth**, carrying its own
metadata in a `data-kb-*` layer at three levels:

| Level | Carrier |
|---|---|
| Page | `data-kb-id` · `kind` · `band` · `group` · `essence` · `order` on the doc root |
| Block | `data-kb-block` on each `<section>` — the `id` is both anchor and semantic key |
| Element | `data-kb-rel` / `data-kb-to` on relationships, `data-kb-member` / `data-kb-role` on theme tours, `data-kb-theme` on fluency links |

Each page's `<head>` also carries a **JSON-LD** block projected from those attributes — generated,
never hand-written, so it cannot disagree with the page. It uses schema.org's `DefinedTerm` plus the
KB's own 13-verb vocabulary, published at [`site/vocab.html`](site/vocab.html) (schema.org's
`isRelatedTo` is far too vague for a real ontology).

`site/assets/graph.json` is **derived from the pages** by `make graph`, not authored. So are the hub,
the relationship overview, and the vocabulary. `make all` regenerates everything; nothing hand-maintains
a copy of what the HTML already says.

> **`class` is presentation. `data-kb-*` is data. They never touch.**
>
> Data is never inferred from a class name or from prose position, so restyling cannot damage
> knowledge and re-authoring prose cannot damage structure.

## Reading it without reading it

The corpus is ~490k tokens — more than fits in a context window — and half of any page is
markup. `scripts/kb.mjs` is the way in for an agent (or you): it strips styles, scripts,
diagrams and chrome and returns the metadata and prose.

```
node scripts/kb.mjs find "one slow dependency blocks my threads"
node scripts/kb.mjs get circuit-breaker --block usage
node scripts/kb.mjs related circuit-breaker
node scripts/kb.mjs ls --band caching
```

`find` searches the full prose of all 146 pages — that costs disk, not context, so only the
matches are charged — and prints the line that matched. It weights differently depending on
whether you are naming a pattern ("circuit breaker") or describing a symptom ("one slow
dependency blocks my threads"), because in the second case a name match is usually incidental.

Add `--json` for structured output, `--diagrams` to keep the mermaid source.

A grounded answer — search, then read two `usage` blocks and a relation list — costs about
**750 tokens**, against ~490,000 to read the corpus and ~3,600 for a single raw page.
`site/assets/catalog.json` is the index behind it.

## Conventions

- **Relative links only** (no `<base>`, no root-absolute URLs) so the same files work on `file://`
  and on GitHub Pages.
- Mermaid is **vendored locally** (`site/assets/vendor/`) — never loaded from a CDN. So is the HTML
  parser the build uses (`scripts/vendor/`): no `package.json`, no `node_modules`, no npm in CI.
- Cross-links are **bidirectional**: every relationship declared on one page has its reverse on the
  other. `make check` verifies there are no dangling, one-way, or contradictory links, that the
  relation vocabulary is closed, and that every generated artifact is in sync.

## Progress

Each pattern page and the hub share a "practiced" toggle stored in your browser's `localStorage`;
marking a pattern practiced anywhere reflects on the hub. Nothing leaves your machine.
