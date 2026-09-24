import type { Progression, TaskStatus } from "../types.ts";
import type { Faction, GameMode } from "./persist-migrate.ts";
import { prerequisiteClosure } from "./progression.ts";
import { displayName, visibleInMode } from "./task-variant.ts";

/**
 * The logic behind the one-screen task setup, kept free of React so it can be
 * tested: which tasks a character could be holding, grouped by trader, and
 * what ticking some of them implies about everything before them.
 */

/** Traders in the order they unlock in game, so the chips read the way the game does. */
export const TRADER_ORDER = [
  "Prapor",
  "Therapist",
  "Skier",
  "Peacekeeper",
  "Mechanic",
  "Ragman",
  "Jaeger",
  "Fence",
  "Ref",
  "Lightkeeper",
  "BTR Driver",
];

/** The seasonal story line gets its own group rather than hiding inside Prapor's. */
export const SEASON_GROUP = "season";

export interface SetupTask {
  id: string;
  name: string;
  trader: string;
  level: number;
  kappa: boolean;
  /** How many tasks sit behind this one, so a chain lists in the order it is handed out. */
  depth: number;
}

export interface SetupGroup {
  /** A trader's name, or SEASON_GROUP. */
  id: string;
  label: string;
  /** The trader whose screen a screenshot of this group would come from. */
  trader: string;
  tasks: SetupTask[];
}

export function setupGroups(
  data: Progression | null,
  character: { mode: GameMode; faction: Faction },
  season: { label: string; order: string[] } = { label: "Season", order: [] },
): SetupGroup[] {
  if (!data) return [];
  const byTrader = new Map<string, SetupTask[]>();
  const seasonLine: SetupTask[] = [];

  for (const [id, task] of Object.entries(data.tasks)) {
    if (!task.trader) continue;
    // A task locked to the other faction can never be in this character's list.
    if (task.factionName && character.faction !== "Any" && task.factionName !== character.faction) continue;
    if (!visibleInMode(task.name, character.mode)) continue;
    const row: SetupTask = {
      id,
      name: task.name,
      trader: task.trader,
      level: task.minPlayerLevel,
      kappa: task.kappaRequired,
      depth: prerequisiteClosure(data, id).length,
    };
    if (id.startsWith("kord:")) seasonLine.push(row);
    else {
      const list = byTrader.get(task.trader) ?? [];
      list.push(row);
      byTrader.set(task.trader, list);
    }
  }

  const byDepth = (a: SetupTask, b: SetupTask) =>
    a.depth - b.depth || a.level - b.level || a.name.localeCompare(b.name);
  const known = TRADER_ORDER.filter((t) => byTrader.has(t));
  const rest = [...byTrader.keys()].filter((t) => !TRADER_ORDER.includes(t)).sort();
  const groups: SetupGroup[] = [...known, ...rest].map((trader) => ({
    id: trader,
    label: trader,
    trader,
    tasks: byTrader.get(trader)!.sort(byDepth),
  }));

  if (seasonLine.length) {
    const at = new Map(season.order.map((id, i) => [id, i]));
    seasonLine.sort((a, b) => (at.get(a.id) ?? 0) - (at.get(b.id) ?? 0));
    groups.unshift({ id: SEASON_GROUP, label: season.label, trader: seasonLine[0].trader, tasks: seasonLine });
  }
  return groups;
}

/** Case-insensitive match on the task's name (either spelling) or its trader. */
export function matchesQuery(task: SetupTask, query: string): boolean {
  const needle = query.trim().toLowerCase();
  if (!needle) return true;
  return (
    task.name.toLowerCase().includes(needle) ||
    displayName(task.name).toLowerCase().includes(needle) ||
    task.trader.toLowerCase().includes(needle)
  );
}

/**
 * Everything the staged ticks imply is already done.
 *
 * A trader will not hand out a task until the ones behind it are finished, so
 * an active task means its whole prerequisite chain is complete. Where a chain
 * branches, `prerequisiteClosure` follows statuses already declared and only
 * then the shortest remaining path.
 */
export function impliedDone(data: Progression | null, staged: Record<string, TaskStatus>): Set<string> {
  const out = new Set<string>();
  for (const id of Object.keys(staged)) {
    for (const prior of prerequisiteClosure(data, id, staged)) {
      if (!staged[prior]) out.add(prior);
    }
  }
  return out;
}

/** The statuses a save writes: what was ticked, plus what it implies. */
export function setupWrites(
  staged: Record<string, TaskStatus>,
  implied: Set<string>,
): Record<string, TaskStatus> {
  const out: Record<string, TaskStatus> = { ...staged };
  for (const id of implied) out[id] = "completed";
  return out;
}

/** not started -> active -> done -> not started, the same cycle as everywhere else. */
export function cycleStaged(
  staged: Record<string, TaskStatus>,
  id: string,
): Record<string, TaskStatus> {
  const next = { ...staged };
  if (!next[id]) next[id] = "active";
  else if (next[id] === "active") next[id] = "completed";
  else delete next[id];
  return next;
}

/** Marks these active without ever demoting one already staged as done. */
export function stageActive(
  staged: Record<string, TaskStatus>,
  ids: string[],
): Record<string, TaskStatus> {
  const next = { ...staged };
  for (const id of ids) if (!next[id]) next[id] = "active";
  return next;
}
