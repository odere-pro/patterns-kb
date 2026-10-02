// The sidebar a page shows: the top-level areas, and the pages of the branch
// the reader is in. Pure, over Starlight's own sidebar entries, so the render
// test and the override share one answer.
//
// Starlight lists every page of the site on every page, some 7,400 characters
// of titles; on a hub or a map page, whose own text is a short list, that made
// the page mostly navigation for a machine reader and a long scroll for a
// person. The structure file already nests the site as a tree, so the current
// branch is the tree's path to the page: every group on that path stays open
// with its entries, and every other group becomes one link to its hub, named
// by the group and wearing the group's look, bold with a caret (./sidebar.css),
// so every row that leads to an area looks alike. On the home page nothing is
// current, so the sidebar is the top-level areas alone.
//
// It trims what the page renders, never the route data: Starlight's
// pagination walks the full sidebar, so the pager's previous and next are
// untouched (../NextSteps).
import type { StarlightRouteData } from '@astrojs/starlight/route-data';

/** One entry of Starlight's sidebar: a link or a group of entries. */
export type SidebarEntry = StarlightRouteData['sidebar'][number];
type SidebarLink = Extract<SidebarEntry, { type: 'link' }>;

/** Does this entry hold the page being read, at any depth? */
export function holdsCurrent(entry: SidebarEntry): boolean {
  return entry.type === 'link' ? entry.isCurrent : entry.entries.some(holdsCurrent);
}

/**
 * The group's hub: its first direct link, the "Overview" row the site config
 * writes at the top of every area. Undefined for a group with none.
 */
export function hubLink(group: SidebarEntry): SidebarLink | undefined {
  if (group.type !== 'group') return undefined;
  return group.entries.find((e): e is SidebarLink => e.type === 'link');
}

/**
 * The current branch of `sidebar`: links as they are; a group holding the
 * page open, its entries trimmed the same way; any other group one link to its
 * hub under the group's label. A group with no hub link stays a closed group,
 * so nothing it lists becomes unreachable.
 */
export function currentBranch(sidebar: readonly SidebarEntry[]): SidebarEntry[] {
  return sidebar.map((entry): SidebarEntry => {
    if (entry.type === 'link') return entry;
    if (holdsCurrent(entry))
      return { ...entry, collapsed: false, entries: currentBranch(entry.entries) };
    const hub = hubLink(entry);
    if (hub === undefined) return { ...entry, collapsed: true };
    return {
      type: 'link',
      label: entry.label,
      href: hub.href,
      isCurrent: false,
      badge: entry.badge,
      attrs: { class: 'kb-sidebar-branch' },
    };
  });
}
