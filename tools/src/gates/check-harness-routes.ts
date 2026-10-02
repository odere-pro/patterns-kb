/**
 * Keep every harness file routing to a live path (spec: kb.harness.self-check,
 * route-gate and untracked-table).
 *
 * A skill that sends a session to a file that moved, or to a folder only its
 * author's machine has, fails every session but the one that wrote it — and
 * no page gate reads `.claude/`. So this gate reads the files the folder list
 * in check-harness.ts says to read (`reads` on each row; that list is the one
 * list, and this gate keeps no copy of it), every extension it names, in
 * every folder of a skill:
 *
 *   links      every inline link with a repo-relative target resolves against
 *              the linking file, anchor and query dropped first; a target with
 *              a scheme, a bare anchor and `mailto:` are not the repo's. Links
 *              inside a fence or a code span are samples and are not read.
 *   untracked  `UNTRACKED` below pairs each path prefix that is untracked by
 *              design with the command that makes it exist, or with none. A
 *              file naming a prefix whose row has a command must name that
 *              command too; a prefix with none is scratch space and fails
 *              wherever it is named. A prefix matches only as a path token —
 *              at a line start or after a character that is not a letter,
 *              digit, underscore, dot, slash or hyphen, a leading `./` read
 *              past — and a mention is the row of the longest prefix it
 *              starts with, so a tool's own folder under `tmp/` answers to
 *              its tool, not to `tmp/`. One finding per prefix per file, at
 *              its first mention.
 *   commands   every shell command a harness file or a CLAUDE.md layer
 *              names (a line of a shell or unlabelled fence, or a code span;
 *              tools/src/lib/permissions.ts says how one is read) is covered
 *              by a `Bash(…)` entry of `permissions.allow` in
 *              `.claude/settings.json`, or starts with a prefix `PROMPT_KEPT`
 *              below lists with the reason it keeps its prompt
 *              (self-check-C10). One on neither stops a session that follows
 *              the file on a permission prompt nobody chose. A missing or
 *              unreadable settings file allows nothing (the shape gate says
 *              what is wrong with it). One finding per command per file, at
 *              its first mention. The layers are read for commands only:
 *              their links and paths have the CLAUDE.md gate.
 *   allow list no `Bash(…)` entry lets a command in `WRITES` below run with
 *              no prompt, by starting with it or by a wildcard that reaches
 *              it: the allow list holds read-only and repo-script commands,
 *              by the owner's call. One finding per entry, on the settings
 *              file.
 *
 * With no `.claude/` folder there is nothing to read: the run exits 0 and
 * counts zero. It takes no arguments: a route breaks when its target moves,
 * anywhere in the tree.
 *
 * Usage: check-harness-routes   (0 clean, 1 findings, 2 misuse)
 */

import fs from 'node:fs';
import path from 'node:path';

import { main, type GateContext, type GateSpec } from '../lib/gate.js';
import { linkTargets, resolveTarget } from '../lib/links.js';
import { bashAllows, coverOf, namedCommands, reachedWrite } from '../lib/permissions.js';
import { findLayers, outsideFences } from './check-claude-md.js';
import { CLAUDE, CLAUDE_DIRS, claudeDirs } from './check-harness.js';
import { SETTINGS } from './check-harness.js';

/**
 * Paths untracked by design, and the command that makes each exist on a fresh
 * checkout — or null for scratch space nothing makes. Written down rather than
 * read from `.gitignore`: the ignore file says what git skips, not which
 * command rebuilds it, and that command is the fact this gate needs.
 */
export const UNTRACKED: ReadonlyArray<readonly [prefix: string, madeBy: string | null]> = [
  ['tmp/', null],
  ['tmp/kb-fact-check/', 'node .claude/skills/kb-fact-check/fetch.mjs'],
  ['tmp/kb-harvest/', 'node .claude/skills/kb-harvest/harvest.mjs'],
  ['tmp/site-extract/', 'node .claude/skills/site-extract/structure.mjs'],
  ['tmp/designs/', 'mkdir -p tmp/designs/'],
  ['tools/coverage/', 'make tools-test'],
  ['node_modules/', 'make install'],
  ['site/dist/', 'make site-build'],
  ['site/.astro/', 'make site-build'],
  ['.claude/settings.local.json', null],
];

/**
 * Commands a harness file may name that stay off `permissions.allow`, each
 * with the reason it keeps its permission prompt (self-check-C10). The allow
 * list holds read-only and repo-script commands only, by the owner's call.
 * docs/concepts/working-in-this-repo.md#commands-that-keep-their-prompt gives
 * the same list to a reader, and a test holds the two together.
 */
export const PROMPT_KEPT: ReadonlyArray<readonly [prefix: string, reason: string]> = [
  ['sed', 'edits files in place with -i, and a page change goes through the kb.mjs writers'],
  ['node -e', 'runs whatever code it is handed, so allowing it allows everything'],
  ['git mv', 'moves tracked files in a tree other sessions share'],
  ['git config', 'changes how git behaves for every session in the clone'],
  ['gh issue', 'writes to GitHub, where other people read it'],
  ['gh api', 'can write anything the token can, and a read looks like a write'],
  ['head', 'read-only, but not on the allow list the owner chose; a skill that pipes into it prompts once'],
  ['git checkout', 'overwrites a file from the index other sessions share; restore with git show HEAD:<path> instead'],
  ['bash tests/run.sh', 'the owner allowed the whole-suite run exactly; one file with its flags asks first'],
];

/**
 * Commands that write, or run whatever they are handed. No allow entry may
 * let one run with no prompt; `git add` is the one write the list keeps, as
 * the step that stages exact paths.
 */
export const WRITES: readonly string[] = [
  'rm', 'rmdir', 'cp', 'mv', 'ln', 'touch', 'tee', 'dd', 'chmod', 'chown', 'truncate', 'sed', 'perl', 'awk',
  'curl', 'wget', 'rsync', 'eval', 'exec', 'xargs', 'bash -c', 'sh -c', 'zsh -c', 'node -e', 'node --eval',
  'node -p', 'node --print', 'npx', 'npm install', 'npm i', 'npm ci', 'npm run', 'npm exec', 'python', 'python3',
  'git commit', 'git push', 'git checkout', 'git restore', 'git reset', 'git stash', 'git mv', 'git rm',
  'git clean', 'git config', 'git rebase', 'git merge', 'git cherry-pick', 'git branch', 'git tag',
  'git worktree', 'git switch', 'git pull', 'git fetch', 'git apply', 'git am', 'gh',
];

/** The findings for allow entries that let a write run with no prompt, one per entry. */
export function allowProblems(allowed: readonly string[]): string[] {
  const out: string[] = [];
  for (const p of allowed) {
    const w = reachedWrite(p, WRITES);
    if (w === null) continue;
    out.push(
      `permissions.allow holds Bash(${p}), which lets \`${w}\` run with no prompt — the list holds read-only and ` +
        'repo-script commands only; drop the entry, or narrow it to a read',
    );
  }
  return out;
}

/** The findings for the commands one file names that neither list covers, each with its line. */
export function commandProblems(text: string, allowed: readonly string[]): { line: number; what: string }[] {
  const kept = PROMPT_KEPT.map(([prefix]) => prefix);
  const out: { line: number; what: string }[] = [];
  for (const [cmd, how] of namedCommands(text)) {
    if (coverOf(cmd, allowed, kept, how) !== null) continue;
    const { line, cut, template } = how;
    const shown = template ? `${cmd}…` : cut ? `${cmd} …` : cmd;
    out.push({
      line,
      what:
        `names \`${shown}\`, which no permissions.allow entry in ${SETTINGS} covers and PROMPT_KEPT does not list — ` +
        'a session that follows it stops on a permission prompt; allow it, or keep the prompt with a reason in ' +
        'PROMPT_KEPT in tools/src/gates/check-harness-routes.ts',
    });
  }
  return out;
}

/** The Bash allow patterns of `.claude/settings.json` under `root`; none when it is missing or not JSON. */
export function allowedCommands(root: string): string[] {
  try {
    return bashAllows(JSON.parse(fs.readFileSync(path.join(root, SETTINGS), 'utf8')));
  } catch {
    return [];
  }
}

/** The characters that may not come right before a prefix for it to count as a path token. */
const PATH_CHAR = /[\w./-]/;

/**
 * Every untracked prefix `text` names as a path token, each with the 1-based
 * line of its first mention; a mention belongs to the longest prefix it
 * starts with. A token spelled from the current folder, `./tmp/notes.md`, is
 * the same path as `tmp/notes.md`, so a leading `./` is read past.
 */
export function untrackedMentions(text: string): Map<string, number> {
  const rows = [...UNTRACKED].sort((a, b) => b[0].length - a[0].length);
  const out = new Map<string, number>();
  text.split('\n').forEach((line, i) => {
    for (let at = 0; at < line.length; at += 1) {
      if (at > 0 && PATH_CHAR.test(line[at - 1] as string)) continue;
      const from = line.startsWith('./', at) ? at + 2 : at;
      const row = rows.find(([prefix]) => line.startsWith(prefix, from));
      if (row === undefined) continue;
      if (!out.has(row[0])) out.set(row[0], i + 1);
      at = from + row[0].length - 1;
    }
  });
  return out;
}

/** The findings for one file's untracked mentions, each with its line. */
export function untrackedProblems(text: string): { line: number; what: string }[] {
  const out: { line: number; what: string }[] = [];
  const made = new Map(UNTRACKED);
  for (const [prefix, line] of untrackedMentions(text)) {
    const madeBy = made.get(prefix) as string | null;
    if (madeBy === null) {
      out.push({
        line,
        what: `points at ${prefix}, which is untracked by design and nothing makes — the route is dead on every checkout but its author's`,
      });
    } else if (!text.includes(madeBy)) {
      out.push({
        line,
        what: `points at ${prefix} without naming \`${madeBy}\`, the command that makes it — say how to make the path exist before sending a session there`,
      });
    }
  }
  return out.sort((a, b) => a.line - b.line);
}

/** `text` with every inline code span blanked to spaces, so a sample link is not read. Offsets kept. */
export function withoutCodeSpans(text: string): string {
  return text.replace(/`[^`\n]*`/g, (m) => ' '.repeat(m.length));
}

/** The CLAUDE.md layers read for the commands they name, repo-relative and sorted. */
export function layerFiles(root: string): string[] {
  return findLayers(root);
}

/** Every file the listed folders say to read, repo-relative and sorted. */
export function harnessFiles(root: string): string[] {
  const out: string[] = [];
  const present = claudeDirs(root);
  for (const [name, d] of Object.entries(CLAUDE_DIRS)) {
    if (d.reads.length === 0 || d.entry === null || !present.includes(name)) continue;
    const folder = 'folder' in d.entry;
    const walk = (rel: string, depth: number): void => {
      for (const e of fs.readdirSync(path.join(root, rel), { withFileTypes: true })) {
        if (e.name.startsWith('.')) continue;
        const child = `${rel}/${e.name}`;
        // A skill is a folder, read whole; the other types are their top-level files.
        if (e.isDirectory()) {
          if (folder) walk(child, depth + 1);
        } else if (d.reads.includes(path.extname(e.name)) && (folder ? depth > 0 : true)) {
          out.push(child);
        }
      }
    };
    walk(`${CLAUDE}/${name}`, 0);
  }
  return out.sort();
}

export const spec: GateSpec = {
  name: 'harness-routes',
  usage: 'usage: check-harness-routes   (no arguments)',
  run(ctx: GateContext): string {
    const abs = path.join(ctx.root, CLAUDE);
    if (!fs.existsSync(abs) || !fs.statSync(abs).isDirectory()) {
      return '[harness-routes] no .claude/ folder — 0 harness files checked';
    }

    const files = harnessFiles(ctx.root);
    const layers = layerFiles(ctx.root);
    const allowed = allowedCommands(ctx.root);
    for (const what of allowProblems(allowed)) ctx.fail(SETTINGS, what);
    let links = 0;
    let named = 0;
    let commands = 0;
    for (const rel of files) {
      const text = fs.readFileSync(path.join(ctx.root, rel), 'utf8');
      withoutCodeSpans(outsideFences(text))
        .split('\n')
        .forEach((line, i) => {
          for (const t of linkTargets(line)) {
            const resolved = resolveTarget(rel, t);
            if (resolved === null) continue;
            links += 1;
            if (!fs.existsSync(path.join(ctx.root, resolved))) {
              ctx.fail(rel, `dead link: (${t}) resolves to ${resolved}, which does not exist`, i + 1);
            }
          }
        });
      const mentions = untrackedMentions(text);
      const problems = untrackedProblems(text);
      named += mentions.size - problems.length;
      for (const p of problems) ctx.fail(rel, p.what, p.line);
      const uncovered = commandProblems(text, allowed);
      commands += namedCommands(text).size - uncovered.length;
      for (const p of uncovered) ctx.fail(rel, p.what, p.line);
    }
    for (const rel of layers) {
      const text = fs.readFileSync(path.join(ctx.root, rel), 'utf8');
      const uncovered = commandProblems(text, allowed);
      commands += namedCommands(text).size - uncovered.length;
      for (const p of uncovered) ctx.fail(rel, p.what, p.line);
    }

    return (
      `[harness-routes] ${files.length} harness files route to live paths: ${links} links resolve, ` +
      `${named} untracked ${named === 1 ? 'path names its' : 'paths name their'} command, ` +
      `${commands} named ${commands === 1 ? 'command is' : 'commands are'} allowed or prompt-kept`
    );
  },
};

main(spec, import.meta.url);
