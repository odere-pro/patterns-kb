# Migration to the `kb` spec — working plan

Branch: `harness/optimize` (from `main` @ `3f5c601`). Phase groups land as PRs onto `main`
(see Workflow). Delete this file, or move what survives into `docs/` and `.claude/rules/`,
when the last phase merges.

## Goal

Migrate patterns-kb onto the system spec at
`/Users/oleksandrderechei/git/claude-code-marketplace/tmp/cookbook/spec/` (entry
`SPEC.md`). Done means every non-optional scenario in `spec/acceptance/oracle.md` passes,
plus every optional scenario whose unit we build — and we build all of them.

The spec's model — markdown pages with a closed YAML fact block, JSON single sources with a
header + generator + gate each, one gate contract / registry / driver, a harness that sends
authors back to the single source, and a built site carrying a machine-readable data layer —
is the inverse of patterns-kb today, where 382 hand-authored HTML pages ARE the source and
`data-kb-*` on classed elements carries every fact. The spec says `data-kb-*` is a hook
attribute, never a fact (`spec/vocabulary.md`); facts are bare `data-*` on class-free
elements.

Six of the twelve doctrines the repo already meets (closed vocabularies gated both ways,
`--check` on every builder, decoration vs data, code by reference, derived graph, per-folder
layers). The structural gaps: no rule ids/anchors, no gate registry or driver, no data files
(facts live in `scripts/lib/model.mjs` and page attributes), uncapped inbox, blocking hook,
no coverage floor, and the inverted fact layer.

## Decisions (owner, fixed)

1. **Full inversion.** `docs/**/*.md` + frontmatter is the source; `site/` HTML becomes
   ignored build output. The "HTML pages are the source of truth" rule is retired.
2. **Astro + Starlight**, the spec's reference toolchain. The "vendored, never CDN — no
   `package.json`, no npm" rule is retired. The cookbook's `kit/` (verbatim reference
   implementation, older names) may be copied with renames.
3. **All four optional parents**: `kb.site`+`kb.pagedata` (one block) and `kb.learning` in
   the main phases; `kb.noise` last.
4. **Reading lens preserved per element** via a trailing `{level=advanced|expert}` suffix
   (kramdown-style) that a remark plugin turns into a bare `data-level` on that element. A
   documented KB extension with its own rule id and gate. `data-kb-register` (0 uses) is
   dropped.
5. **One PR per phase group onto `main`.** Both trees coexist on `main` until the
   site-cutover PR; today's `make check` keeps running as `legacy.yml` until then.
6. **No page-edit freeze.** The converter is deterministic and re-runs on latest `main`
   right before cutover. Nobody hand-edits `docs/**.md` before cutover; the retag and level
   passes are re-applicable patches over data files and frontmatter.
   **Tightened at the P2 merge (orchestrator, 2026-09-24):** until the cutover `docs/**.md`
   and the five converter and extraction data files (`site-structure`, `tags`,
   `content-model`, `relations`, `learning-paths`) are **build output** of `site/` and
   `scripts/lib/model.mjs`, exactly like `site/assets/graph.json`: `make all` rewrites them,
   `make check` and three gates (`model-fresh`, `convert-fresh`, `roundtrip`) hold them, so
   `docs/` stays fresh continuously rather than being re-converted once. Consequences: every
   editorial pass before the cutover — the P3b retag, the four over-long descriptions, the
   missing tags on `event-storming` and `event-modeling` — goes through `site/` via `kb.mjs`
   and `model.mjs`, then `make all`; kb.mjs v2, which writes `docs/`, lands with the cutover.
   Measured: `html-to-md --check` 4.7 s, `extract-model --check` 0.3 s, `roundtrip` 3.4 s;
   legacy `make check` 3.2 s before, 8.2 s with both checks, 11.7 s once it runs the
   round-trip too.

## Assumptions taken (say so if wrong)

- Routes keep today's paths (`patterns/distributed/resilience/circuit-breaker.html`) via an
  explicit per-row `route` + Astro `build.format: 'file'`; the spec's offline unit forbids
  directory indexes anyway. Inbound links survive.
- Hub order = structure-file row order (`spec/data-model.md`, "Structure entry": `pages` are
  "rows, in reading order"). The learning-path hub-rank convention is a recorded deviation,
  not an `atlas` pseudo-path.
- Polarity is a section fact per group (`<!--meta polarity=con-->` under `### Cons`), not a
  per-item suffix — `scripts/build-pages.mjs:73-90` already projects it from the column class.
- Neighbour diagrams in 286 relationship blocks and the "Mentioned by" aside are derived at
  build from the relations file / prose links (they are derived today too).
- `owner` = `Oleksandr Derechei`; `status` = `stable` on every existing page; initial
  `level` by the area table below, then editorial review.
- Search ranking: measured in P5 against the existing relevance fixture; keep the winner;
  the payload shape follows the spec regardless.
- `TODO.md` splits: real traps → `docs/inbox.md` (cap 20); features/questions → `plans/`.

## Target layout

```
docs/README.md                  the map (kb.content.docs-map); a generated marked block lists every page by area
docs/<area>/[<sub>/]<slug>.md   382 pages; slug = today's data-kb-id; folders mirror today's site/ tree
docs/reference/                 stamped reference pages (tags, glossary, gates, prerequisites, content-model)
                                + hand-written page-rules.md (PAGE-001..008 + KB-0nn rows with anchors), triage.md
docs/records/                   dated records YYYY-MM-DD-<subject>.md (kb.harness.truth-sweep)
docs/inbox.md                   the trap inbox, "## When an entry leaves", cap 20 (kb.harness.trap-inbox)
docs/data/*.json                the single sources; each opens version / updated / note
site/                           Astro + Starlight workspace (from kit/site); src/content/docs = mirror input (ignored); dist/ ignored
tools/src/{lib,gates,gen,kb,migrate}/ + run-gates.ts    TypeScript gates, generators, driver (kit copies + fresh)
scripts/fm-json.sh              THE one frontmatter parser (kit copy, + quoted-list items, --many)
scripts/kb.mjs                  thin launcher → tools/src/kb (same command surface; skills keep their path)
.claude/{rules,skills,agents,hooks}/, settings.json
```

**Areas** (structure file): `patterns` with 13 band areas, groups `nestUnder` their band
(`gof-creational|structural|behavioral|extra`, `distributed-resilience|routing|scale|
coordination|data`; `BANDS` `dir` aliases become explicit `route`); `hazards`; `principles`
(2 nested groups); `themes` (5); `designs` (3 tiers); `capabilities`; `comparisons`;
`reference`; `map` (generated: graph + stack pages). A page's **kind** is its top ancestor
area — not a frontmatter key.

**Frontmatter** (`spec/interfaces/page-frontmatter.md`): `title` (= `.doc-title` = H1),
`description` (= essence, ≤160 — 4 pages exceed: elevator 162, amazon-locker 164,
logging-service 168, inventory-management 168 → fix task), `level`
(beginner|intermediate|advanced), `area`, `owner`, `tags` (inline, facet order, one topic
first), `status`. KB extension keys with their own KB rules: `aliases`, `solves`,
`favourite` (quoted inline lists — 91 `solves` contain commas). Dropped as derived: id,
kind, band, group, order.

Initial `level`: beginner = gof-*, frontend, testing, principles-craft,
designs-foundational, themes-starting; advanced = distributed-*, concurrency, ml,
designs-advanced, themes-operating; intermediate = the rest.

**Tag facets** (fixed names `topic` / `skill` / `language`, `spec/tree/data/tags/FOLDER.md`):
topic = the one concern the page files under (~20: resilience, caching, messaging,
concurrency, consistency, security, observability, persistence, replication, partitioning,
transactions, routing, api-design, domain-modeling, data-modeling, ui-architecture,
machine-learning, testing, integration, event-driven); skill = the quality or design move
practised (~38); language = the machinery (`cloud`, `edge`). The retag is editorial (pages
with 0 or 2 topics must be re-picked; 2 pages have no tags) — a sonnet `kb-author` batch
after the round-trip check, so the round-trip compares original tags.

## Data files (`docs/data/`)

| File | Spec home | Built from (today) | Generator → output | Gate |
|---|---|---|---|---|
| `site-structure.json` | `tree/data/structure` | `BANDS`, `*_GROUPS` / `*_ORDER`, `data-kb-order`, `folderFor()`, band descs | hub generator (build); `gen-map` → map marked block | structure gate |
| `tags.json` + flat `TAGS` tuple in `site/src/lib/types.ts` | `tree/data/tags` | `TAGS`, `TAG_DESC` | `gen-tags` → `reference/tags.md` | tags gate (both ways) |
| `learning-paths.json` | `tree/data/learning-paths` | 42 theme tours (`data-kb-member` order); extra `notes[route]={role,tour,fluency}` holds the tour/fluency prose | `gen-tours` → `tour` (theme) and `fluency` (pattern) marked blocks | structure gate; retires the TOUR/FLUENCY drift gate |
| `glossary.json` | `tree/data/glossary` | `KINDS`, `BLOCK_DESC`, verb glosses, `POLARITIES`, `LEVELS`, `JSONLD_PROPS`, tone.md "Cut on sight" → `avoid` | `gen-glossary` → `reference/glossary.md` | ban gate (tone becomes mechanical) |
| `relations.json` (KB ext.) | single source for the 17 verbs | 2,599 rows → ~1,300 paired edges `{a,verb,b,note_a,note_b,maps?,group?}` | `gen-relations` → `relationships` marked block per page (+ neighbour mermaid) | relations gate (pairing structural) |
| `prerequisites.json` | `tree/learning/prerequisites` | generated second form of relations.json (`requires` = `prerequisite` verb; `related` = the symmetric verbs; label/definition/route from title/description/structure — never authored twice; root-C3 allows a gated-equal second form) | `gen-prerequisites` + reference page | prerequisites gate (acyclic, resolved, reciprocal, no orphan) |
| `content-model.json` (KB ext.) | extends `tree/content/page-shape` | `BLOCKS` / `OPTIONAL_BLOCKS`, polarity per block, `SKETCH_LANGS`, lens values, `RELATION_TYPES` / `REL_ORDER`, closed section-fact keys, suffix keys | `gen-content-model` → reference page + KB rule rows | kb-shape gate |
| `gates.json` | `tree/gates/registry` | today's 15 `make check` steps + new | `gen-gates` → `reference/gates.md`, triage table, counted block | gates-sync |
| `products.json` (KB ext.) | — | `scripts/lib/products.mjs` | stack page (build) | products gate (offline half) |
| `search-synonyms.json` | — | `SYNONYMS` + `scripts/data/expansion-synonyms.json` | reference page | search gate |
| `allow/<gate>.json` | `tree/data/exceptions` | per-gate allowlists; excusing lists ship empty | — | the owning gate |

**Fate of today's generated artifacts.** Committed + stamped + `--check`: the reference
pages, the map block, the relationships/tour/fluency marked blocks. Ignored build output:
mirror, hubs, `kb.js`, manifest, search payload, graph page (d3 over a JSON data island),
stack page. Retired: `graph.json`, `catalog.*`, `graphdata.js`, `site/index.html` (→
hand-written home + generated hubs), `vocab.html`, the 27 generated `CLAUDE.md` briefings
and `build-claude.mjs`.

## Phases (assembly order; `→` = proof; models = who implements)

Each phase group is a PR. Every PR: `make validate` green (new driver) AND `legacy.yml`
green until cutover. Commits stage exact paths. Kit files are renamed on copy (`ccm` → `kb`,
`sections` → `areas`, `sidebarUnder` → `nestUnder`, `personas` → `profiles`, `audience` →
`level`, facets `activity` → `skill`, `system` → `language`); never copy
`check-mdx-imports`, `lib/artifacts`, the `runbook-*` rules and skills.

### P0 — toolchain (serial; PR 1 with P1) — opus
- Root `package.json` (workspaces: `tools` now, `site` added in P5), `.nvmrc` = 24,
  `.gitignore` += `node_modules`, `site/dist`, `site/.astro`, mirror paths. Makefile gains
  `install`; `validate` / `gen` arrive with the P1 driver, `site-build` with P5; old
  targets stay until cutover.
- CLAUDE.md: strike the "no npm" and "HTML is source" lines with a pointer here.
- `.githooks/pre-commit`: symlink `node_modules` into the extracted staged tree.
- → `npm ci && npm test -w tools` exits 0; `make check` still green.

### P1 — gate framework (serial) — opus; sonnet for mechanical copies + tests
Units: `kb.gates.contract`, `.testing`, `kb.data.source-file`,
`kb.generation.write-or-check`, `.output-ownership`, `.marked-blocks`, `kb.gates.registry`,
`.driver`.
- Copy kit `tools/src/lib/{gate,exec,sandbox,fixtures,generated,managed}.ts`,
  `gates/check-json.ts`, `check-gates-sync.ts`, `gen/gen-gates.ts`, `run-gates.ts` (+
  tests). Write fresh: the colocation gate.
- `docs/data/gates.json` + `reference/{gates,triage}.md`. New `validate.yml`: one named step
  per registered row + `.github/problem-matchers/kb-gates.json`; today's workflow →
  `legacy.yml`.
- Today's 15 steps: `check-links` → repo + site link gates; `audit-assets` → absence gate
  (P7); `check-mermaid` → mermaid-parse gate; `audit-relations` → relations gate;
  `audit-vocab` → tags + ban + kb-shape; `audit-products` → products gate; `lint-claude` →
  harness gates; the 7 builder `--check`s and `audit-highlight` → retired at cutover.
- Scenarios: contract-O1, gates-O1–O5, driver-O1, registry-O1, testing-O1, source-file-O1,
  data-O3, generation-O1–O3, write-or-check-O2, marked-blocks-O1.
- → `make validate` exits 0 with one summary line per gate.

### P2 — converter + content model (serial; PR 2) — opus
Units: parser half of `kb.content.frontmatter`, `kb.content.rule-identity`.
- `docs/data/content-model.json`. `tools/src/lib/kb-attrs.ts`: parses and prints
  `{#id key=value}` suffixes on paragraphs, list items, headings, table rows (last cell),
  fence meta; owns positional id minting (shared by the remark plugin and kb.mjs).
- Copy `scripts/fm-json.sh` + `lib-frontmatter.sh`; extend for quoted list items and `--many`.
- Editorial pre-step: the two H4 pages (`designs/persona-identification{,-v2}`, 150 H4s) →
  H3 groups + bold-led items (PAGE-002).
- Converter `tools/src/migrate/html-to-md.mjs` (vendored node-html-parser) + `roundtrip.ts`.
  Land `docs/` + data files in one commit; `site/` HTML untouched.
- → `html-to-md.mjs --check` shows no diff; `roundtrip.ts --base <sha>` exits 0.

### P3 — three parallel lanes (PR 3) — one opus agent per lane; retag = sonnet kb-author batch
- **P3a content gates**: copy + rename `check-doc-frontmatter`, `check-docs-style`,
  `check-docs-map`; write the kb-shape gate (block order per kind, suffix grammar and keys,
  section-fact keys, sketch langs, area = folder, unique slugs), the repo link gate,
  `gen-map`, `reference/page-rules.md` (row id = rule id, deciding-gate column). Scenarios:
  content-O1–O3, frontmatter-O1, page-shape-O1, docs-map-O1, link-integrity-O1 (repo half).
  Editorial, through `site/` (P2 findings F24, F25): trim the four essences over 160
  characters (`elevator`, `amazon-locker`, `logging-service`, `inventory-management`), which
  the frontmatter gate will fail as descriptions, and `aggregate`'s six `solves` to five.
- **P3b data gates**: copy + rename `check-site-structure`, `lib/published`, `check-tags`,
  `gen-taxonomy`, `lib/tags`, `check-vocabulary`, `gen-vocabulary`. Then the facet split +
  retag batch (one commit per area). Scenarios: data-O1, data-O2, exceptions-O1,
  glossary-O1, learning-paths-O1, structure-O3, tags-O2. The retag also carries two P2
  findings: `event-storming` and `event-modeling` have no tags today (F23), and the six
  hazards whose kicker says "Anti-pattern" lose that label with the header (F9, ledgered as
  `hazard-anti-pattern-kickers`), so a closed term is where it can live again.
- **P3c relations + tours**: relations gate, `gen-relations`, `gen-tours` on the kit's
  `generated.ts` splice; retire the two-sided relations check and the tour/fluency drift
  check. Scenarios: marked-blocks-O1 (real tree), generation-O2. The two generators wrap the
  pure renderers already in `tools/src/lib/render-{relations,tours}.ts` (dialect X-22). While
  `docs/` is build output (decision 6), the converter owns every block and both data files,
  so their CLIs and registry rows land with the cutover, when the data files become the
  source. Editorial, through `site/` (P2 finding F1): `active-record` and
  `transaction-script` draw `anemic-domain-model` in their neighbour figures with no typed
  edge; an editor picks the verb and runs `kb.mjs link`, which retires the ledger's
  `neighbour-diagram-non-edges`.
- **Every P3 lane edits the source, not `docs/`**, until the cutover (decision 6): a retag
  or a description fix is a `kb.mjs set` on the site page or a `model.mjs` change, then
  `make all`, and the new gates read the regenerated `docs/`.
- → `make validate && make gen && git diff --exit-code`; RT-1 still 0.

### P4 — harness + kb.mjs v2 + skills (parallel with P3 after P1; PR 4) — opus for layers, rules, kb.mjs; sonnet batches for the 46 skills
Units: all of `kb.harness`.
- Root `CLAUDE.md` 2,226 → ≤600 words (facts move to authority docs, links left behind);
  directory layers ≤350 words with `Don't` for `docs/`, `site/`, `tools/`, `scripts/`
  (`plans/`, `tmp/` exempt); delete the 27 briefings.
- Rules gain `description` + `paths` frontmatter: `html5-authoring.md` →
  `markdown-authoring.md` citing KB-/PAGE- ids; `tone.md` gets TONE ids (review decides,
  bans by the ban gate); add the kit's five core rules.
- Skills: add kit `docs-sweep`, `gate-red`, `page-audit`, `retire-gotcha`, `site-audit`,
  `site-component`. Re-point all 46 (five per sonnet call, one commit per family): "Use
  when… / Not for…", body = gap → numbered steps → "Done means"; `site/**.html` →
  `docs/**.md`, `data-kb-*` → frontmatter / section facts / suffixes, `make all|check` →
  `make gen|validate`. Retire: `kb-verify` (→ gate-red + gate-triage), `kb-hub` (hubs
  generated), `kb-site-ui` (→ site-component), `kb-design-relationships` (block generated;
  regroup → `kb.mjs link --group`).
- Agents: add `claim-audit`, `gate-triage` (Read/Glob/Grep only). Existing agents keep Bash
  for `kb.mjs` (recorded deviation from skills-and-agents-C4 for non-verifier agents).
- Hooks: replace the blocking `check-kb.sh` with kit `after-write.sh` (JSON advisory, exit 0;
  stamp / data-file / layer-budget cases) + `guard-commands.sh` rows (`make all` →
  `make gen`, retired `node scripts/build*.mjs`, `git add -A|.`); `settings.json` wiring +
  deny on `site/dist` edits.
- `docs/inbox.md` (cap 20, exit ladder); `TODO.md` split.
- kb.mjs v2 in `tools/src/kb/` (same surface per `scripts/lib/cli-spec.mjs`): `set` →
  frontmatter; `link` / `unlink` → relations.json + `gen-relations`; `get --block` →
  section facts, `--level` → suffix filter; `level` → suffix by minted id; `new` →
  scaffold from content-model + structure row; `register` retired; `find` over markdown with
  the existing relevance fixture.
- Copy kit `check-claude-md`, `check-harness` (drop the artifact-linter call),
  `check-gotchas`, agents, hooks, `tests/*.sh`. Write fresh: the claim gate.
- Scenarios: harness-O1–O3, context-layers-O2, hooks-O1, scoped-rules-O1, self-check-O1,
  skills-and-agents-O1/O3, trap-inbox-O2, truth-sweep-O1.
- → `make validate && bash tests/run.sh`; the relevance fixture green via `kb.mjs find`.

### P5 — site + pagedata + CUTOVER (serial; PR 5) — opus
Order by depends-on: two-layers → offline → components → mirror-and-hubs → build-command →
head → blocks → manifest → search.
- Copy kit `site/` workspace + components (AudienceBadge → LevelBadge), `gen-site-docs`,
  `gen-site-hubs`, `site-portable` (page-data passes), `gen-search-index`,
  `check-site-{portable,links,tokens,hooks}`.
- Write fresh: the `kb-attrs` remark/rehype plugin (bare `data-*` on class-free elements;
  wraps classed Starlight nodes — code frames, figures — in a class-free `div`); components
  Lens (`data-kb-lens` hook; CSS scoped inside `[data-page]`), Favourites, Practiced, Facets,
  GraphExplorer (d3 from npm over a data island); `gen-map-graph`, `gen-map-stack`.
- Mermaid → inline SVG at build (rehype-mermaid `inline-svg`, Chromium in CI, cache
  `ms-playwright`); the lens toggles visibility only; keep mermaid-parse as a fast gate.
  Verify SVG `click` links survive the portability pass **first**.
- The `usage` block's trailing smell paragraph (P2 finding F5, dialect X-06): the renderer
  puts a trailing paragraph that is no item after the columns, not under "Avoid when", and
  RT-2 holds it.
- Search: port the relevance fixture; measure the spec ranking (search-C7–C10) against the
  KB scorer; keep the winner; one implementation shared by bundle and kb.mjs (retires the
  ES5 twin + parity test).
- **Cutover commit** (after re-running the converter on latest `main` + RT-1 + RT-2 green):
  `git rm` `site/**` HTML + assets, old `scripts/*.mjs`, `scripts/lib`, `scripts/vendor`,
  `legacy.yml`; `pages.yml` builds then uploads `site/dist`. The last converter run writes
  no stamp and no `source` key (dialect D-13), so the pages become the source; the converter
  and extraction steps leave `make all`, they and the round-trip leave `make check`, the
  `convert-fresh`, `model-fresh` and `roundtrip` rows retire with `tools/src/migrate/`, and
  RT-1 runs one last time as `roundtrip.ts --base <the commit before the cutover>`. The
  advisory's five data-file cases and the pre-commit hook's `docs/` trigger are re-pointed at
  the new sources.
- Scenarios: site-O1–O3, components-O1, offline-O1, pagedata-O1, blocks-O1, head-O1,
  manifest-O1, search-O1, mirror-and-hubs-O1, output-ownership-O1, link-integrity-O1 (site
  half); build-command-O1 partial (completes in P7).
- → `make site-build`; `roundtrip.ts --built site/dist`; `make validate`.

### P6 — learning (6a parallel with P4 after P3b/P3c; 6b after P5; PR 6) — sonnet-capable, opus reviews
- 6a: `status` required (no default); prerequisites gate; `gen-prerequisites` + reference
  page. 6b: prerequisite card (`data-requires` / `data-related`), hub chips, level badge.
- Scenarios: learning-O1–O3, maturity-O1, prerequisites-O1. → `make validate && make site-build`.

### P7 — noise (last, serial; PR 7) — sonnet copies, opus measures
- Copy `site-format`, `check-site-bundles` (fingerprints re-measured), `check-site-a11y`,
  `check-site-axe`, `site-shots`. Measure (never copy) the warning band, payload budget,
  chrome fingerprints, coverage floors (`spec/unknowns.md`).
- Scenarios: noise-O1, absence-gate-O1, accessibility-O1, formatter-O1, page-audit-O1,
  post-build-O1, two-layers-O1, build-command-O1 (five site-gate lines).
- → `make site-build` prints five site-gate summary lines; a second post-build run changes
  no byte.

## Converter (`tools/src/migrate/html-to-md.mjs`) and the round-trip proof

Deterministic, idempotent, re-runnable on latest `main` at cutover; skips `kb:generated`
regions; every construct outside the table is **reported** to `tmp/convert-report.json`,
never guessed.

| HTML today | Markdown / data |
|---|---|
| `<main data-kb-*>`, `.doc-title`, `.doc-essence` | frontmatter, the H1, intro paragraph (PAGE-001) |
| `<section data-kb-block=X>` + `h2` | `## <heading>` + `<!--meta block=X-->`; the plugin sets heading id = X so `#tradeoffs` anchors survive |
| `data-kb-level` | `{level=advanced\|expert}` suffix; `basic` unmarked |
| polarity columns (`.col.pros`, `.when`, `.prod-knobs`…) | `### <group>` + `<!--meta polarity=pro-->`; per-item disagreement reported |
| explain ladder | `**Basic.** …` / `**Advanced.** … {level=advanced}` / `**Expert.** … {level=expert}` |
| `<dl class="variations">` | `- **Name** — text {level=…}`; a linked `<dt>` → bold link |
| `<details class="sketch">` + `data-kb-lang` | fenced code with `summary="…" level=…` meta; the plugin rebuilds `<details>` |
| mermaid `<figure>` + `figcaption` | ```` ```mermaid caption="…" level=… ````; `click` targets → routes |
| `.table-scroll > table` | GFM table; first column = row header; row ids `<block>-row-N`; row level suffix in the last cell |
| `.wild-item[data-kb-example]` | `- **Name** — text {#wild-<id> level=…}` |
| `.rel-item` rows | paired edges in `relations.json` (unpaired reported) → generated block |
| `.tour-step`, `.fluency-item` | `learning-paths.json` stages + `notes` → generated blocks |
| prose `<a>` | relative `.md` links (the mirror rewrites to routes); dead fragments reported |
| `<code>`, `<strong>`, `<br>`, `<ol>`, `<sup>` | backticks, `**`, hard break, `1.`, raw `<sup>` |

**RT-1 (source level)**: `derive-graph` over `docs/` + `docs/data/` must equal
`git show <base>:site/assets/graph.json` up to renamed keys — nodes, kind/band/group via the
area chain, essence, aliases, solves, favourite, pre-retag tags; relations as a set of
`(type, to, note)` per side incl. `maps` / `group`; tour membership + roles; examples;
mentions; the `levels` map (element id → level, `basic` dropped). Excluded as derived:
`dir`, `path`, `href`, `docClass`, `mentionedBy`. Plus a prose check: per page, block and
lens the normalised word sequence is equal (same lens rules as `report-lens`).
**RT-2 (built level)**: the same comparison read from `site/dist` (manifest, article data
blocks, section facts). Recorded in `docs/records/<date>-migration-roundtrip.md`.

**Cannot round-trip (reported, decided, never guessed)**: hand-drawn neighbour diagrams
(derived from relations.json instead); relation item order (compared as a set); paint-only
classes `.smell`, `.subline`, `.outofscope`, `diagram wide` (text kept); crumb / kicker /
badges / prev-next (chrome); 30 hand-minted `-h-` ids nothing links to; captions with
markup; links to targets that will not exist.

## Risks → mitigations

1. `data-level` value collision (page difficulty `advanced` vs lens `advanced`): CSS scoped
   inside `[data-page]`; KB rule: element-level values are only `advanced|expert`;
   page-audit checks it.
2. Section fact + heading id restate each other (two-layers-C6): authors write only the
   fact; the plugin derives the id; recorded decision.
3. Starlight puts facts on classed wrappers: the plugin wraps them in a class-free element;
   the absence gate catches the rest from P7.
4. Mermaid build time (629 diagrams) + Chromium in CI + SVG `click` through portability:
   test first in P5; cache Playwright; clear `node_modules/.astro` on plugin change.
5. One-parser rule vs. speed (one process per page): `fm-json.sh --many`.
6. Skills break mid-migration: kb.mjs keeps its surface; the guard denies retired commands;
   the re-point lands right before cutover.
7. Concurrent page edits on `main`: converter re-run at cutover + RT-1 / RT-2 gate the
   cutover commit.
8. Search relevance regression: the fixture decides.
9. The retag is lossy: a separate, reviewed change after RT-1.
10. Kit divergence: per-file rename checklist; each copy's tests pass in the sandbox.
11. The pre-commit hook sees no `node_modules`: symlink in P0.
12. **Push is 403 for this account** on `origin`; the owner pushes, or configures a `fork`
    remote and PRs cross-repo.

## Workflow

1. All changes land on `harness/optimize`, then one PR per phase group onto `main`. `main`
   stays green and deployable throughout: both trees coexist until the P5 cutover PR.
2. One small commit per coherent change, conventional subject (≤72 chars). Stage exact
   paths, never `git add -A` or a directory: another session may have work in the same tree.
3. Before every push: `make check` (legacy) green AND, from P1 on, `make validate` green.
   The pre-commit hook (`git config core.hooksPath .githooks`) runs the check on the staged
   tree.
4. Push after each commit, so the branch is the handoff between machines.
5. Each phase PR carries a summary and its proving command's output. Merge only on the
   owner's explicit go-ahead.

## Status

- [x] Branch created and pushed
- [x] Cookbook received — restructured into `spec/` on 2026-09-23, read in full
- [x] Gap analysis and migration plan written; owner approved the decisions above
- [x] P0 — toolchain: `package.json` (workspaces `tools`), `.nvmrc`, `.gitignore`, `make install`, CLAUDE.md pointers, pre-commit symlink. TypeScript pinned to 6.0.3, not the kit's 7.0.2: typescript-eslint 8.70 peers `<6.1.0`. Every install script denied (`allowScripts`).
- [x] P1 — gate framework: contract, testing, source-file, write-or-check, stamps, marked blocks, registry, driver; `validate.yml` per gate; `legacy.yml`. Six rows in `docs/data/gates.json` (typecheck, json-sanity, gates-sync, gates-fresh, test-colocation, tests-vitest); `make validate` runs them through `tools/src/run-gates.ts`; `docs/reference/gates.md` generated, `docs/reference/triage.md` hand-written around two generated blocks. Coverage measured 98.38 / 92.98 / 98.95 / 99.05 (statements / branches / functions / lines), floors 97 / 91 / 97 / 98. `lib/managed.ts` not copied: it reads `.claude/ccm-sync-manifest.json`, a name the marketplace's plugin writes, so renaming it to `kb` would read a file nothing writes; its consumers (check-claude-md, check-harness) arrive in P4, which decides. `lib/exec.ts` lands without `frontmatter()` (returns with `fm-json.sh` in P2) and without the eval harness's `runAsync`. Deviations from the spec:
  - typecheck and tests-vitest run through contract wrappers (`tools/src/gates/check-types.ts`, `check-suite.ts`), not `npm run typecheck` / `make tools-test`: npm swallows `--nope` and exits 0, and tsc and vitest report on stdout in their own shapes, so neither raw command keeps the contract root-C1 registers. `make tools-test` stays the human-readable run.
  - Coverage floors: first set one point too low (the orchestrator's brief said "minus one point"); corrected to the measurement rounded down, 98 / 92 / 98 / 99, per testing-C8. Every later phase lands at or above them.
  - tests-vitest has no in-suite case against the real tree (testing-C3/C4): what it polices is the suite itself, so that case would run the suite from inside the suite. Its real run is the registry row.
  - Colocation covers `tools/src` modules and `.claude/hooks`; the legacy `scripts/*.mjs` executables stay outside it until they retire at the P5 cutover (testing-C10 says every executable). `check-kb.sh` got a test (`tools/src/hooks/check-kb.test.ts`); a hook's test lives at `tools/src/hooks/<name>.test.ts` or `tests/hooks/<name>.test.sh` and must name the hook.
  - json-sanity drops a named file that is not JSON instead of exiting 2: the spec says both (contract-C4 "an ungoverned named file is misuse"; source-file "checks only `.json` names, silently dropping the rest"); the unit's own rule wins, because the narrowed run hands it every changed path its glob matched.
  - Through make, any red gate exits 2 (make's own status for a failed recipe); the contract's exit 1 holds for the program itself, which is what the driver and every CI step run.
  - `docs/reference/{gates,triage}.md` carry provisional frontmatter (`level: intermediate`, `area: reference`, `tags: [testing]` — one tag, no skill facet) until P2's content model and P3b's tag list exist.
  - Readings, recorded because the spec leaves them open: an allowlist under `docs/data/allow/` is a data file and owes the source header (unknowns, kb.data); the colocation gate takes no file arguments, so its unused-entry check always runs whole (unknowns, kb.data.exceptions); an entry that excuses nothing — its thing gone or now tested — fails, not only one that matches nothing; `runs_values` entries are `{ meaning, workflow? }` and the change workflow is the one the `ci` run place names; the sync gate also names a stale gate-count total, as gates-O3 asks, though the freshness check reports the same file.
- [ ] PR 1 (P0 + P1) opened and merged
- [x] P2 — converter + content model; `docs/` landed; RT-1 green. Built on `migrate/p2` in 14 commits (`43a3751`…`c8dbce4`): the suffix grammar and positional ids (`tools/src/lib/kb-attrs.ts`), the frontmatter door (`lib/frontmatter.ts` over `scripts/fm-json.sh --many`), the dialect (`tools/src/migrate/dialect.md`), the converter (`html-to-md.ts`, `convert-*.ts`), extraction (`extract-model.ts` → `docs/data/{site-structure,tags,content-model}.json`), the converter's `relations.json` and `learning-paths.json`, the block renderers, RT-1 (`roundtrip.ts`, `rt-*.ts`), then the 382 pages. RT-1 on the working tree: 382 pages, 19,873 ids, 1,473,482 words across three lenses, 2,599 relation sides and 3,718 decided losses in the 14 entries of `tools/src/migrate/known-losses.json`; each of the verifier's 39 mutations of the real tree turns it red. The entries:
  - `neighbour-diagrams` 137 and `neighbour-diagram-non-edges` 2: the hand-drawn neighbour figure, which the site build will draw from `relations.json` (D-58).
  - `block-heading-aria-ids` 3,443, counted per block heading, and `prose-wrapper-ids` 17: ids with no markdown element (D-72).
  - `secure-logger-duplicate-row` 2 and `stale-relationship-link-text` 1: source defects on `secure-logger` and `deadlock`.
  - `distributed-band-reading-order` 1: the band's `data-kb-order` interleaves its five group areas, and the structure file groups them (X-19).
  - `hazard-anti-pattern-kickers` 6, `theme-kickers` 25, `theme-subtitle-badges` 10, `pattern-stale-kickers` 4: hand-written header text D-70 drops.
  - `theme-reading-trails` 33, `hazard-reading-trail` 4, `pattern-prev-next-drift` 33: hand-kept prev/next links that leave the structure order (D-70).

  P2's deviations, each recorded in `dialect.md`: a data file's `updated` moves only with its content (D-05, X-20); a kind's top area takes the hub's whole section title as its label (D-11); kickers, badges and prev/next are reported and ledgered, not carried (D-70, X-21); the nine hazard neighbour figures in `mitigation` stay as authored fences (D-58); RT-1 checks the marked blocks' bytes with the converter's own pure renderers, and keeps its own copies of the D-11 level table and the template's kicker words; RT-1 does not hold `hub.tags`, a tag's `applies` and `owner`, or `content-model.json`, which only `extract-model --check` holds; a ledger entry may pin exact messages; D-62 is read narrowly (`EXTRA_ID_CLASS`); the RT-1 fixture gained a sixth page; the converter report still counts kicker and prev/next drops as generic chrome. Open editorial findings went to the lanes that own them: F24 and F25 to P3a, F9 and F23 to P3b, F1 to P3c, F5 to P5.

  Merged into `migrate/merge-p2` (`36595c9`), integrated there in 9 commits (`bfd208f`…`cc2650c`), then closed out in 12 (`b9b833b`…this plan update):
  - `docs/` is build output of `site/` until the cutover (decision 6): `make all` runs `extract-model.ts` then `html-to-md.ts` after the HTML-era builders, inside the lock and behind the install stamp; `make check` runs both with `--check` and then the round-trip. The pre-commit hook triggers on `docs/` (and on deletions) and runs the staged-tree check with `GIT_DIR` pointed at the repository, since the converter asks git for `HEAD`'s date and the tracked page list, and with `make -o` on the install stamp so it never runs `npm ci` through the borrowed `node_modules`; with no `node_modules` at all it stops and says to run `make install`. `legacy.yml` and `pages.yml` moved to the `.nvmrc` node with the npm cache, because `make check` now installs the tools workspace (`pages.yml` not yet dispatched by hand, as `workflow-edits.md` asks).
  - Every converted page carries `html-to-md.ts`'s whole-file stamp as its first body line and a `source: site/<path>.html` key (dialect D-13, output-ownership-C1): the converter writes only a page carrying its own stamp, removes a stamped page whose site page is gone, and leaves an unstamped file with a note, while `--check` tells you to move that file out rather than run `make all`. RT-1 holds both lines; the cutover drops them. The stamp is what tells the advisory hook which site page to name.
  - Three gates join the registry, now 13 rows: `model-fresh` (`extract-model.ts --check`), `convert-fresh` (`html-to-md.ts --check`), both repaired by `make all`, and `roundtrip` (RT-1), which reads the working tree's `site/`, `graph.json`, hub and model by default, so an uncommitted page edit plus `make all` is green before commit; `--base <rev>` still reads one commit. Each has a real-tree case recounting pages by a walk. gates-sync holds `tools/src/migrate/` both ways: a row's program there must exist, and a module there that ends in `main(spec, import.meta.url)` is a program that needs a row. Each freshness row's `fix` is its own generator's `FIX`.
  - Stamps and generators: `gen-relations.ts` and `gen-tours.ts` became `tools/src/lib/render-{relations,tours}.ts` (dialect X-22). Before the cutover the converter writes every marked block from the two data files it also writes, so a CLI would only re-check `convert-fresh` or be a second writer of pages it owns. The block stamps already name the P3c generators that will own the blocks, so those bytes do not change twice.
  - Advisory hook: a converted page's stamp draws "generated from `site/<path>.html` until the P5 cutover … run: make all"; each of the five data files names the program that writes it and what from, then `make all && make gate G=check-json`. `lib/rules.ts` reads rule frontmatter through `lib/frontmatter.ts` (the P4a deferred item). `docs/CLAUDE.md` is the one layer that says which files are build output and what writes them; `site/CLAUDE.md` links to it.
  - Verifier findings fixed in the close-out: a gate a signal ended counted as a pass (`exec.run` and the driver now report 128 plus the signal); adding a page turned RT-1 red, because two ledger entries moved with the corpus (the aria ids now count `per` block heading, and the band order is pinned by its shape, interleaved today and grouped in the file; a page added mid-band in a scratch worktree leaves RT-1 green, 3,726 losses applied), and nothing local ran RT-1 (now `make check` and the pre-commit do); a pinned message that changed read as "matches nothing; delete it" (the ledger now quotes the new message whole, ready to re-pin, and triage says so); `emit` rewrote all 389 converter files on every `make all` with a truncating write (now it skips identical bytes and writes through a temp file and a rename); a `maxLevel` fallback removed as dead was reachable; D-73 shapes the converter passed silently are reported; the empty prose-sketch summary is written as `***` on purpose; tests that covered a branch without pinning it now kill their mutants; `vfile` is declared. The one `tests-vitest` red seen after the P4a merge was the temp-folder test reading the shared `os.tmpdir()`, where another session's suite run keeps its `kb-suite-*`; the test now reads a folder of its own.
  - Coverage: five groups of tests brought the P2 modules to 100% or within one branch, and the fallbacks nothing reaches were cast away where no input under any spec gets there, or kept with the input that does named in the test. Whole suite: 1,149 tests, 99.94 / 99.77 / 99.90 / 99.96 (statements / branches / functions / lines, Node 24.20). Floors rose to 99 / 99 / 99 / 99 (testing-C8).
  - Deviations: legacy `make check` runs three registered programs (`model-fresh`, `convert-fresh`, `roundtrip`) until the cutover, against driver-C9's "the task runner file lists no gate", because the pre-commit hook runs `check` on the staged tree; the Makefile comment says so. Two fallbacks stay uncovered on purpose: `KbProblem.line` is optional in its type, so `roundtrip.ts` and `convert-verify.ts` keep a guard for a problem with no line, which no parsed tree produces.
- [ ] PR 2 opened and merged
- [x] P3a content gates: the content lane, merged in `7ab06d0` (21 gates green)
- [x] P3b data gates + retag: the tags lane, merged in `9960bbe` (31 gates green)
- [x] P3c relations + tours (and P6a): the relations lane, merged in `33e5f7b`; `check-maturity` retired in `9d0a57e` (28 gates green)
- [ ] PR 3 opened and merged
- [x] P4a — harness core (branch `migrate/p4a`): context layers, scoped rules, trap inbox, claim gate, hooks. Root `CLAUDE.md` 2,333 → 574 words; every fact it held moved to one home — `docs/concepts/{skill-routing,working-in-this-repo,context-layering}.md`, directory layers for `docs/`, `scripts/`, `site/`, `tools/`, `tests/`, `html5-authoring.md` (the restyle rationale), `cli-spec.mjs` (the writer commands, already there) and the skills. Four gates join the registry, now 10 rows: `context-layers` (`check-claude-md.ts`), `claims` (`check-claims.ts`), `inbox-cap` (`check-inbox.ts`), `tests-bash` (`check-bash-suite.ts`). `check-kb.sh` and its test are gone; `.claude/hooks/after-write.sh` (advisory) and `guard-commands.sh` (guard) are wired in `settings.json` with `permissions.deny` on `site/dist` and `site/.astro`. `TODO.md` split into `plans/backlog.md`; `docs/inbox.md` holds 3 entries. `lib/links.ts` and `lib/allowlist.ts` extracted (the colocation gate now shares the allowlist reader; P3a's docs-map gate imports `links.ts`); `lib/rules.ts` reads rule frontmatter for the P4b shape gate. Scenarios: context-layers-O2, trap-inbox-O2, truth-sweep-O1, scoped-rules-O1 (vitest, by id); hooks-O1, harness-O3 (bash, by id); harness-O1/O2 for the three harness gates built here (their registry row each, and each run alone with `--nope`); the 340-word advisory-plus-gate behaviour. Coverage 98.92 / 95.08 / 99.28 / 99.43; the floors rose to that measurement rounded down, 98 / 95 / 99 / 99 (testing-C8). A verifier pass then fixed all 33 of its findings in the same phase: facts the root move had narrowed or doubled, gate blind spots (markers and stamps in prose, fenced headings, `--fix` placeholders, indented inbox bullets, allowlisted layers) and guard misses and false denies. Deviations and readings:
  - The 27 HTML-era `CLAUDE.md` files stay until P5: 26 written by `build-claude.mjs` (legacy `make check` fails a missing one) and the hand-written `site/assets/CLAUDE.md`. `docs/data/allow/context-layers.json` excuses them in two entries with owner and since, against exceptions-C8 ("an excusing list ships empty"); the two-way check forces both out at the cutover.
  - `site/CLAUDE.md` is created although P4a does not edit `site/`: context-layers-C2 requires a layer for every governed top-level directory, and it is a harness file, not a page.
  - `plans/` stays exempt, as this plan says, with its reason in `EXEMPT`; `tests/` is new and governed. `context-layers` declares no `scans`, so `make validate-changed` always runs it whole: a new top-level directory is exactly what it must see.
  - Root keeps all 46 skill names as one alphabetical index, because `lint-claude.mjs` W2 warns (a warning, never a failure) for each skill no `CLAUDE.md` names; which skill owns which job lives only in `skill-routing.md`, and `context-layering.md` records the list as the one deliberate repeat. `html5-authoring.md` and `tone.md` are path-scoped to page files, so a `kb.mjs` edit, which opens none, loads neither: the root tells a session to open them before writing a page, and `context-layering.md` says why.
  - `.githooks/pre-commit` now also runs for a staged `CLAUDE.md`, `README.md` or `.claude/` change: `build-claude --check` and `lint-claude` read them, and a harness-only commit skipped the staged-tree check.
  - Rules: a rule may omit `paths` only with an `act:` key naming the act it governs (the reading of scoped-rules-C2). `page-schema.md` and `component-authoring.md` are stubs whose globs match the Astro workspace, so they select no file until P5. `lib/rules.ts` reads only `description`, `paths` and `act` with its own small reader; swap it for P2's frontmatter door when both merge.
  - Claim gate: reads fences labelled bash, sh, shell, zsh, console or shell-session in top-level markdown, `docs/**`, every `CLAUDE.md` and `.claude/**` markdown, not `plans/`. It reads past a leading assignment and the prefixes `env`, `sudo`, `time`, `nohup`, `nice`, `exec`, `command` and `xargs` with their options, reads a make flag's value (`-j 4`, `-o f`) as the flag's, runs `python`/`python3` programs like `node`'s, stops judging a line after `cd`, skips heredoc bodies and lines inside an open quote, and honours `# claim-ok`. A marked block opens and closes only at a marker on a line of its own, and a start with no end is a finding; a file is stamped only by a whole-file stamp on a line of its own outside a fence, searched through the whole file (output-ownership-C4). The fences it must read were labelled `bash` (root, README, three in `html5-authoring.md`).
  - Layer gate: headings and links are read outside fences; a `Don't` or nested heading holding only blank lines and comments (the `--fix` question) is an empty-heading finding on every run; an allowlist entry excuses a layer's place only, so an excused layer's links and root copies are checked like any other's. Inbox gate: a top-level item is read as CommonMark reads one (a marker indented 0-3 spaces and shallower than the open item's text), and a numbered item outside the exit-ladder section is a finding.
  - Hooks: bash tests live at `tests/hooks/` (P1's colocation home), not `tests/repo/`; they pass under `/bin/bash` 3.2 too (`KB_TEST_BASH`). The suite is registered through a wrapper that runs `tests/run.sh` and parses its transcript, as P1 wrapped vitest; like tests-vitest, it has no in-suite real-tree run. The advisory reads the budgets and margin from `check-claude-md.ts` with `sed` (unknowns, kb.harness.hooks) and is silent when it cannot; only a whole-file stamp counts, so the triage page's block stamps draw nothing. Until the cutover a source page under `site/` draws `kb.mjs validate --file` then `make all && make check` (it is the data source, not a hand-written page in the hooks-C2 sense), and `model.mjs`, `products.mjs`, `cli-spec.mjs` and `expansion-synonyms.json` are treated as data files. Every `docs/data/` case also names `make gate G=check-json`, since json-sanity holds every data file's source header. A skill, agent or rule (`.claude/**/*.md`) draws `node scripts/lint-claude.mjs`, the check the old hook ran: a harness file is neither a page nor a program source in the hooks-C2 sense. A stamp counts only as a whole line outside a fence, searched through the whole file. The layer note starts at exactly the margin below the budget (325 of 350): hooks-C4 and the hooks behaviours ("within 25 words") ask for it, and context-layers-C9 ("above its budget minus 25") only sets a floor that this meets. Lost: the edit-time `node --check` on `site/assets/*.js`, and the `make check` the old hook ran after an edit to `scripts/*.mjs` or the `Makefile` (a program source, which hooks-C2 keeps silent); `make check`, `make test` and the pre-commit hook still catch all three.
  - `permissions.deny` holds `Edit(/site/dist/**)` and `Edit(/site/.astro/**)` only: Claude Code consults `Edit` rules for every file-editing tool and ignores a `Write(path)` rule. No `permissions.allow` entry was added.
  - Guard rows: stage-all, commit-all, commit-path (`git commit` with `.`, `:/` or a directory), index-restore, amend (only with work staged), force-push-main (a refspec naming `main`, or `HEAD`/`@` or no refspec while `main` is checked out), vitest-coverage. The guard first splits the command line into simple commands with a POSIX awk lexer: quoted text, heredoc bodies, comments and redirections go inert, and assignments, reserved words and the prefixes `env`, `sudo`, `time`, `nohup`, `nice`, `exec`, `command`, `builtin` and `xargs` are read past, so a row matches only at a command's start and an exemption judges only the command that matched. `git add <dir>` without a trailing slash cannot be told from a file and passes; `git stash` and `git reset` are not guarded; a script handed to `bash -c` is not read; a `cd tools` in a subshell that already closed still exempts a later vitest run.
- [x] P4b — kb.mjs v2 (the kbcli lane, merged in `c25c96d`) and the harness lane's shape and route gates, kit skills and agents (merged in `4967cbd`). The items below still open are wave 2's: the 46 skills re-pointed to docs/ and kb.mjs v2, and the rest of the harness. Moved here from P4a:
  - self-check: the shape gate (folder list, rule shape through `lib/rules.ts`, hooks executable and silent on empty input, `settings.json` wiring; then the skill and agent shapes) and the route gate (harness links, the untracked table; today red on `kb-design-levels` and `kb-design-relationships` dead links and on `tmp/` routes in `kb-fact-check`, `kb-harvest`, `kb-intake`, `site-extract`, `sys-design`). With them, harness-O1 and harness-O2 in full, self-check-O1, skills-and-agents-O1/O3.
  - The kit skills (`retire-gotcha` as the inbox's retirement skill, `docs-sweep` as the truth-sweep skill, `gate-red`, `page-audit`, `site-audit`, `site-component`), the `claim-audit` and `gate-triage` agents, the sweep's CI schedule, and `docs/records/` with its map row.
  - `permissions.allow` covering every command the harness names (self-check-C10).
  - `html5-authoring.md` → `markdown-authoring.md` with KB-/PAGE- ids; TONE ids in `tone.md`.
  - Re-point the stale lines the inbox names: three pointers to rules the root no longer holds, and the fourteen skill and brief lines that say a hook runs a check after each edit (`site/assets/CLAUDE.md` retires at P5 instead).
  - At P5: guard rows for `make all` → `make gen` and the retired `node scripts/build*.mjs`; advisory cases for `site/dist` and `site/.astro` naming `make site-build`; delete the briefings and both allowlist entries.
  - Merge dependencies: P3b's structure needs a `concepts` area (or the three pages move under `reference/`); each P3 data file needs an advisory case, or the bash suite fails (hooks-C5).
- [ ] PR 4 opened and merged
- [x] P5 — site + pagedata; cutover commit; Pages deploys `site/dist`. Pre-cutover half: the site lane, merged in `0d3da78`. The cutover, on 2026-09-29: three pre-cutover commits (`bf40a22` the converter's eight notes, `f0d989d` the mermaid-parse gate, `f28ff7d` its oracle case; PRE = `f28ff7d`, green on `make validate` (34 gates), `make check`, `make site-build`, `make site-roundtrip` and `KB_PARITY=all`), then the cutover commit `5285b8a`; the pre-commit hook fix and a vitest guard followed in `1edb8d3` after the refs were repaired (see "Cutover", the incident). `docs/` and `docs/data/` are the source; 38 registered gates, 33 in `make validate` and 5 in `make site-build`, all green; `make gen` is idempotent; two site builds are byte-identical (noise-O1). Retired: the HTML pages and `site/assets`, `scripts/*.mjs` but `kb.mjs`, `scripts/lib`, `scripts/vendor`, `legacy.yml`, `tools/src/migrate/` (RT-1, RT-2, the converter and extraction, and their four gate rows), `make all` and the HTML-era targets, six skills (kb-verify, kb-hub, kb-site-ui, kb-design-relationships, kb-styles, kb-graph). Open for P7 and the owner: see "Cutover" below.
- [ ] PR 5 opened and merged
- [x] P6 — learning (6a, 6b): 6a in the relations lane (`33e5f7b`); 6b in the wave-2 learning lane, merged in `596076e` (prerequisite card on 271 pages held by RT-2, status on hub chip, head meta, manifest and payload, level badge under the H1; maturity-O1 built half, prerequisites-C8). Open: the search UI does not show the payload's requires/related yet; prerequisites-C9's payload shape is an owner call.
- [ ] PR 6 opened and merged
- [x] P7 — noise, measured, on 2026-09-30 (not pushed; the owner dev-tests first). Search is a navigation index loaded on the box's first open: 5,926,303 → 679,464 bytes over 394 pages, budget 800,000 (`f8eeab2`). The sidebar shows the current branch: links 201,536 → 30,383, highest chrome ratio 79% → 65%, `CHROME_ALLOWLIST` empty, `CHROME_BAND` 0.7 (`84e931d`). Absence allowlists named and measured, the sidebar persister's two moved-out classics dropped; `MEASURE` and the null band are gone, so `make site-build` prints five gate lines with no "measure at P7". noise-O1: two builds, 450 files identical by SHA-256. Timings: `make site-build` 86–125 s warm, 108 s after `make site-clean`; `make site-e2e` 7.5 s; CI's 30-minute site job keeps its timeout. Open items: hub order in site-links (`e98d703`); tie-break in `rankItems` and floors raised on it (`03ad059`, `3f16a52`); search-synonyms gates and page (`879cfc1`); `make products` (`4826c39`); the glossary properties scope (`bb5d68c`). The dead `node scripts/*.mjs` allow entries: removed.
- [ ] PR 7 opened and merged
- [x] Every oracle scenario passes; round-trip record in `docs/records/`: on 2026-09-30 each of the 66 scenarios names its test and none is uncovered, in [the round-trip record](../docs/records/2026-09-30-migration-round-trip.md), with RT-1, RT-2, the decided losses and the P7 figures. The close-out added [Testing the site](../docs/concepts/testing-the-site.md), the owner's dev-testing walk; walking it found raw backticks in three hub descriptions (fixed in the structure file, with a `home-to-page` assertion) and a mistyped docs link that the build sends to GitHub past Site built links (the gate now checks every repository-file link). A docs sweep (`90131e1`) fixed all 32 claims its agents found false or incomplete and put the two owner calls they raised in `plans/backlog.md`. **The migration is done and awaits the owner's dev testing.**

Update this checklist in the same commit as the work it tracks.

## Done

Every phase, P0 to P7, is done on `harness/optimize` in the main checkout, and nothing is
pushed: origin answers 403 for this account, so the push goes to the `fork` remote and the PRs
cross-repo, both the owner's call after dev testing.

- **How it ran.** Wave 1, seven lanes (harness, content, vocab, relations, tags, kbcli, site),
  merged on 2026-09-28 and 2026-09-29; wave 2, four lanes (skills, authoring, learning, noise),
  merged on 2026-09-29; the cutover `5285b8a` on 2026-09-29; P7 on 2026-09-30. Each lane's
  script, findings and final report stay under `plans/wave1/` and `plans/wave2/`, and the
  `lane/*` and `lane2/*` branches keep their history. The kickoff prompts, once in this section
  and in `plans/finish-kickoff.md`, are gone: a kickoff prompt is printed in chat, never
  committed.
- **Where it stands.** `docs/` and `docs/data/` are the source. `make validate` runs 35 gates,
  `make site-build` prints five site-gate lines, `make site-e2e` runs 16 reader flows four ways,
  and `make gen` is idempotent.
- **The proof.** RT-1 and RT-2's last numbers, the decided losses, the P7 measurements and the
  test behind each of the 66 oracle scenarios are in
  [the round-trip record](../docs/records/2026-09-30-migration-round-trip.md).
- **Next.** The owner dev-tests by hand with
  [Testing the site](../docs/concepts/testing-the-site.md), then pushes and opens the PRs.
- **Settled at the merges**, kept as history: one owner for page status, the frontmatter gate
  (`check-maturity` retired in `9d0a57e`); one learning-path stage check, the learning-paths
  gate; `tone.md` keeps both the TONE ids and "Cut on sight"; every generator prints the shared
  `wrote <n> of <m> …` summary; the owner's wave-2 calls (the live hub's facets dropped, four
  tag refiles kept, `permissions.allow` for read-only and repo-script commands only).
- **Still open.** json-sanity prints V8's parse message for `not json` across two stderr lines
  (collapse whitespace in `tidy`, as `tools/src/lib/data-json.ts` does); the CLI's inflected
  top-1 sits at its 98.5% floor; `pages.yml` not yet dispatched by hand; the search box does not
  show a page's requires and related; the site lane's open owner questions, under the wave-1 site merge below.

## Wave-1 merges and cutover notes

Each lane merges into `harness/optimize` in the main checkout as soon as it is done
(`git merge --no-ff --no-commit lane/<lane>`), is regenerated with `make all` and `make gates`,
and is committed once `make validate` and `make check` are green. The owner's rule: no
worktree folders next to the repo; any worktree lives under `.claude/worktrees/`, and a lane's
`../patterns-kb-<lane>` folder is removed (clean, its head on `harness/optimize`) once the lane
is merged. The `lane/*` branches stay for their history.

**harness**, merged in `4967cbd` with no conflict; 15 gates green. Cutover notes:
- P5: once `make site-build` exists, drop the `# claim-ok` markers in page-audit, site-audit
  and site-component, and confirm the UNTRACKED rows for `site/dist/` and `site/.astro/`.
- P5: fold kb-verify into gate-red or re-scope it when `make check` and the HTML builders
  retire; drop gate-red's "Not for a legacy make check step … kb-verify" boundary and
  kb-verify's model-fresh / convert-fresh / RT-1 rows with it.
- P5: when `make all` becomes `make gen`, re-point the "kb.mjs validate --file then make all &&
  make check" advice in kb-design-requirements, kb-edit and kb-explain, as part of wave 2's
  re-point of the 46 skills.
- P5, from the plan: guard rows for `make all` → `make gen` and the retired build scripts;
  advisory cases for `site/dist` and `site/.astro`; delete `site/assets/CLAUDE.md` and both
  context-layers allowlist entries.
- `tone.md` is path-scoped to `site/**/*.html` and `docs/**/*.md`: drop the site glob at the
  cutover. Keep the TONE-001…009 anchors stable; style-pattern-doc links them.
- Keep `docs/data/allow/harness-shape.json` even while empty; the gate reports a missing list.
- The skill-shape baseline record finds its commit with `git log --diff-filter=A --
  docs/data/allow/harness-shape.json`. That survives a merge commit but not a squash merge:
  keep the lane's history when the PRs land.

**content**, merged in `7ab06d0`; 21 gates green. Conflicts in `validate.yml`, `gates.json`,
`oracle.test.ts`, `triage.md` and `docs/CLAUDE.md` were both lanes' rows, steps, cases and
sections side by side; `gates.md` and the triage blocks came from `make gates`. The merged
`docs/CLAUDE.md` ran 6 words over its 350 budget and was trimmed. `docs/README.md` gained the
`docs/records/` row here (harness truth-sweep-C9). The two `kb-design-*` skills are the harness
lane's versions (content finding 11). The lane recorded no cutover notes; its open items are
the P5 ones already listed under P3a.

**vocab**, merged in `134e2ce`; 24 gates green. Six skills the harness lane reshaped
(kb-design-sizing, kb-edit, kb-explain, kb-verify, style-simple, style-system-design) keep its
shape with vocab's plain-word swaps on top; `tone.md` merged clean, vocab's "Cut on sight"
paragraph beside the TONE ids. TONE-008 and TONE-009 stay "Decided by: review": the ban gate
bans only the glossary's avoid phrasings, not "robust", "scalable" or `<em>`. The model-fresh
row names all six extracted files. The glossary's Next steps footer gained its lead sentence
(PAGE-008 met the vocab generator only here). Cutover notes:
- `after-write.sh` `upstream_of()`: delete the `docs/data/glossary.json` case at P5, when
  glossary.json becomes the source; `check_stamped`'s normal note then holds. Update the bash
  block in `tests/hooks/after-write.test.sh` to match.
- `tone.md` "Cut on sight", and gen-vocabulary's intro: drop the PLAIN_WORDS / `make all`
  sentence and say to add the word to `docs/data/glossary.json`.
- `make check`'s `gen-vocabulary.ts --check` line moves wherever `make check` or `make gen`
  lands; the glossary-fresh row stays.
- RECORDED_FIELDS (`solves`, `aliases`) and `lib/allowlist.ts` `excusesFailures` stay.
- Still standing: delete `extract-vocab.ts`; rewrite the data-file notes and hook cases; give
  `make products` a new home; add a search-synonyms gate with its reference page; restamping
  becomes an edit of `expansionMeta`; the working-plans allowlist entry goes when it excuses
  nothing. The Astro site must not carry the build's "derived from" marker wording.

**relations**, merged in `33e5f7b`; 29 gates green, then 28 once `check-maturity` retired in
`9d0a57e`. The frontmatter gate owns page status (maturity-C1/C2) and gained the doubled-key
rule and the trailing-space / `#` comment reason on closed-list values; maturity-O1's gate half
is its test. learning-O1/O2 run over the frontmatter row; the tags lane's structure row joins
`learningRows` at its merge. `gen-map` and `gen-vocabulary` now print the shared
`wrote <n> of <m>` summary that generation-O2 reads from every generator. Cutover notes:
- Register gen-relations and gen-tours in one commit: move
  `tools/src/gen/pending/{gen-relations,gen-tours,blocks}.ts` and tests to `tools/src/gen/`, add
  rows relations-fresh and tours-fresh (with `--check`), workflow steps, triage sections and
  gates-O4 cases; add `make gen` running both, set `blocks.ts` FIX = 'make gen', point the
  oracle's `generators()` at `tools/src/gen/`.
- Once relations.json is the source, re-point "until the P5 cutover through node scripts/kb.mjs
  link and make all" to "edit docs/data/relations.json, then make gen && make prerequisites":
  gen-prerequisites `noteOf`, the prerequisites.md hook case and its bash assertions, the
  "Prerequisite graph holds" triage paragraph, the prerequisites row's fix.
- `headDate` / `dataDate` in `tools/src/lib/data-json.ts` are the dating helpers after the
  cutover; the copies in `convert-site.ts`, `extract-model.ts` and `updated.ts` retire with
  `tools/src/migrate/`.
- The relations gate replaces `scripts/audit-relations.mjs` and the relation checks in
  `scripts/build.mjs`; learning-paths replaces the TOUR/FLUENCY drift check. Delete the two
  legacy-comparison cases that read `site/assets/graph.json`; the neighbour-diagram-non-edges
  ledger entry retires with `tools/src/migrate/`. One stage check: the learning-paths gate
  owns it.
- `docs/data/allow/prerequisites.json` keeps one category entry (capabilities and comparisons
  as orphans), a recorded departure from exceptions-C8.
- `tools/src/migrate/roundtrip.ts` still spells out its own levels list; it retires with the
  converter.

**tags**, merged in `9960bbe`; 31 gates green. Verify and fix ran on 2026-09-28 (26 findings
fixed, 3 rejected; head `2828521`); its report is `plans/wave1/resume/tags-final.json`. Every page
carries exactly one topic, first, in facet order: 27 topics, 32 skills, 2 languages. Seven site
pages took the retag's `data-kb-tags` beside the earlier lanes' essence and solves edits. Settled
here: the learning-paths gate is the one owner of the stage check (structure-C5), so the
structure gate's copy and its tests went; `AREAS` gained `reference`; the glossary and
prerequisite pages carry a topic first; `gen-taxonomy` prints the shared summary. The owner's
calls the lane left open:
- The live hub's FACETS chips match fewer pages after the one-topic rule (Consistency 51→11,
  Observability 23→7, Scale 99→62, …): widen the chips or accept it until they retire with
  `build-hub.mjs` at the cutover.
- Confirm or revert four refiles: idempotency → resilience, adapter → low-level-design,
  service-layer → api-design, leaky-abstraction → modularity.
- distributed-monolith under anti-pattern means changing its hand-written kicker to
  "Anti-pattern" in the same edit, or RT-1 fails.
- 88 pages carry only 2 tags; an editorial pass may add honest skills. Not a blocker.

Cutover notes:
- The structure file's areas stay the first level of grouping; inside an area hub a topic shared
  by 2+ listed pages forms a group under its label (`topicOf()` in `tools/src/lib/tags.ts`).
- `docs/data/tags.json` becomes hand-edited source: retire TAG_FACETS, TOPIC_LABELS and TAG_DESC
  from `model.mjs`, the tags part of extract-model, tags-fresh in legacy `make check`, and the
  `docs/data/tags.json` line in `after-write.sh` `upstream_of()`. Adding a term then changes
  four files together (tags-C10).
- The TAGS and AREAS tuples stay one flat list of quoted ids, each once, in order; the gates fail
  anything else.
- Once the site lane's mirror writes into `site/src/content/docs`, only tracked files count for
  structure-C2/C4: mirrored output stays untracked or carries a whole-file stamp.
- The site merge must pick one reader for AREAS and TAGS: the schema imports them from
  `site/src/lib/types.ts`, or AREAS leaves `types.ts` and structure-C6 reads the site lane's list
  (`site-types.ts` reads tags.json and site-structure.json today). Then fix the four places that
  name the tuple's reader: the `types.ts` header, TYPES_FILE's comment in `published.ts`,
  `checkTuple`'s message in `check-tags.ts`, and gen-taxonomy's "Adding a term" line.
- kb.mjs v2's `set --tags` must enforce facet order and exactly one topic first; v1 checks only
  the closed set and 2–5 tags.
- `docs/data/allow/tags.json` is empty, as the cutover requires; the 3+-pages-per-tag rule still
  lives only in audit-vocab.

**kbcli**, merged in `c25c96d`; 31 gates green. Fix reused the saved 22 findings: 20 fixed
in 4 commits (`e5fb019`…`616d065`), the 5–50× slowdown rejected as a cutover note; its report is
`plans/wave1/resume/kbcli-final.json`. One conflict, `tools/src/lib/fixtures.ts`: both import
sets and both appended sections kept, one `}` added before REAL_TREE_TIMEOUT. Owed at the merge
and done: the decided entries `untagged-pages` and `long-descriptions` deleted with their
V2_ONLY rows (the tags and content lanes fixed both), the validate loop compares exit codes
plainly. Re-checked on the merged tree: `relevance.test.ts` CLI inflected top-1 98.5% (at its
0.985 gate, the same five misses), `KB_PARITY=all` green once the off-target `--kind pattern`
bound fell from 95% to 94.9% (measured 94.97% after the retag; the header says so), and
`tsx tools/src/kb/cli.ts validate` exits 0 with the facet rules live. Open: the inflected gate
has no margin (the site lane's scorer should add some); rich text in explain rungs is an open
surface call. Cutover notes:
- `scripts/kb.mjs` becomes a thin launcher to `tools/src/kb/cli.ts` (honours KB_ROOT). Measure
  speed first: v2 under tsx is 5–50× slower (find 0.4 s → 2.5 s); launch a built entry and cache
  frontmatter, mentions and the prose index in a build artifact, as v1 reads graph.json.
- Delete the tests that import `scripts/lib`: `parity.test.ts` (run once with `KB_PARITY=all` on
  the commit before the cutover), `spec.test.ts`'s cli-spec comparison, `rank.test.ts`'s
  search.mjs comparison. `relevance.test.ts` is then find's contract.
- `rank.ts` `loadSynonyms` reads `scripts/data/expansion-synonyms.json` and `scripts/lib/model.mjs`:
  point it at `docs/data/search-synonyms.json`, replace `rank()` with the site lane's shared
  scorer (RankInput → Scored[] kept) and re-measure relevance.
- The writers switch on once the pages lose their whole-file GENERATED stamp and the notes of
  relations.json, learning-paths.json and site-structure.json stop saying "GENERATED by".
- Re-point v1-surface call sites: `register` → `level` in `.claude/agents/kb-author.md:41,81`,
  `kb-explain/SKILL.md:25,162,222`, `html5-authoring.md:357`; `new --kind principle|design|theme`
  needs `--group <area>` and `--order` is the place in the area (`html5-authoring.md:486`,
  `kb-add/SKILL.md:55`, `kb-intake/SKILL.md:103`); `kb-explain/SKILL.md:91` is wrong (a new design
  scaffolds only required blocks).
- `after-write.sh`: the advisory case for `scripts/lib/cli-spec.mjs` becomes `tools/src/kb/spec.ts`.
- Drop `cli.ts` `pageOfFile`'s `site/` branch; link/unlink may call gen-relations and
  gen-prerequisites directly. `tools/src/kb/tags.ts` could call `check-tags.ts` `tagFindings`.

**site**, merged in `0d3da78`; 37 gates (33 in `make validate`, the site gates and RT-2 in
`make site-build` / `make site-roundtrip`). Fix reused the saved 37 findings: 29 fixed in 5
commits, 7 left as owner calls or later work; its report is `plans/wave1/resume/site-final.json`.
Fourteen conflicts, each lane's rows, steps, cases and sections kept side by side; the site
lane's `page-schema.md` and `rules.test.ts` taken; generated output regenerated. Settled here:
- kbcli's `rank()` wraps `rankItems` from `tools/src/lib/search-score.ts`; its index and term
  helpers are imports from it. Relevance unchanged (CLI inflected top-1 98.5%, at its gate),
  `KB_PARITY=all` green, no bound restated.
- One reader for AREAS and TAGS: `site/src/lib/types.ts` (the gates hold its flat tuples to the
  data files); `site-types.ts` re-exports them. AREAS gained `map`.
- `gen-search-index` fails without `glossary.json`; the payload carries 87 terms.
- Reference-area pages route under `/reference/` (`extract-reference.ts` `routeOf`); `pageRefs`
  and the mention index skip rows built from `site` or `generated` and pages rendered whole
  from `docs/data/`.

Open for the owner: kb:alias / kb:solves head meta on 366 pages (head-C1: keep, or move to
manifest and payload); hub controls inside the knowledge region (blocks-C9 approval); facet
chips show tag ids, not topic labels, and the Topic rail repeats the hub's topic groups; confirm
the concept pages' move to `/reference/…`; the search-synonyms third payload key (search-C1)
and the Term component. Later work: search payload 5.85 MB against 1.5 MB (P7); home page atlas
controls; block styling not carried; vocab.html stub; ~5 CORS console errors per page from
`file://`. Cutover notes:
- Add a fast mermaid-parse gate over `docs/**.md` fences when `scripts/check-mermaid.mjs`
  leaves; without it only the Chromium build catches a broken diagram.
- `pages.yml`: SITE_URL defaults to `https://odere-pro.github.io/patterns-kb/`
  (`site-output.ts` PUBLIC_ROOT); the post-build pass rewrites canonical, og:url and sitemap.
- Delete `site/src/lib/atlas.test.ts`'s git-read HTML anchor test, and the mentions test's
  "today's routes" filter with the graph.json comparison.
- Keep `GLOSSARY_JSON` in `site-fixtures.ts` and both sandboxes once glossary.json is source.
- The hand-edited structure file keeps reference pages in one folder with a hub (site-links C6);
  a new area changes the file and AREAS together.
- Keep the `pageRefs` / mentions skip rules when gen-relations and gen-tours register.
- RT-2 holds hub order within topic runs and skips only the dialect's three marked blocks.
- Both `parity.test.ts` expectations for `site/map/graph.html` go with `parity.test.ts`.

## Wave-2 merges and cutover notes

Four lanes from `plans/wave2/lanes.json`, run with `plans/wave2/kb-lane.js` in
`.claude/worktrees/lane2-<lane>`, each merged in the main checkout as it finished green. Each
lane's full report is `plans/wave2/<lane>-final.json`. A change true only after the cutover
waits in `plans/wave2/held/`: **the cutover commit applies `authoring.patch` and `skills.patch`,
then runs the `git rm` in `skills-retire.txt`.** If a later merge touches a patched file,
rebuild the patch (three-way: lane head → held copy → merged tree) rather than forcing it.

**Cutover rehearsal** (read-only, on `0710ea3`): `main` (`3f5c601`) is an ancestor, so nothing to
merge; `make all` rewrote nothing, RT-1, `make site-build` (435 pages), RT-2 (391 pages),
`make validate` and `make check` all green. RT-1 runs as `tsx tools/src/migrate/roundtrip.ts
[--base <rev>]` (no `G=roundtrip`, no `--built`; the built-site proof is `make site-roundtrip`).
Settle before the HTML goes: the converter's 8 notes — duplicate id `h-rel` on anemic-domain-model,
boat-anchor, god-object, golden-hammer and spaghetti-code; secure-logger's implemented-by
observability-platform (one-sided, doubled, two groups under one heading). Re-fetch `main` just
before the cutover.

**authoring**, merged in `74dab72`; 33 gates. `html5-authoring.md` → `markdown-authoring.md`
citing the page-rules ids, the HTML contract under "Until the cutover: the HTML source", every
link re-pointed. `permissions.allow` holds the owner's list; `harness-routes` now fails a command
a harness file names that is neither allowed nor on the prompt-kept list
(`tools/src/lib/permissions.ts`, table in `docs/concepts/working-in-this-repo.md`). Fixed at the
merge: `parity.test.ts` and `write-tree.test.ts` walked into `.claude/worktrees/`. Cutover notes:
- Apply `authoring.patch`: the docs-as-source rule, tone.md without the site glob and with
  "Cut on sight" → glossary.json, page-schema.md's scope, rules.test.ts's scope, root CLAUDE.md's
  `#the-html-separation` → `#the-separation`. The close-out rewrites root CLAUDE.md's
  "class is presentation; data-kb-* and JSON-LD are data" sentence.
- A new command spelling (kb.mjs v2 as `npx tsx …` / `node tools/…`) in a skill or layer turns
  harness-routes red: add an allow entry (owner) or a prompt-kept row with its doc row.
- Owner questions: allow `head` (only page-audit uses it); `Bash(bash tests/run.sh:*)` instead of
  the exact form. `find:*` and `sort:*` keep their write flags, recorded as accepted risk.

**learning**, merged in `596076e`; see P6 above. No held patch. Cutover notes:
- RT-2 retires with `tools/src/migrate/`; then `prerequisite-card.render.test.ts`, the
  prerequisites-C8 scenario and the site-absence/site-links gates hold the card. Consider moving
  `compareCard` / `expectedCards` into a site gate.
- `learningPresent()` keys on `docs/data/learning-paths.json` / `prerequisites.json`
  (`LEARNING_FILES` in `site/src/lib/learning.ts`): rename either and status silently turns
  optional.

**skills**, merged in `a72d310`; 33 gates. Committed now: reading through `docs/**.md`, the
glossary and tag references, `make site-build` claims without `# claim-ok`. Held (`skills.patch`,
55 files, rebuilt at the merge against the authoring lane's links; applies plainly): `make gen`,
docs/ as source, v2 writer flags, the successors of the four retired skills. Cutover notes:
- After the patch, `git rm` the four skills (`skills-retire.txt`) and drop their names from root
  CLAUDE.md, `docs/concepts/skill-routing.md`, `scripts/CLAUDE.md:34`, `site/CLAUDE.md:37`, or
  repo-links fails; harness-shape then counts 48 skills. The patch names `make gen`, so the gen
  target lands in the same commit or the claims gate fails.
- Before `git rm scripts/*.mjs`: port or drop report-lens, report-links, report-vocab,
  report-variation-links, check-mermaid-file and `make highlight` (lines kept unchanged in the
  patch: kb-explain, kb-design-review, the *-blocks skills, kb-vocab, sys-design, kb-sketch).
- Keep node-html-parser in tools/package.json (held fetch.mjs loads it); the held eval-check.mjs
  reads content-model.json and tags.json.
- Owner calls: fold kb-styles and kb-graph into site-component or not; the route policy for moving
  a page between areas; hand edits of note_a/note_b in relations.json; backlog the lost claim
  colouring and the graph explorer's query language, groups and force sliders.

**noise**, merged in `9ee1d17`; 33 gates in `make validate`, and `make site-build` now prints
five site-gate lines (links, portability, site-accessibility, site-absence "Site noise and data
layer", site-axe), all green on 435 pages. P7's copy half: `site-format` as the last post-build
step, the absence gate's noise half (`tools/src/lib/site-noise.ts`), `check-site-a11y`,
`check-site-axe` (axe-core + playwright-core, install scripts denied), `site-shots`
(`make site-shots OUT=…`), the page-audit reader `tools/src/site/page-read.ts`, next-steps cards
and focusable tables in the post-build pass. No `check-site-bundles` gate: its checks are the
absence gate's noise half, so the spec's five site gates hold. Fixed at the merge: the
prerequisite card's label (4.48:1 in dark → gray-2) and maturity-O1's chip and badge checks,
which the formatter now splits across lines. No held patch. Cutover notes:
- Keep `/dist/` and its reason in `site/.prettierignore` when the cutover rewrites it.
- `NOSCRIPT_STYLE` stays equal to the `<noscript>` line in `Head.astro` (a test holds them).
- An Astro or Starlight upgrade that renames a chunk fails site-absence: re-audit and add the
  entry with its reason, never widen a pattern.
- After the cutover, re-run noise-O1 on the real site: two `make site-build` runs, `diff -rq`.
P7 measures: the absence allowlists in `site-noise.ts` (15 distinct things seen today),
`CHROME_BAND` in `check-site-a11y.ts`, the search index (5.86 MB against 1.5 MB), and CI's
30-minute site-job timeout (`make site-build` takes 3.5-7 min; axe about 110 s). Owner calls:
`CHROME_ALLOWLIST` ships 33 hub and map pages (the spec says empty; the root fix is a sidebar
showing only the current branch, and hubs at 79% tip over the 80% cap as pages are added); the
four upstream module scripts that run only over HTTP; point the page-audit skill at
`page-read.ts`.

**Owner calls for the cutover, 2026-09-29:** go (no other session edits `site/`); drop the
report-* worklists (report-lens, report-links, report-vocab, report-variation-links),
`check-mermaid-file` and `make highlight` with `scripts/*.mjs`, dropping the skill steps that call
them, and add the fast mermaid-parse gate over `docs/**.md` fences; retire kb-styles and kb-graph
into site-component; keep `CHROME_ALLOWLIST`'s 33 entries through the cutover and empty it at P7
with a sidebar that shows only the current branch.

## Cutover

Done on 2026-09-29 in the main checkout, on `harness/optimize`. PRE is `f28ff7d`; the cutover
commit is `5285b8a`. Final RT-1, before `tools/src/migrate/` was deleted:
`roundtrip.ts --base f28ff7d` on the unstamped tree gives exactly 764 findings, 382 `stamp` and
382 `source` (the D-13 drop, nothing else); on the tree before the stamps went it gives
`[roundtrip] 382 pages round-trip against f28ff7d: 19873 ids, 1473708 words across three
lenses, 2600 relation sides; 3709 decided losses applied`. `KB_PARITY=all` on PRE: 19 tests
green over 382 pages. kb.mjs: `find` 0.35 s (v1) → 2.1 s (v2 under tsx, cold) → 0.38 s (warm,
prose cached in `node_modules/.cache/kb/`); `get` 0.05 s → 0.19 s; `backlinks` 0.04 s →
0.41 s warm.

Every cutover note, and what became of it:

- **Converter's eight notes** (duplicate `h-rel` on five hazards; secure-logger's doubled
  implemented-by): done in `bf40a22`; the report lists no problem, the ledger entry and the
  parity special cases retired.
- **Last converter run with no stamp and no `source`** (D-13): done, by stripping both lines
  from the converter's output (the converter's own output was fresh on PRE).
- **Apply authoring.patch and skills.patch, then skills-retire.txt**: done (`git apply`,
  `git apply -3`); kb-styles and kb-graph retired with them, folded into site-component's
  `references/shared-styles.md` and `references/graph-explorer.md` (in the cutover commit,
  not before, because the held patch edits both files).
- **Drop the report-* worklists, check-mermaid-file and `make highlight`** (owner call): done;
  the skill steps now read the lens by eye or use `kb.mjs find`/`refs`; sys-design uses
  `make gate G=check-mermaid ARGS=<file>`.
- **Fast mermaid-parse gate** (site note): done, `mermaid-parse` (`check-mermaid.ts`), all
  five pieces, in `f0d989d`/`f28ff7d`.
- **Register gen-relations and gen-tours; `make gen`; blocks FIX; oracle generators()**
  (relations note): done; rows `relations-fresh`, `tours-fresh`, workflow steps, triage
  sections and gates-O4 cases.
- **Re-point the relations wording** (gen-prerequisites note, hook case, triage, the row's
  fix): done.
- **Data files become hand-edited sources** (tags, vocab, relations, kbcli notes): done for
  all eight; notes rewritten, `updated` moved; the advisory's upstream cases gone.
- **kb.mjs launcher, speed, synonyms, writers switch on, v1 call sites, pageOfFile's site
  branch** (kbcli notes): done; the launcher registers tsx in-process; `rank.ts` reads
  `docs/data/search-synonyms.json`; the writers refuse only a stamped page or a data file
  whose note says GENERATED (today only `prerequisites.json`). **Open:** link/unlink could
  call gen-relations and gen-prerequisites directly (optional; they print `make gen`).
- **Delete the tests that import scripts/lib** (parity, spec's cli-spec comparison, rank's
  search.mjs comparison) and the site tests the site note names (atlas git read, mentions
  graph comparison) and the two legacy-comparison cases: done.
- **Advisory cases** (glossary and tags upstream, cli-spec → spec.ts, site/dist and
  site/.astro): done; **guard rows** `make-all` and `retired-builder`: done, with tests.
- **Pre-commit hook's docs/ trigger**: done; it now runs the driver's `--changed` mode on
  the staged tree (every gate when a path is deleted). Deviation: the cutover commit itself
  went in without it — the hook's `git diff | grep -q` under pipefail exits 0 early on a
  long list (a bug the HTML-era hook had too). **Incident:** validating HEAD's tree by hand
  with `GIT_DIR`/`GIT_WORK_TREE` exported let the vitest sandboxes act on this repository's
  `.git` (HEAD moved to a new `orphan` branch, `harness/optimize` to a sandbox commit
  `68983d9`, a `work` branch, local `core.worktree` and `user.*`, the index). The committed
  hook exported the same variables, so it would have done this on any commit touching
  `tools/`. The working-tree hook now gives the extract a throwaway repository instead; the
  refs and config were repaired on 2026-09-30, and `1edb8d3` landed the hook fix with
  `tools/src/lib/git-env.ts`, which vitest loads first to drop `GIT_DIR`, its kin and the
  author/committer identity git hands its hooks.
- **`make check`**: an alias of `make validate`.
- **pages.yml**: builds with `make site-build`, uploads `site/dist`, SITE_URL defaults from
  `site-output.ts`. **Open:** not yet dispatched by hand, as workflow-edits.md asks.
- **Delete the HTML-era briefings, site/assets/CLAUDE.md, both allowlist entries**: done.
- **Harness notes** (claim-ok markers, UNTRACKED rows, kb-verify fold, `make all` advice,
  tone.md site glob): done, by the held patches and the cutover commit.
- **Root CLAUDE.md** migration note and the separation sentence: rewritten (558/600 words).
- **headDate/dataDate, TAGS/AREAS tuples, allow/tags.json empty, GLOSSARY_JSON, pageRefs
  skip rules, LEARNING_FILES, NOSCRIPT_STYLE, `/dist/` in .prettierignore, harness-shape
  allowlist kept**: unchanged, as the notes ask.
- **noise-O1 on the real site**: done, two `make site-build` runs, `diff -rq` empty.

Deviations: `tools/src/migrate/dialect.md` moved to `tools/src/lib/dialect.md` rather than
retiring, since 30-odd modules cite its rule numbers; the stack index's product linker was
ported into `tools/src/lib/site-map.ts` over `products.json` (it imported
`scripts/lib/products.mjs`); `data-kb-neighbours` gained a site-hooks allowlist entry (RT-2
was its only reader); the root and README page counts are literal now (nothing fills the
`kb:counts` markers); `.claude/settings.json` still allows the retired `node scripts/*.mjs`
commands — dead entries, left for the owner, since this change edits no permission.

Open for P7 and the owner, and what became of each (P7, 2026-09-30):
- **Done:** `make products` — `check-products.ts --online`, a manual target, never a gate
  step (it needs the network); one run: 143 distinct URLs, every one answering (`4826c39`).
- **Done:** the search-synonyms gate and reference page — `search-synonyms` holds the key
  rules, `search-synonyms-fresh` renders `docs/reference/search-synonyms.md` (`make synonyms`,
  in `make gen`), five pieces each (`879cfc1`). The data file's note said the site build puts
  the table in the payload; it never did, and now says so.
- **Done:** hub order within a topic run — site-links fails a hub group listing its area's
  pages out of reading order; 41 hubs checked (`e98d703`).
- **Done:** the glossary's `properties` scope — `Head.astro` writes a schema.org TechArticle
  and none of the seven `kb:` properties; the scope now says where each fact lives
  (`bb5d68c`).
- **Partly done:** the relevance margin. `rankItems` breaks a tie by fewer facts, then id
  (`03ad059`): CLI verbatim 98.8 → 99.1, facts-only 99.1 → 99.4, the box's verbatim and
  inflected 99.1 → 99.4; floors raised on that. **Open:** the CLI's inflected top-1 still
  measures exactly its floor (98.5%, 335 of 340); its five misses are not ties.
- **Done, on the owner's approved plan:** the 18 allow entries for retired
  `node scripts/*.mjs` programs are gone from `.claude/settings.json` and from the list
  `check-harness-routes.test.ts` pins. `head` and `bash tests/run.sh:*` unchanged.
- **Done:** the noise lane's calls — `CHROME_ALLOWLIST` empty with a current-branch sidebar;
  `CHROME_BAND` 0.7, measured; the search payload budget 800,000, measured. The four
  HTTP-only upstream module scripts stay, each with its reason (the Sidebar override
  removes none of them: `Page.astro` imports the persister whatever it renders).

## Picking up on another machine

`main` was force-pushed on 2026-09-23 (work email scrubbed from history). A clone older
than that must not push its old `main`.

```bash
git fetch origin
git switch harness/optimize   # or: git switch -c harness/optimize origin/harness/optimize
git config core.hooksPath .githooks
npm ci                        # from P0 on
```

An old clone's local `main` should be reset: `git switch main && git reset --hard origin/main`.

Then tell the new Claude session: "Read `plans/harness-optimize.md` and continue from its
Status. The spec is at `/Users/oleksandrderechei/git/claude-code-marketplace/tmp/cookbook/spec/`;
the reference implementation to copy from is `…/cookbook/kit/`."
