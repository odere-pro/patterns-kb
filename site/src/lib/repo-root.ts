// The repository a build runs in, for a component that reads docs/ at build
// time (MentionedBy, StackIndex).
//
// Not from `import.meta.url`: Astro bundles a component before it runs it, so
// the module's own address is a chunk under the build folder, not its source.
// The build runs from site/ (`npm run build`), the sandbox build from its
// checkout's site/, and vitest from site/ too; the root is the nearest folder
// at or above the working directory that holds the structure file.
import fs from 'node:fs';
import path from 'node:path';

export const STRUCTURE_FILE = 'docs/data/site-structure.json';

export function repoRoot(from: string = process.cwd()): string {
  for (let at = path.resolve(from); ; at = path.dirname(at)) {
    if (fs.existsSync(path.join(at, STRUCTURE_FILE))) return at;
    if (path.dirname(at) === at)
      throw new Error(
        `no ${STRUCTURE_FILE} at or above ${from}: the site builds inside the repository`,
      );
  }
}
