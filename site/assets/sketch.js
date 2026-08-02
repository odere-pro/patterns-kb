/* sketch.js — syntax-highlight code sketches with the locally-vendored highlight.js, and
   give a block full of them one control instead of one click per sketch.
   Load AFTER vendor/highlight.min.js. Highlights lazily, on first open of each sketch.

   SKETCHES ARE COLLAPSED BY DEFAULT. That is authored in the markup, not decided here — a
   design's entities block runs to sixteen schemas and its interface block to eleven
   contracts, and opening all of them pushes the argument off the page. So every section
   holding two or more sketches gets an injected Expand all / Collapse all toggle, and
   printing opens the lot regardless, because a printed page has nothing to click.

   The toggle is INJECTED rather than authored: the alternative is a markup sweep across
   every pattern and design page for a control that is pure presentation. */
(function () {
  "use strict";
  if (typeof hljs === "undefined") return;

  /* One bad sketch used to take the rest of the page with it. hljs.highlightElement THROWS
     on a language it has no grammar for — it does not fall back to plain text — and this
     ran inside a bare forEach, so the first `sql` sketch aborted the loop and every sketch
     after it never even got its listener. `make check` now gates the vendored grammar set
     against SKETCH_LANGS (scripts/audit-highlight.mjs), which should make this unreachable;
     it stays because it was reachable for the whole life of the corpus. */
  function paint(code) {
    if (!code) return;
    try { hljs.highlightElement(code); }
    catch (e) {
      if (window.console) console.warn("sketch.js: no grammar for", code.getAttribute("data-kb-lang"), e);
    }
  }

  // Code visible on load (e.g. a schema outside a sketch) is highlighted eagerly.
  var visible = document.querySelectorAll("pre code[data-kb-lang]");
  Array.prototype.forEach.call(visible, function (code) {
    if (!code.closest("details.sketch")) paint(code);
  });

  var sketches = document.querySelectorAll("details.sketch");
  Array.prototype.forEach.call(sketches, function (details) {
    var done = false;
    var lazy = function () {
      if (done || !details.open) return;
      done = true;
      paint(details.querySelector("pre code[data-kb-lang]"));
    };
    details.addEventListener("toggle", lazy);
    if (details.open) lazy();
  });

  /* ---- the per-section Expand all / Collapse all ---- */

  /* Injected AFTER the section's h2, never inside it: section-nav.js finds a section's
     heading with `querySelector('h2')`, and progress.js and lens.js key off their own
     attributes, so a sibling div is invisible to all three. */
  function mount(section) {
    var own = section.querySelectorAll("details.sketch");
    if (own.length < 2) return;
    var heading = section.querySelector("h2.doc-h");
    if (!heading) return;

    var wrap = document.createElement("div");
    wrap.className = "sketch-controls";
    var btn = document.createElement("button");
    btn.type = "button";
    btn.className = "sketch-toggle";
    wrap.appendChild(btn);
    heading.insertAdjacentElement("afterend", wrap);

    /* The label answers "what happens if I press this", so it names the action rather than
       the state: anything still closed means there is something left to expand. The count
       and the chevron are what make it read as a control over the cards below rather than
       as a stray chip — the chevron is the one the summaries already carry. */
    var anyClosed = function () {
      return Array.prototype.some.call(own, function (d) { return !d.open; });
    };
    var label = function () {
      var expand = anyClosed();
      btn.textContent = (expand ? "▸ Expand all " : "▾ Collapse all ") + own.length;
      btn.setAttribute("aria-expanded", expand ? "false" : "true");
    };
    btn.addEventListener("click", function () {
      var open = anyClosed();
      Array.prototype.forEach.call(own, function (d) { d.open = open; });
      label();
    });
    /* A sketch opened on its own keeps the button honest. `toggle` fires asynchronously,
       so this cannot be folded into the click handler above. */
    Array.prototype.forEach.call(own, function (d) { d.addEventListener("toggle", label); });
    label();
  }

  Array.prototype.forEach.call(document.querySelectorAll("section.doc-section"), mount);

  /* Print opens everything and puts it back. A reader printing a design page wants the
     schemas, and there is no click on paper. Restoring from a snapshot rather than closing
     everything keeps whatever the reader had already opened. */
  var before = null;
  window.addEventListener("beforeprint", function () {
    before = [];
    Array.prototype.forEach.call(sketches, function (d) {
      before.push(d.open);
      d.open = true;
    });
  });
  window.addEventListener("afterprint", function () {
    if (!before) return;
    Array.prototype.forEach.call(sketches, function (d, i) { d.open = before[i]; });
    before = null;
  });
})();
