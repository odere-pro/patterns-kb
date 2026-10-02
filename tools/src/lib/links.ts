/**
 * The link-reading convention, in one place (spec: kb.content.docs-map,
 * link-reading; kb.harness.context-layers reads it without the `.md` filter).
 *
 * Every inline link counts, several to a line or a table cell. A quoted title,
 * a target with a scheme, one starting with `//` and a bare anchor are not the
 * repository's. Anchor and query suffixes are dropped, and what remains
 * resolves against the linking file's folder. A gate that only wants pages
 * filters the result to `.md` itself; a context layer's link to a file of any
 * type counts.
 *
 * The link gates read the same links with their labels (`inlineLinks`) and
 * resolve them by a narrower rule (spec: kb.gates.link-integrity,
 * link-resolver): only the schemes `isExternal` names belong to somebody else,
 * so `docs:page.md` is a dead link of this repository's, not an address.
 *
 * Whether a resolved target is there is asked of `onDiskExactly`, which
 * matches case the way the case-exact CI runner does, on any filesystem.
 */

import fs from 'node:fs';
import path from 'node:path';

/** One inline link: its target as written, its label, and where it sits. */
export interface InlineLink {
  /** The target, as written between the parentheses. */
  readonly target: string;
  /** The text between the brackets, as written; '' when no `[` opens it. */
  readonly label: string;
  /** `![alt](src)`: an image, whose text names nothing. */
  readonly image: boolean;
  /** The offset of the link's `](` in the text, which is where its target starts. */
  readonly at: number;
}

/**
 * Every inline link in `text`, in source order. The targets are the ones
 * `linkTargets` reads; the label is found by walking back from `](` to the
 * `[` that opens it, counting nested brackets, skipping escaped ones, and
 * never crossing a blank line.
 */
export function inlineLinks(text: string): InlineLink[] {
  const out: InlineLink[] = [];
  for (const m of text.matchAll(/\]\(([^)\s]+)(?:\s+"[^"]*")?\)/g)) {
    let open = -1;
    let depth = 0;
    for (let i = m.index - 1; i >= 0; i -= 1) {
      const c = text[i] as string;
      if (c === '\n' && text[i - 1] === '\n') break;
      if ((c !== '[' && c !== ']') || text[i - 1] === '\\') continue;
      if (c === ']') depth += 1;
      else if (depth > 0) depth -= 1;
      else {
        open = i;
        break;
      }
    }
    out.push({
      target: m[1] as string,
      label: open === -1 ? '' : text.slice(open + 1, m.index),
      image: open > 0 && text[open - 1] === '!',
      at: m.index,
    });
  }
  return out;
}

/** Every inline link target in `text`, as written. */
export function linkTargets(text: string): string[] {
  return inlineLinks(text).map((l) => l.target);
}

/**
 * A target that is somebody else's, under the link gates' rule: empty, a
 * scheme followed by `//`, a leading `//`, or one of the schemes http, https,
 * mailto, tel, data and javascript. Any other `word:` is a path of this
 * repository's, and a dead one.
 */
export function isExternal(target: string): boolean {
  return (
    target === '' ||
    target.startsWith('//') ||
    /^[a-z][a-z0-9+.-]*:\/\//i.test(target) ||
    /^(?:https?|mailto|tel|data|javascript):/i.test(target)
  );
}

/** A target split into its path and its fragment; a query is dropped. */
export function splitTarget(target: string): { path: string; fragment: string | null } {
  const hash = target.indexOf('#');
  const before = hash === -1 ? target : target.slice(0, hash);
  return { path: before.split('?')[0] as string, fragment: hash === -1 ? null : target.slice(hash + 1) };
}

/**
 * A link target as a repo-relative path, or null when it is not one of this
 * repository's: empty, a bare anchor, a scheme or a protocol-relative address.
 */
export function resolveTarget(fromFile: string, target: string): string | null {
  if (target === '' || target.startsWith('#')) return null;
  if (/^[a-zA-Z][a-zA-Z0-9+.-]*:/.test(target) || target.startsWith('//')) return null;
  const clean = (target.split('#')[0] as string).split('?')[0] as string;
  if (clean === '') return null;
  return path.posix.normalize(path.posix.join(path.posix.dirname(fromFile), clean));
}

/**
 * A check of whether a repo-relative path is on disk with exactly the case it
 * is written in. A case-blind filesystem (macOS by default) finds `Page.md`
 * for `page.md` and the CI runner's does not, so a link that passes here
 * would fail there. Each segment is looked up in its folder's listing, read
 * once per check function; a directory counts, and a symlink counts as what
 * it names without being resolved.
 */
export function onDiskExactly(root: string): (rel: string) => boolean {
  const listings = new Map<string, ReadonlySet<string> | null>();
  const listing = (dir: string): ReadonlySet<string> | null => {
    let names = listings.get(dir);
    if (names === undefined) {
      try {
        names = new Set(fs.readdirSync(path.join(root, dir)));
      } catch {
        names = null;
      }
      listings.set(dir, names);
    }
    return names;
  };
  return (rel: string): boolean => {
    let dir = '';
    for (const part of path.posix.normalize(rel).split('/')) {
      if (part === '' || part === '.') continue;
      if (part === '..' || listing(dir)?.has(part) !== true) return false;
      dir = dir === '' ? part : `${dir}/${part}`;
    }
    return true;
  };
}
