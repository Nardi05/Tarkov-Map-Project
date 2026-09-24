import type { Progression, TaskStatus } from "../types.ts";
import { prerequisiteClosure } from "./progression.ts";

/**
 * Filling in the chain behind the quests a player is holding.
 *
 * A trader only hands out a quest once everything behind it is done, so an
 * active quest is proof its whole prerequisite chain is finished. Settings has
 * long had a Recalc button that applies this; these functions let every path
 * that marks a quest active apply it on its own, so a late-wipe player who
 * syncs Collector as active is not left with 200 early quests still open.
 *
 * Three rules, shared by every caller:
 *
 *   The frontier stays as it is. An active or pinned quest is never promoted
 *   to completed by this — that would finish Collector, not its chain.
 *
 *   Only quests with no status are written. Anything the player already said
 *   (failed, ignored, pinned, active, completed) is theirs and is kept.
 *
 *   Nothing happens without the graph. Before the task graph has loaded the
 *   write goes through unchanged; Settings → Recalc can fill it in later.
 */

export const isFrontier = (status: TaskStatus | undefined): boolean =>
  status === "active" || status === "pinned";

/**
 * Quests with no status that sit behind the frontier.
 *
 * `frontier` narrows which active/pinned quests to look behind — the ones a
 * write just touched. Left out, every active/pinned quest counts, which is
 * exactly Settings → Recalc.
 */
export function prereqsToFill(
  progression: Progression | null,
  taskStatus: Record<string, TaskStatus>,
  frontier?: Iterable<string>,
): string[] {
  if (!progression) return [];
  const roots = frontier ? [...frontier] : Object.keys(taskStatus);
  const out = new Set<string>();
  for (const id of roots) {
    if (!isFrontier(taskStatus[id])) continue;
    for (const prior of prerequisiteClosure(progression, id, taskStatus)) {
      if (!taskStatus[prior]) out.add(prior);
    }
  }
  return [...out];
}

export interface FillResult {
  taskStatus: Record<string, TaskStatus>;
  /** Quests this marked completed — for the notice, and for undo. */
  filled: string[];
}

export function fillBehind(
  progression: Progression | null,
  taskStatus: Record<string, TaskStatus>,
  frontier?: Iterable<string>,
): FillResult {
  const filled = prereqsToFill(progression, taskStatus, frontier);
  if (!filled.length) return { taskStatus, filled };
  const next = { ...taskStatus };
  for (const id of filled) next[id] = "completed";
  return { taskStatus: next, filled };
}

/** A bulk import (sync, screenshot, setup save), then the chain behind its actives. */
export function importWithFill(
  progression: Progression | null,
  current: Record<string, TaskStatus>,
  incoming: Record<string, TaskStatus>,
): FillResult {
  const merged = { ...current, ...incoming };
  const frontier = Object.keys(incoming).filter((id) => isFrontier(incoming[id]));
  return fillBehind(progression, merged, frontier);
}

/**
 * One quest set to a status. Only marking it active or pinned fills behind it;
 * completing, failing or clearing a quest never touches anything else.
 */
export function setWithFill(
  progression: Progression | null,
  current: Record<string, TaskStatus>,
  taskId: string,
  status: TaskStatus | null,
): FillResult {
  const next = { ...current };
  if (status) next[taskId] = status;
  else delete next[taskId];
  if (!isFrontier(status ?? undefined)) return { taskStatus: next, filled: [] };
  return fillBehind(progression, next, [taskId]);
}

/** not started → active → done → not started, filling behind on the step to active. */
export function cycleWithFill(
  progression: Progression | null,
  current: Record<string, TaskStatus>,
  taskId: string,
): FillResult {
  const now = current[taskId];
  const nextStatus: TaskStatus | null = !now
    ? "active"
    : now === "active" || now === "pinned"
      ? "completed"
      : null;
  return setWithFill(progression, current, taskId, nextStatus);
}

/**
 * Takes back a fill: every quest it marked completed that is still completed
 * goes back to no status. Anything changed since is left alone.
 */
export function undoFill(
  current: Record<string, TaskStatus>,
  filled: string[],
): Record<string, TaskStatus> {
  const next = { ...current };
  for (const id of filled) if (next[id] === "completed") delete next[id];
  return next;
}
