// Flat config. Three shared configs, and every deviation below has its reason
// on the line above it — a rule invented without one does not belong here.
//
// eslint-plugin-astro brings its own parser wiring for `.astro` files; the
// type-checked typescript-eslint config is what makes `astro check`'s
// strictness visible to the linter on everything else.
//
// eslint-plugin-jsx-a11y is NOT installed. It is an optional peer of
// eslint-plugin-astro, and its own peer range stops at ESLint 9 while
// eslint-plugin-astro 3 requires ESLint 10 — so the two cannot both be
// be installed together. The consequence is that the plugin's a11y rules are
// absent; accessibility stays a review concern here until that range moves.
import js from '@eslint/js';
import { defineConfig } from 'eslint/config';
import astro from 'eslint-plugin-astro';
import globals from 'globals';
import tseslint from 'typescript-eslint';

export default defineConfig(
  {
    // Build output, Astro's generated types, the bundle esbuild writes, the
    // coverage report — and, until the P5 cutover, the HTML site's own scripts
    // in assets/, which are the source of the pages beside this workspace.
    ignores: ['dist/**', '.astro/**', 'public/kb.js', 'coverage/**', 'assets/**'],
  },
  js.configs.recommended,
  tseslint.configs.recommendedTypeChecked,
  astro.configs.recommended,
  {
    languageOptions: {
      parserOptions: {
        projectService: true,
        tsconfigRootDir: import.meta.dirname,
        extraFileExtensions: ['.astro'],
      },
    },
  },
  {
    // The config files run in Node, not in the browser or in Astro's program.
    files: ['*.config.{js,mjs,ts}'],
    languageOptions: { globals: globals.node },
    extends: [tseslint.configs.disableTypeChecked],
  },
  {
    // Type-aware rules off inside .astro templates. astro-eslint-parser cannot
    // give the template expressions real types — every `{items.map(…)}` comes
    // back as the `error` type and trips no-unsafe-return — and `astro check`
    // already type-checks these files properly, with the Astro compiler rather
    // than a parser approximating it. Leaving the rules on would mean a wall of
    // eslint-disable comments guarding nothing.
    files: ['**/*.astro'],
    extends: [tseslint.configs.disableTypeChecked],
  },
);
