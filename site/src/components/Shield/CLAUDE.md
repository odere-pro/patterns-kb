# Shield

## Intent

A wrapper that marks a subtree as chrome with `data-kb-skip` and says why.

## Purpose

Lets a component opt a piece of markup out of what a machine reader reads, with the reason written beside it.

## Gotchas

Never use it inside the article: a skip marker in the knowledge region is a finding of the site data-layer gate.

## Tradeoffs

An extra element around the shielded markup, in return for a reason nobody has to guess.
