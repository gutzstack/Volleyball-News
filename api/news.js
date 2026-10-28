// Vercel serverless function: GET /api/news
// Fetches feeds live; Vercel's edge cache serves the result for 30 minutes and
// keeps serving the stale copy for up to a day while it refreshes.

import { collectNews } from "../lib/news.mjs";

export default async function handler(req, res) {
  try {
    const data = await collectNews({ log: console.log });
    if (!data.count) throw new Error("no stories fetched");
    res.setHeader("Cache-Control", "public, s-maxage=1800, stale-while-revalidate=86400");
    res.status(200).json(data);
  } catch (err) {
    console.error(err);
    res.setHeader("Cache-Control", "no-store");
    res.status(502).json({ error: "Could not load news feeds right now." });
  }
}
