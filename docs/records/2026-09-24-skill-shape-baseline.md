# Skill shape baseline

On 2026-09-24 none of the 46 skills written before the harness-shape gate met the spec's skill
shape: 46 lacked a "Not for" boundary, 46 a closing "Done means" list, 3 numbered steps and 1 a
"Use when" trigger. On 2026-09-28 all 46 were reshaped, and the gate passes with nothing excused.

## The measurement

The gate reads each skill the way it reads every harness file. On 2026-09-24 it passed only
with 46 allowlist entries, one per skill, each `reason` naming what its skill lacked. The
commit that added the list still holds them, so the day's figures read back from git: the
entries with their reasons, then the skills that closed on a "Self-check" section.

```bash
base="$(git log --diff-filter=A --format=%h -- docs/data/allow/harness-shape.json)"
git show "$base:docs/data/allow/harness-shape.json" | jq -r '.entries[] | "\(.name): \(.reason)"'
git grep -lE '^#+ Self-check' "$base" -- '.claude/skills/*/SKILL.md' | wc -l
```

The check that holds the fix today is the gate itself, `make gate G=check-harness`: since
2026-09-28 it reports `0 excused`. Add an entry back and the gate fails it for excusing
nothing; a skill that drifts from the shape fails with its file and line.

## Scope

The 46 skills under `.claude/skills/` on 2026-09-24, read by `tools/src/gates/check-harness.ts`
for the shape kb.harness.skills-and-agents fixes: a `description` holding a trigger and a
boundary, and a body that states the gap, then numbered steps, then ends with a "Done means"
list. The six skills added the same day (`docs-sweep`, `gate-red`, `page-audit`,
`retire-gotcha`, `site-audit`, `site-component`) were written in the shape and are not counted.

## Fixed, and what holds it

- Three dead links, in `kb-design-levels` (two) and `kb-design-relationships` (one), resolved
  against the repo root instead of the skill's folder. The harness-routes gate holds them now.
- Scratch routes into `tmp/` in `kb-fact-check`, `kb-harvest`, `kb-intake`, `site-extract` and
  `sys-design`. Each now names its tool's own folder beside the command that makes it, or no
  path at all. The harness-routes gate holds them now.
- Fifteen lines that said a hook runs a check after each edit: thirteen in eleven skills, one
  in `diagram-draw`'s site-embedding reference and one in `site/assets/CLAUDE.md`. The
  after-edit hook only names the check. No gate holds this; the claim-audit agent reads it in
  the next sweep.
- On 2026-09-28, all four gaps below in all 46 skills. Each description now says "Use when …"
  and "Not for …", naming the skill that owns the neighbouring job, and each body states the
  gap, then numbered steps, then ends on a "Done means" list; the 33 "Self-check" sections
  became that list or sit just above it. Every instruction was kept true for today's HTML
  source and `kb.mjs`. The harness-shape gate holds them now, with its allowlist empty.

## Open findings

None. The gaps as measured on 2026-09-24, all fixed on 2026-09-28:

| Gap | Skills |
| --- | --- |
| No "Not for" boundary in the description | 46 |
| No closing "Done means" list | 46, of which 33 close on a "Self-check" section instead |
| No numbered steps | 3: `kb-find`, `kb-sketch`, `kb-verify` |
| No "Use when" trigger (the description says "Use whenever") | 1: `kb-find` |

## Not audited

- Whether each numbered step is one command or decision: the gate counts numbered steps, it
  does not read them.
- Whether each skill's instructions are still true. That is the claim-audit agent's reading,
  run by the docs-sweep skill.
- The five agents written before the gate. Their descriptions and `kb-author`'s reply section
  were fixed the same day, so none is open.
