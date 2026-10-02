# Head

## Intent

The page head: the `kb:*` meta, the JSON-LD block and the one bundle tag. No search payload tag: the search box loads the payload the first time it opens.

## Purpose

Emits every page fact once, from frontmatter, where the post-build pass reads it back into the article block and the manifest.

## Gotchas

The JSON-LD text holds no `<` (`jsonLdText` escapes it). Both script tags are `is:inline`, and the bundle is a classic script: Astro's pipeline only emits modules, which never run from `file://`. The noscript style is the one style a page carries.

## Tradeoffs

Facts live in the head once and are read back after the build, rather than written twice by two components.
