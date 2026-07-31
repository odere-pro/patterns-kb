/* diagram.js — initialize the locally-vendored mermaid, themed from the active palette.
   Load AFTER vendor/mermaid.min.js. Renders every <pre class="mermaid"> / .mermaid block
   the reading-level lens currently shows, and re-renders with fresh palette values when
   the theme changes (toggle or OS) or the lens reveals more. */
(function () {
  "use strict";
  if (typeof mermaid === "undefined") return;

  var blocks = document.querySelectorAll(".mermaid");
  Array.prototype.forEach.call(blocks, function (el) {
    if (!el.dataset.src) el.dataset.src = el.textContent;
  });

  /* A block the lens hides has no box to measure, and mermaid renders it as its
     "Syntax error in text" placeholder instead of the diagram. Render only what is
     laid out; kb-lens-change renders the rest at the moment the lens reveals them. */
  function laidOut(el) {
    return el.getClientRects().length > 0;
  }

  function warn(e) {
    if (window.console) console.warn("mermaid render failed:", e);
  }

  function render() {
    var css = getComputedStyle(document.documentElement);
    var v = function (name, fallback) {
      var got = css.getPropertyValue(name);
      return (got && got.trim()) || fallback;
    };

    var ink = v("--ink", "#14202E");
    var inkSoft = v("--ink-soft", "#51606F");
    var line = v("--line", "#C7D2DE");
    var accent = v("--accent", "#1D5FA8");
    var accentSoft = v("--accent-soft", "#E3ECF6");
    var paperRaised = v("--paper-raised", "#FFFFFF");

    mermaid.initialize({
      startOnLoad: false,
      securityLevel: "strict",
      theme: "base",
      fontFamily: '"JetBrains Mono", ui-monospace, "SF Mono", Menlo, Consolas, monospace',
      themeVariables: {
        background: paperRaised,
        primaryColor: accentSoft,
        primaryBorderColor: accent,
        primaryTextColor: ink,
        secondaryColor: paperRaised,
        secondaryBorderColor: line,
        tertiaryColor: paperRaised,
        tertiaryBorderColor: line,
        lineColor: inkSoft,
        textColor: ink,
        mainBkg: accentSoft,
        nodeBorder: accent,
        clusterBkg: paperRaised,
        clusterBorder: line,
        edgeLabelBackground: paperRaised,
        actorTextColor: ink,
        sequenceNumberColor: paperRaised,
        fontSize: "14px"
      }
    });

    var pending = Array.prototype.filter.call(blocks, laidOut);
    if (!pending.length) return;

    try {
      var done = mermaid.run({ nodes: pending });
      if (done && done.catch) done.catch(warn);
    } catch (e) {
      warn(e);
    }
  }

  function rerender() {
    Array.prototype.forEach.call(blocks, function (el) {
      el.removeAttribute("data-processed");
      el.textContent = el.dataset.src;
    });
    render();
  }

  render();

  document.addEventListener("kb-theme-change", rerender);
  // The lens both reveals blocks that were never rendered and changes the width the
  // visible ones must lay out in, so it needs the same full pass as a theme change.
  document.addEventListener("kb-lens-change", rerender);
  if (window.matchMedia) {
    var mq = window.matchMedia("(prefers-color-scheme: dark)");
    if (mq.addEventListener) mq.addEventListener("change", rerender);
  }
})();
