/**
 * The ranking behind `find` and `brief`: the shared scorer's stemming, query
 * terms and weights pinned, the limit rule, the prose index built from
 * markdown and the synonym loader. How well it ranks the real corpus is
 * relevance.test.ts's.
 */

import { describe, expect, it } from 'vitest';

import { writeKbFixture } from '../lib/fixtures.js';
import { makeSandbox } from '../lib/sandbox.js';

import { parsePage } from './page.js';
import {
  indexBody,
  loadSynonyms,
  own,
  proseLines,
  queryTerms,
  rank,
  stemVariant,
  STOP,
  termVariants,
  type CatalogNode,
} from './rank.js';

describe('the scorer', () => {
  it('stems and splits a query', () => {
    const stems: [string, string | null][] = [
      ['queries', 'query'],
      ['batches', 'batch'],
      ['threads', 'thread'],
      ['blocking', 'block'],
      ['retried', 'retry'],
      ['blocked', 'block'],
      ['glass', null],
      ['cat', null],
      ['bees', null],
      ['ties', null],
    ];
    for (const [w, stem] of stems) expect(stemVariant(w), w).toBe(stem);
    expect(queryTerms('The threads and THE threads hang')).toEqual(['threads', 'hang']);
    expect(STOP.has('the')).toBe(true);
  });

  it('never reads a synonym off Object.prototype', () => {
    expect(own({}, 'constructor')).toEqual([]);
    expect(termVariants('constructor', {})).toEqual(['constructor']);
    expect(termVariants('threads', { threads: ['workers'] })).toEqual(['threads', 'workers', 'thread']);
    expect(termVariants('thread', { thread: ['thread'] })).toEqual(['thread', 'thread']);
  });

  it('slices by the limit when it is truthy (`limit ? out.slice(0, limit) : out`), so zero and NaN mean all', () => {
    const nodes: CatalogNode[] = ['a', 'b', 'c', 'd'].map((id, i) => ({ id, name: id, kind: 'pattern', band: 'x', essence: `cache ${'x'.repeat(i)}`, path: `${id}.html` }));
    for (const limit of [0, Number.NaN]) expect(rank({ nodes, q: 'cache', syn: {}, limit }).map((x) => x.n.id), String(limit)).toEqual(['a', 'b', 'c', 'd']);
    expect(rank({ nodes, q: 'cache', syn: {}, limit: -2 }).map((x) => x.n.id)).toEqual(['a', 'b']);
    expect(rank({ nodes, q: 'cache', syn: {}, limit: 3 }).map((x) => x.n.id)).toEqual(['a', 'b', 'c']);
  });

  it('scores prose through bodyOf, keeps the first matched line, and returns everything with no limit', () => {
    const nodes: CatalogNode[] = [
      { id: 'a', name: 'Alpha', kind: 'pattern', band: 'x', essence: 'first', path: 'a.html', tags: ['queue'] },
      { id: 'b', name: 'Beta', kind: 'pattern', band: 'x', essence: 'second', path: 'b.html', solves: ['a queue that never drains'] },
    ];
    const bodyOf = (n: CatalogNode): ReturnType<typeof indexBody> =>
      indexBody(n.id === 'a' ? ['The queue backs up behind a slow consumer here.', 'The queue drains again once the consumer recovers.'] : ['short']);
    const r = rank({ nodes, q: 'queue drains', syn: {}, bodyOf });
    expect(r.map((x) => x.n.id)).toEqual(['b', 'a']);
    expect(r[1]?.why).toBe('The queue backs up behind a slow consumer here.');
    expect(rank({ nodes: [], q: 'x', syn: {}, bodyOf })).toEqual([]);
  });
});

describe('the categories and tag labels', () => {
  const nodes: CatalogNode[] = [
    { id: 'breaker', name: 'Circuit Breaker', kind: 'pattern', band: 'distributed', essence: 'Stops calls', path: 'b.html', tags: ['event-driven'] },
    { id: 'bitly', name: 'Bitly', kind: 'design', band: 'design', essence: 'Short links', path: 'l.html' },
  ];
  const categoriesOf = (n: CatalogNode): string[] => (n.kind === 'design' ? ['Case Studies', 'Foundational', 'case study'] : ['Patterns', 'Network', 'pattern']);

  it('ranks the pages on a shelf first when the query is the shelf', () => {
    expect(rank({ nodes, q: 'case study', syn: {}, categoriesOf }).map((x) => x.n.id)).toEqual(['bitly']);
    expect(rank({ nodes, q: 'network', syn: {}, categoriesOf }).map((x) => x.n.id)).toEqual(['breaker']);
    expect(rank({ nodes, q: 'network', syn: {} })).toEqual([]);
  });

  it('reads a tag by its label as well as its id', () => {
    expect(rank({ nodes, q: 'reactive streams', syn: {} })).toEqual([]);
    expect(rank({ nodes, q: 'reactive streams', syn: {}, tagLabels: { 'event-driven': 'Reactive streams' } }).map((x) => x.n.id)).toEqual(['breaker']);
  });
});

describe('the prose index', () => {
  it('lists the title, the intro, each block heading and every visible element; code by line, figures never', () => {
    const doc = parsePage(
      [
        '# Title',
        '',
        'Intro.',
        '',
        '## Block',
        '<!--meta block=sketch-->',
        '',
        '<!-- a comment -->',
        '',
        '```ts summary="A summary"',
        'line one',
        'line two',
        '```',
        '',
        '```',
        'bare',
        '```',
        '',
        '```mermaid caption="Never"',
        'flowchart LR',
        '```',
        '',
        '| a | b |',
        '| --- | --- |',
        '| c | d |',
        '',
        '---',
        '',
        'Deep.',
      ].join('\n'),
    );
    expect(proseLines(doc)).toEqual(['Title', 'Intro.', 'Block', 'A summary', 'line one', 'line two', 'bare', 'a', 'b', 'c', 'd', 'Deep.']);
    expect(proseLines(parsePage('Text only.'))).toEqual(['Text only.']);
  });

  it('indexes a row that names another page by its note alone: the page’s own words, not the neighbour’s title', () => {
    const doc = parsePage(
      [
        '# Cache-Aside',
        '',
        '## Where it shows up',
        '<!--meta block=fluency-->',
        '',
        '<!-- fluency:start -->',
        '',
        '- [System Design Interview](../../themes/system-design-interview.md) — Serve hot reads from memory {#fluency-system-design-interview}',
        '',
        '<!-- fluency:end -->',
        '',
        '## How it relates',
        '<!--meta block=relationships-->',
        '',
        '<!-- relationships:start -->',
        '',
        '**Demonstrated by**',
        '',
        '- [Gopuff](../../designs/gopuff.md) — inventory is read from cache first',
        '- [Bitly](../../designs/bitly.md)',
        '',
        '<!-- relationships:end -->',
        '',
        '## Neighbouring themes',
        '<!--meta block=siblings-->',
        '',
        'Themes beside this one, with [Caching](./caching.md) among them.',
        '',
        '- [CAP Theorem](./cap-theorem.md) — The consistency-versus-availability choice',
        '',
        '## In the wild',
        '<!--meta block=wild-->',
        '',
        '- **[Netflix](https://netflix.com)** — caches its catalog {#wild-netflix}',
      ].join('\n'),
    );
    expect(proseLines(doc)).toEqual([
      'Cache-Aside',
      'Where it shows up',
      'Serve hot reads from memory',
      'How it relates',
      'Demonstrated by',
      'inventory is read from cache first',
      '',
      'Neighbouring themes',
      'Themes beside this one, with Caching among them.',
      'The consistency-versus-availability choice',
      'In the wild',
      'Netflix — caches its catalog',
    ]);
    const body = indexBody(proseLines(doc));
    expect(body.hits.has('gopuff')).toBe(false);
    expect(body.hits.has('theorem')).toBe(false);
    expect(body.hits.has('netflix')).toBe(true);
  });

  it('indexes words by the lines that hold them, counting a line once, lines of 25 or fewer characters left out', () => {
    const b = indexBody(['A slow consumer holds the queue, the queue waits.', 'Tiny line.', 'Another sentence about the queue here! And one more line of text.']);
    expect(b.hits.get('queue')).toEqual({ n: 2, line: 'A slow consumer holds the queue, the queue waits.' });
    expect(b.hits.has('tiny')).toBe(false);
    expect(b.hits.get('more')?.line).toBe('And one more line of text.');
    expect(b.tokens).toBe(21);
    expect(indexBody(['', '1 2']).tokens).toBe(0);
  });
});

describe('loadSynonyms', () => {
  it('layers the curated map over the generated table', async () => {
    const sb = makeSandbox();
    try {
      writeKbFixture(sb.dir);
      expect(await loadSynonyms(sb.dir)).toEqual({ stall: ['hang'], fuse: ['breaker'], hang: ['wait'] });
    } finally {
      sb.cleanup();
    }
  });

  it('reads an absent map or table, or an absent file, as empty', async () => {
    const sb = makeSandbox();
    try {
      sb.write('docs/data/search-synonyms.json', '{}');
      expect(await loadSynonyms(sb.dir)).toEqual({});
      sb.rm('docs/data/search-synonyms.json');
      expect(await loadSynonyms(sb.dir)).toEqual({});
    } finally {
      sb.cleanup();
    }
  });
});
