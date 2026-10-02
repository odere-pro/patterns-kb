// Whether a page's "On this page" outline is worth a rail.
//
// An outline of one entry (a hub's lone "Overview") says nothing the title
// does not, and its rail holds a 300px column empty. Starlight draws no rail and
// no mobile outline bar for a page with no `toc`, so the route middleware drops
// one that holds fewer than MIN_ENTRIES entries.

/** One entry of Starlight's outline, with the headings nested under it. */
export interface OutlineItem {
  children?: readonly OutlineItem[];
}

/** The fewest entries an outline needs to be shown. */
export const MIN_ENTRIES = 2;

/** Every entry of an outline, nested ones included. */
export function entryCount(items: readonly OutlineItem[]): number {
  return items.reduce((n, item) => n + 1 + entryCount(item.children ?? []), 0);
}

/** Does the outline hold enough entries to show? */
export function worthShowing(items: readonly OutlineItem[]): boolean {
  return entryCount(items) >= MIN_ENTRIES;
}
