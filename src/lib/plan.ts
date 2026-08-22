import type { Progression, TaskAvailability, TaskStatus } from "../types.ts";
import type { Profile } from "./persist-migrate.ts";
import { chainDepth, computeAvailability, prerequisiteClosure } from "./progression.ts";
import { displayName, visibleInMode } from "./task-variant.ts";

/**
 * The wipe planner: given a target task, what is worth doing next.
 *
 * Availability still comes from `computeAvailability` — this never invents
 * active/done/failed. It ranks the tasks the graph already says are open,
 * biased toward the target tree the way Kappa's "personal plan" was.
 */

export interface Plan {
  current: string[];
  critical: string[];
  high: string[];
  normal: string[];
  remainingToTarget: number;
  targetId: string | null;
  targetName: string | null;
}

export const TARGET_SHORTCUTS: { id: string; label: string }[] = [
  { id: "5c51aac186f77432ea65c552", label: "Collector" },
  { id: "625d6ff5ddc94657c21a1625", label: "Network Provider - Part 1" },
  { id: "5c0d4e61d09282029f53920e", label: "The Guide" },
  { id: "60effd818b669d08a35bfad5", label: "The Choice" },
];

const DONE = new Set<TaskStatus | TaskAvailability>(["completed", "failed", "ignored"]);

export function targetTree(progression: Progression | null, targetId: string | null): Set<string> {
  const out = new Set<string>();
  if (!progression || !targetId || !progression.tasks[targetId]) return out;
  out.add(targetId);
  for (const id of prerequisiteClosure(progression, targetId)) out.add(id);
  return out;
}

function rankKey(
  progression: Progression,
  id: string,
  taskStatus: Record<string, TaskStatus>,
  inTree: boolean,
): [number, number, number, number, number, string] {
  const pinned = taskStatus[id] === "pinned" ? 0 : 1;
  const tree = inTree ? 0 : 1;
  const kappa = progression.tasks[id]?.kappaRequired ? 0 : 1;
  const depth = chainDepth(progression, id);
  const xp = -(progression.tasks[id]?.experience ?? 0);
  return [pinned, tree, kappa, depth, xp, progression.tasks[id]?.name ?? id];
}

function sortIds(
  progression: Progression,
  ids: string[],
  taskStatus: Record<string, TaskStatus>,
  tree: Set<string>,
): string[] {
  return [...ids].sort((a, b) => {
    const ka = rankKey(progression, a, taskStatus, tree.has(a));
    const kb = rankKey(progression, b, taskStatus, tree.has(b));
    for (let i = 0; i < 5; i++) if (ka[i] !== kb[i]) return (ka[i] as number) - (kb[i] as number);
    return ka[5].localeCompare(kb[5]);
  });
}

/**
 * Locked tasks whose missing prereqs are all in `current` (or already done).
 * Those are the next hop after you finish what is on the desk now.
 */
function nextHop(
  progression: Progression,
  availability: Record<string, TaskAvailability>,
  current: Set<string>,
  candidates: string[],
): string[] {
  const doneOrCurrent = (id: string) =>
    DONE.has(availability[id]) || current.has(id) || availability[id] === "active";

  const out: string[] = [];
  for (const id of candidates) {
    if (availability[id] !== "locked") continue;
    const task = progression.tasks[id];
    if (!task || task.requires.length === 0) continue;
    const unblocked = task.requires.some((set) =>
      set.every((req) => {
        const wantFail = req.status.some((s) => s.toLowerCase().startsWith("fail"));
        if (wantFail) return availability[req.task] === "failed";
        return doneOrCurrent(req.task);
      }),
    );
    if (unblocked) out.push(id);
  }
  return out;
}

export function buildPlan(
  progression: Progression | null,
  taskStatus: Record<string, TaskStatus>,
  profile: Pick<Profile, "level" | "faction" | "traderLevels" | "mode" | "targetTaskId">,
): Plan {
  const empty: Plan = {
    current: [],
    critical: [],
    high: [],
    normal: [],
    remainingToTarget: 0,
    targetId: null,
    targetName: null,
  };
  if (!progression) return empty;

  const targetId =
    profile.targetTaskId && progression.tasks[profile.targetTaskId] ? profile.targetTaskId : null;
  const tree = targetTree(progression, targetId);
  const availability = computeAvailability(progression, taskStatus, profile);

  const visible = (id: string) => visibleInMode(progression.tasks[id]?.name ?? "", profile.mode);

  const remaining = targetId
    ? [...tree].filter((id) => visible(id) && !DONE.has(availability[id])).length
    : Object.keys(progression.tasks).filter((id) => visible(id) && !DONE.has(availability[id])).length;

  const current: string[] = [];
  const rest: string[] = [];
  for (const id of Object.keys(progression.tasks)) {
    if (!visible(id)) continue;
    const state = availability[id];
    if (DONE.has(state)) continue;
    if (tree.size && !tree.has(id) && state !== "pinned" && state !== "active") {
      // Off-tree tasks stay out of the plan unless the player pinned or
      // activated them — Kappa's "show current" vs target-tree default.
      continue;
    }
    if (state === "available" || state === "active" || state === "pinned") current.push(id);
    else rest.push(id);
  }

  const rankedCurrent = sortIds(progression, current, taskStatus, tree);
  const critical = rankedCurrent.filter((id) => taskStatus[id] === "pinned" || tree.has(id));
  const hop = nextHop(progression, availability, new Set(rankedCurrent), rest);
  const hopSet = new Set(hop);
  const high = sortIds(progression, hop, taskStatus, tree);
  const normal = sortIds(
    progression,
    rest.filter((id) => !hopSet.has(id)),
    taskStatus,
    tree,
  );

  return {
    current: rankedCurrent,
    critical,
    high,
    normal,
    remainingToTarget: remaining,
    targetId,
    targetName: targetId ? displayName(progression.tasks[targetId].name) : null,
  };
}
