/**
 * Everything on one map that a player might go looking for, listed once.
 *
 * Two features read this list and neither knows about the other:
 *
 *   search       — "where is Dorms 220?" typed into the map panel
 *   off-floor    — a ghost pip saying "the thing you want is one floor up"
 *
 * Both used to be impossible for the same reason: the map's knowledge of its
 * own contents only existed inside the Leaflet layer builders, scattered across
 * eight functions that each filtered by floor and threw the rest away. This is
 * that knowledge pulled out in front, as plain data, so anything can ask it a
 * question without building a layer first.
 *
 * Deliberately free of Leaflet, so it stays testable.
 */
import type { Floor } from "./base-layer";
import type { Selection } from "./build-layers";
import { withinExtents } from "./extents.ts";
import type { LayerId } from "./layers";
import type { DocumentSpawn, MapData, Vec3 } from "../types";

export interface MapPoint {
  id: string;
  layer: LayerId;
  title: string;
  /** One line of context, shown under the title in the result list. */
  subtitle: string | null;
  position: Vec3;
  top?: number | null;
  bottom?: number | null;
  /** Words worth matching that nobody wants to read — key short names, zones. */
  terms: string;
  /** What to open when the player picks it. Null for a place name. */
  select: Selection | null;
}

const centre = (points: Vec3[]): Vec3 => {
  const sum = points.reduce<[number, number, number]>(
    (acc, p) => [acc[0] + p[0], acc[1] + p[1], acc[2] + p[2]],
    [0, 0, 0],
  );
  const n = points.length || 1;
  return [sum[0] / n, sum[1] / n, sum[2] / n];
};

const EXTRACT_LAYER: Record<string, LayerId> = {
  pmc: "pmc-extracts",
  scav: "scav-extracts",
  shared: "shared-extracts",
};

const EXTRACT_LABEL: Record<string, string> = {
  pmc: "PMC extract",
  scav: "Scav extract",
  shared: "Shared extract",
};

/**
 * Index one map.
 *
 * Ordinary Scav and PMC spawn points are left out on purpose: there are four
 * hundred of them, they are interchangeable, and "pmc spawn" is not a thing
 * anybody searches for by name. Named spawns — bosses and sniper nests — are
 * in, because those are.
 */
export function indexMap(data: MapData): MapPoint[] {
  const out: MapPoint[] = [];
  const m = data.markers;

  for (const extract of m.extracts) {
    const layer = EXTRACT_LAYER[extract.faction];
    if (!layer) continue;
    const label = EXTRACT_LABEL[extract.faction];
    out.push({
      /*
       * Faction-qualified, because the feed gives a door usable by both a PMC
       * and a Scav *one* id and lists it twice. Keyed on the id alone, those
       * two rows collided — which React noticed before anybody else did.
       */
      id: `extract:${extract.faction}:${extract.id}`,
      layer,
      title: extract.name,
      // And the subtitle has to say which, or the two rows read as a bug.
      subtitle: extract.switches.length ? `${label} · needs a switch flipped first` : label,
      position: extract.position,
      top: extract.top,
      bottom: extract.bottom,
      terms: `${extract.faction} extract exit`,
      select: { kind: "extract", extract },
    });
  }

  for (const transit of m.transits) {
    out.push({
      id: `transit:${transit.id}`,
      layer: "transits",
      title: transit.name,
      subtitle: transit.target ? `Transit to ${transit.target}` : "Transit",
      position: transit.position,
      top: transit.top,
      bottom: transit.bottom,
      terms: `transit ${transit.target ?? ""}`,
      select: { kind: "transit", transit },
    });
  }

  for (const lock of m.locks) {
    const key = lock.key ? (data.keys[lock.key] ?? null) : null;
    out.push({
      id: `lock:${lock.id}`,
      layer: "keys",
      title: key ? key.name : `Locked ${lock.lockType}`,
      subtitle: key ? `Key · opens this ${lock.lockType}` : "Locked, no key known",
      position: lock.position,
      top: lock.top,
      bottom: lock.bottom,
      terms: `key door locked ${key?.shortName ?? ""} ${lock.lockType}`,
      select: { kind: "lock", lock, key },
    });
  }

  for (const sw of m.switches) {
    out.push({
      id: `switch:${sw.id}`,
      layer: "switches",
      title: sw.name,
      subtitle: sw.activates[0] ?? "Switch",
      // A switch is a point on a wall, with no vertical span to carry, so the
      // floor filter reads it off its own elevation like the map already does.
      position: sw.position,
      terms: `switch lever power ${sw.activates.join(" ")}`,
      select: { kind: "switch", sw },
    });
  }

  for (const hazard of m.hazards) {
    out.push({
      id: `hazard:${hazard.id}`,
      layer: "hazards",
      title: hazard.name,
      subtitle: hazard.hazardType === "sniper" ? "Sniper Scav covers this area" : "Hazard zone",
      position: hazard.position,
      top: hazard.top,
      bottom: hazard.bottom,
      terms: `hazard danger ${hazard.hazardType ?? ""}`,
      select: { kind: "hazard", hazard },
    });
  }

  // Bosses collapse per spawn zone, exactly as the map draws them, so searching
  // "Reshala" offers his three zones rather than his thirty spawn points.
  const bossZones = new Map<string, typeof m.bossSpawns>();
  for (const boss of m.bossSpawns) {
    const key = `${boss.name}|${boss.zone ?? ""}`;
    const bucket = bossZones.get(key);
    if (bucket) bucket.push(boss);
    else bossZones.set(key, [boss]);
  }
  for (const [key, members] of bossZones) {
    const first = members[0];
    const positions = members.map((b) => b.position);
    out.push({
      id: `boss:${key}`,
      layer: "boss-spawns",
      title: first.name,
      subtitle: first.zone ? `Boss spawn · ${first.zone}` : "Boss spawn",
      position: centre(positions),
      terms: `boss ${first.normalizedName ?? ""} ${first.escorts.map((e) => e.name).join(" ")}`,
      select: {
        kind: "boss",
        boss: {
          id: key,
          name: first.name,
          normalizedName: first.normalizedName,
          zone: first.zone,
          mapChance: first.mapChance,
          zoneChance: first.zoneChance,
          escorts: first.escorts,
          centre: centre(positions),
          positions,
        },
      },
    });
  }

  for (const spawn of m.spawns) {
    if (spawn.group !== "sniper") continue;
    out.push({
      id: `sniper:${spawn.id}`,
      layer: "sniper-spawns",
      title: "Sniper Scav",
      subtitle: spawn.zone,
      position: spawn.position,
      terms: `sniper scav marksman ${spawn.zone ?? ""}`,
      select: {
        kind: "spawn",
        cluster: { id: spawn.id, group: spawn.group, centre: spawn.position, spawns: [spawn] },
      },
    });
  }

  /*
   * Document spawns carry no elevation — they are matched to a named place, so
   * they all sit at y=0 — which is why the map never floor-filters them. They
   * are searchable all the same: "where do Kord documents drop on Streets" is a
   * fair question, and the pin is honest about being a building, not a shelf.
   */
  const byPlace = new Map<string, DocumentSpawn[]>();
  for (const spawn of m.documents ?? []) {
    if (!spawn.position) continue;
    const key = `${spawn.position[0]},${spawn.position[2]}`;
    const group = byPlace.get(key);
    if (group) group.push(spawn);
    else byPlace.set(key, [spawn]);
  }
  for (const [key, group] of byPlace) {
    const first = group[0];
    out.push({
      id: `document:${key}`,
      layer: "documents",
      title: first.place ?? first.document,
      subtitle:
        group.length === 1 ? first.document : `${group.length} document spawns here`,
      position: first.position as Vec3,
      terms: `document battle pass ${[...new Set(group.map((s) => s.document))].join(" ")}`,
      select: { kind: "document", spawn: first, siblings: group },
    });
  }

  for (const marker of m.quests) {
    const task = data.tasks[marker.task];
    if (!task) continue;
    out.push({
      id: `quest:${marker.id}`,
      layer: "quests",
      title: task.name,
      subtitle: marker.description || "Task objective",
      position: marker.position,
      top: marker.top,
      bottom: marker.bottom,
      terms: `task quest objective ${task.trader?.name ?? ""} ${marker.item?.name ?? ""}`,
      select: {
        kind: "quest",
        marker,
        task,
        // The other places this same objective can be, which is what the detail
        // panel means by "alternatives" — not every marker the task owns.
        alternatives: m.quests.filter(
          (q) => q.task === marker.task && q.objective === marker.objective,
        ),
      },
    });
  }

  return out;
}

/* --------------------------------------------------------------------- find */

/**
 * Rank matches the way a person reads a list: the thing whose name *starts*
 * with what you typed first, then the rest of the name matches, then the hidden
 * terms. Without the tiering, typing "dorm" on Customs put "Dorm room 108 key"
 * above "Dorms" itself, because both merely contained the word.
 */
function score(point: MapPoint, needle: string): number {
  const title = point.title.toLowerCase();
  if (title === needle) return 0;
  if (title.startsWith(needle)) return 1;
  if (title.includes(needle)) return 2;
  if ((point.subtitle ?? "").toLowerCase().includes(needle)) return 3;
  if (point.terms.toLowerCase().includes(needle)) return 4;
  return Infinity;
}

export interface SearchResult extends MapPoint {
  /** Which floor it is on, when the map has floors and one of them owns it. */
  floor: Floor | null;
}

export function searchMap(
  points: MapPoint[],
  query: string,
  floors: Floor[] = [],
  limit = 10,
): SearchResult[] {
  const needle = query.trim().toLowerCase();
  if (needle.length < 2) return [];

  const scored: { point: MapPoint; rank: number }[] = [];
  for (const point of points) {
    const rank = score(point, needle);
    if (rank !== Infinity) scored.push({ point, rank });
  }
  scored.sort((a, b) => a.rank - b.rank || a.point.title.localeCompare(b.point.title));

  /*
   * One row per name. A quest item with eleven spawns, or a key that opens four
   * identical doors, is one answer to the question "where is it" — eleven rows
   * saying the same words is not a search result, it is a wall.
   */
  const seen = new Set<string>();
  const out: SearchResult[] = [];
  for (const { point } of scored) {
    const dedupe = `${point.layer}|${point.title.toLowerCase()}`;
    if (seen.has(dedupe)) continue;
    seen.add(dedupe);
    out.push({ ...point, floor: floorOf(point, floors) });
    if (out.length >= limit) break;
  }
  return out;
}

/* ---------------------------------------------------------------- off-floor */

/** The floor that owns a point, ignoring the catch-all "All levels" entry. */
export function floorOf(point: MapPoint, floors: Floor[]): Floor | null {
  if (floors.length < 2) return null;
  return floors.find((f) => f.id !== "all" && withinExtents(point, f.extents)) ?? null;
}

/** The elevation band a floor covers, widest across its extents. */
function band(floor: Floor): [number, number] | null {
  const heights = (floor.extents ?? [])
    .map((e) => e.height)
    .filter((h): h is [number, number] => !!h);
  if (!heights.length) return null;
  return [Math.min(...heights.map((h) => h[0])), Math.max(...heights.map((h) => h[1]))];
}

/**
 * Up or down, from the height of the thing itself.
 *
 * A floor whose band overlaps the one you are standing on — Interchange's mall
 * levels are cut out of the ground plan by footprint, not only by height — has
 * no answer from elevation alone, so it falls back to comparing the two bands.
 */
function directionTo(point: MapPoint, home: Floor, here: [number, number] | null): "up" | "down" {
  const y = point.position[1];
  if (here) {
    if (y >= here[1]) return "up";
    if (y < here[0]) return "down";
  }
  const there = band(home);
  if (there && here) return (there[0] + there[1]) / 2 >= (here[0] + here[1]) / 2 ? "up" : "down";
  return "up";
}

export interface OffFloorPoint {
  /** Where to draw the pip: directly over where the thing actually is. */
  position: Vec3;
  title: string;
  layer: LayerId;
  floorId: string;
  floorName: string;
  /** Which way to go to reach it, from how high it actually is. */
  direction: "up" | "down";
  /** How many things this pip stands for, when several stack on one spot. */
  count: number;
  select: Selection | null;
}

/**
 * What the current floor is hiding.
 *
 * A floor filter is the one place this map silently throws information away:
 * pick "2nd Floor" on Interchange and every extract on the ground plan simply
 * stops existing, with nothing to say it ever did. tarkov.dev answers that with
 * a faint pip you can click to go to the floor the thing is on, and so does
 * this.
 *
 * `isOn` is the caller's business, because "should this be shown" is a question
 * about layer toggles and quest filters that this module has no opinion on.
 */
export function offFloorPoints(
  points: MapPoint[],
  floors: Floor[],
  currentFloorId: string,
  isOn: (point: MapPoint) => boolean,
): OffFloorPoint[] {
  const current = floors.find((f) => f.id === currentFloorId);
  // No floors, or "All levels": nothing is being hidden, so nothing to say.
  if (!current || !current.extents || floors.length < 2) return [];

  /*
   * Which way is "up" comes from the elevations, not from the order the floors
   * are listed in. The listing is a menu, and every map puts its basement at
   * the bottom of it — so reading the order gave Factory's tunnels as "Up on
   * Tunnels", pointing players upstairs to reach a cellar.
   */
  const here = band(current);

  const grouped = new Map<string, OffFloorPoint>();

  for (const point of points) {
    if (withinExtents(point, current.extents)) continue;
    if (!isOn(point)) continue;
    const home = floorOf(point, floors);
    // A point no floor claims is not "on another floor" — it is unplaceable,
    // and pointing at it would be a guess.
    if (!home || home.id === currentFloorId) continue;

    /*
     * Collapse by name and floor, so eleven spawns of one quest item are one
     * pip that says "upstairs", not eleven. Deliberately ignores the layer:
     * a door both a PMC and a Scav can leave by is listed twice by the feed,
     * and two pips stacked on the same pixel is not more information.
     */
    const key = `${home.id}|${point.title.toLowerCase()}`;
    const existing = grouped.get(key);
    if (existing) {
      existing.count += 1;
      continue;
    }
    grouped.set(key, {
      position: point.position,
      title: point.title,
      layer: point.layer,
      floorId: home.id,
      floorName: home.name,
      direction: directionTo(point, home, here),
      count: 1,
      select: point.select,
    });
  }

  return [...grouped.values()];
}
