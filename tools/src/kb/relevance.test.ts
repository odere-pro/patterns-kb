/**
 * Does kb.mjs v2's `find` retrieve the right page? scripts/test/search-relevance.test.mjs
 * carried over whole — the same ground truth (every page's own `solves`), the
 * same phrasings, the same GATES — scored through the path `find` takes over
 * docs/: the catalog from the frontmatter, the prose index from the markdown,
 * the synonyms scripts/kb.mjs reads.
 *
 * It asserts RATES, never per-query expectations, and every number is a
 * ratchet: raise it when retrieval improves, treat a fall as a regression.
 *
 *   KB_RELEVANCE=full     every solves phrase, not just the first
 *   KB_RELEVANCE=report   print the metric table and every gated query the CLI
 *                         misses at top-1, and skip the assertions
 */

import { beforeAll, describe, expect, it } from 'vitest';

import { REAL_TREE_TIMEOUT } from '../lib/fixtures.js';
import { readTagLabels } from '../lib/search-tree.js';

import { parseArgs } from './args.js';
import { Session } from './cli.js';
import { Corpus, REPO } from './corpus.js';
import { loadSynonyms, rank, STOP, type CatalogNode, type Synonyms } from './rank.js';

const MODE = process.env['KB_RELEVANCE'] ?? '';
const FULL = MODE === 'full';
const REPORT = MODE === 'report';

/**
 * Each floor is the measurement rounded down to the half point below it, and
 * each ceiling the measurement rounded up. Measured 2026-10-02 over 418 pages, 367 with
 * `solves`. With rankItems' tie-break (fewer facts, then id) the CLI's verbatim
 * top-1 measures 99.2% (364 of 367), its MRR 0.994 and the facts-only top-1
 * 99.7% (732 of 734). The inflected top-1 measures 98.6% (362 of 367), above
 * its floor of 98.5%: the report names its misses, and raising it waits on
 * fixing them. Design steals measure 0.0% and designs in the top five 0.9%:
 * a case study that only brushes a symptom's words is scored down
 * (DESIGN_COVER in search-score.ts), so it crowds out no pattern.
 */
const GATES = {
  cliTop1: { verbatim: 0.99, inflected: 0.985 },
  cliTop3: 0.995,
  cliMrr: 0.99,
  hubTop1: 0.995,
  maxDesignStealsTop1: 0.005,
  maxDesignInTop5: 0.01,
} as const;

const words = (s: string): string[] =>
  s
    .toLowerCase()
    .split(/\s+/)
    .map((w) => w.replace(/[^a-z0-9-]/g, ''))
    .filter(Boolean);
const keywords = (list: string[]): string[] => list.filter((w) => w.length >= 5 && !STOP.has(w));
const inflect = (list: string[]): string[] => list.map((w) => (w.length <= 4 ? w : w.endsWith('s') ? w.slice(0, -1) : `${w}s`));
const PHRASINGS: Readonly<Record<string, (l: string[]) => string[]>> = {
  verbatim: (l) => l,
  keyword: keywords,
  inflected: inflect,
  'inflected-keyword': (l) => inflect(keywords(l)),
};
const GATED = ['verbatim', 'inflected'];
const RUNNING = FULL || REPORT ? Object.keys(PHRASINGS) : GATED;

interface Query {
  readonly id: string;
  readonly kind: string;
  readonly phrasing: string;
  readonly q: string;
}
interface Tally {
  n: number;
  top1: number;
  top3: number;
  rr: number;
  steals: number;
  designTop5: number;
  nonDesign: number;
}
const blank = (): Tally => ({ n: 0, top1: 0, top3: 0, rr: 0, steals: 0, designTop5: 0, nonDesign: 0 });

function buildQueries(nodes: readonly CatalogNode[]): Query[] {
  const out: Query[] = [];
  for (const n of nodes) {
    const solves = n.solves ?? [];
    for (const phrase of FULL ? solves : solves.slice(0, 1)) {
      for (const phrasing of RUNNING) {
        const q = (PHRASINGS[phrasing] as (l: string[]) => string[])(words(phrase)).join(' ');
        if (q.split(' ').filter((w) => w.length > 2 && !STOP.has(w)).length < 2) continue;
        out.push({ id: n.id, kind: n.kind, phrasing, q });
      }
    }
  }
  return out;
}

/** A gated query whose page is not the top hit: the phrasing, the query, the page it wanted and the one it got. */
type Miss = string;

async function measure(queries: readonly Query[], score: (q: string) => Promise<CatalogNode[]>): Promise<{ byPhrasing: Record<string, Tally>; all: Tally; misses: Miss[] }> {
  const byPhrasing: Record<string, Tally> = {};
  const all = blank();
  const misses: Miss[] = [];
  for (const { id, kind, phrasing, q } of queries) {
    const hits = await score(q);
    const rank1 = hits.findIndex((h) => h.id === id) + 1;
    const tally = (byPhrasing[phrasing] ??= blank());
    if (rank1 !== 1 && GATED.includes(phrasing)) misses.push(`${phrasing}: "${q}" wants ${id}, got ${String(hits[0]?.id)}`);
    for (const t of GATED.includes(phrasing) ? [tally, all] : [tally]) {
      t.n += 1;
      if (rank1 === 1) t.top1 += 1;
      if (rank1 >= 1 && rank1 <= 3) t.top3 += 1;
      if (rank1 >= 1) t.rr += 1 / rank1;
      if (kind !== 'design') {
        t.nonDesign += 1;
        if (hits[0]?.kind === 'design') t.steals += 1;
        if (hits.slice(0, 5).some((h) => h.kind === 'design')) t.designTop5 += 1;
      }
    }
  }
  return { byPhrasing, all, misses };
}

const rates = (t: Tally): { top1: number; top3: number; mrr: number; steals: number; designTop5: number } => ({
  top1: t.top1 / t.n,
  top3: t.top3 / t.n,
  mrr: t.rr / t.n,
  steals: t.steals / t.nonDesign,
  designTop5: t.designTop5 / t.nonDesign,
});
const pct = (x: number): string => `${(x * 100).toFixed(1)}%`;

let nodes: CatalogNode[];
let queries: Query[];
let cli: Awaited<ReturnType<typeof measure>>;
let hub: Awaited<ReturnType<typeof measure>>;

beforeAll(async () => {
  const corpus = new Corpus(REPO);
  const session = new Session(corpus, parseArgs([]));
  const syn: Synonyms = await loadSynonyms(REPO);
  nodes = session.candidates();
  queries = buildQueries(nodes);
  cli = await measure(queries, async (q) => (await session.search(q, nodes, 10)).map((x) => x.n));
  // No prose: the hub's algorithm, number for number.
  const tagLabels = readTagLabels(REPO);
  hub = await measure(queries, async (q) => rank({ nodes, q, syn, tagLabels, categoriesOf: (n) => corpus.page(n.id)?.categories ?? [], limit: 10 }).map((x) => x.n));
}, REAL_TREE_TIMEOUT);

it.runIf(REPORT)('prints the metric table', () => {
  const line = (label: string, t: Tally): void => {
    const r = rates(t);
    console.log(`${label.padEnd(22)} n=${String(t.n).padStart(5)}  top1=${pct(r.top1)}  top3=${pct(r.top3)}  mrr=${r.mrr.toFixed(3)}  steals=${pct(r.steals)}  d@5=${pct(r.designTop5)}`);
  };
  for (const [p, t] of Object.entries(cli.byPhrasing)) line(`CLI ${p}`, t);
  line('CLI all', cli.all);
  for (const [p, t] of Object.entries(hub.byPhrasing)) line(`HUB ${p}`, t);
  line('HUB all', hub.all);
  // The watch item: the inflected gate has no margin, so name every query it misses.
  for (const m of cli.misses) console.log(`CLI miss  ${m}`);
});

describe.skipIf(REPORT)('the relevance fixture, through kb.mjs v2', () => {
  it('covers the corpus it claims to', () => {
    const withSolves = nodes.filter((n) => (n.solves ?? []).length > 0).length;
    expect(withSolves).toBeGreaterThan(300);
    expect(queries.length).toBeGreaterThan(withSolves * 1.5);
  });

  it('retrieves the page its own symptom text describes', () => {
    for (const [phrasing, bar] of Object.entries(GATES.cliTop1)) {
      expect(rates(cli.byPhrasing[phrasing] as Tally).top1, `CLI top-1 (${phrasing})`).toBeGreaterThanOrEqual(bar);
    }
    expect(rates(cli.all).top3, 'CLI top-3').toBeGreaterThanOrEqual(GATES.cliTop3);
    expect(rates(cli.all).mrr, 'CLI MRR').toBeGreaterThanOrEqual(GATES.cliMrr);
  });

  it('retrieves it reading no prose at all, as the hub does', () => {
    expect(rates(hub.all).top1, 'HUB top-1').toBeGreaterThanOrEqual(GATES.hubTop1);
  });

  it('keeps case studies from crowding out the pattern that answers the question', () => {
    expect(rates(cli.all).steals, 'design steals top-1').toBeLessThanOrEqual(GATES.maxDesignStealsTop1);
    expect(rates(cli.all).designTop5, 'design in top-5').toBeLessThanOrEqual(GATES.maxDesignInTop5);
  });
});
