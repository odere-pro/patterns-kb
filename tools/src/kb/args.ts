/**
 * The argument rules scripts/kb.mjs has always used, kept byte for byte so
 * every invocation a skill or agent types means the same thing to v2:
 *
 *   --json, --diagrams     boolean flags
 *   --<name> <value>       every other flag takes the next argument as its value
 *   a positional           any argument that is not a flag and not a flag's value
 *
 * A value-taking flag given last has no value: `opt` answers null.
 */

export const BOOL_FLAGS: ReadonlySet<string> = new Set(['json', 'diagrams']);

export interface Args {
  readonly argv: readonly string[];
  readonly positional: readonly string[];
  flag(name: string): boolean;
  opt(name: string): string | null;
}

export function parseArgs(argv: readonly string[]): Args {
  const positional = argv.filter((a, i) => {
    if (a.startsWith('--')) return false;
    const prev = i > 0 ? (argv[i - 1] as string) : '';
    return !(prev.startsWith('--') && !BOOL_FLAGS.has(prev.slice(2)));
  });
  return {
    argv,
    positional,
    flag: (name) => argv.includes(`--${name}`),
    opt: (name) => {
      const i = argv.indexOf(`--${name}`);
      return i < 0 ? null : (argv[i + 1] ?? null);
    },
  };
}
