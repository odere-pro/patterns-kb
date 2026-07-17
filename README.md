# patterns-kb — an HTML5 knowledge base

A cross-linked reference of **146 software design patterns, hazards and themes** — and an
experiment in a particular idea: **HTML5 as the storage format for a knowledge base**, not
just its presentation.

Live at **https://odere-pro.github.io/patterns-kb/**.

## The idea

Most knowledge bases store their content in Markdown and render it to HTML. This one inverts
that: **the HTML pages are the source of truth**, and everything else — a relationship graph,
a search index, the hub, an ontology page — is *derived* from them.

Why HTML instead of Markdown? Because **Markdown has no attribute mechanism.** Metadata can
only bolt on as page-level frontmatter; you cannot attach anything to a heading, a paragraph,
or a single list item. HTML5 gives you semantic elements, `id`/`class`, arbitrary `data-*`
attributes, and standard structured-data vocabularies (JSON-LD) natively — so a page can
carry its own meaning at **three levels of granularity** (page, block, and element) instead
of one. That is what lets the pages *be* the data rather than a rendering of data held
somewhere else.

The result is one artifact that serves two audiences at once. A human opens it in a browser
and reads a well-designed page with diagrams. An agent reads the same file's `data-kb-*`
layer as structured data, or queries a derived index for a few hundred tokens instead of
loading the whole ~490k-token corpus.

> **`class` is presentation. `data-kb-*` and JSON-LD are data. They never touch.**
>
> Data is never inferred from a class name or from where prose sits on a page. That
> separation is the load-bearing rule: the site can be restyled without damaging knowledge,
> and prose can be re-authored without damaging structure.

## How it works

### The pages carry data at three levels

| Level | Carrier | Example |
|---|---|---|
| **Page** | attributes on the doc root + a JSON-LD block | `data-kb-id` · `kind` · `band` · `group` · `essence` · `order` · `aliases` · `tags` · `solves` |
| **Block** | `data-kb-block` on each `<section>` — the `id` is both anchor and semantic key | `<section id="tradeoffs" data-kb-block="tradeoffs">` |
| **Element** | typed attributes on individual items | `data-kb-rel` / `data-kb-to` on relationships · `data-kb-polarity` on trade-off items · `data-kb-member` / `data-kb-role` on theme tours |

Each page's `<head>` carries a **JSON-LD** block projected from those attributes — generated,
never hand-written, so it cannot disagree with the page. It uses schema.org's `DefinedTerm`
plus the KB's own 13-verb relation vocabulary, published at [`site/vocab.html`](site/vocab.html)
(schema.org's `isRelatedTo` is far too vague for a real ontology).

### Everything else is derived

`make all` regenerates every derived artifact from the pages. Nothing hand-maintains a copy
of what the HTML already says:

- `site/assets/graph.json` — the full relationship graph, with inverses materialised
- `site/assets/catalog.json` / `catalog.js` — the compact search index
- `site/index.html` — the hub ("elevation map")
- `site/map/graph.html` — the relationship overview
- `site/vocab.html` — the ontology, self-describing
- the JSON-LD region and element ids inside every page
- each folder's `CLAUDE.md` briefing

### The filesystem is part of the model

Patterns nest by band, with a group level only where a band is actually subdivided
(`gof` and `distributed`) — no `enterprise/enterprise/` stutter:

```
site/patterns/gof/creational/singleton.html
site/patterns/distributed/resilience/circuit-breaker.html
site/patterns/concurrency/thread-pool.html
```

The path is checked against the metadata: `make check` fails if a page's location disagrees
with the `data-kb-band` / `data-kb-group` it declares.

## Layout

```
site/                     # the deployable site — plain static HTML, no build step to VIEW
  index.html              # the hub — GENERATED, with offline symptom search
  vocab.html              # the ontology, self-describing — GENERATED
  patterns/<band>/[<group>/]<id>.html   # one page per pattern — the source of truth
  hazards/<id>.html       # anti-patterns to recognize
  themes/<id>.html        # systems-fluency narratives (CAP, streaming, spikes, auth, …)
  map/graph.html          # relationship overview — GENERATED
  assets/graph.json       # the relationship graph — DERIVED from the pages
  assets/catalog.json|js  # the search index — DERIVED
  assets/                 # shared CSS + JS + vendored mermaid
  <folder>/CLAUDE.md      # per-folder briefing — GENERATED
scripts/
  kb.mjs                  # the reader/writer — your interface to the KB
  build.mjs               # derives graph.json + catalog from the pages
  lib/model.mjs           # the taxonomy and both closed vocabularies (relations, tags)
  vendor/                 # vendored HTML parser — no npm, no node_modules
CLAUDE.md                 # the data contract, for agents and humans
.claude/                  # skills, agent, rules, and a validation hook (see below)
```

## Reading it — without reading the HTML

The corpus is ~490k tokens and half of any page is markup, so **don't open the `.html` to
read it.** `scripts/kb.mjs` strips styles, scripts, diagrams and chrome and returns the
metadata and prose:

```
node scripts/kb.mjs find "one slow dependency blocks my threads"   # symptom → pattern
node scripts/kb.mjs get circuit-breaker --block usage              # one block, ~180 tokens
node scripts/kb.mjs related circuit-breaker                        # typed neighbours + notes
node scripts/kb.mjs ls --band caching
```

`find` searches the full prose of all 146 pages — that costs disk, not context, so only the
matches are charged — and prints the line that matched. It weights differently depending on
whether you are naming a pattern ("circuit breaker") or describing a symptom, because in the
second case a name match is usually incidental. Add `--json` for structured output.

A grounded answer — search, then read two `usage` blocks and a relation list — costs about
**600 tokens**, against ~490,000 to read the corpus and ~3,600 for a single raw page. Every
claim has a stable id, so you can cite it precisely
(`…/circuit-breaker.html#tradeoffs-con-2`).

The hub carries the **same search, offline**: type a symptom (or press `/`) and the elevation
map filters in place — matches stay in their band, so you see not just *which* patterns fit
but *where they sit*. It loads `catalog.js` as a script rather than fetching it, so it works
by double-clicking `index.html`, no server needed.

## Authoring — go through the writer, not the attributes

Metadata is written through the validated CLI, never by hand-editing an attribute string
(the JSON is checked before it lands, and placement is never guessed):

```
node scripts/kb.mjs set <id> --aliases '["breaker","CB"]' --tags '[…]' --solves '[…]'
node scripts/kb.mjs wild <id> --items '[{"id":"envoy","name":"Envoy","note":"…"}]'
```

Prose inside a block is edited directly in the HTML. **Never edit a `<!-- kb:generated -->`
region** — it is overwritten by `make all`. The full contract, including how to add a new
page, is in **[.claude/rules/html5-authoring.md](.claude/rules/html5-authoring.md)**, and each
`site/` folder has its own short `CLAUDE.md` with local rules.

## Build & configuration

There is **no build step to view the site** — `site/` is static HTML that works from
`file://`. The `make` targets are authoring-time tools:

```
make            # list every target
make all        # regenerate every derived artifact from the pages
make check      # verify everything is in sync — the one definition of "valid"
make serve      # static file server at http://localhost:8000
make kb ARGS='find slow dependency'   # shortcut for scripts/kb.mjs
```

Individual generators (`make graph`, `hub`, `vocab`, `pages`, `graph-page`, `claude`) exist
but `make all` runs them all in order.

**`make check` is the contract.** It enforces every invariant:

- relations are **bidirectional** — declared on both pages they join, no one-way or
  contradictory edges;
- the relation vocabulary (13 verbs) and the **tag vocabulary (60 tags)** are **closed** —
  both defined in `scripts/lib/model.mjs`; adding a tag is a deliberate edit there;
- a page's path matches its band/group;
- no dangling internal links (href/src **and** mermaid `click` directives);
- every generated artifact is byte-in-sync with the pages.

### Zero-dependency by design

- **No `package.json`, no `node_modules`, no npm** — anywhere, including CI.
- Mermaid and the HTML parser are **vendored** (`site/assets/vendor/`, `scripts/vendor/`),
  never loaded from a CDN or installed.
- **Relative links only** — no `<base>`, no root-absolute URLs — so the same files work on
  `file://` and on GitHub Pages.

### CI (`.github/workflows/`)

- `validate.yml` runs `make check` on every push and PR — CI and the local hook run the same
  one command, so there is nothing to keep in sync.
- `pages.yml` runs `make check` **before** it deploys, so a red build never ships.

## Working with it from Claude Code

The `.claude/` directory makes the KB workable from chat over the same data, and is committed
as part of the repo (only `settings.local.json` stays personal/ignored):

| File | Role |
|---|---|
| [`CLAUDE.md`](CLAUDE.md) (root) | the always-loaded contract — pages are the source of truth, read via `kb.mjs`, never edit generated regions |
| `site/**/CLAUDE.md` | per-folder briefings, **generated**, loaded on demand when work touches that folder |
| `.claude/rules/html5-authoring.md` | the full data contract and field rules (loaded on demand) |
| `.claude/skills/kb-find` | find the right pattern for a problem, answer with citations |
| `.claude/skills/kb-add` | add a new page (or promote a stub) end-to-end |
| `.claude/skills/kb-edit` | change prose, relationships, tags, or examples safely |
| `.claude/agents/kb-author` | batch authoring across many pages in parallel |
| `.claude/hooks/check-kb.sh` | a PostToolUse hook that runs `make check` (~0.8s) after any edit under `site/` and surfaces failures |
| `.claude/settings.json` | portable, command-scoped permissions — no absolute paths |

## Progress tracking

Each pattern page and the hub share a "practiced" toggle stored in your browser's
`localStorage`; marking a pattern practiced anywhere reflects on the hub. Nothing leaves your
machine.

## Deferred work

See [TODO.md](TODO.md) for known follow-ups (mermaid weight, stub promotion, richer relation
notes, and search ranking).
