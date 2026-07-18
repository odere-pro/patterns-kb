/* Favourites filter — shows only pages whose metadata declares
 * data-kb-favourite="true" (rendered by build-hub as .chip[data-fav]).
 *
 * This is a pure view filter over authored data. It is NOT the Practiced
 * tracker: it never reads or writes localStorage and shares no state with
 * progress.js. Favourite is fixed page metadata, the same for every visitor;
 * Practiced is per-user progress. Keeping them separate is deliberate. */
(function () {
  "use strict";
  var btn = document.getElementById("fav-filter-btn");
  if (!btn) return;

  // Nothing marked favourite yet → hide the control rather than offer an
  // empty filter.
  if (!document.querySelector('.chip[data-fav]')) {
    btn.hidden = true;
    return;
  }

  btn.addEventListener("click", function () {
    var on = document.body.classList.toggle("fav-only");
    btn.setAttribute("aria-pressed", on ? "true" : "false");
  });
})();
