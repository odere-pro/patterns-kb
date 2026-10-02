---
name: site-component
description: "Build or change the Astro site's UI under site/src/ — scaffold a component folder and wire it in, or restyle the shared stylesheets — and prove it builds. Use when adding a card, header control or client behaviour, or asked to \"change the colours\", \"fix the dark theme\", \"adjust spacing\" or \"fix the mobile layout\". Not for page content (kb-edit)."
---

# Add a site component

A component is a folder, and everything about it lives there. Built any other way, a component
lands half-wired: a stylesheet nothing loads, a behaviour module the entry never calls, a class
carrying a fact. This skill creates the folder and proves it passes. It applies to the Astro
site under `site/src/`, built from the pages under `docs/`; the rules are
[component-authoring.md](../../rules/component-authoring.md) and
[page-schema.md](../../rules/page-schema.md).

The shared stylesheets have their own page here, read before the steps below:

- **The shared stylesheets** — `site/src/styles/tokens.css`, `layout.css`, `primitives.css`,
  and the rules every stylesheet keeps (colours from `--sl-*`, a literal only in the token
  file): [references/shared-styles.md](references/shared-styles.md). A change there is steps
  6 and 7 below, not a new folder.

1. **Decide the shape.** Does it render markup? Then it needs `<Name>.astro`. Does it need
   behaviour? Then `<name>.client.ts` and `<name>.client.test.ts`; a hover effect is CSS, which
   works with scripts off. Does it carry knowledge? Navigation, controls and badges do not: put
   `data-kb-skip` on the root, or wrap a root you do not own. Knowledge the markup shapes goes
   in a class-free child holding only bare `data-*` facts — never a class and a fact on one
   element.
2. **Name the hooks.** Every behaviour hook is a `data-kb-*` attribute a stranger would guess
   (`data-kb-diagram-act="fit"`), never a class; a class says what a thing is.
3. **Create the folder** `site/src/components/<Name>/`: the `.astro` file opening with a comment
   on what it is and why, props typed, and no `<script>`, `<style>` or inline `style=`; a
   stylesheet whose classes start `kb-` and whose values come from the `--sl-*` properties or the
   token stylesheet; a behaviour module exporting `init(doc)` with no top-level side effects,
   and its test covering the case it exists for plus one hostile case; and a `CLAUDE.md` with
   the four headings `Intent`, `Purpose`, `Gotchas` and `Tradeoffs` in at most 40 lines. Copy
   the nearest existing component rather than starting blank.
4. **Wire it in**: the stylesheet into the site config's CSS list, `init` into the client entry
   module, and an override into the config's component map when it replaces a built-in one.
5. **Check its nested layer.**

   ```bash
   make gate G=check-claude-md
   ```

6. **Build and run the site gates.**

   ```bash
   make site-build
   ```

7. **Read the page it landed on twice**: once in a browser from disk, where the console must be
   empty, and once as a machine with the [page-audit](../page-audit/SKILL.md) skill.

## Client behaviour

The rules a behaviour module keeps, whichever component it sits in:

- **State on the element, paint in CSS.** A module sets an attribute or a class; it never sets
  an inline style or a colour.
- **Default by absence.** A stored value that matches the default is deleted, not written:
  the auto theme, a favourite flipped back to the page's own answer, an unmarked practiced
  page. The store rules live once, in `site/src/lib/store.ts`.
- **Pre-paint work stays tiny** and stays in `ThemeProvider`, which applies the stored theme
  before first paint.
- **Hide with what exists**: `<details>` for disclosure, the `hidden` attribute for the hub
  filter. No new hide mechanism.
- **Keyboard first.** Every control is reachable by Tab, works with Enter and Space, and
  carries a true `aria-label` or `aria-pressed`.
- **A change that seems not to apply** is often a stale build: run `make site-clean` after a
  remark or rehype plugin change, because Astro caches rendered markdown.

## Done means

- Every file step 3 names exists, and the `CLAUDE.md` says something a person did not already
  know.
- `make gate G=check-claude-md` and `make site-build` exit 0.
- No stray `<style>`, inline script or unexplained dependency is in the diff.
- No element carries both a class and a fact.
