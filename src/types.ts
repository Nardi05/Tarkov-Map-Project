import type { Extent } from "./lib/leaflet-crs";

export type { Extent };

/** [x, y, z] in game world units. y is elevation. */
export type Vec3 = [number, number, number];
/** Ground-plane polygon as [x, z] pairs. */
export type Ring = [number, number][];

export interface GeoLayer {
  name: string;
  svgLayer: string | null;
  tilePath: string | null;
  show: boolean;
  extents: Extent[] | null;
}

export interface GeoLabel {
  position: [number, number];
  text: string;
  rotation?: number;
  size?: number;
}

/** Georeferencing for one map, vendored from the-hideout/tarkov-dev. */
export interface Geo {
  key: string;
  minZoom: number;
  maxZoom: number;
  tileSize: number;
  transform: [number, number, number, number] | null;
  coordinateRotation: number;
  bounds: [[number, number], [number, number]];
  svgBounds: [[number, number], [number, number]] | null;
  svgPath: string | null;
  svgLayer: string | null;
  tilePath: string | null;
  heightRange: [number, number] | null;
  author: string | null;
  authorLink: string | null;
  layers: GeoLayer[];
  labels: GeoLabel[];
}

export type SpawnGroup = "pmc" | "pmc-ai" | "scav" | "scav-ai" | "boss" | "sniper";

export interface Spawn {
  id: string;
  group: SpawnGroup;
  position: Vec3;
  zone: string | null;
  sides: string[];
  categories: string[];
}

export interface BossSpawn {
  id: string;
  name: string;
  normalizedName: string | null;
  zone: string | null;
  mapChance: number | null;
  zoneChance: number | null;
  escorts: { name: string; amount: number | null }[];
  position: Vec3;
}

export interface Extract {
  id: string;
  name: string;
  rawName: string;
  faction: "pmc" | "scav" | "shared";
  position: Vec3;
  outline: Ring | null;
  top: number | null;
  bottom: number | null;
  switches: { id: string; name: string; position: Vec3 }[];
}

export interface Transit {
  id: string;
  name: string;
  target: string | null;
  targetMap: string | null;
  description: string | null;
  conditions: string | null;
  position: Vec3;
  outline: Ring | null;
  top: number | null;
  bottom: number | null;
}

export interface Lock {
  id: string;
  lockType: string;
  key: string | null;
  needsPower: boolean;
  position: Vec3;
  outline: Ring | null;
  top: number | null;
  bottom: number | null;
}

/**
 * A Kord Breach battle-pass document spawn, from the wiki.
 *
 * `position` is null more often than not, and that is not a data bug — the
 * wiki describes these in prose ("in room 304 on the nightstand") and there is
 * no coordinate source for them anywhere. A spawn with a position was matched
 * to one of the map's named places, so the pin means "somewhere in Dorms", not
 * a surveyed point; `place` names the label it was matched to. The rest are
 * listed in the panel with their description and screenshot and drawn nowhere.
 */
export interface DocumentSpawn {
  id: string;
  document: string;
  note: string;
  image: string | null;
  imageWidth: number;
  imageHeight: number;
  position: Vec3 | null;
  place: string | null;
}

export interface Hazard {
  id: string;
  name: string;
  hazardType: string;
  position: Vec3;
  outline: Ring | null;
  top: number | null;
  bottom: number | null;
}

export interface MapSwitch {
  id: string;
  name: string;
  switchType: string | null;
  position: Vec3;
  activates: string[];
}

export type QuestKind = "visit" | "mark" | "shoot" | "place" | "pickup" | "extract" | "objective";

export interface QuestMarker {
  id: string;
  task: string;
  objective: string;
  kind: QuestKind;
  optional: boolean;
  /**
   * How many the objective asks for ("plant 3"), not how many markers it has —
   * several markers are often alternative spots for a single action.
   */
  count: number | null;
  description: string;
  position: Vec3;
  outline: Ring | null;
  top: number | null;
  bottom: number | null;
  item: { id: string; name: string; icon: string | null } | null;
}

/**
 * What the player has told us about a task. Absent means "not started".
 *
 * Declared by hand or imported from a sync — never inferred. The graph can work
 * out that a task is *available*, but only the player can say it is active or
 * done, and what they say always wins. See `TaskAvailability`.
 */
export type TaskStatus = "active" | "completed" | "failed" | "ignored" | "pinned";

/**
 * A task's state once the graph has had its say.
 *
 * "locked" and "available" are derived from prerequisites, level, faction and
 * trader loyalty; "active" and "completed" only ever come from the player.
 * `computeAvailability` returns the declared status untouched when there is
 * one — the previous version of this feature was removed because the inference
 * had no override, and that is the mistake this must not repeat.
 */
export type TaskAvailability =
  | "locked"
  | "available"
  | "active"
  | "completed"
  | "failed"
  | "ignored"
  | "pinned";

/** One requirement: a prior task that must be in one of these states. */
export interface TaskRequirement {
  task: string;
  status: string[];
  /**
   * Where the requirement came from. The tarkov.dev feed states barely half of
   * them, so the rest are read off the wiki's quest infoboxes — see
   * `scripts/fetch-quest-prereqs.mjs`. A wiki edge is only ever added to a task
   * the feed said nothing about, never over one it stated, but it is a
   * community source and the UI says so rather than passing it off as the feed.
   */
  from?: "feed" | "wiki";
}

/** A trader loyalty or reputation gate, e.g. "Prapor LL2". */
export interface TraderGate {
  trader: string;
  kind: "level" | "reputation";
  value: number;
}

/** An item the task wants handed in, and whether it must be found in raid. */
export interface TaskItemNeed {
  /** Any one of these ids satisfies it; usually a single item. */
  items: string[];
  name: string;
  icon: string | null;
  count: number;
  foundInRaid: boolean;
}

/**
 * One thing a task asks of you, in the feed's own words.
 *
 * The sentence is the guide. "Stash Golden neck chains in the microwave on the
 * 3rd floor of the dorm on Customs" says what to do and where, which is what a
 * tracker has to show and what nobody was going to write 1,400 times by hand.
 *
 * Only about half carry `maps` and a handful carry `keys` — an objective that
 * is a trader hand-in belongs to no map and needs no door.
 */
export interface TaskObjective {
  id: string;
  /** Feed vocabulary: giveItem, findQuestItem, mark, shoot, visit, extract… */
  type: string;
  /** The human-readable instruction. Always present; empty ones are dropped. */
  text: string;
  /** How many, when more than one is wanted. */
  count?: number;
  optional?: boolean;
  foundInRaid?: boolean;
  /** Maps the objective names, whether or not it has coordinates. */
  maps?: string[];
  /** The key this particular objective goes through, not the task's whole ring. */
  keys?: string[];
}

export interface ProgressionTask {
  name: string;
  trader: string | null;
  minPlayerLevel: number;
  factionName: string | null;
  kappaRequired: boolean;
  lightkeeperRequired: boolean;
  /** XP the task pays. Absent on payloads built before this was recorded. */
  experience?: number;
  /** Alternative requirement sets — satisfied when any one set is fully met. */
  requires: TaskRequirement[][];
  /** Maps this task has markers on; empty for tasks handled purely at a trader. */
  maps: string[];
  /** Loyalty gates the trader applies before offering it. */
  traderGates: TraderGate[];
  /** Items to hand in, for the "find in raid" shopping list. */
  needs: TaskItemNeed[];
  /** Keys the task's objectives need, by map. */
  keys: { map: string | null; keys: string[] }[];
  /**
   * Everything the task asks for, in order. Absent on payloads built before
   * this was recorded, so every consumer has to tolerate `undefined`.
   */
  objectives?: TaskObjective[];
  wiki: string | null;
}

/** One hideout station, baked from tarkov.dev at build time. */
export interface HideoutStation {
  id: string;
  name: string;
  image: string | null;
  levels: HideoutLevel[];
}

export interface HideoutLevel {
  id: string;
  level: number;
  itemRequirements: { itemId: string; count: number; foundInRaid: boolean }[];
  stationLevelRequirements: { stationId: string; level: number }[];
}

export interface HideoutData {
  generated: string;
  stations: HideoutStation[];
}

/** Items the planner, audit grid and hideout actually name — not the whole flea. */
export interface CatalogItem {
  id: string;
  name: string;
  shortName: string;
  icon: string | null;
  width: number;
  height: number;
  craftableStations: string[];
}

export interface ItemCatalog {
  generated: string;
  items: Record<string, CatalogItem>;
}

/**
 * The complete task graph, including tasks that never appear on a map. Roughly
 * half of all prerequisite edges point at those, so availability can't be
 * worked out from the per-map payloads alone.
 */
export interface Progression {
  generated: string;
  /** True when the upstream feed looked degraded and the graph may be thin. */
  degraded: boolean;
  /**
   * What the graph actually knows, so the dashboard can report the gap in
   * numbers instead of warning about it vaguely on every visit.
   *
   * `ungated` counts tasks with no prerequisite, no level and no trader gate —
   * ones nothing holds back, which therefore read as available from the first
   * minute of a wipe. That number is the honest measure of what is still
   * missing. Absent on payloads built before this was recorded.
   */
  coverage?: { tasks: number; withPrereq: number; ungated: number };
  tasks: Record<string, ProgressionTask>;
  /** Every key any task needs, so a cross-map list has names and icons. */
  keys: Record<string, KeyItem>;
}

/** One wiki screenshot for a task, hotlinked from the wiki's own CDN. */
export interface TaskImage {
  url: string;
  width: number;
  height: number;
  title: string;
}

/** taskId -> its screenshots. Fetched lazily; absent means "none known". */
export interface TaskImages {
  generated: string;
  source: string;
  tasks: Record<string, TaskImage[]>;
  /**
   * Story chapters, which are vendored checklists rather than feed tasks. Keyed
   * by wiki page because eight endgame chapters share one, and which photo goes
   * with which step is worked out on the client — see `lib/story-media.ts`.
   */
  story?: {
    pages: Record<string, TaskImage[]>;
    chapters: Record<string, string>;
  };
}

export interface Task {
  id: string;
  name: string;
  normalizedName: string;
  trader: { name: string; image: string | null } | null;
  minPlayerLevel: number;
  experience: number;
  kappaRequired: boolean;
  lightkeeperRequired: boolean;
  factionName: string | null;
  wiki: string | null;
  requires: string[];
  keys: string[];
}

export interface KeyItem {
  id: string;
  name: string;
  shortName: string;
  icon: string | null;
  wiki: string | null;
}

export interface BossSummary {
  name: string;
  normalizedName: string | null;
  spawnChance: number | null;
  zones: { name: string; chance: number | null }[];
}

export interface MapData {
  id: string;
  name: string;
  normalizedName: string;
  description: string | null;
  wiki: string | null;
  players: string | null;
  raidDuration: number | null;
  enemies: string[];
  bosses: BossSummary[];
  geo: Geo;
  markers: {
    spawns: Spawn[];
    bossSpawns: BossSpawn[];
    extracts: Extract[];
    transits: Transit[];
    locks: Lock[];
    hazards: Hazard[];
    switches: MapSwitch[];
    quests: QuestMarker[];
    documents: DocumentSpawn[];
  };
  tasks: Record<string, Task>;
  keys: Record<string, KeyItem>;
  generated: string;
}

export interface MapIndexEntry {
  id: string;
  name: string;
  normalizedName: string;
  description: string | null;
  players: string | null;
  raidDuration: number | null;
  bosses: string[];
  styles: ("clean" | "satellite")[];
  preview: string | null;
  counts: {
    spawns: number;
    bosses: number;
    extracts: number;
    transits: number;
    keys: number;
    quests: number;
    /** Battle-pass document spawns. Absent on payloads built before the layer. */
    docs?: number;
  };
}

export interface MapIndex {
  generated: string;
  gameMode: string;
  maps: MapIndexEntry[];
}
