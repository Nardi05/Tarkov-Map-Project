import L from "leaflet";
import type {
  BossSpawn,
  Extract,
  Hazard,
  KeyItem,
  Lock,
  MapData,
  MapSwitch,
  QuestMarker,
  Spawn,
  Task,
  TaskAvailability,
  TaskStatus,
  Transit,
  Vec3,
} from "../types";
import { LAYER_BY_ID, type LayerDef, type LayerId } from "./layers";
import { markerIcon } from "./marker-icons";
import { toLatLng, withinExtents, type Extent } from "./leaflet-crs";

/** A boss's positions inside one spawn zone, collapsed into a single pin. */
export interface BossGroup {
  id: string;
  name: string;
  normalizedName: string | null;
  zone: string | null;
  mapChance: number | null;
  zoneChance: number | null;
  escorts: { name: string; amount: number | null }[];
  centre: Vec3;
  positions: Vec3[];
}

/** Every objective of one task that lands on this map, shown as one entry. */
export interface QuestGroup {
  id: string;
  task: Task;
  markers: QuestMarker[];
  centre: Vec3;
}

export type Selection =
  | { kind: "spawn"; spawn: Spawn }
  | { kind: "boss"; boss: BossGroup }
  | { kind: "extract"; extract: Extract }
  | { kind: "transit"; transit: Transit }
  | { kind: "lock"; lock: Lock; key: KeyItem | null }
  | { kind: "quest"; marker: QuestMarker; task: Task }
  | { kind: "switch"; sw: MapSwitch }
  | { kind: "hazard"; hazard: Hazard };

export interface BuildContext {
  data: MapData;
  /** Elevation bands of the active floor; null means "no floor filtering". */
  extents: Extent[] | null;
  markerScale: number;
  showZones: boolean;
  showMarkerLabels: boolean;
  showQuestLabels: boolean;
  dimCompleted: boolean;
  /** What the player said about each task; absent means not started. */
  taskStatus: Record<string, TaskStatus>;
  /** Individual objective locations already ticked off. */
  markerDone: Record<string, true>;
  /** Quest markers already narrowed by the quest filter panel. */
  visibleQuests: QuestMarker[];
  renderer: L.Renderer;
  onSelect: (selection: Selection) => void;
}

const centroid = (points: Vec3[]): Vec3 => {
  const sum = points.reduce<[number, number, number]>(
    (acc, p) => [acc[0] + p[0], acc[1] + p[1], acc[2] + p[2]],
    [0, 0, 0],
  );
  const n = points.length || 1;
  return [sum[0] / n, sum[1] / n, sum[2] / n];
};

const escapeHtml = (s: string) => s.replace(/[<>&"]/g, (c) => `&#${c.charCodeAt(0)};`);

function tooltip(title: string, sub?: string | null): string {
  return `<b>${escapeHtml(title)}</b>${sub ? `<span>${escapeHtml(sub)}</span>` : ""}`;
}

/**
 * Which label survives when two collide. Exits outrank everything: they are
 * what a player needs to read at a glance, and there are few of them.
 */
const LABEL_PRIORITY: Partial<Record<LayerId, number>> = {
  transits: 60,
  "shared-extracts": 55,
  "pmc-extracts": 50,
  "scav-extracts": 45,
  "boss-spawns": 40,
  quests: 20,
  keys: 15,
  switches: 10,
};

/** Symbol marker with hover tooltip and click-to-select wired up. */
function symbol(
  position: Vec3,
  def: LayerDef,
  ctx: BuildContext,
  title: string,
  sub: string | null,
  select: Selection,
  opts: { label?: string | null; done?: boolean } = {},
): L.Marker {
  const marker = L.marker(toLatLng(position), {
    icon: markerIcon({
      shape: def.shape,
      color: def.color,
      scale: ctx.markerScale,
      label: ctx.showMarkerLabels ? opts.label : null,
      labelPriority: LABEL_PRIORITY[def.id] ?? 0,
      done: opts.done,
    }),
    keyboard: true,
    riseOnHover: true,
    title,
  });
  marker.bindTooltip(tooltip(title, sub), { direction: "top", offset: [0, -10], className: "tk-tip" });
  marker.on("click", () => ctx.onSelect(select));
  marker.on("keypress", (e) => {
    if ((e as unknown as { originalEvent: KeyboardEvent }).originalEvent.key === "Enter") {
      ctx.onSelect(select);
    }
  });
  return marker;
}

/**
 * Ground footprint of an extract / quest zone / hazard. `fade` dims the whole
 * shape so a finished objective's outline doesn't stay bright under a dimmed
 * pin.
 */
function outlinePolygon(
  outline: [number, number][],
  color: string,
  ctx: BuildContext,
  interactive = false,
  fade = 1,
): L.Polygon {
  return L.polygon(
    outline.map(([x, z]) => L.latLng(z, x)),
    {
      renderer: ctx.renderer,
      color,
      weight: 1.5,
      opacity: 0.85 * fade,
      fillColor: color,
      fillOpacity: 0.16 * fade,
      interactive,
    },
  );
}

const pct = (n: number | null | undefined) =>
  n == null ? null : `${Math.round(n * (n <= 1 ? 100 : 1))}%`;

/* ------------------------------------------------------------------- spawns */

const SPAWN_LAYER: Partial<Record<Spawn["group"], LayerId>> = {
  pmc: "pmc-spawns",
  "pmc-ai": "pmc-bot-spawns",
  scav: "scav-spawns",
  "scav-ai": "scav-spawns",
  sniper: "sniper-spawns",
};

function buildSpawns(ctx: BuildContext, layerId: LayerId): L.Layer[] {
  const def = LAYER_BY_ID[layerId];
  const out: L.Layer[] = [];
  const radius = 4.5 * ctx.markerScale;

  for (const spawn of ctx.data.markers.spawns) {
    if (SPAWN_LAYER[spawn.group] !== layerId) continue;
    if (!withinExtents(spawn, ctx.extents)) continue;

    const aiOnly = !spawn.categories.includes("player");
    // Canvas circles, not div icons: spawn points run into the hundreds and
    // this is the difference between a smooth pan and a stuttering one.
    const dot = L.circleMarker(toLatLng(spawn.position), {
      renderer: ctx.renderer,
      radius,
      color: "rgba(6,10,15,.75)",
      weight: 1.5,
      fillColor: def.color,
      fillOpacity: aiOnly ? 0.55 : 0.95,
      className: "tk-spawn",
    });
    const label = spawn.zone ? `${def.label.replace(" spawns", "")} — ${spawn.zone}` : def.label;
    dot.bindTooltip(tooltip(label, aiOnly ? "AI only, not a player start" : null), {
      direction: "top",
      className: "tk-tip",
    });
    dot.on("click", () => ctx.onSelect({ kind: "spawn", spawn }));
    out.push(dot);
  }
  return out;
}

function buildBossSpawns(ctx: BuildContext): L.Layer[] {
  const def = LAYER_BY_ID["boss-spawns"];
  const groups = new Map<string, BossSpawn[]>();

  for (const boss of ctx.data.markers.bossSpawns) {
    if (!withinExtents(boss, ctx.extents)) continue;
    const key = `${boss.name}|${boss.zone ?? ""}`;
    const bucket = groups.get(key);
    if (bucket) bucket.push(boss);
    else groups.set(key, [boss]);
  }

  const out: L.Layer[] = [];
  for (const [key, members] of groups) {
    const first = members[0];
    const positions = members.map((m) => m.position);
    const group: BossGroup = {
      id: key,
      name: first.name,
      normalizedName: first.normalizedName,
      zone: first.zone,
      mapChance: first.mapChance,
      zoneChance: first.zoneChance,
      escorts: first.escorts,
      centre: centroid(positions),
      positions,
    };

    // The individual points stay visible as faint pips so the pin doesn't
    // imply the boss always stands on one exact spot.
    if (positions.length > 1) {
      for (const p of positions) {
        out.push(
          L.circleMarker(toLatLng(p), {
            renderer: ctx.renderer,
            radius: 2.6 * ctx.markerScale,
            color: def.color,
            weight: 1,
            opacity: 0.7,
            fillColor: def.color,
            fillOpacity: 0.35,
            interactive: false,
          }),
        );
      }
    }

    const chance = pct(group.mapChance);
    out.push(
      symbol(
        group.centre,
        def,
        ctx,
        group.name,
        [group.zone, chance ? `${chance} to spawn on this map` : null].filter(Boolean).join(" · ") || null,
        { kind: "boss", boss: group },
        { label: ctx.showMarkerLabels ? group.name : null },
      ),
    );
  }
  return out;
}

/* ------------------------------------------------------------------- exits */

const EXTRACT_LAYER: Record<Extract["faction"], LayerId> = {
  pmc: "pmc-extracts",
  scav: "scav-extracts",
  shared: "shared-extracts",
};

function buildExtracts(ctx: BuildContext, layerId: LayerId): L.Layer[] {
  const def = LAYER_BY_ID[layerId];
  const out: L.Layer[] = [];

  for (const extract of ctx.data.markers.extracts) {
    if (EXTRACT_LAYER[extract.faction] !== layerId) continue;
    if (!withinExtents(extract, ctx.extents)) continue;

    if (ctx.showZones && extract.outline) {
      out.push(outlinePolygon(extract.outline, def.color, ctx));
    }
    const needs = extract.switches.length ? "Needs a switch flipped first" : null;
    out.push(
      symbol(
        extract.position,
        def,
        ctx,
        extract.name,
        [def.label, needs].filter(Boolean).join(" · "),
        { kind: "extract", extract },
        { label: extract.name },
      ),
    );
  }
  return out;
}

function buildTransits(ctx: BuildContext): L.Layer[] {
  const def = LAYER_BY_ID["transits"];
  const out: L.Layer[] = [];

  for (const transit of ctx.data.markers.transits) {
    if (!withinExtents(transit, ctx.extents)) continue;
    if (ctx.showZones && transit.outline) {
      out.push(outlinePolygon(transit.outline, def.color, ctx));
    }
    out.push(
      symbol(
        transit.position,
        def,
        ctx,
        transit.name,
        transit.description ?? "Continue into the next map with your gear",
        { kind: "transit", transit },
        { label: transit.target ?? transit.name },
      ),
    );
  }
  return out;
}

/* ------------------------------------------------------------ tasks & keys */

function buildQuests(ctx: BuildContext): L.Layer[] {
  const def = LAYER_BY_ID["quests"];
  const out: L.Layer[] = [];

  // How many markers each task has here, so a pin can say "location 2 of 3".
  const positions = new Map<string, QuestMarker[]>();
  for (const marker of ctx.visibleQuests) {
    const bucket = positions.get(marker.task);
    if (bucket) bucket.push(marker);
    else positions.set(marker.task, [marker]);
  }

  for (const marker of ctx.visibleQuests) {
    if (!withinExtents(marker, ctx.extents)) continue;
    const task = ctx.data.tasks[marker.task];
    if (!task) continue;

    // A location counts as handled either because the player ticked this exact
    // spot off, or because the whole task is behind them.
    const done = !!ctx.markerDone[marker.id] || ctx.taskStatus[task.id] === "completed";
    const dim = ctx.dimCompleted && done;

    if (ctx.showZones && marker.outline) {
      out.push(outlinePolygon(marker.outline, def.color, ctx, false, dim ? 0.35 : 1));
    }

    const siblings = positions.get(marker.task) ?? [marker];
    const detail: string[] = [];
    if (siblings.length > 1) {
      detail.push(`Location ${siblings.indexOf(marker) + 1} of ${siblings.length}`);
    }
    if (marker.count && marker.count > 1) detail.push(`Needs ${marker.count}`);

    out.push(
      symbol(
        marker.position,
        def,
        ctx,
        task.name,
        [marker.description, ...detail].filter(Boolean).join(" · "),
        { kind: "quest", marker, task },
        { label: ctx.showQuestLabels ? task.name : null, done: dim },
      ),
    );
  }
  return out;
}

function buildLocks(ctx: BuildContext): L.Layer[] {
  const def = LAYER_BY_ID["keys"];
  const out: L.Layer[] = [];

  for (const lock of ctx.data.markers.locks) {
    if (!withinExtents(lock, ctx.extents)) continue;
    const key = lock.key ? (ctx.data.keys[lock.key] ?? null) : null;
    const title = key ? key.name : `Locked ${lock.lockType}`;
    const sub = [
      key ? `Opens this ${lock.lockType}` : "No key known for this lock",
      lock.needsPower ? "Needs power on" : null,
    ]
      .filter(Boolean)
      .join(" · ");
    out.push(
      symbol(lock.position, def, ctx, title, sub, { kind: "lock", lock, key }, {
        label: key?.shortName ?? null,
      }),
    );
  }
  return out;
}

/* -------------------------------------------------------------------- world */

function buildSwitches(ctx: BuildContext): L.Layer[] {
  const def = LAYER_BY_ID["switches"];
  return ctx.data.markers.switches
    .filter((sw) => withinExtents(sw, ctx.extents))
    .map((sw: MapSwitch) =>
      symbol(
        sw.position,
        def,
        ctx,
        sw.name,
        sw.activates[0] ?? "Switch",
        { kind: "switch", sw },
        { label: sw.name },
      ),
    );
}

function buildHazards(ctx: BuildContext): L.Layer[] {
  const def = LAYER_BY_ID["hazards"];
  const out: L.Layer[] = [];
  for (const hazard of ctx.data.markers.hazards as Hazard[]) {
    if (!withinExtents(hazard, ctx.extents)) continue;
    if (ctx.showZones && hazard.outline) {
      out.push(outlinePolygon(hazard.outline, def.color, ctx));
    }
    out.push(
      symbol(
        hazard.position,
        def,
        ctx,
        hazard.name,
        hazard.hazardType === "sniper" ? "Sniper Scav covers this area" : "Hazard zone",
        { kind: "hazard", hazard },
      ),
    );
  }
  return out;
}

function buildSniperSpawns(ctx: BuildContext): L.Layer[] {
  const def = LAYER_BY_ID["sniper-spawns"];
  return ctx.data.markers.spawns
    .filter((s) => s.group === "sniper" && withinExtents(s, ctx.extents))
    .map((spawn) =>
      symbol(
        spawn.position,
        def,
        ctx,
        "Sniper Scav",
        spawn.zone,
        { kind: "spawn", spawn },
      ),
    );
}

/* --------------------------------------------------------------------- api */

const BUILDERS: Record<LayerId, (ctx: BuildContext) => L.Layer[]> = {
  "pmc-spawns": (ctx) => buildSpawns(ctx, "pmc-spawns"),
  "pmc-bot-spawns": (ctx) => buildSpawns(ctx, "pmc-bot-spawns"),
  "scav-spawns": (ctx) => buildSpawns(ctx, "scav-spawns"),
  "boss-spawns": buildBossSpawns,
  "sniper-spawns": buildSniperSpawns,
  "pmc-extracts": (ctx) => buildExtracts(ctx, "pmc-extracts"),
  "scav-extracts": (ctx) => buildExtracts(ctx, "scav-extracts"),
  "shared-extracts": (ctx) => buildExtracts(ctx, "shared-extracts"),
  transits: buildTransits,
  quests: buildQuests,
  keys: buildLocks,
  switches: buildSwitches,
  hazards: buildHazards,
};

export function buildLayer(id: LayerId, ctx: BuildContext): L.LayerGroup {
  return L.layerGroup(BUILDERS[id](ctx));
}

/* --------------------------------------------------------- quest filtering */

export interface QuestFilterInput {
  search: string;
  trader: string | null;
  kappaOnly: boolean;
  /** "active" draws only what the player ticked; "all" draws everything. */
  scope: "active" | "available" | "all";
  focusTask: string | null;
}

/** Which task states each scope lets through. */
const SCOPE_ALLOWS: Record<QuestFilterInput["scope"], TaskAvailability[]> = {
  active: ["active"],
  available: ["active", "available"],
  all: ["active", "available", "locked", "completed", "failed"],
};

export function filterQuests(
  data: MapData,
  filters: QuestFilterInput,
  availability: Record<string, TaskAvailability>,
): QuestMarker[] {
  const needle = filters.search.trim().toLowerCase();
  const allowed = new Set(SCOPE_ALLOWS[filters.scope] ?? SCOPE_ALLOWS.all);

  return data.markers.quests.filter((marker) => {
    const task = data.tasks[marker.task];
    if (!task) return false;
    if (filters.focusTask) return task.id === filters.focusTask;
    // A task the graph doesn't know about (data skew between files) is treated
    // as available rather than vanishing.
    if (!allowed.has(availability[task.id] ?? "available")) return false;
    if (filters.kappaOnly && !task.kappaRequired) return false;
    if (filters.trader && task.trader?.name !== filters.trader) return false;
    if (needle) {
      const haystack = `${task.name} ${marker.description} ${marker.item?.name ?? ""}`.toLowerCase();
      if (!haystack.includes(needle)) return false;
    }
    return true;
  });
}

/** Tasks on this map, grouped for the task list panel. */
export function groupQuests(data: MapData, markers: QuestMarker[]): QuestGroup[] {
  const byTask = new Map<string, QuestMarker[]>();
  for (const marker of markers) {
    const bucket = byTask.get(marker.task);
    if (bucket) bucket.push(marker);
    else byTask.set(marker.task, [marker]);
  }

  const groups: QuestGroup[] = [];
  for (const [taskId, taskMarkers] of byTask) {
    const task = data.tasks[taskId];
    if (!task) continue;
    groups.push({
      id: taskId,
      task,
      markers: taskMarkers,
      centre: centroid(taskMarkers.map((m) => m.position)),
    });
  }
  return groups.sort(
    (a, b) => a.task.minPlayerLevel - b.task.minPlayerLevel || a.task.name.localeCompare(b.task.name),
  );
}

export { centroid, pct };
