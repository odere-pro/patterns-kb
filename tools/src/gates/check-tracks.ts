/**
 * Hold `docs/data/tracks.json` to the pages the site publishes: the Start-here
 * tracks on the home page and the tier of each page a track stages.
 *
 *   file       a closed record: version, updated, note, tracks, tiers
 *   tracks     4 to 6, each a closed record `{ id, label, blurb, themes }` with
 *              a unique id and 3 to 6 themes
 *   themes     every theme is a profile id of docs/data/learning-paths.json
 *              (its tour renders on the theme page), names a published page
 *              under /themes/ whose status is not draft, and is listed once
 *              per track
 *   tiers      a closed record of page slug to `intro`, `core` or `advanced`;
 *              every key is a published slug, and every theme a track lists
 *              has one (a page no track stages needs none)
 *
 * A missing file is no finding: there is no track to check. A file that does
 * not parse is one finding naming it.
 *
 * Usage: check-tracks   (takes no arguments: the file is always read whole)
 */

import { jsonLines, pointer, readDataJson } from '../lib/data-json.js';
import { main, type GateContext, type GateSpec } from '../lib/gate.js';
import { type STATUSES } from '../lib/page-block.js';
import { pageFacts, structureRows } from '../lib/page-refs.js';
import { FILE_KEYS, isTier, THEME_COUNT, TIERS, TRACK_COUNT, TRACK_KEYS, TRACKS_FILE } from '../lib/tracks.js';
import { LEARNING_PATHS } from './check-learning-paths.js';

export const STRUCTURE = 'docs/data/site-structure.json';
/** The route folder a theme page sits in. */
export const THEME_FOLDER = '/themes/';
/** The status a staged theme may not declare, one of lib/page-block.ts's list. */
export const DRAFT: (typeof STATUSES)[number] = 'draft';

type Obj = Record<string, unknown>;
const isObj = (v: unknown): v is Obj => typeof v === 'object' && v !== null && !Array.isArray(v);
const isText = (v: unknown): v is string => typeof v === 'string' && v !== '';

export const spec: GateSpec = {
  name: 'tracks',
  usage: 'usage: check-tracks   (takes no arguments: the file is always read whole)',
  run(ctx: GateContext): string {
    const read = readDataJson(ctx, TRACKS_FILE);
    if (read === 'missing') return `[tracks] no ${TRACKS_FILE}: no track to check`;
    if (read === 'invalid') return '';
    if (!isObj(read.value)) {
      ctx.fail(TRACKS_FILE, 'is not a JSON object');
      return '';
    }
    const file = read.value;
    const lines = jsonLines(read.text);
    const at = (...seg: (string | number)[]): number | undefined => lines.get(pointer(...seg));
    const fail = (what: string, line: number | undefined): void => ctx.fail(TRACKS_FILE, what, line);

    for (const k of Object.keys(file)) {
      if (!(FILE_KEYS as readonly string[]).includes(k)) fail(`unknown key "${k}" — the file holds ${FILE_KEYS.join(', ')}`, at(k));
    }

    // Published theme pages and their status, from the structure file.
    const structure = readDataJson(ctx, STRUCTURE);
    if (structure === 'missing') ctx.fail(STRUCTURE, 'is missing — every theme is checked against the pages it publishes');
    const rows = typeof structure === 'string' ? null : structureRows(structure.value);
    if (rows === null) {
      if (typeof structure !== 'string') ctx.fail(STRUCTURE, 'has no areas list, so it publishes no page');
      return '';
    }
    const bySlug = new Map(rows.rows.map((r) => [r.slug, r]));
    const facts = pageFacts(ctx.root, rows.rows.filter((r) => r.route.startsWith(THEME_FOLDER)));

    // The profile ids a theme must be one of.
    const lp = readDataJson(ctx, LEARNING_PATHS);
    const profileIds = new Set<string>();
    if (lp !== 'missing' && lp !== 'invalid' && isObj(lp.value) && Array.isArray(lp.value['profiles'])) {
      for (const p of lp.value['profiles'] as unknown[]) if (isObj(p) && isText(p['id'])) profileIds.add(p['id']);
    }

    const tracks = file['tracks'];
    const staged = new Set<string>();
    if (!Array.isArray(tracks)) fail('has no tracks list', at('tracks'));
    else {
      if (tracks.length < TRACK_COUNT.min || tracks.length > TRACK_COUNT.max) {
        fail(`has ${tracks.length} tracks — the home page shows ${TRACK_COUNT.min} to ${TRACK_COUNT.max}`, at('tracks'));
      }
      const seen = new Map<string, number | undefined>();
      (tracks as unknown[]).forEach((t, n) => {
        const line = at('tracks', n);
        if (!isObj(t)) {
          fail(`tracks[${n}] is not an object`, line);
          return;
        }
        const id = isText(t['id']) ? t['id'] : `tracks[${n}]`;
        const who = `track '${id}'`;
        for (const k of Object.keys(t)) {
          if (!(TRACK_KEYS as readonly string[]).includes(k)) fail(`${who}: unknown key "${k}" — a track holds ${TRACK_KEYS.join(', ')}`, at('tracks', n, k));
        }
        if (!isText(t['id'])) fail(`${who} has no id`, line);
        else if (seen.has(id)) fail(`${who} is listed twice — first at line ${String(seen.get(id))}`, line);
        else seen.set(id, line);
        if (!isText(t['label'])) fail(`${who} has no label`, line);
        if (!isText(t['blurb'])) fail(`${who} has no blurb`, line);
        const themes = t['themes'];
        if (!Array.isArray(themes)) {
          fail(`${who} has no themes list`, at('tracks', n, 'themes') ?? line);
          return;
        }
        if (themes.length < THEME_COUNT.min || themes.length > THEME_COUNT.max) {
          fail(`${who} walks ${themes.length} themes — a track walks ${THEME_COUNT.min} to ${THEME_COUNT.max}`, at('tracks', n, 'themes'));
        }
        const mine = new Set<string>();
        (themes as unknown[]).forEach((s, k) => {
          const sLine = at('tracks', n, 'themes', k);
          if (!isText(s)) {
            fail(`${who} theme ${k + 1} is not a slug`, sLine);
            return;
          }
          if (mine.has(s)) fail(`${who} lists theme '${s}' twice`, sLine);
          mine.add(s);
          staged.add(s);
          const row = bySlug.get(s);
          if (!profileIds.has(s)) fail(`${who} theme '${s}' is no profile id of ${LEARNING_PATHS} — a track walks themes that have a tour`, sLine);
          if (row === undefined || !row.route.startsWith(THEME_FOLDER)) {
            fail(`${who} theme '${s}' is no published theme page — ${STRUCTURE} has no ${THEME_FOLDER}${s}.html row`, sLine);
          } else if (facts.get(row.source)?.['status'] === DRAFT) {
            fail(`${who} theme '${s}' declares status ${DRAFT} — a draft sits on no track: finish the page, or drop the theme`, sLine);
          }
        });
      });
    }

    const tiers = file['tiers'];
    let tiered = 0;
    if (!isObj(tiers)) fail('has no tiers record — a map of page slug to a tier', at('tiers'));
    else {
      for (const [slug, tier] of Object.entries(tiers)) {
        tiered += 1;
        if (!isTier(tier)) fail(`tier of '${slug}' is ${JSON.stringify(tier)} — a tier is one of ${TIERS.join(', ')}`, at('tiers', slug));
        if (!bySlug.has(slug)) fail(`tier names '${slug}', which is no published page`, at('tiers', slug));
      }
      for (const s of staged) {
        if (!(s in tiers)) fail(`theme '${s}' is staged by a track and has no tier — add it to tiers`, at('tiers'));
      }
    }

    return `[tracks] ${Array.isArray(tracks) ? tracks.length : 0} tracks stage ${staged.size} themes, every one published; ${tiered} tiers`;
  },
};

main(spec, import.meta.url);
