/**
 * Builds data/task-facts.json — a vendored fallback for the two task fields
 * the upstream feed has been known to drop: the player-level gate and the
 * Kappa flag.
 *
 *   npm run task-facts
 *
 * Why this exists: `npm run data` re-fetches on every deploy, so a bad hour at
 * tarkov.dev becomes a bad deploy. Those two fields going sparse is quiet —
 * a missing level just hides the chip — and the site would look fine while
 * being wrong. build-data.mjs reaches for this file *only* when the live feed
 * looks degraded, so once upstream is healthy again the live values win and
 * this can never go stale behind their back.
 *
 * Sources, in order of trust:
 *   1. public/data — our own last-known-good build. Same source as the live
 *      feed, just from a moment when it was complete, so it needs no
 *      reconciling and covers every task the site can display.
 *   2. The EFT wiki, for anything the snapshot has never seen (a new wipe's
 *      tasks). Measured against the snapshot before trusting it: the Kappa
 *      flag agreed 35/35 with 5 silent, and the player level never once
 *      disagreed — though the wiki only states a level on about a quarter of
 *      pages, so this fills less than you would hope and is a supplement
 *      rather than a replacement.
 *
 * Note the wiki writes two different things as "level": "Must be level 6 to
 * start this quest" is the player gate, while "Obtain level 2 loyalty with
 * Prapor" is a trader standing. Only the first is read here — conflating them
 * silently invents level requirements that do not exist.
 */
import fs from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = path.join(path.dirname(fileURLToPath(import.meta.url)), "..");
const MAPS = path.join(ROOT, "public", "data", "maps");
const OUT = path.join(ROOT, "data", "task-facts.json");
const WIKI = "https://escapefromtarkov.fandom.com/api.php";
const UA = "tarkov-map-project/0.1 (personal fan project; contact via GitHub)";
const CONCURRENCY = 4;

async function wiki(params, attempt = 0) {
  const url = `${WIKI}?${new URLSearchParams({ format: "json", formatversion: "2", ...params })}`;
  try {
    const res = await fetch(url, { headers: { "user-agent": UA } });
    if (res.status === 429 || res.status >= 500) throw new Error(`HTTP ${res.status}`);
    if (!res.ok) return null;
    return await res.json();
  } catch (err) {
    if (attempt >= 3) return null;
    await new Promise((r) => setTimeout(r, 500 * 2 ** attempt));
    return wiki(params, attempt + 1);
  }
}

const pageTitle = (task) => {
  const tail = task.wiki?.split("/wiki/")[1];
  return tail ? decodeURIComponent(tail).replace(/_/g, " ") : task.name;
};

async function wikiFacts(task) {
  const parsed = await wiki({ action: "parse", page: pageTitle(task), prop: "wikitext" });
  let wt = parsed?.parse?.wikitext;
  wt = typeof wt === "string" ? wt : wt?.["*"];
  if (!wt) return null;

  const kappaRaw = (wt.match(/\|\s*reqkappa\s*=([^\n]*)/i) ?? [])[1]?.toLowerCase() ?? "";
  const kappaRequired = kappaRaw.includes("yes") ? true : kappaRaw.includes("no") ? false : null;

  const requirements = (wt.match(/==\s*Requirements\s*==([\s\S]*?)(?:\n==|$)/i) ?? [])[1] ?? "";
  // Player gate only — never "level N loyalty".
  const levelMatch = requirements.match(/must be level\s+(\d+)/i);

  return {
    minPlayerLevel: levelMatch ? Number(levelMatch[1]) : null,
    kappaRequired,
  };
}

/* ------------------------------------------------------- the good snapshot */

const snapshot = new Map();
for (const file of await fs.readdir(MAPS)) {
  const data = JSON.parse(await fs.readFile(path.join(MAPS, file), "utf8"));
  for (const [id, task] of Object.entries(data.tasks)) {
    if (!snapshot.has(id)) snapshot.set(id, task);
  }
}

const tasks = [...snapshot.values()];
const kappaShare = tasks.filter((t) => t.kappaRequired).length / (tasks.length || 1);
const noLevelShare = tasks.filter((t) => !t.minPlayerLevel).length / (tasks.length || 1);
console.log(
  `public/data holds ${tasks.length} tasks — ${(kappaShare * 100).toFixed(0)}% Kappa, ` +
    `${(noLevelShare * 100).toFixed(0)}% ungated`,
);

/*
 * Refuse to bake a fallback out of data that is itself degraded — that would
 * quietly turn the safety net into a copy of the problem.
 *
 * The build's own verdict is what decides it, read from index.json. Measuring
 * the snapshot's shape here cannot work and used to be the whole check: when
 * the feed is thin, build-data patches it *from this very file*, so the
 * snapshot on disk reads healthy again and the ratios sail past. The guard
 * therefore passed in exactly the case it existed to catch, and a run would
 * write the feed's blanks back out as asserted facts — 63 tasks recorded as
 * "no level gate, not Kappa" on the strength of a feed that had said nothing.
 * Those assertions then outlive the outage, because a fill-only patch never
 * revisits a value that is already there.
 */
let feedDegraded = false;
try {
  feedDegraded = !!JSON.parse(await fs.readFile(path.join(ROOT, "public", "data", "index.json"), "utf8"))
    .feedDegraded;
} catch {
  console.error("\nNo public/data/index.json — run `npm run data` first.");
  process.exit(1);
}

if (feedDegraded) {
  console.error(
    "\npublic/data was built while the upstream feed was degraded, so its level\n" +
      "and Kappa values are this file's own patches reflected back. Regenerating\n" +
      "now would promote the feed's blanks to asserted facts.\n\n" +
      "Rebuild with `npm run data` once upstream is healthy, then re-run this.",
  );
  process.exit(1);
}

if (tasks.length < 100 || kappaShare < 0.2 || noLevelShare > 0.35) {
  console.error(
    "\npublic/data looks like it was built from a degraded feed.\n" +
      "Check out a known-good public/data before regenerating this fallback.",
  );
  process.exit(1);
}

/* ----------------------------------------------------------------- combine */

const facts = {};
for (const [id, task] of snapshot) {
  facts[id] = {
    name: task.name,
    minPlayerLevel: task.minPlayerLevel ?? 0,
    kappaRequired: !!task.kappaRequired,
    source: "snapshot",
  };
}

// Anything the snapshot has never seen can only come from the wiki. On a
// normal run this is empty; after a wipe it is the new questline.
const unseen = tasks.filter((t) => !(t.id in facts));
if (unseen.length) {
  console.log(`\n${unseen.length} task(s) missing from the snapshot — asking the wiki…`);
  const queue = [...unseen];
  const worker = async () => {
    for (;;) {
      const task = queue.shift();
      if (!task) return;
      const w = await wikiFacts(task);
      if (!w) continue;
      facts[task.id] = {
        name: task.name,
        minPlayerLevel: w.minPlayerLevel ?? 0,
        kappaRequired: w.kappaRequired ?? false,
        source: "wiki",
      };
    }
  };
  await Promise.all(Array.from({ length: CONCURRENCY }, worker));
}

await fs.mkdir(path.dirname(OUT), { recursive: true });
await fs.writeFile(
  OUT,
  JSON.stringify({ generated: new Date().toISOString(), tasks: facts }, null, 1),
);

const kb = ((await fs.stat(OUT)).size / 1024).toFixed(0);
console.log(`\nWrote ${kb}KB to data/task-facts.json — ${Object.keys(facts).length} tasks`);
