import { create } from "zustand";
import { persist, createJSONStorage } from "zustand/middleware";
import { DEFAULT_LAYER_STATE, LAYERS, PRESETS, type LayerId } from "./lib/layers";
import type { TaskStatus } from "./types";

export type MapStyle = "clean" | "satellite";

export type Theme = "dark" | "light" | "system";

export type Faction = "Any" | "USEC" | "BEAR";

/** Which slice of the task list the map and panel show. */
export type QuestScope = "active" | "available" | "all";

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
  scope: QuestScope;
  /** When set, only this task's markers render. */
  focusTask: string | null;
}

/**
 * What the player tells us about themselves. Only used to decide which tasks
 * could plausibly be available — nothing else reads it.
 */
interface Profile {
  level: number;
  faction: Faction;
}

interface Store {
  layers: Record<LayerId, boolean>;
  settings: Settings;
  quest: QuestFilters;
  profile: Profile;
  /**
   * The player's task progress. Absent key means "not started"; the site never
   * writes a status it wasn't told, so this stays a record of what they said.
   */
  taskStatus: Record<string, TaskStatus>;
  /** Individual objective locations ticked off, keyed by quest marker id. */
  markerDone: Record<string, true>;
  /** Last map opened, so the header can offer "continue where you left off". */
  lastMap: string | null;

  setLayer: (id: LayerId, on: boolean) => void;
  toggleLayer: (id: LayerId) => void;
  setGroupLayers: (ids: LayerId[], on: boolean) => void;
  applyPreset: (presetId: string) => void;
  resetLayers: () => void;

  setSetting: <K extends keyof Settings>(key: K, value: Settings[K]) => void;
  setQuestFilter: <K extends keyof QuestFilters>(key: K, value: QuestFilters[K]) => void;
  clearQuestFilters: () => void;
  setProfile: (patch: Partial<Profile>) => void;

  setTaskStatus: (taskId: string, status: TaskStatus | null) => void;
  /** Steps a task through not started -> active -> done -> not started. */
  cycleTaskStatus: (taskId: string) => void;
  toggleMarkerDone: (markerId: string) => void;
  setMarkersDone: (markerIds: string[], done: boolean) => void;
  /** Backfill: record a batch of tasks as completed in one go. */
  markTasksCompleted: (taskIds: string[]) => void;
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
  scope: "active",
  focusTask: null,
};

const DEFAULT_PROFILE: Profile = { level: 15, faction: "Any" };

export const useStore = create<Store>()(
  persist(
    (set) => ({
      layers: { ...DEFAULT_LAYER_STATE },
      settings: { ...DEFAULT_SETTINGS },
      quest: { ...DEFAULT_QUEST },
      profile: { ...DEFAULT_PROFILE },
      taskStatus: {},
      markerDone: {},
      lastMap: null,

      setLayer: (id, on) => set((s) => ({ layers: { ...s.layers, [id]: on } })),
      toggleLayer: (id) => set((s) => ({ layers: { ...s.layers, [id]: !s.layers[id] } })),
      setGroupLayers: (ids, on) =>
        set((s) => ({
          layers: { ...s.layers, ...Object.fromEntries(ids.map((id) => [id, on])) },
        })),
      applyPreset: (presetId) => {
        const preset = PRESETS.find((p) => p.id === presetId);
        if (!preset) return;
        const next = Object.fromEntries(
          LAYERS.map((l) => [l.id, preset.layers.includes(l.id)]),
        ) as Record<LayerId, boolean>;
        set({ layers: next });
      },
      resetLayers: () => set({ layers: { ...DEFAULT_LAYER_STATE } }),

      setSetting: (key, value) => set((s) => ({ settings: { ...s.settings, [key]: value } })),
      setQuestFilter: (key, value) => set((s) => ({ quest: { ...s.quest, [key]: value } })),
      clearQuestFilters: () => set((s) => ({ quest: { ...DEFAULT_QUEST, scope: s.quest.scope } })),
      setProfile: (patch) => set((s) => ({ profile: { ...s.profile, ...patch } })),

      setTaskStatus: (taskId, status) =>
        set((s) => {
          const next = { ...s.taskStatus };
          if (status) next[taskId] = status;
          else delete next[taskId];
          return { taskStatus: next };
        }),

      cycleTaskStatus: (taskId) =>
        set((s) => {
          const next = { ...s.taskStatus };
          const current = next[taskId];
          if (!current) next[taskId] = "active";
          else if (current === "active") next[taskId] = "completed";
          else delete next[taskId];
          return { taskStatus: next };
        }),

      toggleMarkerDone: (markerId) =>
        set((s) => {
          const next = { ...s.markerDone };
          if (next[markerId]) delete next[markerId];
          else next[markerId] = true;
          return { markerDone: next };
        }),

      setMarkersDone: (markerIds, done) =>
        set((s) => {
          const next = { ...s.markerDone };
          for (const id of markerIds) {
            if (done) next[id] = true;
            else delete next[id];
          }
          return { markerDone: next };
        }),

      markTasksCompleted: (taskIds) =>
        set((s) => {
          const next = { ...s.taskStatus };
          for (const id of taskIds) next[id] = "completed";
          return { taskStatus: next };
        }),

      clearProgress: () => set({ taskStatus: {}, markerDone: {} }),

      setLastMap: (map) => set({ lastMap: map }),
    }),
    {
      name: "tarkov-maps",
      version: 2,
      storage: createJSONStorage(() => localStorage),
      // Quest filters are per-session; everything else is worth remembering.
      partialize: ({ layers, settings, profile, taskStatus, markerDone, lastMap }) => ({
        layers,
        settings,
        profile,
        taskStatus,
        markerDone,
        lastMap,
      }),
      /**
       * v1 stored a single `completed: Record<string, true>` flag per task.
       * Those are real hours of somebody's raid progress, so carry them over as
       * completed statuses rather than letting the rename wipe them.
       */
      migrate: (persisted, version) => {
        const state = (persisted ?? {}) as Record<string, unknown>;
        if (version >= 2) return state;
        const completed = (state.completed ?? {}) as Record<string, true>;
        return {
          ...state,
          taskStatus: Object.fromEntries(Object.keys(completed).map((id) => [id, "completed"])),
          markerDone: {},
          profile: { ...DEFAULT_PROFILE },
        };
      },
      merge: (persisted, current) => {
        const p = (persisted ?? {}) as Partial<Store>;
        return {
          ...current,
          ...p,
          // New layers and settings shipped after a user's last visit must
          // still get their defaults rather than coming back undefined.
          layers: { ...DEFAULT_LAYER_STATE, ...(p.layers ?? {}) },
          settings: { ...DEFAULT_SETTINGS, ...(p.settings ?? {}) },
          profile: { ...DEFAULT_PROFILE, ...(p.profile ?? {}) },
          taskStatus: p.taskStatus ?? {},
          markerDone: p.markerDone ?? {},
          quest: { ...DEFAULT_QUEST },
        };
      },
    },
  ),
);
