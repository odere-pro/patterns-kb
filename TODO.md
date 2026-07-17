# TODO — deferred work

Follow-ups that were consciously left out of the HTML5-knowledge-layer build. None of them
blocks the KB; each is a distinct, self-contained piece of work. Ordered roughly by
value-to-effort.

## 1. Recover the 7 discarded per-side relation notes — ✅ RESOLVED

All seven pairs (`null-object`↔`strategy`, `event-sourcing`↔`write-ahead-log`,
`retry-backoff`↔`timeout-deadline`, `gatekeeper`↔`intercepting-validator`,
`cache-aside`↔`materialized-view`, `future-promise`↔`reactor`, `acl`↔`message-translator`)
now carry a **distinct** note on each side — the inverted pipeline plus subsequent
re-authoring gave every edge a per-side note. Verified: 0 pairs share an identical note.

## 2. Promote the 6 stub neighbours to real pages

**What.** Six ids are referenced as relation targets or theme members but have no page of
their own, so they render as plain (unlinked) text:

`monostate`, `token-bucket`, `reverse-proxy`, `service-mesh`, `sticky-session`,
`stateless-service`

**Why deferred.** Whether each deserves a full page is a content decision, not a mechanical
one. Some (`service-mesh`, `token-bucket`) clearly do; others (`monostate`) may be better left
as a footnote on a related pattern.

**How.** Use the `kb-add` skill. The links pointing at a stub already exist, so the moment its
page lands, its inbound relationships light up — this is the cheapest kind of addition. Decide
its band/group, copy the `circuit-breaker` exemplar, write the blocks, and declare the reverse
of each relationship that already points at it. `make check` will tell you which those are.

**Effort.** Medium per page — real content authoring.

## 3. Pre-render mermaid diagrams to SVG

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

## 4. Improve search ranking beyond lexical matching

**What.** `kb.mjs find` and the hub search score by term overlap against essence, tags,
`solves`, and full prose, with a naming-vs-symptom weighting and a relevance cut. It works
well, but it is lexical: a symptom that shares no vocabulary with any `solves` phrase will
miss.

**Done so far.** A curated synonym map now lives in `kb.mjs find` (~25 entries, half-weight
hits), so "outdated" reaches pages that only say "stale". The hub search is still
synonym-blind — porting the map into `search.js`/`catalog.js` is the next cheap step.

**How (remaining).** Expand `solves` coverage (cheapest, no code); port the synonym map to
the hub; or precompute embeddings into a static index the hub and CLI can both read (most
capable, but reintroduces a build-time model dependency — weigh against the zero-dependency
ethos).

**Effort.** Small (hub synonyms) to large (embeddings).

## 5. Slim the vendored highlighter

**What.** `site/assets/vendor/highlight.min.js` is the prebuilt highlight.js core+common
bundle (~125 KB) but the corpus only ever highlights TypeScript. A custom core+typescript
build is ~35 KB.

**Why deferred.** Producing that build needs npm tooling outside the repo; the prebuilt
bundle is reproducible by URL (`@highlightjs/cdn-assets@11.11.1`).

**Effort.** Small, but changes how the vendored file is reproduced.

## Notes / non-tasks

- **`mentions` / `mentionedBy`** are already derived into `graph.json` (prose links between
  pages that are not typed relations). They are intentionally **not** surfaced as a visible
  "what links here" block: of 344 non-relation links, only ~10 are genuine prose mentions —
  the rest are navigation. Revisit only if that ratio changes materially.
- **`elevation-map.html`** (the old prototype) was deleted, not deferred — it is recoverable
  from git history if ever wanted.
