import type { MapIndexEntry, Progression, TaskStatus } from "../types";

const stripTag = (name: string) => name.replace(/\s*\[(PVP ZONE|PVE ZONE|KORD BREACH)\]\s*$/i, "").trim();

export interface RaidPick {
  map: MapIndexEntry;
  /** Active tasks that name this map. */
  active: { id: string; name: string }[];
  /** How many battle-pass document spawns the map has. */
  documents: number;
  score: number;
}

/**
 * Which map is worth queuing, given what the player said they are running.
 *
 * Active tasks with a map win. Document density is a tie-break — useful during
 * Kord Breach, harmless otherwise — and never outranks a real objective.
 */
export function nextRaids(
  maps: MapIndexEntry[],
  progression: Progression | null,
  taskStatus: Record<string, TaskStatus>,
  limit = 4,
  fallbackIds: string[] = [],
): RaidPick[] {
  const activeIds = Object.entries(taskStatus)
    .filter(([, status]) => status === "active")
    .map(([id]) => id);
  const ids = activeIds.length ? activeIds : fallbackIds;

  const picks: RaidPick[] = maps.map((map) => {
    const active: { id: string; name: string }[] = [];
    if (progression) {
      for (const id of ids) {
        const task = progression.tasks[id];
        if (task?.maps.includes(map.normalizedName)) {
          active.push({ id, name: stripTag(task.name) });
        }
      }
    }
    const documents = map.counts.docs ?? 0;
    const score = active.length * 10 + (documents > 0 ? 1 : 0) + Math.min(documents, 30) / 100;
    return { map, active, documents, score };
  });

  return picks
    .filter((p) => p.active.length > 0 || p.documents > 0)
    .sort((a, b) => b.score - a.score || a.map.name.localeCompare(b.map.name))
    .slice(0, limit);
}
