/**
 * Hold every harness file to its written shape (spec: kb.harness.self-check,
 * shape-gate and folder-list; the shapes themselves are
 * kb.harness.skills-and-agents, kb.harness.scoped-rules and kb.harness.hooks).
 *
 * A skill or agent description written as a plain scalar holding a colon and
 * a space fails: strict YAML reads `key: value` inside one as a nested
 * mapping, so the value is quoted. A skill or agent body that cites an element
 * as `<page>.html#<id>` fails: pages are markdown, so a citation is
 * `<page>.md#<id>`, and only a `site/…` path or a `file://` URL may name a
 * built `.html` page.
 *
 * A skill whose description never says when to use it is a skill no session
 * reaches for; a verifier holding a shell can change the tree it reports on; a
 * hook that prints on input it cannot read decides something nobody asked. No
 * page gate reads `.claude/`, so this one does, folder by folder:
 *
 *   the list    `CLAUDE_DIRS` below is the one list of the folders directly
 *               under `.claude/`. A folder it does not name is a finding: the
 *               tooling parks its own folders there too, and a walk cannot
 *               tell one of those from a harness one, so each costs a row
 *               saying what its files are and what holds them. The route gate
 *               (check-harness-routes.ts) reads the same list.
 *   an entry    a skill is a folder holding SKILL.md; an agent, a rule, a
 *               hook and a workflow are one file each, of the extension its
 *               row names. A folder in place of a file, or a file of another
 *               extension, is a finding.
 *   a skill     frontmatter `name` (its folder's) and a `description` holding
 *               a trigger ("Use when …") and a boundary ("Not for …"); a body
 *               that states the gap, then numbered steps, then ends with a
 *               "Done means" list. The harness shows each description from one
 *               shared budget and drops what does not fit, so a description is
 *               at most DESCRIPTION_CAP characters and all the skills' together
 *               at most DESCRIPTIONS_BUDGET.
 *   an agent    frontmatter `name` (its file's), a `description` with the same
 *               trigger and boundary, a `tools` list, and a section headed as
 *               its reply, holding the fixed shape its caller re-checks. The
 *               two verifiers declare exactly Read, Glob and Grep. The claim
 *               verifier's reply section holds its finding line, citing a page
 *               line and a tree line, and says it closes on exactly two lines,
 *               `checked:` then `untestable:`, with nothing after them; the
 *               triage agent's holds its five answers.
 *   a rule      the checks in ../lib/rules.ts: a description, and `paths` as
 *               a list of globs (a core rule always; another names its `act`).
 *   a hook      executable; run on an empty and on a non-JSON payload it exits
 *               0, prints nothing and finishes within its wired timeout (10 s
 *               at most); wired in `.claude/settings.json`, which wires no hook
 *               that is not there.
 *
 * `docs/data/allow/harness-shape.json` ships empty. An entry may excuse one
 * named skill's description and body findings — never a missing SKILL.md, name
 * or description — and needs a reason, an owner and a since date. An entry
 * that excuses nothing is a finding.
 *
 * With no `.claude/` folder there is nothing to hold: the run exits 0 and
 * counts zero. It takes no arguments.
 *
 * Usage: check-harness   (0 clean, 1 findings, 2 misuse)
 */

import fs from 'node:fs';
import path from 'node:path';

import { Allowlist, readAllowlist } from '../lib/allowlist.js';
import { run } from '../lib/exec.js';
import { frontmatterMany, type FmValue } from '../lib/frontmatter.js';
import { main, type GateContext, type GateSpec } from '../lib/gate.js';
import { readRules, ruleProblems } from '../lib/rules.js';
import { outsideFences } from './check-claude-md.js';

export const CLAUDE = '.claude';

/** What an entry of one folder is: a folder holding one file, or one file of these extensions. */
export type EntryShape = { readonly folder: string } | { readonly ext: readonly string[] };

/** One row of the folder list (spec: kb.harness.self-check.folder-list). */
export interface ClaudeDir {
  /** The shape this gate holds each entry to, or null where the row says what holds it instead. */
  readonly type: 'skill' | 'agent' | 'rule' | 'hook' | null;
  /** What one entry is, or null when the folder's entries are not this repo's to judge. */
  readonly entry: EntryShape | null;
  /** The extensions the route gate reads here for links and untracked paths; empty reads nothing. */
  readonly reads: readonly string[];
  /** Who holds the entries, in a sentence; for a typed row, the gate that shapes them. */
  readonly heldBy: string;
}

/**
 * Every folder directly under `.claude/`, and what the repo does with it. The
 * one list: this gate and the route gate both read it, and a folder missing
 * from it fails here.
 */
export const CLAUDE_DIRS: Readonly<Record<string, ClaudeDir>> = {
  agents: {
    type: 'agent',
    entry: { ext: ['.md'] },
    reads: ['.md'],
    heldBy: 'this gate: frontmatter, a trigger and a boundary, a tools list and a reply section',
  },
  hooks: {
    type: 'hook',
    entry: { ext: ['.sh'] },
    reads: [],
    heldBy: 'this gate (executable, silent on unreadable input, wired) and the bash suite under tests/hooks/',
  },
  rules: {
    type: 'rule',
    entry: { ext: ['.md'] },
    reads: ['.md'],
    heldBy: 'this gate, through tools/src/lib/rules.ts: a description and a paths list of globs',
  },
  skills: {
    type: 'skill',
    entry: { folder: 'SKILL.md' },
    reads: ['.md'],
    heldBy: 'this gate: frontmatter, a trigger and a boundary, the gap, numbered steps and "Done means"',
  },
  // A Workflow-tool script: code, but its prompts are prose a session acts on,
  // so the route gate reads it like a skill. No specification shapes it beyond
  // the one file of its extension.
  workflows: {
    type: null,
    entry: { ext: ['.mjs'] },
    reads: ['.mjs'],
    heldBy: 'review, and the route gate for its links and untracked paths',
  },
  // Other sessions' checkouts (git-excluded): each judged by the gates running inside it.
  worktrees: {
    type: null,
    entry: null,
    reads: [],
    heldBy: 'the gates running inside each checkout',
  },
};

/** Where this gate's excuses live. */
export const ALLOWLIST = 'docs/data/allow/harness-shape.json';
/** Where the hooks are wired. */
export const SETTINGS = '.claude/settings.json';

/** The tools a verifier declares, exactly (skills-and-agents-C4). */
export const VERIFIER_TOOLS: readonly string[] = ['Read', 'Glob', 'Grep'];

/** What a verifier's reply section must hold. */
export interface VerifierShape {
  readonly role: string;
  /** Literal parts the section states, each somewhere in it. */
  readonly reply: readonly string[];
  /** The lines the reply ends on, in order, on consecutive lines with nothing after them but a fence close or a blank line. */
  readonly closing?: readonly string[];
}

/**
 * The two verifier agents and the reply each one states (skills-and-agents-C5,
 * -C9): the claim verifier's finding line — the page line, the claim, the tree
 * line it cites, the severity — and its exactly two closing lines; the triage
 * agent's five answers.
 */
export const VERIFIERS: Readonly<Record<string, VerifierShape>> = {
  'claim-audit': {
    role: 'the claim verifier',
    reply: ['<page>:<line> — "<claim>" — ', 'citing file:line', ' — wrong | incomplete | stale', 'exactly two closing lines'],
    closing: ['checked: <n> claims on <page>', 'untestable: '],
  },
  'gate-triage': {
    role: 'the triage agent',
    reply: ['**Gate**', '**Protects**', '**Why it is red**', '**Repro**', '**Fix**'],
  },
};

/** The two payloads a hook must answer with silence and exit 0 (self-check-C5). */
export const HOOK_PAYLOADS: readonly (readonly [label: string, input: string])[] = [
  ['an empty payload', ''],
  ['a non-JSON payload', 'not json {'],
];

/**
 * The longest the gate waits for a hook on one payload, in seconds. The runtime
 * kills a hook at its wired `timeout`; on input it cannot read a hook answers
 * at once, so the gate holds it to that timeout and never waits past this.
 */
export const HOOK_LIMIT_S = 10;

/** The most characters one skill description may hold; the harness lists each description from a shared budget. */
export const DESCRIPTION_CAP = 350;
/** The most characters all the skills' descriptions may hold together; the harness drops descriptions past its listing budget. */
export const DESCRIPTIONS_BUDGET = 16_500;

const TRIGGER = /\bUse when\b/;
const BOUNDARY = /\bnot for\b/i;
const HEADING = /^(#{1,6})[ \t]+(.*?)[ \t]*#*[ \t]*$/;
const NUMBERED_HEADING = /^\d+[.)][ \t]/;
const NUMBERED_ITEM = /^\d+[.)][ \t]+\S/;
const LIST_ITEM = /^[ \t]*(?:[-*+]|\d+[.)])[ \t]+\S/;
const DONE = /^Done means\b/i;
const REPLY = /\b(?:reply|replies|return|returns)\b/i;
/** A token ending `.html#<id>`: the run of path characters before it, the anchor after. */
const HTML_CITATION = /[^\s`()"'<>[\]]*\.html#[\w-]*/g;
/** A YAML block-scalar marker in place of a value: `|`, `>`, `|-`, `>+`, `>2` … */
const BLOCK_SCALAR = /^[|>][-+]?\d*[-+]?$/;

/** The folders directly under `.claude/`, by name, sorted; dot-prefixed ones are the OS's. */
export function claudeDirs(root: string): string[] {
  const abs = path.join(root, CLAUDE);
  if (!fs.existsSync(abs) || !fs.statSync(abs).isDirectory()) return [];
  return fs
    .readdirSync(abs, { withFileTypes: true })
    .filter((e) => e.isDirectory() && !e.name.startsWith('.'))
    .map((e) => e.name)
    .sort();
}

/** The entries of one listed folder, repo-relative and sorted, dot-prefixed names skipped. */
export function entriesOf(root: string, dir: string): string[] {
  return fs
    .readdirSync(path.join(root, dir), { withFileTypes: true })
    .filter((e) => !e.name.startsWith('.'))
    .map((e) => `${dir}/${e.name}`)
    .sort();
}

/** The file lines of `text` with the frontmatter block and every fence blanked. Line numbers are kept. */
export function bodyLines(text: string): string[] {
  const lines = outsideFences(text).split('\n');
  if (lines[0] === '---') {
    const end = lines.indexOf('---', 1);
    if (end !== -1) for (let i = 0; i <= end; i += 1) lines[i] = '';
  }
  return lines;
}

/** The 1-based line of a frontmatter key in `text`, or undefined. */
export function keyLine(text: string, key: string): number | undefined {
  const at = text.split('\n').findIndex((l) => l.startsWith(`${key}:`));
  return at === -1 ? undefined : at + 1;
}

export interface SkillBody {
  /** Numbered steps before "Done means": numbered headings and top-level numbered items. */
  readonly steps: number;
  /** 1-based line of the first step, or null. */
  readonly firstStep: number | null;
  /** Prose before the first step, which is where the gap is stated. */
  readonly gap: boolean;
  /** Whether the body ends with a "Done means" heading holding a list. */
  readonly done: 'ok' | 'missing' | 'not-last' | 'empty';
}

/**
 * A skill body's shape (skills-and-agents-C2): the gap, numbered steps, then
 * the done conditions. A step is a heading whose text opens with a number
 * (`## 1. Name the gate`) or a top-level numbered item; one under "Done
 * means" is a condition, not a step. The "Done means" heading, at level two or
 * three, must be the last heading and hold a list.
 */
export function skillBody(text: string): SkillBody {
  const lines = bodyLines(text);
  let steps = 0;
  let firstStep: number | null = null;
  let gap = false;
  let doneAt = -1;
  let lastHeading = -1;
  for (let i = 0; i < lines.length; i += 1) {
    const line = lines[i] as string;
    const h = HEADING.exec(line);
    if (h !== null) {
      lastHeading = i;
      const level = (h[1] as string).length;
      const title = h[2] as string;
      if (DONE.test(title) && (level === 2 || level === 3)) doneAt = i;
      else if (doneAt === -1 && level >= 2 && NUMBERED_HEADING.test(title)) {
        steps += 1;
        firstStep ??= i + 1;
      }
      continue;
    }
    if (doneAt !== -1 || line.trim() === '') continue;
    if (NUMBERED_ITEM.test(line)) {
      steps += 1;
      firstStep ??= i + 1;
    } else if (firstStep === null) {
      gap = true;
    }
  }
  let done: SkillBody['done'] = 'ok';
  if (doneAt === -1) done = 'missing';
  else if (doneAt !== lastHeading) done = 'not-last';
  else if (!lines.slice(doneAt + 1).some((l) => LIST_ITEM.test(l))) done = 'empty';
  return { steps, firstStep, gap, done };
}

/**
 * What is wrong with a description, as one sentence, or null: a value the
 * repo's frontmatter reader cannot take (it reads one line, so a folded
 * `description: >-` comes back as the marker), then a missing trigger or
 * boundary.
 */
export function descriptionProblem(description: string): string | null {
  if (BLOCK_SCALAR.test(description.trim())) {
    return `its description is a YAML block scalar (${description.trim()}) — write it on one line: the repo's one frontmatter reader, scripts/fm-json.sh, takes single-line values`;
  }
  return descriptionGap(description);
}

/** The length of a description in characters, as a reader counts them (an astral character is one). */
export function descriptionLength(description: string): number {
  return Array.from(description).length;
}

/** A sentence naming a description longer than DESCRIPTION_CAP, or null. */
export function descriptionLengthProblem(description: string): string | null {
  const n = descriptionLength(description);
  return n > DESCRIPTION_CAP
    ? `its description is ${n} characters, over the cap of ${DESCRIPTION_CAP} — the harness lists descriptions from a shared budget and drops what does not fit; cut it to the job, a "Use when …" trigger and a "Not for …" boundary`
    : null;
}

/** A sentence naming a total of skill descriptions over DESCRIPTIONS_BUDGET, or null. */
export function descriptionsBudgetProblem(total: number): string | null {
  return total > DESCRIPTIONS_BUDGET
    ? `the skill descriptions hold ${total} characters together, over the budget of ${DESCRIPTIONS_BUDGET} — the harness drops the descriptions past its listing budget, so those skills are never offered; shorten the longest`
    : null;
}

/**
 * The value text of a frontmatter key exactly as written (quotes included),
 * read from the file's first block, or null when the key is not in it.
 */
export function rawFrontmatterValue(text: string, key: string): string | null {
  const lines = text.split('\n');
  if (lines[0] !== '---') return null;
  for (let i = 1; i < lines.length && lines[i] !== '---'; i += 1) {
    const line = lines[i] as string;
    if (line.startsWith(`${key}:`)) return line.slice(key.length + 1).trim();
  }
  return null;
}

/**
 * A sentence for a description written as a plain scalar that holds a colon
 * and a space, or null. Strict YAML reads `a: b` inside a plain scalar as a
 * nested mapping; a quoted string (double or single) and a block scalar are
 * safe, and the block scalar has its own finding. A missing description has
 * its own finding too, so null in is null out.
 */
export function descriptionQuoting(raw: string | null): string | null {
  if (raw === null) return null;
  const v = raw.trim();
  if (v.startsWith('"') || v.startsWith("'") || BLOCK_SCALAR.test(v)) return null;
  return v.includes(': ')
    ? 'its description is not a quoted string and contains ": " — strict YAML reads that as a nested mapping; wrap the whole value in double quotes'
    : null;
}

/** The `.html#` citations in a body, as `{ token, line }`, skipping a `site/…` path and a `file://` URL. */
export function htmlCitations(text: string): { token: string; line: number }[] {
  const out: { token: string; line: number }[] = [];
  const lines = bodyLines(text);
  for (let i = 0; i < lines.length; i += 1) {
    for (const m of (lines[i] as string).matchAll(HTML_CITATION)) {
      const token = m[0];
      if (token.startsWith('site/') || token.startsWith('file://')) continue;
      out.push({ token, line: i + 1 });
    }
  }
  return out;
}

/** The sentence for one `.html#` citation. */
export function htmlCitationProblem(token: string): string {
  return `cites ${token} — a page is markdown now, so cite an element as <page>.md#<id>; only a site/… path or a file:// URL may name a built .html page`;
}

/** What a description lacks of its trigger and boundary, as one sentence, or null. */
export function descriptionGap(description: string): string | null {
  const trigger = TRIGGER.test(description);
  const boundary = BOUNDARY.test(description);
  if (trigger && boundary) return null;
  if (!trigger && !boundary) {
    return 'its description says neither when to use it ("Use when …") nor what it is not for ("Not for …") — without a trigger nothing loads it';
  }
  return trigger
    ? 'its description says when to use it but not what it is not for — add a "Not for …" boundary'
    : 'its description says what it is not for but not when to use it — add a "Use when …" trigger';
}

/** The problems with a skill body, each one sentence, and the line to cite where there is one. */
export function bodyProblems(text: string): { what: string; line?: number }[] {
  const b = skillBody(text);
  const out: { what: string; line?: number }[] = [];
  if (b.steps === 0) {
    out.push({ what: 'has no numbered steps — write the procedure as numbered steps, one command or decision each' });
  } else if (!b.gap) {
    out.push({
      what: 'opens with a step — state the gap first: what goes wrong without this skill',
      line: b.firstStep as number,
    });
  }
  if (b.done === 'missing') {
    out.push({ what: 'does not end with a "Done means" list — close with conditions a reader can check' });
  } else if (b.done === 'not-last') {
    out.push({ what: '"Done means" is not its last section — the done conditions close the skill' });
  } else if (b.done === 'empty') {
    out.push({ what: '"Done means" holds no list — one checkable condition per item' });
  }
  return out;
}

/** An agent's `tools`, from an inline list or a comma-separated string. */
export function toolsOf(value: FmValue | undefined): string[] {
  if (value === undefined) return [];
  const items = Array.isArray(value) ? [...(value as readonly string[])] : (value as string).split(',');
  return items.map((t) => t.trim()).filter((t) => t !== '');
}

/**
 * The section an agent states its reply in: the first heading at level two or
 * three that names a reply or a return, down to the next heading at its level
 * or above. Null when there is none.
 */
export function replySection(text: string): string | null {
  const lines = bodyLines(text);
  for (let i = 0; i < lines.length; i += 1) {
    const h = HEADING.exec(lines[i] as string);
    if (h === null) continue;
    const level = (h[1] as string).length;
    if ((level !== 2 && level !== 3) || !REPLY.test(h[2] as string)) continue;
    const body: string[] = [];
    for (let j = i + 1; j < lines.length; j += 1) {
      const next = HEADING.exec(lines[j] as string);
      if (next !== null && (next[1] as string).length <= level) break;
      body.push(lines[j] as string);
    }
    // The fences were blanked for reading headings; the shape itself is often
    // fenced, so the section's text is read back from the file.
    const raw = text.split('\n').slice(i + 1, i + 1 + body.length);
    return raw.join('\n');
  }
  return null;
}

/**
 * Whether a reply section ends on its closing lines: each in order on
 * consecutive lines, the last followed by nothing but a fence close or a
 * blank line. A problem sentence, or null.
 */
export function closingProblem(reply: string, closing: readonly string[]): string | null {
  const lines = reply.split('\n').map((l) => l.trim());
  const first = lines.findIndex((l) => l.startsWith(closing[0] as string));
  const said = closing.map((c) => `"${c.trim()}"`).join(' then ');
  if (first === -1 || closing.some((c, i) => !(lines[first + i] ?? '').startsWith(c))) {
    return `its reply section does not close on ${said}, one line each`;
  }
  const after = lines[first + closing.length];
  if (after !== undefined && after !== '' && after !== '```') {
    return `its reply section puts a line after ${said} — the reply ends on those, with nothing after them`;
  }
  return null;
}

/**
 * The limit, in seconds, the gate holds each wired hook to: the smallest
 * `timeout` any command naming it declares, never above HOOK_LIMIT_S.
 */
export function hookLimits(settings: unknown): Map<string, number> {
  const out = new Map<string, number>();
  const hooks = (settings as { hooks?: unknown } | null)?.hooks;
  if (hooks === null || typeof hooks !== 'object' || Array.isArray(hooks)) return out;
  for (const groups of Object.values(hooks as Record<string, unknown>)) {
    if (!Array.isArray(groups)) continue;
    for (const group of groups) {
      const inner = (group as { hooks?: unknown } | null)?.hooks;
      if (!Array.isArray(inner)) continue;
      for (const h of inner) {
        const { command, timeout } = (h ?? {}) as { command?: unknown; timeout?: unknown };
        if (typeof command !== 'string' || typeof timeout !== 'number' || !(timeout > 0)) continue;
        for (const m of command.matchAll(/\.claude\/hooks\/([A-Za-z0-9._-]+)/g)) {
          const file = `.claude/hooks/${m[1] as string}`;
          out.set(file, Math.min(out.get(file) ?? HOOK_LIMIT_S, timeout));
        }
      }
    }
  }
  return out;
}

/**
 * What one hook does with one payload, run as the runtime runs it: by its
 * path, from the root, with the project folder set, and killed at `limit`
 * seconds as the runtime kills it at its timeout. A problem sentence, or null
 * when it exits 0, prints nothing and finishes in time.
 */
export function hookProblem(root: string, file: string, label: string, input: string, limit = HOOK_LIMIT_S): string | null {
  let r;
  try {
    r = run(path.join(root, file), [], root, { CLAUDE_PROJECT_DIR: root }, input, limit * 1000);
  } catch (e) {
    if ((e as NodeJS.ErrnoException).code === 'ETIMEDOUT') {
      return `does not finish on ${label} within ${limit} s — the runtime kills it there; a hook answers input it cannot read at once`;
    }
    return `cannot be run on ${label}: ${(e as Error).message}`;
  }
  if (r.status !== 0) return `exits ${r.status} on ${label} — a hook always exits 0, whatever it is handed`;
  if (r.stdout !== '') return `prints on ${label} — a hook decides nothing on input it cannot read`;
  return null;
}

/** Every `.claude/hooks/<file>` the hook commands of a parsed settings file name. */
export function wiredHooks(settings: unknown): Set<string> {
  const out = new Set<string>();
  const hooks = (settings as { hooks?: unknown } | null)?.hooks;
  if (hooks === null || typeof hooks !== 'object' || Array.isArray(hooks)) return out;
  for (const groups of Object.values(hooks as Record<string, unknown>)) {
    if (!Array.isArray(groups)) continue;
    for (const group of groups) {
      const inner = (group as { hooks?: unknown } | null)?.hooks;
      if (!Array.isArray(inner)) continue;
      for (const h of inner) {
        const command = (h as { command?: unknown } | null)?.command;
        if (typeof command !== 'string') continue;
        for (const m of command.matchAll(/\.claude\/hooks\/([A-Za-z0-9._-]+)/g)) out.add(`.claude/hooks/${m[1] as string}`);
      }
    }
  }
  return out;
}

/**
 * `.claude/settings.json`, parsed, or undefined when it is missing or is not
 * JSON. A missing file is a finding only when there are hooks to wire; one that
 * is not JSON always is.
 */
export function readSettings(ctx: GateContext, hooks: readonly string[]): unknown {
  const abs = path.join(ctx.root, SETTINGS);
  if (!fs.existsSync(abs)) {
    if (hooks.length > 0) ctx.fail(SETTINGS, 'is missing — every hook under .claude/hooks/ is wired to its event here');
    return undefined;
  }
  try {
    return JSON.parse(fs.readFileSync(abs, 'utf8')) as unknown;
  } catch {
    ctx.fail(SETTINGS, 'is not valid JSON');
    return undefined;
  }
}

/**
 * The hooks folder and a parsed `.claude/settings.json` agree both ways: every
 * hook is wired to an event, and every hook command names a hook that is
 * there. With no settings to read, readSettings has said what is wrong.
 */
export function checkWiring(ctx: GateContext, hooks: readonly string[], settings: unknown): void {
  if (settings === undefined) return;
  const wired = wiredHooks(settings);
  for (const file of [...wired].sort()) {
    if (!hooks.includes(file)) ctx.fail(SETTINGS, `wires ${file}, which is not a hook in .claude/hooks/`);
  }
  for (const file of hooks) {
    if (!wired.has(file)) ctx.fail(file, `is wired to no event in ${SETTINGS} — a hook nothing runs is dead code`);
  }
}

export const spec: GateSpec = {
  name: 'harness-shape',
  usage: 'usage: check-harness   (no arguments)',
  run(ctx: GateContext): string {
    const abs = path.join(ctx.root, CLAUDE);
    if (!fs.existsSync(abs) || !fs.statSync(abs).isDirectory()) {
      return '[harness-shape] no .claude/ folder — 0 harness files checked';
    }

    // ---- the folder list ----------------------------------------------------
    const present = claudeDirs(ctx.root);
    for (const name of present) {
      if (name in CLAUDE_DIRS) continue;
      ctx.fail(
        `${CLAUDE}/${name}`,
        'a folder under .claude/ with no row in the folder list — add a row to CLAUDE_DIRS in ' +
          'tools/src/gates/check-harness.ts saying what its files are and what holds them, or move it out',
      );
    }

    // ---- entry shapes, and the files each type reads ------------------------
    const found: { file: string; type: ClaudeDir['type'] }[] = [];
    for (const [name, d] of Object.entries(CLAUDE_DIRS)) {
      const dir = `${CLAUDE}/${name}`;
      if (d.entry === null || !present.includes(name)) continue;
      for (const entry of entriesOf(ctx.root, dir)) {
        const isDir = fs.statSync(path.join(ctx.root, entry)).isDirectory();
        if ('folder' in d.entry) {
          if (!isDir) {
            ctx.fail(entry, `an entry of ${dir}/ is a folder holding ${d.entry.folder}, not a file`);
            continue;
          }
          const file = `${entry}/${d.entry.folder}`;
          if (!fs.existsSync(path.join(ctx.root, file))) {
            ctx.fail(entry, `a folder of ${dir}/ with no ${d.entry.folder} — nothing here loads`);
            continue;
          }
          if (!fs.statSync(path.join(ctx.root, file)).isFile()) {
            ctx.fail(file, `is a folder, not a file — a skill loads from one ${d.entry.folder} file`);
            continue;
          }
          found.push({ file, type: d.type });
          continue;
        }
        if (isDir) {
          ctx.fail(entry, `an entry of ${dir}/ is one ${d.entry.ext.join(' or ')} file, not a folder`);
          continue;
        }
        if (!d.entry.ext.includes(path.extname(entry))) {
          ctx.fail(entry, `only ${d.entry.ext.join(' and ')} files belong in ${dir}/`);
          continue;
        }
        found.push({ file: entry, type: d.type });
      }
    }
    const ofType = (t: ClaudeDir['type']): string[] => found.filter((f) => f.type === t).map((f) => f.file);
    const skills = ofType('skill');
    const agentFiles = ofType('agent');
    const hooks = ofType('hook');
    const others = ofType(null).length;

    // ---- skills and agents: one parser spawn for every frontmatter ----------
    const fm = frontmatterMany(ctx.root, [...skills, ...agentFiles], { lists: true });
    const text = (file: string): string => fs.readFileSync(path.join(ctx.root, file), 'utf8');
    const str = (v: FmValue | undefined): string => (typeof v === 'string' ? v : '');

    const entries = readAllowlist(ctx, ALLOWLIST, {
      missing: 'the harness-shape gate reads the skills it excuses from here, even when it excuses none',
      emptyReason: 'has an empty reason — say why the skill keeps its old shape, and which change reshapes it',
    });
    const list = new Allowlist(entries ?? []);
    let excused = 0;
    let descriptionTotal = 0;

    for (const file of skills) {
      const fields = fm.get(file) as Record<string, FmValue>;
      const src = text(file);
      const folder = path.posix.basename(path.posix.dirname(file));
      const name = str(fields['name']);
      const description = str(fields['description']);
      if (name === '') ctx.fail(file, 'has no name in its frontmatter — a skill registers under its name');
      else if (name !== folder) ctx.fail(file, `declares name: ${name} but lives in ${folder}/ — the two must agree`, keyLine(src, 'name'));
      if (description === '') {
        ctx.fail(file, 'has no description in its frontmatter — a skill loads when a task matches its description');
        continue;
      }
      const shape: { what: string; line?: number }[] = [];
      descriptionTotal += descriptionLength(description);
      const descLine = keyLine(src, 'description') as number;
      const gap = descriptionProblem(description);
      if (gap !== null) shape.push({ what: gap, line: descLine });
      const long = descriptionLengthProblem(description);
      if (long !== null) shape.push({ what: long, line: descLine });
      const quoting = descriptionQuoting(rawFrontmatterValue(src, 'description'));
      if (quoting !== null) shape.push({ what: quoting, line: descLine });
      shape.push(...bodyProblems(src));
      for (const c of htmlCitations(src)) shape.push({ what: htmlCitationProblem(c.token), line: c.line });
      if (shape.length === 0) continue;
      // A withheld list (null) excuses nothing: the Allowlist over it is empty.
      if (list.excuses(file)) {
        excused += 1;
        continue;
      }
      for (const p of shape) ctx.fail(file, p.what, p.line);
    }
    const overBudget = descriptionsBudgetProblem(descriptionTotal);
    if (overBudget !== null) ctx.fail(`${CLAUDE}/skills`, overBudget);
    for (const e of list.unused()) {
      ctx.fail(ALLOWLIST, `entry "${e.name}" excuses nothing — ${e.match} is in shape or gone; delete the entry`);
    }

    const agents = new Set<string>();
    for (const file of agentFiles) {
      const fields = fm.get(file) as Record<string, FmValue>;
      const src = text(file);
      const base = path.posix.basename(file, '.md');
      agents.add(base);
      const name = str(fields['name']);
      const description = str(fields['description']);
      if (name === '') ctx.fail(file, 'has no name in its frontmatter — an agent is launched by its name');
      else if (name !== base) ctx.fail(file, `declares name: ${name} but the file is ${base}.md — the two must agree`, keyLine(src, 'name'));
      if (description === '') ctx.fail(file, 'has no description in its frontmatter — say when to launch it and when not');
      else {
        const gap = descriptionProblem(description);
        if (gap !== null) ctx.fail(file, gap, keyLine(src, 'description'));
        const quoting = descriptionQuoting(rawFrontmatterValue(src, 'description'));
        if (quoting !== null) ctx.fail(file, quoting, keyLine(src, 'description'));
      }
      for (const c of htmlCitations(src)) ctx.fail(file, htmlCitationProblem(c.token), c.line);
      const tools = toolsOf(fields['tools']);
      const verifier = VERIFIERS[base];
      if (tools.length === 0) {
        ctx.fail(file, 'declares no tools list — name every tool it may use, and no more', keyLine(src, 'tools'));
      } else if (verifier !== undefined) {
        const extra = tools.filter((t) => !VERIFIER_TOOLS.includes(t));
        const missing = VERIFIER_TOOLS.filter((t) => !tools.includes(t));
        if (extra.length > 0 || missing.length > 0) {
          ctx.fail(
            file,
            `${verifier.role} declares ${tools.join(', ')} — a verifier holds exactly ${VERIFIER_TOOLS.join(', ')}, ` +
              'so no run can change the tree it reports on',
            keyLine(src, 'tools'),
          );
        }
      }
      const reply = replySection(src);
      if (reply === null) {
        ctx.fail(file, 'states no reply shape — give it a section headed as its reply ("## Reply") holding the fixed shape its caller re-checks');
      } else if (verifier !== undefined) {
        // A part may wrap across lines in the definition's prose, so runs of
        // whitespace read as one space on both sides.
        const flat = reply.replace(/\s+/g, ' ');
        const lacking = verifier.reply.filter((part) => !flat.includes(part.replace(/\s+/g, ' ')));
        if (lacking.length > 0) {
          ctx.fail(file, `its reply section lacks the shape ${verifier.role} states: ${lacking.map((p) => `"${p.trim()}"`).join(', ')}`);
        }
        const closing = verifier.closing === undefined ? null : closingProblem(reply, verifier.closing);
        if (closing !== null) ctx.fail(file, closing);
      }
    }
    for (const [base, v] of Object.entries(VERIFIERS)) {
      if (!agents.has(base)) ctx.fail(`${CLAUDE}/agents/${base}.md`, `is missing — ${v.role} is one of the two read-only verifiers every harness keeps`);
    }

    // ---- rules --------------------------------------------------------------
    const rules = readRules(ctx.root);
    for (const p of ruleProblems(rules)) ctx.fail(p.file, p.what);

    // ---- hooks: executable, silent and quick on what they cannot read, wired
    const settings = readSettings(ctx, hooks);
    const limits = hookLimits(settings);
    for (const file of hooks) {
      const mode = fs.statSync(path.join(ctx.root, file)).mode;
      if ((mode & 0o111) === 0) {
        ctx.fail(file, 'is not executable — the runtime runs a hook by its path; chmod +x it');
        continue;
      }
      for (const [label, input] of HOOK_PAYLOADS) {
        const problem = hookProblem(ctx.root, file, label, input, limits.get(file));
        if (problem !== null) ctx.fail(file, problem);
      }
    }
    checkWiring(ctx, hooks, settings);

    const count = (n: number, one: string): string => `${n} ${one}${n === 1 ? '' : 's'}`;
    return (
      `[harness-shape] ${count(present.length, 'folder')} under .claude/, all listed; ` +
      `${count(skills.length, 'skill')} (${excused} excused by ${ALLOWLIST}), ${count(agentFiles.length, 'agent')}, ` +
      `${count(rules.length, 'rule')}, ${count(hooks.length, 'hook')} and ${count(others, 'other file')} in shape`
    );
  },
};

main(spec, import.meta.url);
