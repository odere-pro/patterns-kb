/**
 * Globs, for the two readers that match paths against patterns: the driver's
 * `scans` narrowing and an allowlist entry's `match`.
 *
 * A dependency would be the wrong trade for matching a handful of patterns
 * against a handful of paths. This handles what the registry and the
 * allowlists use and nothing more: `*` within a segment, `**` across segments,
 * `?`, and `{a,b}` alternation. The match is anchored at both ends, so a path
 * holding only a matching fragment is unmatched (exceptions-C6).
 */

export function globToRegExp(pattern: string): RegExp {
  let out = '';
  let depth = 0;
  for (let i = 0; i < pattern.length; i += 1) {
    const c = pattern[i] as string;
    if (c === '*') {
      if (pattern[i + 1] === '*') {
        // `**/` spans zero or more segments; a bare `**` spans anything.
        if (pattern[i + 2] === '/') {
          out += '(?:[^/]+/)*';
          i += 2;
        } else {
          out += '.*';
          i += 1;
        }
      } else {
        out += '[^/]*';
      }
      continue;
    }
    if (c === '?') {
      out += '[^/]';
      continue;
    }
    if (c === '{') {
      depth += 1;
      out += '(?:';
      continue;
    }
    if (c === '}' && depth > 0) {
      depth -= 1;
      out += ')';
      continue;
    }
    if (c === ',' && depth > 0) {
      out += '|';
      continue;
    }
    out += c.replace(/[.+^${}()|[\]\\]/g, '\\$&');
  }
  return new RegExp(`^${out}$`);
}

/** Does `file` match any of `patterns`, whole? */
export function matches(file: string, patterns: readonly string[]): boolean {
  return patterns.some((p) => globToRegExp(p).test(file));
}
