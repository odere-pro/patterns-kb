/* theme.js — light/dark toggle. Loaded synchronously in <head> so the stored
   choice applies before first paint (no flash). Injects its button at runtime,
   so pages carry no theme markup. Cycles auto → light → dark, persists in
   localStorage, and announces changes via a "kb-theme-change" event. */
(function () {
  "use strict";
  var KEY = "kb-theme";
  var root = document.documentElement;
  var GLYPHS = { auto: "◐", light: "○", dark: "●" };
  var ORDER = ["auto", "light", "dark"];

  var stored = null;
  try { stored = localStorage.getItem(KEY); } catch (e) { /* private mode */ }
  if (stored === "light" || stored === "dark") root.dataset.theme = stored;

  function current() {
    var t = root.dataset.theme;
    return t === "light" || t === "dark" ? t : "auto";
  }

  function paint(btn, mode) {
    var label = "Theme: " + mode;
    btn.setAttribute("aria-label", label);
    btn.title = label;
    btn.textContent = GLYPHS[mode];
  }

  function apply(mode) {
    if (mode === "auto") delete root.dataset.theme;
    else root.dataset.theme = mode;
    try {
      if (mode === "auto") localStorage.removeItem(KEY);
      else localStorage.setItem(KEY, mode);
    } catch (e) { /* ignore */ }
    var btn = document.querySelector(".theme-toggle");
    if (btn) paint(btn, mode);
    document.dispatchEvent(new CustomEvent("kb-theme-change", { detail: { theme: mode } }));
  }

  document.addEventListener("DOMContentLoaded", function () {
    var btn = document.createElement("button");
    btn.type = "button";
    btn.className = "theme-toggle";
    paint(btn, current());
    btn.addEventListener("click", function () {
      apply(ORDER[(ORDER.indexOf(current()) + 1) % ORDER.length]);
    });
    document.body.appendChild(btn);
  });
})();
