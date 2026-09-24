/**
 * The layer taxonomy the whole UI is built around.
 *
 * Two visual channels carry meaning, and they never mix:
 *   colour -> who it belongs to (PMC / Scav / boss / shared / quest / ...)
 *   shape  -> what it is        (spawn / exit / transit / key / objective)
 *
 * Every layer also carries a plain-English `hint`. Those show up in the layer
 * panel and the legend, so a new player can learn the map's vocabulary without
 * leaving the site.
 */
import type { QuestKind } from "../types";

export type LayerId =
  | "pmc-spawns"
  | "scav-spawns"
  | "pmc-bot-spawns"
  | "boss-spawns"
  | "sniper-spawns"
  | "pmc-extracts"
  | "scav-extracts"
  | "shared-extracts"
  | "transits"
  | "quests"
  | "documents"
  | "keys"
  | "switches"
  | "hazards";

export type LayerGroupId = "spawns" | "exits" | "tasks" | "world";

export interface LayerGroupDef {
  id: LayerGroupId;
  label: string;
  hint: string;
}

export interface LayerDef {
  id: LayerId;
  group: LayerGroupId;
  label: string;
  /** One sentence a first-time player can act on. */
  hint: string;
  color: string;
  shape: MarkerShape;
  /**
   * On by default: exactly the Questing quick view. A map nobody has opened
   * before is about the raid you are running, not every spawn on it.
   */
  defaultOn: boolean;
}

export type MarkerShape =
  | "dot"
  | "skull"
  | "crosshair"
  | "exit"
  | "transit"
  | "key"
  | "quest"
  | "beacon"
  | "stash"
  | "target"
  | "runner"
  | "switch"
  | "document"
  | "hazard";

/**
 * What each kind of task objective looks like on the map.
 *
 * Quest green already says "this is a task"; the glyph says what the task
 * actually wants from you, so a screen full of objectives can be read at a
 * glance instead of clicking each pin. Item pickups keep the plain diamond —
 * it is the marker people already associate with a quest item.
 */
export const QUEST_KIND_META: Record<QuestKind, { shape: MarkerShape; label: string; hint: string }> = {
  mark: { shape: "beacon", label: "Place a marker", hint: "Plant a marker or jammer at this spot." },
  place: { shape: "stash", label: "Stash an item", hint: "Leave or plant the item at this spot." },
  shoot: { shape: "target", label: "Eliminate targets", hint: "Kills for this task count in this area." },
  visit: { shape: "runner", label: "Go here", hint: "Reaching this spot is the objective." },
  extract: { shape: "runner", label: "Extract here", hint: "Leave the raid from this exit." },
  pickup: { shape: "quest", label: "Find an item", hint: "A quest item can be picked up here." },
  objective: { shape: "quest", label: "Objective", hint: "A task objective anchored to this spot." },
};

export const LAYER_GROUPS: LayerGroupDef[] = [
  { id: "spawns", label: "Spawns", hint: "Where players and AI start the raid." },
  { id: "exits", label: "Extracts & transits", hint: "How you get out alive, or move to another map." },
  { id: "tasks", label: "Tasks & keys", hint: "Quest objectives and the doors worth unlocking." },
  { id: "world", label: "World", hint: "Switches, hazards and other map machinery." },
];

export const LAYERS: LayerDef[] = [
  {
    id: "pmc-spawns",
    group: "spawns",
    label: "PMC spawns",
    hint: "Where you and the other PMCs can start. Expect early fights near clusters of these.",
    color: "#4c8dff",
    shape: "dot",
    defaultOn: false,
  },
  {
    id: "scav-spawns",
    group: "spawns",
    label: "Scav spawns",
    hint: "Player-Scav starts and AI Scav spawn points. They refill during the raid.",
    color: "#fb923c",
    shape: "dot",
    defaultOn: false,
  },
  {
    id: "pmc-bot-spawns",
    group: "spawns",
    label: "AI PMCs",
    hint: "Where PMC bots — Raiders, Rogues and roaming AI PMCs — enter the map. They fight like players.",
    color: "#818cf8",
    shape: "dot",
    defaultOn: false,
  },
  {
    id: "boss-spawns",
    group: "spawns",
    label: "Boss spawns",
    hint: "Known boss spawn positions, with the chance the boss shows up at all.",
    color: "#ef4444",
    shape: "skull",
    defaultOn: false,
  },
  {
    id: "sniper-spawns",
    group: "spawns",
    label: "Sniper Scavs",
    hint: "Rooftop and tower marksmen. They shoot on sight at long range — avoid the sightline.",
    color: "#ec4899",
    shape: "crosshair",
    defaultOn: false,
  },
  {
    id: "pmc-extracts",
    group: "exits",
    label: "PMC extracts",
    hint: "Exits usable when you play as your PMC. Some need an item, a switch or a co-op partner.",
    color: "#4c8dff",
    shape: "exit",
    defaultOn: true,
  },
  {
    id: "scav-extracts",
    group: "exits",
    label: "Scav extracts",
    hint: "Exits only available on a Scav run.",
    color: "#fb923c",
    shape: "exit",
    defaultOn: false,
  },
  {
    id: "shared-extracts",
    group: "exits",
    label: "Shared extracts",
    hint: "Usable by both PMCs and Scavs.",
    color: "#22d3ee",
    shape: "exit",
    defaultOn: true,
  },
  {
    id: "transits",
    group: "exits",
    label: "Transits",
    hint: "Move straight into another map, keeping your gear and raid timer.",
    color: "#a855f7",
    shape: "transit",
    defaultOn: true,
  },
  {
    id: "quests",
    group: "tasks",
    label: "Quest objectives",
    hint: "Your tasks on this map — the ones you ticked active, or everything you could pick up if you haven't ticked any.",
    color: "#22c55e",
    shape: "quest",
    // On by default now that the layer draws *your* tasks rather than all 150+
    // objectives on the map. That was the only reason it started off, and the
    // whole point of the tracker is that the right pins are already there.
    defaultOn: true,
  },
  {
    id: "documents",
    group: "tasks",
    label: "Battle pass documents",
    hint: "Kord Breach document spawns. Pins mark the building the wiki names, not an exact shelf — open one for the description and a screenshot.",
    color: "#e879f9",
    shape: "document",
    defaultOn: false,
  },
  {
    id: "keys",
    group: "tasks",
    label: "Locked doors & keys",
    hint: "Doors, containers and gates that need a key, and which key opens them.",
    color: "#facc15",
    shape: "key",
    defaultOn: true,
  },
  {
    id: "switches",
    group: "world",
    label: "Switches",
    hint: "Levers and power boxes. Several extracts stay closed until one is flipped.",
    color: "#7dd3fc",
    shape: "switch",
    defaultOn: false,
  },
  {
    id: "hazards",
    group: "world",
    label: "Hazards",
    hint: "Minefields, sniper zones and other areas that will kill you for entering.",
    color: "#fb7185",
    shape: "hazard",
    defaultOn: false,
  },
];

export const LAYER_BY_ID: Record<LayerId, LayerDef> = Object.fromEntries(
  LAYERS.map((l) => [l.id, l]),
) as Record<LayerId, LayerDef>;

export const DEFAULT_LAYER_STATE: Record<LayerId, boolean> = Object.fromEntries(
  LAYERS.map((l) => [l.id, l.defaultOn]),
) as Record<LayerId, boolean>;

/** Presets give a new player a sane starting point in one click. */
export interface Preset {
  id: string;
  label: string;
  hint: string;
  layers: LayerId[];
}

export const PRESETS: Preset[] = [
  {
    id: "learn",
    label: "Learning the map",
    hint: "Where you spawn and where you can leave — the two things to learn first.",
    layers: ["pmc-spawns", "pmc-extracts", "shared-extracts", "transits"],
  },
  {
    id: "quests",
    label: "Questing",
    hint: "Task objectives plus the extracts and keys you need to finish them.",
    layers: ["quests", "keys", "pmc-extracts", "shared-extracts", "transits"],
  },
  {
    id: "kord",
    label: "Battle pass hunt",
    hint: "Document spawns and extracts — the Kord Breach pass is a document grind.",
    layers: ["documents", "pmc-extracts", "shared-extracts", "transits"],
  },
  {
    id: "scav",
    label: "Scav run",
    hint: "Scav spawns and the exits a Scav is allowed to use.",
    layers: ["scav-spawns", "scav-extracts", "shared-extracts", "transits"],
  },
  {
    id: "danger",
    label: "Threats",
    hint: "Bosses, sniper Scavs and hazard zones — everything that can end the raid.",
    layers: ["boss-spawns", "sniper-spawns", "pmc-bot-spawns", "hazards", "scav-spawns"],
  },
  {
    id: "everything",
    label: "Everything",
    hint: "All layers on. Dense, but complete.",
    layers: LAYERS.map((l) => l.id),
  },
];

/** The quick view a map opens on until the player picks another one for it. */
export const DEFAULT_PRESET = "quests";

function isLayerId(id: string): id is LayerId {
  return id in LAYER_BY_ID;
}

/**
 * A stored layer record read back into one that covers every layer.
 *
 * Unknown ids are dropped and a layer added since the save was written falls
 * back to its default, so a new layer appears the way it ships rather than
 * silently off — or on — forever.
 */
export function mergeLayerState(raw: unknown): Record<LayerId, boolean> {
  const out = { ...DEFAULT_LAYER_STATE };
  if (!raw || typeof raw !== "object") return out;
  for (const [id, on] of Object.entries(raw as Record<string, unknown>)) {
    if (isLayerId(id) && typeof on === "boolean") out[id] = on;
  }
  return out;
}

/** Per-map layer memory, cleaned the same way. Map slugs are kept as given. */
export function mergeMapLayers(raw: unknown): Record<string, Record<LayerId, boolean>> {
  const out: Record<string, Record<LayerId, boolean>> = {};
  if (!raw || typeof raw !== "object") return out;
  for (const [map, state] of Object.entries(raw as Record<string, unknown>)) {
    if (map && state && typeof state === "object") out[map] = mergeLayerState(state);
  }
  return out;
}

/** What a map shows when it opens: its own last view, or the calm default. */
export function layersForMap(
  mapLayers: Record<string, Record<LayerId, boolean>>,
  map: string,
): Record<LayerId, boolean> {
  return mapLayers[map] ? { ...mapLayers[map] } : { ...DEFAULT_LAYER_STATE };
}
