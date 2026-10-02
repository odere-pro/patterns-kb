/**
 * The learning-path gate over docs/data/learning-paths.json. The oracle
 * scenario comes first, in both route spellings — the spec's slashed routes and
 * this KB's file routes (dialect D-02) — because the gate compares strings and
 * must not care which one the structure file uses. Then one planted fault per
 * rule, each asserting the exact finding and its line, and last the real tree.
 */

import fs from 'node:fs';
import path from 'node:path';

import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import { capture, expectFail, expectMisuse, expectPass, makeSandbox, REPO_ROOT, type Sandbox } from '../lib/sandbox.js';
import { DRAFT, LEARNING_PATHS, nearMiss, producedRoutes, SHOWN, spec, STRUCTURE } from './check-learning-paths.js';
import {
  AREAS,
  HEADER,
  json,
  learningPageText,
  learningPathsJson,
  learningTree,
  lineOf,
  note,
  NOTES,
  PROFILES,
  row,
  type FixtureRow,
} from '../lib/fixtures.js';

let sb: Sandbox;
beforeEach(() => {
  sb = makeSandbox();
});
afterEach(() => sb.cleanup());

const findings = (err: string): string[] => err.split('\n').filter((l) => l.startsWith('[learning-paths] FAIL'));
const notes = (err: string): string[] => err.split('\n').filter((l) => l.startsWith('[learning-paths] note:'));
const FAIL = `[learning-paths] FAIL ${LEARNING_PATHS}`;

describe('learning-paths-O1', () => {
  /**
   * Three published routes, one profile. The profile is named after one of
   * the three pages, as every profile here is: its tour renders there.
   */
  const scenario = (areas: Readonly<Record<string, readonly FixtureRow[]>>) => async (stage: string) => {
    learningTree(sb, [{ id: 'everyone', label: 'Everyone', stages: [Object.values(areas)[0]?.[0]?.route, stage] }], null, areas);
    return sb.run(spec);
  };

  it('slashed routes: an unserved stage and one missing its trailing slash are one finding each; exact, it passes', async () => {
    const slashed = (area: string, slug: string): FixtureRow => ({ slug, source: `docs/${area}/${slug}.md`, route: `/${area}/${slug}/` });
    const stageOf = scenario({ guides: [slashed('guides', 'alpha'), slashed('guides', 'beta')], start: [slashed('start', 'everyone')] });

    let r = await stageOf('/guides/gone/');
    expectFail(r);
    expect(r.out).toBe('');
    const at = lineOf(sb.read(LEARNING_PATHS), '"/guides/gone/"');
    expect(findings(r.err)).toEqual([
      `${FAIL}:${at}: profile 'everyone' stage /guides/gone/ is not a route ${STRUCTURE} produces`,
    ]);

    r = await stageOf('/guides/beta');
    expectFail(r);
    expect(findings(r.err)).toEqual([
      `${FAIL}:${at}: profile 'everyone' stage /guides/beta is not a route ${STRUCTURE} produces — it is spelled /guides/beta/ there`,
    ]);

    r = await stageOf('/guides/beta/');
    expectPass(r);
    expect(r.out).toBe('[learning-paths] 1 profiles stage 2 routes, every one produced; 0 notes, none orphaned');
  });

  it('file routes (D-02): the same three answers, the near miss being the route without .html', async () => {
    const stageOf = scenario({ patterns: [row('patterns', 'alpha'), row('patterns', 'beta')], themes: [row('themes', 'everyone')] });
    const at = (): number => lineOf(sb.read(LEARNING_PATHS), '"/patterns/', 2);

    for (const [stage, tail] of [
      ['/patterns/gone.html', ''],
      ['/patterns/beta', ' — it is spelled /patterns/beta.html there'],
      ['/patterns/beta/', ' — it is spelled /patterns/beta.html there'],
    ] as const) {
      const r = await stageOf(stage);
      expectFail(r);
      expect(r.out).toBe('');
      expect(findings(r.err), stage).toEqual([`${FAIL}:${at()}: profile 'everyone' stage ${stage} is not a route ${STRUCTURE} produces${tail}`]);
    }
    expectPass(await stageOf('/patterns/beta.html'));
  });
});

describe('the file itself', () => {
  it('passes with no learning-path file: there is no stage to check (learning-paths-C6)', async () => {
    const r = await sb.run(spec);
    expectPass(r);
    expect(r.out).toBe(`[learning-paths] no ${LEARNING_PATHS}: no stage to check`);
    expect(r.err).toBe('');
  });

  it('names a learning-path file holding `not json` once, with exit 1 (learning-paths-C3)', async () => {
    learningTree(sb);
    sb.write(LEARNING_PATHS, 'not json\n');
    const r = await sb.run(spec);
    expectFail(r);
    const f = findings(r.err);
    expect(f).toHaveLength(1);
    expect(f[0]?.startsWith(`${FAIL}: is not valid JSON — `)).toBe(true);
    expect(r.err.split('\n')).toEqual(f);
  });

  it('names a missing structure file, and one with no areas, against that file', async () => {
    learningTree(sb);
    sb.rm(STRUCTURE);
    let r = await sb.run(spec);
    expectFail(r);
    expect(findings(r.err)).toEqual([`[learning-paths] FAIL ${STRUCTURE}: is missing — every stage is checked against the routes it produces`]);

    sb.write(STRUCTURE, json({ ...HEADER }));
    sb.write(LEARNING_PATHS, '[]\n');
    r = await sb.run(spec);
    expectFail(r);
    expect(findings(r.err)).toEqual([
      `[learning-paths] FAIL ${STRUCTURE}: has no areas list, so it produces no route`,
      `${FAIL}: is not a JSON object`,
    ]);
  });

  it('names an unknown top-level key and a missing profiles list', async () => {
    learningTree(sb);
    sb.write(LEARNING_PATHS, json({ ...HEADER, paths: [] }));
    const r = await sb.run(spec);
    expectFail(r);
    expect(findings(r.err)).toEqual([
      `${FAIL}:5: unknown key "paths" — the file holds version, updated, note, profiles, notes`,
      `${FAIL}: has no profiles list`,
    ]);
  });

  it('answers --nope and --fix with exit 2, writing nothing', async () => {
    learningTree(sb);
    const before = sb.snapshot();
    for (const arg of ['--nope', '--fix', LEARNING_PATHS]) {
      const r = await sb.run(spec, [arg]);
      expectMisuse(r);
      expect(r.out).toBe('');
    }
    expect(sb.snapshot()).toEqual(before);
  });
});

describe('profiles', () => {
  it('passes the clean fixture, noting the routes no path stages (learning-paths-C5)', async () => {
    learningTree(sb);
    const r = await sb.run(spec);
    expectPass(r);
    expect(r.out).toBe('[learning-paths] 1 profiles stage 2 routes, every one produced; 2 notes, none orphaned');
    expect(notes(r.err)).toEqual([
      '[learning-paths] note: 4 published route(s) on no learning path: /patterns/gamma.html, /hazards/delta.html, /capabilities/store.html, /themes/starting.html',
    ]);
  });

  it('says nothing on stderr when every published route is on a path', async () => {
    const pages = [row('patterns', 'alpha'), row('patterns', 'beta')];
    // The profile is named after a page it stages, so no page is left off every path.
    learningTree(sb, [{ id: 'alpha', label: 'A', stages: pages.map((p) => p.route) }], null, { patterns: pages });
    const r = await sb.run(spec);
    expectPass(r);
    expect(r.err).toBe('');
  });

  it(`names at most ${SHOWN} unstaged routes and counts the rest`, async () => {
    const many = Array.from({ length: SHOWN + 2 }, (_, i) => row('patterns', `p${i}`));
    learningTree(sb, [{ id: 'p0', label: 'P', stages: [] }], {}, { patterns: many });
    const r = await sb.run(spec);
    expectPass(r);
    expect(notes(r.err)).toEqual([
      `[learning-paths] note: ${SHOWN + 2} published route(s) on no learning path: ${many
        .slice(0, SHOWN)
        .map((m) => m.route)
        .join(', ')} and 2 more`,
    ]);
  });

  it('names a profile that is no object, and each fault of a broken one at its line', async () => {
    learningTree(sb, [
      ...PROFILES,
      'starting',
      { id: 'starting', label: 'Again', stages: [] },
      { id: 'nowhere', stages: [7, '/patterns/gamma.html', '/patterns/gamma.html'], colour: 'red' },
      { label: 'No id', stages: 'all' },
    ]);
    const r = await sb.run(spec);
    expectFail(r);
    const text = sb.read(LEARNING_PATHS);
    const first = lineOf(text, '"id": "starting"') - 1;
    const again = lineOf(text, '"label": "Again"') - 2;
    const nowhere = lineOf(text, '"id": "nowhere"');
    const gamma = lineOf(text, '"/patterns/gamma.html"');
    const noId = lineOf(text, '"label": "No id"') - 1;
    expect(findings(r.err)).toEqual([
      `${FAIL}:${lineOf(text, '    "starting",')}: profiles[1] is not an object`,
      `${FAIL}:${again}: profile 'starting' is listed twice — first at line ${first}`,
      `${FAIL}:${lineOf(text, '"colour"')}: profile 'nowhere': unknown key "colour" — a profile holds id, label, stages`,
      `${FAIL}:${nowhere}: profile 'nowhere' names no published page — its tour renders on the page with that slug`,
      `${FAIL}:${nowhere - 1}: profile 'nowhere' has no label`,
      `${FAIL}:${lineOf(text, '        7')}: profile 'nowhere' stage 1 is not a route`,
      `${FAIL}:${gamma + 1}: profile 'nowhere' stages /patterns/gamma.html twice`,
      `${FAIL}:${noId}: profile 'profiles[4]' has no id`,
      `${FAIL}:${lineOf(text, '"stages": "all"')}: profile 'profiles[4]' has no stages list`,
    ]);
  });

  it('names a missing stages list at the profile’s own line', async () => {
    learningTree(sb, [{ id: 'starting', label: 'Starting out' }]);
    const r = await sb.run(spec);
    expectFail(r);
    const at = lineOf(sb.read(LEARNING_PATHS), '"id": "starting"') - 1;
    expect(findings(r.err)).toEqual([
      `${FAIL}:${at}: profile 'starting' has no stages list`,
    ]);
  });
});

describe('notes', () => {
  it('passes a tree with no notes at all: a stage with no note renders its link alone', async () => {
    learningTree(sb, PROFILES, null);
    expectPass(await sb.run(spec));
  });

  it('names each orphan: a note under an unknown profile, and one for a route its profile does not stage', async () => {
    learningTree(sb, PROFILES, {
      ...NOTES,
      '/patterns/gamma.html': { starting: note('Not on the tour'), ghost: note('Nobody') },
    });
    const r = await sb.run(spec);
    expectFail(r);
    const text = sb.read(LEARNING_PATHS);
    expect(findings(r.err)).toEqual([
      `${FAIL}:${lineOf(text, '"role": "Not on the tour"') - 1}: notes[/patterns/gamma.html].starting is an orphan — profile 'starting' does not stage /patterns/gamma.html`,
      `${FAIL}:${lineOf(text, '"role": "Nobody"') - 1}: notes[/patterns/gamma.html].ghost is an orphan — no profile has the id 'ghost'`,
    ]);
  });

  it('names notes that are not objects, and each fault of a broken note at its line', async () => {
    learningTree(sb, PROFILES, {
      '/patterns/alpha.html': { starting: 'Start here' },
      '/patterns/beta.html': {
        starting: { role: 'Then this', tour: 7, heading: '', stepLevel: 'advanced', mood: 'calm' },
      },
    });
    const r = await sb.run(spec);
    expectFail(r);
    const text = sb.read(LEARNING_PATHS);
    const beta = lineOf(text, '"role": "Then this"') - 1;
    expect(findings(r.err)).toEqual([
      `${FAIL}:${lineOf(text, '"starting": "Start here"')}: notes[/patterns/alpha.html].starting is not an object`,
      `${FAIL}:${lineOf(text, '"stepLevel"')}: notes[/patterns/beta.html].starting: unknown key "stepLevel" — a note holds role, tour, fluency, heading`,
      `${FAIL}:${lineOf(text, '"mood"')}: notes[/patterns/beta.html].starting: unknown key "mood" — a note holds role, tour, fluency, heading`,
      `${FAIL}:${beta}: notes[/patterns/beta.html].starting has no tour — write it, "" for none`,
      `${FAIL}:${beta}: notes[/patterns/beta.html].starting has no fluency — write it, "" for none`,
      `${FAIL}:${lineOf(text, '"heading": ""')}: notes[/patterns/beta.html].starting heading is empty — drop the key, or write the heading`,
    ]);
  });

  it('names a notes value that is not an object, and a route whose notes are not keyed by profile', async () => {
    learningTree(sb, PROFILES, []);
    let r = await sb.run(spec);
    expectFail(r);
    expect(findings(r.err)).toEqual([`${FAIL}:${lineOf(sb.read(LEARNING_PATHS), '"notes"')}: notes is not an object keyed by route`]);

    learningTree(sb, PROFILES, { '/patterns/alpha.html': ['starting'] });
    r = await sb.run(spec);
    expectFail(r);
    expect(findings(r.err)).toEqual([
      `${FAIL}:${lineOf(sb.read(LEARNING_PATHS), '"/patterns/alpha.html": [')}: notes[/patterns/alpha.html] is not an object keyed by profile id`,
    ]);
  });
});

describe('a draft on a learning path (maturity-C4)', () => {
  it('a staged page declaring draft is one finding naming the file, the profile and the route; dropping the stage clears it', async () => {
    learningTree(sb);
    sb.write('docs/patterns/alpha.md', learningPageText('alpha', 'stable'));
    sb.write('docs/patterns/beta.md', learningPageText('beta', DRAFT));
    let r = await sb.run(spec);
    expectFail(r);
    expect(r.out).toBe('');
    const at = lineOf(sb.read(LEARNING_PATHS), '"/patterns/beta.html"');
    expect(findings(r.err)).toEqual([
      `${FAIL}:${at}: profile 'starting' stages /patterns/beta.html, whose page declares status draft — a draft sits on no learning path: finish the page, or drop the stage`,
    ]);

    learningTree(sb, [{ ...PROFILES[0], stages: ['/patterns/alpha.html'] }], { '/patterns/alpha.html': NOTES['/patterns/alpha.html'] });
    r = await sb.run(spec);
    expectPass(r);
  });

  it('judges no page that declares no status, is not on disk, or is draft but on no path', async () => {
    learningTree(sb);
    sb.write('docs/patterns/alpha.md', learningPageText('alpha', null));
    sb.write('docs/patterns/gamma.md', learningPageText('gamma', DRAFT));
    expectPass(await sb.run(spec));
  });
});

describe('the helpers', () => {
  it('producedRoutes holds the root and every row route, skipping rows it cannot read', () => {
    expect(producedRoutes(null)).toBeNull();
    expect(
      producedRoutes({ areas: [{ pages: [{ slug: 'a', route: '/a.html' }, { route: '/b.html' }, { slug: 'c' }, 3] }, { id: 'empty' }, 'x'] }),
    ).toEqual(new Map([['/', ''], ['/a.html', 'a'], ['/b.html', '']]));
  });

  it('nearMiss matches a route up to its slashes and .html, never the root', () => {
    const routes = ['/', '/a/b.html', '/c/'];
    expect(nearMiss('/a/b', routes)).toBe('/a/b.html');
    expect(nearMiss('a/b/', routes)).toBe('/a/b.html');
    expect(nearMiss('/c', routes)).toBe('/c/');
    expect(nearMiss('', routes)).toBeUndefined();
    expect(nearMiss('/d', routes)).toBeUndefined();
  });

  it('lineOf finds the nth line holding a needle, and says when there is none', () => {
    expect(lineOf('a\nb\na\n', 'a', 2)).toBe(3);
    expect(() => lineOf('a\n', 'a', 2)).toThrow('no line 2 holds a');
  });

  it('the fixture writer leaves notes out when told to', () => {
    expect(JSON.parse(learningPathsJson([], null))).toEqual({ ...HEADER, profiles: [] });
    expect(Object.keys(AREAS)).toEqual(['patterns', 'hazards', 'capabilities', 'themes']);
  });
});

describe('the real tree', () => {
  interface Lp {
    profiles: { id: string; stages: string[] }[];
    notes: Record<string, Record<string, unknown>>;
  }
  const real = (): Lp => JSON.parse(fs.readFileSync(path.join(REPO_ROOT, LEARNING_PATHS), 'utf8')) as Lp;

  it('passes, counting what a plain walk of the file counts, with one note on stderr', async () => {
    const lp = real();
    const stages = lp.profiles.reduce((n, p) => n + p.stages.length, 0);
    const noteCount = Object.values(lp.notes).reduce((n, m) => n + Object.keys(m).length, 0);
    const r = await capture(spec, [], REPO_ROOT);
    expectPass(r);
    expect(r.out).toBe(
      `[learning-paths] ${lp.profiles.length} profiles stage ${stages} routes, every one produced; ${noteCount} notes, none orphaned`,
    );
    expect(r.err.split('\n')).toHaveLength(1);
    expect(notes(r.err)).toHaveLength(1);
  });
});
