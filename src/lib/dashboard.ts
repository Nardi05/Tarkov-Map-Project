/**
 * The dashboard's layout: which panels are on it, in what order, and how wide
 * each one sits.
 *
 * Kept out of the store, and free of value imports, so it can be tested through
 * `node --experimental-strip-types` the same way the persist migrations are —
 * see the note at the top of ./persist-migrate.ts. A layout bug is not as
 * expensive as losing progress, but it is the one slice a player edits by hand,
 * so it earns the same treatment: every stored shape this has ever written has
 * to come back as something usable.
 */

export type DashPanelId =
  | "trackers"
  | "progress"
  | "raid"
  | "upcoming"
  | "keys"
  | "needs"
  | "traders"
  | "story"
  | "season"
  | "hideout"
  | "maps";

export interface DashPanel {
  id: DashPanelId;
  /** Off panels keep their place in the order, ready to be switched back on. */
  visible: boolean;
  /** Spans both columns on a wide screen. Ignored in the one-column layout. */
  wide: boolean;
}

export interface DashboardLayout {
  panels: DashPanel[];
  /** How many upcoming tasks the Upcoming panel lists. */
  upcomingLimit: number;
  /** Columns on a wide screen. One column is the old layout, kept as a choice. */
  columns: 1 | 2;
}

export interface DashPanelMeta {
  title: string;
  hint: string;
  /** What the panel is for, in the customise tray where there is no content. */
  blurb: string;
}

export const DASH_PANEL_META: Record<DashPanelId, DashPanelMeta> = {
  trackers: {
    title: "Your trackers",
    hint: "Where each part of your progress stands, and what is not set up yet.",
    blurb: "Status and setup for tasks, story, season and hideout.",
  },
  progress: {
    title: "Task progress",
    hint: "Trader tasks done, active, and still open on this character.",
    blurb: "How far this character is through the trader tasks.",
  },
  raid: {
    title: "Next raid",
    hint: "Best map to queue, based on your active tasks.",
    blurb: "Which map to run next.",
  },
  upcoming: {
    title: "Do next",
    hint: "Tasks you can start now, with the maps they use.",
    blurb: "The next tasks on your path.",
  },
  keys: {
    title: "Keys to bring",
    hint: "Doors those next tasks go through.",
    blurb: "Keys for what is coming up.",
  },
  needs: {
    title: "Find in raid",
    hint: "Items those tasks still need from the stash.",
    blurb: "Quest items still to find.",
  },
  traders: {
    title: "By trader",
    hint: "The next offer from each trader.",
    blurb: "One next task per trader.",
  },
  story: {
    title: "Story",
    hint: "Your target ending and the next steps on its path.",
    blurb: "Progress towards your chosen ending.",
  },
  season: {
    title: "Season",
    hint: "The seasonal story line: what is next and how long is left.",
    blurb: "Kord Breach progress on your seasonal character.",
  },
  hideout: {
    title: "Hideout",
    hint: "Stations you can build right now.",
    blurb: "What the hideout can build next.",
  },
  maps: {
    title: "Jump back in",
    hint: "Where you were, and the maps with the most on them.",
    blurb: "Shortcuts straight to a map.",
  },
};

export const DASH_PANELS = Object.keys(DASH_PANEL_META) as DashPanelId[];

export const UPCOMING_LIMITS = [5, 6, 8, 10, 12, 16, 20] as const;

/**
 * The out-of-the-box dashboard.
 *
 * A summary first — where every tracker stands — then the questions a player
 * asks on opening the site: which map do I queue, what am I running, and what
 * do I need to bring.
 */
export const DEFAULT_DASHBOARD: DashboardLayout = {
  panels: [
    { id: "trackers", visible: true, wide: true },
    { id: "progress", visible: true, wide: false },
    { id: "story", visible: true, wide: false },
    { id: "raid", visible: true, wide: true },
    { id: "upcoming", visible: true, wide: false },
    { id: "season", visible: true, wide: false },
    { id: "keys", visible: true, wide: false },
    { id: "hideout", visible: true, wide: false },
    { id: "needs", visible: true, wide: true },
    { id: "traders", visible: true, wide: true },
    { id: "maps", visible: true, wide: false },
  ],
  upcomingLimit: 20,
  columns: 2,
};

const DEFAULT_BY_ID = new Map(DEFAULT_DASHBOARD.panels.map((p) => [p.id, p]));

const isPanelId = (v: unknown): v is DashPanelId =>
  typeof v === "string" && (DASH_PANELS as string[]).includes(v);

/**
 * Reads whatever is in storage back into a layout that renders.
 *
 * Three shapes have existed: nothing at all, the original
 * `{ panelOrder: ["upcoming", "keys", "needs"] }`, and the current one. A panel
 * added after somebody's last visit is appended rather than dropped, so the
 * feature appears for them instead of silently never existing.
 */
export function mergeDashboard(
  stored: Partial<DashboardLayout> & { panelOrder?: unknown } | undefined,
): DashboardLayout {
  const raw = stored ?? {};

  const panels: DashPanel[] = [];
  const seen = new Set<DashPanelId>();

  const push = (id: DashPanelId, visible: boolean, wide: boolean) => {
    if (seen.has(id)) return;
    seen.add(id);
    panels.push({ id, visible, wide });
  };

  if (Array.isArray(raw.panels)) {
    for (const entry of raw.panels) {
      const id = (entry as DashPanel | undefined)?.id;
      if (!isPanelId(id)) continue;
      const fallback = DEFAULT_BY_ID.get(id)!;
      push(
        id,
        typeof (entry as DashPanel).visible === "boolean"
          ? (entry as DashPanel).visible
          : fallback.visible,
        typeof (entry as DashPanel).wide === "boolean" ? (entry as DashPanel).wide : fallback.wide,
      );
    }
  } else if (Array.isArray(raw.panelOrder)) {
    // The first shape: an order over the three panels that existed, all shown.
    for (const id of raw.panelOrder) {
      if (!isPanelId(id)) continue;
      push(id, true, DEFAULT_BY_ID.get(id)!.wide);
    }
  }

  const known = panels.length > 0;
  // Anything the stored layout has never heard of lands after it, as shipped —
  // except the tracker summary, which is the top of the page or nothing.
  for (const panel of DEFAULT_DASHBOARD.panels) push(panel.id, panel.visible, panel.wide);
  if (known) {
    const at = panels.findIndex((p) => p.id === "trackers");
    if (at > 0 && !storedIds(raw).has("trackers")) panels.unshift(...panels.splice(at, 1));
  }

  const limit = Number(raw.upcomingLimit);
  return {
    panels,
    upcomingLimit: (UPCOMING_LIMITS as readonly number[]).includes(limit)
      ? limit
      : DEFAULT_DASHBOARD.upcomingLimit,
    columns: raw.columns === 1 ? 1 : 2,
  };
}

function storedIds(raw: { panels?: unknown; panelOrder?: unknown }): Set<unknown> {
  if (Array.isArray(raw.panels)) return new Set(raw.panels.map((p) => (p as DashPanel | null)?.id));
  if (Array.isArray(raw.panelOrder)) return new Set(raw.panelOrder);
  return new Set();
}

/** Moves one panel to a new index, keeping every other panel's order. */
export function reorderPanels(
  panels: DashPanel[],
  from: number,
  to: number,
): DashPanel[] {
  if (from === to || from < 0 || from >= panels.length) return panels;
  const clamped = Math.min(Math.max(to, 0), panels.length - 1);
  if (from === clamped) return panels;
  const next = [...panels];
  const [moved] = next.splice(from, 1);
  next.splice(clamped, 0, moved);
  return next;
}

/** Steps a panel one place up or down among the panels that are switched on. */
export function movePanel(panels: DashPanel[], id: DashPanelId, dir: -1 | 1): DashPanel[] {
  const from = panels.findIndex((p) => p.id === id);
  if (from < 0) return panels;

  /*
   * Hidden panels are skipped rather than swapped with. They keep their place
   * in the order so switching one back on puts it where it was — but stepping
   * a visible panel "up" past one nobody can see looks, on screen, like the
   * button did nothing.
   */
  let to = from + dir;
  while (to >= 0 && to < panels.length && !panels[to].visible) to += dir;
  if (to < 0 || to >= panels.length) return panels;

  return reorderPanels(panels, from, to);
}

export function setPanelFlag(
  panels: DashPanel[],
  id: DashPanelId,
  key: "visible" | "wide",
  value: boolean,
): DashPanel[] {
  return panels.map((p) => (p.id === id ? { ...p, [key]: value } : p));
}
