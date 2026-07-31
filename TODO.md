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

## 1. Give hazards symptom vocabulary the search can score

**What.** The search stack now bridges searcher vocabulary to catalog vocabulary (curated
`SYNONYMS` in `scripts/lib/model.mjs` layered under a machine-generated table in
`scripts/data/expansion-synonyms.json`), and a page with no `solves` scores its essence at
the solves weight — together those lifted, e.g., "one giant class does everything" →
`god-object` and "everyone piles on at once after the cache expires" → `cache-stampede`.
But hazards still carry no `solves` by contract, and a few hazard essences lack the words a
sufferer would type: "memory keeps growing until we restart" ranks `resource-leak` ~20th
(its essence never says *leak*), and "intermittent failures we cannot reproduce" misses
`race-condition` (no *flaky*/*intermittent* anywhere in its metadata).

**Options.** Either allow hazards a small `solves` list (contract change in
`.claude/rules/html5-authoring.md` plus authoring ~22×4 phrases — hazards *are* symptoms,
so this is the natural fix); or keep the contract and tune the weakest hazard essences to
carry their symptom words. The expansion table cannot fix this side: it only bridges to
words a page actually has.

**Effort.** Small (essence tuning) to medium (contract change + authoring pass).

## 2. Semantic search — iterate the expansion table

**What.** The semantic layer shipped: ~400 word → nearest-corpus-words entries, authored by
agent fan-out and review, merged under the curated map at build time (curated keys win),
consumed identically by the hub, the CLI and the graph search. `make check` fails on
structural rot (a target word no page carries any more) and warns on vocabulary drift; the
regeneration procedure lives in the file's own `meta.regenerate`. The two scorers are
pinned to each other by `scripts/test/search-parity.test.mjs` and covered behaviorally by
`search-features.test.mjs`.

**Left open.** Iterate entries as real queries reveal gaps — add a bridge when a miss
shows up, prune one that pollutes. True vector search was **rejected, not deferred**:
client-side query embedding needs a vendored WASM model (tens of MB) or a query-time API,
and either breaks the double-click-`index.html` contract. Revisit only if word-level
bridging proves insufficient.

**Effort.** Ongoing, minutes per entry.

## 3. Automated browser tests for the graph runtime

**What.** `site/assets/graph-view.js` (the interactive graph explorer's hand-authored
runtime) has no automated tests — `make test` covers the data projection
(`graphdata.js`), but the live physics, the query language, groups, orphan filtering,
settings persistence and the theme recolor are verified by hand (checklist in the
**kb-graph** skill). The post-edit hook only syntax-checks the file.

**How.** A browser test needs a driver (Playwright or similar), which reintroduces a real
dev dependency — the zero-dependency trade-off. Cheaper middle ground: extract the pure
logic (edge dedupe + canonical orientation, `compileQuery`, the orphan pass, settings
load/migration) into a module `node --test` can import, and leave only the d3 wiring
untested.

**Effort.** Small (extract + unit-test the pure logic) to medium (real browser harness).

## 4. Surface mentions / mentionedBy?

**What.** Prose links that are not typed relations are derived into `graph.json`
(`mentions` / `mentionedBy`, `scripts/build.mjs`) but never shown on pages. The old ratio
that justified hiding them — ~10 genuine mentions when the corpus was first swept — no
longer holds: today 105 mentions survive the derivation's navigation filter, from 48
source pages, reaching 57 pages. The note's own revisit trigger ("if that ratio changes
materially") has been met.

**Decide.** Add a small generated "Mentioned by" block (`build-pages.mjs`; the data
already exists) on pages with at least one kept mention — or re-affirm hiding them now
that the typed graph carries 800 relationships.

**Effort.** Small-medium — a generated region plus styling; the data exists.

## Notes / non-tasks

- **Mermaid pre-rendering to SVG** was considered and **dropped** (owner decision,
  2026-07): the vendored client-side renderer stays. Do not re-propose it.
- **`elevation-map.html`** (the old prototype) was never tracked in git — there is nothing
  to recover. If ever wanted, it would be rebuilt from scratch.
