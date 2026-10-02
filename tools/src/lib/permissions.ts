/**
 * The shell commands a harness file names, and whether the permission allow
 * list covers each (spec: kb.harness.self-check, self-check-C10).
 *
 * A skill that tells a session to run a command the allow list does not hold
 * stops that session on a permission prompt. Some commands keep that prompt on
 * purpose — a write, or one that runs whatever it is handed — and those are
 * written down with their reason. So every command a harness file names is
 * either allowed or on that written list; this module reads both and says
 * which named commands are on neither.
 *
 *   where      a line of a fenced block labelled `bash`, `sh`, `shell`, `zsh`
 *              or `console` — its first word is a program whatever it is, as
 *              the shell would run it; a line of an unlabelled fence, or an
 *              inline code span, when its first word is in `PROGRAMS` (an
 *              unlabelled fence also holds trees and output, and a span also
 *              holds names). A fence labelled anything else (`text`, `json`,
 *              `js`) is not shell and is not read.
 *   a command  each such line or span, cut at `&&`, `||`, `;`, `|` and
 *              parentheses outside quotes, a `#` comment dropped. Leading
 *              `VAR=value` words and a `$ ` prompt are read past; shell syntax
 *              and state (`cd`, `export`, `if`, `done`, …) name no program.
 *              In a fence, a line ending in `\` runs on into the next, the
 *              body of a `<<WORD` heredoc is data up to its `WORD` line, and a
 *              quote left open runs on until it closes: none of those lines
 *              starts a command. A command is cut at its first placeholder
 *              (`<name>`, `…`, `...`); what is left is the known start of a
 *              command whose end the reader fills in, and a lone program word
 *              left before one (`rm <file>`) still counts. A placeholder inside
 *              a word (`scripts/<name>.mjs`) keeps the word's start: a path
 *              template, naming a family of commands. A lone program word with
 *              nothing cut (`grep` in prose) names a tool, not a command.
 *   allowed    an allow entry `Bash(x:*)` covers a command that is `x` or
 *              starts with `x ` or `x/`; `Bash(x)` covers exactly `x`. The
 *              runtime's own rule, as its docs state it. A command cut at a
 *              placeholder has an end nobody wrote down, so only an `x:*`
 *              entry can cover it, never an exact one; a path template is
 *              covered when an allow entry is one of its family.
 *   kept       a prompt-kept prefix covers a command the same way `x:*` does.
 */

/** The first words read as programs in an unlabelled fence or a code span; there any other word is prose. */
export const PROGRAMS: ReadonlySet<string> = new Set([
  'awk', 'bash', 'bun', 'cat', 'chmod', 'chown', 'comm', 'cp', 'curl', 'cut', 'deno', 'diff', 'docker', 'du',
  'echo', 'find', 'gh', 'git', 'grep', 'head', 'jq', 'ln', 'ls', 'make', 'mkdir', 'mv', 'node', 'npm', 'npx',
  'perl', 'pnpm', 'printf', 'python', 'python3', 'rg', 'rm', 'rmdir', 'rsync', 'sed', 'sh', 'sort', 'tail',
  'tar', 'tee', 'touch', 'tr', 'tsc', 'tsx', 'uniq', 'vitest', 'wc', 'wget', 'xargs', 'yarn', 'zsh',
]);

/** Shell syntax and shell state: a first word here names no program. */
export const SHELL_WORDS: ReadonlySet<string> = new Set([
  '!', '.', ':', '[', '[[', ']]', '{', '}', 'break', 'case', 'cd', 'continue', 'do', 'done', 'elif', 'else',
  'esac', 'exit', 'export', 'false', 'fi', 'for', 'function', 'if', 'in', 'local', 'popd', 'pushd', 'read',
  'return', 'set', 'shift', 'source', 'then', 'trap', 'true', 'unset', 'until', 'wait', 'while',
]);

/** Fence labels read as shell: every line's first word is a program. */
const SHELL_FENCE = /^(?:bash|sh|shell|zsh|console)$/;
const FENCE = /^[ \t]*(`{3,}|~{3,})[ \t]*([\w-]*)/;
const ENV = /^[A-Za-z_][A-Za-z0-9_]*=\S*$/;
/** A word the reader fills in: `<name>`, `…` or `...`. A bare `<` or `>` is a redirect, not a placeholder. */
const PLACEHOLDER = /<[^<>\s]*>|…|\.\.\./;
/** A word that can start a command: a name or a path, never a flag, a quote or an expansion. */
const PROGRAM_WORD = /^[A-Za-z0-9_./][\w.+/-]*$/;
const HEREDOC = /<<-?[ \t]*(['"]?)([A-Za-z_]\w*)\1/;

/** One command as a file names it. */
export interface Named {
  /** The 1-based line of its first mention. */
  line: number;
  /** Whether a mention was cut at a placeholder, so only an `x:*` entry can cover it. */
  cut: boolean;
  /** Whether it ends inside a path template, so it names a family of commands. */
  template: boolean;
}

/** One piece's command: its words, one space apart, and whether a placeholder cut it. */
export interface Command {
  cmd: string;
  /** A placeholder cut it: the reader writes its end. */
  cut: boolean;
  /** The placeholder sat inside a word (`scripts/<name>.mjs`): `cmd` ends with that word's start. */
  template: boolean;
}

/**
 * `line` cut into its pieces at `&&`, `||`, `;`, `|` and the parentheses of a
 * subshell, quotes respected; a `#` that starts a word ends the line.
 */
export function pieces(line: string): string[] {
  const out: string[] = [];
  let cur = '';
  let quote: string | null = null;
  for (let i = 0; i < line.length; i += 1) {
    const c = line[i] as string;
    if (quote !== null) {
      if (c === quote) quote = null;
      cur += c;
    } else if (c === '"' || c === "'") {
      quote = c;
      cur += c;
    } else if (c === '#' && (i === 0 || /\s/.test(line[i - 1] as string))) {
      break;
    } else if (c === ';' || c === '|' || c === '(' || c === ')' || (c === '&' && line[i + 1] === '&')) {
      out.push(cur);
      cur = '';
      if (line[i + 1] === c) i += 1;
    } else {
      cur += c;
    }
  }
  out.push(cur);
  return out.map((p) => p.trim()).filter((p) => p !== '');
}

/**
 * The quote still open at the end of `line`, given the one open at its start
 * (null for none). A `#` that starts a word outside quotes ends the line.
 */
export function quoteAfter(line: string, open: string | null): string | null {
  let quote = open;
  for (let i = 0; i < line.length; i += 1) {
    const c = line[i] as string;
    if (quote !== null) {
      if (c === quote) quote = null;
    } else if (c === '"' || c === "'") {
      quote = c;
    } else if (c === '#' && (i === 0 || /\s/.test(line[i - 1] as string))) {
      break;
    }
  }
  return quote;
}

/**
 * The command one piece names, or null when it names none. With `anyProgram`
 * (a shell fence) any first word that can start a command is a program;
 * without it (an unlabelled fence or a span) the first word must be in
 * `PROGRAMS`.
 */
export function commandOf(piece: string, anyProgram = false): Command | null {
  const words = piece.replace(/^\$ /, '').split(/\s+/).filter((w) => w !== '');
  while (words.length > 0 && ENV.test(words[0] as string)) words.shift();
  const first = words[0] ?? '';
  if (SHELL_WORDS.has(first) || !PROGRAM_WORD.test(first)) return null;
  if (!anyProgram && !PROGRAMS.has(first)) return null;
  const at = words.findIndex((w) => PLACEHOLDER.test(w));
  if (at === 0) return null;
  if (at === -1) return words.length > 1 ? { cmd: words.join(' '), cut: false, template: false } : null;
  const word = words[at] as string;
  const head = word.slice(0, PLACEHOLDER.exec(word)?.index ?? 0);
  const kept = words.slice(0, at);
  if (head !== '') return { cmd: [...kept, head].join(' '), cut: true, template: true };
  return { cmd: kept.join(' '), cut: true, template: false };
}

/** Every command `text` names, each with the line of its first mention and whether any mention was cut. */
export function namedCommands(text: string): Map<string, Named> {
  const out = new Map<string, Named>();
  const add = (source: string, line: number, anyProgram: boolean): void => {
    for (const p of pieces(source)) {
      const c = commandOf(p, anyProgram);
      if (c === null) continue;
      const seen = out.get(c.cmd);
      if (seen === undefined) out.set(c.cmd, { line, cut: c.cut, template: c.template });
      else seen.cut ||= c.cut;
    }
  };
  let open: { run: string; label: string } | null = null;
  /** Inside a fence: the heredoc terminator awaited, the quote left open, and whether the last line ran on. */
  let heredoc: string | null = null;
  let quote: string | null = null;
  let runOn = false;
  text.split('\n').forEach((line, i) => {
    const m = FENCE.exec(line);
    if (open === null) {
      if (m !== null) {
        open = { run: m[1] as string, label: m[2] as string };
        heredoc = null;
        quote = null;
        runOn = false;
        return;
      }
      for (const span of line.matchAll(/`([^`\n]+)`/g)) add(span[1] as string, i + 1, false);
      return;
    }
    const run = m?.[1];
    if (run !== undefined && run[0] === open.run[0] && run.length >= open.run.length && line.trim() === run) {
      open = null;
      return;
    }
    const shell = SHELL_FENCE.test(open.label);
    if (!shell && open.label !== '') return;
    if (heredoc !== null) {
      if (line.trim() === heredoc) heredoc = null;
      return;
    }
    const continues = quote !== null || runOn;
    // An unlabelled fence also holds trees and output: a line there starts no
    // command, and opens no quote, unless its first word is a known program.
    const first = line.trim().replace(/^\$ /, '').split(/\s+/)[0] ?? '';
    if (!continues && !shell && !PROGRAMS.has(first)) return;
    quote = quoteAfter(line, quote);
    runOn = quote === null && /\\$/.test(line);
    if (continues || line.trimStart().startsWith('#')) return;
    heredoc = HEREDOC.exec(line)?.[2] ?? null;
    add(line.replace(/\\$/, ''), i + 1, shell);
  });
  return out;
}

/** The Bash patterns of a parsed settings file's `permissions.allow`, parentheses stripped. */
export function bashAllows(settings: unknown): string[] {
  const allow = (settings as { permissions?: { allow?: unknown } } | null)?.permissions?.allow;
  if (!Array.isArray(allow)) return [];
  return allow.flatMap((e) => {
    const m = typeof e === 'string' ? /^Bash\((.+)\)$/.exec(e) : null;
    return m === null ? [] : [m[1] as string];
  });
}

/** Whether `cmd` is `prefix` or starts with it as a whole word or a path. */
export function startsWithWord(cmd: string, prefix: string): boolean {
  return cmd === prefix || cmd.startsWith(`${prefix} `) || cmd.startsWith(`${prefix}/`);
}

/** How a named command was cut: not at all, at a whole placeholder word, or inside a path template. */
export type Cut = Pick<Named, 'cut' | 'template'>;

const WHOLE: Cut = { cut: false, template: false };

/**
 * Whether one allow pattern (`x:*` or an exact `x`) covers `cmd`. A `cut`
 * command's end is unknown, so an exact pattern never covers it. A path
 * template (`node scripts/` from `node scripts/<name>.mjs`) names a family,
 * and a pattern covers it when the pattern is one of its members.
 */
export function allows(pattern: string, cmd: string, how: Cut = WHOLE): boolean {
  const wild = pattern.endsWith(':*');
  const base = wild ? pattern.slice(0, -2) : pattern;
  if (wild && startsWithWord(cmd, base)) return true;
  if (how.template) return base.startsWith(cmd);
  return !wild && !how.cut && cmd === pattern;
}

/** The first allow pattern or prompt-kept prefix that covers `cmd`, or null. */
export function coverOf(cmd: string, allowed: readonly string[], kept: readonly string[], how: Cut = WHOLE): string | null {
  const a = allowed.find((p) => allows(p, cmd, how));
  if (a !== undefined) return `Bash(${a})`;
  return kept.find((k) => startsWithWord(cmd, k)) ?? null;
}

/**
 * The first of `writes` that allow pattern `pattern` lets run with no prompt,
 * or null: the pattern starts with the write (`rm -rf x`, `git push:*`), or
 * its wildcard reaches it (`git:*` reaches `git push`).
 */
export function reachedWrite(pattern: string, writes: readonly string[]): string | null {
  const wild = pattern.endsWith(':*');
  const base = wild ? pattern.slice(0, -2) : pattern;
  return writes.find((w) => startsWithWord(base, w) || (wild && startsWithWord(w, base))) ?? null;
}
