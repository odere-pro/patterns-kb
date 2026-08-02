/* kb.js — the one script every page loads, and the manifest of every script it pulls in.
 *
 * A page's entire asset wiring is two tags, both emitted into a `kb:generated` region:
 *
 *   <link rel="stylesheet" href="../assets/kb-page.css">
 *   <script src="../assets/kb.js" data-profile="pattern"></script>
 *
 * and nothing at the body end. Adding a client script is one entry in the tables below;
 * it used to be a sweep across 386 pages, which is how the authored tags drifted into
 * nine different shapes and fifty-three pages silently lost favourites.js.
 *
 * TWO LOADING PHASES, and the split is the whole design:
 *
 *   PRE   parser-blocking, written without `defer`. theme.js and lens.js stamp the stored
 *         theme and reading level on <html> BEFORE FIRST PAINT — deferring them shows the
 *         reader a flash of the wrong theme, or of prose at the wrong lens.
 *   TAIL  written WITH `defer`, so the browser downloads them in parallel and executes
 *         them in this order after parsing and before DOMContentLoaded. That is exactly
 *         what a run of blocking tags at the body end did, minus the blocking: every one
 *         of these scripts queries the DOM at top level and all of them still see a
 *         complete document.
 *
 * document.write is the mechanism because a written tag is PARSER-inserted, and only a
 * parser-inserted script honours `defer` — an element appended with appendChild ignores
 * it and runs the moment it loads, which for these scripts is a race against the body.
 * The readyState guard below keeps that call unreachable after load, where document.write
 * would blow the document away.
 *
 * Ships as a plain script, like everything else here: fetch() and modules are awkward on
 * file://, and the site must work by double-clicking a page. The manifest is exported as
 * KB_ASSETS so scripts/audit-assets.mjs and the tests can read it without a DOM.
 */
(function (root) {
  "use strict";

  /* Every kind may carry a diagram: hazards and themes already do, and nothing stops a
   * principle or a capability page gaining one. Loading the engine where no diagram
   * happens to exist today costs a cached file; NOT loading it where one appears
   * tomorrow renders the mermaid source as text. */
  var BASE = [
    "vendor/mermaid.min.js",
    "diagram.js",
    /* Decorates the same <figure class="diagram"> elements and listens for the
     * kb-diagram-render event diagram.js fires, so it must load after it. Gives every
     * figure a fit-by-default zoom, a pan and a full-screen viewer — a board drawn to fit
     * a column had no way to be read, and a schema drawn at natural size no way to be
     * seen whole. */
    "diagram-zoom.js",
    "progress.js",
    "favourites.js",
    /* Injects the left-edge next-section control, and suppresses itself on a page short
     * enough to scroll — which is why this is uniform rather than per kind. Measured at
     * 1440×900, a 7-block capability page runs to 8.6 viewports and an 8-block pattern to
     * 4.3, so page length does not follow kind and a per-kind list would guess wrong in
     * both directions. */
    "section-nav.js",
    /* The ⌘K palette, and the two files it reads rather than duplicates: catalog.js is the
     * data and search.js exposes window.KB_MATCHES, so the palette's ranking IS the hub's.
     * This trio is order-dependent — the third needs the first two on window — and appears
     * in every profile below, because "jump to any page from any page" does not vary by
     * kind. search.js mounts its own hub UI only where it finds `.controls`, so it is
     * inert on a content page. */
    "catalog.js",
    "search.js",
    "palette.js",
  ];
  /* Syntax highlighting, only where a collapsed code sketch can appear: a pattern's
   * `sketch` block, and a design's HTTP contracts and deep-dive samples. No page of any
   * other kind carries `details.sketch`, and the loader is inert without one. */
  var CODE = ["vendor/highlight.min.js", "sketch.js"];

  /* Keyed by `data-profile`. The seven content kinds are the page's own data-kb-kind; the
   * four generated pages take a name of their own because their shape is not a kind. */
  var PROFILES = {
    pattern:    { pre: ["theme.js", "lens.js"], tail: BASE.concat(CODE) },
    design:     { pre: ["theme.js", "lens.js"], tail: BASE.concat(CODE) },
    hazard:     { pre: ["theme.js", "lens.js"], tail: BASE },
    theme:      { pre: ["theme.js", "lens.js"], tail: BASE },
    principle:  { pre: ["theme.js", "lens.js"], tail: BASE },
    capability: { pre: ["theme.js", "lens.js"], tail: BASE },
    comparison: { pre: ["theme.js", "lens.js"], tail: BASE },

    /* The hub renders tiles rather than blocks: no diagram, no section-nav, and
     * collapse.js for its foldable sections. */
    hub: {
      pre: ["theme.js", "lens.js"],
      tail: ["catalog.js", "collapse.js", "search.js", "palette.js", "progress.js", "favourites.js"],
    },
    /* vocab.js is PRE for the same reason theme.js is: it stamps the stored mode on
     * <html>, so a reader who left in A-Z does not watch the grouped view reflow away. */
    vocab: { pre: ["theme.js", "vocab.js"], tail: ["catalog.js", "search.js", "palette.js"] },
    /* No lens.js on either map page: neither carries leveled prose, so the reading-level
     * toggle would render three dead buttons. graph-core.js loads before graph-view.js —
     * the runtime bails out without it. */
    graph: {
      pre: ["theme.js"],
      tail: ["catalog.js", "graphdata.js", "search.js", "palette.js",
             "vendor/d3.min.js", "graph-core.js", "graph-view.js"],
    },
    stack: { pre: ["theme.js"], tail: ["catalog.js", "search.js", "palette.js"] },
  };

  root.KB_ASSETS = { profiles: PROFILES, base: BASE, code: CODE };

  /* Everything above is data, so audit-assets.mjs and the tests load this file in Node
   * and read KB_ASSETS. Everything below needs a document. */
  if (typeof document === "undefined") return;

  var el = document.currentScript;
  if (!el) return;

  /* The src ATTRIBUTE, not the resolved .src: it is already page-relative
   * ("../../assets/kb.js"), which is the prefix every injected tag needs and the one
   * palette.js needs to resolve a catalog path. Deriving it here is what lets one file
   * serve four `../` depths with no build-time global. */
  var PREFIX = String(el.getAttribute("src") || "").replace(/assets\/kb\.js$/, "");
  var profile = PROFILES[el.getAttribute("data-profile")];
  root.KB_PREFIX = PREFIX;
  if (!profile) return;

  function url(src) { return PREFIX + "assets/" + src; }

  if (document.readyState === "loading") {
    var html = "";
    for (var i = 0; i < profile.pre.length; i++) {
      html += '<script src="' + url(profile.pre[i]) + '"><\/script>';
    }
    for (var j = 0; j < profile.tail.length; j++) {
      html += '<script defer src="' + url(profile.tail[j]) + '"><\/script>';
    }
    document.write(html);
    return;
  }

  /* Unreachable from the parser-blocking head tag this file is loaded by, and here so
   * that a future caller cannot document.write into a finished document. Appended
   * elements ignore `defer`, so async=false is what keeps them in order. */
  var all = profile.pre.concat(profile.tail);
  for (var k = 0; k < all.length; k++) {
    var s = document.createElement("script");
    s.src = url(all[k]);
    s.async = false;
    document.head.appendChild(s);
  }
})(typeof window !== "undefined" ? window : this);
