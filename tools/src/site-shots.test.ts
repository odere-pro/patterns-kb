/**
 * The matrix, the guards and the order, never the pixels: whether Chromium drew
 * the right picture is the audit's question, and a person answers it. The run
 * goes through a fake browser that records what it was asked, in order.
 */

import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import { runGate } from './lib/gate.js';
import { expectMisuse, makeSandbox, REPO_ROOT, type Sandbox } from './lib/sandbox.js';
import {
  matrix,
  PAGES,
  shoot,
  shots,
  shotName,
  spec,
  THEMES,
  WIDTHS,
  type ShotBrowser,
  type ShotPage,
} from './site-shots.js';

describe('the matrix', () => {
  it('is every page at every width in both themes, and nothing twice', () => {
    const names = matrix();
    expect(names).toHaveLength(PAGES.length * WIDTHS.length * THEMES.length);
    expect(new Set(names).size).toBe(names.length);
  });

  it('names a file after the cell it is, so a record can cite one', () => {
    expect(shotName('desktop', 'comparison', 'dark')).toBe('desktop-comparison-dark.png');
    expect(matrix()).toContain('phone-home-light.png');
  });

  it('puts one width in each band site/src/styles/layout.css sets', () => {
    const widths = WIDTHS.map((w) => w.width);
    expect(widths.some((w) => w < 800)).toBe(true); // the narrow content pad
    expect(widths.some((w) => w >= 800 && w < 1152)).toBe(true); // no reading rail
    expect(widths.some((w) => w >= 1216 && w < 1560)).toBe(true); // both rails pinned, the narrowest column
    expect(widths.some((w) => w >= 1560)).toBe(true); // both rails pinned, the widest column
  });

  it('says why each page is in the set', () => {
    for (const p of PAGES) expect(p.why.length).toBeGreaterThan(10);
  });
});

describe('the picks', () => {
  interface Area {
    id: string;
    nestUnder?: string;
    pages?: { route: string }[];
  }
  const areas = (JSON.parse(fs.readFileSync(path.join(REPO_ROOT, 'docs/data/site-structure.json'), 'utf8')) as { areas: Area[] }).areas;
  const pageRoutes = new Set(areas.flatMap((a) => (a.pages ?? []).map((p) => p.route)));
  const hubs = new Set(areas.filter((a) => a.nestUnder !== undefined).map((a) => `/${a.nestUnder}/${a.id}.html`));

  it('each names a page docs/data/site-structure.json lists, an area hub it lists, or the home page', () => {
    for (const p of PAGES) {
      const route = `/${p.route}`;
      const listed = p.template === 'splash' ? route === '/index.html' : p.template === 'hub' ? hubs.has(route) : pageRoutes.has(route);
      expect(listed, `${p.name}: ${route}`).toBe(true);
    }
  });

  it('cover at least five distinct templates, and no route twice', () => {
    expect(new Set(PAGES.map((p) => p.template)).size).toBeGreaterThanOrEqual(5);
    expect(new Set(PAGES.map((p) => p.route)).size).toBe(PAGES.length);
    expect(new Set(PAGES.map((p) => p.name)).size).toBe(PAGES.length);
  });

  it('include the polarity-card pattern page and a design page', () => {
    expect(PAGES.map((p) => p.route)).toEqual(
      expect.arrayContaining(['patterns/gof/creational/singleton.html', 'designs/bitly.html']),
    );
  });
});

describe('the guards', () => {
  let sb: Sandbox;
  beforeEach(() => {
    sb = makeSandbox();
  });
  afterEach(() => {
    sb.cleanup();
  });

  it('is misused without --out, rather than picking a directory for you', async () => {
    sb.write('site/dist/index.html', '<html lang="en"></html>');
    const r = await sb.run(spec);
    expectMisuse(r);
    expect(r.err).toContain('--out is required');
  });

  it('refuses to write inside the repository', async () => {
    sb.write('site/dist/index.html', '<html lang="en"></html>');
    const r = await sb.run(spec, ['--out', `${sb.dir}/shots`]);
    expectMisuse(r);
    expect(r.err).toContain('inside the repository');
  });

  it('judges the destination by where it lands, not by how it was spelled', async () => {
    sb.write('site/dist/index.html', '<html lang="en"></html>');
    const r = await sb.run(spec, ['--out', `${sb.dir}/a/../b`]);
    expectMisuse(r);
    expect(r.err).toContain('inside the repo');
  });

  it('says to build the site when there is no dist to photograph', async () => {
    const r = await sb.run(spec, ['--out', path.join(os.tmpdir(), 'kb-shots-nowhere')]);
    expectMisuse(r);
    expect(r.err).toContain('make site-build');
  });
});

describe('the run', () => {
  interface Log {
    calls: string[];
    shots: string[];
    themes: string[];
    viewports: { width: number; height: number }[];
    closed: number;
    pagesClosed: number;
  }

  const fake = (
    log: Log,
    onShot?: (n: number) => void,
  ): { launch: () => Promise<ShotBrowser>; log: Log } => {
    let n = 0;
    const page = (): ShotPage => ({
      goto: async (url) => {
        log.calls.push(`goto:${url.split('/').pop() ?? ''}`);
        return await Promise.resolve();
      },
      evaluate: async (_fn, theme) => {
        log.calls.push(`theme:${theme}`);
        log.themes.push(theme);
        return await Promise.resolve();
      },
      screenshot: async ({ path: p }) => {
        n += 1;
        onShot?.(n);
        log.calls.push(`shot:${p.split('/').pop() ?? ''}`);
        log.shots.push(p.split('/').pop() ?? '');
        return await Promise.resolve();
      },
      close: async () => {
        log.pagesClosed += 1;
        return await Promise.resolve();
      },
    });
    return {
      log,
      launch: async () =>
        await Promise.resolve({
          newPage: async ({ viewport }) => {
            log.viewports.push(viewport);
            return await Promise.resolve(page());
          },
          close: async () => {
            log.closed += 1;
            return await Promise.resolve();
          },
        }),
    };
  };

  const blank = (): Log => ({
    calls: [],
    shots: [],
    themes: [],
    viewports: [],
    closed: 0,
    pagesClosed: 0,
  });

  it('writes every cell of the matrix, once, under the name a record cites', async () => {
    const { launch, log } = fake(blank());
    const written = await shoot('/dist', '/out', launch);
    expect(written).toBe(matrix().length);
    expect(log.shots).toEqual(matrix());
  });

  it('opens one page per width, at that width, and closes each before the next', async () => {
    const { launch, log } = fake(blank());
    await shoot('/dist', '/out', launch);
    expect(log.viewports).toEqual(WIDTHS.map((w) => ({ width: w.width, height: w.height })));
    expect(log.pagesClosed).toBe(WIDTHS.length);
  });

  it('sets the theme before the shutter, never after', async () => {
    const { launch, log } = fake(blank());
    await shoot('/dist', '/out', launch);
    // Every shot is immediately preceded by the theme it is a shot of.
    const pairs = log.calls.filter((c) => c.startsWith('theme:') || c.startsWith('shot:'));
    for (let i = 0; i < pairs.length; i += 2) {
      expect(pairs[i]).toMatch(/^theme:/);
      expect(pairs[i + 1]).toMatch(/^shot:/);
      expect(pairs[i + 1]).toContain(`-${(pairs[i] as string).slice('theme:'.length)}.png`);
    }
    expect(log.themes).toHaveLength(matrix().length);
  });

  it('loads each page from the dist it was given, not from the output directory', async () => {
    const { launch, log } = fake(blank());
    await shoot('/dist', '/out', launch);
    const routes = PAGES.map((p) => p.route.split('/').pop());
    for (const r of routes) expect(log.calls).toContain(`goto:${r}`);
  });

  it('closes the browser even when a shot throws, and lets the failure through', async () => {
    const log = blank();
    const { launch } = fake(log, (n) => {
      if (n === 3) throw new Error('disk full');
    });
    await expect(shoot('/dist', '/out', launch)).rejects.toThrow('disk full');
    expect(log.closed).toBe(1);
    expect(log.shots).toHaveLength(2);
  });

  it('reports what landed, not what was planned', async () => {
    const log = blank();
    const { launch } = fake(log, (n) => {
      if (n === 5) throw new Error('stop');
    });
    await expect(shoot('/dist', '/out', launch)).rejects.toThrow('stop');
    expect(log.shots.length).toBeLessThan(matrix().length);
  });

  it('covers both themes for every page at every width', async () => {
    const { launch, log } = fake(blank());
    await shoot('/dist', '/out', launch);
    for (const t of THEMES) {
      expect(log.themes.filter((x) => x === t)).toHaveLength(PAGES.length * WIDTHS.length);
    }
  });

  it('runs the whole matrix into a folder outside the repository, making it, and says what landed', async () => {
    const sb = makeSandbox();
    const out = fs.mkdtempSync(path.join(os.tmpdir(), 'kb-shots-'));
    try {
      sb.write('site/dist/index.html', '<html lang="en"></html>');
      const { launch, log } = fake(blank());
      const lines: string[] = [];
      const target = path.join(out, 'new');
      const status = await runGate(
        { ...spec, run: async (ctx) => await shots(ctx, launch) },
        ['--out', target],
        { out: (l) => lines.push(l), err: (l) => lines.push(l) },
        sb.dir,
      );
      expect(status).toBe(0);
      expect(fs.existsSync(target)).toBe(true);
      expect(lines).toEqual([
        `[site-shots] wrote ${matrix().length} screenshot(s) to ${target} — ${PAGES.length} page(s) × ${WIDTHS.length} width(s) × ${THEMES.length} theme(s)`,
      ]);
      expect(log.closed).toBe(1);
    } finally {
      sb.cleanup();
      fs.rmSync(out, { recursive: true, force: true });
    }
  });
});
