---
name: kb-grill-page
description: "Quiz the reader on one pattern, hazard, theme, principle, capability or comparison page in batched rounds, graded against the page, ending in a gap list of cited ids. Use when someone says 'grill me on circuit breaker', 'quiz me on this pattern', 'help me learn this page'. Not for case studies (kb-grill-design) or open talk (kb-discuss)."
---

# Grilling a reader on a KB page

**The deliverable is a scored gap list, not a lecture.** You ask; they answer; you grade
against the page and cite where the answer lives. Explaining mid-grill is the failure
mode — the page already explains it better than an interruption can.

The corpus is millions of tokens. **Never open a page file — `docs/**.md`, or the HTML
`make site-build` writes.** Everything comes through `node scripts/kb.mjs`.

## 1. Resolve the page and pick the ladder

A name, an alias, a `file://` URL, a `docs/**.md` path (the folder is nested by band or group, so resolve the real path with `node scripts/kb.mjs get <id>` or `ls`, never assume `docs/<kind>s/<id>.md`) or a built
`site/dist/<kind>s/<id>.html` all resolve the same way: the id is the basename minus `.md`
or `.html`. With nothing named, or with a topic rather than a page ("grill me on three
caching patterns"), select with `ls` or `find` and confirm the set before starting.

```
node scripts/kb.mjs ls --band caching                    # pick a set
node scripts/kb.mjs find "my thread pool is exhausted"   # topic → page
node scripts/kb.mjs get circuit-breaker --json           # kind, tags, solves
node scripts/kb.mjs get circuit-breaker --block usage    # ~180 tokens, not ~4k
```

The page's kind (its top folder under `docs/`; `kind` in the `--json` output) chooses the
ladder. Read blocks one round at a time — you only
need a block to grade the round that covers it, and reading the whole page first is how
a grill turns into a recital.

**Route a `design` page to [kb-grill-design](../kb-grill-design/SKILL.md)** — it is a
worked case study with six blocks this skill has no ladder for, and its own Mid/Senior/
Staff+ rubric to grade against.

## 2. The rounds

Ask through the question UI (AskUserQuestion), **up to 4 questions per round**. Rules
per question:

- **Never quote the answer into the question.** Open from the symptom, not the name:
  the page's frontmatter `solves` list is a ready-made supply of "you observe X — what
  now?" openers written in exactly the vocabulary of someone who does not yet know the page.
- **Options are honest alternatives.** Every distractor must be a real technique, often
  a genuine sibling from `kb.mjs related`. Each option's description states its
  consequence, not its verdict.
- **One topic per question.** Never compound. Split it or drop the weaker half.
- **Build on the answers.** A wrong answer earns a follow-up next round, not a
  correction on the spot. A right answer earns the harder version of itself.
- **Grade silently until the end.**

**Hard cap: 4 rounds** for a single page — these are far shorter than a case study.
Grilling a set of pages runs one round per page plus a final cross-page round, capped
the same way.

## 3. The ladders

One round per group, in the page's own block order:

| kind | ladder |
|---|---|
| pattern | the symptom it answers → the topology walk (which component talks to which, in order) → the variations and when each wins → the tradeoffs → **when NOT to reach for it** → real implementations → the production knobs and the signal that says it is misconfigured |
| hazard | the symptoms as observed → how it grows → what it costs → what mitigates it, and which pattern that is a hop away |
| principle | state it in one sentence → why it helps → how you honour it in code → **how it fails when taken too far** |
| theme | the tension it names → the decide table: given these conditions, which way and why → the tour members and each one's role |
| capability | the provider-neutral taxonomy, with no product names → what each cloud calls each shape → what breaks when you move, and what that costs |
| comparison | the contenders and their shapes → the deciding conditions → the verdict per condition, starting with the null option |

**Two rungs carry most of the value, and both are the ones readers skip.** For a pattern
it is *when not to use it* — anyone can recite what a circuit breaker does, and the
`usage` block's "Avoid when" half is what separates recall from judgement. For a
principle it is `overreach`, the mandatory honest block about how the maxim fails when
followed too hard. Never drop either to save a round.

Two openers beat everything else at starting a round, because both are already written
in non-jargon on the page:

- **`solves`** (frontmatter) — the symptom sentences. "Adding a payment provider means
  editing a huge switch statement. What would you change?"
- **The `explain` block** — the plain-words explanation. Ask them to tell it back, and to say which alternative it beats and what it costs, before any other block is read.


## 4. Flags

- `--blocks <list>` — grill only these blocks, one round each.
- `--quick` — one round of 4 questions from the whole page, no ladder.
- Several ids, or a `--band` / `--tag` selection — one round per page, then a final
  round that asks them apart ("both bound concurrency — when does one beat the other?").
  This last round is the point of grilling a set, so never drop it.

## 5. The scorecard

The output, in this order:

- **Verdict** — one sentence on whether they could reach for this page unprompted, and
  where the understanding stops. Never a percentage.
- **Held up** — what they got, one line each. Short.
- **Gaps** — one line per miss: what was asked, what the page says, and the **stable
  id** it says it at (`circuit-breaker.md#tradeoffs-con-2`). This is what they re-read.
- **Confusions worth naming** — where an answer belonged to a neighbour rather than this
  page. Check with `kb.mjs related <id>`; the graph already records which pages get
  confused for each other, and naming the neighbour is more use than marking it wrong.
- **Next** — the two or three ids to re-read, and an offer to re-grill on `--blocks`
  covering only those.

Every gap carries an id. A gap the reader cannot navigate to is a complaint.

Offer to mark the page practiced only after a grill with no gaps.

## What this skill is not

- **Not [grill-me](../grill-me/SKILL.md).** That interrogates a proposal into
  requirements — the subject does not exist yet and the user is the authority. Here the
  page is the authority and the user is under test.
- **Not [kb-grill-design](../kb-grill-design/SKILL.md).** That grills a case study under
  `docs/designs/`, on a longer ladder and against the page's own seniority rubric.
- **Not [kb-find](../kb-find/SKILL.md).** That answers a question from the corpus. This
  one refuses to answer and asks instead.
- **Not [kb-discuss](../kb-discuss/SKILL.md).** There the user asks and you may teach.
  Here you ask and must not.
- **Not a tutor.** If the reader wants to be taught, send them to the page and offer to grill afterwards.

## Done means

- No question quoted the answer, and no distractor was a straw man.
- Every round went through the question UI with ≤4 questions, within the 4-round cap.
- The ladder matched the page's kind, and a `design` page was routed away.
- A pattern grill asked when NOT to use it; a principle grill asked its `overreach`.
- A multi-page grill ended with the round that tells the pages apart.
- Every gap cites a stable id that resolves, and no gap cites a block the grill never
  asked about.
- Nothing was taught mid-grill.
