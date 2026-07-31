# TODO — deferred work

Follow-ups that were consciously left out of the HTML5-knowledge-layer build. None of them
blocks the KB; each is a distinct, self-contained piece of work. Ordered roughly by
value-to-effort.

## 0. Lens model v2 sweep — cumulative lenses, AWS-short basic, topology walks

**What.** Owner review corrected the lens model: lenses are CUMULATIVE (basic = AWS-short
untagged core; advanced = basic + system-design depth; expert = everything), the explain
ladder stacks its rungs, `data-kb-register` is demoted to a rare replacement tool, and
implementation patterns gain an AWS-style numbered topology-walk diagram (subgraph
boundary, steps 1..N) with the sequence diagram demoted to advanced. The corpus still
implements v1. Ready-to-execute plans live in `tmp/plans/levels/` (gitignored —
regenerate id lists from graph.json if lost): **M0** mechanism flip → **C0** .claude
assets → **F0** redo the 38 v1-swept pages (outbox first, the exemplar) → **L1–L8** the
remaining ~235. Sizing bands and the full spec are in that index.

**Small riders from the same overhaul:** reconcile hot-key's "also called a hot partition"
and cache-stampede's "also called a thundering herd" lines against the new hazard pages;
give sweeper a theme home (long-running-tasks); fact-check claim-check's SQS 1 MiB claim;
consider request-coalescing/single-flight and load-shedding pattern pages (several
mitigation blocks want the edge); a fluency↔tour make-check integrity rule.

## 1. Give hazards symptom vocabulary the search can score

**What.** Hazards carry no `solves` by contract, and a few hazard essences lack the words
a sufferer would actually type — so even with the synonym-expansion layer and the
no-`solves` essence weight, "memory keeps growing until we restart" ranks `resource-leak`
~20th (its essence never says *leak*), and "intermittent failures we cannot reproduce"
misses `race-condition` (no *flaky*/*intermittent* anywhere in its metadata). The
expansion table cannot fix this side: it only bridges to words a page actually has.

**Options.** Either allow hazards a small `solves` list (contract change in
`.claude/rules/html5-authoring.md` plus authoring ~22×4 phrases — hazards *are* symptoms,
so this is the natural fix); or keep the contract and tune the weakest hazard essences to
carry their symptom words.

**Effort.** Small (essence tuning) to medium (contract change + authoring pass).

## 2. Automated browser tests for the graph runtime

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

## 3. Surface mentions / mentionedBy?

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
- **True vector search** was **rejected, not deferred**, when the synonym-expansion layer
  (`scripts/data/expansion-synonyms.json`, regeneration procedure in its `meta`) shipped:
  client-side query embedding needs a vendored WASM model (tens of MB) or a query-time
  API, and either breaks the double-click-`index.html` contract. Revisit only if
  word-level bridging proves insufficient.
- **`elevation-map.html`** (the old prototype) was never tracked in git — there is nothing
  to recover. If ever wanted, it would be rebuilt from scratch.
