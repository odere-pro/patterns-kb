// How many pages each top-level area holds, for the home page's cards.
//
// Counted from the structure file's rows at build time, so a page added or
// moved changes the card with no number to edit. A page counts for the
// outermost area it nests under: the Patterns card counts every pattern in
// every group beneath it. A `link` area (the stack index) is one page and no
// kind, so it gets no count.
import { navOf, placedPages, type Structure } from '../../../tools/src/lib/site-routes';
import { topAreaOf } from './routes';

/** What a card calls its pages, by top-level area id; any other area says "pages". */
const NOUNS: Readonly<Record<string, readonly [singular: string, plural: string]>> = {
  patterns: ['pattern', 'patterns'],
  hazards: ['hazard', 'hazards'],
  designs: ['case study', 'case studies'],
  themes: ['theme', 'themes'],
  principles: ['principle', 'principles'],
  capabilities: ['capability', 'capabilities'],
  comparisons: ['comparison', 'comparisons'],
};

/** A card's count line: `216 patterns`, `1 hazard`; null when the area has no pages of its own kind. */
export function countLine(structure: Structure, area: string): string | null {
  const top = structure.areas.find((a) => a.id === area);
  if (top === undefined || navOf(top) === 'link') return null;
  const n = placedPages(structure).filter((p) => topAreaOf(p.area, structure) === area).length;
  if (n === 0) return null;
  const [one, many] = NOUNS[area] ?? ['page', 'pages'];
  return `${n} ${n === 1 ? one : many}`;
}
