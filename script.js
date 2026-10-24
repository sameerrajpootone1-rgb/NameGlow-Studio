
/* ==========================================================
   SAM Styles – script.js
   Original features:
   - 1000 styles from #styleData .tpl
   - Search, categories, Show More, Copy + toast
   - Favorites with localStorage
   Added:
   - Trending category with 10 Masterpiece styles
   ========================================================== */
(function () {
  "use strict";

  /* ---------- Settings ---------- */
  var PAGE_SIZE = 24;
  var DEFAULT_NAME = "Your Name";
  var STORAGE_KEY = "naamora_name";
  var FAV_KEY = "naamora_favorites";

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
     1. FONT ENGINE
     ========================================================== */
  function cp(n) { return String.fromCodePoint(n); }

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
      for (var k in opt.extra) {
        if (Object.prototype.hasOwnProperty.call(opt.extra, k)) {
          map[k] = opt.extra[k];
        }
      }
    }

    return function (text) {
      var out = "";
      for (var ch of text) out += map[ch] !== undefined ? map[ch] : ch;
      return out;
    };
  }

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

    boldscript: makeMapper({
      upper: 0x1D4D0, lower: 0x1D4EA, digit: 0x1D7CE
    }),

    serifbold: makeMapper({
      upper: 0x1D400, lower: 0x1D41A, digit: 0x1D7CE
    }),

    fraktur: makeMapper({
      upper: 0x1D504,
      lower: 0x1D51E,
      extra: { C: "ℭ", H: "ℌ", I: "ℑ", R: "ℜ", Z: "ℨ" }
    }),

    frakturbold: makeMapper({
      upper: 0x1D56C, lower: 0x1D586, digit: 0x1D7CE
    }),

    double: makeMapper({
      upper: 0x1D538,
      lower: 0x1D552,
      digit: 0x1D7D8,
      extra: {
        C: "ℂ", H: "ℍ", N: "ℕ", P: "ℙ",
        Q: "ℚ", R: "ℝ", Z: "ℤ"
      }
    }),

    script: makeMapper({
      upper: 0x1D49C,
      lower: 0x1D4B6,
      extra: {
        B: "ℬ", E: "ℰ", F: "ℱ", H: "ℋ",
        I: "ℐ", L: "ℒ", M: "ℳ", R: "ℛ",
        e: "ℯ", g: "ℊ", o: "ℴ"
      }
    }),

    italicserif: makeMapper({
      upper: 0x1D434,
      lower: 0x1D44E,
      digit: 0x1D7CE,
      extra: { h: "ℎ" }
    }),

    mono: makeMapper({
      upper: 0x1D670, lower: 0x1D68A, digit: 0x1D7F6
    }),

    bubble: makeMapper({
      upper: 0x24B6,
      lower: 0x24D0,
      extra: {
        "0": "⓪", "1": "①", "2": "②", "3": "③",
        "4": "④", "5": "⑤", "6": "⑥", "7": "⑦",
        "8": "⑧", "9": "⑨"
      }
    }),

    smallcaps: function (text) {
      var out = "";
      for (var ch of text) {
        out += smallcapsMap[ch] !== undefined ? smallcapsMap[ch] : ch;
      }
      return out;
    }
  };

  function applyFont(fontKey, name) {
    var fn = FONTS[fontKey] || FONTS.plain;
    return fn(name);
  }

  /* ==========================================================
     2. TRENDING STYLES — 10 MASTERPIECE DESIGNS
     ========================================================== */
  var TRENDING_STYLES = [
    { tpl: "꧁༒☬ {n} ☬༒꧂", font: "plain" },
    { tpl: "亗  {n}  亗", font: "serifbold" },
    { tpl: "『⚡』{n}『⚡』", font: "plain" },
    { tpl: "♛  {n}  ♛", font: "boldscript" },
    { tpl: "乂❤ {n} ❤乂", font: "plain" },
    { tpl: "么  {n}  么", font: "italicserif" },
    { tpl: "𓆩♡𓆪 {n} 𓆩♡𓆪", font: "plain" },
    { tpl: "★彡 {n} 彡★", font: "plain" },
    { tpl: "◥꧁ {n} ꧂◤", font: "serifbold" },
    { tpl: "༺𓆩 {n} 𓆪༻", font: "boldscript" }
  ];

  var trendingStyles = TRENDING_STYLES.map(function (style, index) {
    return {
      tpl: style.tpl,
      font: style.font,
      cat: "trending",
      id: "trending|" + index + "|" + style.tpl
    };
  });

  /* ==========================================================
     3. LOAD STYLE DATA FROM HTML
     ========================================================== */
  var categories = [];
  var allStyles = [];

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
        return {
          tpl: tpl,
          font: cat.font,
          cat: cat.key,
          id: cat.key + "|" + tpl
        };
      });

      categories.push(cat);
    });

    var max = categories.reduce(function (m, c) {
      return Math.max(m, c.items.length);
    }, 0);

    for (var i = 0; i < max; i++) {
      categories.forEach(function (c) {
        if (c.items[i]) allStyles.push(c.items[i]);
      });
    }
  }

  /* ==========================================================
     4. STATE + FAVORITES
     ========================================================== */
  var state = {
    name: "",
    cat: "all",
    shown: 0,
    list: []
  };

  var favs = {};

  function loadFavs() {
    try {
      var raw = localStorage.getItem(FAV_KEY);
      var arr = raw ? JSON.parse(raw) : [];
      if (Array.isArray(arr)) {
        arr.forEach(function (id) { favs[id] = true; });
      }
    } catch (e) {
      favs = {};
    }
  }

  function saveFavs() {
    try {
      localStorage.setItem(FAV_KEY, JSON.stringify(Object.keys(favs)));
    } catch (e) {}
  }

  function favCount() {
    return Object.keys(favs).length;
  }

  function currentName() {
    var n = (state.name || "").trim();
    return n || DEFAULT_NAME;
  }

  function buildText(item) {
    var styled = applyFont(item.font, currentName());
    return item.tpl.split("{n}").join(styled);
  }

  /* ==========================================================
     5. CATEGORY BAR
     ========================================================== */
  function favLabel() {
    return "♥ Favorites (" + favCount() + ")";
  }

  function buildCategoryBar() {
    var frag = document.createDocumentFragment();

    function addBtn(key, label, count) {
      var b = document.createElement("button");
      b.type = "button";
      b.className = "cat-btn" +
        (key === "favs" ? " cat-fav" : "") +
        (key === state.cat ? " active" : "");
      b.setAttribute("data-cat", key);
      b.textContent = label;
      b.title = count + " styles";
      frag.appendChild(b);
    }

    addBtn("all", "All", allStyles.length);
    addBtn("favs", favLabel(), favCount());

    /* NEW: Trending button */
    addBtn("trending", "🔥 Trending", trendingStyles.length);

    categories.forEach(function (c) {
      addBtn(c.key, c.title, c.items.length);
    });

    catBar.innerHTML = "";
    catBar.appendChild(frag);
  }

  function updateFavButton() {
    var b = catBar.querySelector('.cat-btn[data-cat="favs"]');
    if (b) {
      b.textContent = favLabel();
      b.title = favCount() + " styles";
    }
  }

  function setActiveCategory(key) {
    state.cat = key;

    catBar.querySelectorAll(".cat-btn").forEach(function (b) {
      var on = b.getAttribute("data-cat") === key;
      b.classList.toggle("active", on);
      b.setAttribute("aria-pressed", on ? "true" : "false");

      if (on && b.scrollIntoView) {
        try {
          b.scrollIntoView({
            block: "nearest",
            inline: "center",
            behavior: "smooth"
          });
        } catch (e) {}
      }
    });
  }

  /* ==========================================================
     6. GET LIST + RENDER CARDS
     ========================================================== */
  function getList() {
    if (state.cat === "all") return allStyles;

    if (state.cat === "favs") {
      return allStyles.concat(trendingStyles).filter(function (s) {
        return !!favs[s.id];
      });
    }

    if (state.cat === "trending") return trendingStyles;

    var c = categories.filter(function (x) {
      return x.key === state.cat;
    })[0];

    return c ? c.items : [];
  }

  var HEART_SVG =
    '<svg class="fav-icon" viewBox="0 0 24 24" aria-hidden="true">' +
    '<path d="M12 21s-7.5-4.6-9.6-9.3C.9 8.3 2.6 4.5 6.2 4.1c2-.2 3.9.8 5.8 3 1.9-2.2 3.8-3.2 5.8-3 3.6.4 5.3 4.2 3.8 7.6C19.5 16.4 12 21 12 21z"/>' +
    '</svg>';

  function paintFav(btn, on) {
    btn.classList.toggle("is-fav", on);
    btn.setAttribute("aria-pressed", on ? "true" : "false");
    btn.setAttribute(
      "aria-label",
      on ? "Remove from favorites" : "Add to favorites"
    );
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

    var foot = document.createElement("div");
    foot.className = "card-foot";

    var fav = document.createElement("button");
    fav.type = "button";
    fav.className = "fav-btn";
    fav.innerHTML = HEART_SVG + '<span class="fav-label">Favorite</span>';
    paintFav(fav, !!favs[item.id]);

    var btn = document.createElement("span");
    btn.className = "card-copy";
    btn.textContent = "Copy";

    foot.appendChild(fav);
    foot.appendChild(btn);
    card.appendChild(span);
    card.appendChild(foot);

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

    var active = categories.filter(function (c) {
      return c.key === state.cat;
    })[0];

    if (state.cat === "all") {
      cardsTitle.textContent = "All Styles";
    } else if (state.cat === "favs") {
      cardsTitle.textContent = "Your Favorites";
    } else if (state.cat === "trending") {
      cardsTitle.textContent = "🔥 Trending Masterpiece Styles";
    } else {
      cardsTitle.textContent = active ? active.title + " Styles" : "Styles";
    }

    updateEmpty();
    appendNextPage();
  }

  function updateEmpty() {
    emptyState.hidden = state.list.length > 0;

    emptyState.textContent = state.cat === "favs"
      ? "No favorites yet. Tap the heart on any card to save it here."
      : state.cat === "trending"
        ? "Trending styles are not available."
        : "No styles found in this category.";
  }

  function updateMeta() {
    var total = state.list.length;
    cardsMeta.textContent = total
      ? "Showing " + state.shown + " of " + total
      : "";

    loadMoreBtn.hidden = state.shown >= total;

    if (!loadMoreBtn.hidden) {
      var left = total - state.shown;
      loadMoreBtn.textContent = "Show more styles (" + left + " left)";
    }
  }

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
     7. COPY + TOAST
     ========================================================== */
  var toastTimer = null;

  function showToast(msg) {
    toast.textContent = msg || "Copied!";
    toast.classList.add("show");
    clearTimeout(toastTimer);

    toastTimer = setTimeout(function () {
      toast.classList.remove("show");
    }, 1600);
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
    try {
      ok = document.execCommand("copy");
    } catch (e) {
      ok = false;
    }

    document.body.removeChild(ta);
    return ok;
  }

  function copyText(text) {
    if (navigator.clipboard && window.isSecureContext) {
      return navigator.clipboard.writeText(text).then(
        function () { return true; },
        function () { return fallbackCopy(text); }
      );
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
     8. FAVORITES TOGGLE
     ========================================================== */
  function toggleFav(card, favBtn) {
    var item = card.__item;
    var on = !favs[item.id];

    if (on) favs[item.id] = true;
    else delete favs[item.id];

    saveFavs();
    paintFav(favBtn, on);
    updateFavButton();

    showToast(on ? "Added to favorites ♥" : "Removed from favorites");

    if (state.cat === "favs" && !on) {
      card.remove();
      state.list = getList();
      state.shown = Math.max(0, state.shown - 1);
      updateEmpty();
      updateMeta();
    }
  }

  /* ==========================================================
     9. EVENTS
     ========================================================== */
  function saveName() {
    try {
      localStorage.setItem(STORAGE_KEY, state.name);
    } catch (e) {}
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
    if (!card) return;

    var favBtn = e.target.closest(".fav-btn");

    if (favBtn) {
      e.stopPropagation();
      toggleFav(card, favBtn);
      return;
    }

    copyCard(card);
  });

  cardGrid.addEventListener("keydown", function (e) {
    if (e.key !== "Enter" && e.key !== " ") return;
    if (e.target.closest(".fav-btn")) return;

    var card = e.target.closest(".card");
    if (!card) return;

    e.preventDefault();
    copyCard(card);
  });

  document.addEventListener("keydown", function (e) {
    if (
      e.key === "/" &&
      document.activeElement !== nameInput &&
      !/^(INPUT|TEXTAREA)$/.test(document.activeElement.tagName)
    ) {
      e.preventDefault();
      nameInput.focus();
    }
  });

  /* ==========================================================
     10. INIT
     ========================================================== */
  function init() {
    if (yearEl) yearEl.textContent = new Date().getFullYear();

    loadData();
    loadFavs();

    totalCount.textContent = allStyles.length;

    try {
      var saved = localStorage.getItem(STORAGE_KEY);
      if (saved) {
        nameInput.value = saved.slice(
          0,
          nameInput.maxLength > 0 ? nameInput.maxLength : 24
        );
        state.name = nameInput.value;
      }
    } catch (e) {}

    clearBtn.hidden = !nameInput.value.length;

    buildCategoryBar();
    renderAll();
  }

  init();
})();
