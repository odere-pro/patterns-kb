# One reading depth

On 2026-10-01 the knowledge base moved to one reading depth. The owner dev-tested the migrated
site and found three things in the way: the Basic, Advanced and Expert lens made every page
three pages, the difficulty badge and the level facet sorted pages by a grade nobody could
defend, and the neighbour graph, the Interactive Graph and the Reference area added chrome
beside the reading. Everything below came from that feedback, in the commits `332b706..HEAD`
on `harness/optimize`. This record keeps the counts, the measurements and the decisions.

## What changed

- **Sidebar**: groups off the current branch wear the group look (bold, with a caret).
- **Build output**: the `build-untracked` gate keeps built output out of git.
- **Area titles** lost their em-dash taglines.
- **Map** is one link, "From Pattern to Product"; the Interactive Graph is deleted.
- **Reference** left the site; its area carries `nav: none`.
- **"How it relates"** neighbour graph removed from every page.
- **View source** control: each page ships its markdown next to its HTML.
- **Search** ranks title, then category, then tag, then content; the search-oracle gate holds
  22 queries over the site box and `kb.mjs find`.
- **Difficulty badge, level facet and the Basic/Advanced/Expert lens** removed.
- **Reading levels retired** from pages, the parser, `kb.mjs` and the skills. KB-005, KB-011
  and KB-012 are retired; KB-014 is new.
- **Explain blocks**: all 382 rewritten into one plain paragraph and one example.

Workers ran on Sonnet under a judge loop. The one-shot converter `retire-levels.ts` and its
test, the last files in `tools/src/migrate/`, were deleted with the folder once both passes
had run.

## Counts

| What | Count |
| --- | --- |
| Explain blocks rewritten | 382, in 16 batches |
| Level marks stripped | about 8,400, from 383 files |
| Frontmatter `level:` lines removed | 395 |
| Search-oracle queries | 22 |

## Measured relevance

`KB_RELEVANCE=report make tools-test T=relevance`, over 340 pages with `solves` lines and 382
titles. Floors are the asserted ones in `tools/src/lib/search-relevance.test.ts` and
`tools/src/kb/relevance.test.ts`.

| Path and phrasing | n | top-1 | top-3 | MRR | design steals |
| --- | --- | --- | --- | --- | --- |
| Box, verbatim | 340 | 99.4% | 100.0% | 0.997 | 0.3% |
| Box, inflected | 340 | 99.4% | 100.0% | 0.997 | 0.3% |
| Box, keyword | 335 | 98.8% | 99.4% | 0.991 | 0.0% |
| Box, inflected keyword | 335 | 98.2% | 99.4% | 0.989 | 0.0% |
| Box, title | 382 | 99.2% | 100.0% | 0.996 | 0.0% |
| Box, title with a typo | 101 | 98.0% | 99.0% | 0.985 | 0.0% |
| Box, all | 1,833 | 99.0% | 99.7% | 0.994 | 0.1% |
| CLI, verbatim | 340 | 99.4% | 100.0% | 0.997 | 0.0% |
| CLI, inflected | 340 | 98.5% | 99.7% | 0.991 | 0.0% |
| CLI, keyword | 335 | 97.9% | 99.4% | 0.986 | 0.3% |
| CLI, inflected keyword | 335 | 95.8% | 99.1% | 0.974 | 1.0% |
| CLI, all | 680 | 99.0% | 99.9% | 0.994 | 0.0% |
| Hub (no prose), all | 680 | 99.4% | 100.0% | 0.997 | 0.3% |

Floors. Box: top-1 0.99 for verbatim, inflected and title, 0.975 for title with a typo;
top-3 0.995; MRR 0.99; design steals at most 0.8%. CLI: top-1 0.988 verbatim and 0.985
inflected; top-3 0.995; MRR 0.989. Hub: top-1 0.99; design steals at most 0.8%; designs in
the top five at most 42%. The CLI's inflected top-1 sits exactly on its floor. The report
lists seven CLI misses, all on symptoms phrased far from the page (for example "restart the
service every night" lands on `resource-leak`, not `self-healing`).

Floors raised to the measurements, rounded to 0.005: Box top-1 for title with a typo 0.98
(from 0.975), design steals at most 0.5% (from 0.8%). CLI: top-1 0.99 verbatim (from 0.988),
MRR 0.99 (from 0.989), design steals at most 0.5% (from 0.8%), designs in the top five at
most 34.5% (from 42%). The rest already sat at their rounded measurement.

## Gate timings

`make validate`: 37 gates, 8 at a time, no findings, 97.1 s in all. Seconds per gate:

| Gate | Seconds |
| --- | --- |
| Gate suite (vitest) | 95.4 |
| Hook suite (bash) | 58.6 |
| Search oracle answers | 4.3 |
| Diagrams parse | 4.2 |
| Type check | 3.0 |
| KB page shape | 2.6 |
| Site hook parity | 0.9 |
| Repository links | 0.7 |
| Page frontmatter, Page shape, Harness shape, Vocabulary bans, Tour and fluency blocks in sync, Relationships blocks in sync, Prerequisite graph holds, Context layers | 0.4 each |
| The other 21 gates | 0.1 to 0.3 each |

The two test suites run in parallel with the rest, so the wall time is the slower suite plus
start-up, not the sum.

## Decisions

- **Nav key.** An area's optional `nav` is closed to two values. `link` makes a single-page
  area with no hub, shown as one top-level sidebar link to its only row (the `map` area).
  `none` leaves the area unpublished: its rows, hub and sidebar group stay off the site while
  the pages keep their `area` and their docs-map row (the `reference` area).
- **KB-014.** The explain block holds one paragraph of 80 to 220 words with no bold run-in
  label, then either an `**Example.**` paragraph of at most 120 words or one captioned
  non-mermaid sketch of at most 25 lines. No level mark, nothing else; a design may omit the
  block.
- **Retired rule ids stay.** KB-005, KB-011 and KB-012 keep their rows, marked retired, so a
  cited id never points at a different rule.
- **Allowlist ratchet.** `docs/data/allow/kb-shape.json` excused only an explain block's
  example and word bounds, one entry per rewrite batch, and the gate fails an entry that
  excuses nothing. Each batch deleted its entry once its pages passed; the file now ships
  with `entries: []`, as `docs/CLAUDE.md` says an allowlist does unless the plan records a
  deviation.
- **Lens and badge removal.** With one reading depth the lens, the difficulty badge and the
  level facet have nothing to switch or sort by, and the `level` frontmatter key has no
  reader. They went together, so no control is left pointing at a removed value.
- **Search order.** Title outranks category, category outranks tag, tag outranks content, so a
  page named by the query beats a page that merely mentions it. The oracle gate runs each
  query through both the box and `kb.mjs find`, so one path cannot drift from the other.
- **Kept.** The case-study bands (Mid, Senior, Staff and above), which grade what an
  interviewer expects of a candidate, not how hard a page is to read. The design pages'
  `levels` block stays.

## Found, not fixed

The batch workers raised these arithmetic doubts about sizing-block content they were not
rewriting. Each needs a check against the page and a decision on which number is right.

- **`online-auction`**: 10M auctions x 100 bids over 7 days is about 143M bids a day, about
  1,650 a second; the page says about 1,400 a second.
- **`payment-system`**: 5 MB/s for a year is about 158 TB; the page says 180 TB a year.
- **`ad-click-aggregator`**: the five-minute sweep's 3M events assume the 10k/s peak, while
  the block treats 1k/s as the mean.
- **`whatsapp`**: 200M connections at 1 to 2M per host is 100 to 200 hosts; the block says
  hundreds of chat servers.
