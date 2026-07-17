# patterns — Systems-Design Fluency Knowledge Base

A small, self-contained static site for getting **fluent at building systems**: every software /
system-design pattern gets its own cross-linked page (description · variations · pros/cons ·
when-to-use · typed relationships), and **theme pages** weave those patterns into narratives for the
concerns that actually decide a design — the CAP theorem, streaming, absorbing traffic spikes,
performance (load balancer / cache / memory), and authentication / roles / policies.

## Layout

```
site/                     # the deployable site — plain static HTML, no build step
  index.html              # the hub: the "elevation map" of all patterns, with progress tracking
  patterns/<id>.html      # one page per pattern
  hazards/<id>.html       # anti-patterns to recognize
  themes/<id>.html        # systems-fluency narratives (CAP, streaming, spikes, performance, auth, …)
  map/graph.html          # global relationship overview
  assets/                 # shared CSS + JS + vendored mermaid + the relationship graph (graph.json)
```

## Viewing

- **Locally:** open `site/index.html` in a browser (double-click / `file://`) — everything works
  offline, including diagrams; there is no build step.
- **Served:** `make serve` (static file server), then browse `http://localhost:8000`.
- **Published:** pushed to GitHub Pages via `.github/workflows/pages.yml` (deploys `site/` as-is).

## Conventions

- **Relative links only** (no `<base>`, no root-absolute URLs) so the same files work on `file://`
  and on GitHub Pages.
- Mermaid is **vendored locally** (`site/assets/vendor/`) — never loaded from a CDN.
- Cross-links are **bidirectional**: every relationship declared on one page has its reverse on the
  other. `make check` (offline link-check) verifies there are no dangling or one-way links.

## Progress

Each pattern page and the hub share a "practiced" toggle stored in your browser's `localStorage`;
marking a pattern practiced anywhere reflects on the hub. Nothing leaves your machine.
