/**
 * The one search ranking, case by case: the rule scripts/lib/search.mjs had
 * (weights, stems, synonyms, the one solves phrase, prose deflation), then the
 * search box's parts over the payload (area boost, anchor, typo retry,
 * glossary cards, snippets). The corpus-wide rates are
 * search-relevance.test.ts's.
 */
import { describe, expect, it } from 'vitest';

import {
  AREA_BOOST,
  CATEGORY_BONUS,
  DESCRIPTION_WEIGHTS,
  EXACT_BONUS,
  SCORE_BAND,
  RETRY_MAX_LENGTH,
  RETRY_MIN_LENGTH,
  START_RATE,
  STOP,
  TIE_SHARE,
  TIERS,
  anchorFor,
  decodeHeadings,
  decodePage,
  encodeHeadings,
  indexProse,
  kindOfArea,
  kindWord,
  matchTerms,
  normalize,
  own,
  pageCategories,
  pageFacts,
  queryTerms,
  rankItems,
  searchPages,
  searchWithRetry,
  snippet,
  stemVariant,
  termVariants,
  variants,
  wordHit,
  type Facts,
  type SearchPage,
  type SearchTerm,
  type SnippetRun,
} from './search-score.js';

const facts = (over: Partial<Facts> = {}): Facts => ({
  id: 'x',
  title: 'X',
  description: '',
  aliases: [],
  tags: [],
  categories: [],
  solves: [],
  ...over,
});
const self = (f: Facts): Facts => f;
const rankFacts = (items: Facts[], q: string, extra: { syn?: Record<string, string[]>; limit?: number } = {}) =>
  rankItems(items, { q, factsOf: self, ...extra });

const page = (over: Partial<SearchPage> = {}): SearchPage => ({
  route: '/x.html',
  title: 'X',
  description: '',
  area: 'patterns',
  status: 'stable',
  tags: [],
  categories: [],
  aliases: [],
  solves: [],
  headings: [],
  kind: 'patterns',
  ...over,
});

const text = (runs: SnippetRun[]): string => runs.map((r) => r.text).join('');
const marked = (runs: SnippetRun[]): string[] => runs.filter((r) => r.hit).map((r) => r.text);

describe('a tie', () => {
  const tied = (id: string, tags: string[] = []): Facts => ({ id, title: 'Breaker', description: '', aliases: [], tags, categories: [], solves: [] });

  it('goes to the item with fewer facts, then the smaller id, whatever order the items arrive in', () => {
    const wide = tied('a-wide', ['one', 'two']);
    const small = tied('m-small');
    const twin = tied('b-small');
    for (const items of [[wide, small, twin], [twin, small, wide], [small, wide, twin]]) {
      const got = rankItems(items, { q: 'breaker', factsOf: self });
      expect(new Set(got.map((s) => s.score)).size).toBe(1);
      expect(got.map((s) => s.item.id)).toEqual(['b-small', 'm-small', 'a-wide']);
    }
  });

  it('keeps the arrival order of two items alike in score, size and id', () => {
    const first = tied('same');
    const second = { ...tied('same'), description: '' };
    const got = rankItems([first, second], { q: 'breaker', factsOf: self });
    expect(got.map((s) => s.item)).toEqual([first, second]);
  });

  it('keeps that order in the search box after the area boost', () => {
    const got = searchPages('breaker', [page({ route: '/z.html', title: 'Breaker', tags: ['x'] }), page({ route: '/y.html', title: 'Breaker' })]);
    expect(got.map((h) => h.page.route)).toEqual(['/y.html', '/z.html']);
  });
});

describe('the words of a query', () => {
  it('keeps words of two letters or more, drops stopwords, counts each once', () => {
    expect(queryTerms('The CB breaker and the Breaker for   retries')).toEqual(['cb', 'breaker', 'retries']);
    expect(queryTerms('ai')).toEqual(['ai']);
    expect(queryTerms('a b')).toEqual([]);
    expect(STOP.has('with')).toBe(true);
  });

  it('drops the two-letter function words and keeps the two-letter names', () => {
    for (const w of ['is', 'to', 'of', 'in', 'on', 'my', 'it', 'an', 'or', 'be', 'do', 'as', 'at', 'by', 'if', 'we', 'no', 'so', 'up', 'me', 'us', 'he']) expect(STOP.has(w), w).toBe(true);
    expect(queryTerms('my ml db is up')).toEqual(['ml', 'db']);
  });

  it('weighs a description by where a word is found, the `solves` phrase most of all', () => {
    expect(DESCRIPTION_WEIGHTS.solves).toBeGreaterThan(DESCRIPTION_WEIGHTS.name);
    expect(DESCRIPTION_WEIGHTS.categories).toBeGreaterThan(DESCRIPTION_WEIGHTS.curated);
  });

  it('keeps every lookup tier above the one under it, even at a word start against a whole word plus the tie-break', () => {
    const order = [TIERS.title, TIERS.alias, TIERS.category, TIERS.tag, TIERS.solves, TIERS.description, TIERS.headings, TIERS.body];
    order.slice(0, -1).forEach((t, i) => {
      const next = order[i + 1] as number;
      const below = order.slice(i + 2).reduce((a, b) => a + b, 0);
      expect(t * START_RATE, `tier ${String(i)}`).toBeGreaterThan(next + TIE_SHARE * below);
    });
    expect(TIERS.body * 3).toBeLessThan(TIERS.headings * START_RATE);
    expect(EXACT_BONUS).toBeGreaterThan(CATEGORY_BONUS);
  });

  it('reads only its own synonyms, never an inherited property', () => {
    expect(own({ cache: ['memo'] }, 'cache')).toEqual(['memo']);
    expect(own({}, 'constructor')).toEqual([]);
  });

  it('stems by the first of six suffix rules that fits', () => {
    expect(stemVariant('queries')).toBe('query');
    expect(stemVariant('batches')).toBe('batch');
    expect(stemVariant('threads')).toBe('thread');
    expect(stemVariant('blocking')).toBe('block');
    expect(stemVariant('retried')).toBe('retry');
    expect(stemVariant('blocked')).toBe('block');
    expect(stemVariant('class')).toBeNull();
    expect(stemVariant('lock')).toBeNull();
  });

  it('lists a term, its synonyms, then its stem once', () => {
    expect(termVariants('threads', { threads: ['workers'] })).toEqual(['threads', 'workers', 'thread']);
    expect(termVariants('threads', { threads: ['thread'] })).toEqual(['threads', 'thread']);
    expect(termVariants('lock', {})).toEqual(['lock']);
  });
});

describe('wordHit', () => {
  it('is 2 for a whole word, 1 for a word start, and inside a word only from four letters', () => {
    expect(wordHit('unique id generation', 'id')).toBe(2);
    expect(wordHit('half-open probes', 'half')).toBe(2);
    expect(wordHit('unique id generation', 'gen')).toBe(1);
    expect(wordHit('a coding agent', 'gen')).toBe(0);
    expect(wordHit('microservices', 'service')).toBe(1);
    expect(wordHit('', 'x')).toBe(0);
    expect(wordHit('text', '')).toBe(0);
  });

  it('counts a word of one or two letters whole only, so "ai" never marks "maintain" or "aim"', () => {
    expect(wordHit('how to maintain it', 'ai')).toBe(0);
    expect(wordHit('aim high', 'ai')).toBe(0);
    expect(wordHit('the ai agent', 'ai')).toBe(2);
    expect(wordHit('ai-agent', 'ai')).toBe(2);
    expect(wordHit('gen ai at scale', 'ai')).toBe(2);
  });

  it('takes the best occurrence of several', () => {
    expect(wordHit('agent generation gen', 'gen')).toBe(2);
    expect(wordHit('agent generation', 'gen')).toBe(1);
  });
});

describe('the categories', () => {
  it('words a kind the way a reader types it, from a kb kind or a top area id', () => {
    expect(kindWord('design')).toBe('case study');
    expect(kindWord('designs')).toBe('case study');
    expect(kindWord('pattern')).toBe('pattern');
    expect(kindWord('reference')).toBe('');
    expect(kindOfArea('designs')).toBe('design');
    expect(kindOfArea('map')).toBe('map');
  });

  it('lists an area chain outermost first and then the kind', () => {
    expect(pageCategories(['Patterns', 'Network', 'Resilience'], 'patterns')).toEqual(['Patterns', 'Network', 'Resilience', 'pattern']);
    expect(pageCategories(['Case Studies', 'Foundational'], 'design')).toEqual(['Case Studies', 'Foundational', 'case study']);
    expect(pageCategories(['Map'], 'map')).toEqual(['Map']);
  });
});

describe('a lookup', () => {
  const pages = {
    cb: facts({ id: 'circuit-breaker', title: 'Circuit Breaker', aliases: ['CB'], tags: ['resilience'], categories: ['Patterns', 'Resilience', 'pattern'], solves: ['a failing dependency'] }),
    retry: facts({ id: 'retry', title: 'Retry', tags: ['resilience'], categories: ['Patterns', 'Resilience', 'pattern'], description: 'Try a failed call again' }),
    tagged: facts({ id: 'outage-notes', title: 'Outage notes', tags: ['resilience'], categories: ['Reference'] }),
    described: facts({ id: 'caching', title: 'Caching', description: 'Buys resilience with memory', categories: ['Patterns', 'pattern'] }),
    titled: facts({ id: 'resilience-guide', title: 'Resilience guide', categories: ['Reference'] }),
    design: facts({ id: 'bitly', title: 'Bitly', categories: ['Case Studies', 'Foundational', 'case study'], description: 'A case to study' }),
  };
  const order = (q: string, list: Facts[]): string[] => rankFacts(list, q).map((s) => s.item.id);

  it('puts a title hit above a category hit, a category hit above a tag hit, a tag above a description', () => {
    expect(order('resilience', [pages.described, pages.tagged, pages.titled].map((f) => ({ ...f })))).toEqual(['resilience-guide', 'outage-notes', 'caching']);
    const shelf = facts({ id: 'shelf', title: 'Shelf', categories: ['Resilience'] });
    const tag = facts({ id: 'tag', title: 'Tag', tags: ['resilience'] });
    const desc = facts({ id: 'desc', title: 'Desc', description: 'about resilience' });
    const solves = facts({ id: 'solves', title: 'Solves', solves: ['my resilience is gone'] });
    expect(order('resilience', [desc, solves, tag, shelf].map((f) => ({ ...f, categories: f.categories })))).toEqual(['shelf', 'tag', 'solves', 'desc']);
  });

  it('puts an alias or id hit between the title and the category', () => {
    const alias = facts({ id: 'alias', title: 'Alias', aliases: ['resilience kit'] });
    const shelf = facts({ id: 'shelf', title: 'Shelf', categories: ['Resilience patterns'] });
    const named = facts({ id: 'named', title: 'Resilience' });
    expect(order('resilience', [shelf, alias, named])).toEqual(['named', 'alias', 'shelf']);
    expect(order('resilience', [shelf, facts({ id: 'resilience-kit', title: 'Kit' })])).toEqual(['resilience-kit', 'shelf']);
  });

  it('keeps the tiers when the higher hit is only a word start', () => {
    const start = facts({ id: 'start', title: 'Resilience' });
    const shelf = facts({ id: 'shelf', title: 'Shelf', categories: ['Resilience'] });
    expect(order('resil', [shelf, start])).toEqual(['start', 'shelf']);
    expect(order('resilience', [shelf, facts({ id: 'start', title: 'Resiliency' })])).toEqual(['shelf']);
  });

  it('adds the exact bonus for a whole query equal to an id, title or alias, before any tier', () => {
    const named = facts({ id: 'circuit-breaker', title: 'Circuit Breaker', aliases: ['CB'] });
    const other = facts({ id: 'circuit-notes', title: 'Circuit notes about a breaker', tags: ['circuit', 'breaker'] });
    expect(order('circuit breaker', [other, named])).toEqual(['circuit-breaker', 'circuit-notes']);
    for (const q of ['circuit-breaker', 'Circuit Breaker', 'cb']) expect(rankFacts([named], q)[0]?.score).toBeGreaterThanOrEqual(EXACT_BONUS);
  });

  it('lists a category phrase\'s pages first: "case study" gives the case studies', () => {
    const principle = facts({ id: 'yagni', title: 'YAGNI', description: 'A case where you should study what you need', categories: ['Principles', 'principle'] });
    expect(order('case study', [principle, pages.design])).toEqual(['bitly', 'yagni']);
    expect(order('resilience', [pages.described, pages.retry, pages.cb])).toEqual(['retry', 'circuit-breaker', 'caching']);
    expect(rankFacts([pages.design], 'case study')[0]?.score).toBeGreaterThanOrEqual(CATEGORY_BONUS);
  });

  it('breaks a category tie by the fewer facts, then the id', () => {
    expect(order('resilience', [pages.retry, pages.cb]).slice(0, 2)).toEqual(['retry', 'circuit-breaker']);
  });

  it('reads a two-letter name: "ai" finds the ai page and not "maintain"', () => {
    const ai = facts({ id: 'ai-agent', title: 'AI Agent' });
    const plain = facts({ id: 'maintainability', title: 'Maintainability', description: 'How to maintain and aim' });
    expect(order('ai', [plain, ai])).toEqual(['ai-agent']);
  });

  it('reads a short word as a start, not inside a word: "gen" finds "generation" and not "agent"', () => {
    const gen = facts({ id: 'unique-id-generation', title: 'Unique ID Generation' });
    const agent = facts({ id: 'agent-loop', title: 'Agent loop' });
    expect(order('gen', [agent, gen])).toEqual(['unique-id-generation']);
  });

  it('scores a synonym and a stem at half of the word itself', () => {
    const page = facts({ id: 'p', title: 'Stale reads' });
    const direct = rankFacts([page], 'stale')[0]?.score as number;
    const viaSyn = rankFacts([page], 'outdated', { syn: { outdated: ['stale'] } })[0]?.score as number;
    const viaStem = rankFacts([facts({ id: 'q', title: 'Threads' })], 'threaded')[0]?.score as number;
    expect(viaSyn).toBeCloseTo(direct / 2, 5);
    expect(viaStem).toBeGreaterThan(0);
  });

  it('reads the tag label and a heading as facts', () => {
    const labelled = facts({ id: 'l', title: 'Learner', tags: ['machine-learning', 'Machine learning'] });
    expect(rankFacts([labelled], 'machine learning')).toHaveLength(1);
    const headed = facts({ id: 'h', title: 'Headed', headings: ['Half-open probes'] });
    expect(rankFacts([headed], 'probes')).toHaveLength(1);
  });

  it('takes prose as the last tier', () => {
    const page = facts({ id: 'p', title: 'Xyz' });
    const bodies = new Map([[page, indexProse(['The zebra crossing is where the herd waits for its turn.'])]]);
    const got = rankItems([page], { q: 'zebra', factsOf: self, bodyOf: (f) => bodies.get(f) as ReturnType<typeof indexProse> });
    expect(got[0]?.score).toBeLessThan(TIERS.headings);
    expect(got[0]?.why).toContain('zebra');
  });
});

describe('indexProse', () => {
  it('counts each word once per line of more than 25 characters, sentences split', () => {
    const prose = indexProse(['A breaker opens after failures pile up. A breaker closes after a probe works.', 'too short']);
    expect(prose.hits.get('breaker')).toEqual({ n: 2, line: 'A breaker opens after failures pile up.' });
    expect(prose.hits.has('short')).toBe(false);
    expect(prose.tokens).toBe(12);
  });
});

describe('rankItems — the rule', () => {
  const breaker = facts({
    id: 'circuit-breaker',
    title: 'Circuit Breaker',
    description: 'Stops calling a service that is already failing',
    aliases: ['CB'],
    tags: ['resilience'],
    solves: ['one failing dependency took down my whole service', 'retries are making an outage worse'],
  });
  const retry = facts({ id: 'retry', title: 'Retry', description: 'Try a failed call again', tags: ['resilience'] });

  it('adds the exact bonus for an id, title or alias', () => {
    for (const q of ['circuit-breaker', 'Circuit Breaker', 'cb']) {
      expect((rankFacts([breaker], q)[0] as { score: number }).score).toBeGreaterThanOrEqual(EXACT_BONUS);
    }
  });

  it('ranks the page whose symptom the query is above one that shares a word', () => {
    const got = rankFacts([retry, breaker], 'one failing dependency took down my service');
    expect(got.map((s) => s.item.id)).toEqual(['circuit-breaker', 'retry']);
  });

  it('scores a stem at half, so a flipped plural still finds the page', () => {
    const exact = rankFacts([breaker], 'outage worse')[0]?.score as number;
    const plural = rankFacts([breaker], 'outages worse')[0]?.score as number;
    expect(plural).toBeGreaterThan(0);
    expect(plural).toBeLessThan(exact);
  });

  it('scores a synonym at half', () => {
    expect(rankFacts([breaker], 'fuse')).toEqual([]);
    expect(rankFacts([breaker], 'fuse', { syn: { fuse: ['breaker'] } })).toHaveLength(1);
    expect(rankFacts([breaker], 'fuse one failing dependency', { syn: { fuse: ['breaker'] } })).toHaveLength(1);
  });

  it('reads a description\'s category at its own weight, and a word inside another only from four letters', () => {
    const shelf = facts({ id: 'shelf', title: 'Shelf', categories: ['Resilience'] });
    const none = facts({ id: 'none', title: 'None' });
    expect(rankFacts([shelf, none], 'one more resilience question here').map((s) => s.item.id)).toEqual(['shelf']);
    const bulk = facts({ id: 'bulk', title: 'Bulkhead', description: 'Isolates pools per dependency', solves: ['microservices share one pool'] });
    expect(rankFacts([bulk], 'the service one pool shares')).toHaveLength(1);
    expect(rankFacts([bulk], 'the pla one pool shares').length).toBe(1);
  });

  it('scores one solves phrase, the first of the ones covering the most terms', () => {
    // "service" is in the first phrase only; "outage" and "worse" in the second.
    // The second covers more, so the page scores that one at the solves weight.
    const both = rankFacts([breaker], 'service outage worse')[0]?.score as number;
    const one = rankFacts([facts({ ...breaker, solves: ['service outage worse'] })], 'service outage worse')[0]?.score as number;
    expect(one).toBeGreaterThan(both);
  });

  it('scores the description at the solves weight on a page with no solves', () => {
    const withSolves = rankFacts([facts({ description: 'about caching', solves: ['something else'] })], 'caching layer design')[0];
    const without = rankFacts([facts({ description: 'about caching' })], 'caching layer design')[0];
    expect(without?.score).toBeGreaterThan(withSolves?.score as number);
  });

  it('lists nothing that matched nothing, and reads no stopword', () => {
    expect(rankFacts([breaker, retry], 'zebra')).toEqual([]);
    expect(rankFacts([breaker], 'my')).toEqual([]);
  });

  it('keeps the first `limit` results', () => {
    expect(rankFacts([retry, breaker], 'resilience', { limit: 1 })).toHaveLength(1);
  });

  it('adds prose mentions, up to three, deflated on a page longer than the average', () => {
    const short = facts({ id: 'short' });
    const long = facts({ id: 'long' });
    const bodies = new Map<Facts, ReturnType<typeof indexProse>>([
      [short, indexProse(['The zebra crossing is where the herd waits for its turn.'])],
      [long, indexProse([`The zebra crossing is where the herd waits for its turn. ${'Filler words go on and on here. '.repeat(40)}`])],
    ]);
    const got = rankItems([short, long], { q: 'zebra', factsOf: self, bodyOf: (f) => bodies.get(f) as ReturnType<typeof indexProse> });
    expect(got.map((s) => s.item.id)).toEqual(['short', 'long']);
    expect(got[0]?.why).toBe('The zebra crossing is where the herd waits for its turn.');
  });

  it('gives no why when the prose never matched, and takes an empty list', () => {
    const got = rankItems([retry], { q: 'retry', factsOf: self, bodyOf: () => indexProse([]) });
    expect(got[0]?.why).toBeNull();
    expect(rankItems([], { q: 'retry', factsOf: self, bodyOf: () => indexProse([]) })).toEqual([]);
  });

  describe('a symptom', () => {
    const q = 'one slow dependency blocks my threads';
    const order = (list: Facts[]): string[] => rankFacts(list, q).map((s) => s.item.id);
    const pattern = facts({
      id: 'cb',
      title: 'Breaker',
      categories: ['pattern'],
      solves: ['one failing dependency took down my whole service', 'my thread pool is exhausted', 'a slow downstream makes latency explode'],
    });
    const study = (solves: string): Facts => facts({ id: 'logger', title: 'Logger', categories: ['Case Studies', 'case study'], solves: [solves] });

    it('counts a word found in another solves phrase, at a share of the best phrase', () => {
      const one = facts({ id: 'one', title: 'One', solves: ['one failing dependency took down my whole service'] });
      const three = facts({ id: 'three', title: 'Three', solves: ['one failing dependency took down my whole service', 'my thread pool is exhausted', 'a slow downstream makes latency explode'] });
      const scores = (f: Facts): number => (rankFacts([f], q)[0] as { score: number }).score;
      expect(scores(three)).toBeGreaterThan(scores(one));
    });

    it('damps a case study whose best phrase covers few of the words, and not one that covers them', () => {
      const brushed = study('one slow file write blocks my console output because a lock guards everything');
      const covered = study('one slow dependency blocks my threads and the pool runs dry');
      expect(order([brushed, pattern])).toEqual(['cb', 'logger']);
      expect(order([covered, pattern])[0]).toBe('logger');
      const damped = (rankFacts([brushed], q)[0] as { score: number }).score;
      const full = (rankFacts([{ ...brushed, categories: ['pattern'] }], q)[0] as { score: number }).score;
      expect(damped).toBeCloseTo(full * 0.5, 5);
    });
  });
});

describe('the payload, and the search box', () => {
  const breaker = page({
    route: '/patterns/distributed/resilience/circuit-breaker.html',
    title: 'Circuit Breaker',
    area: 'distributed-resilience',
    solves: ['one failing dependency took down my whole service'],
    headings: [
      { id: 'description', text: 'What it is' },
      { id: 'half-open', text: 'Half-open probes' },
      { id: '', text: 'Probes without an id' },
    ],
  });

  it('takes a page slug from its route', () => {
    expect(pageFacts(breaker).id).toBe('circuit-breaker');
    expect(pageFacts(page({ route: 'top' })).id).toBe('top');
  });

  it('boosts the reader’s own area, and breaks a tie by route', () => {
    const a = page({ route: '/a.html', title: 'Cache aside', area: 'caching' });
    const b = page({ route: '/b.html', title: 'Cache aside', area: 'data' });
    expect(searchPages('cache', [b, a]).map((h) => h.page.route)).toEqual(['/a.html', '/b.html']);
    expect(searchPages('cache', [a, b]).map((h) => h.page.route)).toEqual(['/a.html', '/b.html']);
    const boosted = searchPages('cache', [a, b], { area: 'data' });
    expect(boosted.map((h) => h.page.route)).toEqual(['/b.html', '/a.html']);
    expect((boosted[0]?.score as number) / (boosted[1]?.score as number)).toBeCloseTo(AREA_BOOST);
  });

  it('lands on a heading only when it beats the title by the 2 to 3 rule', () => {
    expect(anchorFor(breaker, 'half-open probes')).toBe('half-open');
    expect(searchPages('dependency half-open', [breaker])[0]?.anchor).toBe('half-open');
    expect(anchorFor(breaker, 'circuit breaker')).toBeNull();
    // One term each: the heading's 2 does not beat the title's 3.
    expect(anchorFor(breaker, 'probes breaker')).toBeNull();
    expect(anchorFor(breaker, 'zebra')).toBeNull();
  });

  it('lists a page a heading alone answers, at the lowest weight, and lands on that heading', () => {
    expect(searchPages('half-open probes', [breaker]).map((h) => [h.page.route, h.anchor])).toEqual([
      ['/patterns/distributed/resilience/circuit-breaker.html', 'half-open'],
    ]);
  });

  it('lists a description only within the band of the best hit, so a weak match never buries a strong one', () => {
    expect(SCORE_BAND).toBe(0.35);
    // A page whose solves phrase answers outscores a heading-only answer by more than the band.
    const answer = page({ route: '/answer.html', title: 'Probes', solves: ['half-open probes that never close'] });
    const hits = searchPages('half-open probes never close', [breaker, answer]);
    expect(hits.map((h) => h.page.route)).toEqual(['/answer.html']);
    // Two answers of one strength both stay.
    const a = page({ route: '/a.html', title: 'Thread pool' });
    const b = page({ route: '/b.html', title: 'Thread pool' });
    expect(searchPages('thread pool exhausted again', [a, b]).map((h) => h.page.route)).toEqual(['/a.html', '/b.html']);
    expect(searchPages('nothing like it', [a, b])).toEqual([]);
  });

  it('lists a lookup\'s every page that has the word, the named page first, and cuts none by score', () => {
    const named = page({ route: '/named.html', title: 'Probes' });
    const hits = searchPages('probes', [breaker, named]);
    expect(hits.map((h) => h.page.route)).toEqual(['/named.html', '/patterns/distributed/resilience/circuit-breaker.html']);
    const shelf = page({ route: '/retry.html', title: 'Retry', categories: ['Patterns', 'Resilience', 'pattern'] });
    const tagged = page({ route: '/notes.html', title: 'Notes', tags: ['resilience'] });
    const theme = page({ route: '/resilience.html', title: 'Resilience' });
    expect(searchPages('resilience', [tagged, shelf, theme]).map((h) => h.page.route)).toEqual(['/resilience.html', '/retry.html', '/notes.html']);
    // In the reader's own area the shelf page still comes after the named page.
    expect(searchPages('resilience', [tagged, { ...shelf, area: 'here' }, theme], { area: 'here' })[0]?.page.route).toBe('/resilience.html');
  });

  it('offers no anchor for a heading with an empty id, and takes the first of a tie', () => {
    expect(anchorFor(breaker, 'without')).toBeNull();
    const two = page({ headings: [{ id: 'one', text: 'Retry budget' }, { id: 'two', text: 'Retry budget' }] });
    expect(anchorFor(two, 'budget')).toBe('one');
    expect(anchorFor(page({ headings: [{ id: 'p', text: 'Pools' }] }), 'pool', { pool: ['pools'] })).toBe('p');
    // A stem counts half.
    expect(anchorFor(page({ headings: [{ id: 't', text: 'Thread pool' }] }), 'threads')).toBe('t');
  });

  it('tries one typo away only when the query lists nothing', () => {
    expect(searchWithRetry('breaker', [breaker])).toMatchObject({ query: 'breaker', retried: false });
    const fixed = searchWithRetry('brekaer', [breaker]);
    expect(fixed).toMatchObject({ query: 'breaker', retried: true });
    expect(fixed.hits.map((h) => h.page.title)).toEqual(['Circuit Breaker']);
  });

  it('ranks a variant only when a page names it, and says so when none lists a page', () => {
    // "thw" is one replacement from "the", which the page's description holds
    // but the rule never scores: a stopword.
    const the = page({ title: 'Xyz', description: 'the' });
    expect(searchWithRetry('thw', [the])).toMatchObject({ query: 'thw', hits: [], retried: false });
    expect(searchWithRetry('qqqqq', [breaker])).toMatchObject({ query: 'qqqqq', hits: [], retried: false });
  });

  it('reads tag labels and the synonym table the box hands it', () => {
    const tagged = page({ title: 'Xyz', tags: ['event-driven'], categories: ['Patterns'] });
    expect(searchWithRetry('reactive streams', [tagged]).hits).toEqual([]);
    expect(searchWithRetry('reactive streams', [tagged], { tagLabels: { 'event-driven': 'Reactive streams' } }).hits).toHaveLength(1);
    expect(searchWithRetry('ml', [tagged], { syn: { ml: ['event', 'driven'] } }).hits).toHaveLength(1);
    expect(pageFacts(tagged, { 'event-driven': 'Reactive streams' }).tags).toEqual(['event-driven', 'Reactive streams']);
  });

  it('builds variants by swaps, then replacements, then deletions, never insertions', () => {
    const v = variants('abc');
    expect(v.slice(0, 2)).toEqual(['bac', 'acb']);
    expect(v).toContain('abd');
    expect(v.slice(-3)).toEqual(['bc', 'ac', 'ab']);
    expect(v.every((x) => x.length <= 3)).toBe(true);
    expect(variants('ab')).toEqual([]);
    expect(variants('a'.repeat(RETRY_MAX_LENGTH + 1))).toEqual([]);
    expect(variants('a'.repeat(RETRY_MIN_LENGTH)).length).toBeGreaterThan(0);
    // A deletion that leaves one character is no query.
    expect(variants('a b')).not.toContain('b');
  });

  it('normalizes to lower-case letters and digits, single spaces', () => {
    expect(normalize('  Sync-drift: the RUNBOOK!  ')).toBe('sync drift the runbook');
  });
});

describe('matchTerms', () => {
  const terms: SearchTerm[] = [
    { id: 'lens', term: 'Lens', definition: 'A reading level.', aliases: ['reading lens'] },
    { id: 'hub', term: 'Hub', definition: 'An area page.', aliases: [] },
  ];

  const ids = (list: SearchTerm[]): string[] => list.map((t) => t.id);

  it('calls a term exact when the query is its name or alias, or the name followed by more words', () => {
    expect(ids(matchTerms('lens', terms).exact)).toEqual(['lens']);
    expect(ids(matchTerms('Reading  Lens', terms).exact)).toEqual(['lens']);
    expect(ids(matchTerms('hub page', terms).exact)).toEqual(['hub']);
    expect(matchTerms('hub page', terms).loose).toEqual([]);
  });

  it('calls a term loose when the query only starts its name or alias', () => {
    expect(ids(matchTerms('len', terms).loose)).toEqual(['lens']);
    expect(matchTerms('len', terms).exact).toEqual([]);
    expect(ids(matchTerms('reading', terms).loose)).toEqual(['lens']);
    expect(matchTerms('ubiquitous', terms)).toEqual({ exact: [], loose: [] });
  });

  it('matches nothing for a one-character query', () => {
    expect(matchTerms('h', terms)).toEqual({ exact: [], loose: [] });
  });
});

describe('snippet', () => {
  const description = 'Stops calling a failing service.';

  it('skips the description and marks every query word in the sentence holding most of them', () => {
    const body = `${description} A breaker trips open. Once open, the breaker waits, then a probe half-opens it.`;
    const runs = snippet('breaker probe', body, description);
    expect(text(runs)).toBe('Once open, the breaker waits, then a probe half-opens it.');
    expect(marked(runs)).toEqual(['breaker', 'probe']);
  });

  it('marks a stem and a synonym too, the longest word first', () => {
    const runs = snippet('threads', 'Every thread in the pool is busy with threads of work.', '', { threads: ['pool'] });
    expect(marked(runs)).toEqual(['thread', 'pool', 'threads']);
  });

  it('is empty when no sentence holds a query word, or the query has none', () => {
    expect(snippet('zebra', 'A breaker trips open.')).toEqual([]);
    expect(snippet('my', 'A breaker trips open.')).toEqual([]);
  });

  it('cuts a long sentence around its first mark at word edges, an ellipsis each side', () => {
    const before = 'word '.repeat(60);
    const after = ' tail'.repeat(60);
    const runs = snippet('breaker', `${before}breaker${after}`, '', {}, 44);
    expect(runs[0]).toEqual({ text: '…', hit: false });
    expect(runs[runs.length - 1]).toEqual({ text: '…', hit: false });
    expect(marked(runs)).toEqual(['breaker']);
    const shown = text(runs.slice(1, -1));
    expect(shown.startsWith('word')).toBe(true);
    expect(shown.endsWith('tail')).toBe(true);
    expect(shown.length).toBeLessThanOrEqual(44);
  });

  it('drops a mark that falls past the cut', () => {
    const runs = snippet('breaker', `breaker ${'x '.repeat(100)}breaker`, '', {}, 30);
    expect(marked(runs)).toEqual(['breaker']);
    expect(runs[runs.length - 1]).toEqual({ text: '…', hit: false });
  });

  it('keeps a first mark whole even when it is longer than the width', () => {
    const long = `${'a'.repeat(50)}zebra`;
    const runs = snippet(long, `lead ${long} tail`, '', {}, 20);
    expect(marked(runs)).toEqual([long]);
  });
});

describe('the payload wire form of headings', () => {
  const hs = [
    { id: 'what-it-is', text: 'What it is' },
    { id: '', text: 'No id' },
  ];

  it('writes a pair with an id and the bare text without, and reads both back unchanged', () => {
    expect(encodeHeadings(hs)).toEqual([['what-it-is', 'What it is'], 'No id']);
    expect(decodeHeadings(encodeHeadings(hs))).toEqual(hs);
  });

  it('keeps an { id, text } object as it is, so an older payload still reads', () => {
    expect(decodeHeadings(hs)).toEqual(hs);
  });

  it('decodes a page’s headings and leaves its other fields alone', () => {
    const page = { route: '/a.html', title: 'A', headings: encodeHeadings(hs) } as unknown as Parameters<typeof decodePage>[0];
    expect(decodePage(page)).toEqual({ route: '/a.html', title: 'A', headings: hs });
  });
});
