/**
 * The data pipeline: tarkov.dev's JSON feeds in, the site's payloads out.
 *
 * Source of truth is the tarkov.dev JSON feed (the same one tarkov.dev itself
 * consumes). We pull it, translate the i18n keys, drop everything the map UI
 * doesn't render, round coordinates, and split the result into one small file
 * per map so opening a map is a single ~50-150KB fetch.
 *
 * Why this is a module and not a script
 * -------------------------------------
 * It used to be `scripts/build-data.mjs`, run once per deploy, which froze the
 * site's data at the moment of the build. Two callers need it now:
 *
 *   scripts/build-data.mjs   the CLI, writing into public/data. Still runs at
 *                            build time, but only to lay down the offline
 *                            fallback the site uses when nothing better is
 *                            reachable.
 *   api/data/[...path].js    the live endpoint, running the same pipeline on
 *                            request against an in-memory filesystem and
 *                            serving the result behind a one-day CDN cache.
 *
 * Both get byte-identical output because both run this. The only difference is
 * the `fs` they hand in, which is why every read and write below goes through
 * the injected one rather than `node:fs` directly.
 */
import nodeFs from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

/** The repository root, from this file's own location. */
export const DEFAULT_ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..", "..");

export const API = "https://json.tarkov.dev";
export const GAME_MODE = "regular";
const LANG = "en";

/** Thrown instead of exiting when the upstream feed is too thin to trust. */
export class SparseFeedError extends Error {
  constructor(message) {
    super(message);
    this.name = "SparseFeedError";
  }
}

/**
 * Build every payload the site loads.
 *
 * @param {object}  [opts]
 * @param {object}  [opts.fs]           anything with the `node:fs/promises` shape
 *                                      this uses: readFile, writeFile, readdir,
 *                                      mkdir, rm, copyFile, stat.
 * @param {string}  [opts.root]         repository root, for the vendored inputs.
 * @param {string}  [opts.out]          directory the payloads are written to.
 * @param {boolean} [opts.allowSparse]  accept a feed that looks broken.
 */
export async function buildData({
  fs = nodeFs,
  root: ROOT = DEFAULT_ROOT,
  out: OUT = path.join(DEFAULT_ROOT, "public", "data"),
  allowSparse = false,
} = {}) {
  /*
   * One timestamp for the whole run, so every payload agrees on when the data
   * was pulled. The site shows this to the player, and five calls to
   * `new Date()` scattered through the build made "as of" a different answer
   * depending on which file you asked.
   */
  const generated = new Date().toISOString();

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

  /** Knight / Rogue / the trio members are one chip on the map picker: Goons. */
  const GOON_ALIASES = new Set(["knight", "big pipe", "birdeye", "death knight", "rogue", "rogues"]);
  function collapseGoons(names) {
    const out = [];
    const seen = new Set();
    for (const raw of names) {
      const key = (raw ?? "").trim().toLowerCase();
      if (key === "af") continue;
      const label = GOON_ALIASES.has(key) ? "Goons" : raw;
      const seenKey = label.toLowerCase();
      if (seen.has(seenKey)) continue;
      seen.add(seenKey);
      out.push(label);
    }
    return out;
  }

  const slug = (s) =>
    (s ?? "")
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, "-")
      .replace(/^-|-$/g, "");

  /**
   * Short, stable digest of a string, for ids that must survive the source
   * reordering itself. Not security-sensitive — it only has to separate a few
   * hundred sentences per map, which 32 bits does comfortably.
   */
  const hash = (s) => {
    let h = 0x811c9dc5;
    for (let i = 0; i < (s ?? "").length; i++) {
      h ^= s.charCodeAt(i);
      h = Math.imul(h, 0x01000193);
    }
    return (h >>> 0).toString(36);
  };

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
   * Clean the task names before anything keys off them.
   *
   * Two upstream problems, both of which cost real data rather than just looking
   * untidy:
   *
   *   Stray whitespace. "Arena Business [PVP ZONE]" arrives with a trailing
   *   newline. The zone suffix is matched at end-of-string, the wiki is asked
   *   for a page by that title, and edges from other quests are matched by name
   *   — so one invisible character lost the quest its wiki page, and lost
   *   "Balancing - Part 1" the edge pointing at it.
   *
   *   Untranslated names. The English dictionary answers three of the four
   *   Prestige quests with the German "Neuanfang", so the tracker showed four
   *   identical rows with no way to tell them apart. `normalizedName` is the
   *   feed's own English slug and stays distinct, so a name that collides with
   *   another task's is rebuilt from that instead. It is derived from upstream
   *   rather than invented here: the alternative is guessing at wiki titles for
   *   quests the wiki files under a different name again.
   */
  {
    const titleCase = (slug) =>
      slug
        .split("-")
        .map((w) => (/^\d+$/.test(w) ? w : w.charAt(0).toUpperCase() + w.slice(1)))
        .join(" ");

    let trimmed = 0;
    for (const task of tasks) {
      if (typeof task.name !== "string") continue;
      const clean = task.name.replace(/\s+/g, " ").trim();
      if (clean !== task.name) {
        task.name = clean;
        trimmed++;
      }
    }

    /*
     * Only a collision that survives the merge is ambiguous on screen.
     *
     * The merge below collapses tasks sharing name, trader, level and faction —
     * that is how the Factory / Night Factory and Ground Zero variants become
     * one row — so a group that differs only in ways the merge ignores is about
     * to become a single task and must not be renamed apart first. What is left
     * after that is a group whose members differ by level, which is the Prestige
     * case: several rows that really do coexist under one name.
     *
     * Faction is part of the key on purpose. The USEC and BEAR variants of
     * Textile and Drip-Out share a name deliberately and already carry a faction
     * chip to tell them apart.
     */
    const byName = new Map();
    for (const task of tasks) {
      const key = `${task.name}|${task.trader ?? ""}|${task.factionName ?? "Any"}`;
      let group = byName.get(key);
      if (!group) byName.set(key, (group = []));
      group.push(task);
    }

    let renamed = 0;
    for (const group of byName.values()) {
      if (group.length < 2) continue;
      const levels = new Set(group.map((t) => t.minPlayerLevel ?? 0));
      if (levels.size < 2) continue; // the merge will make these one task
      for (const task of group) {
        const derived = task.normalizedName ? titleCase(task.normalizedName) : "";
        if (derived && derived !== task.name) {
          task.name = derived;
          renamed++;
        }
      }
    }

    if (trimmed || renamed) {
      console.log(`  names: trimmed ${trimmed}, disambiguated ${renamed} from the feed's own slugs`);
    }
  }

  /** Set when the feed-health check below finds the task feed thin. */
  let feedDegraded = false;

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
      // Recorded for progression.json, so the quest dashboard can say the graph
      // may be thin rather than presenting an understated "what's next" as fact.
      feedDegraded = true;
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

      if (stillSparse && !allowSparse) {
        throw new SparseFeedError(
          "Still incomplete after the fallback. Refusing to overwrite good data.\n" +
            "Re-run later, refresh the fallback with `npm run task-facts`, or set\n" +
            "TK_ALLOW_SPARSE_TASKS=1 if the game really did change this much.",
        );
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
          keys: data.keys ?? {},
        });
      }
    } catch {
      /* first build, nothing to compare against */
    }
    return out;
  })();
  const previousQuests = [...previousByMap.values()].reduce((n, m) => n + m.quests.length, 0);

  const previousHideout = await (async () => {
    try {
      return JSON.parse(await fs.readFile(path.join(OUT, "hideout.json"), "utf8"));
    } catch {
      return null;
    }
  })();
  const previousItems = await (async () => {
    try {
      return JSON.parse(await fs.readFile(path.join(OUT, "items.json"), "utf8"));
    } catch {
      return null;
    }
  })();
  const vendorHideout = await (async () => {
    try {
      return JSON.parse(await fs.readFile(path.join(ROOT, "data", "hideout.json"), "utf8"));
    } catch {
      return null;
    }
  })();

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
     *
     * The description is hashed rather than truncated. An earlier version cut the
     * slug at 40 characters, which collided for five real pairs — two Ground Zero
     * spawns both beginning "inside the room next to terragroup scien…" landed on
     * one id, and because they also share a position they end up in the same
     * panel list, rendering two <li> with the same React key.
     */
    const documents = (kordDocuments[name] ?? []).map((spawn) => ({
      id: `doc-${slug(spawn.document)}-${hash(spawn.note)}`,
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
      generated,
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
      bosses: collapseGoons(bossSummary.map((b) => b.name)),
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
    JSON.stringify(
      { generated, gameMode: GAME_MODE, feedDegraded, maps: index },
      null,
      1,
    ),
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

    if (drop > 0.15 && !allowSparse) {
      console.warn(
        `\n  upstream dropped ${(drop * 100).toFixed(0)}% of the quest markers — ` +
          `restoring the missing ones from the last good build.`,
      );
      let restoredMarkers = 0;
      let restoredTasks = 0;
      let restoredKeys = 0;

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
            const task = previous.tasks[marker.task];
            payload.tasks[marker.task] = task;
            restoredTasks++;
            /*
             * A task carries key ids, and `usedKeyIds` was computed long before
             * this loop ran — so a task restored here arrives with a `keys` array
             * pointing at records the payload does not have. The panel filters
             * dangling ids out (TaskPanel resolves via `data.keys[id]`), so the
             * failure is silent: the door you need a key for simply stops saying
             * which key.
             *
             * Taken from the live `keyIndex`, not from the previous payload. The
             * previous build had this same gap, so copying from it restores
             * nothing and the hole persists build after build — which is exactly
             * what six tasks were doing, among them Factory's "Delivery From the
             * Past" and its Tarcone Director's office key.
             */
            for (const keyId of task.keys ?? []) {
              if (payload.keys[keyId]) continue;
              const record = keyIndex[keyId] ?? previous.keys[keyId];
              if (!record) continue;
              payload.keys[keyId] = record;
              restoredKeys++;
            }
          }
        }

        await fs.writeFile(file, JSON.stringify(payload));
        entry.counts.quests = payload.markers.quests.length;
      }

      console.warn(
        `  restored ${restoredMarkers} marker(s), ${restoredTasks} task record(s)` +
          `${restoredKeys ? ` and ${restoredKeys} key record(s)` : ""}`,
      );
      await fs.writeFile(
        path.join(OUT, "index.json"),
        JSON.stringify(
          { generated, gameMode: GAME_MODE, feedDegraded, maps: index },
          null,
          1,
        ),
      );
    }
  }

  /*
   * Task screenshots are gathered by `npm run images` and committed to
   * data/task-images.json. Copied rather than refetched so a deploy never
   * depends on the wiki; if it is missing the gallery simply doesn't appear.
   */
  /* --------------------------------------------------------------- progression */

  /**
   * The complete prerequisite graph, covering every task in the game rather than
   * only the ones with map markers.
   *
   * This has to be separate from the per-map payloads, for a reason that is easy
   * to miss: roughly half of all prerequisite edges point at tasks that never
   * appear on a map — hand the item back to the trader, reach a loyalty level,
   * train a skill. A per-map file has no row to hang those on, so it drops them
   * (see the `requires` field built above, which is deliberately pruned). Without
   * those links you cannot tell whether anything is unlocked, which is the whole
   * question a quest tracker exists to answer.
   *
   * `requires` is a disjunction of conjunctions — alternative requirement sets,
   * satisfied when *any one* set is fully met. Single-variant tasks have exactly
   * one set. The merged branch variants matter here: the three "Make Amends"
   * tasks are reached from three different quests and collapse to one canonical
   * id, so each contributes its own set and doing any one branch unlocks it.
   * Flattening them into a single set would claim you need all three.
   */
  const mapsByTask = new Map();
  const addTaskMap = (taskId, mapName) => {
    if (!taskId || !mapName) return;
    if (!mapsByTask.has(taskId)) mapsByTask.set(taskId, new Set());
    mapsByTask.get(taskId).add(mapName);
  };
  for (const [mapName, markers] of questMarkers) {
    for (const marker of markers) addTaskMap(marker.task, mapName);
  }
  // Tasks that name a map without coordinates — extract, survive, kill-N — still
  // belong on that map. Marker-only assignment left ~300 progression rows with
  // an empty maps list, so the dashboard could not send you there.
  for (const [mapName, ids] of mapTaskIds) {
    for (const id of ids) {
      addTaskMap(id, mapName);
      addTaskMap(canonicalOf(id), mapName);
    }
  }

  /** Item ids a task wants handed in, with the found-in-raid flag preserved. */
  function itemNeeds(task) {
    const out = [];
    for (const obj of task.objectives ?? []) {
      if (obj.type !== "giveItem" && obj.type !== "findItem") continue;
      const ids = (obj.items ?? []).filter(Boolean);
      if (!ids.length) continue;
      const first = items[ids[0]];
      out.push({
        items: ids,
        // The list is alternatives ("any of these"); name the first and say so.
        name: first?.name ?? "Unknown item",
        icon: first?.iconLink ?? null,
        count: obj.count ?? 1,
        foundInRaid: !!obj.foundInRaid,
      });
    }
    return out;
  }

  const progression = {};
  const progressionKeyIds = new Set();
  for (const [canonicalId, members] of groupMembers) {
    const primary = members[0];
    const requires = [];
    for (const member of members) {
      const set = (member.taskRequirements ?? [])
        .filter((r) => r.task)
        .map((r) => ({ task: canonicalOf(r.task), status: r.status ?? ["complete"] }));
      // Identical requirement sets across variants would just be redundant work
      // for the solver, so keep one of each.
      const signature = JSON.stringify(set);
      if (!requires.some((existing) => JSON.stringify(existing) === signature)) requires.push(set);
    }

    // Loyalty gates. The feed states these numerically with an explicit compare,
    // so nothing has to be inferred.
    const traderGates = (primary.traderRequirements ?? [])
      .filter((r) => r.trader && typeof r.value === "number")
      .map((r) => ({
        trader: traderIndex[r.trader]?.name ?? r.trader,
        kind: r.requirementType === "reputation" ? "reputation" : "level",
        value: r.value,
      }));

    // Keys keep their map binding here, unlike the flattened per-map list.
    const keys = (primary.neededKeys ?? [])
      .map((k) => ({
        map: mapNamesForId(k.map ?? "")[0] ?? null,
        keys: (k.keys ?? []).filter((id) => keyIndex[id]),
      }))
      .filter((k) => k.keys.length);
    for (const group of keys) for (const id of group.keys) progressionKeyIds.add(id);

    progression[canonicalId] = {
      name: primary.name,
      trader: traderIndex[primary.trader]?.name ?? null,
      minPlayerLevel: primary.minPlayerLevel ?? 0,
      factionName: primary.factionName && primary.factionName !== "Any" ? primary.factionName : null,
      kappaRequired: !!primary.kappaRequired,
      lightkeeperRequired: !!primary.lightkeeperRequired,
      experience: primary.experience ?? 0,
      requires,
      maps: [...(mapsByTask.get(canonicalId) ?? [])].sort(),
      traderGates,
      needs: itemNeeds(primary),
      keys,
      wiki: primary.wikiLink ?? null,
    };
  }

  /*
   * Fill the feed's gaps from the wiki scrape.
   *
   * The feed states prerequisites for well under half its tasks — the rest carry
   * nothing at all, and a task nothing gates reads as available from level one.
   * `scripts/fetch-quest-prereqs.mjs` reads the same relationships off the wiki's
   * quest infoboxes and writes them to data/quest-prereqs.json.
   *
   * The merge is one-directional on purpose: **the feed wins wherever it has an
   * opinion.** A wiki edge is only ever added to a task the feed said nothing
   * about, so a community edit can fill a silence but can never contradict, or
   * quietly reshape, a relationship the feed actually stated. Requirements carry
   * where they came from so the UI can say which is which.
   *
   * Missing the file is not an error. Someone building without running the scrape gets
   * the feed-only graph, which is exactly what shipped before this existed.
   */
  {
    let wikiPrereqs = null;
    try {
      wikiPrereqs = JSON.parse(
        await fs.readFile(path.join(ROOT, "data", "quest-prereqs.json"), "utf8"),
      );
    } catch {
      console.warn("  no quest-prereqs.json — building the graph from the feed alone");
    }

    for (const task of Object.values(progression)) {
      for (const set of task.requires) for (const req of set) req.from = "feed";
    }

    if (wikiPrereqs) {
      let filled = 0;
      let added = 0;
      for (const [taskId, before] of Object.entries(wikiPrereqs.requires ?? {})) {
        const task = progression[taskId];
        if (!task) continue;
        // "Has an opinion" means a non-empty set. A task whose only set is empty
        // is one the feed listed with no requirements, which is silence.
        if (task.requires.some((set) => set.length > 0)) continue;

        const set = before
          .filter((id) => progression[id] && id !== taskId)
          .map((id) => ({ task: id, status: ["complete"], from: "wiki" }));
        if (!set.length) continue;

        // Replaces the empty set rather than sitting beside it: an empty set
        // satisfies everything, so leaving it in place would make the new
        // requirements do nothing at all.
        task.requires = [set];
        filled++;
        added += set.length;
      }
      console.log(
        `  wiki prerequisites: filled ${filled} tasks the feed left blank (+${added} edges, ` +
          `${wikiPrereqs.agreement}% of scraped edges stated from both directions)`,
      );
    }
  }

  /*
   * Break prerequisite cycles.
   *
   * The raw feed is a clean DAG. Cycles appear only after canonicalisation: the
   * three "Make Amends" branches collapse to one id while their siblings still
   * name a specific branch, so "Security requires Make Amends" and "Make Amends
   * requires Sweep Up requires Security" closes a loop that does not exist in
   * game.
   *
   * This matters because every task in a cycle waits on another task in the same
   * cycle, so none of them can ever be satisfied and the dashboard would show
   * them locked forever — a confidently wrong answer, which is worse than a
   * missing one. Dropping the edge that closes the loop leaves the rest of the
   * chain intact and at worst makes one task available slightly early.
   *
   * The proper fix is not to merge tasks whose prerequisites differ, but that
   * changes canonical ids, which are what persisted player progress is keyed on.
   * Until that migration exists, this keeps the graph answerable.
   */
  {
    const colour = new Map();
    let broken = 0;
    const walk = (id) => {
      colour.set(id, 1);
      for (const set of progression[id].requires) {
        for (let i = set.length - 1; i >= 0; i--) {
          const next = set[i].task;
          if (!progression[next]) continue;
          if (colour.get(next) === 1) {
            set.splice(i, 1);
            broken++;
            console.warn(`  ! dropped cyclic prerequisite ${progression[id].name} <- ${progression[next].name}`);
          } else if (!colour.has(next)) {
            walk(next);
          }
        }
      }
      colour.set(id, 2);
    };
    for (const id of Object.keys(progression)) if (!colour.has(id)) walk(id);
    if (broken) console.warn(`  broke ${broken} prerequisite cycle(s) introduced by task merging`);
  }

  /*
   * Seasonal story line. Tarkov.dev does not publish KORD BREACH tasks, so they
   * are vendored in src/data/kord-season.json and folded in here. A task the
   * feed already has (same id) wins — we never overwrite a live record.
   */
  {
    try {
      const season = JSON.parse(
        await fs.readFile(path.join(ROOT, "src", "data", "kord-season.json"), "utf8"),
      );
      let added = 0;
      for (const quest of season.questline ?? []) {
        if (progression[quest.id]) continue;
        const sets = quest.requireAny
          ? (quest.requires ?? []).map((req) => [{ ...req, from: "wiki" }])
          : quest.requires?.length
            ? [(quest.requires ?? []).map((req) => ({ ...req, from: "wiki" }))]
            : [];
        progression[quest.id] = {
          name: `${quest.name} [KORD BREACH]`,
          trader: quest.trader,
          minPlayerLevel: 0,
          factionName: null,
          kappaRequired: false,
          lightkeeperRequired: false,
          requires: sets,
          maps: quest.maps ?? [],
          traderGates:
            typeof quest.traderLevel === "number"
              ? [{ trader: quest.trader, kind: "level", value: quest.traderLevel }]
              : [],
          needs: [],
          keys: [],
          wiki: quest.wiki ?? null,
        };
        added++;
      }
      if (added) console.log(`  kord season: added ${added} story tasks the feed does not ship`);
      await fs.copyFile(
        path.join(ROOT, "src", "data", "kord-season.json"),
        path.join(OUT, "kord-season.json"),
      );
    } catch (err) {
      console.warn(`  no kord-season.json — seasonal story line omitted (${err.message})`);
    }
  }

  {
    const all = Object.values(progression);
    const edges = all.reduce((n, t) => n + t.requires.flat().length, 0);
    const onMap = all.filter((t) => t.maps.length).length;
    const fir = all.reduce((n, t) => n + t.needs.filter((x) => x.foundInRaid).length, 0);

    /*
     * How much of the graph is actually known.
     *
     * A task with no prerequisite and no level gate is one nothing holds back, so
     * it shows as available from the first minute of a wipe. Counting those is
     * the closest thing to an honest self-assessment this build can make, and it
     * is what the dashboard reports instead of a vague "data may be incomplete".
     */
    const withPrereq = all.filter((t) => t.requires.some((set) => set.length > 0)).length;
    const ungated = all.filter(
      (t) =>
        !t.requires.some((set) => set.length > 0) &&
        t.minPlayerLevel <= 1 &&
        t.traderGates.length === 0,
    ).length;

    console.log(
      `  progression graph: ${all.length} tasks (${onMap} on a map), ` +
        `${edges} prerequisite edges, ${fir} find-in-raid needs`,
    );
    console.log(
      `  coverage: ${withPrereq}/${all.length} tasks have a prerequisite, ` +
        `${ungated} have nothing gating them at all`,
    );

    const progressionFile = path.join(OUT, "progression.json");
    await fs.writeFile(
      progressionFile,
      JSON.stringify({
        generated,
        // The dashboard says so out loud rather than presenting a thin graph as
        // fact. `feedDegraded` is set by the feed-health check further up.
        degraded: feedDegraded,
        /**
         * What the graph knows, so the dashboard can report it rather than either
         * hiding the gap or crying wolf about it on every visit.
         */
        coverage: { tasks: all.length, withPrereq, ungated },
        tasks: progression,
        keys: Object.fromEntries([...progressionKeyIds].map((id) => [id, keyIndex[id]])),
      }),
    );
    const kb = ((await fs.stat(progressionFile)).size / 1024).toFixed(0);
    console.log(`  wrote progression.json (${kb}KB, ${progressionKeyIds.size} keys)`);
  }

  /* --------------------------------------------------------- hideout + items */

  {
    const neededIds = new Set(progressionKeyIds);
    for (const task of Object.values(progression)) {
      for (const need of task.needs ?? []) for (const id of need.items ?? []) neededIds.add(id);
    }

    let hideoutStations = [];
    // json.tarkov.dev renamed this feed from hideout_stations -> hideout.
    // Try both so a revert upstream does not empty the hideout page.
    for (const feed of [`${GAME_MODE}/hideout`, `${GAME_MODE}/hideout_stations`]) {
      try {
        const raw = await getLocalised(feed);
        const bag = raw.hideoutStations ?? raw.stations ?? raw;
        const list = Array.isArray(bag) ? bag : Object.values(bag ?? {});
        const usable = list.filter((s) => s && (s.levels || s.name || s.id));
        if (usable.length) {
          hideoutStations = usable;
          console.log(`  hideout: ${usable.length} stations from ${feed}`);
          break;
        }
      } catch (err) {
        console.warn(`  hideout ${feed} unavailable (${err.message})`);
      }
    }

    let stations = hideoutStations.map((station) => {
      const levels = (station.levels ?? []).map((level) => {
        const reqs = (level.itemRequirements ?? [])
          .map((r) => {
            const itemId = typeof r.item === "string" ? r.item : r.item?.id ?? r.itemId;
            if (itemId) neededIds.add(itemId);
            return {
              itemId: itemId ?? "",
              count: r.count ?? 1,
              foundInRaid: !!r.foundInRaid,
            };
          })
          .filter((r) => r.itemId);
        const stationReqs = (level.stationLevelRequirements ?? [])
          .map((r) => ({
            stationId: typeof r.station === "string" ? r.station : r.station?.id ?? r.stationId,
            level: r.level ?? 1,
          }))
          .filter((r) => r.stationId);
        return {
          id: level.id ?? `${station.id}-${level.level}`,
          level: level.level ?? 0,
          itemRequirements: reqs,
          stationLevelRequirements: stationReqs,
        };
      });
      return {
        id: station.id,
        name: station.name,
        image: station.imageLink ?? null,
        levels,
      };
    });

    // json.tarkov.dev/hideout_stations 404s. An empty write would wipe the
    // committed snapshot on every deploy (`npm run data` is the Vercel build).
    // Keep the previous file, then the vendored Kappa snapshot, never `[]`.
    if (!stations.length) {
      const fallback =
        previousHideout?.stations?.length ? previousHideout : vendorHideout;
      if (fallback?.stations?.length) {
        stations = fallback.stations;
        console.warn(`  hideout feed empty; kept ${stations.length} stations from snapshot`);
      }
    }
    for (const station of stations) {
      for (const level of station.levels ?? []) {
        for (const req of level.itemRequirements ?? []) if (req.itemId) neededIds.add(req.itemId);
      }
    }

    const hideoutPayload = { generated, stations };
    await fs.writeFile(path.join(OUT, "hideout.json"), JSON.stringify(hideoutPayload));
    // Keep the vendored snapshot in step with a healthy live fetch so the next
    // 404 does not roll the site back to an older wipe.
    if (hideoutStations.length) {
      await fs.writeFile(path.join(ROOT, "data", "hideout.json"), JSON.stringify(hideoutPayload));
    }
    console.log(`  wrote hideout.json (${stations.length} stations)`);

    const catalog = {};
    for (const id of neededIds) {
      const it = items[id];
      if (!it) continue;
      const crafts = [];
      for (const c of it.craftedBy ?? it.crafts ?? []) {
        const name = c.stationName ?? c.station?.name;
        if (name && !crafts.includes(name)) crafts.push(name);
      }
      catalog[id] = {
        id,
        name: it.name,
        shortName: it.shortName ?? it.name,
        icon: it.iconLink ?? it.gridImageLink ?? null,
        width: it.width ?? 1,
        height: it.height ?? 1,
        craftableStations: crafts,
      };
    }
    const prevCatalog = previousItems?.items ?? {};
    for (const id of neededIds) {
      if (!catalog[id] && prevCatalog[id]) catalog[id] = prevCatalog[id];
    }
    await fs.writeFile(
      path.join(OUT, "items.json"),
      JSON.stringify({ generated, items: catalog }),
    );
    console.log(`  wrote items.json (${Object.keys(catalog).length} items)`);
  }

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

  console.log(`\nWrote ${index.length} maps and ${imageNote} to ${OUT}`);

  return { maps: index.length, imageNote, feedDegraded, generated };
}
