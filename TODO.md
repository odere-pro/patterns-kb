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

## 2. Promote the 6 stub neighbours to real pages — ✅ RESOLVED

All six (`monostate`, `token-bucket`, `reverse-proxy`, `service-mesh`, `sticky-session`,
`stateless-service`) are now full pattern pages with every block, a production block where the
pattern is operational (`monostate` is conceptual and skips it), real "in the wild" examples,
and bidirectional relationships. The corpus is now 137 patterns.

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

**Done.** A curated synonym map (~25 entries, half-weight hits) lives in `lib/model.mjs` as the
single source: `kb.mjs find` imports it, and `build.mjs` projects it into `catalog.js`, so the
offline hub search (`search.js`) expands the same synonyms — "outdated" reaches pages that only
say "stale", identically in the CLI and the browser.

**Remaining (optional, larger).** Expand `solves` coverage (cheapest, no code); or precompute
embeddings into a static index the hub and CLI can both read (most capable, but reintroduces a
build-time model dependency — weigh against the zero-dependency ethos).

## 5. Slim the vendored highlighter — ✅ RESOLVED

`site/assets/vendor/highlight.min.js` is now a **core + typescript-only** build (~29 KB, down
from the ~125 KB core+common bundle) — the corpus only ever highlights TypeScript.

**Reproduce** (one-off, outside the repo — the result is vendored, no build dependency ships):

```
npm install highlight.js@11.11.1 esbuild
# entry.js:
#   import hljs from 'highlight.js/lib/core';
#   import ts from 'highlight.js/lib/languages/typescript';
#   hljs.registerLanguage('typescript', ts);
#   if (typeof window !== 'undefined') window.hljs = hljs;
npx esbuild entry.js --bundle --minify --format=iife --outfile=highlight.min.js
```

IIFE (not ESM) so it loads from `file://`; sets `window.hljs` for `sketch.js`. BSD-3-Clause,
see `highlight.LICENSE`.

## Notes / non-tasks

- **`mentions` / `mentionedBy`** are already derived into `graph.json` (prose links between
  pages that are not typed relations). They are intentionally **not** surfaced as a visible
  "what links here" block: of 344 non-relation links, only ~10 are genuine prose mentions —
  the rest are navigation. Revisit only if that ratio changes materially.
- **`elevation-map.html`** (the old prototype) was deleted, not deferred — it is recoverable
  from git history if ever wanted.
