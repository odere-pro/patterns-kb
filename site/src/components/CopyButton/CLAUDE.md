# CopyButton

## Intent

A command chip with a copy button, and the behaviour that also drives Expressive Code's copy button from a folder.

## Purpose

Lets a reader copy a command without selecting it. `copy.client.ts` rides in the bundle.

## Gotchas

Expressive Code's own copy script is a module and never runs from `file://`; this module takes over its button where the bundle runs. The noscript rule in Head.astro hides both where no script runs.

## Tradeoffs

One behaviour for two buttons, at the cost of reaching into markup another package renders.
