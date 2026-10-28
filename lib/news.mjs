// Collects college volleyball headlines (weighted toward Nebraska) from RSS
// feeds. Shared by the Vercel function (api/news.js) and the local snapshot
// script (scripts/fetch-news.mjs). No dependencies — Node 18+ global fetch.

const MAX_AGE_DAYS = 30;
const MAX_ITEMS = 160;

const gnews = (q) =>
  `https://news.google.com/rss/search?q=${encodeURIComponent(q)}&hl=en-US&gl=US&ceid=US:en`;

// Each source tags its stories with a category. A story found by several
// sources keeps every tag.
export const SOURCES = [
  { tag: "huskers", url: gnews('"Nebraska volleyball" when:30d') },
  { tag: "huskers", url: gnews('Huskers volleyball when:30d') },
  { tag: "huskers", url: gnews('"Dani Busboom Kelly" when:30d') },
  { tag: "state", url: gnews('"Creighton volleyball" when:30d') },
  { tag: "state", url: gnews('"Omaha volleyball" Mavericks when:30d') },
  { tag: "state", url: gnews('"Nebraska-Kearney" OR "UNK" volleyball Lopers when:30d') },
  { tag: "state", url: gnews('"Omaha Supernovas" when:30d') },
  { tag: "state", url: gnews('Nebraska high school volleyball state tournament when:30d') },
  { tag: "bigten", url: gnews('"Big Ten" volleyball when:14d') },
  { tag: "national", url: gnews('NCAA women\'s volleyball when:14d') },
  { tag: "national", url: gnews('AVCA volleyball poll when:14d') },
  // Direct feeds; only volleyball stories are kept.
  { tag: "huskers", url: "https://huskers.com/rss?path=wvball", requireKeyword: true, name: "Huskers.com" },
  { tag: "huskers", url: "https://www.hailvarsity.com/rss/", requireKeyword: true, name: "Hail Varsity" },
  { tag: "national", url: "https://www.ncaa.com/news/volleyball-women/d1/rss.xml", name: "NCAA.com" },
];

const HUSKER_RE = /\b(huskers?|nebraska volleyball|busboom|bob devaney|devaney center|lincoln)\b/i;
const IN_STATE_RE = /\b(creighton|bluejays|mavericks|kearney|lopers|supernovas|wayne state|doane|concordia|nebraska wesleyan|hastings|class [a-d]\d?|nsaa)\b/i;
const NOT_VOLLEY_RE = /\b(football|basketball|baseball|softball|wrestling|beach)\b/i;

// ---------- tiny XML helpers ----------

const ENTITIES = { amp: "&", lt: "<", gt: ">", quot: '"', apos: "'", nbsp: " ", "#39": "'" };

export function decode(str = "") {
  return str
    .replace(/<!\[CDATA\[([\s\S]*?)\]\]>/g, "$1")
    .replace(/&#x([0-9a-f]+);/gi, (_, h) => String.fromCodePoint(parseInt(h, 16)))
    .replace(/&#(\d+);/g, (_, d) => String.fromCodePoint(Number(d)))
    .replace(/&([a-z#0-9]+);/gi, (m, e) => ENTITIES[e.toLowerCase()] ?? m);
}

const stripTags = (html = "") =>
  decode(html).replace(/<[^>]+>/g, " ").replace(/\s+/g, " ").trim();

function tag(block, name) {
  const m = block.match(new RegExp(`<${name}(\\s[^>]*)?>([\\s\\S]*?)</${name}>`, "i"));
  return m ? m[2].trim() : "";
}

function attr(block, name, attribute) {
  const m = block.match(new RegExp(`<${name}\\s[^>]*${attribute}=["']([^"']+)["']`, "i"));
  return m ? decode(m[1]) : "";
}

export function parseFeed(xml) {
  const items = [];
  const blocks = xml.match(/<item[\s>][\s\S]*?<\/item>/gi) || xml.match(/<entry[\s>][\s\S]*?<\/entry>/gi) || [];
  for (const b of blocks) {
    const link = decode(tag(b, "link")) || attr(b, "link", "href");
    const rawDesc = tag(b, "description") || tag(b, "summary") || tag(b, "content");
    items.push({
      title: stripTags(tag(b, "title")),
      link: link.trim(),
      date: tag(b, "pubDate") || tag(b, "published") || tag(b, "updated") || tag(b, "dc:date"),
      source: stripTags(tag(b, "source")),
      sourceUrl: attr(b, "source", "url"),
      description: rawDesc,
      image:
        attr(b, "media:content", "url") ||
        attr(b, "media:thumbnail", "url") ||
        attr(b, "enclosure", "url") ||
        (decode(rawDesc).match(/<img[^>]+src=["']([^"']+)["']/i) || [])[1] ||
        "",
    });
  }
  return items;
}

// ---------- normalization ----------

function splitSource(title, source) {
  // Google News titles look like "Headline - Outlet"
  if (source && title.endsWith(` - ${source}`)) return title.slice(0, -(source.length + 3));
  const m = title.match(/^(.*) - ([^-]{2,40})$/);
  return m && !source ? m[1] : title;
}

const keyOf = (title) =>
  title.toLowerCase().replace(/[^a-z0-9 ]/g, "").replace(/\s+/g, " ").split(" ").slice(0, 10).join(" ");

export function normalize(raw, src) {
  const source = raw.source || src.name || hostOf(raw.link);
  const title = splitSource(raw.title, raw.source);
  const date = new Date(raw.date);
  let summary = stripTags(raw.description);
  // Google News descriptions only repeat the headline + outlet.
  if (summary.toLowerCase().startsWith(title.toLowerCase().slice(0, 30))) summary = "";
  if (summary.length > 260) summary = summary.slice(0, 257).replace(/\s+\S*$/, "") + "…";
  const image = /^https?:\/\//.test(raw.image) && !/(google|gstatic)\./.test(raw.image) ? raw.image : "";
  return {
    title,
    link: raw.link,
    source,
    sourceDomain: hostOf(raw.sourceUrl || raw.link),
    published: isNaN(date) ? null : date.toISOString(),
    summary,
    image,
    tags: new Set([src.tag]),
  };
}

function hostOf(url) {
  try {
    return new URL(url).hostname.replace(/^www\./, "");
  } catch {
    return "";
  }
}

function classify(item) {
  const text = `${item.title} ${item.summary}`;
  if (HUSKER_RE.test(text) || /nebraska/i.test(item.title) && !IN_STATE_RE.test(text)) item.tags.add("huskers");
  if (IN_STATE_RE.test(text)) item.tags.add("state");
  if (/big ten|big 10|b1g/i.test(text)) item.tags.add("bigten");
}

export function merge(lists) {
  const byKey = new Map();
  const cutoff = Date.now() - MAX_AGE_DAYS * 864e5;
  for (const { src, items } of lists) {
    for (const raw of items) {
      if (!raw.title || !raw.link) continue;
      const text = `${raw.title} ${stripTags(raw.description)}`;
      if (src.requireKeyword && !/volleyball/i.test(text)) continue;
      if (NOT_VOLLEY_RE.test(raw.title) && !/volleyball/i.test(raw.title)) continue;

      const item = normalize(raw, src);
      if (item.published && Date.parse(item.published) < cutoff) continue;
      const key = keyOf(item.title);
      const existing = byKey.get(key);
      if (existing) {
        item.tags.forEach((t) => existing.tags.add(t));
        if (!existing.image && item.image) existing.image = item.image;
        if (!existing.summary && item.summary) existing.summary = item.summary;
      } else {
        byKey.set(key, item);
      }
    }
  }
  const items = [...byKey.values()];
  items.forEach(classify);
  items.sort((a, b) => (Date.parse(b.published) || 0) - (Date.parse(a.published) || 0));
  return items.slice(0, MAX_ITEMS).map((i) => ({ ...i, tags: [...i.tags] }));
}

async function fetchSource(src) {
  const res = await fetch(src.url, {
    headers: { "user-agent": "Mozilla/5.0 (compatible; TheDigNewsBot/1.0)" },
    signal: AbortSignal.timeout(20_000),
  });
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  return parseFeed(await res.text());
}

// Fetches every source in parallel; a failing feed is logged and skipped.
export async function collectNews({ log = () => {} } = {}) {
  const results = await Promise.allSettled(SOURCES.map(fetchSource));
  const lists = [];
  results.forEach((r, i) => {
    const src = SOURCES[i];
    if (r.status === "fulfilled") {
      log(`✓ ${String(r.value.length).padStart(3)}  ${src.name || src.url}`);
      lists.push({ src, items: r.value });
    } else {
      log(`✗      ${src.name || src.url} — ${r.reason?.message || r.reason}`);
    }
  });
  const items = merge(lists);
  return { generatedAt: new Date().toISOString(), count: items.length, items };
}
