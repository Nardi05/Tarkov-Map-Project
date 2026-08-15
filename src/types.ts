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
 * Both states are declared by hand — the site never infers one. "active" means
 * the task is in your in-game list right now, which is what the map draws.
 */
export type TaskStatus = "active" | "completed";

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
  };
}

export interface MapIndex {
  generated: string;
  gameMode: string;
  maps: MapIndexEntry[];
}
