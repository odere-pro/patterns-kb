/* favourites.js — per-visitor favourites, seeded from the authored picks.
 *
 * `data-kb-favourite="true"` on a page is the DEFAULT, not the answer. The build renders
 * it (as [data-fav] plus a pressed star on the hub, and as the attribute itself on a
 * content page), this script reads that as the seed, and the visitor's own toggles win
 * over it. So a fresh browser sees the editorial picks, and one that has curated sees its
 * own list.
 *
 * The store holds OVERRIDES ONLY — an id appears in it only while the visitor disagrees
 * with the page. Re-favouriting a default favourite deletes the key rather than writing
 * `true`. That keeps the site's "default = absence" rule, and it means re-curating the
 * authored picks later moves every visitor who never expressed an opinion.
 *
 * Separate store, separate meaning from progress.js: Practiced is "I have worked through
 * this", Favourite is "I want this near the top". They share the injected-control shape
 * and nothing else.
 *
 * Controls, all wired here: the hub's per-chip star, the hub's ★ Favourites filter, and —
 * on a content page — a metarow button plus a floating one in the fixed control cluster.
 * Content pages carry no favourite markup; both page controls are injected below. */
(function () {
  "use strict";
  var STORAGE_KEY = "kb-favourites-v1";

  var state = {};
  try { state = JSON.parse(localStorage.getItem(STORAGE_KEY) || "{}") || {}; }
  catch (e) { state = {}; }

  function persist() {
    try { localStorage.setItem(STORAGE_KEY, JSON.stringify(state)); } catch (e) {}
  }
  function has(id) { return Object.prototype.hasOwnProperty.call(state, id); }

  /* id -> { def: bool, cards: [el], buttons: [el] }. Defaults are snapshotted from the
     rendered markup BEFORE anything here mutates it. */
  var entries = {};

  function entry(id, def) {
    if (!entries[id]) entries[id] = { def: !!def, cards: [], buttons: [] };
    return entries[id];
  }
  function isFav(id) {
    var e = entries[id];
    return has(id) ? !!state[id] : !!(e && e.def);
  }

  /* ---- hub: one star button per chip / card ---- */
  Array.prototype.forEach.call(
    document.querySelectorAll("button.chip-fav[data-fav-id]"),
    function (btn) {
      var id = btn.getAttribute("data-fav-id");
      var card = btn.closest(".chip") || btn.closest(".theme-card");
      var e = entry(id, card && card.hasAttribute("data-fav"));
      e.buttons.push(btn);
      if (card) e.cards.push(card);
      /* The rendered label ends "…: Circuit Breaker". Keep the name so relabelling on
         toggle stays specific instead of collapsing to a bare "Mark favourite". */
      var label = btn.getAttribute("aria-label") || "";
      var sep = label.indexOf(": ");
      if (sep > -1) btn.setAttribute("data-fav-name", label.slice(sep + 2));
      btn.addEventListener("click", function (ev) {
        ev.preventDefault();  // theme cards are links; a star click must not navigate
        ev.stopPropagation();
        toggle(id);
      });
    },
  );

  /* ---- content page: inject the metarow control and the floating one ---- */
  var main = document.querySelector("main.doc-wrap[data-kb-id]");
  if (main) {
    var pageId = main.getAttribute("data-kb-id");
    var e = entry(pageId, main.getAttribute("data-kb-favourite") === "true");

    var metarow = document.querySelector(".doc-metarow");
    if (metarow) {
      var inline = document.createElement("button");
      inline.type = "button";
      inline.className = "favourite";
      inline.innerHTML = '<span class="favourite-star">★</span> Favourite';
      inline.addEventListener("click", function () { toggle(pageId); });
      e.buttons.push(inline);
      metarow.appendChild(inline);
    }

    var floating = document.createElement("button");
    floating.type = "button";
    floating.className = "fav-toggle";
    floating.textContent = "★";
    floating.addEventListener("click", function () { toggle(pageId); });
    e.buttons.push(floating);
    document.body.appendChild(floating);
  }

  /* ---- the hub's ★ Favourites filter ---- */
  var filterBtn = document.getElementById("fav-filter-btn");

  function anyFavourite() {
    for (var id in entries) if (isFav(id)) return true;
    return false;
  }

  function paint(id) {
    var e = entries[id];
    if (!e) return;
    var on = isFav(id);
    e.cards.forEach(function (card) {
      if (on) card.setAttribute("data-fav", "1");
      else card.removeAttribute("data-fav");
    });
    e.buttons.forEach(function (btn) {
      btn.setAttribute("aria-pressed", on ? "true" : "false");
      var name = btn.getAttribute("data-fav-name") || "";
      var label = on ? "Favourite — click to unmark" : "Mark favourite";
      btn.setAttribute("aria-label", name ? label + ": " + name : label);
      btn.title = label;
    });
  }

  function paintFilter() {
    if (!filterBtn) return;
    var any = anyFavourite();
    filterBtn.hidden = !any;
    // Filtering to an empty map would leave the visitor staring at nothing.
    if (!any && document.body.classList.contains("fav-only")) {
      document.body.classList.remove("fav-only");
      filterBtn.setAttribute("aria-pressed", "false");
    }
  }

  function toggle(id) {
    var e = entries[id];
    if (!e) return;
    var next = !isFav(id);
    if (next === e.def) delete state[id];   // back to the authored default — store nothing
    else state[id] = next;
    persist();
    paint(id);
    paintFilter();
  }

  Object.keys(entries).forEach(paint);
  paintFilter();

  if (filterBtn) {
    filterBtn.addEventListener("click", function () {
      var on = document.body.classList.toggle("fav-only");
      filterBtn.setAttribute("aria-pressed", on ? "true" : "false");
    });
  }
})();
