import type { HideoutData, HideoutStation } from "../types";
import type { HideoutStatus } from "./persist-migrate";

export interface HideoutRow {
  station: HideoutStation;
  /** Highest completed level, or 0. */
  completedLevel: number;
  next: HideoutStation["levels"][number] | null;
  status: HideoutStatus | "available" | "locked";
}

export function hideoutRows(
  data: HideoutData | null,
  hideout: Record<string, HideoutStatus>,
): HideoutRow[] {
  if (!data) return [];
  const completedLevel = new Map<string, number>();
  for (const station of data.stations) {
    let max = 0;
    for (const level of station.levels) {
      if (hideout[level.id] === "completed") max = Math.max(max, level.level);
    }
    completedLevel.set(station.id, max);
  }

  return data.stations.map((station) => {
    const done = completedLevel.get(station.id) ?? 0;
    const next = station.levels.find((l) => l.level === done + 1) ?? null;
    let status: HideoutRow["status"] = "available";
    if (next) {
      const stated = hideout[next.id];
      if (stated) status = stated;
      else {
        const gates = next.stationLevelRequirements ?? [];
        const locked = gates.some((g) => (completedLevel.get(g.stationId) ?? 0) < g.level);
        if (locked) status = "locked";
      }
    } else {
      status = "completed";
    }
    return { station, completedLevel: done, next, status };
  });
}

/** Station-level ids at or below `level`, so marking 3 also ticks 1 and 2. */
export function completeThrough(station: HideoutStation, level: number): string[] {
  return station.levels.filter((row) => row.level <= level).map((row) => row.id);
}
