import type { Progression, ProgressionTask, TaskAvailability, TaskStatus } from "../types";

/**
 * Works out what state every task is in, given what the player has told us.
 *
 * The player only ever says three things: this is active, this is done, this
 * failed. Everything else — whether a task they haven't mentioned is ready to
 * pick up or still locked behind something — is derived here from the
 * prerequisite graph, their level and their faction.
 */

export interface ProfileInput {
  level: number;
  faction: string;
}

/** Why a task can't be picked up yet, in words the player can act on. */
export interface LockReason {
  kind: "task" | "level" | "faction";
  label: string;
}

const STATUS_ALIASES: Record<string, TaskStatus> = {
  complete: "completed",
  completed: "completed",
  active: "active",
  failed: "failed",
};

/** The feed says "complete"; the store says "completed". Reconcile the two. */
function satisfies(required: string[], actual: TaskStatus | undefined): boolean {
  if (!actual) return false;
  return required.some((r) => STATUS_ALIASES[r.toLowerCase()] === actual);
}

function meetsProfile(task: ProgressionTask, profile: ProfileInput): boolean {
  if (task.minPlayerLevel > profile.level) return false;
  if (task.factionName && profile.faction !== "Any" && task.factionName !== profile.faction) {
    return false;
  }
  return true;
}

export function computeAvailability(
  progression: Progression | null,
  taskStatus: Record<string, TaskStatus>,
  profile: ProfileInput,
): Record<string, TaskAvailability> {
  const out: Record<string, TaskAvailability> = {};
  if (!progression) return out;

  for (const [id, task] of Object.entries(progression.tasks)) {
    // What the player said always wins over what the graph infers.
    const stated = taskStatus[id];
    if (stated) {
      out[id] = stated;
      continue;
    }

    if (!meetsProfile(task, profile)) {
      out[id] = "locked";
      continue;
    }

    // No requirement sets at all means nothing gates it.
    const unlocked =
      task.requires.length === 0 ||
      task.requires.some((set) => set.every((req) => satisfies(req.status, taskStatus[req.task])));

    out[id] = unlocked ? "available" : "locked";
  }

  return out;
}

/**
 * What is standing between the player and a locked task. Only the immediate
 * blockers, not the whole chain — "needs Debut" is useful, the twelve tasks
 * behind Debut are not.
 */
export function lockReasons(
  progression: Progression | null,
  taskId: string,
  taskStatus: Record<string, TaskStatus>,
  profile: ProfileInput,
): LockReason[] {
  const task = progression?.tasks[taskId];
  if (!task) return [];

  const reasons: LockReason[] = [];
  if (task.minPlayerLevel > profile.level) {
    reasons.push({ kind: "level", label: `Level ${task.minPlayerLevel}` });
  }
  if (task.factionName && profile.faction !== "Any" && task.factionName !== profile.faction) {
    reasons.push({ kind: "faction", label: `${task.factionName} only` });
  }

  if (task.requires.length > 0) {
    // Report the alternative that is closest to being satisfied — that is the
    // path the player is most likely actually on.
    let best: { missing: LockReason[]; count: number } | null = null;
    for (const set of task.requires) {
      const missing = set
        .filter((req) => !satisfies(req.status, taskStatus[req.task]))
        .map((req) => {
          const name = progression?.tasks[req.task]?.name ?? "another task";
          const wants = req.status.includes("failed") && !req.status.includes("complete") ? " (failed)" : "";
          return { kind: "task" as const, label: `${name}${wants}` };
        });
      if (!best || missing.length < best.count) best = { missing, count: missing.length };
    }
    if (best) reasons.push(...best.missing);
  }

  return reasons;
}

/**
 * Every task that has to be finished before this one, following the chain all
 * the way back to the start of the game.
 *
 * This exists for the cold start. Availability is only meaningful once the site
 * knows what you have already done, and nobody is going to tick off two hundred
 * tasks by hand. Instead you find the newest task you have finished, and this
 * fills in everything behind it in one go.
 *
 * Where a task has alternative requirement sets (mutually exclusive branches of
 * the same quest), the shortest branch is taken — it is the least presumptuous
 * guess about a path we can't actually observe.
 */
export function prerequisiteClosure(progression: Progression | null, taskId: string): string[] {
  if (!progression?.tasks[taskId]) return [];

  const collected = new Set<string>();
  const queue = [taskId];
  const seen = new Set<string>([taskId]);

  while (queue.length) {
    const current = queue.shift()!;
    const task = progression.tasks[current];
    if (!task || task.requires.length === 0) continue;

    let shortest = task.requires[0];
    for (const set of task.requires) if (set.length < shortest.length) shortest = set;

    for (const req of shortest) {
      // A "must have failed" prerequisite is not something to auto-tick as
      // done — leave those for the player to say.
      if (!req.status.some((s) => s.toLowerCase().startsWith("complet"))) continue;
      if (!progression.tasks[req.task] || seen.has(req.task)) continue;
      seen.add(req.task);
      collected.add(req.task);
      queue.push(req.task);
    }
  }

  return [...collected];
}

/** Tasks the graph says are ready to pick up, limited to one map. */
export function availableOnMap(
  progression: Progression | null,
  availability: Record<string, TaskAvailability>,
  mapName: string,
): string[] {
  if (!progression) return [];
  return Object.entries(progression.tasks)
    .filter(([id, task]) => task.maps.includes(mapName) && availability[id] === "available")
    .map(([id]) => id);
}
