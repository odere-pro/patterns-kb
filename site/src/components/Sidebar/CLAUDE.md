# Sidebar

## Intent

The sidebar trimmed to the current branch: the top-level areas, with the area holding the page open down to its pages, and every other area one link to its hub; an area with no hub link stays a closed group, so nothing it lists becomes unreachable.

## Purpose

A reader sees where they are and the pages beside them, and a hub or map page stays mostly its own text rather than a list of every page of the site.

## Gotchas

On a phone the menu opens on the reader's own controls (My marks, the theme toggle), then the tree: `MobileMenuFooter` renders first. The home, marks and not-found pages get the sidebar from the route middleware for the menu's sake, and a `data-kb-menu-only` marker lets `sidebar.css` hide the pinned pane on a desktop.

It trims what renders, never `starlightRoute.sidebar`: the pager (`NextSteps`) walks the full sidebar for previous and next. The trim is `current-branch.ts`, pure and tested there; the markup and styles are upstream's `SidebarSublist`.

The link that stands for an off-branch group carries `kb-sidebar-branch` and wears the group look (bold, caret, `sidebar.css`), so every collapsible-looking row looks the same. It is a link, not a `<details>`, because keeping off-branch groups as collapsed groups would put every page title back on every page.

There is no state persister: upstream's restores open groups by position, and the trimmed list has a different shape on every branch. `SidebarScroll` in the bundle keeps the current page in view.

## Tradeoffs

A reader cannot open another area's pages from the sidebar without going to its hub first; the hub lists them all, and search reaches any page.
