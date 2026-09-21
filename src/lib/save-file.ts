import type { TaskStatus } from "../types";
import type { GameMode, HideoutStatus, ModeProgress, ModeStory, Profile } from "./persist-migrate.ts";
import { emptyStory } from "./persist-migrate.ts";

/**
 * Reading and writing a progress save file.
 *
 * Progress lives in localStorage, which means it is tied to one browser on one
 * machine and a cleared cache takes the lot. Dropping the TarkovTracker sync
 * removed the only way to move a wipe from a PC to a phone, so this replaces
 * that — the useful half of what an account gave, without an account.
 *
 * Deliberately a plain, readable JSON document rather than an opaque blob. It
 * is somebody's own data and they should be able to look at it, diff it, or
 * repair it by hand. That also makes the format its own documentation when
 * something goes wrong a year from now.
 *
 * Kept free of value imports so it can be tested under `node --test`.
 */

export const SAVE_KIND = "tarkov-maps-progress";
export const SAVE_VERSION = 2;

/** Human-readable copy of a mode's quests, so a save file can be opened and read. */
export interface QuestLogEntry {
  id: string;
  name: string;
  trader: string | null;
  status: TaskStatus;
}

export interface SaveLog {
  pvp: QuestLogEntry[];
  pve: QuestLogEntry[];
  season: QuestLogEntry[];
}

export interface SaveFile {
  kind: typeof SAVE_KIND;
  version: number;
  exported: string;
  profile: Profile;
  progress: Record<GameMode, ModeProgress>;
  /** Names for the statuses in `progress`. Ignored on import — ids are the truth. */
  log?: SaveLog;
}

export class SaveFileError extends Error {}

export function buildSave(
  profile: Profile,
  progress: Record<GameMode, ModeProgress>,
  log?: SaveLog,
): SaveFile {
  return {
    kind: SAVE_KIND,
    version: SAVE_VERSION,
    exported: new Date().toISOString(),
    profile,
    progress,
    ...(log ? { log } : {}),
  };
}

export function buildQuestLog(
  tasks: Record<string, { name: string; trader: string | null }> | null | undefined,
  progress: Record<GameMode, ModeProgress>,
): SaveLog | undefined {
  if (!tasks) return undefined;
  const slice = (mode: GameMode): QuestLogEntry[] =>
    Object.entries(progress[mode].taskStatus)
      .map(([id, status]) => ({
        id,
        name: tasks[id]?.name ?? id,
        trader: tasks[id]?.trader ?? null,
        status,
      }))
      .sort((a, b) => a.name.localeCompare(b.name));
  return { pvp: slice("pvp"), pve: slice("pve"), season: slice("season") };
}

/** `tarkov-progress-pvp-2026-08-17.json` — sortable, and says which mode it holds. */
export function saveFileName(mode: GameMode, now = new Date()): string {
  return `tarkov-progress-${mode}-${now.toISOString().slice(0, 10)}.json`;
}

const isRecord = (v: unknown): v is Record<string, unknown> =>
  !!v && typeof v === "object" && !Array.isArray(v);

/** Statuses we still understand. Anything else is dropped rather than trusted. */
const statuses = (raw: unknown): Record<string, TaskStatus> => {
  const out: Record<string, TaskStatus> = {};
  if (!isRecord(raw)) return out;
  for (const [id, value] of Object.entries(raw)) {
    if (
      value === "active" ||
      value === "completed" ||
      value === "failed" ||
      value === "ignored" ||
      value === "pinned"
    ) {
      out[id] = value;
    }
  }
  return out;
};

const markers = (raw: unknown): Record<string, true> => {
  const out: Record<string, true> = {};
  if (!isRecord(raw)) return out;
  for (const id of Object.keys(raw)) if (raw[id]) out[id] = true;
  return out;
};

const counts = (raw: unknown): Record<string, number> => {
  const out: Record<string, number> = {};
  if (!isRecord(raw)) return out;
  for (const [id, value] of Object.entries(raw)) {
    if (typeof value === "number" && Number.isFinite(value) && value > 0) out[id] = Math.floor(value);
  }
  return out;
};

const tally = (slice: ModeProgress): ModeCounts => ({
  tasks: Object.keys(slice.taskStatus).length,
  markers: Object.keys(slice.markerDone).length,
  items: Object.keys(slice.itemCounts).length,
  keys: Object.keys(slice.keysOwned).length,
  hideout: Object.keys(slice.hideout).length,
  story: Object.keys(slice.story.ticks).length + Object.keys(slice.story.choices).length + (slice.story.target ? 1 : 0),
});

const hideout = (raw: unknown): Record<string, HideoutStatus> => {
  const out: Record<string, HideoutStatus> = {};
  if (!isRecord(raw)) return out;
  for (const [id, value] of Object.entries(raw)) {
    if (value === "active" || value === "completed" || value === "ignored") out[id] = value;
  }
  return out;
};

const story = (raw: unknown): ModeStory => {
  if (!isRecord(raw)) return emptyStory();
  const ticks = markers(raw.ticks);
  const choices: Record<string, string> = {};
  if (isRecord(raw.choices)) {
    for (const [k, v] of Object.entries(raw.choices)) {
      if (typeof v === "string" && v) choices[k] = v;
    }
  }
  return {
    target: typeof raw.target === "string" && raw.target ? raw.target : null,
    ticks,
    choices,
  };
};

export interface ModeCounts {
  tasks: number;
  markers: number;
  items: number;
  keys: number;
  hideout: number;
  story: number;
}

export interface ParsedSave {
  profile: Partial<Profile> | null;
  progress: Record<GameMode, ModeProgress>;
  counts: Record<GameMode, ModeCounts>;
}

/**
 * Parses a file someone picked, defensively.
 *
 * This is the one place the app takes a whole progress state from outside
 * itself, so every field is checked rather than trusted. A file that is not
 * ours fails with something a person can act on; a file that is ours but has
 * fields we no longer recognise loses those fields quietly rather than
 * refusing, because a partial restore beats none.
 */
export function parseSave(text: string): ParsedSave {
  let raw: unknown;
  try {
    raw = JSON.parse(text);
  } catch {
    throw new SaveFileError("That file is not valid JSON.");
  }
  if (!isRecord(raw)) throw new SaveFileError("That file does not contain a save.");
  if (raw.kind !== SAVE_KIND) {
    throw new SaveFileError("That is not a Tarkov Maps progress file.");
  }
  if (typeof raw.version === "number" && raw.version > SAVE_VERSION) {
    throw new SaveFileError(
      "That save was written by a newer version of the site. Update the page and try again.",
    );
  }

  const progressRaw = isRecord(raw.progress) ? raw.progress : {};
  const slice = (key: GameMode): ModeProgress => {
    const row = isRecord(progressRaw[key]) ? progressRaw[key] : {};
    return {
      taskStatus: statuses(row.taskStatus),
      markerDone: markers(row.markerDone),
      itemCounts: counts(row.itemCounts),
      keysOwned: markers(row.keysOwned),
      hideout: hideout(row.hideout),
      story: story(row.story),
    };
  };
  const progress = {
    pvp: slice("pvp"),
    pve: slice("pve"),
    season: slice("season"),
  };

  const empty = (["pvp", "pve", "season"] as const).every(
    (mode) =>
      !Object.keys(progress[mode].taskStatus).length &&
      !Object.keys(progress[mode].markerDone).length &&
      !Object.keys(progress[mode].itemCounts).length &&
      !Object.keys(progress[mode].keysOwned).length &&
      !Object.keys(progress[mode].hideout).length &&
      !progress[mode].story.target &&
      !Object.keys(progress[mode].story.ticks).length &&
      !Object.keys(progress[mode].story.choices).length,
  );
  if (empty) throw new SaveFileError("That save has no progress in it.");

  return {
    profile: isRecord(raw.profile) ? (raw.profile as Partial<Profile>) : null,
    progress,
    counts: {
      pvp: tally(progress.pvp),
      pve: tally(progress.pve),
      season: tally(progress.season),
    },
  };
}
