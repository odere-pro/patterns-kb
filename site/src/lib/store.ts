// What a reader's browser remembers for them, in one place: their favourites
// and the pages they have practiced.
//
// The keys are the HTML site's (its favourites and progress scripts), so
// a reader who marked pages on the HTML site finds them marked here. Each
// store is a flat JSON object of page slug to flag, read and written through
// the two functions below, which never throw: storage is off in some private
// modes and can hold anything, and a broken store must cost the reader nothing
// beyond the page's life: a refused write is kept in memory and read back.
//
// Favourites hold overrides only. A page's `favourite: true` in its frontmatter
// is the default, rendered into the markup as the toggle's starting state; the
// store names a slug only while the reader disagrees with that default, so a
// fresh browser sees the authored picks and re-picking them later moves every
// reader who never chose.

/** Favourite overrides: slug → the reader's choice, where it differs from the page's. */
export const FAVOURITES_KEY = 'kb-favourites-v1';

/** Practiced pages: slug → true. */
export const PRACTICED_KEY = 'elevation-map-progress-v1';

export type Flags = Record<string, boolean>;

/**
 * Stores whose last write storage refused, per window: the page's copy of
 * record until a write succeeds. A store absent here is read from storage.
 */
const held = new WeakMap<Window, Map<string, Flags>>();

/** The store under `key`, or an empty one when storage is off, empty or holds no object. */
export function readFlags(view: Window, key: string): Flags {
  const kept = held.get(view)?.get(key);
  if (kept !== undefined) return { ...kept };
  try {
    const parsed: unknown = JSON.parse(view.localStorage.getItem(key) ?? '{}');
    if (parsed === null || typeof parsed !== 'object' || Array.isArray(parsed)) return {};
    const out: Flags = {};
    for (const [k, v] of Object.entries(parsed as Record<string, unknown>))
      if (typeof v === 'boolean') out[k] = v;
    return out;
  } catch {
    return {};
  }
}

/**
 * Write the store under `key`. When storage refuses (private mode, quota), the
 * page keeps the store in memory and reads return it, so a mark holds until
 * the page closes; the next write storage accepts hands the store back to it.
 */
export function writeFlags(view: Window, key: string, flags: Flags): void {
  let keep = held.get(view);
  try {
    view.localStorage.setItem(key, JSON.stringify(flags));
    keep?.delete(key);
  } catch {
    if (keep === undefined) {
      keep = new Map();
      held.set(view, keep);
    }
    keep.set(key, { ...flags });
  }
}

/** The file Export writes and Import reads. */
export interface MarksFile {
  version: 1;
  favourites: Flags;
  practiced: Flags;
}

/** The two stores as the Export file holds them. */
export function exportMarks(view: Window): MarksFile {
  return {
    version: 1,
    favourites: readFlags(view, FAVOURITES_KEY),
    practiced: readFlags(view, PRACTICED_KEY),
  };
}

/** Is `value` a plain object whose every value is a boolean? */
function isFlags(value: unknown): value is Flags {
  return (
    value !== null &&
    typeof value === 'object' &&
    !Array.isArray(value) &&
    Object.values(value as Record<string, unknown>).every((v) => typeof v === 'boolean')
  );
}

/** The marks in an Export file's text, or null when it is not one (bad JSON, wrong version or shape). */
export function parseMarks(text: string): MarksFile | null {
  let parsed: unknown;
  try {
    parsed = JSON.parse(text);
  } catch {
    return null;
  }
  if (parsed === null || typeof parsed !== 'object' || Array.isArray(parsed)) return null;
  const file = parsed as Record<string, unknown>;
  if (file['version'] !== 1 || !isFlags(file['favourites']) || !isFlags(file['practiced']))
    return null;
  // Practiced holds `true` only; a `false` is the absence of the mark.
  const practiced: Flags = {};
  for (const [slug, v] of Object.entries(file['practiced'])) if (v) practiced[slug] = true;
  return { version: 1, favourites: { ...file['favourites'] }, practiced };
}

/** Both stores after the file's marks are added to the reader's: the file wins on a shared slug. */
export function mergeMarks(view: Window, file: MarksFile): void {
  writeFlags(view, FAVOURITES_KEY, { ...readFlags(view, FAVOURITES_KEY), ...file.favourites });
  writeFlags(view, PRACTICED_KEY, { ...readFlags(view, PRACTICED_KEY), ...file.practiced });
}

/** Forget every mark. */
export function resetMarks(view: Window): void {
  writeFlags(view, FAVOURITES_KEY, {});
  writeFlags(view, PRACTICED_KEY, {});
}

/** Is `slug` a favourite, given the page's own answer and the reader's overrides? */
export function isFavourite(slug: string, authored: boolean, overrides: Flags): boolean {
  return Object.prototype.hasOwnProperty.call(overrides, slug)
    ? overrides[slug] === true
    : authored;
}

/** The overrides after the reader flips `slug`: back to the page's answer stores nothing. */
export function flipFavourite(slug: string, authored: boolean, overrides: Flags): Flags {
  const next = { ...overrides };
  const now = !isFavourite(slug, authored, overrides);
  if (now === authored) delete next[slug];
  else next[slug] = now;
  return next;
}
