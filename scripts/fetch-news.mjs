#!/usr/bin/env node
// Writes a snapshot of the news feed to data/news.json. The site uses it as a
// fallback when /api/news is unavailable (e.g. a plain static server).

import { writeFile, mkdir } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { collectNews } from "../lib/news.mjs";

const OUT = resolve(dirname(fileURLToPath(import.meta.url)), "../data/news.json");

const data = await collectNews({ log: console.log });
if (!data.count) {
  console.error("No stories fetched; leaving existing data/news.json untouched.");
  process.exit(1);
}
await mkdir(dirname(OUT), { recursive: true });
await writeFile(OUT, JSON.stringify(data, null, 2) + "\n");
console.log(`Wrote ${data.count} stories → ${OUT}`);
