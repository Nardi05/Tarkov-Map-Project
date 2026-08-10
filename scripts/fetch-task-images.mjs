/**
 * Collects the screenshots the EFT wiki has for each task and caches them in
 * data/task-images.json, which is committed to the repo.
 *
 *   npm run images          fill in tasks that have no entry yet
 *   npm run images -- --force   refetch everything
 *
 * Deliberately NOT part of `npm run data`. That runs on every deploy, and a
 * deploy must not depend on the wiki being up or on 500 extra HTTP calls. The
 * cache ships in the repo; build-data just copies it into public/data.
 *
 * Only tasks with objectives on a playable map are fetched — those are the only
 * ones the map's detail panel can open.
 */
import fs from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = path.join(path.dirname(fileURLToPath(import.meta.url)), "..");
const MAPS = path.join(ROOT, "public", "data", "maps");
const CACHE = path.join(ROOT, "data", "task-images.json");
const API = "https://escapefromtarkov.fandom.com/api.php";
const UA = "tarkov-map-project/0.1 (personal fan project; contact via GitHub)";

/**
 * Wiki task pages carry three kinds of image: the raid screenshots we want, a
 * ~314px "banner", and 64px item/key icons. Size separates them cleanly —
 * every real screenshot is a game capture, so 400px is a wide margin.
 */
const MIN_WIDTH = 400;
const CONCURRENCY = 4;

const force = process.argv.includes("--force");

async function api(params, attempt = 0) {
  const url = `${API}?${new URLSearchParams({ format: "json", formatversion: "2", ...params })}`;
  try {
    const res = await fetch(url, { headers: { "user-agent": UA } });
    if (res.status === 429 || res.status >= 500) throw new Error(`HTTP ${res.status}`);
    if (!res.ok) return null;
    return await res.json();
  } catch (err) {
    // The wiki rate-limits in bursts; back off rather than losing the task.
    if (attempt >= 3) {
      console.warn(`  ! giving up on ${params.page ?? params.titles}: ${err.message}`);
      return null;
    }
    await new Promise((r) => setTimeout(r, 500 * 2 ** attempt));
    return api(params, attempt + 1);
  }
}

/** "https://…/wiki/Urban_Medicine" -> "Urban Medicine" */
function pageTitle(wikiUrl, fallbackName) {
  if (!wikiUrl) return fallbackName;
  const tail = wikiUrl.split("/wiki/")[1];
  if (!tail) return fallbackName;
  return decodeURIComponent(tail).replace(/_/g, " ");
}

async function imagesFor(page) {
  const parsed = await api({ action: "parse", page, prop: "images" });
  const files = (parsed?.parse?.images ?? [])
    .filter((f) => /\.(png|jpe?g|webp)$/i.test(f))
    .map((f) => `File:${f}`);
  if (files.length === 0) return [];

  const out = [];
  // The API caps titles per request; 40 is comfortably inside it.
  for (let i = 0; i < files.length; i += 40) {
    const info = await api({
      action: "query",
      titles: files.slice(i, i + 40).join("|"),
      prop: "imageinfo",
      iiprop: "url|size|mime",
    });
    for (const p of info?.query?.pages ?? []) {
      const ii = p.imageinfo?.[0];
      if (!ii?.url || !/^image\/(png|jpeg|webp)$/.test(ii.mime ?? "")) continue;
      if ((ii.width ?? 0) < MIN_WIDTH) continue;
      out.push({
        url: ii.url,
        width: ii.width,
        height: ii.height,
        title: p.title.replace(/^File:/, "").replace(/\.(png|jpe?g|webp)$/i, ""),
      });
    }
  }
  // Stable order so a refetch doesn't reshuffle somebody's gallery.
  return out.sort((a, b) => a.title.localeCompare(b.title));
}

/* ------------------------------------------------------------------ collect */

const tasks = new Map();
for (const file of await fs.readdir(MAPS)) {
  const data = JSON.parse(await fs.readFile(path.join(MAPS, file), "utf8"));
  for (const [id, task] of Object.entries(data.tasks)) {
    if (!tasks.has(id)) tasks.set(id, { id, name: task.name, wiki: task.wiki });
  }
}

let cache = {};
try {
  cache = JSON.parse(await fs.readFile(CACHE, "utf8")).tasks ?? {};
} catch {
  /* first run */
}

const todo = [...tasks.values()].filter((t) => force || !(t.id in cache));
console.log(`${tasks.size} tasks on a map, ${todo.length} to fetch${force ? " (forced)" : ""}`);

let done = 0;
let withImages = 0;
async function worker(queue) {
  for (const task of queue) {
    const images = await imagesFor(pageTitle(task.wiki, task.name));
    cache[task.id] = images;
    if (images.length) withImages++;
    done++;
    if (done % 25 === 0) console.log(`  ${done}/${todo.length}…`);
  }
}

const lanes = Array.from({ length: CONCURRENCY }, (_, i) =>
  worker(todo.filter((_, idx) => idx % CONCURRENCY === i)),
);
await Promise.all(lanes);

await fs.mkdir(path.dirname(CACHE), { recursive: true });
await fs.writeFile(
  CACHE,
  JSON.stringify({ generated: new Date().toISOString(), source: "escapefromtarkov.fandom.com", tasks: cache }),
);

const total = Object.values(cache).reduce((n, list) => n + list.length, 0);
const populated = Object.values(cache).filter((l) => l.length).length;
const kb = ((await fs.stat(CACHE)).size / 1024).toFixed(0);
console.log(
  `\nWrote ${kb}KB to data/task-images.json — ${total} screenshots across ${populated}/${Object.keys(cache).length} tasks`,
);
