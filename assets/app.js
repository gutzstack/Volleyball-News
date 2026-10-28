// The Dig: renders the volleyball news feed.
// Tries the live API (/api/news on Vercel) first, then the static snapshot.

const SOURCES = ["/api/news", "data/news.json"];
const PAGE = 18;
const REFRESH_MS = 15 * 60 * 1000;

const TAGS = {
  huskers: { label: "Huskers", word: "Huskers", color: "#d00000" },
  state: { label: "Around Nebraska", word: "Nebraska", color: "#1f3a5f" },
  bigten: { label: "Big Ten", word: "Big Ten", color: "#2a2522" },
  national: { label: "National", word: "NCAA", color: "#b5531d" },
};
const TAG_ORDER = ["huskers", "state", "bigten", "national"];

const BALL_SVG = `<svg viewBox="0 0 64 64" aria-hidden="true"><circle cx="32" cy="32" r="29" fill="none" stroke="currentColor" stroke-width="3"/><path d="M32 3c-6 10-6 22 0 29M32 32c8 4 20 4 28-3M32 32c-2 9-10 19-21 23M18 8c4 12 14 20 14 24M57 46c-12-2-22 0-25-14M6 40c11-4 22-8 26-8" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round"/></svg>`;

const $ = (id) => document.getElementById(id);
const state = { items: [], filter: "all", query: "", shown: PAGE, lastVisit: 0 };

// ---------- storage (best effort) ----------

const store = {
  get(k) {
    try { return localStorage.getItem(k); } catch { return null; }
  },
  set(k, v) {
    try { localStorage.setItem(k, v); } catch { /* private mode */ }
  },
};

// ---------- theme ----------

function initTheme() {
  const saved = store.get("dig-theme");
  if (saved) document.documentElement.dataset.theme = saved;
  $("themeToggle").addEventListener("click", () => {
    const current =
      document.documentElement.dataset.theme ||
      (matchMedia("(prefers-color-scheme: dark)").matches ? "dark" : "light");
    const next = current === "dark" ? "light" : "dark";
    document.documentElement.dataset.theme = next;
    store.set("dig-theme", next);
  });
}

// ---------- helpers ----------

function hash(str) {
  let h = 2166136261;
  for (let i = 0; i < str.length; i++) h = Math.imul(h ^ str.charCodeAt(i), 16777619);
  return h >>> 0;
}

function timeAgo(iso) {
  if (!iso) return "";
  const s = (Date.now() - Date.parse(iso)) / 1000;
  if (s < 60) return "just now";
  if (s < 3600) return `${Math.floor(s / 60)}m ago`;
  if (s < 86400) return `${Math.floor(s / 3600)}h ago`;
  if (s < 86400 * 7) return `${Math.floor(s / 86400)}d ago`;
  return new Date(iso).toLocaleDateString(undefined, { month: "short", day: "numeric" });
}

const primaryTag = (item) => TAG_ORDER.find((t) => item.tags.includes(t)) || "national";
const favicon = (domain) => `https://www.google.com/s2/favicons?domain=${encodeURIComponent(domain)}&sz=32`;
const isNew = (item) => state.lastVisit && Date.parse(item.published) > state.lastVisit;

// Paints a story's image, or a generated volleyball graphic in its category colour.
function paintArt(container, item) {
  const tag = TAGS[primaryTag(item)];
  const h = hash(item.title);
  const art = document.createElement("div");
  art.className = "art";
  art.style.setProperty("--art-bg", tag.color);

  const generated = () => {
    art.classList.add("art--gen");
    art.style.setProperty("--art-angle", `${(h % 4) * 45 + 20}deg`);
    art.style.setProperty("--art-x", `${20 + (h % 60)}%`);
    art.style.setProperty("--art-y", `${10 + ((h >> 8) % 50)}%`);
    art.style.setProperty("--art-rot", `${(h >> 4) % 360}deg`);
    art.innerHTML = BALL_SVG;
    const word = document.createElement("span");
    word.className = "art__word";
    word.textContent = tag.word;
    art.append(word);
  };

  if (item.image) {
    const img = new Image();
    img.alt = "";
    img.loading = "lazy";
    img.referrerPolicy = "no-referrer";
    img.onerror = () => { img.remove(); generated(); };
    img.src = item.image;
    art.append(img);
  } else {
    generated();
  }
  container.replaceChildren(art);
}

function chips(item) {
  const frag = document.createDocumentFragment();
  if (isNew(item)) frag.append(chip("New", "chip--new"));
  item.tags
    .slice()
    .sort((a, b) => TAG_ORDER.indexOf(a) - TAG_ORDER.indexOf(b))
    .slice(0, 2)
    .forEach((t) => TAGS[t] && frag.append(chip(TAGS[t].label)));
  return frag;
}

function chip(text, extra = "") {
  const el = document.createElement("span");
  el.className = `chip ${extra}`.trim();
  el.textContent = text;
  return el;
}

// ---------- rendering ----------

function filtered() {
  const q = state.query.trim().toLowerCase();
  return state.items.filter(
    (i) =>
      (state.filter === "all" || i.tags.includes(state.filter)) &&
      (!q || `${i.title} ${i.summary} ${i.source}`.toLowerCase().includes(q)),
  );
}

function renderHero(item) {
  const hero = $("hero");
  if (!item) return hero.replaceChildren();
  const a = document.createElement("a");
  a.className = "hero";
  a.href = item.link;
  a.target = "_blank";
  a.rel = "noopener";
  a.innerHTML = `
    <div class="hero__art"></div>
    <div class="hero__body">
      <span class="hero__kicker"></span>
      <h2 class="hero__title"></h2>
      <p class="hero__summary"></p>
      <div class="card__meta">
        <img class="card__favicon" alt="" width="16" height="16" />
        <span class="card__source"></span><span class="dot">•</span><time class="card__time"></time>
      </div>
    </div>`;
  paintArt(a.querySelector(".hero__art"), item);
  a.querySelector(".hero__kicker").textContent =
    `${isNew(item) ? "New · " : ""}Top story · ${TAGS[primaryTag(item)].label}`;
  a.querySelector(".hero__title").textContent = item.title;
  const summary = a.querySelector(".hero__summary");
  item.summary ? (summary.textContent = item.summary) : summary.remove();
  fillMeta(a, item);
  hero.replaceChildren(a);
}

function fillMeta(root, item) {
  const fav = root.querySelector(".card__favicon");
  if (item.sourceDomain) fav.src = favicon(item.sourceDomain);
  else fav.remove();
  root.querySelector(".card__source").textContent = item.source;
  const time = root.querySelector(".card__time");
  time.textContent = timeAgo(item.published);
  if (item.published) {
    time.dateTime = item.published;
    time.title = new Date(item.published).toLocaleString();
  }
}

function renderCard(item, i) {
  const node = $("cardTpl").content.firstElementChild.cloneNode(true);
  node.style.setProperty("--i", i % PAGE);
  const link = node.querySelector(".card__link");
  link.href = item.link;
  paintArt(node.querySelector(".card__art"), item);
  node.querySelector(".card__chips").append(chips(item));
  node.querySelector(".card__title").textContent = item.title;
  node.querySelector(".card__summary").textContent = item.summary || "";
  fillMeta(node, item);
  return node;
}

function render() {
  const list = filtered();
  const searching = !!state.query.trim();
  // The hero is the newest Husker story (when one exists in this view).
  const hero = searching ? null : list.find((i) => i.tags.includes("huskers")) || list[0];
  renderHero(hero);

  const rest = list.filter((i) => i !== hero);
  const grid = $("grid");
  $("feedTitle").textContent = searching
    ? `Results for “${state.query.trim()}”`
    : state.filter === "all" ? "Latest" : TAGS[state.filter].label;

  if (!list.length) {
    grid.innerHTML = `<div class="empty"><h3>${state.items.length ? "No matches" : "Warming up"}</h3><p></p></div>`;
    grid.querySelector("p").textContent = state.items.length
      ? "Nothing here right now. Try another tab or search."
      : "Headlines haven't been fetched yet. Check back in a few minutes.";
    $("more").hidden = true;
    return;
  }

  grid.replaceChildren(...rest.slice(0, state.shown).map(renderCard));
  $("more").hidden = rest.length <= state.shown;
}

function renderTicker() {
  const top = state.items.slice(0, 12);
  const make = () =>
    top.map((i) => {
      const a = document.createElement("a");
      a.href = i.link;
      a.target = "_blank";
      a.rel = "noopener";
      a.textContent = i.title;
      return a;
    });
  // Two copies so the CSS loop scrolls seamlessly.
  $("ticker").replaceChildren(...make(), ...make());
  if (!top.length) $("ticker").textContent = "Fetching the latest from around the volleyball world…";
}

function renderStateList() {
  const items = state.items.filter((i) => i.tags.includes("state") && !i.tags.includes("huskers")).slice(0, 5);
  const ol = $("stateList");
  if (!items.length) {
    ol.innerHTML = `<li class="none">No in-state stories yet.</li>`;
    return;
  }
  ol.replaceChildren(
    ...items.map((i) => {
      const li = document.createElement("li");
      const a = document.createElement("a");
      a.href = i.link;
      a.target = "_blank";
      a.rel = "noopener";
      a.textContent = i.title;
      const small = document.createElement("small");
      small.textContent = `${i.source} · ${timeAgo(i.published)}`;
      li.append(a, small);
      return li;
    }),
  );
}

function renderCounts() {
  document.querySelectorAll("#tabs button").forEach((b) => {
    const f = b.dataset.filter;
    const n = f === "all" ? state.items.length : state.items.filter((i) => i.tags.includes(f)).length;
    let c = b.querySelector(".count");
    if (!c) b.append((c = Object.assign(document.createElement("span"), { className: "count" })));
    c.textContent = n || "";
  });
}

function renderSkeleton() {
  $("hero").innerHTML = `<div class="skeleton skeleton--hero"></div>`;
  $("grid").innerHTML = Array(6).fill(`<div class="skeleton skeleton--card"></div>`).join("");
}

// ---------- data ----------

async function load() {
  for (const url of SOURCES) {
    try {
      const res = await fetch(url, { cache: "no-cache" });
      if (!res.ok) continue;
      const data = await res.json();
      if (Array.isArray(data.items) && (data.items.length || url === SOURCES.at(-1))) return data;
    } catch { /* try next source */ }
  }
  return { generatedAt: null, items: [] };
}

async function refresh() {
  const data = await load();
  state.items = data.items;
  $("updated").textContent = data.generatedAt ? `Updated ${timeAgo(data.generatedAt)}` : "";
  renderCounts();
  renderTicker();
  renderStateList();
  render();
}

// ---------- events ----------

function initControls() {
  $("tabs").addEventListener("click", (e) => {
    const btn = e.target.closest("button");
    if (!btn) return;
    document.querySelectorAll("#tabs button").forEach((b) => b.setAttribute("aria-selected", b === btn));
    state.filter = btn.dataset.filter;
    state.shown = PAGE;
    render();
  });
  let t;
  $("search").addEventListener("input", (e) => {
    clearTimeout(t);
    t = setTimeout(() => {
      state.query = e.target.value;
      state.shown = PAGE;
      render();
    }, 120);
  });
  $("more").addEventListener("click", () => {
    state.shown += PAGE;
    render();
  });
}

function init() {
  $("today").textContent = new Date().toLocaleDateString(undefined, {
    weekday: "long", month: "long", day: "numeric", year: "numeric",
  });
  state.lastVisit = Number(store.get("dig-last-visit")) || 0;
  store.set("dig-last-visit", Date.now());
  initTheme();
  initControls();
  renderSkeleton();
  refresh();
  setInterval(refresh, REFRESH_MS);
}

init();
