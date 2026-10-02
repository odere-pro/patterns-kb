# Migration round trip

On 2026-09-30 the markdown migration is done: the 382 pages under `docs/` and the data files in
`docs/data/` are the source, and the Astro site is built from them. This record keeps the
numbers that proved nothing was lost on the way from the HTML pages (RT-1 and RT-2), the losses
decided on purpose, the P7 measurements, and which test covers each acceptance scenario of the
spec. The round-trip programs retired with `tools/src/migrate/` at the cutover (`5285b8a`), so
the figures below are the last ones they printed; the commits named hold them.

## RT-1: the markdown against the HTML pages

RT-1 (`tools/src/migrate/roundtrip.ts`) read `docs/` and `docs/data/` back into the graph the
HTML site carried and compared it, node by node and relation by relation, with the prose of
every page, block and lens compared word by word.

| Run | Pages | Ids | Words, three lenses | Relation sides | Decided losses |
| --- | --- | --- | --- | --- | --- |
| P2, first green (`c8dbce4`) | 382 | 19,873 | 1,473,482 | 2,599 | 3,718 in 14 ledger entries |
| Final, `--base f28ff7d`, before the stamps were stripped | 382 | 19,873 | 1,473,708 | 2,600 | 3,709 |

The final run on the unstamped tree gave exactly 764 findings: 382 `stamp` and 382 `source`,
the two lines every converted page lost on purpose at the cutover (dialect D-13), and nothing
else. `KB_PARITY=all` on the same commit: 19 tests green over 382 pages. Each of the verifier's
39 mutations of the real tree turned RT-1 red.

## RT-2: the built site against the markdown

RT-2 (`tools/src/migrate/roundtrip-built.ts`, run as `make site-roundtrip`) read what a machine
reader reads in `site/dist/` (the manifest, the head, the article data block, the section
facts) and compared each page's words per block and lens, its fences and its ids with `docs/`.

| Run | Pages | Result |
| --- | --- | --- |
| First green over the real site (`ca148df`) | 382 | 21,340 ids, 1,473,482 words, 848 fences; no finding, no decided loss |
| After the prerequisite card (`596076e`) | 391 | green, 271 prerequisite cards held |
| Cutover rehearsal (`0710ea3`) and PRE (`f28ff7d`) | 391 | green |

Planted in a copy of the site, a changed word, a dropped lens, a changed page fact, a changed
polarity and a wrong card title each turned it red. Its first runs found two real defects,
fixed in `8ce02da`: the section pass writing into code samples, and the manifest losing
no-break spaces.

## Decided losses

Each was reported by the converter, decided, and counted by RT-1's ledger
(`tools/src/migrate/known-losses.json`), never guessed. From P2:

- **Hand-drawn neighbour diagrams** (137, plus 2 with non-edges): the site draws them from
  `docs/data/relations.json` instead (D-58).
- **Ids with no markdown element**: 3,443 block-heading aria ids and 17 prose-wrapper ids (D-72).
- **Header text the template drops**: hazard kickers (6), theme kickers (25), theme subtitle
  badges (10), stale pattern kickers (4) (D-70).
- **Hand-kept reading trails and prev/next links** that left the structure order: theme trails
  (33), a hazard trail (4), pattern prev/next drift (33) (D-70). The pager now follows the
  structure file.
- **Band order**: the distributed band interleaved its five group areas; the structure file
  groups them (X-19).
- **Source defects**: `secure-logger`'s duplicate row (2) and a stale relationship link text on
  `deadlock` (1). Both retired from the ledger when the converter's eight notes were fixed in
  `bf40a22`, which is why the final count is lower.

Outside the ledger, decided in the plan: relation item order (compared as a set); paint-only
classes (`.smell`, `.subline`, `.outofscope`, `diagram wide`; their text kept); crumb, kicker,
badges and prev/next as chrome; 30 hand-written `-h-` ids nothing linked to; captions with
markup; links to targets that would not exist. At the cutover: each page's converter stamp and
`source` key (D-13), and the report-* worklists, `check-mermaid-file` and `make highlight`
(owner call), whose job the mermaid-parse gate and `kb.mjs find` and `refs` took over.

## P7 measurements

- **Search payload**: a navigation index loaded on the search box's first open, 5,926,303 →
  679,464 bytes over 394 pages, budget 800,000 (`f8eeab2`). On 2026-09-30: 680,282 bytes, 395
  pages, 87 terms.
- **Sidebar**: shows the current branch only; links across the site 201,536 → 30,383, highest
  chrome ratio 79% → 65%, `CHROME_ALLOWLIST` empty, `CHROME_BAND` 0.7 (`84e931d`).
- **noise-O1**: two builds, 450 files identical by SHA-256.
- **Timings**: `make site-build` 86–125 s warm and 108 s after `make site-clean`; `make
  site-e2e` 7.5 s; `make validate` about 150 s.
- **Relevance**: with `rankItems`' tie-break the box's top-1 is 99.4% on symptom lines as
  written; the CLI's inflected top-1 sits at its floor, 98.5% (`03ad059`, `3f16a52`).

## Oracle coverage

Every scenario in the spec's acceptance oracle (`spec/acceptance/oracle.md`, 66 scenarios, 23
of them optional) has a test that runs in `make validate` (the vitest and bash suites) or in
`make site-build` (the site workspace's suite). None is uncovered. Each row names one test;
where a scenario has two halves, both are named.

| Scenario | Test (file › name) |
| --- | --- |
| content-O1 | `tools/src/gates/check-docs-map.test.ts` › content-O1: no owner, an H4 on line 9 and no map row: the frontmatter, shape and map gates each exit 1 with their one finding |
| content-O2 | `tools/src/gates/check-docs-map.test.ts` › content-O2: repaired, plus one exercise, the three gates each exit 0 with one summary line; the shape gate skips the exercise |
| content-O3 | `tools/src/gates/check-repo-links.test.ts` › content-O3 › the rules page with one anchor per row passes; a copy that lost one fails on the line citing it |
| docs-map-O1 | `tools/src/gates/check-docs-map.test.ts` › docs-map-O1: C is the one finding; deleting A, then B, gives one finding each, on the map and the hub; the layer never appears |
| frontmatter-O1 | `tools/src/gates/check-doc-frontmatter.test.ts` › frontmatter-O1: A lacks owner, B has two names, C writes its tags as a block list — exactly three findings |
| page-shape-O1 | `tools/src/gates/check-docs-style.test.ts` › page-shape-O1: an H4 on line 12 fails PAGE-002 there; four backticks hide a #### sample until it moves out |
| data-O1 | `tools/src/gen/gen-taxonomy.test.ts` › data-O1 › every data file parses and opens with its header; every gate reading one and every freshness check exits 0; each reference page opens with its stamp |
| data-O2 | `tools/src/gen/gen-taxonomy.test.ts` › data-O2 › one fact edited in a clean tree changes only its data file and its rendered page, every gate reading it exiting 0 |
| data-O3 | `tools/src/oracle.test.ts` › data-O3: a data file replaced by non-JSON — the whole set exits 1, the validity gate and its reader naming it |
| exceptions-O1 | `tools/src/gates/check-test-colocation.test.ts` › exceptions-O1: plant, excuse, blank the reason, then an entry left behind |
| glossary-O1 | `tools/src/gates/check-vocabulary.test.ts` › glossary-O1 › three data faults, three findings naming their terms; repaired, one prose finding at line 3 |
| learning-paths-O1 | `tools/src/gates/check-learning-paths.test.ts` › learning-paths-O1 › slashed routes: an unserved stage and one missing its trailing slash are one finding each; exact, it passes |
| source-file-O1 | `tools/src/gates/check-json.test.ts` › source-file-O1: a committed line-3 error and an uncommitted truncated file, nothing about the valid one |
| structure-O3 | `tools/src/gates/check-site-structure.test.ts` › structure-O3 › reports each planted fault in one run, the unknown area against the closed area list, and builds nothing |
| tags-O2 | `tools/src/gates/check-tags.test.ts` › tags-O2 › a term added to the list only is two findings; added to the tuple too, the dead member alone; narrowed to one page, clean |
| generation-O1 | `tools/src/gen/gen-gates.test.ts` › generation-O1: an appended page line and a changed block number are each STALE; the repair clears both |
| generation-O2 | `tools/src/gen/gen-gates.test.ts` › generation-O2: after a run, a second run changes no byte and the check exits 0 |
| generation-O3 | `tools/src/gen/gen-gates.test.ts` › generation-O3: three outputs of one data file, each hand-edited, each STALE with one repair |
| marked-blocks-O1 | `tools/src/gen/gen-gates.test.ts` › marked-blocks-O1: three records, a stale line between markers, prose kept, the paragraph states 3 |
| mirror-and-hubs-O1 | `tools/src/site/gen-site-docs.test.ts` › mirror-and-hubs-O1: frontmatter kept byte for byte, the H1 gone, a page link a route, a script link the repository URL, the code span untouched |
| output-ownership-O1 | `tools/src/site/gen-site-hubs.test.ts` › output-ownership-O1: an unstamped hub and a hand-written page keep their bytes with one note; a stamped hub loses its extra last line |
| write-or-check-O2 | `tools/src/lib/generated.test.ts` › write-or-check-O2: a hand-appended line is STALE with the real path and command, then repaired |
| gates-O1 | `tools/src/oracle.test.ts` › gates-O1: a gate with all five pieces is green; removing any one turns the whole set red |
| gates-O2 | `tools/src/oracle.test.ts` › gates-O2: a finding from the gate alone, from the whole set and from its row’s command is one line |
| gates-O3 | `tools/src/oracle.test.ts` › gates-O3: one row added — the sync gate names the missing CI step, triage section and stale total |
| gates-O4 | `tools/src/oracle.test.ts` › gates-O4: every registered row’s program exits 2 on --nope, 1 on a planted problem, 0 when clean |
| gates-O5 | `tools/src/oracle.test.ts` › gates-O5: the repair run clears the fixable problem only; the whole set then reports the other |
| contract-O1 | `tools/src/gates/check-json.test.ts` › contract-O1: a registered gate is one line when clean, two matched findings for two planted files |
| driver-O1 | `tools/src/run-gates.test.ts` › driver-O1: every finding in registry order, narrowing by the merge base, repair ignoring change, misuse starting nothing |
| link-integrity-O1 | `tools/src/gates/check-repo-links.test.ts` › link-integrity-O1 (the repository half)<br>`tools/src/gates/check-site-links.test.ts` › link-integrity-O1 (the built-site gate) |
| registry-O1 | `tools/src/gates/check-gates-sync.test.ts` › registry-O1: a consistent row passes; a workflow-only step rename gives two findings on the workflow file |
| testing-O1 | `tools/src/gates/check-test-colocation.test.ts` › testing-O1: a new module fails, an entry clears it, a deleted hook test fails naming the hook |
| harness-O1 | `tools/src/oracle.test.ts` › harness-O1: one planted defect per harness surface — each of the five gates names its own file |
| harness-O2 | `tools/src/oracle.test.ts` › harness-O2: the defects removed, the whole set exits 0 with one summary line per gate; each alone on --nope exits 2 |
| harness-O3 | `tests/hooks/guard-commands.test.sh` › the "== harness-O3 ==" section |
| context-layers-O2 | `tools/src/gates/check-claude-md.test.ts` › context-layers-O2 › a copied 60-character line, a dropped heading and a web-only link: three findings on the layer |
| hooks-O1 | `tests/hooks/after-write.test.sh` › the "== hooks-O1 ==" section |
| scoped-rules-O1 | `tools/src/lib/rules.test.ts` › scoped-rules-O1 › the core rules plus a plant with a description and no paths: exactly the plant is reported, by name |
| self-check-O1 | `tools/src/oracle.test.ts` › self-check-O1: a valid skill is green; an unlisted folder and a skill with no trigger or boundary each give one finding |
| skills-and-agents-O1 | `tools/src/gates/check-harness.test.ts` › skills-and-agents-O1: the claim verifier holds exactly Read, Glob and Grep; a shell tool is one finding naming it |
| skills-and-agents-O3 | `tools/src/gates/check-harness.test.ts` › skills-and-agents-O3: the triage agent states its five answers; deleting that reply is one finding naming it |
| trap-inbox-O2 | `tools/src/gates/check-inbox.test.ts` › trap-inbox-O2 › 21 two-line entries, the fifth of 9 lines, then a plain bullet: three findings, stdout empty |
| truth-sweep-O1 | `tools/src/gates/check-claims.test.ts` › truth-sweep-O1 › a real target, a missing target, a nonexistent gate and a missing path: three findings, the repeats draw nothing |
| site-O1 (optional) | `tools/src/site/site-build.test.ts` › site-O1: each route is one HTML file, no link or source starts with a single slash, and kb.js loads once, classic, with no search payload until the box asks for it |
| site-O2 (optional) | `tools/src/site/site-build.test.ts` › site-O2: a page naming an area outside the closed list stops the build at the page-facts check, naming the file under docs/ and the key, and no site gate prints |
| site-O3 (optional) | `tools/src/site/site-build.test.ts` › site-O3: clean deletes ignored output only, keeps every installed package and the browser, and the next build downloads nothing |
| build-command-O1 (optional) | `tools/src/site/site-build.test.ts` › build-command-O1: from nothing built, lint, unit tests, pre-build, the typecheck and the generator, post-build, then the site-gate lines; the build step alone, in a copy, leaves the same site |
| components-O1 (optional) | `site/src/client/index.test.ts` › components-O1: a colour leaks and moves back, a ghost hook is named, a throwing start function stops no other |
| offline-O1 (optional) | `tools/src/site/site-sandbox.test.ts` › offline-O1: after a real build, the home page and a page one folder down are real files at their routes, link each other relatively, every link resolves on disk, and the portability gate exits 0 |
| pagedata-O1 (optional) | `tools/src/site/site-sandbox.test.ts` › pagedata-O1: one page’s level, area and two tags reach its head, its article block and its index entry — and a level changed in its frontmatter reaches all three on the next build |
| blocks-O1 (optional) | `tools/src/site/site-portable.test.ts` › blocks-O1: a stale body fact, a heading, a section fact, a paragraph and a second heading — one class-free article with the four facts holding one section that closes before the second heading; a second run changes no byte |
| head-O1 (optional) | `tools/src/site/site-sandbox.test.ts` › head-O1: a page with a closing script tag in its description and no status — each head fact once, one structured-data block with no `<` in its text, the page-tree file’s commit date; with no version control, no date and still exit 0 |
| manifest-O1 (optional) | `tools/src/site/site-portable.test.ts` › manifest-O1: a site with no manifest — one JSON file at its root holding a generator and a page list, home first, titled by its headline, headed by the H2 and the id-less H3, never the deeper |
| search-O1 (optional) | `tools/src/site/site-sandbox.test.ts` › search-O1: three ordinary pages beside one hub — the payload, loaded with no network, carries exactly the three, the row with a row header and not the one without, each page carrying facts and no prose |
| two-layers-O1 (optional) | `tools/src/gates/check-site-absence.test.ts` › two-layers-O1: a classed element with a fact, then a data block with a foreign attribute — each page alone fails once, and passes once fixed |
| noise-O1 (optional) | `tools/src/site/site-build.test.ts` › noise-O1: after one build, a second run of the passes and the formatter changes no byte, and the fixed-point check, the absence gate and the static accessibility gate exit 0 |
| absence-gate-O1 (optional) | `tools/src/gates/check-site-absence.test.ts` › absence-gate-O1: two formatted pages with one classic kb.js and one article block each pass with a count of 2; a module bundle tag fails, naming the page and the bundle |
| accessibility-O1 (optional) | `tools/src/gates/check-site-a11y.test.ts` › accessibility-O1: a planted page gives at least six findings, all on it, beside a clean page; removing the defects exits 0 |
| formatter-O1 (optional) | `tools/src/site/site-format.test.ts` › formatter-O1: the skip link gets its text on its own line, inline code keeps its full stop, and a second run rewrites nothing |
| page-audit-O1 (optional) | `tools/src/site/page-read.test.ts` › page-audit-O1: two findings — the prose element’s fact and the data block’s foreign attribute; the blocks are the article and that element, never the header |
| post-build-O1 (optional) | `tools/src/site/site-build.test.ts` › post-build-O1: Alpha’s next step is one card inside the article block, Gamma’s list stays as written; nothing in either article is skip-marked, every landmark outside is |
| learning-O1 (optional) | `tools/src/oracle.test.ts` › learning-O1: both children built — each gate and the reference check exit 0 with one line and no stderr; the page regenerates byte for byte |
| learning-O2 (optional) | `tools/src/oracle.test.ts` › learning-O2: a cycle in the graph and one page without its status line — the whole set exits 1, exactly two findings, one per file |
| learning-O3 (optional) | `tools/src/gates/check-prerequisites.test.ts` › learning-O3 › a stable page requiring a draft one is one finding naming both; with no status declared the graph alone passes |
| maturity-O1 (optional) | `tools/src/gates/check-doc-frontmatter.test.ts` › maturity-O1 (the gate half): one page with its status deleted, one with a value outside the list — two findings naming status; --fix writes only the placeholder, never a value, and still exits 1<br>`tools/src/site/site-sandbox.test.ts` › maturity-O1 (the built-site half) |
| prerequisites-O1 (optional) | `tools/src/gates/check-prerequisites.test.ts` › prerequisites-O1 › a cycle, a missing record and an unpublished route: exactly three findings, stdout empty; --fix exits 2 changing no byte |
