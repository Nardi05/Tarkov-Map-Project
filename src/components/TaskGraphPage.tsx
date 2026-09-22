import { useMemo, useState } from "react";
import { useProgression } from "../lib/data";
import { buildPlan, targetTree } from "../lib/plan";
import { chainDepth, computeAvailability } from "../lib/progression";
import { displayName, visibleInMode } from "../lib/task-variant";
import { useStore, useTaskStatus } from "../store";
import type { TaskAvailability } from "../types";
import TaskName from "./TaskName";
import TaskSheet from "./TaskSheet";
import TaskStatusControl from "./TaskStatusControl";
import { Card, EmptyState } from "./ui";

export default function TaskGraphPage() {
  const progression = useProgression();
  const profile = useStore((s) => s.profile);
  const taskStatus = useTaskStatus();
  const cycleTaskStatus = useStore((s) => s.cycleTaskStatus);
  const [allTasks, setAllTasks] = useState(false);
  const [showCompleted, setShowCompleted] = useState(false);
  const [openId, setOpenId] = useState<string | null>(null);

  const plan = useMemo(
    () => buildPlan(progression.data, taskStatus, profile),
    [progression.data, taskStatus, profile],
  );
  const availability = useMemo(
    () => computeAvailability(progression.data, taskStatus, profile),
    [progression.data, taskStatus, profile],
  );
  const tree = useMemo(
    () => targetTree(progression.data, profile.targetTaskId),
    [progression.data, profile.targetTaskId],
  );

  const columns = useMemo(() => {
    if (!progression.data) return [];
    const ids = allTasks
      ? Object.keys(progression.data.tasks).filter((id) =>
          visibleInMode(progression.data!.tasks[id].name, profile.mode),
        )
      : tree.size
        ? [...tree]
        : plan.current.concat(plan.high);
    const byDepth = new Map<number, string[]>();
    for (const id of ids) {
      const state = availability[id];
      if (!showCompleted && (state === "completed" || state === "failed" || state === "ignored")) continue;
      const depth = Math.min(12, chainDepth(progression.data, id));
      const list = byDepth.get(depth) ?? [];
      list.push(id);
      byDepth.set(depth, list);
    }
    return [...byDepth.entries()].sort((a, b) => a[0] - b[0]);
  }, [progression.data, allTasks, tree, plan, availability, showCompleted, profile.mode]);

  if (!progression.data) {
    return <EmptyState title="Loading graph" hint="The task graph has not loaded yet." />;
  }

  const color = (state: TaskAvailability | undefined) => {
    if (state === "completed") return "var(--ok)";
    if (state === "active" || state === "pinned") return "var(--accent)";
    if (state === "failed") return "var(--danger)";
    if (state === "ignored") return "var(--text-faint)";
    if (state === "locked") return "var(--line)";
    return "var(--text-dim)";
  };

  return (
    <div>
      {/*
        * The two filters used to be bare tick boxes with nothing beside them —
        * an accessible name and a tooltip, and on screen two unlabelled
        * squares that nobody could be expected to guess at.
        */}
      <Card
        title="What unlocks what"
        hint={
          <>
            Each column is one step further down the chain: the first holds tasks with nothing
            behind them, and finishing everything in a column opens the next.{" "}
            {plan.targetName
              ? `Narrowed to the path toward ${plan.targetName}.`
              : "No target set, so this is everything currently doable."}
          </>
        }
        action={
          <div className="flex flex-wrap items-center gap-2">
            <button
              type="button"
              className={allTasks ? "btn btn-sm is-active" : "btn btn-sm"}
              aria-pressed={allTasks}
              onClick={() => setAllTasks((v) => !v)}
            >
              Every task
            </button>
            <button
              type="button"
              className={showCompleted ? "btn btn-sm is-active" : "btn btn-sm"}
              aria-pressed={showCompleted}
              onClick={() => setShowCompleted((v) => !v)}
            >
              Show finished
            </button>
          </div>
        }
      />

      <div className="scroll-y mt-4 flex gap-3 overflow-x-auto pb-4">
        {columns.map(([depth, ids]) => (
          <section key={depth} className="w-56 flex-none">
            <h3 className="kicker mb-2">
              {depth === 0 ? "Open now" : depth === 1 ? "One task away" : `${depth} tasks away`}
              <span className="ml-1.5 font-normal normal-case tracking-normal">({ids.length})</span>
            </h3>
            <ul className="space-y-1.5">
              {ids.map((id) => {
                const task = progression.data!.tasks[id];
                const state = availability[id];
                return (
                  <li key={id}>
                    <div
                      className="surface-2 flex w-full items-start gap-2 p-2"
                      style={{ borderLeft: `3px solid ${color(state)}` }}
                    >
                      <TaskStatusControl
                        status={taskStatus[id]}
                        name={displayName(task.name)}
                        size={16}
                        onCycle={() => cycleTaskStatus(id)}
                      />
                      <button
                        type="button"
                        className="min-w-0 flex-1 text-left text-[0.78rem] leading-snug"
                        onClick={() => setOpenId(id)}
                      >
                        <TaskName name={task.name} />
                      </button>
                    </div>
                  </li>
                );
              })}
            </ul>
          </section>
        ))}
      </div>
      {openId && <TaskSheet taskId={openId} onClose={() => setOpenId(null)} />}
    </div>
  );
}
