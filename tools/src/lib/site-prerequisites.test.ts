/**
 * The prerequisite card's data: one card per record with an edge, its links
 * in array order with the neighbour's label, definition and route, the two
 * comma-joined facts, a loud stop on an id no record declares, and one
 * real-tree case holding every card to docs/data/prerequisites.json.
 */

import fs from 'node:fs';
import path from 'node:path';

import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import { makeSandbox, REPO_ROOT, type Sandbox } from './sandbox.js';
import { cardFacts, cardsFrom, isCardWrapper, loadCards, PREREQUISITES, type CardRecord } from './site-prerequisites.js';

const rec = (id: string, requires: string[] = [], related: string[] = []): CardRecord => ({
  id,
  label: id.toUpperCase(),
  definition: `What ${id} is`,
  route: `/patterns/${id}.html`,
  requires,
  related,
});

describe('cardsFrom', () => {
  it('gives each record with an edge one card: requires then related, in array order, each link its record’s label, definition and route', () => {
    const cards = cardsFrom([rec('a', ['c', 'b'], ['d']), rec('b'), rec('c'), rec('d', [], ['a'])]);
    expect([...cards.keys()]).toEqual(['/patterns/a.html', '/patterns/d.html']);
    const a = cards.get('/patterns/a.html');
    expect(a?.requires).toEqual([
      { id: 'c', label: 'C', definition: 'What c is', route: '/patterns/c.html' },
      { id: 'b', label: 'B', definition: 'What b is', route: '/patterns/b.html' },
    ]);
    expect(a?.related.map((l) => l.id)).toEqual(['d']);
    expect(cards.get('/patterns/d.html')?.requires).toEqual([]);
  });

  it('gives a record with no edge no card', () => {
    expect(cardsFrom([rec('a'), rec('b')]).size).toBe(0);
  });

  it('stops on an id no record declares, naming the file, the record and the id', () => {
    expect(() => cardsFrom([rec('a', [], ['ghost'])])).toThrow(
      `${PREREQUISITES}: record 'a' names 'ghost', which no record declares — run: make gate G=check-prerequisites`,
    );
  });
});

describe('cardFacts', () => {
  it('joins each list’s ids with commas and no spaces; an empty list is an empty fact', () => {
    const card = cardsFrom([rec('a', ['b', 'c']), rec('b'), rec('c')]).get('/patterns/a.html');
    expect(cardFacts(card as never)).toEqual({ requires: 'b,c', related: '' });
  });
});

describe('isCardWrapper', () => {
  it('is a class-free element carrying either fact; a classed one is paint, and one with neither fact is no card', () => {
    expect(isCardWrapper([{ name: 'data-requires' }, { name: 'data-related' }])).toBe(true);
    expect(isCardWrapper([{ name: 'data-related' }])).toBe(true);
    expect(isCardWrapper([{ name: 'class' }, { name: 'data-requires' }])).toBe(false);
    expect(isCardWrapper([{ name: 'data-block' }])).toBe(false);
  });
});

describe('loadCards', () => {
  let sb: Sandbox;
  beforeEach(() => {
    sb = makeSandbox();
  });
  afterEach(() => sb.cleanup());

  it('reads the file again only when it changed (so `astro dev` sees an edit); a tree with no prerequisite file, or none listing records, has no card', () => {
    expect(loadCards(sb.dir).size).toBe(0);
    const other = makeSandbox();
    try {
      const file = path.join(other.dir, PREREQUISITES);
      other.write(PREREQUISITES, `${JSON.stringify({ version: 1, records: [rec('a', ['b']), rec('b')] })}\n`);
      fs.utimesSync(file, 1_000, 1_000);
      const first = loadCards(other.dir);
      expect([...first.keys()]).toEqual(['/patterns/a.html']);
      expect(loadCards(other.dir)).toBe(first);
      // An edit moves the modification time: the next read sees it.
      other.write(PREREQUISITES, `${JSON.stringify({ version: 1, records: [rec('a'), rec('b', [], ['a'])] })}\n`);
      fs.utimesSync(file, 2_000, 2_000);
      expect([...loadCards(other.dir).keys()]).toEqual(['/patterns/b.html']);
      // The file removed: no card.
      other.rm(PREREQUISITES);
      expect(loadCards(other.dir).size).toBe(0);
    } finally {
      other.cleanup();
    }
    const third = makeSandbox();
    try {
      third.write(PREREQUISITES, `${JSON.stringify({ version: 1 })}\n`);
      expect(loadCards(third.dir).size).toBe(0);
    } finally {
      third.cleanup();
    }
  });

  it('real tree: one card per record with an edge, each list the record’s own ids, every link a declared record', () => {
    const records = (JSON.parse(fs.readFileSync(path.join(REPO_ROOT, PREREQUISITES), 'utf8')) as { records: CardRecord[] }).records;
    const cards = loadCards(REPO_ROOT);
    const withEdges = records.filter((r) => r.requires.length > 0 || r.related.length > 0);
    expect(cards.size).toBe(withEdges.length);
    for (const r of withEdges) {
      const card = cards.get(r.route);
      expect(card, r.id).toBeDefined();
      expect(cardFacts(card as never), r.id).toEqual({ requires: r.requires.join(','), related: r.related.join(',') });
    }
  });
});
