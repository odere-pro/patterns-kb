/**
 * The tracks gate over docs/data/tracks.json: a clean planted tree passes, then
 * one planted fault per rule asserting its finding and line, then the real tree.
 */

import fs from 'node:fs';
import path from 'node:path';

import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import { HEADER, json, lineOf, row, structureFileJson, learningPathsJson } from '../lib/fixtures.js';
import { capture, expectFail, expectMisuse, expectPass, makeSandbox, REPO_ROOT, type Sandbox } from '../lib/sandbox.js';
import { LEARNING_PATHS } from './check-learning-paths.js';
import { spec, STRUCTURE } from './check-tracks.js';
import { TRACKS_FILE } from '../lib/tracks.js';

let sb: Sandbox;
beforeEach(() => {
  sb = makeSandbox();
});
afterEach(() => sb.cleanup());

const SLUGS = ['t1', 't2', 't3', 't4', 't5', 't6'];
const track = (id: string, themes: string[]): Record<string, unknown> => ({ id, label: id, blurb: `${id} blurb`, themes });
const CLEAN = (): Record<string, unknown> => ({
  ...HEADER,
  tracks: [track('a', ['t1', 't2', 't3']), track('b', ['t2', 't3', 't4']), track('c', ['t3', 't4', 't5']), track('d', ['t4', 't5', 't6'])],
  tiers: { t1: 'intro', t2: 'core', t3: 'core', t4: 'advanced', t5: 'intro', t6: 'core', extra: 'intro' },
});

/** The tree the gate passes; `file` replaces tracks.json, `statuses` the theme pages' status. */
function tree(file: unknown = CLEAN(), statuses: Record<string, string> = {}, profiles: string[] = SLUGS): void {
  const rows = [...SLUGS.map((s) => row('themes', s)), row('patterns', 'extra')];
  sb.write(STRUCTURE, structureFileJson({ themes: rows }));
  sb.write(LEARNING_PATHS, learningPathsJson(profiles.map((id) => ({ id, label: id, stages: [] })), null));
  for (const r of rows) sb.write(r.source, `---\ntitle: ${r.slug}\nstatus: ${statuses[r.slug] ?? 'stable'}\n---\n\n# ${r.slug}\n`);
  sb.write(TRACKS_FILE, json(file));
}

const FAIL = `[tracks] FAIL ${TRACKS_FILE}`;
const findings = (err: string): string[] => err.split('\n').filter((l) => l.startsWith('[tracks] FAIL'));

describe('tracks', () => {
  it('passes a clean tree and counts tracks, themes and tiers', async () => {
    tree();
    const r = await sb.run(spec);
    expectPass(r);
    expect(r.out).toBe('[tracks] 4 tracks stage 6 themes, every one published; 7 tiers');
  });

  it('passes with no tracks file', async () => {
    const r = await sb.run(spec);
    expectPass(r);
    expect(r.out).toContain('no track to check');
  });

  it('fails a file that does not parse, once', async () => {
    sb.write(TRACKS_FILE, '{ nope');
    const r = await sb.run(spec);
    expectFail(r);
    expect(findings(r.err)).toHaveLength(1);
  });

  it('fails an unknown file key and a track key at their lines', async () => {
    const f = CLEAN();
    f['extra'] = 1;
    (f['tracks'] as Record<string, unknown>[])[0]!['level'] = 'x';
    tree(f);
    const r = await sb.run(spec);
    expectFail(r);
    const text = sb.read(TRACKS_FILE);
    expect(findings(r.err)).toContain(`${FAIL}:${lineOf(text, '"level"')}: track 'a': unknown key "level" — a track holds id, label, blurb, themes`);
    expect(findings(r.err)).toContain(`${FAIL}:${lineOf(text, '"extra": 1')}: unknown key "extra" — the file holds version, updated, note, tracks, tiers`);
  });

  it('fails too few tracks and a track with too few themes', async () => {
    const f = CLEAN();
    f['tracks'] = [track('a', ['t1', 't2'])];
    tree(f);
    const r = await sb.run(spec);
    expectFail(r);
    expect(r.err).toContain('has 1 tracks — the home page shows 4 to 6');
    expect(r.err).toContain("track 'a' walks 2 themes — a track walks 3 to 6");
  });

  it('fails a duplicate track id and a theme listed twice in one track', async () => {
    const f = CLEAN();
    (f['tracks'] as Record<string, unknown>[])[1]!['id'] = 'a';
    (f['tracks'] as Record<string, unknown>[])[2]!['themes'] = ['t3', 't4', 't3'];
    tree(f);
    const r = await sb.run(spec);
    expectFail(r);
    expect(r.err).toContain("track 'a' is listed twice");
    expect(r.err).toContain("track 'c' lists theme 't3' twice");
  });

  it('fails a theme that is no profile id, no theme page, or a draft', async () => {
    const f = CLEAN();
    (f['tracks'] as Record<string, unknown>[])[0]!['themes'] = ['t1', 'extra', 'ghost'];
    (f['tiers'] as Record<string, unknown>)['ghost'] = 'core';
    tree(f, { t2: 'draft' }, ['t1', 't2', 't3', 't4', 't5', 't6', 'extra']);
    const r = await sb.run(spec);
    expectFail(r);
    expect(r.err).toContain("theme 'extra' is no published theme page");
    expect(r.err).toContain("theme 'ghost' is no profile id of docs/data/learning-paths.json");
    expect(r.err).toContain("theme 'ghost' is no published theme page");
  });

  it('fails a staged draft theme', async () => {
    tree(CLEAN(), { t2: 'draft' });
    const r = await sb.run(spec);
    expectFail(r);
    expect(findings(r.err)).toHaveLength(2);
    expect(findings(r.err)[0]).toContain("track 'a' theme 't2' declares status draft");
  });

  it('fails a theme with no profile', async () => {
    tree(CLEAN(), {}, ['t1', 't2', 't3', 't4', 't5']);
    const r = await sb.run(spec);
    expectFail(r);
    expect(r.err).toContain("theme 't6' is no profile id");
  });

  it('fails an illegal tier, a tier for an unpublished page and a staged theme with no tier', async () => {
    const f = CLEAN();
    const tiers = f['tiers'] as Record<string, unknown>;
    tiers['t1'] = 'beginner';
    tiers['nowhere'] = 'core';
    delete tiers['t6'];
    tree(f);
    const r = await sb.run(spec);
    expectFail(r);
    const text = sb.read(TRACKS_FILE);
    expect(findings(r.err)).toContain(`${FAIL}:${lineOf(text, '"beginner"')}: tier of 't1' is "beginner" — a tier is one of intro, core, advanced`);
    expect(r.err).toContain("tier names 'nowhere', which is no published page");
    expect(r.err).toContain("theme 't6' is staged by a track and has no tier");
  });

  it('accepts a page no track stages without a tier', async () => {
    const f = CLEAN();
    delete (f['tiers'] as Record<string, unknown>)['extra'];
    tree(f);
    expectPass(await sb.run(spec));
  });

  it('fails a file that is not an object', async () => {
    sb.write(TRACKS_FILE, '[1]');
    const r = await sb.run(spec);
    expectFail(r);
    expect(r.err).toContain('is not a JSON object');
  });

  it('fails when the structure file is missing, unparsed or lists no areas', async () => {
    sb.write(TRACKS_FILE, json(CLEAN()));
    const missing = await sb.run(spec);
    expectFail(missing);
    expect(missing.err).toContain(`${STRUCTURE}: is missing`);
    sb.write(STRUCTURE, '{ nope');
    const bad = await sb.run(spec);
    expectFail(bad);
    expect(bad.err).toContain('is not valid JSON');
    sb.write(STRUCTURE, '{}');
    const none = await sb.run(spec);
    expectFail(none);
    expect(none.err).toContain('has no areas list');
  });

  it('reads the profile ids from whatever the learning-paths file holds', async () => {
    for (const text of [null, '{ nope', '[]', '{"profiles": 1}', '{"profiles": [1, {"id": ""}]}']) {
      tree();
      if (text !== null) sb.write(LEARNING_PATHS, text);
      if (text === null) fs.rmSync(path.join(sb.dir, LEARNING_PATHS));
      expectFail(await sb.run(spec));
    }
  });

  it('fails a file with no tracks list and no tiers record', async () => {
    tree({ ...HEADER });
    const r = await sb.run(spec);
    expectFail(r);
    expect(r.err).toContain('has no tracks list');
    expect(r.err).toContain('has no tiers record');
  });

  it('fails a track that is not an object, or lacks its id, label, blurb and themes', async () => {
    const f = CLEAN();
    const tracks = f['tracks'] as unknown[];
    tracks[0] = 'a';
    tracks[1] = { themes: ['t1', 't2', 't3'] };
    tracks[2] = { id: 'c', label: 'c', blurb: 'c' };
    tracks[3] = { id: 'd', label: 'd', blurb: 'd', themes: ['t4', 5, 't6'] };
    tree(f);
    const r = await sb.run(spec);
    expectFail(r);
    expect(r.err).toContain('tracks[0] is not an object');
    expect(r.err).toContain('track \'tracks[1]\' has no id');
    expect(r.err).toContain("track 'tracks[1]' has no label");
    expect(r.err).toContain("track 'tracks[1]' has no blurb");
    expect(r.err).toContain("track 'c' has no themes list");
    expect(r.err).toContain("track 'd' theme 2 is not a slug");
  });

  it('is misused by an argument', async () => {
    tree();
    expectMisuse(await sb.run(spec, ['x']));
  });

  it('passes on the real tree', async () => {
    const r = await capture(spec, [], REPO_ROOT);
    expectPass(r);
    expect(r.out).toMatch(/^\[tracks\] [4-6] tracks stage \d+ themes/);
  });
});
