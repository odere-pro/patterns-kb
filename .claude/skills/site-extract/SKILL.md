---
name: site-extract
description: Download and parse a documentation or course website into a nested folder tree of RAW extraction data — one folder per nav group, one sub-folder per topic, each holding <slug>.meta.json (facts + on-page TOC) and <slug>.md (dense factual capture). Site-specific rules live in a profile, so nothing is hardcoded to one site. The raw data is the substrate you later transform into your own original pages. Use when someone wants to capture a two-level (group → topic) site into structured, validated local raw data.
---

# site-extract — capture a two-level site into raw data

A **two-stage pipeline**. This skill *downloads and parses* pages into raw extraction data; **you**
transform that raw data into your own original pages afterwards (here, via `kb-add`). The skill stops
at raw data — it never authors published pages.

It is **site-agnostic**: everything specific to a target site lives in a **profile** under
[`profiles/`](profiles/). `profiles/hellointerview.json` is a worked example;
`profiles/_template.json` is the blank to copy. The skill body, `structure.mjs`, and the folder shape
know nothing about any particular site.

```
<root>/                          from the profile (e.g. tmp/<site>/ — keep it gitignored)
├── manifest.json               the discovered tree (groups → topics), the machine index
└── <group-slug>/               LEVEL 1 — a nav group / sidebar section
    └── <topic-slug>/           LEVEL 2 — a topic in that group
        ├── <topic-slug>.meta.json   facts + the on-page TOC (self-describing filename)
        └── <topic-slug>.md          the raw factual extraction
```

Filenames carry the topic slug (taken from the URL's last path segment — authoritative, lossless) so
every file is self-describing and greppable, and `meta.order` preserves the source nav sequence.
**Gold in, gold out:** faithful slugs + order + complete TOC coverage on the way in; the `--validate`
gate refuses anything thin or incomplete on the way out.

## 0. Legal & ethics gate — do this before fetching anything

You are responsible for lawful use. Before extracting from a site, confirm all of the following, and
stop if any fails:

- **Authorized access only.** Fetch only what the user's own signed-in session legitimately renders.
  Never bypass authentication, paywalls, rate limits, or CAPTCHAs, and never scrape another person's
  account. If content is gated and the user hasn't paid, it stays gated — capture only the visible
  intro + TOC.
- **Respect robots.txt and Terms of Service.** Read the profile's `robotsTxt` and `termsUrl`; if either
  disallows automated access or copying of the section you're targeting, do not proceed — surface it to
  the user and let them decide.
- **Be polite.** Fetch sequentially with the profile's `politenessDelayMs` between requests; never
  parallelize a crawl against a site you don't own.
- **Copyright — capture facts, not expression.** Facts, specs, numbers, API names, and functional code
  are not copyrightable; the source's prose, structure-as-written, analogies and "voice" are. Capture
  the former in neutral form; never mirror the latter. Short quotes only (<15 words, attributed). This
  holds even in gitignored `tmp/` and even for paid content — **because pages you build from it may be
  published**, and a page produced by lightly editing someone's prose is a derivative work.
- **Personal/authorized scope.** This is for the user capturing material they may lawfully use. It is
  not a tool for republishing someone else's site.

If in doubt, ask the user rather than proceeding.

## 1. Pick / write the profile

Use an existing profile or copy `profiles/_template.json`. It declares: `baseUrl`, `robotsTxt`,
`termsUrl`, output `root`, `politenessDelayMs`, how the nav exposes groups/topics + one `seedPage` per
group (`discovery`), and how to read a page (`extract`: title location, date-line prefixes, the
paywall `accessGatedSentinel`, video sentinels, the `tocLabel`, and what to `skip` — comments, video,
quizzes, footer). Everything site-specific stops here.

## 2. Session (how to reach the pages)

Prefer the **Claude in Chrome extension** (`mcp__claude-in-chrome__*`) — it reuses the user's
signed-in browser session, so no credential prompt. The in-app Browser pane (`mcp__Claude_Browser__*`)
also works but starts logged-out. Load tools in one call:

```
ToolSearch: select:mcp__claude-in-chrome__tabs_context_mcp,mcp__claude-in-chrome__navigate,mcp__claude-in-chrome__get_page_text,mcp__claude-in-chrome__read_page,mcp__claude-in-chrome__browser_batch
```

Then `tabs_context_mcp {createIfEmpty:true}` once for a `tabId`, and `navigate` per the profile.

## 3. Phase A — Discover the tree (build the manifest)

Goal: `manifest.json` = `{ site, capturedAt, groups:[{name, slug, topics:[{slug,title,url}]}] }`.
For each group in the profile's `discovery.seedPages`, `navigate` there and `read_page
{filter:"interactive"}`; use `discovery.groupSelector` / `topicSelector` to read the group's topics and
their real `href` slugs. Save `manifest.json` under the profile's `root`. Leave per-topic detail fields
(date/access/toc/…) for Phase B.

## 4. Phase B — Extract each topic

For every topic URL, gather the facts for `meta` (respecting `politenessDelayMs`; batch a few pages per
`browser_batch`):

| field | where to read it (via the profile) |
|---|---|
| `title` | `extract.titleFrom` |
| `date` | the line starting with one of `extract.dateLine` |
| `access` | `gated` if the body contains `extract.accessGatedSentinel` (or a nav lock); else `open` |
| `hasVideo` | body contains any `extract.videoSentinels` |
| `toc` | the list under `extract.tocLabel` (or the `#…` anchor hrefs from `read_page`) |
| `related` | labels under `extract.relatedLabel`, when present |

Fold these into the manifest's topic objects. Do **not** paste body prose into the manifest — facts
only. Stamp `capturedAt` (ISO-8601). Large pages overflow a tool result and get saved to a file path —
`Read` that file rather than re-fetching.

## 5. Phase C — Structure it (scaffold)

```
node .claude/skills/site-extract/structure.mjs \
  --manifest <root>/manifest.json --root <root> --captured-at <ISO-8601>
```

Creates `<group>/<topic>/<topic>.{meta.json,md}`, always refreshing `meta.json` and scaffolding each
`.md` with the TOC as blank `##` sections. Re-runnable: a filled `.md` is preserved (only files still
carrying `<!-- site-extract:scaffold -->` are rewritten). `--force` resets stubs. `--help` for options.

## 6. Phase D — Fill the raw extraction

Under **every** TOC heading in `<topic>.md`, capture the raw data densely: every technical fact,
number, spec, API/config name, code snippet, named example, and the points made — in **neutral,
condensed bullet form**, not the source's sentences. Keep the `> Source:` citation. **Skip comments and
video.** The Legal & ethics gate governs every file. Delete the scaffold marker as you fill each file
(this also marks the topic "done").

Transforming `<topic>.md` into an original published page (via `kb-add`) is a **separate, explicitly
approved** step — not this skill.

## 7. Loop mode — capture until done, resumably

1. **Once:** Phase A (manifest) + Phase C (scaffold every topic).
2. **Each iteration:** find what's left, then do a small batch —
   ```
   node .claude/skills/site-extract/structure.mjs --status \
     --manifest <root>/manifest.json --root <root> --json
   ```
   Exits **0 when nothing is pending, 2 otherwise** — the loop's stop condition; prints
   `pendingTopics[]`. Take the next 3–5, fetch + fill their `.md`, delete each scaffold marker.
3. **Stop** when `--status` exits 0. "Done" = a filled `.md`, so a fresh session resumes cleanly.

## 8. Verify — the "gold out" gate

```
node .claude/skills/site-extract/structure.mjs --validate --manifest <root>/manifest.json --root <root>
```

Fails (exit 3) any topic that is missing a TOC section, lacks a source citation, or is too thin;
reports still-pending topics (exit 2); prints "Gold out. ✓" only when every filled extraction is
complete and cited. Run it before you start transforming raw data into pages.

## Adapting to another site

Copy `profiles/_template.json`, fill it for the new site, point Phases A–B at it. `structure.mjs`, the
folder shape, the loop, and the validator are unchanged — they are already site-agnostic.
