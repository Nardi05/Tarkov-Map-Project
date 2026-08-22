import { create } from "zustand";
import { persist, createJSONStorage } from "zustand/middleware";
import {
  DEFAULT_DASHBOARD,
  mergeDashboard,
  movePanel,
  reorderPanels,
  setPanelFlag,
  UPCOMING_LIMITS,
  type DashboardLayout,
  type DashPanelId,
} from "./lib/dashboard";
import { DEFAULT_LAYER_STATE, LAYERS, PRESETS, type LayerId } from "./lib/layers";
import {
  emptyMode,
  emptyProgress,
  mergeProfile,
  mergeProgress,
  migrate,
  type GameMode,
  type HideoutStatus,
  type ModeProgress,
  type Profile,
} from "./lib/persist-migrate";
import type { TaskStatus } from "./types";

export type { GameMode, Profile } from "./lib/persist-migrate";
export {
  DASH_PANELS,
  DASH_PANEL_META,
  DEFAULT_DASHBOARD,
  UPCOMING_LIMITS,
  type DashboardLayout,
  type DashPanel,
  type DashPanelId,
} from "./lib/dashboard";

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
  /** Dashboard layout — panel order and how many upcoming tasks to show. */
  dashboard: DashboardLayout;

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
  /** Marks a task done and every prerequisite behind it, the same way setup does. */
  completeWithPrereqs: (taskId: string, prereqIds: string[]) => void;
  toggleMarkerDone: (markerId: string) => void;
  setMarkersDone: (markerIds: string[], done: boolean) => void;
  setItemCount: (itemId: string, count: number) => void;
  bumpItemCount: (itemId: string, delta: number) => void;
  setKeyOwned: (keyId: string, owned: boolean) => void;
  setHideoutStatus: (levelId: string, status: HideoutStatus | null) => void;
  /** Wipes the current mode only — the other mode's progress is untouched. */
  clearProgress: () => void;
  /** Clears quest statuses and location ticks; stash and hideout stay. */
  resetTasks: () => void;
  /** Clears item counts and acquired keys; quests stay. */
  resetItems: () => void;
  /**
   * Marks these tasks completed only if they have no status yet.
   * Used to fill in prereqs behind currently active tasks when recalculating.
   */
  fillCompleted: (ids: string[]) => void;
  /**
   * Folds a set of statuses in over the current mode.
   *
   * Additive on purpose: the setup walkthrough and a restored save both say
   * what they know, and neither has an opinion about tasks the player ticked
   * by hand outside them. Those survive.
   */
  importTaskStatus: (statuses: Record<string, TaskStatus>) => void;
  /**
   * Replaces both modes wholesale, from a restored save file.
   *
   * Replace, not merge, unlike `importTaskStatus`: a save is a complete picture
   * of a moment, and folding it into whatever is already here would produce a
   * state that never existed on either machine. The UI asks first.
   */
  restoreProgress: (progress: Record<GameMode, ModeProgress>, profile?: Partial<Profile>) => void;

  setLastMap: (map: string) => void;

  /** Steps a panel one place up or down, skipping the ones switched off. */
  moveDashPanel: (id: DashPanelId, dir: -1 | 1) => void;
  /** Drops a dragged panel at an index. */
  reorderDashPanels: (from: number, to: number) => void;
  toggleDashPanel: (id: DashPanelId) => void;
  setDashPanelWide: (id: DashPanelId, wide: boolean) => void;
  setDashColumns: (columns: 1 | 2) => void;
  resetDashboard: () => void;
  setUpcomingLimit: (n: number) => void;
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
      dashboard: { ...DEFAULT_DASHBOARD, panels: [...DEFAULT_DASHBOARD.panels] },

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
            else if (current === "active" || current === "pinned") taskStatus[taskId] = "completed";
            else delete taskStatus[taskId];
            return { ...p, taskStatus };
          }),
        ),

      completeWithPrereqs: (taskId, prereqIds) =>
        set((s) =>
          editMode(s, (p) => {
            const taskStatus = { ...p.taskStatus };
            for (const id of prereqIds) {
              if (!taskStatus[id]) taskStatus[id] = "completed";
            }
            taskStatus[taskId] = "completed";
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

      setItemCount: (itemId, count) =>
        set((s) =>
          editMode(s, (p) => {
            const itemCounts = { ...p.itemCounts };
            const next = Math.max(0, Math.floor(count));
            if (next) itemCounts[itemId] = next;
            else delete itemCounts[itemId];
            return { ...p, itemCounts };
          }),
        ),

      bumpItemCount: (itemId, delta) =>
        set((s) =>
          editMode(s, (p) => {
            const itemCounts = { ...p.itemCounts };
            const next = Math.max(0, (itemCounts[itemId] ?? 0) + delta);
            if (next) itemCounts[itemId] = next;
            else delete itemCounts[itemId];
            return { ...p, itemCounts };
          }),
        ),

      setKeyOwned: (keyId, owned) =>
        set((s) =>
          editMode(s, (p) => {
            const keysOwned = { ...p.keysOwned };
            if (owned) keysOwned[keyId] = true;
            else delete keysOwned[keyId];
            return { ...p, keysOwned };
          }),
        ),

      setHideoutStatus: (levelId, status) =>
        set((s) =>
          editMode(s, (p) => {
            const hideout = { ...p.hideout };
            if (status) hideout[levelId] = status;
            else delete hideout[levelId];
            return { ...p, hideout };
          }),
        ),

      clearProgress: () => set((s) => editMode(s, () => emptyMode())),

      resetTasks: () =>
        set((s) =>
          editMode(s, (p) => ({
            ...p,
            taskStatus: {},
            markerDone: {},
          })),
        ),

      resetItems: () =>
        set((s) =>
          editMode(s, (p) => ({
            ...p,
            itemCounts: {},
            keysOwned: {},
          })),
        ),

      fillCompleted: (ids) =>
        set((s) =>
          editMode(s, (p) => {
            const taskStatus = { ...p.taskStatus };
            let changed = false;
            for (const id of ids) {
              if (!taskStatus[id]) {
                taskStatus[id] = "completed";
                changed = true;
              }
            }
            return changed ? { ...p, taskStatus } : p;
          }),
        ),

      importTaskStatus: (statuses) =>
        set((s) => editMode(s, (p) => ({ ...p, taskStatus: { ...p.taskStatus, ...statuses } }))),

      restoreProgress: (progress, profile) =>
        set((s) => ({
          progress,
          profile: profile ? mergeProfile({ ...s.profile, ...profile }) : s.profile,
        })),

      setLastMap: (map) => set({ lastMap: map }),

      moveDashPanel: (id, dir) =>
        set((s) => ({ dashboard: { ...s.dashboard, panels: movePanel(s.dashboard.panels, id, dir) } })),
      reorderDashPanels: (from, to) =>
        set((s) => ({ dashboard: { ...s.dashboard, panels: reorderPanels(s.dashboard.panels, from, to) } })),
      toggleDashPanel: (id) =>
        set((s) => ({
          dashboard: {
            ...s.dashboard,
            panels: setPanelFlag(
              s.dashboard.panels,
              id,
              "visible",
              !s.dashboard.panels.find((p) => p.id === id)?.visible,
            ),
          },
        })),
      setDashPanelWide: (id, wide) =>
        set((s) => ({
          dashboard: { ...s.dashboard, panels: setPanelFlag(s.dashboard.panels, id, "wide", wide) },
        })),
      setDashColumns: (columns) => set((s) => ({ dashboard: { ...s.dashboard, columns } })),
      resetDashboard: () => set({ dashboard: { ...DEFAULT_DASHBOARD, panels: [...DEFAULT_DASHBOARD.panels] } }),
      setUpcomingLimit: (n) =>
        set((s) => ({
          dashboard: {
            ...s.dashboard,
            upcomingLimit: (UPCOMING_LIMITS as readonly number[]).includes(n)
              ? n
              : s.dashboard.upcomingLimit,
          },
        })),
    }),
    {
      name: "tarkov-maps",
      version: 7,
      storage: createJSONStorage(() => localStorage),
      // An allowlist: a slice added to the store and forgotten here simply
      // never persists. Search, trader and Kappa narrowing are momentary and
      // reset on reload; show-all is a view preference, so it sticks like the
      // layer toggles do.
      partialize: ({
        layers,
        customViews,
        settings,
        quest,
        profile,
        progress,
        lastMap,
        dashboard,
      }) => ({
        layers,
        customViews,
        settings,
        quest: { showAll: quest.showAll },
        profile,
        progress,
        lastMap,
        dashboard,
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
          dashboard: mergeDashboard(p.dashboard),
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

export function useItemCounts(): Record<string, number> {
  return useStore((s) => s.progress[s.profile.mode].itemCounts);
}

export function useKeysOwned(): Record<string, true> {
  return useStore((s) => s.progress[s.profile.mode].keysOwned);
}

export function useHideout(): Record<string, HideoutStatus> {
  return useStore((s) => s.progress[s.profile.mode].hideout);
}
