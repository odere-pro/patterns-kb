# TODO — deferred work

Follow-ups that were consciously left out of the HTML5-knowledge-layer build. None of them
blocks the KB; each is a distinct, self-contained piece of work. Ordered roughly by
value-to-effort.

## 0. Register-standard sweep over the 236 non-favourite pages

**What.** The 2026-08 overhaul brought every ★ favourite (37 pages) plus the three pilots
to the per-lens register standard; the rest of the corpus has the mechanism but not the
adapted content. Ready-to-execute wave plans (exact page ids, per-kind recipes, calibrated
budgets, QA gates) live in `tmp/plans/levels/` (gitignored — regenerate the id lists from
graph.json if lost). Exemplars: circuit-breaker, big-ball-of-mud, bitly.

**Small riders from the same overhaul:** reconcile hot-key's "also called a hot partition"
and cache-stampede's "also called a thundering herd" lines against the new hazard pages;
give sweeper a theme home (long-running-tasks); fact-check claim-check's SQS 1 MiB claim;
consider request-coalescing/single-flight and load-shedding pattern pages (several
mitigation blocks want the edge); a fluency↔tour make-check integrity rule.

## 1. Pre-render mermaid diagrams to SVG

**What.** Every one of the 147 mermaid-bearing pages loads the vendored `mermaid.min.js`
(**3.4 MB**) to render ~2 small diagrams client-side. It is browser-cached, so the real-world
cost is one download per visitor — but it dominates the page weight and runs script on every
view. (The theme toggle re-renders diagrams client-side; a pre-render step would need an
SVG-per-theme answer for that.)

**How.** Add a build step that renders each `<pre class="mermaid">` to inline SVG at authoring
time and drops the runtime dependency. The catch, and the reason it was deferred: a headless
mermaid renderer reintroduces a real build-time dependency (a browser engine or the mermaid
CLI), which the repo currently has none of. That trade-off — zero-dependency ethos vs. page
weight — is the actual decision to make here.

**Effort.** Medium-to-large, and it changes the project's dependency posture.

## 2. Semantic search beyond lexical matching

**What.** `kb.mjs find` and the hub already share a lexical scorer (term overlap over essence,
tags, `solves`, prose) plus a curated synonym map. It is still lexical at heart: a symptom that
shares no vocabulary — and no synonym — with any `solves` phrase will miss.

**Options.** Expand `solves` coverage (cheapest, no code); or precompute embeddings into a
static index both the hub and CLI read (most capable, but reintroduces a build-time model
dependency — weigh against the zero-dependency ethos).

**Effort.** Small (more solves) to large (embeddings).

## 3. Automated browser tests for the graph runtime

**What.** `site/assets/graph-view.js` (the interactive graph explorer's hand-authored
runtime) has no automated tests — `make test` covers the data projection
(`graphdata.js`), but the live physics, the query language, groups, orphan filtering,
settings persistence and the theme recolor are verified by hand (checklist in the
**kb-graph** skill). The post-edit hook only syntax-checks the file.

**How.** A browser test needs a driver (Playwright or similar), which reintroduces a real
dev dependency — the same zero-dependency trade-off as mermaid pre-rendering (item 1).
Cheaper middle ground: extract the pure logic (edge dedupe + canonical orientation,
`compileQuery`, the orphan pass, settings load/migration) into a module `node --test` can
import, and leave only the d3 wiring untested.

**Effort.** Small (extract + unit-test the pure logic) to medium (real browser harness).

## Notes / non-tasks

- **`mentions` / `mentionedBy`** are already derived into `graph.json` (prose links between
  pages that are not typed relations). They are intentionally **not** surfaced as a visible
  "what links here" block: of 344 non-relation links, only ~10 are genuine prose mentions —
  the rest are navigation. Revisit only if that ratio changes materially.
- **`elevation-map.html`** (the old prototype) was deleted, not deferred — it is recoverable
  from git history if ever wanted.
