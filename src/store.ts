import { create } from "zustand";
import { persist, createJSONStorage } from "zustand/middleware";
import { DEFAULT_LAYER_STATE, LAYERS, PRESETS, type LayerId } from "./lib/layers";
import type { TaskStatus } from "./types";

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
  /** Saves whatever is currently switched on as a named quick view. */
  saveCustomView: (label: string) => void;
  removeCustomView: (id: string) => void;

  setSetting: <K extends keyof Settings>(key: K, value: Settings[K]) => void;
  setQuestFilter: <K extends keyof QuestFilters>(key: K, value: QuestFilters[K]) => void;
  clearQuestFilters: () => void;

  setTaskStatus: (taskId: string, status: TaskStatus | null) => void;
  /** Steps a task through not started -> active -> done -> not started. */
  cycleTaskStatus: (taskId: string) => void;
  toggleMarkerDone: (markerId: string) => void;
  setMarkersDone: (markerIds: string[], done: boolean) => void;
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

export const useStore = create<Store>()(
  persist(
    (set) => ({
      layers: { ...DEFAULT_LAYER_STATE },
      customViews: [],
      settings: { ...DEFAULT_SETTINGS },
      quest: { ...DEFAULT_QUEST },
      taskStatus: {},
      markerDone: {},
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

      setSetting: (key, value) => set((s) => ({ settings: { ...s.settings, [key]: value } })),
      setQuestFilter: (key, value) => set((s) => ({ quest: { ...s.quest, [key]: value } })),
      // "Show everything" is a view mode, not a filter — clearing the search
      // and trader chips shouldn't yank the map back to selected-only.
      clearQuestFilters: () => set((s) => ({ quest: { ...DEFAULT_QUEST, showAll: s.quest.showAll } })),

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

      clearProgress: () => set({ taskStatus: {}, markerDone: {} }),

      setLastMap: (map) => set({ lastMap: map }),
    }),
    {
      name: "tarkov-maps",
      version: 3,
      storage: createJSONStorage(() => localStorage),
      // Search, trader and Kappa narrowing are momentary and reset on reload;
      // show-all is a view preference, so it sticks like the layer toggles do.
      partialize: ({ layers, customViews, settings, quest, taskStatus, markerDone, lastMap }) => ({
        layers,
        customViews,
        settings,
        quest: { showAll: quest.showAll },
        taskStatus,
        markerDone,
        lastMap,
      }),
      /**
       * Two shapes have to survive here, and both hold real hours of somebody's
       * raid progress, so neither migration is allowed to drop a task:
       *
       * v1 kept a single `completed: Record<string, true>` flag per task.
       * v2 added a `profile` and a "failed" status, both of which belonged to
       * the availability inference that no longer exists. Dropping the profile
       * is a clean delete; a "failed" task becomes "not started", since the
       * remaining model has nowhere to put it and guessing "done" would be a
       * lie about their progress.
       */
      migrate: (persisted, version) => {
        const state = (persisted ?? {}) as Record<string, unknown>;

        if (version < 2) {
          const completed = (state.completed ?? {}) as Record<string, true>;
          state.taskStatus = Object.fromEntries(
            Object.keys(completed).map((id) => [id, "completed"]),
          );
          state.markerDone = {};
        }

        delete state.profile;
        const status = (state.taskStatus ?? {}) as Record<string, string>;
        state.taskStatus = Object.fromEntries(
          Object.entries(status).filter(([, v]) => v === "active" || v === "completed"),
        );
        return state;
      },
      merge: (persisted, current) => {
        const p = (persisted ?? {}) as Partial<Store>;
        return {
          ...current,
          ...p,
          // New layers and settings shipped after a user's last visit must
          // still get their defaults rather than coming back undefined.
          layers: { ...DEFAULT_LAYER_STATE, ...(p.layers ?? {}) },
          customViews: p.customViews ?? [],
          settings: { ...DEFAULT_SETTINGS, ...(p.settings ?? {}) },
          taskStatus: p.taskStatus ?? {},
          markerDone: p.markerDone ?? {},
          quest: { ...DEFAULT_QUEST, showAll: p.quest?.showAll ?? DEFAULT_QUEST.showAll },
        };
      },
    },
  ),
);
