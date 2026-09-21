/**
 * Scrapes quest prerequisites from the Escape from Tarkov wiki.
 *
 *   npm run quest-prereqs
 *   npm run quest-prereqs -- --refresh    ignore the on-disk cache
 *
 * Why this exists: the tarkov.dev feed we build everything else from ships
 * prerequisites for only 230 of its 517 tasks. 287 tasks carry no prerequisite
 * at all, and 199 of those have no level requirement either — nothing whatever
 * gates them, so the tracker reported them as available from level 1 and the
 * whole "what can I do next" answer was several times too large. tarkov.dev's
 * GraphQL API has richer data but was returning "server unavailable"; the wiki
 * has it, and states it in structured form rather than prose.
 *
 * Unlike `check-quests.mjs`, which is a diagnostic that deliberately changes
 * nothing, this *is* a data source — so it earns its keep by being auditable:
 *
 *   - It writes a committed artifact, `data/quest-prereqs.json`, that a human
 *     can read and diff. It is not a black box inside the build. It lives in
 *     `data/` beside task-facts.json, not in `public/data/`, which the build
 *     wipes on every run.
 *   - It reads both `previous` and `leads to`, which describe the same edges
 *     from opposite ends, and reports how often the two agree. That percentage
 *     is the only honest quality signal a community source can offer.
 *   - Every name it could not match to a task is printed. A scraper that drops
 *     things silently is a scraper that quietly rots.
 *
 * The feed still wins wherever it has an opinion; these edges only fill gaps.
 * See the merge in build-data.mjs.
 */
import fs from "node:fs/promises";
import path from "node:path";
import process from "node:process";
import { fileURLToPath } from "node:url";
import { foldName, pageTitle, questEdges } from "./wiki-infobox.mjs";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const SRC = path.join(ROOT, "public", "data");
const OUT = path.join(ROOT, "data");
const CACHE = path.join(ROOT, "node_modules", ".cache", "wiki-quests");
const WIKI = "https://escapefromtarkov.fandom.com/api.php";
const TASKS_FEED = "https://json.tarkov.dev/regular/tasks";
const TASKS_EN = "https://json.tarkov.dev/regular/tasks_en";
const UA = "tarkov-map-project/0.1 (personal fan project; contact via GitHub)";
const CONCURRENCY = 4;

const refresh = process.argv.includes("--refresh");

/* ------------------------------------------------------------------ fetching */

/** Same client as check-quests.mjs: polite, backs off, gives up rather than hammering. */
async function wiki(params, attempt = 0) {
  const url = `${WIKI}?${new URLSearchParams({ format: "json", formatversion: "2", ...params })}`;
  try {
    const res = await fetch(url, { headers: { "user-agent": UA } });
    if (res.status === 429 || res.status >= 500) throw new Error(`HTTP ${res.status}`);
    if (!res.ok) return null;
    return await res.json();
  } catch (err) {
    if (attempt >= 3) {
      console.warn(`  ! giving up on ${params.page}: ${err.message}`);
      return null;
    }
    await new Promise((r) => setTimeout(r, 500 * 2 ** attempt));
    return wiki(params, attempt + 1);
  }
}

/**
 * Wikitext for one page, cached on disk.
 *
 * ~500 requests is several minutes and the wiki is somebody else's server. The
 * cache means iterating on the parser costs nothing, which is the difference
 * between checking the output properly and checking it once.
 */
async function wikitext(title) {
  const file = path.join(CACHE, `${encodeURIComponent(title)}.txt`);
  if (!refresh) {
    try {
      return await fs.readFile(file, "utf8");
    } catch {
      /* not cached yet */
    }
  }

  const data = await wiki({ action: "parse", page: title, prop: "wikitext" });
  const text = data?.parse?.wikitext ?? null;
  if (text === null) return null;
  await fs.mkdir(CACHE, { recursive: true });
  await fs.writeFile(file, text);
  return text;
}

/** Bounded parallelism; the wiki gets four requests at a time, not five hundred. */
async function mapLimit(items, limit, fn) {
  const out = new Array(items.length);
  let next = 0;
  await Promise.all(
    Array.from({ length: Math.min(limit, items.length) }, async () => {
      while (next < items.length) {
        const i = next++;
        out[i] = await fn(items[i], i);
      }
    }),
  );
  return out;
}

/* --------------------------------------------------------------------- main */

async function loadJson(url) {
  const res = await fetch(url, { headers: { Accept: "application/json", "user-agent": UA } });
  if (!res.ok) throw new Error(`${url} ${res.status}`);
  return res.json();
}

/**
 * Prefer the last built progression graph (translated names, canonical ids).
 * On a fresh machine or a wiki-first refresh, fall back to the live feed.
 */
async function loadTasks() {
  try {
    const progression = JSON.parse(await fs.readFile(path.join(SRC, "progression.json"), "utf8"));
    return Object.entries(progression.tasks).map(([id, t]) => ({
      id,
      name: t.name,
      title: pageTitle(t.wiki),
    }));
  } catch {
    /* no local build yet */
  }
  const [payload, dict] = await Promise.all([loadJson(TASKS_FEED), loadJson(TASKS_EN)]);
  const lookup = dict.data ?? {};
  const bag = payload.data?.tasks ?? {};
  return Object.values(bag).map((t) => {
    const raw = typeof t.name === "string" ? t.name : "";
    const name = (lookup[raw] ?? raw).replace(/\s+/g, " ").trim();
    return { id: t.id, name, title: pageTitle(t.wikiLink) };
  });
}

const tasks = await loadTasks();

const missingTitle = tasks.filter((t) => !t.title);
if (missingTitle.length) {
  console.warn(`${missingTitle.length} tasks have no usable wiki link and were skipped.`);
}

/*
 * Match on the page title *and* the task name, folded.
 *
 * The links inside an infobox are page titles, but a task's feed name and its
 * page title are not always the same string, and neither is reliably the one
 * used in a link. Indexing both is free and matches strictly more.
 */
const byName = new Map();
for (const task of tasks) {
  for (const key of [task.title, task.name]) {
    if (!key) continue;
    const folded = foldName(key);
    // First writer wins: a genuine duplicate is rare and arbitrary either way,
    // but silently overwriting would make the winner depend on object order.
    if (!byName.has(folded)) byName.set(folded, task.id);
  }
}

const fetchable = tasks.filter((t) => t.title);
console.log(`Reading ${fetchable.length} quest pages from the wiki…`);

const pages = await mapLimit(fetchable, CONCURRENCY, async (task, i) => {
  if (i > 0 && i % 100 === 0) console.log(`  …${i}`);
  const text = await wikitext(task.title);
  return { task, text };
});

/*
 * Edges are collected as "before -> after" pairs keyed by the pair itself, so
 * the two directions land on the same entry and we can see which sources
 * asserted it.
 */
const edges = new Map();
const unmatched = new Map();
const unfetched = [];

const resolve = (name, context) => {
  const id =
    byName.get(foldName(name)) ??
    // The wiki disambiguates a few titles that collide with an item or a
    // location — "Immunity (quest)". The qualifier is disambiguation, not part
    // of the name, so a second look without it is not a guess. Stripped here
    // rather than in foldName, which also builds the index: folding it there
    // could merge two genuinely different tasks.
    byName.get(foldName(name.replace(/\s*\([^)]*\)\s*$/, "")));
  if (id) return id;
  const seen = unmatched.get(name) ?? { name, count: 0, examples: [] };
  seen.count++;
  if (seen.examples.length < 3) seen.examples.push(context);
  unmatched.set(name, seen);
  return null;
};

const note = (beforeId, afterId, direction) => {
  if (!beforeId || !afterId || beforeId === afterId) return;
  const key = `${beforeId}>${afterId}`;
  const entry = edges.get(key) ?? { before: beforeId, after: afterId, from: new Set() };
  entry.from.add(direction);
  edges.set(key, entry);
};

for (const { task, text } of pages) {
  if (!text) {
    unfetched.push(task.title);
    continue;
  }
  const { previous, leadsTo } = questEdges(text);
  for (const name of previous) note(resolve(name, task.name), task.id, "previous");
  for (const name of leadsTo) note(task.id, resolve(name, task.name), "leadsTo");
}

/*
 * How often the two directions agree.
 *
 * An edge asserted from both ends is one two independent statements support. An
 * edge asserted from one end only is still probably right — plenty of pages
 * simply leave `leads to` blank — but it is the weaker half of the evidence,
 * and pretending otherwise would be the sort of quiet overclaiming this script
 * exists to avoid.
 */
const both = [...edges.values()].filter((e) => e.from.size === 2).length;
const agreement = edges.size ? Math.round((both / edges.size) * 100) : 0;

/** taskId -> the tasks that must come before it. */
const requires = {};
for (const edge of edges.values()) {
  (requires[edge.after] ??= []).push(edge.before);
}
for (const list of Object.values(requires)) list.sort();

const payload = {
  generated: new Date().toISOString(),
  source: "https://escapefromtarkov.fandom.com — Infobox quest `previous` / `leads to`",
  pages: fetchable.length,
  edges: edges.size,
  /** Share of edges both directions stated. Read this before trusting the rest. */
  agreement,
  tasksWithPrereqs: Object.keys(requires).length,
  /** Pages the wiki did not return. Named, so a redirect can be chased down. */
  unfetched,
  unmatched: [...unmatched.values()].sort((a, b) => b.count - a.count),
  requires: Object.fromEntries(Object.entries(requires).sort(([a], [b]) => a.localeCompare(b))),
};

const fetched = fetchable.length - unfetched.length;
if (fetchable.length && fetched / fetchable.length < 0.5) {
  console.error(
    `\nWiki returned only ${fetched}/${fetchable.length} pages — keeping the previous scrape.`,
  );
  process.exit(0);
}

await fs.writeFile(path.join(OUT, "quest-prereqs.json"), JSON.stringify(payload, null, 1));

/* ------------------------------------------------------------------- report */

let feedEdges = 0;
let feedCovered = 0;
try {
  const progression = JSON.parse(await fs.readFile(path.join(SRC, "progression.json"), "utf8"));
  feedEdges = Object.values(progression.tasks).reduce(
    (n, t) => n + t.requires.reduce((m, set) => m + set.length, 0),
    0,
  );
  feedCovered = Object.values(progression.tasks).filter((t) =>
    t.requires.some((set) => set.length > 0),
  ).length;
} catch {
  /* comparison is optional */
}

console.log(`
Pages read          ${fetchable.length - unfetched.length} of ${fetchable.length}
Edges found         ${edges.size}   (feed has ${feedEdges})
Both directions     ${both} of ${edges.size} — ${agreement}% agreement
Tasks with a prereq ${payload.tasksWithPrereqs} of ${tasks.length}   (feed covers ${feedCovered})
Unmatched names     ${payload.unmatched.length}`);

if (unfetched.length) {
  console.log(`\nPages the wiki did not return (${unfetched.length}):`);
  for (const title of unfetched) console.log(`  ${title}`);
}

if (payload.unmatched.length) {
  console.log("\nNames no task matched — check these before trusting the merge:");
  for (const miss of payload.unmatched.slice(0, 40)) {
    console.log(`  ${miss.name}  (linked from ${miss.examples.join(", ")})`);
  }
  if (payload.unmatched.length > 40) {
    console.log(`  …and ${payload.unmatched.length - 40} more, all in the JSON.`);
  }
}

console.log("\nWrote data/quest-prereqs.json");
