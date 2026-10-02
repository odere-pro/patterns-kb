/// <reference types="vitest/config" />
// The reference above is what teaches Vite's `UserConfig` about `test`.
// `astro check` typechecks this file, and `getViteConfig` is typed against
// Vite's config alone — without the augmentation it reports "'test' does not
// exist in type 'UserConfig'", which is a missing type, not a wrong config.
import { getViteConfig } from 'astro/config';

/**
 * Per-file floors for the client modules. The global average lets one weak file
 * hide behind strong ones, so each `*.client.ts` has an entry at what it
 * measures, each figure rounded down; the first entry is the floor a new client
 * module meets until it has an entry of its own. Raise an entry when you raise
 * its file; never lower one.
 *
 * Kept outside the `thresholds` literal so that object stays flat: the
 * command-test sandbox (tools/src/site/site-sandbox.ts) empties it with a
 * pattern that stops at the first closing brace. Exported so the constant is
 * still used when that sandbox has emptied the literal.
 */
export const clientFloors = {
  'src/**/*.client.ts': {
    perFile: true,
    statements: 90,
    branches: 75,
    functions: 90,
    lines: 90,
  },
  'src/components/CopyButton/copy.client.ts': {
    statements: 100,
    branches: 90,
    functions: 100,
    lines: 100,
  },
  'src/components/DiagramTools/diagram-tools.client.ts': {
    statements: 100,
    branches: 96,
    functions: 100,
    lines: 100,
  },
  'src/components/Facets/facets.client.ts': {
    statements: 94,
    branches: 86,
    functions: 93,
    lines: 97,
  },
  'src/components/Favourites/favourites.client.ts': {
    statements: 100,
    branches: 83,
    functions: 100,
    lines: 100,
  },
  'src/components/Marks/marks.client.ts': {
    statements: 98,
    branches: 86,
    functions: 96,
    lines: 100,
  },
  'src/components/MobileMenuToggle/mobile-menu-toggle.client.ts': {
    statements: 100,
    branches: 100,
    functions: 100,
    lines: 100,
  },
  'src/components/PageMeta/page-meta.client.ts': {
    statements: 100,
    branches: 91,
    functions: 100,
    lines: 100,
  },
  'src/components/Practiced/practiced.client.ts': {
    statements: 100,
    branches: 87,
    functions: 100,
    lines: 100,
  },
  'src/components/Search/search.client.ts': {
    statements: 97,
    branches: 93,
    functions: 96,
    lines: 99,
  },
  'src/components/SidebarScroll/sidebar-scroll.client.ts': {
    statements: 100,
    branches: 100,
    functions: 100,
    lines: 100,
  },
  'src/components/ThemeToggle/theme-toggle.client.ts': {
    statements: 100,
    branches: 100,
    functions: 100,
    lines: 100,
  },
  'src/components/TocTracking/toc-tracking.client.ts': {
    statements: 94,
    branches: 79,
    functions: 100,
    lines: 100,
  },
};

// Astro's getViteConfig(), and this is the change the previous comment here
// asked for: "reach for it the first time a test genuinely needs Astro to
// resolve something, and say so here when you do." The `*.render.test.ts` files
// render `.astro` components through `experimental_AstroContainer`, which needs
// Astro's own resolution for the `.astro` compiler, `astro:content` and the
// `astro:*` virtual modules. The cost is a config load and an Astro version to
// keep in step; the alternative was four data-shaping components with no test
// that ever rendered them.
//
// happy-dom rather than jsdom: the client modules are DOM-only and happy-dom is
// the faster of the two. Each test builds its own Window, so nothing leaks
// between files.
export default getViteConfig({
  test: {
    environment: 'happy-dom',
    include: ['src/**/*.test.ts'],
    coverage: {
      provider: 'v8',
      include: ['src/**/*.ts'],
      // The two fixture modules are the suite's own scaffolding — the same
      // reason tools/vitest.config.ts leaves sandbox.ts out. Code left out of
      // the denominator is a floor lowered without saying so, so this list
      // stays short and every entry is a file the tests are built out of
      // rather than a file the tests are about.
      exclude: ['src/**/*.test.ts', 'src/lib/dom-fixture.ts', 'src/lib/render-fixture.ts'],
      // Both, as tools/ has: the summary is what a run prints, and the html
      // report under site/coverage/ is what to open when a floor is close.
      reporter: ['text-summary', 'html'],
      reportsDirectory: 'coverage',
      // Measured, not aspired — the same doctrine as tools/vitest.config.ts:
      // what the suite achieves with every src/**/*.ts file in the denominator,
      // imported or not. First measured 2026-09-24 when the workspace joined the
      // repo (84.85 / 71.87 / 91.30 / 88.77); raised 2026-09-28 with the reader's
      // components and their tests (92.98 / 82.16 / 96.22 / 95.10), and again
      // the same day with the search box (93.54 / 84.03 / 96.23 / 95.70), each
      // rounded down. content.config.ts and the bundle entry are counted and never
      // imported by a test, and the gap is otherwise the older client modules'
      // DOM branches (DiagramTools most): it closes by testing them. Raise a
      // floor when you raise coverage; never lower one, and never buy headroom
      // by excluding a file.
      thresholds: {
        statements: 93,
        branches: 84,
        functions: 96,
        lines: 95,
        // The per-file floors, spread in: see `clientFloors`.
        ...clientFloors,
      },
    },
  },
});
