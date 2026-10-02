/**
 * A theme's tour and a page's "where it shows up" list, rendered from
 * `docs/data/learning-paths.json` (dialect D-81, D-82). Pure: no file is read
 * here. The generator that splices these blocks into pages and answers --check,
 * tools/src/gen/gen-tours.ts, wraps these functions.
 *
 * THE DATA
 *
 *   profiles   one per theme, in hub order: `{ id, label, stages }`,
 *              `stages` the member pages' routes in tour order (D-02 routes,
 *              `.html` included).
 *   notes      `notes[<member route>][<theme slug>]`, a route's themes in the
 *              order the member page lists them in its fluency block —
 *                role          the one-line role (plain text)
 *                tour          the tour paragraph (markdown inline, its links
 *                              relative to the THEME page, where it renders)
 *                fluency       the member's own sentence about the theme
 *                              (markdown inline, links relative to the MEMBER
 *                              page); "" when it has none
 *                heading       the step heading's text (plain), only when the
 *                              theme words it other than the member's title
 * *
 * THE BLOCKS
 *
 *   tour      ### [<heading or member title>](<relative .md>) {#tour-<member>}
 *
 *             <tour>
 *
 *   fluency   - [<theme title>](<relative .md>) — <fluency> {#fluency-<theme>}
 *
 *             One item per profile whose stages hold the page, in the order
 *             of the page's notes (its authored order), then any touring
 *             profile the notes do not name, in profile order.
 */

import { blockStamp } from './generated.js';
import { printSuffix } from './kb-attrs.js';
import { escapeMdText, guardTrailingBrace, relativeMd } from './md-text.js';
import type { PageRef } from './render-relations.js';

export const LEARNING_PATHS_SRC = 'docs/data/learning-paths.json';
/** The name the block stamps carry: the P3c generator that will own the blocks. */
export const GENERATOR = 'gen-tours';
/** The marked blocks' names. */
export const TOUR_BLOCK = 'tour';
export const FLUENCY_BLOCK = 'fluency';

export interface Profile {
  readonly id: string;
  readonly label: string;
  readonly stages: readonly string[];
}

export interface TourNote {
  readonly role: string;
  readonly tour: string;
  readonly fluency: string;
  /** The step heading's own text, when it is not the member's title. */
  readonly heading?: string;
}

export interface LearningPaths {
  readonly version: number;
  readonly updated: string;
  readonly note: string;
  readonly profiles: readonly Profile[];
  readonly notes: Readonly<Record<string, Readonly<Record<string, TourNote>>>>;
}

export interface TourContext {
  /** Every page, by route. */
  readonly pages: ReadonlyMap<string, PageRef>;
}

const EMPTY: TourNote = { role: '', tour: '', fluency: '' };

function page(ctx: TourContext, route: string, what: string): PageRef {
  const p = ctx.pages.get(route);
  if (p === undefined) throw new Error(`learning paths: ${what} ${route} is no page`);
  return p;
}

function bySlug(ctx: TourContext, slug: string): PageRef {
  for (const p of ctx.pages.values()) if (p.slug === slug) return p;
  throw new Error(`learning paths: no page "${slug}"`);
}

function suffix(id: string): string {
  return printSuffix({ id });
}

/** The lines inside a theme's `tour` marked block. */
export function renderTour(themeSlug: string, lp: LearningPaths, ctx: TourContext): string[] {
  const profile = lp.profiles.find((p) => p.id === themeSlug);
  if (profile === undefined) throw new Error(`learning paths: no profile "${themeSlug}"`);
  const theme = bySlug(ctx, themeSlug);
  const lines: string[] = [blockStamp(GENERATOR, LEARNING_PATHS_SRC, 'block')];
  for (const route of profile.stages) {
    const member = page(ctx, route, `a stage of ${themeSlug}`);
    const note = lp.notes[route]?.[themeSlug] ?? EMPTY;
    const link = `[${escapeMdText(note.heading ?? member.title)}](${relativeMd(theme.source, member.source)})`;
    lines.push('', `### ${link} ${suffix(`tour-${member.slug}`)}`);
    if (note.tour !== '') {
      lines.push('', guardTrailingBrace(note.tour));
    }
  }
  return lines;
}

/**
 * The profiles whose tours hold `route`, in the order of the route's notes —
 * the member page's own order — then the rest in profile order.
 */
export function themesOf(route: string, lp: LearningPaths): Profile[] {
  const touring = lp.profiles.filter((p) => p.stages.includes(route));
  const noted = Object.keys(lp.notes[route] ?? {});
  const rank = (p: Profile): number => {
    const i = noted.indexOf(p.id);
    return i === -1 ? noted.length : i;
  };
  return touring.map((p, i) => ({ p, i })).sort((x, y) => rank(x.p) - rank(y.p) || x.i - y.i).map((x) => x.p);
}

/** The lines inside a page's `fluency` marked block. */
export function renderFluency(route: string, lp: LearningPaths, ctx: TourContext): string[] {
  const self = page(ctx, route, 'the page');
  const items: string[] = [];
  for (const profile of themesOf(route, lp)) {
    const theme = bySlug(ctx, profile.id);
    const note = lp.notes[route]?.[profile.id] ?? EMPTY;
    const link = `[${escapeMdText(theme.title)}](${relativeMd(self.source, theme.source)})`;
    const text = guardTrailingBrace(`- ${link}${note.fluency === '' ? '' : ` — ${note.fluency}`}`);
    items.push(`${text} ${suffix(`fluency-${profile.id}`)}`);
  }
  const stamp = blockStamp(GENERATOR, LEARNING_PATHS_SRC, 'block');
  return items.length === 0 ? [stamp] : [stamp, '', ...items];
}
