/**
 * Scrapes the Escape from Tarkov wiki for the detail the tarkov.dev feed does
 * not carry, and writes it to committed files in data/.
 *
 *   npm run wiki-details
 *   npm run wiki-details -- --refresh    ignore the on-disk page cache
 *
 * What it gathers, per page type:
 *
 *   quests    objectives (with the optional ones marked), rewards, the quest
 *             item table (amounts, found-in-raid), how to start it, the guide,
 *             and the level / Kappa facts the feed has been dropping
 *   keys      where the key spawns, where its lock is, what is behind it, and
 *             which quests use it
 *   chapters  the story chapters' full objective lists, how each one starts,
 *             and their guides — the site's own story data keeps only the
 *             steps that decide an ending
 *
 * Why the wiki: tarkov.dev's JSON feed has been serving a thin task list (2.5%
 * Kappa, 55% without a level gate, where a healthy feed sits near 50% and 15%)
 * and its GraphQL API answers "server unavailable". The wiki states all of
 * this in structured templates and fixed section headings. It is licensed
 * CC BY-SA, which is why the site credits it wherever this text appears.
 *
 * Polite by construction: pages are fetched fifty to a request through the
 * MediaWiki query API rather than one at a time, and cached on disk so that
 * iterating on the parser never touches the network again.
 *
 * Like fetch-quest-prereqs.mjs this writes auditable artifacts rather than
 * feeding the build directly, and prints every page it could not find.
 */
import fs from "node:fs/promises";
import path from "node:path";
import process from "node:process";
import { fileURLToPath } from "node:url";
import { parseChapterPage, parseKeyPage, parseQuestPage } from "./wiki-details.mjs";
import { pageTitle } from "./wiki-infobox.mjs";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const OUT = path.join(ROOT, "data");
const CACHE = path.join(ROOT, "node_modules", ".cache", "wiki-pages");
const WIKI = "https://escapefromtarkov.fandom.com/api.php";
const TASKS_FEED = "https://json.tarkov.dev/regular/tasks";
const TASKS_EN = "https://json.tarkov.dev/regular/tasks_en";
const UA = "tarkov-map-project/0.1 (personal fan project; contact via GitHub)";
const BATCH = 50;

const refresh = process.argv.includes("--refresh");

/* ------------------------------------------------------------------ fetching */

async function api(params, attempt = 0) {
  const body = new URLSearchParams({ format: "json", formatversion: "2", ...params });
  try {
    const res = await fetch(WIKI, {
      method: "POST",
      headers: { "user-agent": UA, "content-type": "application/x-www-form-urlencoded" },
      body,
    });
    if (res.status === 429 || res.status >= 500) throw new Error(`HTTP ${res.status}`);
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    return await res.json();
  } catch (err) {
    if (attempt >= 4) throw err;
    await new Promise((r) => setTimeout(r, 1000 * 2 ** attempt));
    return api(params, attempt + 1);
  }
}

const cacheFile = (title) => path.join(CACHE, `${encodeURIComponent(title)}.txt`);

/**
 * Wikitext for many titles at once. Returns title -> text, with redirects
 * followed and recorded under the title that was asked for. Missing pages are
 * absent from the result.
 */
async function pages(titles) {
  await fs.mkdir(CACHE, { recursive: true });
  const out = new Map();
  const todo = [];
  for (const title of new Set(titles)) {
    if (!refresh) {
      try {
        out.set(title, await fs.readFile(cacheFile(title), "utf8"));
        continue;
      } catch {
        /* not cached */
      }
    }
    todo.push(title);
  }

  for (let i = 0; i < todo.length; i += BATCH) {
    const chunk = todo.slice(i, i + BATCH);
    const data = await api({
      action: "query",
      prop: "revisions",
      rvprop: "content",
      rvslots: "main",
      redirects: "1",
      titles: chunk.join("|"),
    });
    const q = data.query ?? {};
    // Asked-for title -> final title, through normalisation and redirects.
    const final = new Map(chunk.map((t) => [t, t]));
    for (const n of q.normalized ?? []) for (const [k, v] of final) if (v === n.from) final.set(k, n.to);
    for (const r of q.redirects ?? []) for (const [k, v] of final) if (v === r.from) final.set(k, r.to);
    const byTitle = new Map();
    for (const page of q.pages ?? []) {
      const text = page.revisions?.[0]?.slots?.main?.content;
      if (typeof text === "string") byTitle.set(page.title, text);
    }
    for (const asked of chunk) {
      const text = byTitle.get(final.get(asked));
      if (text == null) continue;
      out.set(asked, text);
      await fs.writeFile(cacheFile(asked), text);
    }
    process.stdout.write(`  fetched ${Math.min(i + BATCH, todo.length)}/${todo.length}\r`);
    await new Promise((r) => setTimeout(r, 400));
  }
  if (todo.length) process.stdout.write("\n");
  return out;
}

/* -------------------------------------------------------------------- inputs */

async function readJson(file) {
  return JSON.parse(await fs.readFile(file, "utf8"));
}

/** Every task, from the site's own snapshot plus the live feed for anything new. */
async function loadTasks() {
  const tasks = new Map();
  const progression = await readJson(path.join(ROOT, "public", "data", "progression.json"));
  for (const [id, t] of Object.entries(progression.tasks)) {
    if (t.wiki) tasks.set(id, { id, name: t.name, title: pageTitle(t.wiki) });
  }
  try {
    const [feed, en] = await Promise.all([
      fetch(TASKS_FEED).then((r) => r.json()),
      fetch(TASKS_EN).then((r) => r.json()),
    ]);
    const dict = en.data ?? {};
    const bag = Array.isArray(feed.data) ? feed.data : Object.values(feed.data?.tasks ?? feed.data ?? {});
    for (const t of bag) {
      if (tasks.has(t.id) || !t.wikiLink) continue;
      tasks.set(t.id, { id: t.id, name: dict[t.name] ?? t.name, title: pageTitle(t.wikiLink) });
    }
  } catch (err) {
    console.warn(`  live task feed unavailable (${err.message}); using the snapshot only`);
  }
  const season = await readJson(path.join(ROOT, "src", "data", "kord-season.json"));
  for (const q of season.questline) {
    if (q.wiki) tasks.set(q.id, { id: q.id, name: q.name, title: pageTitle(q.wiki) });
  }
  return [...tasks.values()].filter((t) => t.title);
}

/** Every key that opens a lock drawn on a map, or that a task needs. */
async function loadKeys() {
  const keys = new Map();
  const dir = path.join(ROOT, "public", "data", "maps");
  for (const file of await fs.readdir(dir)) {
    const map = await readJson(path.join(dir, file));
    for (const k of Object.values(map.keys ?? {})) {
      if (k.wiki) keys.set(k.id, { id: k.id, name: k.name, title: pageTitle(k.wiki) });
    }
  }
  const progression = await readJson(path.join(ROOT, "public", "data", "progression.json"));
  for (const k of Object.values(progression.keys ?? {})) {
    if (k.wiki && !keys.has(k.id)) keys.set(k.id, { id: k.id, name: k.name, title: pageTitle(k.wiki) });
  }
  return [...keys.values()].filter((k) => k.title);
}

async function loadChapters() {
  const data = await api({
    action: "query",
    list: "categorymembers",
    cmtitle: "Category:Story chapters",
    cmlimit: "100",
  });
  return (data.query?.categorymembers ?? [])
    .map((m) => m.title)
    .filter((t) => t !== "Story chapters");
}

/* ---------------------------------------------------------------------- main */

const stamp = new Date().toISOString();
const source = "Escape from Tarkov Wiki (escapefromtarkov.fandom.com), CC BY-SA 3.0";

console.log("Quests");
const tasks = await loadTasks();
const questPages = await pages(tasks.map((t) => t.title));
const questOut = {};
const questMissing = [];
for (const t of tasks) {
  const text = questPages.get(t.title);
  if (!text) {
    questMissing.push(t.title);
    continue;
  }
  questOut[t.id] = { title: t.title, ...parseQuestPage(text) };
}

console.log("Keys");
const keys = await loadKeys();
const keyPages = await pages(keys.map((k) => k.title));
const keyOut = {};
const keyMissing = [];
for (const k of keys) {
  const text = keyPages.get(k.title);
  if (!text) {
    keyMissing.push(k.title);
    continue;
  }
  const parsed = parseKeyPage(text);
  // The infobox names the item id it describes. A page that names a different
  // one is the wrong page, whatever the link said.
  if (parsed.itemId && parsed.itemId !== k.id) {
    keyMissing.push(`${k.title} (page is for ${parsed.itemId})`);
    continue;
  }
  delete parsed.itemId;
  keyOut[k.id] = { title: k.title, ...parsed };
}

console.log("Story chapters");
const chapters = await loadChapters();
const chapterPages = await pages(chapters);
const chapterOut = {};
for (const title of chapters) {
  const text = chapterPages.get(title);
  if (text) chapterOut[title] = parseChapterPage(text);
}

/*
 * A wiki that answered only part of the batch must not replace a good file
 * with a thin one. Compared against what is already committed.
 */
async function previousCount(file, field) {
  try {
    return Object.keys((await readJson(path.join(OUT, file)))[field] ?? {}).length;
  } catch {
    return 0;
  }
}
for (const [file, field, now] of [
  ["wiki-tasks.json", "tasks", Object.keys(questOut).length],
  ["wiki-keys.json", "keys", Object.keys(keyOut).length],
  ["wiki-story.json", "chapters", Object.keys(chapterOut).length],
]) {
  const before = await previousCount(file, field);
  if (before && now < before * 0.8) {
    console.error(`Refusing to write ${file}: ${now} entries, down from ${before}.`);
    process.exit(1);
  }
}

await fs.mkdir(OUT, { recursive: true });
const write = (file, body) =>
  fs.writeFile(path.join(OUT, file), `${JSON.stringify({ generated: stamp, source, ...body }, null, 1)}\n`);
await write("wiki-tasks.json", { tasks: questOut });
await write("wiki-keys.json", { keys: keyOut });
await write("wiki-story.json", { chapters: chapterOut });

/* -------------------------------------------------------------------- report */

const qs = Object.values(questOut);
const count = (list, f) => list.filter(f).length;
const ks = Object.values(keyOut);
console.log(`
Quests   ${qs.length} of ${tasks.length} pages parsed
  objectives        ${count(qs, (q) => q.objectives.length)}
  rewards           ${count(qs, (q) => q.rewards.length)}
  quest item table  ${count(qs, (q) => q.items.length)}
  guide             ${count(qs, (q) => q.guide.length)}
  player level      ${count(qs, (q) => q.minPlayerLevel)}
  Kappa stated      ${count(qs, (q) => q.kappaRequired !== null)}
Keys     ${ks.length} of ${keys.length} pages parsed
  where to find     ${count(ks, (k) => k.found.length)}
  lock location     ${count(ks, (k) => k.lock)}
  behind the lock   ${count(ks, (k) => k.behind)}
Chapters ${Object.keys(chapterOut).length}: ${Object.entries(chapterOut)
  .map(([t, c]) => `${t} (${c.objectives.reduce((n, g) => n + g.items.length, 0)} objectives)`)
  .join(", ")}
`);
if (questMissing.length) console.log(`No wiki page for ${questMissing.length} quests:\n  ${questMissing.join("\n  ")}`);
if (keyMissing.length) console.log(`No usable wiki page for ${keyMissing.length} keys:\n  ${keyMissing.join("\n  ")}`);
