/**
 * Builds the static map data bundles the site loads at runtime.
 *
 * Source of truth is the tarkov.dev JSON feed (the same one tarkov.dev itself
 * consumes). We pull it once at build time, translate the i18n keys, drop
 * everything the map UI doesn't render, round coordinates, and split the result
 * into one small file per map so opening a map is a single ~50-150KB fetch.
 *
 *   node scripts/build-data.mjs
 *
 * Output: public/data/index.json + public/data/maps/<normalizedName>.json
 */
import fs from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const OUT = path.join(ROOT, "public", "data");
const API = "https://json.tarkov.dev";
const GAME_MODE = "regular";
const LANG = "en";

const geo = JSON.parse(await fs.readFile(path.join(ROOT, "src/data/geo.json"), "utf8"));

/**
 * Kord Breach battle-pass document spawns, gathered by `npm run kord-docs` and
 * committed to data/kord-documents.json. Copied in rather than refetched for
 * the same reason as the task screenshots: a deploy must not depend on the
 * wiki. Missing file just means the layer has nothing to draw.
 */
const kordDocuments = await (async () => {
  try {
    const raw = await fs.readFile(path.join(ROOT, "data", "kord-documents.json"), "utf8");
    return JSON.parse(raw).maps ?? {};
  } catch {
    return {};
  }
})();

/* ------------------------------------------------------------------ fetching */

async function getJson(feed) {
  const url = `${API}/${feed}`;
  for (let attempt = 1; attempt <= 4; attempt++) {
    try {
      const res = await fetch(url, { headers: { Accept: "application/json" } });
      if (!res.ok) throw new Error(`${res.status} ${res.statusText}`);
      return await res.json();
    } catch (err) {
      if (attempt === 4) throw new Error(`Failed to fetch ${url}: ${err.message}`);
      await new Promise((r) => setTimeout(r, 2 ** attempt * 1000));
    }
  }
}

/**
 * The feed ships translation *keys* in translatable string fields plus a
 * separate key->text dictionary per language, and advertises which fields are
 * translatable as a list of JSONPath expressions.
 *
 * We don't want a JSONPath dependency, but we can't blindly translate every
 * string either: identifier fields (`mob: "bossBully"`, an objective's `id`)
 * collide with translation keys and would be destroyed. So we take the *leaf
 * property name* of each advertised path as an allowlist, and only translate
 * strings sitting under one of those names.
 */
function translatableFields(paths) {
  const fields = new Set();
  for (const p of paths ?? []) {
    const leaf = p
      .split(".")
      .pop()
      .replace(/\[[^\]]*\]$/, "");
    if (/^[A-Za-z_]\w*$/.test(leaf)) fields.add(leaf);
  }
  return fields;
}

async function getLocalised(feed) {
  const [payload, dict] = await Promise.all([getJson(feed), getJson(`${feed}_${LANG}`)]);
  const lookup = dict.data ?? {};
  const fields = translatableFields(payload.translations);
  const seen = new WeakSet();

  const walk = (node, inTranslatableField) => {
    if (!node || typeof node !== "object" || seen.has(node)) return;
    seen.add(node);
    if (Array.isArray(node)) {
      for (let i = 0; i < node.length; i++) {
        const v = node[i];
        // Arrays inherit their parent property's translatability (`enemies[*]`).
        if (typeof v === "string") {
          if (inTranslatableField) node[i] = lookup[v] ?? v;
        } else walk(v, inTranslatableField);
      }
      return;
    }
    for (const k of Object.keys(node)) {
      const v = node[k];
      const translatable = fields.has(k);
      if (typeof v === "string") {
        if (translatable) node[k] = lookup[v] ?? v;
      } else walk(v, translatable);
    }
  };

  walk(payload.data, false);
  return payload.data;
}

/* ------------------------------------------------------------------- helpers */

const slug = (s) =>
  (s ?? "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "");

const r1 = (n) => (typeof n === "number" ? Math.round(n * 10) / 10 : n);
/** Positions are only ever consumed as [x, y, z]; the tuple halves the payload. */
const vec = (p) => (p ? [r1(p.x), r1(p.y), r1(p.z)] : null);
const ring = (o) => (Array.isArray(o) && o.length ? o.map((p) => [r1(p.x), r1(p.z)]) : null);

/**
 * Most names arrive already localised. A handful have no translation and fall
 * through as the raw scene identifier ("EXFIL_ZB013"), so only tidy those.
 */
function prettyExtractName(name) {
  if (!name) return "Unknown";
  if (!/_/.test(name) && !/^(EXFIL|EXIT)\b/i.test(name)) return name;
  const s = name.replace(/^(EXFIL|EXIT)[_ ]?/i, "").replace(/_+/g, " ").replace(/\s+/g, " ").trim();
  if (!s) return name;
  // Leave acronyms and codes (ZB013, V-Ex) alone, title-case ordinary words.
  return s
    .split(" ")
    .map((w) => (/^[a-z]+$/.test(w) ? w[0].toUpperCase() + w.slice(1) : w))
    .join(" ");
}

function prettySwitchName(name) {
  if (!name) return "Switch";
  if (!/^switch[_\s]/i.test(name)) return name;
  const s = name.replace(/^switch[_\s]/i, "").replace(/[_\-]+/g, " ").replace(/\s+/g, " ").trim();
  return s ? `Switch — ${s}`.slice(0, 72) : "Switch";
}

/** ZoneScavBase -> "Scav Base"; used to give spawn markers a human label. */
function prettyZoneName(zone) {
  if (!zone) return null;
  return (
    zone
      .replace(/^Zone_?/i, "")
      .replace(/([a-z0-9])([A-Z])/g, "$1 $2")
      .replace(/[_]+/g, " ")
      .replace(/\s+/g, " ")
      .trim() || null
  );
}

/* --------------------------------------------------------------------- fetch */

console.log("Fetching tarkov.dev data feeds…");
const [mapsData, tasksData, itemsData, tradersData] = await Promise.all([
  getLocalised(`${GAME_MODE}/maps`),
  getLocalised(`${GAME_MODE}/tasks`),
  getLocalised(`${GAME_MODE}/items`),
  getLocalised(`${GAME_MODE}/traders`),
]);

const apiMaps = Object.values(mapsData.maps);
const mobs = mapsData.mobs ?? {};
const items = itemsData.items ?? {};
const traders = tradersData; // the traders feed's `data` is the trader map itself
const tasks = Object.values(tasksData.tasks ?? {});
const questItems = tasksData.questItems ?? {};

/*
 * Refuse to ship a visibly broken upstream feed.
 *
 * This runs on every deploy, so whatever the feed says at that moment goes
 * straight onto the site. That is normally the point — it keeps quest data
 * current without anyone re-running anything. But it also means an upstream
 * hiccup silently replaces a good site with a worse one, and the failure is
 * quiet: `minPlayerLevel: 0` just makes the level chip disappear, and
 * `kappaRequired: false` drops the Kappa flag, with nothing looking broken.
 *
 * Seen in practice: the feed briefly served 516 tasks with kappa on 16 of them
 * and no level on 54%, hours after the same endpoint reported 257 and 15%.
 *
 * Exiting non-zero here fails the Vercel build, which leaves the previous
 * deployment up — keeping yesterday's correct data beats publishing today's
 * broken data. Set TK_ALLOW_SPARSE_TASKS=1 to override when the game really
 * has changed this much.
 */
{
  const total = tasks.length;
  const withKappa = tasks.filter((t) => t.kappaRequired).length;
  const withoutLevel = tasks.filter((t) => !t.minPlayerLevel).length;
  const kappaShare = total ? withKappa / total : 0;
  const noLevelShare = total ? withoutLevel / total : 0;

  console.log(
    `  ${total} tasks — ${withKappa} Kappa-required (${(kappaShare * 100).toFixed(0)}%), ` +
      `${withoutLevel} with no level gate (${(noLevelShare * 100).toFixed(0)}%)`,
  );

  // Healthy feeds sit near 50% Kappa and 15% ungated; these bounds are wide
  // enough not to trip on ordinary wipe-to-wipe drift.
  const problems = [];
  if (total < 300) problems.push(`only ${total} tasks (expected 450+)`);
  if (kappaShare < 0.2) problems.push(`only ${(kappaShare * 100).toFixed(0)}% Kappa-required (expected ~50%)`);
  if (noLevelShare > 0.35) problems.push(`${(noLevelShare * 100).toFixed(0)}% have no level gate (expected ~15%)`);

  if (problems.length) {
    console.warn(`\nUpstream task data looks incomplete:\n  - ${problems.join("\n  - ")}`);

    /*
     * Patch the two fields that go sparse from the vendored fallback rather
     * than shipping blanks. Only while the feed is degraded — once it is
     * healthy again this branch never runs, so the fallback cannot quietly
     * override a real change upstream (a task genuinely leaving Kappa, say).
     *
     * Fill-only, never overwrite: a live value that exists is always kept,
     * because the feed is still the source of truth for everything it
     * actually answers.
     */
    let patchedLevel = 0;
    let patchedKappa = 0;
    const fallbackIds = new Set();
    try {
      const raw = await fs.readFile(path.join(ROOT, "data", "task-facts.json"), "utf8");
      const fallback = JSON.parse(raw).tasks ?? {};
      for (const id of Object.keys(fallback)) fallbackIds.add(id);
      for (const task of tasks) {
        const known = fallback[task.id];
        if (!known) continue;
        if (!task.minPlayerLevel && known.minPlayerLevel) {
          task.minPlayerLevel = known.minPlayerLevel;
          patchedLevel++;
        }
        if (!task.kappaRequired && known.kappaRequired) {
          task.kappaRequired = true;
          patchedKappa++;
        }
      }
      console.warn(
        `  patched from data/task-facts.json: ${patchedLevel} level gates, ${patchedKappa} Kappa flags`,
      );
    } catch {
      console.warn("  no data/task-facts.json to fall back on (run `npm run task-facts`)");
    }

    /*
     * Judge the result over the tasks the fallback actually covers, not the
     * whole feed. Those are the map-anchored ones, which is exactly what ends
     * up on the site — measuring against all 500-odd would let a healthy,
     * fully-patched build look thin purely because trader-only tasks it never
     * displays are still missing fields.
     */
    const covered = patchedLevel + patchedKappa > 0 ? tasks.filter((t) => fallbackIds.has(t.id)) : tasks;
    const n = covered.length || 1;
    const stillSparse =
      covered.filter((t) => t.kappaRequired).length / n < 0.2 ||
      covered.filter((t) => !t.minPlayerLevel).length / n > 0.35;

    if (stillSparse && !process.env.TK_ALLOW_SPARSE_TASKS) {
      console.error(
        `\nStill incomplete after the fallback. Refusing to overwrite good data.\n` +
          `Re-run later, refresh the fallback with \`npm run task-facts\`, or set\n` +
          `TK_ALLOW_SPARSE_TASKS=1 if the game really did change this much.`,
      );
      process.exit(1);
    }
  }
}

/** Every id a map is known by, so task/objective map references resolve. */
const mapIdsByName = new Map();
for (const m of apiMaps) {
  const name = m.normalizedName;
  if (!mapIdsByName.has(name)) mapIdsByName.set(name, new Set());
  mapIdsByName.get(name).add(m.id);
}
// Variants share geometry with their parent map (night factory == factory, etc).
const VARIANTS = {
  factory: ["night-factory"],
  "ground-zero": ["ground-zero-21", "ground-zero-tutorial"],
  "the-lab": ["the-lab-dark"],
};
for (const [parent, aliases] of Object.entries(VARIANTS)) {
  for (const alias of aliases) {
    for (const id of mapIdsByName.get(alias) ?? []) mapIdsByName.get(parent)?.add(id);
  }
}

/* --------------------------------------------------------------------- items */

const keyRefs = new Set();
for (const m of apiMaps) for (const l of m.locks ?? []) if (l.key) keyRefs.add(l.key);
for (const t of tasks) {
  for (const k of t.neededKeys ?? []) for (const id of k.keys ?? []) keyRefs.add(id);
  for (const o of t.objectives ?? []) for (const id of o.requiredKeys?.flat() ?? []) keyRefs.add(id);
}

const keyIndex = {};
for (const id of keyRefs) {
  const it = items[id];
  if (!it) continue;
  keyIndex[id] = {
    id,
    name: it.name,
    shortName: it.shortName,
    icon: it.iconLink ?? null,
    wiki: it.wikiLink ?? null,
  };
}
console.log(`  ${Object.keys(keyIndex).length} key items referenced`);

/* --------------------------------------------------------------------- tasks */

const traderIndex = {};
for (const [id, t] of Object.entries(traders)) {
  traderIndex[id] = { id, name: t.name, normalizedName: t.normalizedName, image: t.imageLink ?? null };
}

const OBJECTIVE_KIND = {
  visit: "visit",
  mark: "mark",
  shoot: "shoot",
  plantItem: "place",
  plantQuestItem: "place",
  findQuestItem: "pickup",
  giveQuestItem: "pickup",
  findItem: "pickup",
  extract: "extract",
};

/** taskId -> compact task record, filled in as we find map-anchored objectives. */
const taskIndex = new Map();
/** mapName -> quest marker list */
const questMarkers = new Map();

function pushQuest(mapName, marker) {
  if (!questMarkers.has(mapName)) questMarkers.set(mapName, []);
  questMarkers.get(mapName).push(marker);
}

function mapNamesForId(id) {
  const out = [];
  for (const [name, ids] of mapIdsByName) if (ids.has(id) && geo[name]) out.push(name);
  return out;
}

/**
 * Marker ids are persisted — the user ticks individual locations off and we
 * remember that across rebuilds. So they are derived from the ground position
 * rather than an array index: if the feed reorders a quest item's spawn list,
 * an index-based id would silently move somebody's ticks to a different spot.
 */
function markerId(objectiveId, mapName, position) {
  return `${objectiveId}-${mapName}-${position[0]}_${position[2]}`;
}

/** Task ids that have at least one objective anchored to a playable map. */
const anchoredTaskIds = new Set();
/**
 * mapName -> task ids whose objectives name that map, coordinates or not.
 *
 * Only about a third of objectives carry geometry. "Eliminate Scavs on
 * Customs", "Survive and extract from Woods" and most of the Survivalist Path
 * name their map and stop there, so keying a map's task list off its markers
 * hid roughly 150 real tasks — the panel simply had no row for them. These are
 * listed on the map they belong to and drawn nowhere, which is the truth about
 * them: the task is here, the feed just cannot say where.
 */
const mapTaskIds = new Map();

for (const task of tasks) {
  for (const obj of task.objectives ?? []) {
    const kind = OBJECTIVE_KIND[obj.type] ?? "objective";
    const item = obj.questItem ? questItems[obj.questItem] : null;

    for (const id of obj.maps ?? []) {
      for (const mapName of mapNamesForId(id)) {
        if (!mapTaskIds.has(mapName)) mapTaskIds.set(mapName, new Set());
        mapTaskIds.get(mapName).add(task.id);
      }
    }

    const shared = {
      task: task.id,
      objective: obj.id,
      optional: !!obj.optional,
      // How many of the thing the objective wants ("plant 3"), not how many
      // pins it has — several pins are often alternative spots for one action.
      count: obj.count ?? null,
      description: obj.description,
      item: item ? { id: item.id, name: item.name, icon: item.iconLink ?? null } : null,
    };

    // Objective zones (visit/mark/plant/shoot areas) carry their own geometry.
    for (const zone of obj.zones ?? []) {
      for (const mapName of mapNamesForId(zone.map)) {
        const position = vec(zone.position);
        pushQuest(mapName, {
          ...shared,
          id: markerId(obj.id, mapName, position),
          kind,
          position,
          outline: ring(zone.outline),
          top: r1(zone.top),
          bottom: r1(zone.bottom),
        });
        anchoredTaskIds.add(task.id);
      }
    }

    // Quest items with known world spawns (each is a possible location).
    for (const loc of obj.possibleLocations ?? []) {
      for (const mapName of mapNamesForId(loc.map)) {
        for (const p of loc.positions ?? []) {
          const position = vec(p);
          pushQuest(mapName, {
            ...shared,
            id: markerId(obj.id, mapName, position),
            kind: "pickup",
            position,
            outline: null,
            top: null,
            bottom: null,
          });
        }
        anchoredTaskIds.add(task.id);
      }
    }
  }
}

/*
 * The game ships some tasks more than once under different ids: same name, same
 * trader, same objectives at the same coordinates. Some are faction variants
 * (Drip-Out BEAR vs USEC), others are mutually exclusive branches of the same
 * quest reached by different prerequisites (the three "Make Amends" variants,
 * whose objectives sit on identical coordinates).
 *
 * Drawing them all would stack pins and list the row several times, so they
 * collapse onto one canonical id. Faction is part of the identity because
 * merging a BEAR variant with a USEC one would lose the faction gate. Their
 * differing prerequisites are preserved as alternatives — see the graph below.
 */
const canonicalTaskId = new Map();
const groupMembers = new Map();
{
  const byIdentity = new Map();
  // Anchored tasks are considered first so a canonical id is always one the
  // per-map payloads actually contain.
  const ordered = [...tasks].sort((a, b) => {
    const anchorDelta = Number(anchoredTaskIds.has(b.id)) - Number(anchoredTaskIds.has(a.id));
    return anchorDelta || a.id.localeCompare(b.id);
  });
  for (const task of ordered) {
    const identity = [
      task.name,
      traderIndex[task.trader]?.name ?? "",
      task.minPlayerLevel ?? 0,
      task.factionName ?? "Any",
    ].join("|");
    const canonical = byIdentity.get(identity);
    if (canonical) {
      canonicalTaskId.set(task.id, canonical);
      groupMembers.get(canonical).push(task);
    } else {
      byIdentity.set(identity, task.id);
      groupMembers.set(task.id, [task]);
    }
  }
}

const canonicalOf = (id) => canonicalTaskId.get(id) ?? id;

/**
 * Everything that appears on at least one map, pinned or merely named, keyed by
 * canonical id. Canonicalising here matters: a faction variant can be the one
 * that names the map while the id the group collapsed onto is not, and testing
 * the raw ids would drop the row that survives.
 */
const listedTaskIds = new Set();
for (const id of anchoredTaskIds) listedTaskIds.add(canonicalOf(id));
for (const ids of mapTaskIds.values()) for (const id of ids) listedTaskIds.add(canonicalOf(id));

for (const task of tasks) {
  if (!listedTaskIds.has(task.id) || canonicalTaskId.has(task.id)) continue;
  const trader = traderIndex[task.trader];
  taskIndex.set(task.id, {
    id: task.id,
    name: task.name,
    normalizedName: task.normalizedName,
    trader: trader ? { name: trader.name, image: trader.image } : null,
    minPlayerLevel: task.minPlayerLevel ?? 0,
    experience: task.experience ?? 0,
    kappaRequired: !!task.kappaRequired,
    lightkeeperRequired: !!task.lightkeeperRequired,
    factionName: task.factionName && task.factionName !== "Any" ? task.factionName : null,
    wiki: task.wikiLink ?? null,
    // Only prerequisites that appear on a map themselves survive — the rest
    // have no row to point at. Nothing gates on this; it is here so the detail
    // panel can say what a task follows on from.
    requires: [
      ...new Set(
        (groupMembers.get(task.id) ?? [task]).flatMap((m) =>
          (m.taskRequirements ?? []).map((r) => canonicalOf(r.task)).filter(Boolean),
        ),
      ),
    ].filter((id) => listedTaskIds.has(id)),
    keys: [...new Set((task.neededKeys ?? []).flatMap((k) => k.keys ?? []))].filter((id) => keyIndex[id]),
  });
}

/*
 * Deduplicate markers as well. Besides the merged tasks above, a map's variants
 * share one set of geometry — an objective listed for both Factory and Night
 * Factory, or all three Ground Zero tiers, is one place on one map.
 */
let droppedMarkers = 0;
for (const [mapName, markers] of questMarkers) {
  const seen = new Set();
  const deduped = [];
  for (const marker of markers) {
    marker.task = canonicalTaskId.get(marker.task) ?? marker.task;
    const key = `${marker.task}|${marker.description}|${marker.position?.join(",")}`;
    if (seen.has(key)) {
      droppedMarkers++;
      continue;
    }
    seen.add(key);
    deduped.push(marker);
  }
  questMarkers.set(mapName, deduped);
}

/* Same collapse for the map -> task lists, so a merged variant keeps its row. */
for (const [mapName, ids] of mapTaskIds) {
  mapTaskIds.set(mapName, new Set([...ids].map(canonicalOf).filter((id) => taskIndex.has(id))));
}
console.log(`  merged ${canonicalTaskId.size} duplicate tasks, dropped ${droppedMarkers} duplicate markers`);

/* -------------------------------------------------------------------- spawns */

/**
 * The feed tags each spawn point with `sides` (which faction may use it) and
 * `categories` (player / bot / botpmc / boss / sniper). Those two axes have to
 * be read together, and the encoding is not uniform across maps:
 *
 *   sides ["pmc"]  + ["player"]           PMC start (Customs, Woods, Shoreline)
 *   sides ["all"]  + ["player"]           PMC start (Lighthouse, Reserve, Streets)
 *   sides ["scav"] + ["bot", "player"]    Scav start, also used by AI Scavs
 *   sides ["scav"] + ["botpmc", "player"] AI PMC spawn (Raiders, Rogues)
 *   sides ["scav"] + ["bot"]              AI Scav only, never a player start
 *
 * Reading `all` as a Scav side is what made Lighthouse and Streets report zero
 * PMC spawns, so the order below is deliberate: most specific role first.
 */
function spawnGroup(spawn) {
  const sides = (spawn.sides ?? []).map((s) => s.toLowerCase());
  const cats = (spawn.categories ?? []).map((c) => c.toLowerCase());

  const player = cats.includes("player");
  const pmcSide =
    sides.includes("pmc") || sides.includes("usec") || sides.includes("bear") || sides.includes("all");
  const scavSide = sides.includes("scav") || sides.includes("savage");

  if (cats.includes("sniper")) return "sniper";
  if (cats.includes("boss")) return "boss";
  if (pmcSide && player) return "pmc";
  if (cats.includes("botpmc")) return "pmc-ai";
  if (scavSide && player) return "scav";
  if (scavSide || cats.includes("bot")) return "scav-ai";
  return null;
}

/* --------------------------------------------------------------------- build */

/*
 * Count what the last good build produced before wiping it.
 *
 * The level/Kappa check above only looks at two fields, and a feed can be
 * broken in ways those never notice: a run during one bad spell kept every
 * spawn but dropped 218 quest objectives — 27% of them — because the
 * objectives had lost their map positions upstream. Markers vanishing is the
 * most visible damage this site can do to itself, and nothing else was
 * watching for it.
 *
 * Comparing against the previous build rather than a fixed number means this
 * keeps working across wipes, when the real totals move.
 */
const previousByMap = await (async () => {
  const out = new Map();
  try {
    for (const file of await fs.readdir(path.join(OUT, "maps"))) {
      const data = JSON.parse(await fs.readFile(path.join(OUT, "maps", file), "utf8"));
      out.set(file.replace(/\.json$/, ""), {
        quests: data.markers?.quests ?? [],
        tasks: data.tasks ?? {},
      });
    }
  } catch {
    /* first build, nothing to compare against */
  }
  return out;
})();
const previousQuests = [...previousByMap.values()].reduce((n, m) => n + m.quests.length, 0);

await fs.rm(OUT, { recursive: true, force: true });
await fs.mkdir(path.join(OUT, "maps"), { recursive: true });

const index = [];

for (const [name, cfg] of Object.entries(geo)) {
  const api = apiMaps.find((m) => m.normalizedName === name);
  if (!api) {
    console.warn(`  ! no API data for ${name}, skipping`);
    continue;
  }

  const switchesById = new Map((api.switches ?? []).map((s) => [s.id, s]));

  const spawns = (api.spawns ?? [])
    .map((s, i) => ({
      id: `sp-${i}`,
      group: spawnGroup(s),
      position: vec(s.position),
      zone: prettyZoneName(s.zoneName),
      sides: s.sides ?? [],
      categories: s.categories ?? [],
    }))
    // `sides: ["none"]` and event-only categories describe nothing a player
    // can act on, so they never become markers.
    .filter((s) => s.group !== null);

  const extracts = (api.extracts ?? []).map((e) => ({
    id: e.id,
    name: prettyExtractName(e.name),
    rawName: e.name,
    faction: (e.faction ?? "shared").toLowerCase(),
    position: vec(e.position),
    outline: ring(e.outline),
    top: r1(e.top),
    bottom: r1(e.bottom),
    switches: (e.switches ?? [])
      .map((id) => switchesById.get(id))
      .filter(Boolean)
      .map((s) => ({ id: s.id, name: prettySwitchName(s.name), position: vec(s.position) })),
  }));

  const transits = (api.transits ?? []).map((t) => {
    const targetName = apiMaps.find((m) => m.id === t.map)?.name ?? null;
    return {
      id: `tr-${t.id}`,
      name: targetName ? `Transit to ${targetName}` : "Transit",
      target: targetName,
      targetMap: mapNamesForId(t.map)[0] ?? null,
      description: t.description && !/_DESC$/.test(t.description) ? t.description : null,
      conditions: t.conditions ?? null,
      position: vec(t.position),
      outline: ring(t.outline),
      top: r1(t.top),
      bottom: r1(t.bottom),
    };
  });

  const locks = (api.locks ?? []).map((l, i) => ({
    id: l.id || `lock-${i}`,
    lockType: l.lockType ?? "door",
    key: l.key && keyIndex[l.key] ? l.key : null,
    needsPower: !!l.needsPower,
    position: vec(l.position),
    outline: ring(l.outline),
    top: r1(l.top),
    bottom: r1(l.bottom),
  }));

  const hazards = (api.hazards ?? []).map((h, i) => ({
    id: h.id || `hz-${i}`,
    name: h.name?.replace(/^ScavRole\//, "") ?? "Hazard",
    hazardType: h.hazardType ?? "hazard",
    position: vec(h.position),
    outline: ring(h.outline),
    top: r1(h.top),
    bottom: r1(h.bottom),
  }));

  const switches = (api.switches ?? []).map((s) => ({
    id: s.id,
    name: prettySwitchName(s.name),
    switchType: s.switchType ?? null,
    position: vec(s.position),
    activates: (s.activates ?? [])
      .map((a) => {
        if (a.extract) {
          const ex = extracts.find((e) => e.id === a.extract);
          return ex ? `${a.operation ?? "Activates"} ${ex.name}` : null;
        }
        if (a.switch) {
          const sw = switchesById.get(a.switch);
          return sw ? `${a.operation ?? "Activates"} ${prettySwitchName(sw.name)}` : null;
        }
        return null;
      })
      .filter(Boolean),
  }));

  // Bosses: one marker per known spawn position, plus the per-zone chance.
  const bossSpawns = [];
  for (const bs of api.bosses ?? []) {
    const mob = mobs[bs.mob] ?? {};
    for (const loc of bs.spawnLocations ?? []) {
      for (const [i, p] of (loc.positions ?? []).entries()) {
        bossSpawns.push({
          id: `boss-${bs.mob}-${loc.spawnKey ?? loc.name}-${i}`,
          name: mob.name ?? "Boss",
          normalizedName: mob.normalizedName ?? null,
          zone: loc.name ?? prettyZoneName(loc.spawnKey),
          mapChance: bs.spawnChance ?? null,
          zoneChance: loc.chance ?? null,
          escorts: (bs.escorts ?? [])
            .map((e) => ({ name: mobs[e.mob]?.name ?? null, amount: e.amount?.[0]?.count ?? null }))
            .filter((e) => e.name),
          position: vec(p),
        });
      }
    }
  }

  // Boss summary for the map card / info panel, independent of spawn positions.
  // A boss can appear as several spawn entries (different zones or triggers);
  // the summary shows it once, keeping its best chance and all its zones.
  const bossSummary = [];
  for (const bs of api.bosses ?? []) {
    const mob = mobs[bs.mob];
    if (!mob) continue;
    const zones = (bs.spawnLocations ?? []).map((l) => ({ name: l.name, chance: l.chance }));
    const existing = bossSummary.find((b) => b.normalizedName === mob.normalizedName);
    if (existing) {
      existing.spawnChance = Math.max(existing.spawnChance ?? 0, bs.spawnChance ?? 0);
      for (const z of zones) if (!existing.zones.some((e) => e.name === z.name)) existing.zones.push(z);
      continue;
    }
    bossSummary.push({
      name: mob.name ?? "Boss",
      normalizedName: mob.normalizedName ?? null,
      spawnChance: bs.spawnChance ?? null,
      zones,
    });
  }

  /*
   * Battle-pass documents. Ids are derived from the document and its
   * description rather than the array index, on the same reasoning as quest
   * marker ids: the wiki reorders its galleries freely, and an index would
   * quietly repoint anything keyed on it.
   */
  const documents = (kordDocuments[name] ?? []).map((spawn) => ({
    id: `doc-${slug(spawn.document)}-${slug(spawn.note).slice(0, 40)}`,
    document: spawn.document,
    note: spawn.note,
    image: spawn.image ?? null,
    imageWidth: spawn.imageWidth ?? 0,
    imageHeight: spawn.imageHeight ?? 0,
    // Place labels are ground coordinates [x, z]; markers are [x, y, z]
    // everywhere else, so widen here and let the rest of the app stay uniform.
    position: spawn.position ? [r1(spawn.position[0]), 0, r1(spawn.position[1])] : null,
    place: spawn.place ?? null,
  }));

  const quests = questMarkers.get(name) ?? [];
  // Tasks with a pin here, plus tasks that name this map without coordinates.
  // The client tells the two apart by looking for markers, so nothing extra
  // ships per task.
  const usedTaskIds = new Set([...quests.map((q) => q.task), ...(mapTaskIds.get(name) ?? [])]);
  const usedKeyIds = new Set(locks.map((l) => l.key).filter(Boolean));
  for (const id of usedTaskIds) for (const k of taskIndex.get(id)?.keys ?? []) usedKeyIds.add(k);

  const payload = {
    id: api.id,
    name: api.name,
    normalizedName: name,
    description: api.description ?? null,
    wiki: api.wiki ?? null,
    players: api.players ?? null,
    raidDuration: api.raidDuration ?? null,
    enemies: api.enemies ?? [],
    bosses: bossSummary,
    geo: cfg,
    markers: { spawns, bossSpawns, extracts, transits, locks, hazards, switches, quests, documents },
    tasks: Object.fromEntries([...usedTaskIds].map((id) => [id, taskIndex.get(id)]).filter(([, t]) => t)),
    keys: Object.fromEntries([...usedKeyIds].map((id) => [id, keyIndex[id]]).filter(([, k]) => k)),
    generated: new Date().toISOString(),
  };

  const file = path.join(OUT, "maps", `${name}.json`);
  await fs.writeFile(file, JSON.stringify(payload));
  const kb = ((await fs.stat(file)).size / 1024).toFixed(0);

  const counts = {
    spawns: spawns.length,
    bosses: bossSpawns.length,
    extracts: extracts.length,
    transits: transits.length,
    keys: locks.length,
    quests: quests.length,
    docs: documents.length,
  };
  index.push({
    id: api.id,
    name: api.name,
    normalizedName: name,
    description: api.description ?? null,
    players: api.players ?? null,
    raidDuration: api.raidDuration ?? null,
    bosses: bossSummary.map((b) => b.name),
    styles: [cfg.svgPath ? "clean" : null, cfg.tilePath ? "satellite" : null].filter(Boolean),
    // Vector artwork doubles as the map-picker thumbnail: one lazy <img>, no
    // separate screenshot pipeline, and it stays sharp on any display.
    preview: cfg.svgPath ?? null,
    counts,
  });
  console.log(`  ${name.padEnd(20)} ${kb.padStart(5)}KB  ` + Object.entries(counts).map(([k, v]) => `${k}:${v}`).join(" "));
}

index.sort((a, b) => a.name.localeCompare(b.name));
await fs.writeFile(
  path.join(OUT, "index.json"),
  JSON.stringify({ generated: new Date().toISOString(), gameMode: GAME_MODE, maps: index }, null, 1),
);

/*
 * See the note by `previousByMap`: markers quietly disappearing is the worst
 * way this can fail. A wipe adding or removing content moves the total by a
 * few percent; a fifth of the objectives going missing is upstream being
 * broken.
 *
 * The first version of this refused the build outright. That was the wrong
 * trade twice over. It fails the Vercel deploy, so nothing else ships either —
 * a fix to how tasks are listed, or a new layer, is held hostage by a feed
 * nobody here controls. And because the deploy fails after `public/data` has
 * already been rewritten, the tree is left holding the thin data anyway.
 *
 * So instead of choosing between the two builds, take both: keep everything
 * this build produced and put back the markers it lost. Positions do not move
 * without a patch, so a marker the feed dropped this morning is still where it
 * was yesterday. Task records come back with them, otherwise a restored marker
 * would point at a row that no longer exists.
 *
 * Only runs while the feed looks broken. Under the threshold the fresh build
 * stands on its own, so content genuinely removed in a wipe does disappear.
 */
{
  const nowQuests = index.reduce((n, m) => n + m.counts.quests, 0);
  const drop = previousQuests > 0 ? 1 - nowQuests / previousQuests : 0;
  if (previousQuests > 0) {
    console.log(`\n  quest markers: ${previousQuests} -> ${nowQuests} (${(drop * -100).toFixed(1)}%)`);
  }

  if (drop > 0.15 && !process.env.TK_ALLOW_SPARSE_TASKS) {
    console.warn(
      `\n  upstream dropped ${(drop * 100).toFixed(0)}% of the quest markers — ` +
        `restoring the missing ones from the last good build.`,
    );
    let restoredMarkers = 0;
    let restoredTasks = 0;

    for (const entry of index) {
      const previous = previousByMap.get(entry.normalizedName);
      if (!previous?.quests.length) continue;

      const file = path.join(OUT, "maps", `${entry.normalizedName}.json`);
      const payload = JSON.parse(await fs.readFile(file, "utf8"));
      const seen = new Set(payload.markers.quests.map((q) => q.id));

      for (const marker of previous.quests) {
        if (seen.has(marker.id)) continue;
        seen.add(marker.id);
        payload.markers.quests.push(marker);
        restoredMarkers++;
        if (!payload.tasks[marker.task] && previous.tasks[marker.task]) {
          payload.tasks[marker.task] = previous.tasks[marker.task];
          restoredTasks++;
        }
      }

      await fs.writeFile(file, JSON.stringify(payload));
      entry.counts.quests = payload.markers.quests.length;
    }

    console.warn(`  restored ${restoredMarkers} marker(s) and ${restoredTasks} task record(s)`);
    await fs.writeFile(
      path.join(OUT, "index.json"),
      JSON.stringify({ generated: new Date().toISOString(), gameMode: GAME_MODE, maps: index }, null, 1),
    );
  }
}

/*
 * Task screenshots are gathered by `npm run images` and committed to
 * data/task-images.json. Copied rather than refetched so a deploy never
 * depends on the wiki; if it is missing the gallery simply doesn't appear.
 */
const imagesSrc = path.join(ROOT, "data", "task-images.json");
let imageNote = "no task photos (run `npm run images`)";
try {
  await fs.copyFile(imagesSrc, path.join(OUT, "task-images.json"));
  const cached = JSON.parse(await fs.readFile(imagesSrc, "utf8"));
  const n = Object.values(cached.tasks ?? {}).reduce((a, l) => a + l.length, 0);
  imageNote = `${n} task photos`;
} catch {
  /* optional */
}

console.log(`\nWrote ${index.length} maps and ${imageNote} to public/data`);
