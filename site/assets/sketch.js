/* sketch.js — syntax-highlight code sketches with the locally-vendored highlight.js.
   Load AFTER vendor/highlight.min.js. Highlights lazily, on first open of each sketch. */
(function () {
  "use strict";
  if (typeof hljs === "undefined") return;

  // Code visible on load (e.g. entity schemas) is highlighted eagerly.
  var visible = document.querySelectorAll("pre code[data-kb-lang]");
  Array.prototype.forEach.call(visible, function (code) {
    if (!code.closest("details.sketch")) hljs.highlightElement(code);
  });

  var sketches = document.querySelectorAll("details.sketch");
  Array.prototype.forEach.call(sketches, function (details) {
    var done = false;
    var highlight = function () {
      if (done || !details.open) return;
      done = true;
      var code = details.querySelector("pre code[data-kb-lang]");
      if (code) hljs.highlightElement(code);
    };
    details.addEventListener("toggle", highlight);
    if (details.open) highlight();
  });
})();
