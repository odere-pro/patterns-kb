// @vitest-environment node
/**
 * The prerequisite card, rendered over the real tree: a class-free data block
 * carrying exactly the record's two lists, one link per id in array order with
 * the neighbour's label, definition and route, no skip marker and no heading;
 * nothing at all for a page with no record. What the card holds is
 * tools/src/lib/site-prerequisites.ts's, tested there. The `node` docblock is
 * the one every render test needs (see ../SectionHub/section-hub.render.test.ts).
 */
import fs from 'node:fs';
import path from 'node:path';

import { describe, expect, it } from 'vitest';

import { PREREQUISITES, type CardRecord } from '../../../../tools/src/lib/site-prerequisites';
import { renderComponent } from '../../lib/render-fixture';
import { loadNotes, reasonFor } from '../../lib/relation-notes';
import { repoRoot } from '../../lib/repo-root';

import PrerequisiteCard from './PrerequisiteCard.astro';

const records = (
  JSON.parse(fs.readFileSync(path.join(repoRoot(), PREREQUISITES), 'utf8')) as {
    records: CardRecord[];
  }
).records;
const byId = new Map(records.map((r) => [r.id, r]));

const at = (filePath: string): App.Locals =>
  ({ starlightRoute: { entry: { filePath } } }) as unknown as App.Locals;

/** Text or an attribute value as Astro escaped it, read back. */
const decode = (s: string): string =>
  s
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&amp;/g, '&');

/** The titles of a rendered card's links, in order, decoded. */
const titles = (html: string): string[] =>
  [...html.matchAll(/<a href="[^"]*" title="([^"]*)"/g)].map((m) => decode(m[1]));

/** The texts of a rendered card's links, in order, decoded. */
const labels = (html: string): string[] =>
  [...html.matchAll(/<a [^>]*>\s*([^<]*?)\s*<\/a>/g)].map((m) => decode(m[1]));

/** The hrefs of a rendered card, in order. */
const hrefs = (html: string): string[] => [...html.matchAll(/<a href="([^"]*)"/g)].map((m) => m[1]);

describe('PrerequisiteCard', () => {
  it('a page that requires others: the data block states both lists, then one link per requires id, then per related id', async () => {
    const r = records.find((x) => x.requires.length > 0 && x.related.length > 0) as CardRecord;
    expect(r).toBeDefined();
    const html = await renderComponent(PrerequisiteCard, { props: { route: r.route } });
    expect(html).toContain(
      `<div data-requires="${r.requires.join(',')}" data-related="${r.related.join(',')}">`,
    );
    expect(hrefs(html)).toEqual([...r.requires, ...r.related].map((id) => byId.get(id)?.route));
    expect(titles(html)).toEqual(
      [...r.requires, ...r.related].map((id) => (byId.get(id) as CardRecord).definition),
    );
    expect(html).toContain('Read first');
    expect(html).toContain('Related');
    expect(html).not.toContain('data-kb-skip');
    expect(html).not.toMatch(/<h[1-6]/);
  });

  it('every record with an edge, over the real file: its facts, then each link’s route, label and definition in array order', async () => {
    const withEdges = records.filter((x) => x.requires.length > 0 || x.related.length > 0);
    expect(withEdges.length).toBeGreaterThan(0);
    for (const r of withEdges) {
      const html = await renderComponent(PrerequisiteCard, { props: { route: r.route } });
      const ids = [...r.requires, ...r.related];
      // Astro writes an empty fact bare.
      const fact = (name: string, ids: readonly string[]): string =>
        ids.length === 0 ? name : `${name}="${ids.join(',')}"`;
      expect(html, r.id).toContain(
        `<div ${fact('data-requires', r.requires)} ${fact('data-related', r.related)}>`,
      );
      expect(hrefs(html), r.id).toEqual(ids.map((id) => byId.get(id)?.route));
      expect(titles(html), r.id).toEqual(ids.map((id) => (byId.get(id) as CardRecord).definition));
      expect(labels(html), r.id).toEqual(ids.map((id) => (byId.get(id) as CardRecord).label));
    }
  });

  it('a record with related pages only: an empty requires fact, which Astro writes bare, and no "Read first" row', async () => {
    const r = records.find((x) => x.requires.length === 0 && x.related.length > 0) as CardRecord;
    const html = await renderComponent(PrerequisiteCard, { props: { route: r.route } });
    expect(html).toContain(`<div data-requires data-related="${r.related.join(',')}">`);
    expect(html).not.toContain('Read first');
  });

  it("reads the page's own route when none is given", async () => {
    const r = records.find((x) => x.requires.length > 0) as CardRecord;
    const html = await renderComponent(PrerequisiteCard, {
      locals: at(`src/content/docs${r.route.replace(/\.html$/, '.md')}`),
    });
    expect(html).toContain(`data-requires="${r.requires.join(',')}"`);
  });

  it('renders nothing for a page with no record, or a file outside the collection', async () => {
    expect(
      (await renderComponent(PrerequisiteCard, { props: { route: '/no/such/page.html' } })).trim(),
    ).toBe('');
    expect(
      (await renderComponent(PrerequisiteCard, { locals: at('elsewhere/readme.md') })).trim(),
    ).toBe('');
  });

  it('shows the reason each relation gives, from this page’s side, beside its link', async () => {
    const r = records.find((x) => x.id === 'circuit-breaker') as CardRecord;
    const html = await renderComponent(PrerequisiteCard, { props: { route: r.route } });
    const notes = loadNotes(repoRoot());
    const why = [...html.matchAll(/<span class="kb-prereq-why">([^<]*)<\/span>/g)].map((m) =>
      decode(m[1]),
    );
    expect(why.length).toBeGreaterThan(0);
    expect(why).toContain(reasonFor(notes, 'circuit-breaker', 'timeout-deadline'));
    expect(why).toContain(reasonFor(notes, 'circuit-breaker', 'retry-backoff'));
  });

  it('shows the first five links of a row and folds the rest behind "See all N"', async () => {
    const r = records.find((x) => x.related.length > 5) as CardRecord;
    expect(r).toBeDefined();
    const html = await renderComponent(PrerequisiteCard, { props: { route: r.route } });
    expect(html).toContain(`<summary>See all ${r.related.length}</summary>`);
    // Every link is still on the page, in order, the folded ones inside the <details>.
    expect(hrefs(html)).toEqual([...r.requires, ...r.related].map((id) => byId.get(id)?.route));
    const folded = html.slice(html.indexOf('<details'), html.indexOf('</details>'));
    expect((folded.match(/<a href=/g) ?? []).length).toBe(r.related.length - 5);
    const before = html.slice(0, html.indexOf('<details'));
    expect(before).not.toContain(`href="${byId.get(r.related[5])?.route}"`);
  });

  it('draws no "See all" for a row of five or fewer', async () => {
    const r = records.find(
      (x) => x.related.length > 0 && x.related.length <= 5 && x.requires.length <= 5,
    ) as CardRecord;
    const html = await renderComponent(PrerequisiteCard, { props: { route: r.route } });
    expect(html).not.toContain('See all');
    expect(html).not.toContain('<details');
  });
});
