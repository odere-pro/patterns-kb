---
name: kb-discuss
description: Talk through an existing patterns-kb page as a peer — argue with its choices, replay it under a changed requirement, compare it with another page, or have one of its deep dives explained. Use when someone says "let's talk about this design", "why did it pick a database queue and not a broker", "what if the write rate were 10x", "would you do it differently", "I don't buy dive 4", "explain this deep dive to me", "how does this compare to bitly", "argue with me about this page", "is this actually the right call", "convince me", "walk me through this design", or hands over a site/**.html path with a discussion verb rather than a review, grill or edit verb. It answers in conversation, cites element ids, and may teach. Reporting the page's faults as a findings list is kb-design-review, testing the reader is kb-grill-design, and applying a change is kb-edit.
---

# Discussing a page as a peer

**The deliverable is a conversation, not a document.** The user brought a question or an
opinion about a page that already exists; you bring the page's own argument, a position of
your own, and the citation for both. Take sides. Hedging is the failure mode this skill
exists to prevent — "it depends" is what the page already said, and repeating it back costs
the user a turn.

This skill runs in the **main loop**, because a discussion needs the user in it and a
subagent cannot ask them anything. It is read-only: nothing under `site/` is written from
here, ever.

**You may teach.** Explaining a mechanism, drawing the failure branch, walking the
arithmetic — all of that is in scope, unlike the grill skills, which forbid it. What is out
of scope is teaching something the page does not say and letting it sound like the page.

## 1. Resolve the reference — never open the `.html`

The corpus is millions of tokens and half of any page is markup, so one raw page costs
thousands of tokens against ~180 for a block. A `file://` URL, an absolute path and a bare
name are all the same thing: **an id plus an optional block**.

```
file:///Users/…/site/designs/persona-identification.html#deepdives-dive-3
        └─ id: persona-identification ─┘          └─ block: deepdives ─┘
```

Strip the directory and `.html` for the id; a `#fragment` names the block, and an element
fragment (`#tradeoffs-con-2`) names its block and the line to open on. **`Read` and
`WebFetch` on a `site/**.html` file are wrong here, always.** If `kb.mjs get` returns
nothing, the id is wrong — `kb.mjs ls --kind design` lists them.

## 2. Open where the argument is

Send the page and the user's opening question to the **kb-page-analyst** agent. It returns
a discussion pack — decision points, rejections, admitted tensions and thin spots, each
with an anchor — for about 900 tokens instead of the whole page, so the main context holds
the argument rather than the prose.

When subagents are not permitted in the session, say so plainly and read inline, in this
order:

```
node scripts/kb.mjs get <id> --block tradeoffs      # the page's own confession, first
node scripts/kb.mjs get <id> --block requirements   # the FRs, and the NFR numbers
node scripts/kb.mjs get <id> --block sizing         # the figures, and the verdict per candidate
node scripts/kb.mjs get <id> --block deepdives      # only when the question lands here
```

Read `tradeoffs` first. Its lead names the biggest flaw as a deliberate choice, so it tells
you what is worth arguing about before you have read a line of `architecture`. Read a deep
dive only when the question touches it — that block is the heaviest on the page.

A page of any other kind opens the same way on its own blocks: `tradeoffs` where the kind
has one, then the block the question names.

## 3. The moves

A discussion is a handful of recurring shapes. Name the shape to yourself, then answer it
where the answer already lives:

| they say | they are asking for | where it already is |
|---|---|---|
| "why X and not Y?" | the rejection the page already made | the `sizing` verdict row, the dive's rejected alternative, an `alternative-to` edge |
| "what if the NFR doubled?" | the page's own sensitivity | the `sizing` numbers, and the exits the owning dive lists in order |
| "does this actually hold?" | an adversary | the `design-critic` agent, checked against the page's `tradeoffs` risks |
| "what else could it have been?" | alternatives with backing | the `kb-scout` agent, or `kb.mjs related <id>` |
| "how does it compare to Y?" | one axis, not two summaries | the same block on both pages |
| "explain dive N" | to be taught | the dive itself, at the level they read at |
| "would you do it differently?" | your position | yours, stated and priced |
| "this bit is wrong" | a verdict on the page | page fault → **kb-design-review**; misreading → teach it |

Three of these carry most of the weight:

- **"Why X and not Y" is almost always already answered.** Designs record their rejections:
  the `sizing` block's verdict-per-candidate table exists to put them on the record, and
  every deep dive names what it rejected on the way. Quote the page's reason first, then say
  whether it holds. Inventing a rejection the page never made is the fastest way to lose the
  user's trust in every later citation.
- **"What if the requirement changed" is arithmetic, not opinion.** Take the `sizing`
  figure, apply the change, and say which verdict flips and at what threshold. Designs name
  their own exits in order ("partial indexes, then partitioning, then a broker"), so the
  answer is usually the next exit on the page's list rather than a new architecture. When
  the page states no figure to move, say so — an unstated number is a thin spot, not a
  licence to invent one.
- **"Would you do it differently" needs an answer.** Give one position, the cost you accept
  for it, and the condition under which you would switch back. A peer who will not commit is
  a search engine with extra steps.

Ask a question back only when the answer changes your reply — the user's real constraint,
their scale, which of two readings of the page they hold. One at a time, in prose. This
skill does not use the question UI; batched rounds are the grill skills' mechanic.

## 4. Every claim carries an id

Each thing you say the page says gets its stable anchor: `…#requirements-nfr-2`, `…#sizing`,
`…#deepdives-dive-3`, `…#tradeoffs-con-1`. Anchors are what let the user check you
mid-argument, which is the difference between a discussion and a chat.

**If `kb.mjs` did not print it, the page does not say it.** Mark your own additions as your
own — "the page does not address this; my read is …". Never paste a paragraph when its
anchor will do, because the user can open it.

One anchor is safe to write unseen. `kb.mjs get` echoes ids for list items and paragraphs
but never for headings, so a deep dive's own anchor never shows in its output; the build
mints `deepdives-dive-N` in order, so the dive printed as "3 · …" is `#deepdives-dive-3`.
Every other heading id stays uncited rather than guessed, and neither case is a reason to
open the `.html`.

## 5. Who you hand the work to

| the turn needs | send it to | why |
|---|---|---|
| the whole page, compactly | **kb-page-analyst** agent | the pack costs ~900 tokens; the page costs thousands |
| cited KB backing for an alternative | **kb-scout** agent | candidates plus the governing theme's decide row, ≤500 tokens |
| "would this actually break" | `design-critic` agent | hazards, antipatterns and a load walk, with severities |

Launch these **only when subagents are permitted in the session**. When they are not, run
the cheap inline substitute and say that you did:

```
node scripts/kb.mjs brief "<the tension under discussion>" --n 5
node scripts/kb.mjs related <id>
```

## 6. Where a discussion ends

Discussions conclude somewhere else, and naming the exit is part of the answer:

| the conclusion | the handoff |
|---|---|
| the page is faulty | **kb-design-review** — "that is a finding; want me to review the block properly?" |
| a change is agreed | **kb-edit** — "approve and I'll apply it with kb-edit" |
| they want to be tested | **kb-grill-design** for a case study, **kb-grill-page** for any other kind |
| it turned into a choice | **kb-find** for one symptom, **kb-compose** for a requirement set, `alt-pick` or `stack-pick` for products |

Never cross the handoff yourself. Do not write the findings list, do not edit the page, and
do not draft replacement prose in chat as though it were the fix — an approved edit is
**kb-edit**'s job and it starts from the block, not from your paraphrase.

## What this skill is not

- **Not [kb-design-review](../kb-design-review/SKILL.md).** That produces a severity-ranked
  findings list judged against each block skill's stated self-check. This one argues, and
  hands over the moment the argument concludes the page is wrong.
- **Not [kb-grill-design](../kb-grill-design/SKILL.md) or
  [kb-grill-page](../kb-grill-page/SKILL.md).** Those test the reader and forbid teaching.
  Here the user asks the questions and teaching is allowed.
- **Not [grill-me](../grill-me/SKILL.md).** That interrogates a proposal that does not exist
  yet into requirements. Here the page exists and is the thing under discussion.
- **Not [kb-find](../kb-find/SKILL.md).** That answers a symptom with a pattern. This one
  starts from a page the user already has and stays on it.
- **Not [kb-edit](../kb-edit/SKILL.md).** Nothing under `site/` is written from a
  discussion, however convincing the argument got.

## Self-check

1. Did every read go through `kb.mjs`, with no tool call opening a `site/**.html`?
2. Does every claim about the page carry a stable anchor a reader can click?
3. Is everything that is yours rather than the page's marked as yours?
4. Did you take a position when asked for one, with its cost and its flip condition?
5. Was each "why not Y" answered from the page's own rejection before any new argument?
6. Did a "what if" answer move a stated figure, or say plainly that the page states none?
7. Did the page reading go through **kb-page-analyst**, or was the inline fallback stated?
8. Did the turn end pointing at the right handoff, with nothing edited and no findings list
   written here?
