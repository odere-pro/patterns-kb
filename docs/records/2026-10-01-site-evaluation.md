# Site evaluation and fix pass

On 2026-10-01 the knowledge base and its site were evaluated on seven dimensions, and the
findings were fixed in the same pass, in the commits `d64057a..HEAD` on `harness/optimize`. One
Sonnet worker scored each dimension against the tree and the built site; the main session
checked each claim it acted on, ran the gates and judged the fixes. This record keeps the
scores, the measurements and what was left for the owner. The numbers are true on its date.

## Scores at the start

| Dimension | Score | What held it down |
|---|---|---|
| Performance | 4 of 5 | No budget gate, no stated hosting rules, an unminified `kb.js`, scripts that fail from disk |
| UI | 3 of 5 | Justified lines of 100 to 122 characters, diagrams and wide tables unreadable on a phone |
| UX | 3 of 5 | No 404 page, "Practiced" never explained, no menu or theme toggle on the phone home page |
| Testability | 3 of 5 | 16 reader flows at two widths; no deep-link, outline, diagram or keyboard-search flow |
| Data accuracy | 4 of 5 | 8 wrong facts in 30 sampled pages, all in vendor-facing blocks |
| Data richness | 4 of 5 | 86 of 216 patterns on no tour, thin relation graph, about 60 expected pages missing |
| Ease of learning | 3 of 5 | Tours ran against their own prerequisites; no levels, tracks or self-check |

## What the owner asked for first

- **`solves`.** Each phrase is one problem, problem first, in at most 20 words; the shape gate
  and `kb.mjs set` both refuse a longer one. Of 1,667 phrases 33 were over the cap; about 135
  were rewritten in all, counting the vague ones and the product-choice questions on the
  comparison pages. A cold reader on the small model matched 148 of 160 sampled phrases to the
  right page among five (92.5%) and rated 151 clear; the six pattern phrases it missed were
  sharpened. On the 27 pages written later it matched 117 of 117.
- **Saved state.** Favourite and Practiced already survived a reload. Added: hub filters in the
  URL, no flash of the unpressed state, an in-memory fallback when storage throws, a My marks
  page with export, import and reset, and a gate that fails two published pages sharing a file
  name, the key the marks are stored under.
- **Trade-offs and When to use.** Two tinted cards: green with a check for pro and when, red
  with a cross for con and avoid, a small label for the heading, and a bold lead on each of the
  3,304 items of the pattern pages. About 135 leads that a script had cut mid-clause were
  reworded.
- **Skills and agents.** The 46 skill descriptions ran to about 31.6k characters and the
  harness listing dropped 21 of them; they now total about 15.6k, each at most 350. The
  harness-shape gate holds the cap, the total, strict-YAML quoting and `.md#` citations. Four
  agents run on Sonnet and the three design critics on Opus.

## Fixed, by dimension

**Data accuracy.** All 8 findings: DynamoDB removed from the LSM-tree examples (its paper
describes a B-tree), Aurora DSQL and Azure Managed Redis in the cloud mapping, Kafka without
ZooKeeper, the broker deduplication window, Dragonfly Cloud, the Bigtable note, and the payment
sizing arithmetic (430 GB a day, 160 TB a year).

**Data richness.**

| Measure | Before | After |
|---|---|---|
| Pages | 382 | 418 |
| Patterns on no tour | 86 of 216 | 0 of 234 |
| Themes | 42 | 51 |
| Typed relations | 1,300 | 1,503 |
| Patterns with no production block | 36 | 2 |
| Patterns with no real-world block | 15 | 2 |

The 27 new pages are 18 patterns, 5 hazards and 4 principles. 33 pages gained aliases or a
third tag. The pages left without are the ones with nothing honest to add: `dummy-object` and
`arrange-act-assert` have no production block, `dummy-object` and `transaction-script` no
real-world block.

**Ease of learning.** A new gate, `tour-order`, fails a tour that places a page before its own
prerequisite; 13 stages moved, and 19 prerequisite edges that pointed at a harder page were
re-typed. Sketches and diagrams on `cqrs`, `consistent-hashing`, `circuit-breaker`,
`quorum-consensus`, `monad` and `saga` now do what their explanations say.
`persona-identification-v2` has its explain block. 208 acronyms are expanded on first use across
110 pages; 253 first uses remain bare because they sit only in generated or writer-owned
blocks, link text or table cells.

**UI.** All 12 findings. Body text is left-aligned with a 72-character measure. `h3` is one size
on every page kind. A content table sits in a focusable scroll box with an edge fade. Below
76rem a diagram keeps its labels at 11px and scrolls inside its frame (they rendered at 3.5px
on a phone). The sidebar pins from 76rem. Hub hit targets are 24px, every header control shows
one focus ring, and a deep-linked element is highlighted.

**UX.** All 12 findings: a 404 page; counts and an example symptom on the home page; a kind
badge on each search result; a Clear control, a check mark, an empty-state sentence and scroll
restored on back for hub filters; the reason beside each related link; editors' picks listed
under Suggested on My marks; "Practiced" explained where it is used; the menu on the phone home
page.

**Testability.** Reader flows went from 22 to 34 across four projects. A contract test pins the
keys of every `kb.mjs --json` result. The browser gates fail instead of skipping when
`KB_REQUIRE_BROWSER` is set, and CI sets it. Skipped flows are pinned by an allowance file and
the chrome-share warning band is a ratchet. Tools branch coverage stands at 99.34% against its
99% floor. Test sandboxes turn off git's background housekeeping, which had aborted the
build-command suite inside the pre-commit extract.

A second round on 2026-10-02 closed the flows the first left out. There are 55 flows across
five projects, the fifth at 800px: deep links to five kinds of element, the outline following
the reader, diagram zoom, pan and full screen, the search box by keyboard alone, the theme at
first paint, across tabs and with storage blocked, and print. The axe gate also checks the open
search box, the open phone menu and the page at 390px and 800px, in both themes. Each client
module has its own coverage floor, and `make site-e2e-repeat` runs every flow three times to
show an unsteady one. The flows found three bugs, all fixed: the pre-paint theme script threw
when the browser blocked storage, the action bar printed on every sheet, and three grey labels
in the search box fell just short of the contrast floor in dark. One finding is waived with its
reason in the gate: a search result row is a link inside an option.

**Performance.** Measured at the start, on a throttled phone profile (4x CPU, 1.6 Mbps, 150 ms
round trip), compressed against uncompressed:

| Page | HTML raw / gzip | First paint, compressed | First paint, raw |
|---|---|---|---|
| Home | 18,167 / 4,378 | 512 ms | 1,040 ms |
| Singleton | 127,590 / 18,675 | 576 ms | 1,440 ms |
| Circuit breaker | 206,017 / 28,569 | 572 ms | 1,400 ms |
| Bitly | 301,968 / 53,076 | 556 ms | 1,476 ms |
| Persona identification | 927,441 / 152,462 | 624 ms | 1,408 ms |

Layout shift was zero on all of them; no web font and no image is loaded; the search payload
(710 KB raw, 126 KB gzip) is fetched only when the search box first opens.

What changed, measured on the 418-page build:

| Measure | Before | After |
|---|---|---|
| `kb.js`, raw / gzip | 64,402 / 16,782 | 34,887 / 12,633 |
| Search payload, raw / gzip | 783,810 / 135,972 | 695,143 / 135,323 |
| Per-diagram style blocks | 394, 1.87 MB site-wide | 2, with 4 shared sheets |
| Bitly HTML, raw / gzip | 300,169 / 53,059 | 281,265 / 49,486 |
| Persona identification HTML, raw / gzip | 924,942 / 152,731 | 877,605 / 146,388 |
| Console errors opened from disk | 5 | 0 |

A new site gate, `site-budget`, fails the build when a page, the bundle, the stylesheets, the
search payload or the manifest outgrows its budget, each set from the measured value with
about 15% of room. `kb.js` and the search payload carry a hash of their bytes in their names,
so a host can cache them for good; Starlight's module scripts are joined into one classic
script, so the outline menu and the code copy button work when the site is opened from disk.
The search payload starts loading when the reader points at the search button. What a host must
do is written down in [Hosting the site](../concepts/hosting-the-site.md). The phone timings
above were not measured again after these changes.

## Left for the owner

The items that need a decision before any work are in the [backlog](../../plans/backlog.md):
the shape of the explain block, the description read before it, start-here tracks and levels,
a self-check block, progress on a tour, code on principle pages, sketch languages, a relation
verb for "exposed to", the 404 page on a deep miss, the order of search results for a symptom,
and the missing pages this pass did not write.

## How the pass ran

Workers ran on Sonnet with disjoint file ownership; one worker at a time built the site, and
one at a time wrote `docs/data/relations.json` and `docs/data/learning-paths.json`. Claims of
"all pass" were checked rather than taken: a script audited every bold lead and flagged 230, a
cold reader on the small model read 277 phrases, and the first render of the cards in a browser
showed the colour rules losing to the default, which no gate had caught.
