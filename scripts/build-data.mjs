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

for (const task of tasks) {
  for (const obj of task.objectives ?? []) {
    const kind = OBJECTIVE_KIND[obj.type] ?? "objective";
    const item = obj.questItem ? questItems[obj.questItem] : null;
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

for (const task of tasks) {
  if (!anchoredTaskIds.has(task.id) || canonicalTaskId.has(task.id)) continue;
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
    // Only prerequisites that are themselves anchored to this map survive —
    // the rest have no marker to point at. Nothing gates on this; it is here
    // so the detail panel can say what a task follows on from.
    requires: [
      ...new Set(
        (groupMembers.get(task.id) ?? [task]).flatMap((m) =>
          (m.taskRequirements ?? []).map((r) => canonicalOf(r.task)).filter(Boolean),
        ),
      ),
    ].filter((id) => anchoredTaskIds.has(id)),
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

  const quests = questMarkers.get(name) ?? [];
  const usedTaskIds = new Set(quests.map((q) => q.task));
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
    markers: { spawns, bossSpawns, extracts, transits, locks, hazards, switches, quests },
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

console.log(`\nWrote ${index.length} maps to public/data`);
