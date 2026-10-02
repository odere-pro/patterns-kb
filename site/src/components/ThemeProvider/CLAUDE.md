# ThemeProvider

## Intent

The pre-paint script, without the icon template upstream ships for its dropdown: the theme.

## Purpose

Sets `data-theme` before first paint, so a page never flashes the wrong theme.

## Gotchas

The body must keep the opening that `EXTERNALIZABLE_SCRIPTS` in tools/src/site/site-portable.ts matches, a prefix read after whitespace is collapsed: the post-build pass moves it into a shared file only when it recognises it.

## Tradeoffs

A copy of upstream's snippet to keep in step, for a template nobody reads.
