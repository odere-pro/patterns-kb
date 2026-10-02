# TocTracking

## Intent

The on-this-page rail, and the module that marks the heading being read. It lists every heading of the page.

## Purpose

Upstream's markup without its module script: the reading position is tracked by the bundle, which also runs from a folder. Only the desktop rail is overridden (`TableOfContents` in `astro.config.mjs`); the phone's "On this page" bar stays upstream's, script and all.

## Gotchas

The rail is chrome and carries `data-kb-skip`; its title is a `<p>`, not a heading, so the page outline starts at the H1. Depth is capped at H3 in astro.config.mjs.

## Tradeoffs

Two rails' worth of markup maintained here, against a rail that is inert from a folder.
