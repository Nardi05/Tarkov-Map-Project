/**
 * Cross-checks our quest data against the Escape from Tarkov wiki.
 *
 *   npm run check-quests
 *   npm run check-quests -- --json     machine-readable report
 *
 * A diagnostic, not a data source, and deliberately not part of `npm run data`
 * or the deploy. tarkov.dev stays the source of truth — it is the only one of
 * the two that carries map positions and the objective graph, which is most of
 * what this site draws. The wiki is the community's fastest-moving record of
 * what a given wipe actually looks like, so it is worth knowing where the two
 * disagree; it just isn't worth letting a wiki edit rewrite the map.
 *
 * So this prints discrepancies for a human to judge, and changes nothing.
 */
import process from "node:process";

const API = "https://json.tarkov.dev";
const GAME_MODE = "regular";
const LANG = "en";
const WIKI = "https://escapefromtarkov.fandom.com/api.php";
const UA = "tarkov-map-project/0.1 (personal fan project; contact via GitHub)";
const CONCURRENCY = 4;

const asJson = process.argv.includes("--json");

/* ------------------------------------------------------------------ fetching */

async function getJson(url, headers = {}) {
  for (let attempt = 1; attempt <= 4; attempt++) {
    try {
      const res = await fetch(url, { headers: { Accept: "application/json", ...headers } });
      if (!res.ok) throw new Error(`${res.status} ${res.statusText}`);
      return await res.json();
    } catch (err) {
      if (attempt === 4) throw new Error(`Failed to fetch ${url}: ${err.message}`);
      await new Promise((r) => setTimeout(r, 2 ** attempt * 500));
    }
  }
}

async function wiki(params, attempt = 0) {
  const url = `${WIKI}?${new URLSearchParams({ format: "json", formatversion: "2", ...params })}`;
  try {
    const res = await fetch(url, { headers: { "user-agent": UA } });
    if (res.status === 429 || res.status >= 500) throw new Error(`HTTP ${res.status}`);
    if (!res.ok) return null;
    return await res.json();
  } catch (err) {
    if (attempt >= 3) {
      console.warn(`  ! giving up on ${params.page ?? params.cmtitle}: ${err.message}`);
      return null;
    }
    await new Promise((r) => setTimeout(r, 500 * 2 ** attempt));
    return wiki(params, attempt + 1);
  }
}

/* --------------------------------------------------------------- our records */

/**
 * The feed ships translation keys rather than text; the tasks dictionary turns
 * them back into names. Only names and trader names are needed here, so this is
 * a much smaller job than build-data.mjs's full localisation pass.
 */
async function ourTasks() {
  const [tasks, dict, traders, traderDict] = await Promise.all([
    getJson(`${API}/${GAME_MODE}/tasks`),
    getJson(`${API}/${GAME_MODE}/tasks_${LANG}`),
    getJson(`${API}/${GAME_MODE}/traders`),
    getJson(`${API}/${GAME_MODE}/traders_${LANG}`),
  ]);
  const text = dict.data ?? {};
  const traderText = traderDict.data ?? {};
  const traderName = {};
  for (const [id, t] of Object.entries(traders.data ?? {})) {
    traderName[id] = traderText[t.name] ?? t.name;
  }

  const out = [];
  for (const t of Object.values(tasks.data?.tasks ?? {})) {
    out.push({
      id: t.id,
      name: text[t.name] ?? t.name,
      trader: traderName[t.trader] ?? null,
      minPlayerLevel: t.minPlayerLevel ?? 0,
      kappaRequired: !!t.kappaRequired,
      factionName: t.factionName && t.factionName !== "Any" ? t.factionName : null,
    });
  }
  return out;
}

/* -------------------------------------------------------------- wiki records */

async function wikiQuestTitles() {
  const titles = [];
  let cont;
  for (let page = 0; page < 20; page++) {
    const params = { action: "query", list: "categorymembers", cmtitle: "Category:Quests", cmlimit: "500" };
    if (cont) params.cmcontinue = cont;
    const data = await wiki(params);
    for (const m of data?.query?.categorymembers ?? []) {
      // Sub-categories are listed alongside pages; only real articles matter.
      if (m.ns === 0) titles.push(m.title);
    }
    cont = data?.continue?.cmcontinue;
    if (!cont) break;
  }
  return titles;
}

/**
 * Pulls the handful of facts the wiki states plainly enough to compare.
 *
 * `given by` and `reqkappa` are Infobox fields, but the level gate is only ever
 * prose in the Requirements section ("Must be level 6 to start this quest"), so
 * it needs a regex rather than a template lookup.
 */
function parseWikitext(wt) {
  if (!wt) return null;
  const field = (name) => {
    const m = wt.match(new RegExp(`\\|\\s*${name}\\s*=([^\\n]*)`, "i"));
    return m ? m[1].trim() : "";
  };

  const givenBy = field("given by");
  const trader = (givenBy.match(/\[\[([^\]|]+)/) ?? [])[1]?.trim() ?? null;

  const kappaRaw = field("reqkappa").toLowerCase();
  const kappaRequired = kappaRaw.includes("yes") ? true : kappaRaw.includes("no") ? false : null;

  const requirements = (wt.match(/==\s*Requirements\s*==([\s\S]*?)(?:\n==|$)/i) ?? [])[1] ?? "";
  /*
   * "Must be level 6 to start this quest" is the player gate. "Obtain level 2
   * loyalty with Prapor" is trader standing and has nothing to do with it —
   * matching a bare /level (\d+)/ here reads the loyalty number and invents
   * disagreements for most of the questlist.
   */
  const levelMatch = requirements.match(/must be level\s+(\d+)/i);
  const minPlayerLevel = levelMatch ? Number(levelMatch[1]) : null;

  return { trader, kappaRequired, minPlayerLevel };
}

async function wikiFacts(titles) {
  const facts = new Map();
  let done = 0;
  const queue = [...titles];

  const worker = async () => {
    for (;;) {
      const title = queue.shift();
      if (!title) return;
      const parsed = await wiki({ action: "parse", page: title, prop: "wikitext" });
      const wt = parsed?.parse?.wikitext;
      facts.set(title, parseWikitext(typeof wt === "string" ? wt : wt?.["*"]));
      done++;
      if (!asJson && done % 50 === 0) console.log(`  ${done}/${titles.length}…`);
    }
  };
  await Promise.all(Array.from({ length: CONCURRENCY }, worker));
  return facts;
}

/* -------------------------------------------------------------------- report */

const normalise = (s) =>
  (s ?? "")
    .toLowerCase()
    .replace(/[’']/g, "")
    .replace(/[^a-z0-9]+/g, " ")
    .trim();

if (!asJson) console.log("Fetching our task feed and the wiki's quest list…");
const [ours, wikiTitles] = await Promise.all([ourTasks(), wikiQuestTitles()]);
if (!asJson) console.log(`  ${ours.length} tasks from tarkov.dev, ${wikiTitles.length} wiki quest pages`);

const wikiByName = new Map();
for (const t of wikiTitles) wikiByName.set(normalise(t), t);

const matched = [];
const ourOnly = [];
for (const task of ours) {
  const title = wikiByName.get(normalise(task.name));
  if (title) matched.push({ task, title });
  else ourOnly.push(task);
}

const matchedTitles = new Set(matched.map((m) => m.title));
const wikiOnly = wikiTitles.filter((t) => !matchedTitles.has(t));

if (!asJson) console.log(`\nReading ${matched.length} matched wiki pages…`);
const facts = await wikiFacts(matched.map((m) => m.title));

const mismatches = [];
for (const { task, title } of matched) {
  const w = facts.get(title);
  if (!w) continue;
  const diffs = [];

  // Faction-specific variants legitimately differ from the wiki's single page.
  if (w.trader && task.trader && normalise(w.trader) !== normalise(task.trader)) {
    diffs.push({ field: "trader", ours: task.trader, wiki: w.trader });
  }
  if (w.minPlayerLevel != null && task.minPlayerLevel !== w.minPlayerLevel) {
    diffs.push({ field: "level", ours: task.minPlayerLevel, wiki: w.minPlayerLevel });
  }
  if (w.kappaRequired != null && task.kappaRequired !== w.kappaRequired) {
    diffs.push({ field: "kappa", ours: task.kappaRequired, wiki: w.kappaRequired });
  }
  if (diffs.length) mismatches.push({ name: task.name, title, diffs });
}

if (asJson) {
  console.log(JSON.stringify({ mismatches, wikiOnly, ourOnly: ourOnly.map((t) => t.name) }, null, 1));
} else {
  const pct = ((matched.length / ours.length) * 100).toFixed(0);
  console.log(`\n${"=".repeat(70)}`);
  console.log(`Matched ${matched.length}/${ours.length} of our tasks to a wiki page (${pct}%)`);
  console.log("=".repeat(70));

  console.log(`\nFIELD MISMATCHES — ${mismatches.length} task(s) where the wiki disagrees`);
  if (mismatches.length === 0) console.log("  none");
  for (const m of mismatches) {
    const parts = m.diffs.map((d) => `${d.field}: ours=${d.ours} wiki=${d.wiki}`).join(", ");
    console.log(`  ${m.name} — ${parts}`);
  }

  // Deliberately last and unranked: the wiki documents retired questlines from
  // old wipes with no "removed" category to filter on, so most of this list is
  // history rather than anything missing from the site.
  console.log(`\nON THE WIKI, NOT IN OUR DATA — ${wikiOnly.length} page(s)`);
  console.log("  Mostly retired/older-wipe quests the wiki still documents. Skim, don't action.");
  for (const t of wikiOnly.slice(0, 40)) console.log(`  ${t}`);
  if (wikiOnly.length > 40) console.log(`  …and ${wikiOnly.length - 40} more`);

  console.log(`\nIN OUR DATA, NO WIKI PAGE — ${ourOnly.length} task(s)`);
  console.log("  Usually a naming difference rather than a real problem.");
  for (const t of ourOnly.slice(0, 40)) console.log(`  ${t.name}`);
  if (ourOnly.length > 40) console.log(`  …and ${ourOnly.length - 40} more`);
}
