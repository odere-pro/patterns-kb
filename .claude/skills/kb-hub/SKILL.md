---
name: kb-hub
description: Change the hub page (site/index.html) or decide where a page appears on it — the eleven numbered sections, their subsections, the tile markup, and every editorial ordering array in scripts/lib/model.mjs (BANDS, THEME_GROUPS, DESIGN_GROUPS, HAZARD_ORDER, PRINCIPLE_GROUPS, CAPABILITY_ORDER, COMPARISON_ORDER). Use when someone asks to "add a section to the hub", "reorder the hub", "my new page isn't on the index", "regroup these patterns", "split this subsection", "change the section numbering", "rename a section heading", "add a tile badge", "why is index.html stale", or is adding a non-pattern page and has to place it.
---

# The hub

`site/index.html` is **generated in full** by `scripts/build-hub.mjs` and `make check`
compares it **byte for byte**. Never edit it. Every hub change is a change to the builder
or to an ordering array in `scripts/lib/model.mjs`.

```
node scripts/build-hub.mjs            # rebuild
node scripts/build-hub.mjs --check    # what make check runs
```

## The anchor contract — read this before touching a heading

`scripts/lib/template.mjs` bakes `index.html#<anchor>` into **every page's breadcrumb and
prev/next** at scaffold time. About 757 links across the corpus point at hub anchors, and
`check-links.mjs` strips the fragment before resolving — so **a renamed anchor is 757
silently dead links that no checker sees.**

These ids must keep their exact spelling:

```
band-gof-h  band-ent-h  band-arch-h  band-dist-h  hazards-h  design-cases-h
ml-cases-h  themes-h  lenses-h  principles-h  capabilities-h  comparisons-h
lens-{conc,msg,cache,ddd,fp,test,sec,fe,ml}-h
```

`ml-cases-h` outlived the section it named — it now rides on the case-study tier that holds
the ML studies (`ML_TIER_ANCHOR` in build-hub.mjs). Do not drop it.

**Run this gate after every hub build.** It is the one check `make check` does not do:

```bash
comm -13 <(grep -o 'id="[a-z0-9-]*-h"' site/index.html | sed 's/id="//;s/"//' | sort -u) <(grep -rho 'index\.html#[a-z0-9-]*' site --include='*.html' | sed 's/.*#//' | sort -u)
```

Empty output means every referenced anchor still exists. Anything printed is a dead link.
Renaming an anchor anyway means editing `template.mjs` **and** rescaffolding 354 pages —
treat it as its own change, never as part of another one.

## Where a page appears, and in what order

| Kind | Placed by | Notes |
|---|---|---|
| pattern | its own `data-kb-band` / `data-kb-group` | automatic; no array to edit |
| hazard | `HAZARD_ORDER` | flat |
| theme | `THEME_GROUPS` | 5 groups; `THEME_ORDER` is the derived flattening |
| design + ML case study | `DESIGN_GROUPS` | 3 complexity tiers; `DESIGN_ORDER` derived |
| principle | `PRINCIPLE_GROUPS` | 2 groups; `PRINCIPLE_ORDER` derived |
| capability | `CAPABILITY_ORDER` | flat |
| comparison | `COMPARISON_ORDER` | flat, shadows `CAPABILITY_ORDER` |

**A non-pattern page missing from its array used to vanish silently** — it validated clean,
built clean, and simply never appeared on the map. `host-header-rewriting` shipped that way
and nobody noticed. build-hub.mjs now fails on any unplaced non-pattern page, so the failure
you will actually meet is:

```
on no hub section — add each to its ordered list in scripts/lib/model.mjs:
  hazard: some-id
```

Add the id to the right array. That is the whole fix.

The `*_ORDER` arrays for capabilities, comparisons and designs are **filtered to pages that
exist**, so a section can be populated one page at a time — an id listed before its page
lands is not an error.

`data-kb-order` is a different thing: it sorts **patterns within a group**, and the hub
reads it only through `graph.json`. It does not place non-pattern pages.

## The shape of the page

Eleven sections, numbered **positionally** from the `SECTIONS` array — the numeral is the
index, not a field. The jumpnav is derived from the same array, so the rail and the nav
cannot disagree. Adding a section means adding one entry; everything renumbers.

Four helpers build everything:

| helper | emits |
|---|---|
| `section(s, i)` | `<details class="sec" open data-collapse>` + numeral + `<h2 id>` + count |
| `sub({…})` | `<details class="sub" open data-collapse>` + `<h3>` |
| `tile(n, {…})` | the one tile shape — `.chip` with a checkbox, a link, an optional badge, a star |
| `chip` / `cards` | thin wrappers over `tile` |

**One tile shape for every kind.** A pattern chip and a case-study card used to be different
elements, which cost `search.js` three loops and two id-from-href derivations, and nested a
`<button>` inside an `<a>`. Every tile now carries its own `data-id`. Keep it that way:
a new tile variant is a modifier class, never a new element.

Two attributes on a tile are easy to confuse:

- **`data-sect`** — the collapse key of the section it is counted under. Ours to name.
- **`data-band` / `data-group`** — the taxonomy, patterns only. Not ours to rename, and
  also what `progress.js` uses to compute the patterns-only half of the headline.

That is why `sub()` takes **`countKey` separately from `key`**: `key` is namespaced for the
collapse store, while the counter must match what the tiles themselves carry. Conflating
them freezes a subsection counter at its build-time value, silently.

## Colour

Three tones, set with `data-tone` on the section and read by everything below through
`--band-color` / `--band-soft`: default **blue** (`--accent`), `brass` on Lenses, `hazard`
on Hazards. Changing a section's colour is one field in build-hub.mjs — the numeral, count
pill, checkbox and tile hover all follow. Do not add per-section colour rules to `hub.css`;
see the **kb-styles** skill.

## Splitting or regrouping a band

A group id normally names its folder. A group may instead carry a **`dir` alias** in
`BANDS`, which lets two groups share one directory — that is how `distributed-routing` /
`distributed-scale` and `distributed-coordination` / `distributed-data` split without moving
27 files or rewriting every relative link into them. `folderFor()` in model.mjs is the only
place that resolves it, and every caller goes through it.

Moving pages between groups is the **kb-move** skill.

## Self-check

1. `node scripts/build-hub.mjs` — it fails loudly on an unplaced page or a case study with
   no kind tag.
2. Run the **anchor gate** above. Empty output, every time.
3. `make all && make check` — the hub is regenerated by `make all`, and a section change
   also moves `map/graph.html` and `map/stack.html`.
4. `make test`.
5. Look at it: `make serve`, then check the new section collapses, its counter moves when
   you tick a tile, and a search that matches only that section leaves it standing alone.
   Client-side behaviour is the **kb-site-ui** skill.
