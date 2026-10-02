/**
 * The scoped rules under `.claude/rules/`, read the one way the harness checks
 * them (spec: kb.harness.scoped-rules).
 *
 * A rule is one markdown file whose frontmatter carries `description` (what
 * it holds and when it applies) and `paths`, a list of globs: the runtime
 * loads the rule only when a session touches a matching file, and a rule with
 * no `paths` loads at session start. So a rule may omit `paths` only when it
 * governs an act with no file, and it says so with an `act` key naming that
 * act. The five core rules always carry `paths`.
 *
 * The frontmatter is read through the repo's one parser, `scripts/fm-json.sh`,
 * by way of its door in `./frontmatter.ts` — the whole folder in one spawn —
 * and only those three keys are taken from what it answers. Lists are inline,
 * `paths: ["a/**", "b.md"]`, as every frontmatter list in the repo is: a
 * block of `- a` items reads as no list at all. The shape gate that runs
 * these checks over the harness imports them.
 */

import fs from 'node:fs';
import path from 'node:path';

import { frontmatterMany, listOf, type FmValue } from './frontmatter.js';
import { globToRegExp } from './glob.js';

export const RULES_DIR = '.claude/rules';

/** The core set, one question each: rule id → file (spec: scoped-rules core-set). */
export const CORE_RULES: Readonly<Record<string, string>> = {
  claims: 'claims.md',
  comment: 'code-comments.md',
  page: 'page-schema.md',
  component: 'component-authoring.md',
  workflow: 'workflow-edits.md',
};

export interface RuleFrontmatter {
  description?: string;
  /** The globs, or `malformed` when the key is there but is not a list of strings. */
  paths?: string[] | 'malformed';
  act?: string;
}

/**
 * The three keys a rule carries, taken from what the parser read out of its
 * frontmatter (`fm-json.sh --lists`: a string per scalar, an array per inline
 * list). Null when it read nothing — no frontmatter, or an empty block, and a
 * rule needs its description either way. `paths` is `malformed` unless it is
 * an inline list of non-empty globs.
 */
export function ruleFrontmatter(fields: Readonly<Record<string, FmValue>>): RuleFrontmatter | null {
  if (Object.keys(fields).length === 0) return null;
  const out: RuleFrontmatter = {};
  const { description, act, paths } = fields;
  if (typeof description === 'string') out.description = description;
  if (typeof act === 'string') out.act = act;
  if (paths !== undefined) {
    const globs = listOf(paths);
    out.paths = globs !== null && globs.length > 0 && globs.every((g) => g !== '') ? [...globs] : 'malformed';
  }
  return out;
}

export interface Rule {
  /** Repo-relative path of the rule file. */
  readonly file: string;
  readonly fm: RuleFrontmatter | null;
}

/** Every rule file, sorted, read in one parser spawn. A repo with no rules folder has none. */
export function readRules(root: string): Rule[] {
  const dir = path.join(root, RULES_DIR);
  if (!fs.existsSync(dir)) return [];
  const files = fs
    .readdirSync(dir, { withFileTypes: true })
    .filter((e) => e.isFile() && e.name.endsWith('.md'))
    .map((e) => `${RULES_DIR}/${e.name}`)
    .sort();
  // One entry per file, in the order given, and no spawn at all for none.
  return [...frontmatterMany(root, files, { lists: true })].map(([file, fields]) => ({ file, fm: ruleFrontmatter(fields) }));
}

/** The rule files with no `paths` key, which load at session start. */
export function rulesWithoutPaths(rules: readonly Rule[]): string[] {
  return rules.filter((r) => r.fm?.paths === undefined).map((r) => r.file);
}

export interface RuleProblem {
  readonly file: string;
  readonly what: string;
}

const isCore = (file: string): boolean => Object.values(CORE_RULES).includes(path.posix.basename(file));

/**
 * What is wrong with each rule's frontmatter: a missing or empty
 * `description`; `paths` that are not a list of globs, or a glob that does not
 * compile; a core rule with no `paths`; any other rule with neither `paths`
 * nor the `act` it governs.
 */
export function ruleProblems(rules: readonly Rule[]): RuleProblem[] {
  const out: RuleProblem[] = [];
  for (const { file, fm } of rules) {
    if (fm === null) {
      out.push({ file, what: 'has no frontmatter — a rule opens with description and paths' });
      continue;
    }
    if (fm.description === undefined || fm.description === '') {
      out.push({ file, what: 'has no description — say what the rule holds and when it applies' });
    }
    if (fm.paths === 'malformed') {
      out.push({ file, what: 'paths is not an inline list of globs — write paths: ["a/**", "b.md"]' });
    } else if (fm.paths !== undefined) {
      for (const g of fm.paths) {
        try {
          globToRegExp(g);
        } catch {
          out.push({ file, what: `paths holds a glob that does not compile: ${g}` });
        }
      }
    } else if (isCore(file)) {
      out.push({ file, what: 'is a core rule with no paths — it would load in every session' });
    } else if (fm.act === undefined || fm.act === '') {
      out.push({ file, what: 'has no paths and names no act — give it paths, or an act key naming the act it governs' });
    }
  }
  return out;
}

/** The files a rule's globs select out of `files`. */
export function scopeOf(rule: Rule, files: readonly string[]): string[] {
  const globs = Array.isArray(rule.fm?.paths) ? rule.fm.paths : [];
  const res = globs.map((g) => globToRegExp(g));
  return files.filter((f) => res.some((re) => re.test(f)));
}
