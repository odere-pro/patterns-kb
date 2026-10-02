---
title: Page rules
description: The numbered rules every page under docs/ keeps — the PAGE rules for any page, the KB rules for this KB's own — and the gate that decides each.
area: reference
owner: Oleksandr Derechei
tags: [testing, readability]
status: stable
---

# Page rules

Every page under `docs/` keeps the rules on this page, and each rule has an id and an anchor,
so a finding names its rule and links straight to it:
`PAGE-002 docs/x.md:12 heading deeper than H3 … (docs/reference/page-rules.md#PAGE-002)`. The
last column names the gate that decides the rule; its section in [triage](triage.md) says how
to repair a finding.

An id never changes meaning. A rule that stops applying stays in its table marked retired,
and its id is never reused. When another page disagrees with a rule here, that page is the
stale one and gets fixed. The frontmatter block itself — which keys a page declares and which
values they take — is held by the [frontmatter gate](triage.md#page-frontmatter), whose
findings name the file and the key rather than a rule. Rule 000 of each table is about the
data file the gate reads its measured set from, not about a page.

## Page shape

The rules any page keeps (spec: kb.content.page-shape). The docs-style gate decides all of
them but PAGE-007, on every page the structure file publishes, and reads no line of code,
fenced or indented.

| Rule | What it says | Decided by |
| --- | --- | --- |
| <a id="PAGE-000"></a>PAGE-000 | The measured set can be read: `site-structure.json`, which names the pages these rules hold, is on disk and is JSON. | [`docs-style`](triage.md#page-shape) |
| <a id="PAGE-001"></a>PAGE-001 | Open with an intro paragraph before the first `##`: what the page is and who it is for. Markup, a list, a table, an image or a blockquote is no intro. | [`docs-style`](triage.md#page-shape) |
| <a id="PAGE-002"></a>PAGE-002 | Headings stop at H3. A page that needs an H4 is two pages; a run-in title is a paragraph holding one bold span. | [`docs-style`](triage.md#page-shape) |
| <a id="PAGE-003"></a>PAGE-003 | A `## Next steps` section is optional. When a page has one, it is the last section, and its list holds exactly one link: the next page to read. | [`docs-style`](triage.md#page-shape) |
| <a id="PAGE-004"></a>PAGE-004 | A page has exactly one H1, and it equals `title:`. A hand-written site page (`.mdx`) takes its H1 from `title:` and writes none. | [`docs-style`](triage.md#page-shape); the title by [`frontmatter`](triage.md#page-frontmatter) |
| <a id="PAGE-005"></a>PAGE-005 | `description:` is one plain line of at most 160 characters, never a block scalar, because a search result cuts it there. | [`docs-style`](triage.md#page-shape), and on every page, published or not, [`frontmatter`](triage.md#page-frontmatter) |
| <a id="PAGE-006"></a>PAGE-006 | No raw URL in prose: write `[link text](url)`. Inline code, a link target, indented code and a reference-link definition are exempt. | [`docs-style`](triage.md#page-shape) |
| <a id="PAGE-007"></a>PAGE-007 | No banned phrasing: the glossary names each phrasing to avoid and its replacement. | [`vocabulary`](triage.md#vocabulary-bans) |
| <a id="PAGE-008"></a>PAGE-008 | A `## Next steps` section is one sentence saying where the reader goes next, then the list, then nothing. | [`docs-style`](triage.md#page-shape) |

## The KB's own rules

What a knowledge-base page keeps beyond the page shape. The kb-shape gate decides them all,
reading the closed lists from [content-model.json](../data/content-model.json) and the rows from
[site-structure.json](../data/site-structure.json), so no list is repeated here. A page's kind
is its top folder under `docs/`: KB-001 and KB-002 hold every published page, the rest the
pages of the seven kinds.

| Rule | What it says | Decided by |
| --- | --- | --- |
| <a id="KB-000"></a>KB-000 | The two data files these rules read are on disk and readable: `content-model.json` with its kinds, block facts and sketch languages, and `site-structure.json` with its areas. | [`kb-shape`](triage.md#kb-page-shape) |
| <a id="KB-001"></a>KB-001 | A page sits where its row says: exactly one row of `site-structure.json` names its path as `source`, and its `area:` is that row's area. Moving a page means changing its row. | [`kb-shape`](triage.md#kb-page-shape) |
| <a id="KB-002"></a>KB-002 | A slug, the page's file name, names one page, and a row's `slug` is the file name of the page it names. | [`kb-shape`](triage.md#kb-page-shape) |
| <a id="KB-003"></a>KB-003 | Every `##` of a kind page carries a `block` fact. The blocks come in the order `content-model.json` lists for the kind, each once, and every block the kind does not mark optional is there. | [`kb-shape`](triage.md#kb-page-shape) |
| <a id="KB-004"></a>KB-004 | A trailing `{…}` suffix holds only `#id`; a fence's info string holds its language, then `caption`, `summary`, `wide=true` and `#id`. A suffix for a whole table, list, blockquote or fence sits on its own line after a blank line. A literal trailing brace is written `\{`. | [`kb-shape`](triage.md#kb-page-shape) |
| <a id="KB-005"></a>KB-005 | Retired. Reading levels are gone: a page has one depth and no `level=` key is legal in a suffix or a fence's info string (KB-004 lists the keys that are). | [`kb-shape`](triage.md#kb-page-shape) |
| <a id="KB-006"></a>KB-006 | A section fact `<!--meta k=v-->` sits on the line under its heading, with no space around `=`. Its keys are `block` under a `##`, and `polarity` or `requirement` under a `###`; a `block` value is one of `content-model.json`'s blocks. | [`kb-shape`](triage.md#kb-page-shape) |
| <a id="KB-007"></a>KB-007 | A `polarity` group takes one of the values `content-model.json` lists under `groups`, under the block it pairs that value with: the sides of `tradeoffs`, `usage` and `production`. | [`kb-shape`](triage.md#kb-page-shape) |
| <a id="KB-008"></a>KB-008 | A `requirement` group takes one of the values `content-model.json` lists under `groups`, under a design's `requirements` block. | [`kb-shape`](triage.md#kb-page-shape) |
| <a id="KB-009"></a>KB-009 | An explicit `{#id}` is lower-case letters, digits and hyphens, and no two elements of a page share an id. A block heading's id is its block name, and is never written. | [`kb-shape`](triage.md#kb-page-shape) |
| <a id="KB-010"></a>KB-010 | A fence is a `mermaid` figure or a code sketch in one of the sketch languages `content-model.json` lists, and names its language. Sketches are TypeScript; `go` is legal only on a pattern page of the `concurrency` area, where the model's `only` key for it says so. | [`kb-shape`](triage.md#kb-page-shape) |
| <a id="KB-011"></a>KB-011 | Retired. The three-rung explain ladder is gone; KB-014 holds the shape of the explain block. | [`kb-shape`](triage.md#kb-page-shape) |
| <a id="KB-012"></a>KB-012 | Retired. With no reading levels no block can render empty at one; the rule has nothing left to check. | [`kb-shape`](triage.md#kb-page-shape) |
| <a id="KB-013"></a>KB-013 | The KB's own frontmatter keys: `aliases` is absent or an inline list; every page but a theme lists 3 to 5 `solves`, the symptoms someone types before they know the page exists, each one problem in at most 20 words, and a theme lists none; `favourite` is `true` or absent. | [`kb-shape`](triage.md#kb-page-shape) |
| <a id="KB-014"></a>KB-014 | The explain block holds, in this order and nothing else: one paragraph of 60 to 180 words with no bold run-in label, which may link a term on its first use to that term's own page or gloss it in a short parenthesis; a costs list of 2 to 4 bullets, each opening with a bold lead and running at most 25 words, saying what the page's subject costs; then either a paragraph that opens `**Example.**` and runs at most 120 words, or one captioned non-mermaid sketch fence of at most 25 lines. The costs list is required on a pattern page and optional on any other kind. The block carries no level mark; a design may leave the block out. A page listed in `docs/data/allow/kb-shape.json` under `explain` or `costs` may break the word bounds, omit the example or omit the costs list while its rewrite is pending, and nothing else. | [`kb-shape`](triage.md#kb-page-shape) |
| <a id="KB-015"></a>KB-015 | The description block, the prose read first on every page, is one paragraph of at most 80 words, on every page kind. A page listed in `docs/data/allow/kb-shape.json` under `description` may break it while its rewrite is pending, and may not grow past the `maxWords` its entry records. | [`kb-shape`](triage.md#kb-page-shape) |
| <a id="KB-016"></a>KB-016 | The selfcheck block, optional on a pattern, a hazard and a principle, holds exactly three blockquotes and nothing else. Each opens with one bold question of at most 25 words ending in `?`, then an answer of at most 60 words with at least one link whose target carries a `#element-id`, so the answer cites what it rests on; the link gate resolves the id. No allowlist excuses it. | [`kb-shape`](triage.md#kb-page-shape) |
