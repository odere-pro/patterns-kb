# MarkdownContent

## Intent

Starlight's wrapper around the rendered body, carrying `data-kb-region`: the hook that names the knowledge region.

## Purpose

Gives the post-build pass, the search payload, the site gates and the built round-trip one answer to "where is this page's knowledge", written once per page by the build (spec blocks-C11).

## Gotchas

The element keeps Starlight's class and stylesheet, so the page paints as upstream's does. `data-kb-region` is a hook, never a fact: nothing reads a value from it. Exactly one element per page carries it; the pass refuses a page with none or two. The prerequisite card renders first inside it: knowledge, never skip-marked.

## Tradeoffs

A copy of upstream's one-line component, so a Starlight upgrade that changes its wrapper must be copied here by hand. The other way, finding the region by a class, would break silently on that same upgrade.
