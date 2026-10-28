# The Dig 🏐

A Nebraska-focused college volleyball news wire. It collects the latest headlines on the
Huskers, in-state programs (Creighton, Omaha, UNK, high school, Omaha Supernovas), the Big Ten,
and national NCAA volleyball, then shows them in a clean, editorial layout.

## How it works

| Piece | What it does |
| --- | --- |
| `lib/news.mjs` | Pulls Google News RSS searches and direct feeds (Huskers.com, Hail Varsity, NCAA.com), drops non-volleyball stories, merges duplicates, and tags each story. |
| `api/news.js` | Vercel serverless function at `/api/news`. Vercel's edge cache serves the result for 30 minutes, so feeds are fetched at most about twice an hour. |
| `index.html`, `assets/` | Static front end with no build step. It reads `/api/news`, or falls back to `data/news.json`. |
| `scripts/fetch-news.mjs` | Writes a snapshot to `data/news.json` for local development or static hosting. |

## Deploy to Vercel

1. Go to <https://vercel.com/new> and import the `gutzstack/Volleyball-News` repository.
2. Leave the framework preset at **Other**, with no build command and no output directory.
3. Click **Deploy**.

Every push to the production branch (`main` by default) updates the **Production** deployment.
Pushes to other branches get their own preview URLs. To make a different branch the production
branch, go to **Project → Settings → Environments → Production → Branch Tracking**.

## Run locally

```bash
npm run dev          # fetch a snapshot into data/news.json, then serve on :8080
npx vercel dev       # or run the real /api/news function locally
```

Requires Node 18 or newer. There are no dependencies.
