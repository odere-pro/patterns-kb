# PageIntro

## Intent

The line under every title: the page's description, left out when the body's first paragraph opens with it word for word (`leadRepeats`, `src/lib/intro.ts`).

## Purpose

Every page opens the same way, with no markup of its own; PageTitle.astro injects it.

## Gotchas

It reads `description` from frontmatter and escapes it, so a description holding markup renders as text.

## Tradeoffs

A description the lead repeats shows only in the lead, so the reader meets it once; the intro paragraph is the page's own and stays.
