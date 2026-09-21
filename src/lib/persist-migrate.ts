import type { TaskStatus } from "../types";

/**
 * The persisted-state migrations, kept out of the store so they can be tested.
 *
 * These are pure functions over plain objects, but `store.ts` sits behind
 * `createJSONStorage(() => localStorage)` — a browser global that does not exist
 * under Node. Testing them in place would mean stubbing a browser API to
 * exercise logic that never touches it, so they live here instead.
 *
 * Keep this file free of value imports. The tests run through
 * `node --experimental-strip-types`, which resolves imports literally, so a
 * `import { X } from "./layers"` here fails with ERR_MODULE_NOT_FOUND. Types
 * are erased and cost nothing.
 *
 * The rule every version of this has to clear: **a migration may never drop a
 * task.** Each stored shape holds real hours of somebody's raid progress, and
 * losing it is not recoverable from anywhere.
 */

export type GameMode = "pvp" | "pve" | "season";
export type Faction = "Any" | "USEC" | "BEAR";
export type GameEdition =
  | "standard"
  | "leftBehind"
  | "prepareToEscape"
  | "edgeOfDarkness"
  | "unheard";

export interface Profile {
  mode: GameMode;
  faction: Faction;
  level: number;
  /**
   * Loyalty level per trader, by trader name. A trader absent from this record
   * means "not told", and an untold trader never gates anything — leaving it
   * blank must never make somebody's task list worse than not having the
   * feature at all.
   */
  traderLevels: Record<string, number>;
  /**
   * The task the planner aims at — usually Collector. Null means no target,
   * and the plan is "everything currently doable" rather than a Kappa path.
   */
  targetTaskId: string | null;
  gameEdition: GameEdition;
}

export type HideoutStatus = "active" | "completed" | "ignored";

/**
 * Ending target, checklist ticks and lock choices for the story page.
 *
 * Kept as a plain nested object so a save from before the page existed is
 * filled in by `mergeProgress` rather than crashing on `progress.story.ticks`.
 * Ending ids are not validated here — `story.ts` is the one that knows them,
 * and this file stays free of that import.
 */
export interface ModeStory {
  target: string | null;
  ticks: Record<string, true>;
  choices: Record<string, string>;
}

export interface ModeProgress {
  taskStatus: Record<string, TaskStatus>;
  markerDone: Record<string, true>;
  /** Global stash: itemId -> how many you have. Remaining on a task is need − have. */
  itemCounts: Record<string, number>;
  /** Keys marked found. */
  keysOwned: Record<string, true>;
  /** Hideout station-level id -> status. Absent means not started. */
  hideout: Record<string, HideoutStatus>;
  story: ModeStory;
}

export const GAME_MODES: GameMode[] = ["pvp", "pve", "season"];

export const GAME_EDITIONS: GameEdition[] = [
  "standard",
  "leftBehind",
  "prepareToEscape",
  "edgeOfDarkness",
  "unheard",
];

export const DEFAULT_PROFILE: Profile = {
  mode: "pvp",
  faction: "Any",
  level: 15,
  traderLevels: {},
  targetTaskId: null,
  gameEdition: "unheard",
};

export const emptyStory = (): ModeStory => ({
  target: null,
  ticks: {},
  choices: {},
});

export const emptyMode = (): ModeProgress => ({
  taskStatus: {},
  markerDone: {},
  itemCounts: {},
  keysOwned: {},
  hideout: {},
  story: emptyStory(),
});

export const emptyProgress = (): Record<GameMode, ModeProgress> => ({
  pvp: emptyMode(),
  pve: emptyMode(),
  season: emptyMode(),
});

const isStatus = (v: unknown): v is TaskStatus => v === "active" || v === "completed";

/**
 * v1 -> v2 -> v3 -> v4 -> v5.
 *
 * - v1 kept a single `completed: Record<string, true>` flag per task.
 * - v2 added a `profile` and a "failed" status, both belonging to an
 *   availability inference that was later removed. A "failed" task becomes
 *   "not started": the remaining model has nowhere to put it, and calling it
 *   done would be a lie about their progress.
 * - v4 splits progress by game mode, because PvP and PvE are separate
 *   progressions in game and a flat record cannot hold both. Everything stored
 *   until now was PvP, so it all moves there intact.
 * - v5 drops the stored TarkovTracker token. The site no longer talks to them,
 *   so the field is gone from the store — but a field simply removed from the
 *   type would sit in localStorage forever, and it is a credential. Deleting it
 *   on migrate is the difference between "unused" and "actually gone".
 * - v6 adds a `season` progress slice. Kord Breach (and every season after it)
 *   is a third character: copying PvP Zone ticks into it would be inventing a
 *   wipe they have not played. The slice starts empty; `mergeProgress` is what
 *   actually creates it for older saves.
 * - v7 adds item counts, owned keys, hideout status, a target task and game
 *   edition. `mergeProgress` / `mergeProfile` fill those; this function does
 *   not rewrite `taskStatus`, so every previously stored task survives.
 * - v8 adds `story` on each mode (ending target, checklist ticks, lock
 *   choices). `mergeProgress` fills it; nothing in `taskStatus` is rewritten.
 */
export function migrate(persisted: unknown, version: number): Record<string, unknown> {
  const state = (persisted ?? {}) as Record<string, unknown>;

  if (version < 2) {
    const completed = (state.completed ?? {}) as Record<string, true>;
    state.taskStatus = Object.fromEntries(Object.keys(completed).map((id) => [id, "completed"]));
    state.markerDone = {};
  }
  delete state.completed;

  /*
   * v2's profile is dropped rather than reused: it carried a faction and level
   * for the old inference and has no `mode`, so the v4 default is a better
   * starting point than a half-populated record.
   *
   * Scoped to the versions that predate the current profile. This delete used
   * to run unconditionally, which would silently wipe the slice on every future
   * migration — the single easiest way to ship a profile that never persists.
   */
  if (version < 4) delete state.profile;

  if (version < 4) {
    const status = (state.taskStatus ?? {}) as Record<string, unknown>;
    const markers = (state.markerDone ?? {}) as Record<string, unknown>;
    const progress = emptyProgress();
    progress.pvp.taskStatus = Object.fromEntries(
      Object.entries(status).filter(([, v]) => isStatus(v)),
    ) as Record<string, TaskStatus>;
    progress.pvp.markerDone = Object.fromEntries(
      Object.keys(markers).map((id) => [id, true as const]),
    );
    state.progress = progress;
    delete state.taskStatus;
    delete state.markerDone;
  }

  // Progress is never touched here: this only removes a credential the site has
  // no further use for.
  if (version < 5) delete state.trackerToken;

  // v6 does not rewrite `progress`. A save that predates the season slice is
  // missing the key; `mergeProgress` fills it with empty records so a later
  // migration cannot accidentally clone PvP ticks into a wipe that never ran.
  //
  // v7 is the same idea for itemCounts / keysOwned / hideout / targetTaskId /
  // gameEdition — named in merge, not copied from another slice.
  //
  // v8 is the same for `story`.

  return state;
}

/**
 * Fills in anything a stored state predates.
 *
 * Zustand's merge is shallow, so a nested object saved before a field existed
 * comes back missing it rather than defaulted. Every nested slice needs naming
 * here — one added to the store but forgotten here is `undefined` at runtime for
 * anyone with an older save.
 */
export function mergeProgress(
  stored: { progress?: Partial<Record<GameMode, Partial<ModeProgress>>> } | undefined,
): Record<GameMode, ModeProgress> {
  const base = emptyProgress();
  const p = stored?.progress;
  if (!p) return base;
  for (const mode of GAME_MODES) {
    const slice = p[mode];
    base[mode] = {
      taskStatus: slice?.taskStatus ?? {},
      markerDone: slice?.markerDone ?? {},
      itemCounts: slice?.itemCounts ?? {},
      keysOwned: slice?.keysOwned ?? {},
      hideout: slice?.hideout ?? {},
      story: mergeStorySlice(slice?.story),
    };
  }
  return base;
}

function mergeStorySlice(raw: unknown): ModeStory {
  const base = emptyStory();
  if (!raw || typeof raw !== "object") return base;
  const row = raw as Partial<ModeStory>;
  const ticks: Record<string, true> = {};
  if (row.ticks && typeof row.ticks === "object") {
    for (const id of Object.keys(row.ticks)) if (row.ticks[id]) ticks[id] = true;
  }
  const choices: Record<string, string> = {};
  if (row.choices && typeof row.choices === "object") {
    for (const [k, v] of Object.entries(row.choices)) {
      if (typeof v === "string" && v) choices[k] = v;
    }
  }
  return {
    target: typeof row.target === "string" && row.target ? row.target : null,
    ticks,
    choices,
  };
}

const isMode = (v: unknown): v is GameMode =>
  v === "pvp" || v === "pve" || v === "season";

const isEdition = (v: unknown): v is GameEdition =>
  v === "standard" ||
  v === "leftBehind" ||
  v === "prepareToEscape" ||
  v === "edgeOfDarkness" ||
  v === "unheard";

const isFaction = (v: unknown): v is Faction => v === "Any" || v === "USEC" || v === "BEAR";

export function mergeProfile(stored: Partial<Profile> | undefined): Profile {
  const raw = stored ?? {};
  const level =
    typeof raw.level === "number" && Number.isFinite(raw.level)
      ? Math.min(79, Math.max(1, Math.round(raw.level)))
      : DEFAULT_PROFILE.level;
  return {
    ...DEFAULT_PROFILE,
    ...raw,
    // A junk or pre-season value must not become the selected mode — the
    // progress lookup indexes by it.
    mode: isMode(raw.mode) ? raw.mode : DEFAULT_PROFILE.mode,
    faction: isFaction(raw.faction) ? raw.faction : DEFAULT_PROFILE.faction,
    level,
    // Named explicitly, per the rule above: a nested object present in the
    // stored state but null, or absent from a save that predates it, must come
    // back as an object rather than undefined — every read site indexes it.
    traderLevels: raw.traderLevels ?? {},
    targetTaskId: typeof raw.targetTaskId === "string" ? raw.targetTaskId : null,
    gameEdition: isEdition(raw.gameEdition) ? raw.gameEdition : DEFAULT_PROFILE.gameEdition,
  };
}
