import type { MapData, ProgressionTask, Task } from "../types";
import season from "../data/kord-season.json";
import type { GameMode } from "./persist-migrate";

export interface SeasonQuest {
  id: string;
  name: string;
  trader: string;
  maps: string[];
  wiki: string;
  requires: { task: string; status: string[] }[];
  /** When true, any one requirement set is enough (Desperate Assault). */
  requireAny?: boolean;
  acceptUnlocks?: boolean;
  traderLevel?: number;
  summary: string;
  spots?: string[];
}

export interface SeasonDocumentType {
  name: string;
  maps: string[];
}

export interface SeasonData {
  id: string;
  name: string;
  starts: string;
  ends: string;
  wiki: string;
  notes: string[];
  dailyDocumentLimit: Record<"season" | "pvp" | "pve", number>;
  documentTypes: SeasonDocumentType[];
  questline: SeasonQuest[];
}

export const KORD_SEASON: SeasonData = season as SeasonData;

export const KORD_TAG = "[KORD BREACH]";

/** Days left in the season, or 0 if it has ended. */
export function seasonDaysLeft(now = new Date()): number {
  const end = Date.parse(`${KORD_SEASON.ends}T23:59:59Z`);
  if (!Number.isFinite(end)) return 0;
  return Math.max(0, Math.ceil((end - now.getTime()) / 86_400_000));
}

/** 0 at the start of the season, 1 at the end. */
export function seasonElapsed(now = new Date()): number {
  const start = Date.parse(`${KORD_SEASON.starts}T00:00:00Z`);
  const end = Date.parse(`${KORD_SEASON.ends}T23:59:59Z`);
  if (!Number.isFinite(start) || !Number.isFinite(end) || end <= start) return 0;
  return Math.min(1, Math.max(0, (now.getTime() - start) / (end - start)));
}

export function dailyDocumentLimit(mode: GameMode): number {
  return KORD_SEASON.dailyDocumentLimit[mode] ?? KORD_SEASON.dailyDocumentLimit.pvp;
}

/** Tagged name so `visibleInMode` can hide these off a seasonal character. */
export function kordTaskName(quest: SeasonQuest): string {
  return `${quest.name} ${KORD_TAG}`;
}

/**
 * The story line as ProgressionTask records, ready to fold into the graph.
 *
 * Tarkov.dev does not ship these. They are seasonal-only and live in this
 * file so a data rebuild cannot drop them the way a missing feed field would.
 */
export function kordProgressionTasks(): Record<string, ProgressionTask> {
  const out: Record<string, ProgressionTask> = {};
  for (const quest of KORD_SEASON.questline) {
    const sets = quest.requireAny
      ? quest.requires.map((req) => [{ ...req, from: "wiki" as const }])
      : quest.requires.length
        ? [quest.requires.map((req) => ({ ...req, from: "wiki" as const }))]
        : [];
    out[quest.id] = {
      name: kordTaskName(quest),
      trader: quest.trader,
      minPlayerLevel: 0,
      factionName: null,
      kappaRequired: false,
      lightkeeperRequired: false,
      requires: sets,
      maps: quest.maps,
      traderGates:
        typeof quest.traderLevel === "number"
          ? [{ trader: quest.trader, kind: "level", value: quest.traderLevel }]
          : [],
      needs: [],
      keys: [],
      wiki: quest.wiki,
    };
  }
  return out;
}

export function kordQuestById(id: string): SeasonQuest | undefined {
  return KORD_SEASON.questline.find((q) => q.id === id);
}

export function kordQuestsOnMap(map: string): SeasonQuest[] {
  return KORD_SEASON.questline.filter((q) => q.maps.includes(map));
}

/** Map-payload Task shape, so the per-map panel can list a season quest. */
export function kordAsMapTask(quest: SeasonQuest): Task {
  return {
    id: quest.id,
    name: kordTaskName(quest),
    normalizedName: quest.id.replace(/^kord:/, ""),
    trader: { name: quest.trader, image: null },
    minPlayerLevel: 0,
    experience: 0,
    kappaRequired: false,
    lightkeeperRequired: false,
    factionName: null,
    wiki: quest.wiki,
    requires: quest.requires.map((r) => r.task),
    keys: [],
  };
}

export function documentTypesOnMap(map: string): SeasonDocumentType[] {
  return KORD_SEASON.documentTypes.filter((d) => d.maps.includes(map));
}

export function mapsForDocumentType(name: string): string[] {
  return KORD_SEASON.documentTypes.find((d) => d.name === name)?.maps ?? [];
}

/** Adds seasonal story tasks that belong on this map, so the panel can list them. */
export function withSeasonTasks(data: MapData, mode: GameMode): MapData {
  if (mode !== "season") return data;
  const extras = kordQuestsOnMap(data.normalizedName).filter((q) => !data.tasks[q.id]);
  if (!extras.length) return data;
  const tasks = { ...data.tasks };
  for (const quest of extras) tasks[quest.id] = kordAsMapTask(quest);
  return { ...data, tasks };
}

export function prettyMapName(slug: string): string {
  return slug
    .split("-")
    .map((w) => (w === "of" ? w : w.charAt(0).toUpperCase() + w.slice(1)))
    .join(" ");
}
