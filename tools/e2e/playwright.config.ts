/**
 * The reader's flows over the built site, in a real browser (spec
 * kb.site, the site-e2e gate): each flow a test, each test run four ways.
 *
 *   file-desktop, file-phone      site/dist opened from disk, as `make site-open` does
 *   served-desktop, served-phone  the same files from a local static server (serve.ts)
 *
 *   served-tablet                 served only, at 800px, running the flows tagged @tablet
 *
 * The first two widths are the ends of the layout: 1600px sits above every breakpoint
 * in site/src/styles/layout.css, so the sidebar is pinned and the reading rail
 * shows; 390px is a phone, where the sidebar is a drawer behind the menu button.
 * 800px (50rem) is the first width where cards sit side by side and the sidebar is
 * still a drawer. Only the flows whose title carries `@tablet` run there, so the
 * extra width adds a handful of flows rather than a fifth of the suite; a flow
 * tagged `@tablet-only` runs nowhere else.
 *
 * The browser is the Chromium `make site-deps` installs; this config never
 * downloads one. The runner is `make site-e2e`, through the gate wrapper
 * tools/src/gates/check-site-e2e.ts, which reads the JSON report.
 *
 * Usage: node node_modules/@playwright/test/cli.js test -c tools/e2e/playwright.config.ts
 */

import os from 'node:os';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

import { defineConfig } from '@playwright/test';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(HERE, '../..');

/** The loopback port the served projects read from; KB_E2E_PORT moves it off a busy one. */
const PORT = Number(process.env['KB_E2E_PORT'] ?? 4719);

const FILE_BASE = `${pathToFileURL(path.join(ROOT, 'site/dist')).href}/`;
const SERVED_BASE = `http://127.0.0.1:${PORT}/`;

/** The tag a flow wears to run at the tablet width; `@tablet-only` flows run there alone. */
const TABLET_TAG = /@tablet\b/;
const TABLET_ONLY = /@tablet-only/;

const DESKTOP = { viewport: { width: 1600, height: 1000 } };
const TABLET_VIEW = { viewport: { width: 800, height: 1024 } };
const PHONE = { viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true };

export default defineConfig({
  testDir: HERE,
  testMatch: '*.spec.ts',
  fullyParallel: true,
  forbidOnly: true,
  // A flow that fails once is a finding; a retry would hide the flake that
  // makes the reader's click land nowhere one time in ten.
  retries: 0,
  timeout: 30_000,
  expect: { timeout: 5_000 },
  reporter: [['list']],
  // Outside the tree: a run leaves nothing for git to see.
  outputDir: path.join(os.tmpdir(), 'kb-e2e-results'),
  use: {
    browserName: 'chromium',
    headless: true,
    trace: 'off',
    screenshot: 'off',
    // Every flow starts as a new reader: no stored theme or marks.
    storageState: { cookies: [], origins: [] },
  },
  projects: [
    { name: 'file-desktop', grepInvert: TABLET_ONLY, use: { ...DESKTOP, baseURL: FILE_BASE } },
    { name: 'file-phone', grepInvert: TABLET_ONLY, use: { ...PHONE, baseURL: FILE_BASE } },
    { name: 'served-desktop', grepInvert: TABLET_ONLY, use: { ...DESKTOP, baseURL: SERVED_BASE } },
    { name: 'served-phone', grepInvert: TABLET_ONLY, use: { ...PHONE, baseURL: SERVED_BASE } },
    { name: 'served-tablet', grep: TABLET_TAG, use: { ...TABLET_VIEW, baseURL: SERVED_BASE } },
  ],
  webServer: {
    command: `node_modules/.bin/tsx tools/e2e/serve.ts ${PORT}`,
    cwd: ROOT,
    url: `${SERVED_BASE}index.html`,
    reuseExistingServer: false,
    timeout: 20_000,
  },
});
