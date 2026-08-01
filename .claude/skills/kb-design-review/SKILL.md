---
name: kb-design-review
description: Review, evaluate, critique, audit or grade an existing patterns-kb page — a whole design or pattern page, or one block of it named by URL fragment. Use when someone asks to "review this design page", "evaluate this design", "critique site/designs/X", "audit this page", "is this design any good", "grade this kata", "what's wrong with this page", or simply hands over a `file://…/site/**.html` path or a `…#tradeoffs`-style fragment with a review verb. It writes findings only — applying them is a separate kb-edit step.
---

# Reviewing an existing page

**The deliverable is a severity-ranked findings list, not an edited page.** Two-stage, the
same discipline `kb-fact-check` uses: this skill *finds and cites*, `kb-edit` *applies*
after the user approves. Never edit `site/` from here.

## 1. Resolve the reference — never open the `.html`

The corpus is ~490k tokens and half of any page is markup. A `file://` URL, an absolute
path and a bare id are all the same thing: **an id plus an optional block**.

```
file:///Users/…/site/designs/persona-identification.html#tradeoffs
        └─ id: persona-identification ─┘          └─ block: tradeoffs ─┘
```

Strip the directory and `.html` for the id; the `#fragment` names the block. Then read it:

```
node scripts/kb.mjs get persona-identification --block tradeoffs   # one block, ~180 tokens
node scripts/kb.mjs get persona-identification                     # whole page, cleaned
node scripts/kb.mjs validate persona-identification                # structural lint first
```

A fragment that is an *element* id (`#tradeoffs-con-2`) still names its block — review the
block, cite the element. No fragment means the whole page.

**`Read` and `WebFetch` on a `site/**.html` file are wrong here, always.** If `kb.mjs get`
returns nothing, the id is wrong — `kb.mjs ls --kind design` lists them.

## 2. Pick the axis — say which one you are on

A review request is one of two questions, and they have different owners. Ambiguous asks
("review this") get the page-shape axis plus a one-line offer of the other.

| axis | question | how |
|---|---|---|
| **Page shape** | Does the block obey its own contract? | the owning skill's `## Self-check` |
| **Design soundness** | Is the architecture actually right? | `design-critic` agent, or inline `kb.mjs brief` |

### Page shape — run the owning skill's Self-check

Every block skill ends with a numbered `## Self-check`. **Load the owning skill and run its
checklist. Do not invent criteria** — a review that judges by taste rather than by the
stated contract is why blocks drift.

| block | owning skill |
|---|---|
| `description` | kb-design-problem |
| `explain` | kb-explain |
| `requirements` | kb-design-requirements |
| `sizing` | kb-design-sizing |
| `entities` | kb-design-entities |
| `interface` | kb-design-interface |
| `architecture`, `deepdives` | kb-design-architecture |
| `tradeoffs` | kb-design-tradeoffs |
| `levels` | kb-design-levels |
| `relationships` | kb-design-relationships |
| any block of a **pattern** page | kb-pattern-blocks |
| any block of a **hazard** page | kb-hazard-blocks |
| any block of a **theme** page | kb-theme-blocks |
| any block of a **principle** page | kb-principle-blocks |
| any block of a **capability** page | kb-capability-blocks |
| any block of a **comparison** page | kb-comparison-blocks |

Whole-page review runs every block's self-check in page order, plus the cross-block
coverage contract: every FR lands somewhere visible in `architecture`, every NFR has a deep
dive, the `tradeoffs` lead names the flaw the `levels` block defends, and the `sizing`
verdicts still match what `architecture` built.

Two page-wide gates worth running because they are cheap and mechanical:

```
node scripts/kb.mjs validate <id>          # structural lint against the data contract
node scripts/report-lens.mjs <id>          # the per-lens sizing bands
node scripts/report-links.mjs <id>         # prose that names a page it never links
```

`make check` does **not** lint skills or prose, so everything above is honour-system except
those three.

### Design soundness — hand it to the critic

Hazards, performance antipatterns and principle overreach are the `design-critic` agent's
job, with `kb-scout` for cited KB backing. Launch them **only when subagents are
permitted in the session**. When they are not, say so plainly and run the sweep inline:

```
node scripts/kb.mjs brief "<the design's hardest tension>" --n 5
node scripts/kb.mjs find "<symptom the design might have>" --kind hazard
```

Inline costs main context, so scope it to the two or three tensions the page itself flags —
usually the `tradeoffs` risks and the NFR with the thinnest dive.

## 3. Report

Findings only, severity-ranked, every one anchored to a stable id.

| severity | means |
|---|---|
| **CRITICAL** | a factual error or a fabricated product/API claim that ships to a public site |
| **HIGH** | a contract violation the build cannot catch — an uncovered FR, a missing NFR dive, a lens that renders wrong |
| **MEDIUM** | shape drift — over-long list, essay where a ledger belongs, collapsed sketch |
| **LOW** | wording, register, a missing prose link |

Each finding: the anchor (`…#tradeoffs-con-2`), the self-check rule it fails (by skill and
number, e.g. *kb-design-tradeoffs §4*), what is wrong, and the smallest fix. No rewritten
prose in the report — that is the fix step, and it needs approval first.

Close with the verdict and the handoff: **"N findings — approve and I'll apply them with
kb-edit."** Never apply unasked.

## Self-check

1. Did every read go through `kb.mjs`, and did no tool call open a `site/**.html`?
2. Is the axis named — page shape, design soundness, or both?
3. Was each finding judged against a *stated* self-check rule, cited by skill and number?
4. Does every finding carry a stable anchor id a reader can click?
5. Is the report findings-only, with the fix deferred to an approved `kb-edit` pass?
