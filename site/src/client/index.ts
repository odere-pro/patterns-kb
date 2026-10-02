// The one kb script every page loads.
//
// esbuild bundles this into public/kb.js as a classic IIFE, and Head.astro
// emits the single `<script is:inline src="/kb.js" defer data-kb="bundle">`
// tag that loads it. An ES module never executes from file://, and these pages
// are meant to open by double-click; Astro's own <script> pipeline always emits
// type="module", so the bundle is built outside it and served from public/.
// `defer` means every init() below runs after the document is parsed.
//
// Adding behaviour: write a `<name>.client.ts` in its component folder
// exporting `init(doc: Document)`, with no top-level side effects, and add one
// line here. index.test.ts fails a module on disk this file does not import.
import { init as copy } from '../components/CopyButton/copy.client';
import { init as diagramTools } from '../components/DiagramTools/diagram-tools.client';
import { init as facets } from '../components/Facets/facets.client';
import { init as favourites } from '../components/Favourites/favourites.client';
import { init as marks } from '../components/Marks/marks.client';
import { init as menuToggle } from '../components/MobileMenuToggle/mobile-menu-toggle.client';
import { init as metaDialog } from '../components/PageMeta/page-meta.client';
import { init as practiced } from '../components/Practiced/practiced.client';
import { init as search } from '../components/Search/search.client';
import { init as sidebarScroll } from '../components/SidebarScroll/sidebar-scroll.client';
import { init as themeToggle } from '../components/ThemeToggle/theme-toggle.client';
import { init as tocTracking } from '../components/TocTracking/toc-tracking.client';

for (const init of [
  copy,
  diagramTools,
  facets,
  favourites,
  marks,
  menuToggle,
  metaDialog,
  practiced,
  search,
  sidebarScroll,
  themeToggle,
  tocTracking,
]) {
  // One broken behaviour must not take the others down with it.
  try {
    init(document);
  } catch (err) {
    console.error('[kb] client init failed', err);
  }
}
