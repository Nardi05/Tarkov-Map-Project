import { GAME_MODES, type ModeProgress } from "./persist-migrate.ts";

/** How a visitor chose to use the site. Null means they have not chosen yet. */
export type EntryPath = "maps" | "tracker";

/**
 * True when any mode holds real character data — quest ticks, stash, keys or
 * hideout. Theme and last-opened-map do not count: opening a map is not a
 * character.
 */
export function hasCharacterData(progress: unknown): boolean {
  if (!progress || typeof progress !== "object") return false;
  const bag = progress as Record<string, Partial<ModeProgress> | undefined>;
  for (const mode of GAME_MODES) {
    const slice = bag[mode];
    if (!slice) continue;
    if (Object.keys(slice.taskStatus ?? {}).length) return true;
    if (Object.keys(slice.markerDone ?? {}).length) return true;
    if (Object.keys(slice.itemCounts ?? {}).length) return true;
    if (Object.keys(slice.keysOwned ?? {}).length) return true;
    if (Object.keys(slice.hideout ?? {}).length) return true;
    if (slice.story?.target) return true;
    if (Object.keys(slice.story?.ticks ?? {}).length) return true;
    if (Object.keys(slice.story?.choices ?? {}).length) return true;
  }
  return false;
}

export function parseEntry(value: unknown): EntryPath | null {
  return value === "maps" || value === "tracker" ? value : null;
}

/**
 * Where `#/` should go after storage has loaded.
 *
 * - `landing` — first visit, nothing stored
 * - `maps` — they asked for maps only
 * - `dashboard` — they set up a tracker, or we found saved progress
 */
export function homeFor(entry: EntryPath | null, progress: unknown): "landing" | "maps" | "dashboard" {
  if (hasCharacterData(progress) || entry === "tracker") return "dashboard";
  if (entry === "maps") return "maps";
  return "landing";
}
