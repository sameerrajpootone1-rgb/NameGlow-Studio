/* ==========================================================
   Naamora – script.js
   Works with the supplied index.html + style.css
   - Reads the 10 style blocks (#styleData .tpl) -> 500 styles
   - Live name search box, category filter, "Show more", copy + toast
   ========================================================== */
(function () {
  "use strict";

  /* ---------- Settings ---------- */
  var PAGE_SIZE = 24;
  var DEFAULT_NAME = "Your Name";
  var STORAGE_KEY = "naamora_name";

  /* ---------- Elements ---------- */
  var $ = function (id) { return document.getElementById(id); };
  var nameInput = $("nameInput");
  var clearBtn = $("clearBtn");
  var catBar = $("catBar");
  var cardGrid = $("cardGrid");
  var cardsTitle = $("cardsTitle");
  var cardsMeta = $("cardsMeta");
  var emptyState = $("emptyState");
  var loadMoreBtn = $("loadMore");
  var totalCount = $("totalCount");
  var toast = $("toast");
  var yearEl = $("year");

  /* ==========================================================
     1. FONT ENGINE (Unicode letter styles)
     ========================================================== */
  function cp(n) { return String.fromCodePoint(n); }

  // Build a function that maps A-Z, a-z (and optional digits) to another block.
  function makeMapper(opt) {
    var map = {};
    var i;
    for (i = 0; i < 26; i++) {
      var U = String.fromCharCode(65 + i);
      var L = String.fromCharCode(97 + i);
      if (opt.upper !== undefined) map[U] = cp(opt.upper + i);
      if (opt.lower !== undefined) map[L] = cp(opt.lower + i);
    }
    if (opt.digit !== undefined) {
      for (i = 0; i < 10; i++) map[String(i)] = cp(opt.digit + i);
    }
    if (opt.extra) {
      for (var k in opt.extra) if (Object.prototype.hasOwnProperty.call(opt.extra, k)) map[k] = opt.extra[k];
    }
    return function (text) {
      var out = "";
      for (var ch of text) out += map[ch] !== undefined ? map[ch] : ch;
      return out;
    };
  }

  // Small caps: both cases map to small capital letters
  var SMALLCAPS = "ᴀʙᴄᴅᴇꜰɢʜɪᴊᴋʟᴍɴᴏᴘǫʀꜱᴛᴜᴠᴡxʏᴢ";
  var smallcapsMap = {};
  (function () {
    var arr = Array.from(SMALLCAPS);
    for (var i = 0; i < 26; i++) {
      smallcapsMap[String.fromCharCode(65 + i)] = arr[i];
      smallcapsMap[String.fromCharCode(97 + i)] = arr[i];
    }
  })();

  var FONTS = {
    plain: function (t) { return t; },

    boldscript: makeMapper({ upper: 0x1D4D0, lower: 0x1D4EA, digit: 0x1D7CE }),
    serifbold: makeMapper({ upper: 0x1D400, lower: 0x1D41A, digit: 0x1D7CE }),
    fraktur: makeMapper({
      upper: 0x1D504, lower: 0x1D51E,
      extra: { C: "ℭ", H: "ℌ", I: "ℑ", R: "ℜ", Z: "ℨ" }
    }),
    frakturbold: makeMapper({ upper: 0x1D56C, lower: 0x1D586, digit: 0x1D7CE }),
    double: makeMapper({
      upper: 0x1D538, lower: 0x1D552, digit: 0x1D7D8,
      extra: { C: "ℂ", H: "ℍ", N: "ℕ", P: "ℙ", Q: "ℚ", R: "ℝ", Z: "ℤ" }
    }),
    script: makeMapper({
      upper: 0x1D49C, lower: 0x1D4B6,
      extra: {
        B: "ℬ", E: "ℰ", F: "ℱ", H: "ℋ", I: "ℐ", L: "ℒ", M: "ℳ", R: "ℛ",
        e: "ℯ", g: "ℊ", o: "ℴ"
      }
    }),
    italicserif: makeMapper({
      upper: 0x1D434, lower: 0x1D44E, digit: 0x1D7CE,
      extra: { h: "ℎ" }
    }),
    mono: makeMapper({ upper: 0x1D670, lower: 0x1D68A, digit: 0x1D7F6 }),
    bubble: makeMapper({
      upper: 0x24B6, lower: 0x24D0,
      extra: {
        "0": "⓪", "1": "①", "2": "②", "3": "③", "4": "④",
        "5": "⑤", "6": "⑥", "7": "⑦", "8": "⑧", "9": "⑨"
      }
    }),
    smallcaps: function (text) {
      var out = "";
      for (var ch of text) out += smallcapsMap[ch] !== undefined ? smallcapsMap[ch] : ch;
      return out;
    }
  };

  function applyFont(fontKey, name) {
    var fn = FONTS[fontKey] || FONTS.plain;
    return fn(name);
  }

  /* ==========================================================
     2. LOAD STYLE DATA FROM THE HTML
     ========================================================== */
  var categories = [];   // { key, title, font, items: [ {tpl, catKey} ] }
  var allStyles = [];    // all styles, round-robin ordered across categories

  function loadData() {
    var blocks = document.querySelectorAll("#styleData script.tpl");
    blocks.forEach(function (block) {
      var lines = block.textContent
        .split(/\r?\n/)
        .map(function (l) { return l.trim(); })
        .filter(function (l) { return l && l.indexOf("{n}") !== -1; });

      var cat = {
        key: block.getAttribute("data-cat") || "misc",
        title: block.getAttribute("data-title") || "Styles",
        font: block.getAttribute("data-font") || "plain",
        items: []
      };
      cat.items = lines.map(function (tpl) {
        return { tpl: tpl, font: cat.font, cat: cat.key };
      });
      categories.push(cat);
    });

    // Round-robin mix so "All" shows variety on the first page
    var max = categories.reduce(function (m, c) { return Math.max(m, c.items.length); }, 0);
    for (var i = 0; i < max; i++) {
      categories.forEach(function (c) {
        if (c.items[i]) allStyles.push(c.items[i]);
      });
    }
  }

  /* ==========================================================
     3. STATE
     ========================================================== */
  var state = {
    name: "",
    cat: "all",
    shown: 0,
    list: []
  };

  function currentName() {
    var n = (state.name || "").trim();
    return n || DEFAULT_NAME;
  }

  function buildText(item) {
    var styled = applyFont(item.font, currentName());
    return item.tpl.split("{n}").join(styled);
  }

  /* ==========================================================
     4. CATEGORY BAR
     ========================================================== */
  function buildCategoryBar() {
    var frag = document.createDocumentFragment();

    function addBtn(key, label, count) {
      var b = document.createElement("button");
      b.type = "button";
      b.className = "cat-btn" + (key === state.cat ? " active" : "");
      b.setAttribute("data-cat", key);
      b.textContent = label;
      b.title = count + " styles";
      frag.appendChild(b);
    }

    addBtn("all", "All", allStyles.length);
    categories.forEach(function (c) { addBtn(c.key, c.title, c.items.length); });

    catBar.innerHTML = "";
    catBar.appendChild(frag);
  }

  function setActiveCategory(key) {
    state.cat = key;
    catBar.querySelectorAll(".cat-btn").forEach(function (b) {
      var on = b.getAttribute("data-cat") === key;
      b.classList.toggle("active", on);
      b.setAttribute("aria-pressed", on ? "true" : "false");
      if (on && b.scrollIntoView) {
        try { b.scrollIntoView({ block: "nearest", inline: "center", behavior: "smooth" }); } catch (e) {}
      }
    });
  }

  /* ==========================================================
     5. RENDER CARDS
     ========================================================== */
  function getList() {
    if (state.cat === "all") return allStyles;
    var c = categories.filter(function (x) { return x.key === state.cat; })[0];
    return c ? c.items : [];
  }

  function createCard(item, index) {
    var text = buildText(item);

    var card = document.createElement("div");
    card.className = "card";
    card.setAttribute("role", "button");
    card.setAttribute("tabindex", "0");
    card.setAttribute("aria-label", "Copy style: " + text);
    card.style.setProperty("--i", index);
    card.__item = item;
    card.__text = text;

    var span = document.createElement("div");
    span.className = "card-text";
    span.textContent = text;

    var btn = document.createElement("span");
    btn.className = "card-copy";
    btn.textContent = "Copy";

    card.appendChild(span);
    card.appendChild(btn);
    return card;
  }

  function appendNextPage() {
    var start = state.shown;
    var end = Math.min(start + PAGE_SIZE, state.list.length);
    var frag = document.createDocumentFragment();
    for (var i = start; i < end; i++) {
      frag.appendChild(createCard(state.list[i], i - start));
    }
    cardGrid.appendChild(frag);
    state.shown = end;
    updateMeta();
  }

  function renderAll() {
    state.list = getList();
    state.shown = 0;
    cardGrid.innerHTML = "";

    var active = categories.filter(function (c) { return c.key === state.cat; })[0];
    cardsTitle.textContent = state.cat === "all" ? "All Styles" : (active ? active.title + " Styles" : "Styles");

    emptyState.hidden = state.list.length > 0;
    appendNextPage();
  }

  function updateMeta() {
    var total = state.list.length;
    cardsMeta.textContent = total ? "Showing " + state.shown + " of " + total : "";
    loadMoreBtn.hidden = state.shown >= total;
    if (!loadMoreBtn.hidden) {
      var left = total - state.shown;
      loadMoreBtn.textContent = "Show more styles (" + left + " left)";
    }
  }

  // Update text of already-rendered cards when the name changes (no re-animation)
  function refreshTexts() {
    cardGrid.querySelectorAll(".card").forEach(function (card) {
      var text = buildText(card.__item);
      card.__text = text;
      card.setAttribute("aria-label", "Copy style: " + text);
      var span = card.querySelector(".card-text");
      if (span) span.textContent = text;
    });
  }

  /* ==========================================================
     6. COPY + TOAST
     ========================================================== */
  var toastTimer = null;
  function showToast(msg) {
    toast.textContent = msg || "Copied!";
    toast.classList.add("show");
    clearTimeout(toastTimer);
    toastTimer = setTimeout(function () { toast.classList.remove("show"); }, 1600);
  }

  function fallbackCopy(text) {
    var ta = document.createElement("textarea");
    ta.value = text;
    ta.setAttribute("readonly", "");
    ta.style.position = "fixed";
    ta.style.top = "-1000px";
    ta.style.opacity = "0";
    document.body.appendChild(ta);
    ta.select();
    ta.setSelectionRange(0, text.length);
    var ok = false;
    try { ok = document.execCommand("copy"); } catch (e) { ok = false; }
    document.body.removeChild(ta);
    return ok;
  }

  function copyText(text) {
    if (navigator.clipboard && window.isSecureContext) {
      return navigator.clipboard.writeText(text).then(function () { return true; }, function () {
        return fallbackCopy(text);
      });
    }
    return Promise.resolve(fallbackCopy(text));
  }

  function copyCard(card) {
    if (!card || !card.__text) return;
    copyText(card.__text).then(function (ok) {
      if (ok) {
        card.classList.add("copied");
        var label = card.querySelector(".card-copy");
        if (label) label.textContent = "Copied ✓";
        showToast("Copied!");
        setTimeout(function () {
          card.classList.remove("copied");
          if (label) label.textContent = "Copy";
        }, 1400);
      } else {
        showToast("Copy failed – select the text manually");
      }
    });
  }

  /* ==========================================================
     7. EVENTS
     ========================================================== */
  function saveName() {
    try { localStorage.setItem(STORAGE_KEY, state.name); } catch (e) {}
  }

  function onNameChange() {
    state.name = nameInput.value;
    clearBtn.hidden = !nameInput.value.length;
    refreshTexts();
    saveName();
  }

  nameInput.addEventListener("input", onNameChange);

  nameInput.addEventListener("keydown", function (e) {
    if (e.key === "Escape" && nameInput.value) {
      nameInput.value = "";
      onNameChange();
    }
  });

  clearBtn.addEventListener("click", function () {
    nameInput.value = "";
    onNameChange();
    nameInput.focus();
  });

  catBar.addEventListener("click", function (e) {
    var btn = e.target.closest(".cat-btn");
    if (!btn) return;
    var key = btn.getAttribute("data-cat");
    if (key === state.cat) return;
    setActiveCategory(key);
    renderAll();
  });

  loadMoreBtn.addEventListener("click", appendNextPage);

  cardGrid.addEventListener("click", function (e) {
    var card = e.target.closest(".card");
    if (card) copyCard(card);
  });

  cardGrid.addEventListener("keydown", function (e) {
    if (e.key !== "Enter" && e.key !== " ") return;
    var card = e.target.closest(".card");
    if (!card) return;
    e.preventDefault();
    copyCard(card);
  });

  // Press "/" anywhere to jump to the search box
  document.addEventListener("keydown", function (e) {
    if (e.key === "/" && document.activeElement !== nameInput &&
        !/^(INPUT|TEXTAREA)$/.test(document.activeElement.tagName)) {
      e.preventDefault();
      nameInput.focus();
    }
  });

  /* ==========================================================
     8. INIT
     ========================================================== */
  function init() {
    if (yearEl) yearEl.textContent = new Date().getFullYear();

    loadData();
    totalCount.textContent = allStyles.length;

    // restore saved name
    try {
      var saved = localStorage.getItem(STORAGE_KEY);
      if (saved) {
        nameInput.value = saved.slice(0, nameInput.maxLength > 0 ? nameInput.maxLength : 24);
        state.name = nameInput.value;
      }
    } catch (e) {}
    clearBtn.hidden = !nameInput.value.length;

    buildCategoryBar();
    renderAll();
  }

  init();
})();
