/**
 * The prerequisite graph, built from the relations file (spec:
 * kb.learning.prerequisites, graph-file and reference-page).
 *
 * The spec keeps the graph in one hand-written file of records. This KB
 * already states every edge once, in `docs/data/relations.json`, so the
 * prerequisite file is a SECOND FORM of it that a tool demands (root-C3,
 * source-file-C7): this generator writes it, and its `--check` holds the two
 * equal byte for byte, so nobody ever edits the second form. What is built,
 * under one repair command (`make prerequisites`):
 *
 *   docs/data/prerequisites.json    one record per published page that takes
 *                                   part in a `prerequisite` edge or a
 *                                   symmetric one, in reading order:
 *                                     id          the page's slug
 *                                     label       its frontmatter title
 *                                     definition  its frontmatter description
 *                                     route       its structure row's route
 *                                     requires    the pages its `prerequisite`
 *                                                 edges name (the verb reads
 *                                                 "Requires" from the page that
 *                                                 wrote it)
 *                                     related     the pages its symmetric
 *                                                 edges join it to, whichever
 *                                                 page wrote the record
 *                                   both lists in relations.json's record
 *                                   order, the order the relationships block
 *                                   shows them in, each page once: a pair
 *                                   joined by two symmetric verbs (both
 *                                   often-confused-with and combines-with,
 *                                   say) is one neighbour, listed where its
 *                                   first edge puts it
 *   docs/reference/prerequisites.md the whole list as a reference page, one
 *                                   table per top area
 *
 * A symmetric verb is one whose inverse is itself in `content-model.json`
 * (today combines-with, alternative-to, often-confused-with). The file's
 * `updated` is dated the way the converter dates its data files (dialect
 * D-05, X-20): it keeps its date while nothing else in it changes, and any
 * other change — an edge, or a page's title or description — takes the
 * committer date of HEAD at the run, never the clock.
 *
 * Nothing is written from a tree with findings: an edge naming a page that is
 * not published, or a record page that is missing or lacks its title or
 * description, is a finding and the outputs stay as they were. The graph's
 * own rules — acyclic, resolved, reciprocal, reached — are the prerequisites
 * gate's (tools/src/gates/check-prerequisites.ts), which reads what this
 * writes.
 *
 * Usage: gen-prerequisites            (rewrites both outputs)
 *        gen-prerequisites --check    (exit 1 if either is stale)
 */

import path from 'node:path';

import { dataDate, needDataObject, printData } from '../lib/data-json.js';
import { emit, fileStamp, STAMP_PREFIX, type Emitted } from '../lib/generated.js';
import { main, type GateContext, type GateSpec } from '../lib/gate.js';
import { escapeMdText, relativeMd } from '../lib/md-text.js';
import { pageFacts, STRUCTURE, structureRows, type PageRow } from '../lib/page-refs.js';
import { verbTable } from '../gates/check-relations.js';
import { englishList, wrap } from './gen-gates.js';

export const RELATIONS = 'docs/data/relations.json';
export const CONTENT_MODEL = 'docs/data/content-model.json';
export const OUT = 'docs/data/prerequisites.json';
export const REFERENCE = 'docs/reference/prerequisites.md';
export const GENERATOR = 'tools/src/gen/gen-prerequisites.ts';
/** The repair command every STALE line names, and the registry row's `fix`. */
export const FIX = 'make prerequisites';
export const NAME = 'prerequisites-fresh';
/** The verb whose edges are a record's `requires`. */
export const REQUIRES_VERB = 'prerequisite';
export const VERSION = 1;
/**
 * The reference page's frontmatter, kept with the other reference pages'
 * provisional shape (one tag, no skill facet) until the retag reaches them.
 */
export const PAGE_TITLE = 'Prerequisites';
export const PAGE_DESCRIPTION =
  'Every page that names what to read first or what to read beside it — its prerequisites and neighbours, built from the relations file.';
/** What an empty table cell shows. */
export const NONE = '—';
/**
 * The text a JSON output carries in its note, where a comment would go: the
 * two words every stamp opens with, so one fixed-text search lists it among
 * the generated files (output-ownership-C2).
 */
export const JSON_STAMP = `${STAMP_PREFIX} ${GENERATOR} from ${RELATIONS}`;

export interface PrereqRecord {
  readonly id: string;
  readonly label: string;
  readonly definition: string;
  readonly route: string;
  readonly requires: readonly string[];
  readonly related: readonly string[];
}

export interface PrereqFile {
  readonly version: number;
  readonly updated: string;
  readonly note: string;
  readonly records: readonly PrereqRecord[];
}

/** One edge as the relations file writes it; the gate there owns everything else about it. */
interface Edge {
  readonly a: string;
  readonly verb: string;
  readonly b: string;
}

type Obj = Record<string, unknown>;
const isObj = (v: unknown): v is Obj => typeof v === 'object' && v !== null && !Array.isArray(v);
const isText = (v: unknown): v is string => typeof v === 'string' && v !== '';

/**
 * The records, in `rows` order: every page that is an end of a requires edge
 * or a symmetric one. `facts` gives each page's title and description. A page
 * appears once in a list, where the first edge naming it puts it.
 */
export function buildRecords(
  edges: readonly Edge[],
  symmetric: ReadonlySet<string>,
  rows: readonly PageRow[],
  facts: ReadonlyMap<string, Readonly<Record<string, string>>>,
): PrereqRecord[] {
  const requires = new Map<string, string[]>();
  const related = new Map<string, string[]>();
  const push = (m: Map<string, string[]>, k: string, v: string): void => {
    const had = m.get(k) ?? [];
    m.set(k, had.includes(v) ? had : [...had, v]);
  };
  for (const e of edges) {
    if (e.verb === REQUIRES_VERB) {
      push(requires, e.a, e.b);
      requires.set(e.b, requires.get(e.b) ?? []);
    } else if (symmetric.has(e.verb)) {
      push(related, e.a, e.b);
      push(related, e.b, e.a);
    }
  }
  const out: PrereqRecord[] = [];
  for (const r of rows) {
    if (!requires.has(r.slug) && !related.has(r.slug)) continue;
    const fm = facts.get(r.source) ?? {};
    out.push({
      id: r.slug,
      label: fm['title'] ?? '',
      definition: fm['description'] ?? '',
      route: r.route,
      requires: requires.get(r.slug) ?? [],
      related: related.get(r.slug) ?? [],
    });
  }
  return out;
}

/** How many pairs of records list one another as related: each unordered pair once. */
export function relatedPairs(records: readonly PrereqRecord[]): number {
  return new Set(records.flatMap((r) => r.related.map((b) => [r.id, b].sort().join(' ')))).size;
}

/** The note the file opens with: what it holds, who writes it, what to edit instead. */
export function noteOf(symmetric: readonly string[]): string {
  const verbs = englishList(symmetric);
  return (
    'What to read first and what to read beside it: one record per published page that takes part in a ' +
    `${REQUIRES_VERB} edge or a symmetric one (${verbs}), in reading order (spec: kb.learning.prerequisites). ` +
    'A record is {id, label, definition, route, requires, related}: the page\'s slug, frontmatter title and description, ' +
    `the route ${STRUCTURE} gives it, the pages its ${REQUIRES_VERB} edges name, and the pages its symmetric edges join it to, ` +
    `both lists in the record order of ${RELATIONS}. ${JSON_STAMP}, the pages' titles and descriptions and ${STRUCTURE}: ` +
    `a second form of the relations file, held equal to it byte for byte by the ${NAME} gate, so never edit it. ` +
    `Change the edge in ${RELATIONS} instead (node scripts/kb.mjs link and unlink write whole edges), ` +
    `then run ${FIX}. \`updated\` is the committer date of HEAD at the run that last changed anything else in the file. ` +
    `The prerequisites gate holds the graph acyclic, resolved, reciprocal and reached; ${REFERENCE} is rendered from it.`
  );
}

/**
 * A cell of links to records, or the empty mark. `escapeMdText` already
 * escapes a `|`, so a label cannot end its cell early.
 */
function links(ids: readonly string[], byId: ReadonlyMap<string, PrereqRecord & { source: string }>): string {
  if (ids.length === 0) return NONE;
  return ids
    .map((id) => {
      const r = byId.get(id) as PrereqRecord & { source: string };
      return `[${escapeMdText(r.label)}](${relativeMd(REFERENCE, r.source)})`;
    })
    .join(', ');
}

/** The reference page: every record, one table per top area, in reading order. */
export function renderReference(
  file: PrereqFile,
  rows: readonly PageRow[],
  labels: ReadonlyMap<string, string>,
  symmetric: readonly string[],
): string {
  const here = path.posix.dirname(REFERENCE);
  const rowOf = new Map(rows.map((r) => [r.slug, r]));
  const byId = new Map(file.records.map((r) => [r.id, { ...r, source: (rowOf.get(r.id) as PageRow).source }]));
  const edges = file.records.reduce((n, r) => n + r.requires.length, 0);
  const reading = file.records.filter((r) => r.requires.length > 0).length;
  const pairs = relatedPairs(file.records);

  const out: string[] = [
    '---',
    `title: ${PAGE_TITLE}`,
    `description: ${PAGE_DESCRIPTION}`,
    'area: reference',
    'owner: Oleksandr Derechei',
    'tags: [testing, validation]',
    'status: stable',
    `source: ${RELATIONS}`,
    '---',
    '',
    fileStamp(GENERATOR, RELATIONS),
    '',
    `# ${PAGE_TITLE}`,
    '',
    ...wrap(
      `A **prerequisite record** is one page with the pages to read before it and the pages to read beside it. ` +
        `There are ${String(file.records.length)} records: ${String(reading)} of them name something to read first, ` +
        `through ${String(edges)} requires ${edges === 1 ? 'edge' : 'edges'}, and ${String(pairs)} ` +
        `${pairs === 1 ? 'pair of pages is' : 'pairs of pages are'} related both ways.`,
    ),
    '',
    ...wrap(
      `Everything here is built from [\`${path.posix.basename(RELATIONS)}\`](${path.posix.relative(here, RELATIONS)}), ` +
        `through its second form [\`${path.posix.basename(OUT)}\`](${path.posix.relative(here, OUT)}). ` +
        `**Read first** lists a page's \`${REQUIRES_VERB}\` edges; **Related** lists its ` +
        `${englishList(symmetric.map((v) => `\`${v}\``))} edges, whichever page wrote them. ` +
        'Change an edge with `node scripts/kb.mjs link` or `unlink`, then run `make gen`; ' +
        'the prerequisites gate holds the graph free of cycles, every name resolved, every related pair listed both ways ' +
        'and every record reached.',
    ),
  ];
  for (const top of [...new Set(rows.map((r) => r.top))]) {
    const mine = rows.filter((r) => r.top === top && byId.has(r.slug)).map((r) => byId.get(r.slug) as PrereqRecord & { source: string });
    if (mine.length === 0) continue;
    out.push('', `## ${labels.get(top) as string}`, '', '| Page | What it is | Read first | Related |', '| --- | --- | --- | --- |');
    for (const r of mine) {
      out.push(
        `| [${escapeMdText(r.label)}](${relativeMd(REFERENCE, r.source)}) | ${escapeMdText(r.definition)} | ` +
          `${links(r.requires, byId)} | ${links(r.related, byId)} |`,
      );
    }
  }
  out.push('');
  return out.join('\n');
}

export const spec: GateSpec = {
  name: NAME,
  usage: 'usage: gen-prerequisites [--check]   (--check exits 1 if either output is stale)',
  flags: ['--check'],
  run(ctx: GateContext): string {
    const why = `${OUT} is built from it`;
    const rel = needDataObject(ctx, RELATIONS, why);
    const model = needDataObject(ctx, CONTENT_MODEL, why);
    const structure = needDataObject(ctx, STRUCTURE, why);
    if (rel === null || model === null || structure === null) return '';

    const verbs = verbTable(model);
    if (typeof verbs === 'string') ctx.fail(CONTENT_MODEL, verbs);
    else if (!verbs.byId.has(REQUIRES_VERB)) ctx.fail(CONTENT_MODEL, `has no "${REQUIRES_VERB}" verb, the one a record's requires list is built from`);
    const sr = structureRows(structure);
    if (sr === null) ctx.fail(STRUCTURE, 'has no areas list, so no page is published');
    if (!Array.isArray(rel['relations'])) ctx.fail(RELATIONS, 'has no relations list');
    if (ctx.findings > 0 || typeof verbs === 'string' || sr === null) return '';

    const symmetric = [...verbs.byId.values()].filter((v) => v.id === v.inverse).map((v) => v.id);
    const edges = (rel['relations'] as unknown[]).filter(
      (e): e is Edge => isObj(e) && isText(e['a']) && isText(e['b']) && isText(e['verb']),
    );
    const published = new Map(sr.rows.map((r) => [r.slug, r]));
    const unknown = new Set<string>();
    for (const e of edges) {
      if (e.verb !== REQUIRES_VERB && !symmetric.includes(e.verb)) continue;
      for (const s of [e.a, e.b]) if (!published.has(s)) unknown.add(s);
    }
    for (const s of unknown) ctx.fail(RELATIONS, `names ${s}, which is no published page — run: make gate G=check-relations`);

    const records = buildRecords(edges, new Set(symmetric), sr.rows, pageFacts(ctx.root, sr.rows));
    for (const r of records) {
      const source = (published.get(r.id) as PageRow).source;
      for (const [key, value] of [['title', r.label], ['description', r.definition]] as const) {
        if (value === '') ctx.fail(source, `declares no ${key} — its prerequisite record reads it from the page (or the page is missing)`);
      }
    }
    if (ctx.findings > 0) return '';

    const note = noteOf(symmetric);
    const updated = dataDate(ctx.root, OUT, (date) => printData({ version: VERSION, updated: date, note, records }));
    if (updated === null) {
      ctx.failLine(`cannot read the committer date of HEAD, which ${OUT} carries as \`updated\` when its content changes — commit first`);
      return '';
    }
    const file: PrereqFile = { version: VERSION, updated, note, records };
    const results: [string, Emitted][] = [
      [OUT, emit(ctx, { out: OUT, wanted: printData(file), fixCommand: FIX, stamp: JSON_STAMP })],
      [
        REFERENCE,
        emit(ctx, {
          out: REFERENCE,
          wanted: renderReference(file, sr.rows, sr.labels, symmetric),
          fixCommand: FIX,
          stamp: fileStamp(GENERATOR, RELATIONS),
        }),
      ],
    ];
    const counts = `${String(records.length)} records, ${String(records.reduce((n, r) => n + r.requires.length, 0))} requires edges`;
    if (ctx.flags.has('--check')) return `[${NAME}] ${OUT} and ${REFERENCE} are in sync with ${RELATIONS} (${counts})`;
    const wrote = results.filter(([, what]) => what === 'wrote').length;
    return `[${NAME}] wrote ${String(wrote)} of ${String(results.length)} outputs from ${RELATIONS} (${counts})`;
  },
};

main(spec, import.meta.url);
