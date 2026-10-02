/**
 * Allowlists with reason, read one way by every gate that keeps one (spec:
 * kb.data.exceptions).
 *
 * A gate's exceptions live in `docs/data/allow/<gate>.json`: the source header,
 * then `entries`, each a `name`, a whole-thing `match` (an exact path or a
 * glob) and a non-empty `reason`. An entry that excuses a failure rather than
 * a category also carries `owner` and `since`; a gate whose every entry
 * excuses a failure says so, and then every entry owes both. Default deny
 * both ways: a thing no entry matches is the gate's finding, and an entry
 * that matches nothing is a finding too, because an exception must not
 * outlive its cause.
 *
 * The gate owns the messages: what the list is for when it is missing, and
 * what an empty reason should have said.
 */

import fs from 'node:fs';
import path from 'node:path';

import type { GateContext } from './gate.js';
import { globToRegExp } from './glob.js';

export interface AllowEntry {
  name: string;
  match: string;
  reason: string;
  owner?: string;
  since?: string;
}

/**
 * What is wrong with one entry, or null. `emptyReason` is the message for a
 * blank reason, in the gate's own words; `excusing` holds the entry to an
 * owner and a since date even when it carries neither.
 */
export function entryProblem(entry: unknown, emptyReason: string, excusing = false): string | null {
  if (entry === null || typeof entry !== 'object' || Array.isArray(entry)) return 'is not an object';
  const e = entry as Record<string, unknown>;
  for (const key of ['name', 'match', 'reason'] as const) {
    if (typeof e[key] !== 'string' || (e[key] as string).trim() === '') {
      return key === 'reason' ? emptyReason : `has no ${key}`;
    }
  }
  // An entry that excuses a failure answers to someone, from a date
  // (exceptions-C3): either key announces one, so both are then owed.
  if (excusing || e['owner'] !== undefined || e['since'] !== undefined) {
    if (typeof e['owner'] !== 'string' || e['owner'].trim() === '') return 'excuses a failure but names no owner';
    if (typeof e['since'] !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(e['since'])) {
      return 'excuses a failure but has no since date (year-month-day)';
    }
  }
  return null;
}

/** How a gate words the two messages the list itself can earn. */
export interface ListWords {
  /** After `is missing — `: why the file exists even when empty. */
  readonly missing: string;
  /** The whole message for an entry with a blank reason. */
  readonly emptyReason: string;
  /**
   * Every entry excuses a failure, never a category — each thing the list
   * can excuse is something the gate would fail — so each owes an owner and
   * a since date (exceptions-C3), whether or not it names one.
   */
  readonly excusesFailures?: boolean;
}

/**
 * The list's entries, or null after one finding per problem naming the file.
 * A malformed entry is never applied: the whole list is withheld, so a typo
 * cannot silently excuse something.
 */
export function readAllowlist(ctx: GateContext, file: string, words: ListWords): AllowEntry[] | null {
  const abs = path.join(ctx.root, file);
  if (!fs.existsSync(abs)) {
    ctx.fail(file, `is missing — ${words.missing}`);
    return null;
  }
  let parsed: unknown;
  try {
    parsed = JSON.parse(fs.readFileSync(abs, 'utf8'));
  } catch {
    ctx.fail(file, 'is not valid JSON');
    return null;
  }
  const entries = (parsed as { entries?: unknown } | null)?.entries;
  if (!Array.isArray(entries)) {
    ctx.fail(file, 'has no entries array');
    return null;
  }
  let ok = true;
  entries.forEach((entry: unknown, i) => {
    const problem = entryProblem(entry, words.emptyReason, words.excusesFailures === true);
    if (problem === null) return;
    const name = (entry as { name?: unknown } | null)?.name;
    ctx.fail(file, `entry ${typeof name === 'string' && name !== '' ? `"${name}"` : `#${i + 1}`} ${problem}`);
    ok = false;
  });
  return ok ? (entries as AllowEntry[]) : null;
}

/** A read list, matching things and remembering which entries did. */
export class Allowlist {
  private readonly patterns: { entry: AllowEntry; re: RegExp }[];
  private readonly used = new Set<AllowEntry>();

  constructor(readonly entries: readonly AllowEntry[]) {
    this.patterns = entries.map((entry) => ({ entry, re: globToRegExp(entry.match) }));
  }

  /** The entry that excuses `thing`, whole, or undefined. The first that does is marked used. */
  entryFor(thing: string): AllowEntry | undefined {
    const hit = this.patterns.find((p) => p.re.test(thing));
    if (hit === undefined) return undefined;
    this.used.add(hit.entry);
    return hit.entry;
  }

  /** Does an entry excuse `thing`, whole? The first that does is marked used. */
  excuses(thing: string): boolean {
    return this.entryFor(thing) !== undefined;
  }

  /** How many entries excused something this run. */
  get applied(): number {
    return this.used.size;
  }

  /** The entries that excused nothing, in list order. */
  unused(): AllowEntry[] {
    return this.entries.filter((e) => !this.used.has(e));
  }
}
