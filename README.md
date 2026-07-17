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
  patterns/<id>.html      # one page per pattern — the source of truth
  hazards/<id>.html       # anti-patterns to recognize
  themes/<id>.html        # systems-fluency narratives (CAP, streaming, spikes, performance, auth, …)
  map/graph.html          # global relationship overview — GENERATED
  assets/graph.json       # the relationship graph — DERIVED from the pages
  assets/                 # shared CSS + JS + vendored mermaid
scripts/                  # authoring-time tools (never needed to view the site)
```

## Viewing

- **Locally:** open `site/index.html` in a browser (double-click / `file://`) — everything works
  offline, including diagrams; there is no build step.
- **Served:** `make serve` (static file server), then browse `http://localhost:8000`.
- **Published:** pushed to GitHub Pages via `.github/workflows/pages.yml` (deploys `site/` as-is).

## The pages are the data

Each page is not just a rendered document — it is the **source of truth**, carrying its own
metadata in a `data-kb-*` layer at three levels:

| Level | Carrier |
|---|---|
| Page | `data-kb-id` · `kind` · `band` · `group` · `essence` · `order` on the doc root |
| Block | `data-kb-block` on each `<section>` — the `id` is both anchor and semantic key |
| Element | `data-kb-rel` / `data-kb-to` on relationships, `data-kb-member` / `data-kb-role` on theme tours, `data-kb-theme` on fluency links |

`site/assets/graph.json` is **derived from the pages** by `make graph`, not authored. So is the hub
and the relationship overview. Nothing hand-maintains a copy of what the HTML already says.

> **`class` is presentation. `data-kb-*` is data. They never touch.**
>
> Data is never inferred from a class name or from prose position, so restyling cannot damage
> knowledge and re-authoring prose cannot damage structure.

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
