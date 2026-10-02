/**
 * Does the search box find the right page? scripts/test/search-relevance.test.mjs
 * carried over to the site's path: every published page's own `solves` phrases
 * are ground truth ("someone who types this symptom wants this page"), scored
 * the way the search box scores them — `searchWithRetry` over payload pages
 * whose facts come from the page tree's frontmatter, as the manifest carries
 * them. Titles are asked too, as typed and with one adjacent swap, because a
 * search box is mostly typed a name at, and badly.
 *
 * The rates, not per-query answers, are held: a list of 340 expected pages
 * would go red whenever an author reworded a phrase. Every number in GATES is
 * a ratchet: raise it when retrieval improves, treat a fall as a regression.
 * kb.mjs v2 holds its own path (prose over the markdown) to the old gates in
 * tools/src/kb/relevance.test.ts.
 *
 *   KB_RELEVANCE=full     every solves phrase, not just the first
 *   KB_RELEVANCE=report   print the rate table and skip the assertions
 */
import { describe, expect, it } from 'vitest';

import { REPO_ROOT } from './sandbox.js';
import { STOP, searchWithRetry, type SearchOptions, type SearchPage } from './search-score.js';
import { searchTree } from './search-tree.js';

const MODE = process.env['KB_RELEVANCE'] ?? '';
const FULL = MODE === 'full';
const REPORT = MODE === 'report';

/**
 * Measured 2026-10-02 over the page tree (docs/, 418 pages, 367 with solves):
 * verbatim 99.7% (366 of 367), inflected 99.7% (366 of 367), title 99.3%
 * (415 of 418), one-swap title 98.2% (107 of 109) top-1; over all four, top-3
 * 99.9% and MRR 0.997; a design is first for 0.0% of the other pages'
 * queries.
 * Each floor is the measurement rounded down to the half point below it. The
 * page tree gives no headings, which a built payload adds at the lowest
 * weight.
 */
const GATES = {
  top1: { verbatim: 0.995, inflected: 0.995, title: 0.99, 'title-typo': 0.98 },
  top3: 0.995,
  mrr: 0.99,
  maxDesignStealsTop1: 0.005,
} as const;

const words = (s: string): string[] =>
  s
    .toLowerCase()
    .split(/\s+/)
    .map((w) => w.replace(/[^a-z0-9-]/g, ''))
    .filter(Boolean);
/** What a searcher types when they will not type the sentence: the long words, in order. */
const keywords = (list: string[]): string[] => list.filter((w) => w.length >= 5 && !STOP.has(w));
/** Singular to plural and back on each word long enough to carry one. */
const inflect = (list: string[]): string[] => list.map((w) => (w.length <= 4 ? w : w.endsWith('s') ? w.slice(0, -1) : `${w}s`));
/** The commonest typo: two neighbouring letters swapped, in the middle of the word. */
const swap = (s: string): string => {
  const i = Math.floor(s.length / 2);
  return s.slice(0, i - 1) + s.charAt(i) + s.charAt(i - 1) + s.slice(i + 1);
};

const PHRASINGS: Readonly<Record<string, (l: string[]) => string[]>> = {
  verbatim: (l) => l,
  inflected: inflect,
  keyword: keywords,
  'inflected-keyword': (l) => inflect(keywords(l)),
};
const GATED = ['verbatim', 'inflected'];
const RUNNING = FULL || REPORT ? Object.keys(PHRASINGS) : GATED;

interface Query {
  readonly route: string;
  readonly kind: string;
  readonly phrasing: string;
  readonly q: string;
}

function queries(pages: readonly SearchPage[], kind: ReadonlyMap<string, string>): Query[] {
  const out: Query[] = [];
  for (const p of pages) {
    const k = kind.get(p.route) as string;
    for (const phrase of FULL ? p.solves : p.solves.slice(0, 1)) {
      for (const phrasing of RUNNING) {
        const q = (PHRASINGS[phrasing] as (l: string[]) => string[])(words(phrase)).join(' ');
        if (q.split(' ').filter((w) => w.length > 2 && !STOP.has(w)).length < 2) continue;
        out.push({ route: p.route, kind: k, phrasing, q });
      }
    }
    out.push({ route: p.route, kind: k, phrasing: 'title', q: p.title.toLowerCase() });
    if (p.title.length >= 6 && !p.title.includes(' ')) out.push({ route: p.route, kind: k, phrasing: 'title-typo', q: swap(p.title.toLowerCase()) });
  }
  return out;
}

interface Tally {
  n: number;
  top1: number;
  top3: number;
  rr: number;
  steals: number;
  others: number;
}
const blank = (): Tally => ({ n: 0, top1: 0, top3: 0, rr: 0, steals: 0, others: 0 });

function measure(pages: readonly SearchPage[], kind: ReadonlyMap<string, string>, qs: readonly Query[], options: SearchOptions): { by: Record<string, Tally>; all: Tally } {
  const by: Record<string, Tally> = {};
  const all = blank();
  for (const { route, kind: k, phrasing, q } of qs) {
    const hits = searchWithRetry(q, pages, options).hits;
    const rank = hits.findIndex((h) => h.page.route === route) + 1;
    const t = (by[phrasing] ??= blank());
    for (const x of [t, all]) {
      x.n += 1;
      if (rank === 1) x.top1 += 1;
      if (rank >= 1 && rank <= 3) x.top3 += 1;
      if (rank >= 1) x.rr += 1 / rank;
      // "A design steals the top" means something only when the answer is no design.
      if (k !== 'designs') {
        x.others += 1;
        if (hits[0] !== undefined && kind.get(hits[0].page.route) === 'designs') x.steals += 1;
      }
    }
  }
  return { by, all };
}

const rate = (t: Tally | undefined, key: 'top1' | 'top3' | 'rr'): number => (t === undefined || t.n === 0 ? 0 : t[key] / t.n);
const pct = (x: number): string => `${(x * 100).toFixed(1)}%`;

describe('search relevance over the page tree', () => {
  const tree = searchTree(REPO_ROOT);
  const pages = tree.pages;
  const kind = new Map(pages.map((p) => [p.route, p.kind]));
  const qs = queries(pages, kind);
  const { by, all } = measure(pages, kind, qs, { syn: tree.synonyms, tagLabels: tree.tagLabels });

  if (REPORT) {
    const line = (label: string, t: Tally): void => {
      console.log(
        `${label.padEnd(18)} n=${String(t.n).padStart(4)}  top1=${pct(rate(t, 'top1'))}  top3=${pct(rate(t, 'top3'))}  ` +
          `mrr=${rate(t, 'rr').toFixed(3)}  steals=${pct(t.others ? t.steals / t.others : 0)}`,
      );
    };
    for (const [p, t] of Object.entries(by)) line(p, t);
    line('all', all);
  }

  it.skipIf(REPORT)('covers the corpus it claims to', () => {
    expect(pages.filter((p) => p.solves.length > 0).length).toBeGreaterThan(300);
    expect(qs.length).toBeGreaterThan(pages.length * 2);
  });

  it.skipIf(REPORT)('puts the page its own symptom or name describes first', () => {
    for (const [phrasing, bar] of Object.entries(GATES.top1)) {
      expect(rate(by[phrasing], 'top1'), `top-1 (${phrasing})`).toBeGreaterThanOrEqual(bar);
    }
    expect(rate(all, 'top3'), 'top-3').toBeGreaterThanOrEqual(GATES.top3);
    expect(rate(all, 'rr'), 'MRR').toBeGreaterThanOrEqual(GATES.mrr);
  });

  it.skipIf(REPORT)('lets no design crowd out the pattern that answers the question', () => {
    expect(all.steals / all.others).toBeLessThanOrEqual(GATES.maxDesignStealsTop1);
  });
});
