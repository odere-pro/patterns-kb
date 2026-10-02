/**
 * The one place a page's facts become meta tags and JSON-LD.
 *
 * Both serialisations are built from the same entry, so the cases pin that they
 * agree and that neither invents a field the entry does not carry.
 */
import { describe, expect, it } from 'vitest';

import { jsonLd, jsonLdText, metaTags, pageMeta, type MetaEntry } from './page-meta';

// filePath left off so lastModified() short-circuits before it shells out to
// git: this suite is about the shape, not about the repo it runs in.
const entry = (data: Partial<MetaEntry['data']> = {}): MetaEntry => ({
  data: {
    title: 'Circuit Breaker',
    description: "Stops calling a service that's already failing",
    area: 'distributed-resilience',
    owner: 'Oleksandr Derechei',
    ...data,
  },
});

describe('pageMeta', () => {
  it('defaults status to stable and tags to empty', () => {
    const meta = pageMeta(entry());
    expect(meta.status).toBe('stable');
    expect(meta.tags).toEqual([]);
    expect(meta.modified).toBeNull();
  });

  it('keeps the values a page did declare', () => {
    const meta = pageMeta(entry({ status: 'draft', tags: ['resilience', 'latency'] }));
    expect(meta.status).toBe('draft');
    expect(meta.tags).toEqual(['resilience', 'latency']);
  });
});

describe('metaTags', () => {
  it('emits the four kb:* names, tags joined by comma', () => {
    const tags = metaTags(pageMeta(entry({ tags: ['resilience', 'latency'] })));
    expect(tags.map(([name]) => name)).toEqual(['kb:area', 'kb:status', 'kb:owner', 'kb:tags']);
    expect(Object.fromEntries(tags)['kb:tags']).toBe('resilience,latency');
  });

  it('gives each alias and each solves phrase an element of its own, commas and all', () => {
    const tags = metaTags(
      pageMeta(
        entry({
          aliases: ['breaker', 'CB'],
          solves: ['one slow call, then another', 'retries make it worse'],
        }),
      ),
    );
    expect(tags.slice(4)).toEqual([
      ['kb:alias', 'breaker'],
      ['kb:alias', 'CB'],
      ['kb:solves', 'one slow call, then another'],
      ['kb:solves', 'retries make it worse'],
    ]);
    expect(metaTags(pageMeta(entry()))).toHaveLength(4);
  });
});

describe('jsonLd', () => {
  it('names the page, its area and its owner', () => {
    const ld = jsonLd(pageMeta(entry({ tags: ['resilience'] })));
    expect(ld).toMatchObject({
      '@type': 'TechArticle',
      headline: 'Circuit Breaker',
      isPartOf: { name: 'distributed-resilience' },
      author: { name: 'Oleksandr Derechei' },
      keywords: 'resilience',
    });
  });

  // schema.org keys are omitted rather than emitted empty: a `keywords: ""` is
  // a claim that the page has no keywords, which is not the same as silence.
  it('omits keywords, author and dateModified when there is nothing to say', () => {
    const ld = jsonLd(pageMeta(entry({ owner: '' })));
    expect(ld).not.toHaveProperty('keywords');
    expect(ld).not.toHaveProperty('author');
    expect(ld).not.toHaveProperty('dateModified');
    expect(
      jsonLd({ ...pageMeta(entry()), modified: '2026-09-24T10:00:00+02:00' }).dateModified,
    ).toBe('2026-09-24T10:00:00+02:00');
  });

  it('writes no < in its text, so a closing script tag in a value cannot end the block', () => {
    const text = jsonLdText(pageMeta(entry({ description: 'a </script> b' })));
    expect(text).not.toContain('<');
    expect((JSON.parse(text) as { description: string }).description).toBe('a </script> b');
  });
});
