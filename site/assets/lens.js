/* lens.js — the reading-level lens: basic / advanced / expert. Loaded synchronously
   in <head> so the stored choice applies before first paint (no flash). Injects its
   control at runtime, so pages carry no lens markup. data-kb-level on an element
   means "visible from this level up"; the hiding itself is pure CSS keyed off
   <html data-lens="…">. Expert is the default — everything visible, no attribute,
   no stored key. Announces changes via a "kb-lens-change" event (diagram.js listens,
   so a mermaid figure revealed by the lens re-renders at real size). */
(function () {
  "use strict";
  var KEY = "kb-lens";
  var root = document.documentElement;
  var ORDER = ["basic", "advanced", "expert"];
  var LABELS = { basic: "Basic", advanced: "Advanced", expert: "Expert" };

  var stored = null;
  try { stored = localStorage.getItem(KEY); } catch (e) { /* private mode */ }
  if (stored === "basic" || stored === "advanced") root.dataset.lens = stored;

  function current() {
    var l = root.dataset.lens;
    return l === "basic" || l === "advanced" ? l : "expert";
  }

  function paint(btn, level) {
    var label = "Reading level: " + LABELS[level];
    btn.setAttribute("aria-label", label);
    btn.title = label;
    btn.textContent = LABELS[level];
  }

  function apply(level) {
    if (level === "expert") delete root.dataset.lens;
    else root.dataset.lens = level;
    try {
      if (level === "expert") localStorage.removeItem(KEY);
      else localStorage.setItem(KEY, level);
    } catch (e) { /* ignore */ }
    var btn = document.querySelector(".lens-toggle");
    if (btn) paint(btn, level);
    document.dispatchEvent(new CustomEvent("kb-lens-change", { detail: { level: level } }));
  }

  document.addEventListener("DOMContentLoaded", function () {
    var btn = document.createElement("button");
    btn.type = "button";
    btn.className = "lens-toggle";
    paint(btn, current());
    btn.addEventListener("click", function () {
      apply(ORDER[(ORDER.indexOf(current()) + 1) % ORDER.length]);
    });
    document.body.appendChild(btn);
  });
})();
