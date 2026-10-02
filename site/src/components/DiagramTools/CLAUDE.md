# DiagramTools

## Intent

Zoom, fit and fullscreen for the diagram figure `tools/src/lib/site-markdown.ts` builds around each inline SVG.

## Purpose

A wide flowchart stays readable in a narrow column: the reader pans and zooms instead of squinting.

## Gotchas

The figure markup is built at build time by the rehype plugin; this folder owns only the behaviour and the paint. The buttons carry `data-kb-diagram-act` hooks; rename one in both places.

Below 76rem the stage has a minimum width (`--kb-diagram-min`, set by the script from the drawing's viewBox so its labels come to 11px) and the canvas scrolls sideways inside its own frame; the script skips fit-to-frame there. Fullscreen refits and drops the minimum.

## Tradeoffs

The toolbar is hidden with no script, so the figure still frames the diagram when nothing runs.
