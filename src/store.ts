import { create } from "zustand";
import { persist, createJSONStorage } from "zustand/middleware";
import { DEFAULT_LAYER_STATE, LAYERS, PRESETS, type LayerId } from "./lib/layers";
import {
  emptyProgress,
  mergeProfile,
  mergeProgress,
  migrate,
  type GameMode,
  type ModeProgress,
  type Profile,
} from "./lib/persist-migrate";
import type { TaskStatus } from "./types";

export type { GameMode, Profile } from "./lib/persist-migrate";

export type MapStyle = "clean" | "satellite";

export type Theme = "dark" | "light" | "system";

interface Settings {
  theme: Theme;
  style: MapStyle;
  markerScale: number;
  /** Draw the real footprint of extracts/quest zones, not just a pin. */
  showZones: boolean;
  /** Name labels next to extract, transit and boss markers. */
  showMarkerLabels: boolean;
  /** Task names on quest markers. Off by default — busy maps have 150+. */
  showQuestLabels: boolean;
  /** Street/area names baked into the map artwork. */
  showPlaceLabels: boolean;
  /** Dim finished quest markers instead of hiding them. */
  dimCompleted: boolean;
}

interface QuestFilters {
  search: string;
  trader: string | null;
  kappaOnly: boolean;
  /**
   * Off (the default) means the map draws only the tasks you ticked active —
   * the whole point of the panel. On is for browsing a map you haven't started.
   */
  showAll: boolean;
  /** When set, only this task's markers render. */
  focusTask: string | null;
}

/** A layer combination the player saved themselves, alongside the built-ins. */
export interface CustomView {
  id: string;
  label: string;
  layers: LayerId[];
}

interface Store {
  layers: Record<LayerId, boolean>;
  /** The player's own quick views. Built-in PRESETS are not stored. */
  customViews: CustomView[];
  settings: Settings;
  quest: QuestFilters;
  /** Who the player is playing as. Drives availability on the quest tracker. */
  profile: Profile;
  /**
   * The player's task progress, kept per game mode — PvP and PvE are separate
   * progressions in game, and one record cannot hold both.
   *
   * Within a mode, an absent key means "not started": the site never writes a
   * status it wasn't told, so this stays a record of what the player said.
   * Read it through `useTaskStatus()` / `useMarkerDone()` rather than reaching
   * into the mode by hand.
   */
  progress: Record<GameMode, ModeProgress>;
  /** Last map opened, so the header can offer "continue where you left off". */
  lastMap: string | null;

  setLayer: (id: LayerId, on: boolean) => void;
  toggleLayer: (id: LayerId) => void;
  setGroupLayers: (ids: LayerId[], on: boolean) => void;
  applyPreset: (presetId: string) => void;
  resetLayers: () => void;
  /** Saves whatever is currently switched on as a named quick view. */
  saveCustomView: (label: string) => void;
  removeCustomView: (id: string) => void;

  setProfile: <K extends keyof Profile>(key: K, value: Profile[K]) => void;

  setSetting: <K extends keyof Settings>(key: K, value: Settings[K]) => void;
  setQuestFilter: <K extends keyof QuestFilters>(key: K, value: QuestFilters[K]) => void;
  clearQuestFilters: () => void;

  setTaskStatus: (taskId: string, status: TaskStatus | null) => void;
  /** Steps a task through not started -> active -> done -> not started. */
  cycleTaskStatus: (taskId: string) => void;
  toggleMarkerDone: (markerId: string) => void;
  setMarkersDone: (markerIds: string[], done: boolean) => void;
  /** Wipes the current mode only — the other mode's progress is untouched. */
  clearProgress: () => void;

  setLastMap: (map: string) => void;
}

const DEFAULT_SETTINGS: Settings = {
  theme: "dark",
  style: "clean",
  markerScale: 1,
  showZones: true,
  showMarkerLabels: true,
  showQuestLabels: false,
  showPlaceLabels: true,
  dimCompleted: true,
};

const DEFAULT_QUEST: QuestFilters = {
  search: "",
  trader: null,
  kappaOnly: false,
  showAll: false,
  focusTask: null,
};

/**
 * Applies an edit to the progress slice of whichever mode is selected.
 *
 * Every progress mutator goes through here so none of them can forget the mode
 * and write to a fixed one — the bug that would silently merge a player's PvE
 * run into their PvP progress.
 */
function editMode(
  s: Store,
  edit: (p: ModeProgress) => ModeProgress,
): { progress: Record<GameMode, ModeProgress> } {
  const mode = s.profile.mode;
  return { progress: { ...s.progress, [mode]: edit(s.progress[mode]) } };
}

export const useStore = create<Store>()(
  persist(
    (set) => ({
      layers: { ...DEFAULT_LAYER_STATE },
      customViews: [],
      settings: { ...DEFAULT_SETTINGS },
      quest: { ...DEFAULT_QUEST },
      profile: mergeProfile(undefined),
      progress: emptyProgress(),
      lastMap: null,

      setLayer: (id, on) => set((s) => ({ layers: { ...s.layers, [id]: on } })),
      toggleLayer: (id) => set((s) => ({ layers: { ...s.layers, [id]: !s.layers[id] } })),
      setGroupLayers: (ids, on) =>
        set((s) => ({
          layers: { ...s.layers, ...Object.fromEntries(ids.map((id) => [id, on])) },
        })),
      applyPreset: (presetId) =>
        set((s) => {
          const chosen =
            PRESETS.find((p) => p.id === presetId) ?? s.customViews.find((v) => v.id === presetId);
          if (!chosen) return {};
          const next = Object.fromEntries(
            LAYERS.map((l) => [l.id, chosen.layers.includes(l.id)]),
          ) as Record<LayerId, boolean>;
          return { layers: next };
        }),
      resetLayers: () => set({ layers: { ...DEFAULT_LAYER_STATE } }),

      saveCustomView: (label) =>
        set((s) => {
          const name = label.trim().slice(0, 32);
          if (!name) return {};
          const on = LAYERS.filter((l) => s.layers[l.id]).map((l) => l.id);
          // Saving under an existing name overwrites it, which is what someone
          // adjusting a view and re-saving expects.
          const existing = s.customViews.find((v) => v.label.toLowerCase() === name.toLowerCase());
          if (existing) {
            return {
              customViews: s.customViews.map((v) =>
                v.id === existing.id ? { ...v, layers: on } : v,
              ),
            };
          }
          const id = `custom-${Date.now().toString(36)}`;
          return { customViews: [...s.customViews, { id, label: name, layers: on }] };
        }),

      removeCustomView: (id) =>
        set((s) => ({ customViews: s.customViews.filter((v) => v.id !== id) })),

      setProfile: (key, value) => set((s) => ({ profile: { ...s.profile, [key]: value } })),

      setSetting: (key, value) => set((s) => ({ settings: { ...s.settings, [key]: value } })),
      setQuestFilter: (key, value) => set((s) => ({ quest: { ...s.quest, [key]: value } })),
      // "Show everything" is a view mode, not a filter — clearing the search
      // and trader chips shouldn't yank the map back to selected-only.
      clearQuestFilters: () => set((s) => ({ quest: { ...DEFAULT_QUEST, showAll: s.quest.showAll } })),

      setTaskStatus: (taskId, status) =>
        set((s) =>
          editMode(s, (p) => {
            const taskStatus = { ...p.taskStatus };
            if (status) taskStatus[taskId] = status;
            else delete taskStatus[taskId];
            return { ...p, taskStatus };
          }),
        ),

      cycleTaskStatus: (taskId) =>
        set((s) =>
          editMode(s, (p) => {
            const taskStatus = { ...p.taskStatus };
            const current = taskStatus[taskId];
            if (!current) taskStatus[taskId] = "active";
            else if (current === "active") taskStatus[taskId] = "completed";
            else delete taskStatus[taskId];
            return { ...p, taskStatus };
          }),
        ),

      toggleMarkerDone: (markerId) =>
        set((s) =>
          editMode(s, (p) => {
            const markerDone = { ...p.markerDone };
            if (markerDone[markerId]) delete markerDone[markerId];
            else markerDone[markerId] = true;
            return { ...p, markerDone };
          }),
        ),

      setMarkersDone: (markerIds, done) =>
        set((s) =>
          editMode(s, (p) => {
            const markerDone = { ...p.markerDone };
            for (const id of markerIds) {
              if (done) markerDone[id] = true;
              else delete markerDone[id];
            }
            return { ...p, markerDone };
          }),
        ),

      clearProgress: () => set((s) => editMode(s, () => ({ taskStatus: {}, markerDone: {} }))),

      setLastMap: (map) => set({ lastMap: map }),
    }),
    {
      name: "tarkov-maps",
      version: 4,
      storage: createJSONStorage(() => localStorage),
      // An allowlist: a slice added to the store and forgotten here simply
      // never persists. Search, trader and Kappa narrowing are momentary and
      // reset on reload; show-all is a view preference, so it sticks like the
      // layer toggles do.
      partialize: ({ layers, customViews, settings, quest, profile, progress, lastMap }) => ({
        layers,
        customViews,
        settings,
        quest: { showAll: quest.showAll },
        profile,
        progress,
        lastMap,
      }),
      // Lives in ./lib/persist-migrate so it can be tested without stubbing
      // localStorage. See the rule at the top of that file: a migration may
      // never drop a task.
      migrate,
      merge: (persisted, current) => {
        const p = (persisted ?? {}) as Partial<Store>;
        return {
          ...current,
          ...p,
          // Zustand's merge is shallow, so every nested slice needs a line
          // here — one omitted comes back missing whatever shipped after the
          // user's last visit, or `undefined` outright.
          layers: { ...DEFAULT_LAYER_STATE, ...(p.layers ?? {}) },
          customViews: p.customViews ?? [],
          settings: { ...DEFAULT_SETTINGS, ...(p.settings ?? {}) },
          profile: mergeProfile(p.profile),
          progress: mergeProgress(p),
          quest: { ...DEFAULT_QUEST, showAll: p.quest?.showAll ?? DEFAULT_QUEST.showAll },
        };
      },
    },
  ),
);

/*
 * Progress is stored per mode, but nothing outside this file wants to think
 * about that: every consumer asks "what has the player done?" and means the
 * mode they are currently playing. These return the flat record for that mode,
 * so switching modes swaps the whole map and both panels with no other change.
 *
 * Both are stable object references — `progress[mode]` is only rewritten when
 * something in it actually changes — so they are safe to depend on in a memo.
 */
export function useTaskStatus(): Record<string, TaskStatus> {
  return useStore((s) => s.progress[s.profile.mode].taskStatus);
}

export function useMarkerDone(): Record<string, true> {
  return useStore((s) => s.progress[s.profile.mode].markerDone);
}
