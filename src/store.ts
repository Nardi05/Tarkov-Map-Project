import { create } from "zustand";
import { persist, createJSONStorage } from "zustand/middleware";
import { DEFAULT_LAYER_STATE, LAYERS, PRESETS, type LayerId } from "./lib/layers";

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
  /** Dim quest markers whose task is marked complete instead of hiding them. */
  dimCompleted: boolean;
}

interface QuestFilters {
  search: string;
  trader: string | null;
  kappaOnly: boolean;
  hideCompleted: boolean;
  /** When set, only this task's markers render. */
  focusTask: string | null;
}

interface Store {
  layers: Record<LayerId, boolean>;
  settings: Settings;
  quest: QuestFilters;
  /** Task ids the user has ticked off. Persisted; it is their raid progress. */
  completed: Record<string, true>;
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

  toggleCompleted: (taskId: string) => void;
  setCompleted: (taskIds: string[], done: boolean) => void;
  clearCompleted: () => void;

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
  hideCompleted: false,
  focusTask: null,
};

export const useStore = create<Store>()(
  persist(
    (set) => ({
      layers: { ...DEFAULT_LAYER_STATE },
      settings: { ...DEFAULT_SETTINGS },
      quest: { ...DEFAULT_QUEST },
      completed: {},
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
      clearQuestFilters: () => set({ quest: { ...DEFAULT_QUEST } }),

      toggleCompleted: (taskId) =>
        set((s) => {
          const next = { ...s.completed };
          if (next[taskId]) delete next[taskId];
          else next[taskId] = true;
          return { completed: next };
        }),
      setCompleted: (taskIds, done) =>
        set((s) => {
          const next = { ...s.completed };
          for (const id of taskIds) {
            if (done) next[id] = true;
            else delete next[id];
          }
          return { completed: next };
        }),
      clearCompleted: () => set({ completed: {} }),

      setLastMap: (map) => set({ lastMap: map }),
    }),
    {
      name: "tarkov-maps",
      version: 1,
      storage: createJSONStorage(() => localStorage),
      // Quest filters are per-session; everything else is worth remembering.
      partialize: ({ layers, settings, completed, lastMap }) => ({
        layers,
        settings,
        completed,
        lastMap,
      }),
      merge: (persisted, current) => {
        const p = (persisted ?? {}) as Partial<Store>;
        return {
          ...current,
          ...p,
          // New layers and settings shipped after a user's last visit must
          // still get their defaults rather than coming back undefined.
          layers: { ...DEFAULT_LAYER_STATE, ...(p.layers ?? {}) },
          settings: { ...DEFAULT_SETTINGS, ...(p.settings ?? {}) },
          quest: { ...DEFAULT_QUEST },
        };
      },
    },
  ),
);
