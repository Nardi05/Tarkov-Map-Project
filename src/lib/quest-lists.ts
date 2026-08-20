import type { KeyItem, Progression } from "../types";
import { prettyMapName } from "./kord-season";
import { displayName } from "./task-variant";

export interface KeyRow {
  item: KeyItem;
  tasks: string[];
  maps: string[];
}

export interface NeedRow {
  name: string;
  icon: string | null;
  count: number;
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

export function collectNeeds(progression: Progression | null, taskIds: string[]): NeedRow[] {
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
        tasks: [],
      };
      existing.count += need.count;
      const label = displayName(task.name);
      if (!existing.tasks.includes(label)) existing.tasks.push(label);
      out.set(need.name, existing);
    }
  }

  return [...out.values()].sort((a, b) => b.count - a.count || a.name.localeCompare(b.name));
}
