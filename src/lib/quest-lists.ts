import type { KeyItem, Progression } from "../types.ts";
import { prettyMapName } from "./kord-season.ts";
import { displayName } from "./task-variant.ts";

export interface KeyRow {
  item: KeyItem;
  tasks: string[];
  maps: string[];
}

export interface NeedRow {
  name: string;
  icon: string | null;
  count: number;
  remaining: number;
  items: string[];
  tasks: string[];
}

export function collectKeys(progression: Progression | null, taskIds: string[]): KeyRow[] {
  if (!progression) return [];
  const out = new Map<string, KeyRow>();

  for (const id of taskIds) {
    const task = progression.tasks[id];
    if (!task) continue;
    for (const entry of task.keys) {
      for (const keyId of entry.keys) {
        const item = progression.keys[keyId];
        if (!item) continue;
        const existing = out.get(keyId) ?? { item, tasks: [], maps: [] };
        const label = displayName(task.name);
        if (!existing.tasks.includes(label)) existing.tasks.push(label);
        const map = entry.map ? prettyMapName(entry.map) : null;
        if (map && !existing.maps.includes(map)) existing.maps.push(map);
        out.set(keyId, existing);
      }
    }
  }

  return [...out.values()].sort((a, b) => b.tasks.length - a.tasks.length);
}

export function collectNeeds(
  progression: Progression | null,
  taskIds: string[],
  itemCounts: Record<string, number> = {},
): NeedRow[] {
  if (!progression) return [];
  const out = new Map<string, NeedRow>();

  for (const id of taskIds) {
    const task = progression.tasks[id];
    if (!task) continue;
    for (const need of task.needs) {
      if (!need.foundInRaid) continue;
      const existing = out.get(need.name) ?? {
        name: need.name,
        icon: need.icon,
        count: 0,
        remaining: 0,
        items: [...need.items],
        tasks: [],
      };
      existing.count += need.count;
      for (const itemId of need.items) {
        if (!existing.items.includes(itemId)) existing.items.push(itemId);
      }
      const label = displayName(task.name);
      if (!existing.tasks.includes(label)) existing.tasks.push(label);
      out.set(need.name, existing);
    }
  }

  for (const row of out.values()) {
    const have = row.items.length
      ? Math.max(0, ...row.items.map((id) => itemCounts[id] ?? 0))
      : 0;
    row.remaining = Math.max(0, row.count - have);
  }

  return [...out.values()].sort((a, b) => b.remaining - a.remaining || a.name.localeCompare(b.name));
}

/**
 * One row per task hand-in, the way Kappa's item list was built: which quest
 * wants the item, whether it has to be found in raid, and how many you still
 * need. Remaining is stash-global — one pile, not a count per objective.
 */
export interface TaskItemRow {
  key: string;
  taskId: string;
  taskName: string;
  trader: string | null;
  level: number;
  itemId: string;
  itemName: string;
  icon: string | null;
  foundInRaid: boolean;
  need: number;
  have: number;
  remaining: number;
  maps: string[];
  kappa: boolean;
}

export function collectTaskItems(
  progression: Progression | null,
  itemCounts: Record<string, number> = {},
): TaskItemRow[] {
  if (!progression) return [];
  const out: TaskItemRow[] = [];

  for (const [taskId, task] of Object.entries(progression.tasks)) {
    for (const need of task.needs) {
      const itemId = need.items[0];
      if (!itemId) continue;
      const have = need.items.length
        ? Math.max(0, ...need.items.map((id) => itemCounts[id] ?? 0))
        : 0;
      out.push({
        key: `${taskId}:${itemId}:${need.foundInRaid ? "fir" : "any"}`,
        taskId,
        taskName: displayName(task.name),
        trader: task.trader,
        level: task.minPlayerLevel,
        itemId,
        itemName: need.name,
        icon: need.icon,
        foundInRaid: need.foundInRaid,
        need: need.count,
        have,
        remaining: Math.max(0, need.count - have),
        maps: task.maps,
        kappa: task.kappaRequired,
      });
    }
  }

  return out.sort(
    (a, b) =>
      a.level - b.level ||
      a.taskName.localeCompare(b.taskName) ||
      a.itemName.localeCompare(b.itemName),
  );
}
