/**
 * The listing's quick scan answers what a full parse answers: on crafted
 * pages, and on every page of the real tree.
 */

import fs from 'node:fs';
import path from 'node:path';

import { describe, expect, it } from 'vitest';

import { REAL_TREE_TIMEOUT } from '../lib/fixtures.js';
import { parseKb, plainText, readKb } from '../lib/kb-attrs.js';

import { Corpus, REPO } from './corpus.js';
import { inline, parsePage } from './page.js';
import { quickFacts } from './scan.js';

describe('quickFacts', () => {
  it('reads the block facts under each ##, and whether the wild block holds an item', () => {
    const page = [
      '# T',
      '',
      '## What',
      '<!--meta block=description-->',
      '',
      '## Ladder',
      '<!--meta block=explain-->',
      '',
      '## Wild',
      '<!--meta block=wild-->',
      '',
      '* **x** — y {#wild-x}',
    ].join('\n');
    expect(quickFacts(page)).toEqual({
      blocks: ['description', 'explain', 'wild'],
      hasExplain: true,
      hasExample: true,
      headings: [
        { block: 'description', heading: 'What', groups: [] },
        { block: 'explain', heading: 'Ladder', groups: [] },
        { block: 'wild', heading: 'Wild', groups: [] },
      ],
    });
  });

  it('skips a heading inside a fence of either kind, and a heading with no fact', () => {
    const page = [
      '## Code',
      '<!--meta block=sketch-->',
      '````md',
      '## Inside',
      '<!--meta block=explain-->',
      '```',
      '```` not a closing run',
      '````',
      '~~~',
      '## Also inside',
      '```',
      '~~~',
      '## Loose',
      'text',
      '- an item outside any wild block',
      '# Another title',
      '- still not wild',
      '## Last',
    ].join('\n');
    expect(quickFacts(page)).toEqual({ blocks: ['sketch'], hasExplain: false, hasExample: false, headings: [{ block: 'sketch', heading: 'Code', groups: [] }] });
  });

  it('reads each group heading under its block, its suffix cut off, and skips a group outside any block', () => {
    const page = [
      '### Stray',
      '<!--meta polarity=pro-->',
      '',
      '## Trade-offs {not a suffix}',
      '<!--meta block=tradeoffs-->',
      '',
      '### Pros {#pros-h}',
      '<!--meta polarity=pro-->',
      '',
      '### Plain third level',
      '',
      '### Cons',
      '<!--meta polarity=con-->',
      '',
      '## Requirements',
      '<!--meta block=requirements-->',
      '',
      '### Functional',
      '<!--meta requirement=fr-->',
    ].join('\n');
    expect(quickFacts(page).headings).toEqual([
      {
        block: 'tradeoffs',
        heading: 'Trade-offs {not a suffix}',
        groups: [
          { fact: 'polarity', value: 'pro', heading: 'Pros' },
          { fact: 'polarity', value: 'con', heading: 'Cons' },
        ],
      },
      { block: 'requirements', heading: 'Requirements', groups: [{ fact: 'requirement', value: 'fr', heading: 'Functional' }] },
    ]);
  });

  it(
    'agrees with the full parse on every page of the real tree',
    () => {
      const corpus = new Corpus(REPO);
      for (const p of corpus.pages) {
        const text = fs.readFileSync(path.join(REPO, p.source), 'utf8');
        const doc = parsePage(text);
        const q = quickFacts(text);
        expect(q.blocks, p.slug).toEqual(doc.blocks.map((b) => b.name));
        expect(q.headings.map((h) => h.block), p.slug).toEqual(q.blocks);
        // A group heading's text is the markdown of the `###` the full parse reads under that fact.
        for (const [i, b] of doc.blocks.entries()) {
          const groups = b.nodes.filter((n) => n.type === 'heading' && n.depth === 3 && (readKb(n)?.facts?.['polarity'] ?? readKb(n)?.facts?.['requirement']) !== undefined);
          expect(q.headings[i]?.groups.map((g) => g.value), `${p.slug} ${b.name}`).toEqual(groups.map((n) => readKb(n)?.facts?.['polarity'] ?? readKb(n)?.facts?.['requirement']));
          expect(q.headings[i]?.groups.map((g) => plainText(parseKb(g.heading).tree)), `${p.slug} ${b.name}`).toEqual(groups.map((n) => inline(n)));
        }
        const wild = doc.blocks.find((b) => b.name === 'wild');
        expect(q.hasExample, p.slug).toBe(wild !== undefined && wild.nodes.some((n) => n.type === 'list' && n.children.length > 0));
      }
    },
    REAL_TREE_TIMEOUT,
  );
});
