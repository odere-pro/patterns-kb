/**
 * Hold `docs/data/learning-paths.json` to the routes the site publishes (spec:
 * kb.data.learning-paths, stage-checks; the KB carries it as a gate of its
 * own, beside the structure gate the spec puts it in).
 *
 * A learning path is a profile — `{ id, label, stages }` — whose stages
 * are routes in reading order. In this KB a profile is one theme's tour: its
 * `id` is the theme page's slug, and `notes[<route>][<profile id>]` holds what
 * the theme's tour step and the member page's "where it shows up" item say
 * about that one membership (dialect D-81, D-82). What is held, each finding at
 * the line of the value it is about:
 *
 *   stages     every stage is a route the structure file produces, spelled
 *              exactly: `/patterns/a` is not `/patterns/a.html`, and
 *              `/guides/a` is not `/guides/a/`, whichever form the structure
 *              uses (learning-paths-C1). A near miss names the route it meant.
 *              A profile stages a route once.
 *   profiles   a closed record: a unique `id` naming a published page (the page
 *              its tour renders on), a `label`, a `stages` list
 *   notes      a closed record per membership — `role`, `tour` and `fluency`
 *              text and an optional `heading` — and no orphan:
 *              a note for a route its profile does not stage renders nowhere.
 *              A stage with no note is allowed: its tour step renders its link
 *              alone.
 *
 *   drafts     a stage whose page declares `status: draft` (spec:
 *              kb.learning.maturity, maturity-C4): a draft sits on no reading
 *              order. The status is read from the page the structure row
 *              names; a page not on disk, or one that declares none, is not
 *              judged here (the frontmatter gate owns a missing status).
 *
 * A published page no learning path stages is a note on stderr, never a
 * finding (learning-paths-C5): most reference, hazard and case-study pages sit
 * on no tour. With no learning-path file there is no stage to check, and the
 * run passes (learning-paths-C6); a file that does not parse is one finding
 * naming it (learning-paths-C3).
 *
 * Usage: check-learning-paths   (takes no arguments: the file is always read whole)
 */

import { jsonLines, pointer, readDataJson } from '../lib/data-json.js';
import { main, type GateContext, type GateSpec } from '../lib/gate.js';
import { type STATUSES } from '../lib/page-block.js';
import { pageFacts, structureRows, type StructureRows } from '../lib/page-refs.js';

export const LEARNING_PATHS = 'docs/data/learning-paths.json';
export const STRUCTURE = 'docs/data/site-structure.json';

export const FILE_KEYS = ['version', 'updated', 'note', 'profiles', 'notes'];
export const PROFILE_KEYS = ['id', 'label', 'stages'];
export const NOTE_KEYS = ['role', 'tour', 'fluency', 'heading'];
/** The note keys every membership carries, `""` when it has nothing to say. */
export const NOTE_TEXT = ['role', 'tour', 'fluency'];
/** How many routes the no-learning-path note names before it counts the rest. */
export const SHOWN = 5;
/** The status a staged page may not declare (maturity-C4): one of lib/page-block.ts's list, so a rename there breaks the build here. */
export const DRAFT: (typeof STATUSES)[number] = 'draft';

type Obj = Record<string, unknown>;
const isObj = (v: unknown): v is Obj => typeof v === 'object' && v !== null && !Array.isArray(v);
const isText = (v: unknown): v is string => typeof v === 'string' && v !== '';

/** Every route the structure file produces — the root and each row's — with the row's slug. */
export function producedRoutes(structure: unknown): Map<string, string> | null {
  const areas = isObj(structure) ? structure['areas'] : undefined;
  if (!Array.isArray(areas)) return null;
  const out = new Map<string, string>([['/', '']]);
  for (const area of areas as unknown[]) {
    const rows = isObj(area) && Array.isArray(area['pages']) ? (area['pages'] as unknown[]) : [];
    for (const row of rows) {
      if (isObj(row) && isText(row['route'])) out.set(row['route'], isText(row['slug']) ? row['slug'] : '');
    }
  }
  return out;
}

/** A route with its spelling taken away: no trailing slash, no `.html`, one leading slash. */
const bare = (route: string): string => `/${route.replace(/^\/+|\/+$/g, '').replace(/\.html$/, '')}`;

/** The produced route a stage was probably meant to be, when it is spelled differently. */
export function nearMiss(stage: string, routes: Iterable<string>): string | undefined {
  for (const r of routes) if (r !== '/' && bare(r) === bare(stage)) return r;
  return undefined;
}

export const spec: GateSpec = {
  name: 'learning-paths',
  usage: 'usage: check-learning-paths   (takes no arguments: the file is always read whole)',
  run(ctx: GateContext): string {
    const lp = readDataJson(ctx, LEARNING_PATHS);
    if (lp === 'missing') return `[learning-paths] no ${LEARNING_PATHS}: no stage to check`;
    const structure = readDataJson(ctx, STRUCTURE);
    if (structure === 'missing') ctx.fail(STRUCTURE, 'is missing — every stage is checked against the routes it produces');
    if (typeof lp === 'string' || typeof structure === 'string') return '';

    const routes = producedRoutes(structure.value);
    if (routes === null) ctx.fail(STRUCTURE, 'has no areas list, so it produces no route');
    if (!isObj(lp.value)) ctx.fail(LEARNING_PATHS, 'is not a JSON object');
    if (routes === null || !isObj(lp.value)) return '';

    const file = lp.value;
    const lines = jsonLines(lp.text);
    const at = (...seg: (string | number)[]): number | undefined => lines.get(pointer(...seg));
    const fail = (what: string, line: number | undefined): void => ctx.fail(LEARNING_PATHS, what, line);
    for (const k of Object.keys(file)) {
      if (!FILE_KEYS.includes(k)) fail(`unknown key "${k}" — the file holds ${FILE_KEYS.join(', ')}`, at(k));
    }
    const profiles = file['profiles'];
    if (!Array.isArray(profiles)) {
      fail('has no profiles list', at('profiles'));
      return '';
    }

    const slugs = new Set(routes.values());
    /**
     * Each profile id's staged routes, for the notes — null for a profile whose
     * stages cannot be read, whose notes are then not judged — and the line
     * each id first appears on.
     */
    const staged = new Map<string, Set<string> | null>();
    const firstLine = new Map<string, number | undefined>();
    /** Every produced stage, where it is written: the draft check reads them after the loop. */
    const placed: { who: string; stage: string; line: number | undefined }[] = [];
    let stages = 0;

    (profiles as unknown[]).forEach((p, n) => {
      const line = at('profiles', n);
      if (!isObj(p)) {
        fail(`profiles[${n}] is not an object`, line);
        return;
      }
      const id = isText(p['id']) ? p['id'] : `profiles[${n}]`;
      const who = `profile '${id}'`;
      for (const k of Object.keys(p)) {
        if (!PROFILE_KEYS.includes(k)) fail(`${who}: unknown key "${k}" — a profile holds ${PROFILE_KEYS.join(', ')}`, at('profiles', n, k));
      }
      if (!isText(p['id'])) fail(`${who} has no id`, line);
      else if (firstLine.has(id)) fail(`${who} is listed twice — first at line ${String(firstLine.get(id))}`, line);
      else if (!slugs.has(id)) fail(`${who} names no published page — its tour renders on the page with that slug`, at('profiles', n, 'id'));
      if (!firstLine.has(id)) firstLine.set(id, line);
      if (!isText(p['label'])) fail(`${who} has no label`, line);
      const list = p['stages'];
      if (!Array.isArray(list)) {
        fail(`${who} has no stages list`, at('profiles', n, 'stages') ?? line);
        staged.set(id, null);
        return;
      }
      const mine = staged.get(id) ?? new Set<string>();
      staged.set(id, mine);
      (list as unknown[]).forEach((stage, k) => {
        const sLine = at('profiles', n, 'stages', k);
        stages += 1;
        if (typeof stage !== 'string') {
          fail(`${who} stage ${k + 1} is not a route`, sLine);
          return;
        }
        if (mine.has(stage)) fail(`${who} stages ${stage} twice`, sLine);
        mine.add(stage);
        if (routes.has(stage)) {
          placed.push({ who, stage, line: sLine });
          return;
        }
        const meant = nearMiss(stage, routes.keys());
        fail(
          `${who} stage ${stage} is not a route ${STRUCTURE} produces${meant === undefined ? '' : ` — it is spelled ${meant} there`}`,
          sLine,
        );
      });
    });

    // A draft page is in no reading order (maturity-C4): one finding per stage, naming its profile.
    // The structure file produced routes above, so it has an areas list and rows to read.
    const onPath = new Set(placed.map((p) => p.stage));
    const rows = (structureRows(structure.value) as StructureRows).rows.filter((r) => onPath.has(r.route));
    const facts = pageFacts(ctx.root, rows);
    const statusAt = new Map(rows.map((r) => [r.route, facts.get(r.source)?.['status']]));
    for (const p of placed) {
      if (statusAt.get(p.stage) !== DRAFT) continue;
      fail(`${p.who} stages ${p.stage}, whose page declares status ${DRAFT} — a draft sits on no learning path: finish the page, or drop the stage`, p.line);
    }

    // Notes: one closed record per membership, and none for a route its profile does not stage.
    const notes = file['notes'] ?? {};
    if (!isObj(notes)) fail('notes is not an object keyed by route', at('notes'));
    let noteCount = 0;
    for (const [route, byProfile] of Object.entries(isObj(notes) ? notes : {})) {
      if (!isObj(byProfile)) {
        fail(`notes[${route}] is not an object keyed by profile id`, at('notes', route));
        continue;
      }
      for (const [id, n] of Object.entries(byProfile)) {
        const line = at('notes', route, id);
        const where = `notes[${route}].${id}`;
        noteCount += 1;
        const mine = staged.get(id);
        if (mine === undefined) fail(`${where} is an orphan — no profile has the id '${id}'`, line);
        else if (mine !== null && !mine.has(route)) fail(`${where} is an orphan — profile '${id}' does not stage ${route}`, line);
        if (!isObj(n)) {
          fail(`${where} is not an object`, line);
          continue;
        }
        for (const k of Object.keys(n)) {
          if (!NOTE_KEYS.includes(k)) fail(`${where}: unknown key "${k}" — a note holds ${NOTE_KEYS.join(', ')}`, at('notes', route, id, k));
        }
        for (const k of NOTE_TEXT) if (typeof n[k] !== 'string') fail(`${where} has no ${k} — write it, "" for none`, line);
        if ('heading' in n && !isText(n['heading'])) fail(`${where} heading is empty — drop the key, or write the heading`, at('notes', route, id, 'heading'));
      }
    }

    // A published page on no path is worth knowing, never a finding (learning-paths-C5).
    const everywhere = new Set([...staged.values()].flatMap((s) => [...(s ?? [])]));
    const unstaged = [...routes.keys()].filter((r) => r !== '/' && !everywhere.has(r));
    if (unstaged.length > 0) {
      const shown = unstaged.slice(0, SHOWN).join(', ');
      const rest = unstaged.length > SHOWN ? ` and ${unstaged.length - SHOWN} more` : '';
      ctx.note(`note: ${unstaged.length} published route(s) on no learning path: ${shown}${rest}`);
    }

    return (
      `[learning-paths] ${profiles.length} profiles stage ${stages} routes, every one produced; ` +
      `${noteCount} notes, none orphaned`
    );
  },
};

main(spec, import.meta.url);
