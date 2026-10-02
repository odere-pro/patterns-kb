# NextSteps

## Intent

The bar at the foot of every page but the home page: the page before, the hub above, the page after.

## Purpose

A reader who finishes a page needs a way onward that does not go back through the sidebar.

## Gotchas

The next link reads "Next in <area>" when the page after stays in the page's area. The marks page has an up to Home and no before or after; the not-found page has no bar.

Before and after are Starlight's pagination, which walks the sidebar the structure file builds; a hub link shows its area's short label (`pagerLabel` in `src/lib/routes.ts`), never "Overview".

## Tradeoffs

Starlight's own pagination markup is replaced, so its styles do not apply; `next-steps.css` paints the bar.
