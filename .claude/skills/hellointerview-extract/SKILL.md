---
name: hellointerview-extract
description: Extract the Hello Interview "Learn System Design" course into a nested folder tree of study notes — one folder per left-sidebar accordion, one sub-folder per topic, each holding a meta.json (facts + the "On This Page" TOC) and an original note.md. Use when someone wants to capture, mirror, or study a sidebar-accordion learning site (Hello Interview by default) into local structured notes without hand-copying pages.
---

# Extracting Hello Interview into nested study folders

This turns the course's two-level sidebar into a folder tree you can study from:

```
<root>/                          default: tmp/hellointerview/  (tmp/ is gitignored — a private archive)
└── <accordion>/                 LEVEL 1 — a left-sidebar accordion (In a Hurry, Core Concepts,
    │                                       Question Breakdowns, Patterns, Key Technologies, Advanced Topics)
    └── <topic>/                 LEVEL 2 — a topic inside it (Caching, Sharding, Multi-step Processes, …)
        ├── meta.json            facts + the RIGHT-sidebar "On This Page" TOC (the "helpers/context")
        └── note.md              a comprehensive ORIGINAL study note covering every TOC section
```

The metadata and the structure are facts (URLs, dates, heading lists) — safe to store verbatim. The
**prose in `note.md` is written fresh**, never copied. See the guardrail in Phase D.

## The one rule that shapes everything

**Do not reproduce the site's body prose.** Store structural facts (titles, dates, the TOC, access
flags) in `meta.json` freely. In `note.md`, write your own comprehensive explanation of every section —
thorough, but in your own words and structure, substantially shorter than and different from the
source; short quotes only (<15 words, attributed). Technical facts and code are fine to include. This
holds even though the output lives in gitignored `tmp/` and even for content behind a Premium account
the user pays for — the goal is a complete original study resource, not a verbatim mirror of a paid
course. The site gives you a *map of the concepts*; you supply the teaching.

## Session model (how to reach the pages)

Two browser surfaces exist. **Prefer the Claude in Chrome extension** (`mcp__claude-in-chrome__*`) —
it reuses the user's already-signed-in Brave/Chrome session, so no login or credential prompt is
needed. The in-app Browser pane (`mcp__Claude_Browser__*`) works too but starts logged-out. Load the
tools with one ToolSearch call:

```
ToolSearch: select:mcp__claude-in-chrome__tabs_context_mcp,mcp__claude-in-chrome__navigate,mcp__claude-in-chrome__get_page_text,mcp__claude-in-chrome__read_page,mcp__claude-in-chrome__browser_batch
```

Then `tabs_context_mcp {createIfEmpty:true}` once to get a `tabId`, and `navigate` to a course page.

**Access tiers matter and are not obvious:**
- A free signed-in account opens the full left sidebar and all **Core Concepts** page bodies
  (Networking, API Design, Caching, Sharding, Consistent Hashing, CAP Theorem, …).
- **Pattern** pages (Real-time Updates, Scaling Reads/Writes, Multi-step Processes, …) stay
  Premium-gated even when signed in: you get the intro + the "On This Page" TOC, then
  "Purchase Premium to Keep Reading". That's fine — the TOC is all the skeleton needs.
- Never trigger a Premium purchase to unlock more. If asked, stop and tell the user to buy it
  themselves; extraction continues at whatever tier their account already has.

## Phase A — Discover the tree (build the manifest)

Goal: a `manifest.json` listing every accordion and the topics under it. The sidebar only reveals a
given accordion's topics once you're on a page within that section, so visit one page per accordion.

1. `navigate` to a known page, e.g. `…/learn/system-design/core-concepts/caching`.
2. `read_page {filter:"interactive"}`. In the output:
   - sidebar **buttons** are the accordion toggles (level 1: "Core Concepts", "Patterns", …);
   - sidebar **links** under each are the topics (level 2), and their `href` gives the real slug.
   The known accordions and a first page for each:
   - `In a Hurry` → `…/in-a-hurry/introduction`
   - `Core Concepts` → `…/core-concepts/caching`
   - `Question Breakdowns` → `…/problem-breakdowns/bitly`
   - `Patterns` → `…/patterns/realtime-updates`
   - `Key Technologies` → `…/key-technologies/redis` (or `…/deep-dives/redis`)
   - `Advanced Topics` → `…/deep-dives/vector-databases`
3. Assemble `manifest.json` (shape: `manifest.example.json`, validated by `structure.mjs`). One entry
   per accordion, each with `{name, slug, topics:[{slug, title, url}]}`. Leave the per-topic detail
   fields (date/access/toc/…) empty for now — Phase B fills them.

Sidebar labels that carry a lock icon are Premium; you can pre-mark those `"access":"premium"`.

## Phase B — Extract each topic

For every topic URL, gather the facts that go into `meta.json`. Batch several pages per
`browser_batch` call (navigate + get_page_text pairs) to stay fast.

Per page, from `get_page_text` (+ `read_page {filter:"interactive"}` for clean TOC anchors):

| field | where to read it |
|---|---|
| `title` | the page `<h1>` |
| `date` | the "Updated <date>" / "Published <date>" line under the title |
| `access` | `premium` if the text contains "Purchase Premium to Keep Reading"; else `free` |
| `hasVideo` | text has "Watch Video Walkthrough" or "Premium users can view this video" |
| `toc` | the RIGHT-sidebar list under **"On This Page"** (or the `#…` anchor hrefs from `read_page`) |
| `relatedBreakdowns` | the "Problem Breakdowns with X Pattern" chip labels, when present |

Fold these into each topic object in `manifest.json`. Do **not** paste body prose into the manifest —
it holds facts only. Stamp a `capturedAt` (ISO-8601) at the top level or per topic.

Tip: large pages overflow a tool result and get saved to a file path — `Read` that file to get the
full text rather than re-fetching.

## Phase C — Structure it (run the scaffolder)

```
node .claude/skills/hellointerview-extract/structure.mjs \
  --manifest tmp/hellointerview/manifest.json \
  --root tmp/hellointerview \
  --captured-at <ISO-8601>
```

Default/recommended root is **`tmp/hellointerview/`** in the project (absolute:
`/Users/aleksandrderechei/Git/patterns/tmp/hellointerview`). `tmp/` is gitignored, so the archive is
never committed or published. Save the harvested `manifest.json` there too so a later loop run finds it.

This creates `root/<accordion>/<topic>/`, writes each `meta.json`, and scaffolds each `note.md` with
the TOC as blank `##` sections. It is **re-runnable**: `meta.json` is always refreshed, but a `note.md`
you've already written into is preserved (it only rewrites files still carrying the
`<!-- hi-extract:scaffold -->` marker). Pass `--force-notes` only to deliberately reset stubs.
`node structure.mjs --help` prints the options.

## Phase D — Write the notes (original prose)

Open each `note.md` and fill **every** TOC section with your own comprehensive explanation, built from
general systems-design knowledge plus what the page (at the user's account tier) actually covers — the
way the existing study notes in `~/.claude/projects/-Users-aleksandrderechei-Git-patterns/study-notes/`
were written, but complete across all sections. Cover each heading thoroughly; include technical facts,
code, and named examples. Do not paste paragraph-length source prose — keep it original and
substantially shorter than the source (the guardrail at the top applies to every note, gitignored and
paid content included).

Optionally, for a KB-comparison pass, add the two extra sections those notes use:
- **Already in our KB** — link topics to existing pages, found via `node scripts/kb.mjs find "<symptom>"`
  and verified with `find site -iname "<id>.html"` before you write the path down (never guess a path).
- **Gap flagged** — concepts with no citable KB page yet, as candidate `kb-add` work (a separate,
  explicitly-approved step — this skill does not author `site/**` pages).

Delete the `<!-- hi-extract:scaffold -->` marker line as you start each note; that also locks the file
against future `structure.mjs` re-runs and marks the topic "done" for the loop.

## Loop mode — fetch until everything is done

To run this as a loop (e.g. via `/loop`) that keeps going until the whole course is captured:

1. **Once:** do Phase A (build `manifest.json`, save it under `tmp/hellointerview/`) and Phase C
   (scaffold all folders). Now every topic has a stub `note.md`.
2. **Each iteration:** check what's left, then do a batch —
   ```
   node .claude/skills/hellointerview-extract/structure.mjs --status \
     --manifest tmp/hellointerview/manifest.json --root tmp/hellointerview --json
   ```
   This prints `pendingTopics[]` (ref + url) and exits **0 when nothing is pending, 2 otherwise** — the
   loop's stop condition. Take the next few pending topics, `navigate` + `get_page_text` each (Phase B
   for any still-missing metadata), write comprehensive original notes into their `note.md`, and delete
   each scaffold marker. Keep batches small (3–5 topics) so a single turn finishes cleanly.
3. **Stop** when `--status` exits 0 / prints "All topics fetched."

Because "done" = an authored `note.md` (no scaffold marker), the loop is naturally resumable: a fresh
session re-runs `--status` and picks up exactly where it left off. Nothing already written is redone.

## Verify

- After Phase C, spot-check one free and one premium topic: `meta.json` has the right `access`, a
  non-empty `toc`, and the folder sits under the correct accordion.
- Re-run `structure.mjs` and confirm the run summary reports authored notes **preserved**, not
  scaffolded.
- Confirm no `note.md` (or `meta.json`) contains paragraph-length source prose.

## Adapting to another sidebar-accordion site

The structure is generic; only the reading rules in Phases A–B are Hello-Interview-specific. To
retarget: change the accordion→first-page map (Phase A), the access sentinel string (`"Purchase
Premium to Keep Reading"`), the date-line wording, and the "On This Page" label used to locate the
TOC. `structure.mjs` and the folder shape need no changes — they consume the manifest, whatever site
produced it.
