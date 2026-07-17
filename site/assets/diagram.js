/* diagram.js — initialize the locally-vendored mermaid, themed from the active palette.
   Load AFTER vendor/mermaid.min.js. Renders every <pre class="mermaid"> / .mermaid block,
   and re-renders with fresh palette values when the theme changes (toggle or OS). */
(function () {
  "use strict";
  if (typeof mermaid === "undefined") return;

  var blocks = document.querySelectorAll(".mermaid");
  Array.prototype.forEach.call(blocks, function (el) {
    if (!el.dataset.src) el.dataset.src = el.textContent;
  });

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
        fontSize: "14px"
      }
    });

    try {
      mermaid.run({ querySelector: ".mermaid" });
    } catch (e) {
      if (window.console) console.warn("mermaid render failed:", e);
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
  if (window.matchMedia) {
    var mq = window.matchMedia("(prefers-color-scheme: dark)");
    if (mq.addEventListener) mq.addEventListener("change", rerender);
  }
})();
