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
import { EmptyState, Tick } from "./ui";

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
      <div className="mb-3 flex flex-wrap items-center gap-3">
        <Tick
          checked={allTasks}
          label="Show every task"
          onChange={() => setAllTasks((v) => !v)}
        />
        <Tick checked={showCompleted} label="Show finished" onChange={() => setShowCompleted((v) => !v)} />
        <p className="text-[0.75rem]" style={{ color: "var(--text-faint)" }}>
          {plan.targetName ? `Aimed at ${plan.targetName}` : "No target — showing what is currently doable."}
        </p>
      </div>
      <div className="flex gap-3 overflow-x-auto pb-4">
        {columns.map(([depth, ids]) => (
          <section key={depth} className="w-56 flex-none">
            <h3 className="eyebrow mb-2" style={{ color: "var(--text-faint)" }}>
              {depth === 0 ? "Start" : `Hop ${depth}`}
            </h3>
            <ul className="space-y-1.5">
              {ids.map((id) => {
                const task = progression.data!.tasks[id];
                const state = availability[id];
                return (
                  <li key={id}>
                    <button
                      type="button"
                      className="surface-2 flex w-full items-start gap-2 p-2 text-left"
                      style={{ borderLeft: `3px solid ${color(state)}` }}
                      onClick={() => setOpenId(id)}
                    >
                      <TaskStatusControl
                        status={taskStatus[id]}
                        name={displayName(task.name)}
                        size={16}
                        onCycle={() => cycleTaskStatus(id)}
                      />
                      <span className="min-w-0 flex-1 text-[0.78rem] leading-snug">
                        <TaskName name={task.name} />
                      </span>
                    </button>
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
