import type { TaskStatus } from "../types";
import type { GameMode, ModeProgress, Profile } from "./persist-migrate";

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
export const SAVE_VERSION = 1;

export interface SaveFile {
  kind: typeof SAVE_KIND;
  version: number;
  exported: string;
  profile: Profile;
  progress: Record<GameMode, ModeProgress>;
}

export class SaveFileError extends Error {}

export function buildSave(
  profile: Profile,
  progress: Record<GameMode, ModeProgress>,
): SaveFile {
  return {
    kind: SAVE_KIND,
    version: SAVE_VERSION,
    exported: new Date().toISOString(),
    profile,
    progress,
  };
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
    if (value === "active" || value === "completed" || value === "failed") out[id] = value;
  }
  return out;
};

const markers = (raw: unknown): Record<string, true> => {
  const out: Record<string, true> = {};
  if (!isRecord(raw)) return out;
  for (const id of Object.keys(raw)) if (raw[id]) out[id] = true;
  return out;
};

export interface ParsedSave {
  profile: Partial<Profile> | null;
  progress: Record<GameMode, ModeProgress>;
  counts: Record<GameMode, { tasks: number; markers: number }>;
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
  const slice = (key: GameMode) => ({
    taskStatus: statuses(isRecord(progressRaw[key]) ? progressRaw[key].taskStatus : null),
    markerDone: markers(isRecord(progressRaw[key]) ? progressRaw[key].markerDone : null),
  });
  const progress = {
    pvp: slice("pvp"),
    pve: slice("pve"),
    season: slice("season"),
  };

  const empty = (["pvp", "pve", "season"] as const).every(
    (mode) =>
      !Object.keys(progress[mode].taskStatus).length &&
      !Object.keys(progress[mode].markerDone).length,
  );
  if (empty) throw new SaveFileError("That save has no progress in it.");

  return {
    profile: isRecord(raw.profile) ? (raw.profile as Partial<Profile>) : null,
    progress,
    counts: {
      pvp: {
        tasks: Object.keys(progress.pvp.taskStatus).length,
        markers: Object.keys(progress.pvp.markerDone).length,
      },
      pve: {
        tasks: Object.keys(progress.pve.taskStatus).length,
        markers: Object.keys(progress.pve.markerDone).length,
      },
      season: {
        tasks: Object.keys(progress.season.taskStatus).length,
        markers: Object.keys(progress.season.markerDone).length,
      },
    },
  };
}
