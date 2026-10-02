# ThemeToggle

## Intent

One button cycling auto, dark and light, in place of upstream's dropdown.

## Purpose

The theme control works from a folder: its behaviour is in the bundle, not in a module script.

## Gotchas

Auto is stored as the empty string under Starlight's key, because Starlight's pre-paint snippet reads any other value as dark (`src/lib/theme.ts`).

## Tradeoffs

A different control from upstream's, against one that does nothing on a downloaded copy.
