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

export type GameMode = "pvp" | "pve";
export type Faction = "Any" | "USEC" | "BEAR";

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
}

export interface ModeProgress {
  taskStatus: Record<string, TaskStatus>;
  markerDone: Record<string, true>;
}

export const GAME_MODES: GameMode[] = ["pvp", "pve"];

export const DEFAULT_PROFILE: Profile = {
  mode: "pvp",
  faction: "Any",
  level: 15,
  traderLevels: {},
};

export const emptyProgress = (): Record<GameMode, ModeProgress> => ({
  pvp: { taskStatus: {}, markerDone: {} },
  pve: { taskStatus: {}, markerDone: {} },
});

const isStatus = (v: unknown): v is TaskStatus => v === "active" || v === "completed";

/**
 * v1 -> v2 -> v3 -> v4.
 *
 * - v1 kept a single `completed: Record<string, true>` flag per task.
 * - v2 added a `profile` and a "failed" status, both belonging to an
 *   availability inference that was later removed. A "failed" task becomes
 *   "not started": the remaining model has nowhere to put it, and calling it
 *   done would be a lie about their progress.
 * - v4 splits progress by game mode, because PvP and PvE are separate
 *   progressions in game and a flat record cannot hold both. Everything stored
 *   until now was PvP, so it all moves there intact.
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
    base[mode] = {
      taskStatus: p[mode]?.taskStatus ?? {},
      markerDone: p[mode]?.markerDone ?? {},
    };
  }
  return base;
}

export function mergeProfile(stored: Partial<Profile> | undefined): Profile {
  return {
    ...DEFAULT_PROFILE,
    ...(stored ?? {}),
    // Named explicitly, per the rule above: a nested object present in the
    // stored state but null, or absent from a save that predates it, must come
    // back as an object rather than undefined — every read site indexes it.
    traderLevels: stored?.traderLevels ?? {},
  };
}
