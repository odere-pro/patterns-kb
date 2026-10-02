// Rendering a `.astro` component from a `.ts` test, in one place.
//
// Two problems, both about types rather than about rendering, and both worth
// solving once instead of in every `*.render.test.ts`.
//
// TypeScript has no declaration for a `.astro` module imported from a `.ts`
// file — inside `.astro` and `.mdx` the language server types those imports
// precisely, and `astro check` is what holds component props to their interface,
// but from here the import is untyped. So a cast is unavoidable. What it must
// NOT be is a global `declare module '*.astro'`, which would replace the
// language server's per-component prop types everywhere with one loose factory
// and quietly take `astro check` off the props it exists to check.
//
// And the type to cast to is not public: `renderToString` takes an
// `AstroComponentFactory` from `astro/dist/runtime/server/index.js`, a path
// inside the package. Deriving the parameter type off the public method keeps
// the reach-in out of the tree — if Astro renames or moves that type, this
// follows it for free.
import { experimental_AstroContainer as AstroContainer } from 'astro/container';

/** Whatever `renderToString` accepts, named without reaching into astro/dist. */
type Renderable = Parameters<AstroContainer['renderToString']>[0];

type RenderOptions = Parameters<AstroContainer['renderToString']>[1];

/**
 * Render one component to a string.
 *
 * A fresh container per call: `AstroContainer.create()` is cheap next to the
 * `.astro` transform vitest has already cached, and a shared one would let a
 * test's manifest leak into the next.
 *
 * Every caller needs `// @vitest-environment node` on its first line. Under the
 * suite's default `happy-dom`, vitest resolves the `.astro` import through
 * Astro's *client* transform, the default export arrives without
 * `isAstroComponentFactory` on it, and the container reports "no valid renderer
 * was found for this file extension" — a message about renderers for a problem
 * about environments.
 */
export async function renderComponent(
  component: unknown,
  options: RenderOptions = {},
): Promise<string> {
  const container = await AstroContainer.create();
  return container.renderToString(component as Renderable, options);
}
