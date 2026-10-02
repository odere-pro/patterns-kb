# SidebarScroll

## Intent

Keeps the sidebar scrolled to the current page, from the bundle.

## Purpose

In a long sidebar the reader sees where they are without scrolling to find it.

## Gotchas

Upstream restores the scroll with the inline scripts of its state persister, which the Sidebar override does not render; this module runs in the classic bundle, so it works from a folder too.

## Tradeoffs

One more module in the bundle, against a sidebar that opens at its top on every page.
