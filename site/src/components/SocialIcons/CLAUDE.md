# SocialIcons

## Intent

Starlight's social links, with the page-metadata button placed beside them.

## Purpose

The one override that reaches the header row without owning all of it.

## Gotchas

The GitHub link comes from `social` in astro.config.mjs; this only adds PageMeta in front of it.

## Tradeoffs

Overriding a slot to add a button, rather than forking the header.
