/* lens.mjs — the one implementation of "what does this lens hide".
 *
 * Three consumers read the same rules: the reader (`kb.mjs get --level`), the
 * checker (`lensProblems`, which asks whether a block survives each lens) and the
 * QA script (`report-lens.mjs`, which weighs each lens in words). They must agree,
 * because a page is sized against what the reader shows and gated on what the
 * checker sees.
 *
 * Two authored semantics, never both on one element:
 *   data-kb-level    accretion — visible from this level UP. Untagged is the basic
 *                    core, so a higher lens only ever ADDS. This is the mechanism.
 *   data-kb-register variant — rendered at EXACTLY this lens. Rare: only where
 *                    showing both versions at once would be wrong.
 */
import { LEVELS } from "./model.mjs";

/** Accretion: an untagged element is universal; a tagged one shows from its level up. */
export const visibleAt = (elLevel, lens) =>
  !elLevel || LEVELS.indexOf(elLevel) <= LEVELS.indexOf(lens);

/** Variant: an unregistered element is universal. With no lens requested (the editor
 *  view) every rung stays, which is what makes `kb.mjs get` without --level show all. */
export const registerVisible = (elReg, lens) => !elReg || !lens || elReg === lens;

/** Prune everything `lens` would hide — both semantics — under `scope`, in place. */
export function pruneForLens(scope, lens) {
  if (!lens) return;
  for (const n of scope.querySelectorAll("[data-kb-level]")) {
    if (n.getAttribute("data-kb-block")) continue; // section stamps are retired; ignore
    if (!visibleAt(n.getAttribute("data-kb-level"), lens)) n.remove();
  }
  for (const n of scope.querySelectorAll("[data-kb-register]")) {
    if (!registerVisible(n.getAttribute("data-kb-register"), lens)) n.remove();
  }
}
