/* diagram-zoom.js — zoom, pan and a full-screen view for every mermaid figure.
   Load AFTER diagram.js, whose "kb-diagram-render" event is the seam this file hangs on.

   WHY IT EXISTS. A diagram is drawn to answer one question, and the corpus has two ways of
   failing that: a board carrying a whole system fits its column and its node text becomes
   unreadable, or a schema renders at natural size and you scroll around inside it and lose
   your place. Both are the same missing verb. Every figure now opens at the percentage that
   fits its own box, carries a − / + / % / ⤢ strip, pans by drag, and hands the SAME diagram
   to a full-viewport viewer that re-fits to the screen.

   THE INVARIANT. Inline fit is capped at 1, so a diagram that already fitted its column gets
   scale 1 and a stage exactly as tall as it was. Some 600 of the 628 figures are visually
   unchanged; only the oversized ones are clipped and scaled.

   IT RELOCATES, IT NEVER CLONES. The viewer MOVES the <pre class="mermaid"> into itself and
   moves it back on close (the trick vocab.js uses on its A-Z list). A clone would duplicate
   the SVG's id, and mermaid scopes both its injected <style> block and its url(#marker)
   arrowhead references by that id. Moving also keeps diagram.js's static NodeList — captured
   once at load — pointing at the same element, so re-render keeps working with no cooperation.

   EVERYTHING IT ADDS SITS OUTSIDE THE <pre>. diagram.js's rerender() restores el.textContent
   from el.dataset.src on every theme and lens change; anything parked inside the <pre> is
   destroyed by it. The strip and the stage are siblings of nothing but each other.

   STATE IS CUSTOM PROPERTIES, NOT INLINE STYLE. --dz-scale, --dz-x and --dz-y are unitless
   numbers on the stage; diagram-zoom.css owns the transform that reads them. Same carve-out
   graph-view.js takes with its --gv-* numbers. Nothing animates: a transitioned transform
   lags a drag, which is worse than no transition at all. */
(function () {
  "use strict";

  var MIN = 0.1;
  var MAX = 8;
  var STEP = 1.35;
  var INLINE_MAX = 1; /* inline never magnifies — see THE INVARIANT above */
  var INLINE_PAD = 0;
  var VIEWER_PAD = 24;
  var PAN_KEY = 60;
  var PAN_KEY_FAST = 200;

  /* ---------------- the arithmetic — window.KB_DIAGRAM_ZOOM ---------------- */

  function clamp(v, lo, hi) {
    if (!(v > 0)) return lo;
    return Math.min(Math.max(v, lo), hi);
  }

  /* The scale at which a content box sits wholly inside a view box, and the offsets that
     centre it there. `max` is the whole difference between the two contexts: inline it is 1
     so a diagram that fits keeps its footprint, and in the viewer it is MAX so a board drawn
     to fit a column is MAGNIFIED until its labels read. One function, both complaints. */
  function fit(content, view, pad, max) {
    if (!(content.w > 0) || !(content.h > 0) || !(view.w > 0)) {
      return { scale: 1, x: 0, y: 0 };
    }
    var availW = Math.max(view.w - 2 * pad, 1);
    var availH = view.h > 0 ? Math.max(view.h - 2 * pad, 1) : Infinity;
    var scale = clamp(Math.min(availW / content.w, availH / content.h), MIN, max);
    return {
      scale: scale,
      x: (view.w - content.w * scale) / 2,
      y: (view.h - content.h * scale) / 2
    };
  }

  /* Zoom about a point: whatever the content is showing under (px, py) must still be under
     (px, py) afterwards. When the scale clamps, the offsets must NOT move — applying the
     requested factor to the translation while the scale refuses it is what makes a diagram
     creep sideways while you hold the zoom-in button at maximum. */
  function zoomAt(st, factor, px, py, min, max) {
    var next = clamp(st.scale * factor, min, max);
    if (next === st.scale) return { scale: st.scale, x: st.x, y: st.y };
    var k = next / st.scale;
    return { scale: next, x: px - (px - st.x) * k, y: py - (py - st.y) * k };
  }

  /* Pan bounds. Smaller than the view on an axis → centred on it, so a diagram that fits sits
     where it always sat and cannot be nudged off-centre. Larger → its own edge is as far as
     it goes, so you can never drag the diagram out of the frame and lose it. */
  function clampPan(st, content, view) {
    var w = content.w * st.scale;
    var h = content.h * st.scale;
    return {
      scale: st.scale,
      x: w <= view.w ? (view.w - w) / 2 : Math.min(0, Math.max(view.w - w, st.x)),
      y: h <= view.h ? (view.h - h) / 2 : Math.min(0, Math.max(view.h - h, st.y))
    };
  }

  /* A page can carry ten figures, and ten buttons all announcing "Zoom diagram" tell a screen
     reader user nothing about which is which. Every figure has a figcaption; its opening
     sentence is the distinguishing text. */
  function labelFor(caption) {
    var text = String(caption == null ? "" : caption).replace(/\s+/g, " ").trim();
    if (!text) return "Zoom diagram";
    var stop = text.indexOf(". ");
    if (stop > 0) text = text.slice(0, stop);
    if (text.length > 70) {
      var cut = text.slice(0, 70);
      var space = cut.lastIndexOf(" ");
      text = (space > 20 ? cut.slice(0, space) : cut) + "…";
    }
    return "Zoom diagram: " + text;
  }

  window.KB_DIAGRAM_ZOOM = {
    MIN: MIN, MAX: MAX, STEP: STEP, VIEWER_PAD: VIEWER_PAD,
    clamp: clamp, fit: fit, zoomAt: zoomAt, clampPan: clampPan, labelFor: labelFor
  };

  /* Exposed before the first DOM touch, so the test loads the shipped file with no DOM stub
     at all — the same guard vocab.js uses. */
  if (typeof document === "undefined" || !document.querySelectorAll) return;

  var figures = document.querySelectorAll("figure.diagram");
  if (!figures.length) return;

  /* ---------------- measuring ---------------- */

  /* viewBox first: it is the diagram's own intrinsic units and is readable even while the box
     around it is collapsed. The rects are for the paths that have no viewBox — a mermaid
     syntax-error placeholder, or a block the renderer never reached. A zero on either axis
     means we have nothing to divide by, and the caller declines the figure. */
  function measure(pre) {
    var svg = pre ? pre.querySelector("svg") : null;
    var box = null;
    if (svg) {
      var vb = svg.viewBox && svg.viewBox.baseVal;
      if (vb && vb.width > 0 && vb.height > 0) box = { w: vb.width, h: vb.height };
      else box = svg.getBoundingClientRect();
    } else if (pre) {
      box = pre.getBoundingClientRect();
    }
    if (!box || !(box.width > 0 || box.w > 0) || !(box.height > 0 || box.h > 0)) return null;
    return { w: box.w || box.width, h: box.h || box.height };
  }

  /* ---------------- one pannable stage ---------------- */

  function controller(stage, opts) {
    var st = { scale: 1, x: 0, y: 0 };
    var content = { w: 0, h: 0 };
    var view = { w: 0, h: 0 };
    var floor = MIN;

    function prop(name, value) {
      stage.style.setProperty(name, String(Math.round(value * 1000) / 1000));
    }

    function write() {
      prop("--dz-scale", st.scale);
      prop("--dz-x", st.x);
      prop("--dz-y", st.y);
      stage.classList.toggle("dz-zoomed", st.scale > floor + 0.0001);
      if (opts.onChange) opts.onChange(st.scale);
    }

    function settle() {
      st = clampPan(st, content, view);
      write();
    }

    /* Re-measure and re-fit. Called after every render pass, on resize, and on open — all of
       which can change either number. Returns false when there is nothing to size against
       (no SVG yet, or a figure the lens is hiding), leaving the previous state alone. */
    function refit() {
      var pre = stage.querySelector(".mermaid");
      var natural = measure(pre);
      if (!natural) return false;
      content = natural;
      prop("--dz-nat-w", content.w);
      prop("--dz-nat-h", content.h);

      var box = opts.view(content);
      if (!(box.w > 0)) return false;
      var fitted = fit(content, box, opts.pad, opts.max);
      floor = fitted.scale;
      /* The stage claims exactly the height the fitted diagram needs, so "fit" really does
         mean the whole thing is on screen rather than the top of it. The viewer's stage is
         sized by its own flex layout instead and says so by returning a fixed height. */
      view = { w: box.w, h: opts.fixedHeight ? box.h : Math.round(content.h * fitted.scale) };
      if (!opts.fixedHeight) prop("--dz-box-h", view.h);
      st = { scale: fitted.scale, x: fitted.x, y: fitted.y };
      settle();
      return true;
    }

    function zoom(factor, px, py) {
      if (!(content.w > 0)) return;
      var origin = arguments.length > 1 ? { x: px, y: py } : { x: view.w / 2, y: view.h / 2 };
      st = zoomAt(st, factor, origin.x, origin.y, floor, opts.max);
      settle();
    }

    function pan(dx, dy) {
      st.x += dx;
      st.y += dy;
      settle();
    }

    /* One pointer map serves both gestures: one live pointer drags, two pinch. The pinch
       matters more than it looks — the stage sets touch-action, which takes the browser's own
       pinch away, and a phone is exactly where an oversized schema is worst. */
    var live = {};
    var count = 0;
    var pinch = null;

    function each(fn) {
      for (var id in live) if (Object.prototype.hasOwnProperty.call(live, id)) fn(live[id]);
    }

    function midpoint() {
      var sx = 0, sy = 0, n = 0;
      each(function (p) { sx += p.x; sy += p.y; n++; });
      return { x: sx / n, y: sy / n, n: n };
    }

    function spread(mid) {
      var d = 0;
      each(function (p) { d += Math.abs(p.x - mid.x) + Math.abs(p.y - mid.y); });
      return d;
    }

    stage.addEventListener("pointerdown", function (e) {
      if (e.pointerType === "mouse" && e.button !== 0) return;
      if (!live[e.pointerId]) count++;
      live[e.pointerId] = { x: e.clientX, y: e.clientY };
      if (count === 2 && opts.pinch) {
        var mid = midpoint();
        pinch = { dist: spread(mid) };
      }
      if (count === 1 && st.scale <= floor + 0.0001 && !opts.pinch) return;
      stage.setPointerCapture(e.pointerId);
      stage.classList.add("dz-panning");
      e.preventDefault();
    });

    stage.addEventListener("pointermove", function (e) {
      var was = live[e.pointerId];
      if (!was) return;
      var dx = e.clientX - was.x;
      var dy = e.clientY - was.y;
      was.x = e.clientX;
      was.y = e.clientY;
      if (count === 2 && pinch) {
        var mid = midpoint();
        var dist = spread(mid);
        if (pinch.dist > 0 && dist > 0) {
          var rect = stage.getBoundingClientRect();
          zoom(dist / pinch.dist, mid.x - rect.left, mid.y - rect.top);
        }
        pinch.dist = dist;
        return;
      }
      pan(dx, dy);
    });

    function release(e) {
      if (!live[e.pointerId]) return;
      delete live[e.pointerId];
      count--;
      if (count < 2) pinch = null;
      if (count <= 0) {
        count = 0;
        stage.classList.remove("dz-panning");
      }
    }
    stage.addEventListener("pointerup", release);
    stage.addEventListener("pointercancel", release);

    /* Inline, a bare wheel must keep scrolling the page — hijacking the scroll of 317 pages of
       prose to serve a figure is the wrong trade. Ctrl/⌘+wheel is the gesture readers already
       use to zoom, and it is what a trackpad pinch sends. In the viewer there is nothing else
       to scroll, so the bare wheel zooms. */
    stage.addEventListener("wheel", function (e) {
      if (opts.needsModifier && !e.ctrlKey && !e.metaKey) return;
      e.preventDefault();
      var rect = stage.getBoundingClientRect();
      var delta = e.deltaMode === 1 ? e.deltaY * 16 : e.deltaY;
      zoom(Math.exp(-delta * 0.002), e.clientX - rect.left, e.clientY - rect.top);
    }, { passive: false });

    return { refit: refit, zoom: zoom, pan: pan, reset: refit, scale: function () { return st.scale; } };
  }

  /* ---------------- the inline strip ---------------- */

  function button(glyph, label, cls) {
    var b = document.createElement("button");
    b.type = "button";
    b.className = cls || "dz-btn";
    b.textContent = glyph;
    b.setAttribute("aria-label", label);
    return b;
  }

  function wire(fig) {
    if (fig.classList.contains("dz-on")) return null;
    var pre = fig.querySelector(".mermaid");
    if (!pre || !measure(pre)) return null; /* no usable diagram — leave the figure alone */

    var caption = fig.querySelector("figcaption");
    var label = labelFor(caption ? caption.textContent : "");

    var stage = document.createElement("div");
    stage.className = "dz-stage";
    fig.insertBefore(stage, pre);
    stage.appendChild(pre);

    var bar = document.createElement("div");
    bar.className = "dz-bar";
    bar.setAttribute("role", "group");
    bar.setAttribute("aria-label", label);
    var out = button("−", "Zoom out");
    var into = button("+", "Zoom in");
    var pct = button("100%", "Reset zoom to fit", "dz-btn dz-level");
    var open = button("⤢", label, "dz-btn dz-open");
    bar.appendChild(out);
    bar.appendChild(into);
    bar.appendChild(pct);
    bar.appendChild(open);
    fig.insertBefore(bar, stage);
    fig.classList.add("dz-on");

    var ctl = controller(stage, {
      max: INLINE_MAX,
      pad: INLINE_PAD,
      needsModifier: true,
      pinch: false,
      fixedHeight: false,
      /* Width only, and no height bound at all: fitting both axes would shrink a tall
         sequence diagram to about half size to keep it inside one viewport, and it renders
         at full size today. Bounding the width and letting the height follow reproduces the
         existing layout exactly — the stage then claims precisely the height the diagram
         needs, so nothing inline is ever clipped until the reader zooms in. */
      view: function () { return { w: stage.clientWidth, h: 0 }; },
      onChange: function (scale) { pct.textContent = Math.round(scale * 100) + "%"; }
    });

    var entry = { fig: fig, pre: pre, stage: stage, ctl: ctl, open: open, label: label, caption: caption };
    out.addEventListener("click", function () { ctl.zoom(1 / STEP); });
    into.addEventListener("click", function () { ctl.zoom(STEP); });
    pct.addEventListener("click", function () { ctl.refit(); });
    open.addEventListener("click", function () { openViewer(entry); });
    ctl.refit();
    return entry;
  }

  /* ---------------- the full-screen viewer ---------------- */

  var viewer = null;

  function buildViewer() {
    var dialog = document.createElement("dialog");
    dialog.className = "dzoom";

    var stage = document.createElement("div");
    stage.className = "dz-stage";
    stage.tabIndex = 0;
    stage.setAttribute("aria-label", "Diagram. Arrow keys pan, plus and minus zoom, 0 fits.");

    var bar = document.createElement("div");
    bar.className = "dz-bar";
    bar.setAttribute("role", "group");
    bar.setAttribute("aria-label", "Diagram zoom controls");
    var out = button("−", "Zoom out");
    var into = button("+", "Zoom in");
    var level = document.createElement("output");
    level.className = "dz-level";
    level.setAttribute("aria-live", "polite");
    var fitBtn = button("Fit", "Fit to screen");
    var one = button("1:1", "Actual size");
    var done = button("✕", "Close viewer", "dz-btn dz-close");
    bar.appendChild(out);
    bar.appendChild(level);
    bar.appendChild(into);
    bar.appendChild(fitBtn);
    bar.appendChild(one);
    bar.appendChild(done);

    var caption = document.createElement("p");
    caption.className = "dz-caption";

    dialog.appendChild(bar);
    dialog.appendChild(stage);
    dialog.appendChild(caption);
    document.body.appendChild(dialog);

    var ctl = controller(stage, {
      max: MAX,
      pad: VIEWER_PAD,
      needsModifier: false,
      pinch: true,
      fixedHeight: true,
      view: function () { return { w: stage.clientWidth, h: stage.clientHeight }; },
      onChange: function (scale) { level.textContent = Math.round(scale * 100) + "%"; }
    });

    out.addEventListener("click", function () { ctl.zoom(1 / STEP); });
    into.addEventListener("click", function () { ctl.zoom(STEP); });
    fitBtn.addEventListener("click", function () { ctl.refit(); });
    one.addEventListener("click", function () { ctl.zoom(1 / ctl.scale()); });
    done.addEventListener("click", closeViewer);
    dialog.addEventListener("cancel", function (e) { e.preventDefault(); closeViewer(); });
    dialog.addEventListener("click", function (e) { if (e.target === dialog) closeViewer(); });
    dialog.addEventListener("keydown", function (e) {
      if (e.key === "+" || e.key === "=") ctl.zoom(STEP);
      else if (e.key === "-" || e.key === "_") ctl.zoom(1 / STEP);
      else if (e.key === "0") ctl.refit();
      else if (e.key === "1") ctl.zoom(1 / ctl.scale());
      else if (e.key === "ArrowLeft" || e.key === "ArrowRight" || e.key === "ArrowUp" || e.key === "ArrowDown") {
        var d = e.shiftKey ? PAN_KEY_FAST : PAN_KEY;
        ctl.pan(e.key === "ArrowLeft" ? d : e.key === "ArrowRight" ? -d : 0,
                e.key === "ArrowUp" ? d : e.key === "ArrowDown" ? -d : 0);
      } else return;
      e.preventDefault();
    });

    return { dialog: dialog, stage: stage, ctl: ctl, caption: caption, source: null, slot: null };
  }

  function openViewer(entry) {
    var v = viewer || (viewer = buildViewer());
    if (v.source) return;

    /* The placeholder holds the removed <pre>'s height. Without it the page behind the dialog
       reflows by however tall the diagram was, the scroll position moves under the reader,
       and section-nav.js's ResizeObserver churns for nothing. */
    var slot = document.createElement("div");
    slot.className = "dz-slot";
    slot.style.setProperty("--dz-slot-h", String(Math.round(entry.stage.getBoundingClientRect().height)));
    entry.fig.insertBefore(slot, entry.stage);

    v.stage.appendChild(entry.pre);
    v.caption.textContent = entry.caption ? entry.caption.textContent : "";
    v.dialog.setAttribute("aria-label", entry.label);
    v.source = entry;
    v.slot = slot;
    v.dialog.showModal();
    v.ctl.refit();
    /* The stage is deliberately NOT focused. Every key binding lives on the dialog, so the
       arrows pan wherever focus lands, and focusing the stage programmatically makes Chrome
       treat it as keyboard-visible — a 2px ring around the whole canvas for a reader who
       only clicked ⤢. showModal() puts focus on the first control, which is honest. */
  }

  function closeViewer() {
    var v = viewer;
    if (!v || !v.source) return;
    var entry = v.source;
    entry.stage.appendChild(entry.pre);
    if (v.slot && v.slot.parentNode) v.slot.parentNode.removeChild(v.slot);
    v.source = null;
    v.slot = null;
    v.dialog.close();
    /* Explicit rather than trusting the UA to restore focus: Safari does not focus a <button>
       on mouse-down, so the element the dialog remembers may well be <body>. */
    if (entry.open && entry.open.focus) entry.open.focus();
    entry.ctl.refit();
  }

  /* ---------------- lifecycle ---------------- */

  var wired = [];

  function entryFor(fig) {
    for (var i = 0; i < wired.length; i++) if (wired[i].fig === fig) return wired[i];
    return null;
  }

  /* diagram.js destroys and rebuilds every SVG on a theme or lens change, so a figure is
     wired on the first pass that produces one and re-fitted on every pass after. A figure the
     lens is hiding has no SVG and no box; refit declines it and the pass that reveals it
     fires this again. */
  function sync() {
    Array.prototype.forEach.call(figures, function (fig) {
      var entry = entryFor(fig);
      if (!entry) {
        entry = wire(fig);
        if (entry) wired.push(entry);
        return;
      }
      if (viewer && viewer.source === entry) viewer.ctl.refit();
      else entry.ctl.refit();
    });
  }

  document.addEventListener("kb-diagram-render", sync);

  /* An event cannot be caught late, and diagram.js starts its first render pass one script tag
     before this file is even evaluated — so mermaid's promise can resolve, and kb-diagram-render
     fire, with nothing yet listening. That is not a race to win but one to sidestep: sync() is
     idempotent, so it runs now (catching a pass that already finished), again at load, and on
     every event after. Whichever of the three arrives with an SVG in hand does the wiring; the
     others find the work done and re-fit. */
  sync();
  window.addEventListener("load", sync);

  var resizing = null;
  window.addEventListener("resize", function () {
    if (resizing) clearTimeout(resizing);
    resizing = setTimeout(sync, 150);
  });
})();
