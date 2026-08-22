import { useMemo } from "react";
import { useItemCatalog, useProgression, useTaskImages } from "../lib/data";
import { prerequisiteClosure, unlocksAfter } from "../lib/progression";
import { displayName } from "../lib/task-variant";
import {
  useItemCounts,
  useStore,
  useTaskStatus,
} from "../store";
import type { TaskStatus } from "../types";
import TaskGallery from "./TaskGallery";
import TaskName from "./TaskName";
import TaskStatusControl from "./TaskStatusControl";
import { Icon, icons } from "./ui";

export default function TaskSheet({
  taskId,
  onClose,
}: {
  taskId: string;
  onClose: () => void;
}) {
  const progression = useProgression();
  const catalog = useItemCatalog();
  const task = progression.data?.tasks[taskId];
  const taskStatus = useTaskStatus();
  const itemCounts = useItemCounts();
  const setTaskStatus = useStore((s) => s.setTaskStatus);
  const cycleTaskStatus = useStore((s) => s.cycleTaskStatus);
  const completeWithPrereqs = useStore((s) => s.completeWithPrereqs);
  const bumpItemCount = useStore((s) => s.bumpItemCount);
  const images = useTaskImages(taskId);
  const status = taskStatus[taskId];

  const prereqs = useMemo(
    () => (progression.data ? prerequisiteClosure(progression.data, taskId, taskStatus) : []),
    [progression.data, taskId, taskStatus],
  );
  const unlocks = useMemo(
    () => (progression.data ? unlocksAfter(progression.data, taskId) : []),
    [progression.data, taskId],
  );

  if (!task) return null;

  const set = (next: TaskStatus | null) => setTaskStatus(taskId, next);

  return (
    <div className="fixed inset-0 z-40 grid place-items-end sm:place-items-center" role="dialog" aria-modal="true">
      <button type="button" className="absolute inset-0 bg-black/50" aria-label="Close" onClick={onClose} />
      <div className="surface relative z-10 max-h-[90vh] w-full max-w-lg overflow-auto p-4 sm:rounded-2xl">
        <header className="mb-3 flex items-start justify-between gap-3">
          <div className="min-w-0">
            <h2 className="text-lg font-semibold leading-snug">
              <TaskName name={task.name} />
            </h2>
            <p className="mt-1 text-[0.75rem]" style={{ color: "var(--text-faint)" }}>
              {[task.trader, task.minPlayerLevel > 1 ? `lvl ${task.minPlayerLevel}` : null]
                .filter(Boolean)
                .join(" · ")}
            </p>
          </div>
          <div className="flex items-center gap-2">
            <TaskStatusControl status={status} name={displayName(task.name)} onCycle={() => cycleTaskStatus(taskId)} />
            <button type="button" className="btn btn-ghost btn-icon" onClick={onClose} aria-label="Close">
              <Icon path={icons.close} size={16} />
            </button>
          </div>
        </header>

        <div className="mb-3 flex flex-wrap gap-1.5">
          <button type="button" className="chip chip-button" onClick={() => set("active")}>
            Active
          </button>
          <button type="button" className="chip chip-button" onClick={() => set("completed")}>
            Done
          </button>
          <button
            type="button"
            className="chip chip-button"
            onClick={() => completeWithPrereqs(taskId, prereqs)}
          >
            Done + prereqs
          </button>
          <button type="button" className="chip chip-button" onClick={() => set("pinned")}>
            Pin
          </button>
          <button type="button" className="chip chip-button" onClick={() => set("ignored")}>
            Ignore
          </button>
          <button type="button" className="chip chip-button" onClick={() => set(null)}>
            Reset
          </button>
        </div>

        {task.needs.length > 0 && (
          <ul className="mb-3 space-y-1">
            {task.needs.map((need) => {
              const itemId = need.items[0];
              const have = need.items.length
                ? Math.max(0, ...need.items.map((id) => itemCounts[id] ?? 0))
                : 0;
              const item = itemId ? catalog.data?.items[itemId] : null;
              return (
                <li key={need.name} className="surface-2 flex items-center gap-2 p-2">
                  {need.icon && <img src={need.icon} alt="" width={28} height={28} className="rounded" />}
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-sm">{need.name}</p>
                    <p className="text-[0.7rem]" style={{ color: "var(--text-faint)" }}>
                      {need.foundInRaid ? "Found in raid" : "Hand-in"}
                      {item?.craftableStations.length ? ` · craft: ${item.craftableStations.join(", ")}` : ""}
                    </p>
                  </div>
                  {itemId && (
                    <div className="flex items-center gap-1">
                      <button
                        type="button"
                        className="btn btn-ghost"
                        aria-label={`Remove one ${need.name}`}
                        onClick={() => bumpItemCount(itemId, -1)}
                      >
                        −
                      </button>
                      <span className="tabular-nums text-sm">
                        {have}/{need.count}
                      </span>
                      <button
                        type="button"
                        className="btn btn-ghost"
                        aria-label={`Add one ${need.name}`}
                        onClick={() => bumpItemCount(itemId, 1)}
                      >
                        +
                      </button>
                    </div>
                  )}
                </li>
              );
            })}
          </ul>
        )}

        {unlocks.length > 0 && progression.data && (
          <p className="mb-2 text-[0.75rem]" style={{ color: "var(--text-faint)" }}>
            Unlocks: {unlocks.slice(0, 6).map((id) => displayName(progression.data!.tasks[id]?.name ?? id)).join(", ")}
          </p>
        )}

        {task.wiki && (
          <a className="text-sm underline" href={task.wiki} target="_blank" rel="noreferrer noopener">
            Wiki
          </a>
        )}

        {images.length > 0 && (
          <div className="mt-3">
            <TaskGallery images={images} taskName={displayName(task.name)} />
          </div>
        )}
      </div>
    </div>
  );
}
