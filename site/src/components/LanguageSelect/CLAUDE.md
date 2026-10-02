# LanguageSelect

## Intent

An override that renders nothing.

## Purpose

The site has one locale, so the picker never shows, and overriding it keeps its script off every page.

## Gotchas

Removing the override brings back a custom-element script on every page with nothing to pick.

## Tradeoffs

An empty component to maintain, against a script shipped for nobody.
