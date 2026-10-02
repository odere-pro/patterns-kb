# PageMeta

## Intent

The header button and dialog showing what a machine reads on the page.

## Purpose

Makes the page facts visible to a person, read live from the head so the dialog cannot drift from what is emitted.

## Gotchas

The dialog ships empty and is filled by `page-meta.client.ts`; with no script the button is hidden, because an empty panel is worse than none. Starlight renders the SocialIcons override twice (header and phone menu), so the markup arrives twice: the module keeps one dialog and moves it to `<body>`, since a modal inside the header's hidden wrapper on a phone would paint nothing and still make the page inert.

## Tradeoffs

A little chrome on every page, for facts that are otherwise invisible.
