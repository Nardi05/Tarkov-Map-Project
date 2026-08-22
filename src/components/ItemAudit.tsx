import { useEffect, useMemo, useState } from "react";
import { useItemCatalog, useProgression } from "../lib/data";
import { targetTree } from "../lib/plan";
import { computeAvailability } from "../lib/progression";
import { collectTaskItems, type TaskItemRow } from "../lib/quest-lists";
import { href, navigate } from "../lib/router";
import { prettyMapName } from "../lib/kord-season";
import { visibleInMode } from "../lib/task-variant";
import { useDebouncedInput } from "../lib/use-debounced-input";
import { useItemCounts, useStore, useTaskStatus } from "../store";
import type { TaskAvailability } from "../types";
import SavePanel from "./SavePanel";
import TaskName from "./TaskName";
import { EmptyState, Tick } from "./ui";

/**
 * Kappa's task item list: every hand-in, which quest wants it, FIR or not,
 * and how many you still need from stash. The audit grid is the same data
 * laid out like a stash walk.
 */

export default function ItemAudit() {
  const progression = useProgression();
  const catalog = useItemCatalog();
  const profile = useStore((s) => s.profile);
  const taskStatus = useTaskStatus();
  const itemCounts = useItemCounts();
  const bumpItemCount = useStore((s) => s.bumpItemCount);
  const [audit, setAudit] = useState(false);
  const [firOnly, setFirOnly] = useState(false);
  const [targetOnly, setTargetOnly] = useState(!!profile.targetTaskId);

  useEffect(() => {
    if (profile.targetTaskId) setTargetOnly(true);
  }, [profile.targetTaskId]);
  const [hideFinished, setHideFinished] = useState(true);
  const [trader, setTrader] = useState<string | null>(null);
  const [query, setQuery] = useState("");
  const [typed, setTyped] = useDebouncedInput(query, setQuery);

  const availability = useMemo(
    () => computeAvailability(progression.data, taskStatus, profile),
    [progression.data, taskStatus, profile],
  );
  const tree = useMemo(
    () => targetTree(progression.data, profile.targetTaskId),
    [progression.data, profile.targetTaskId],
  );
  const allRows = useMemo(
    () => collectTaskItems(progression.data, itemCounts),
    [progression.data, itemCounts],
  );

  const traders = useMemo(() => {
    const names = new Set<string>();
    for (const row of allRows) if (row.trader) names.add(row.trader);
    return [...names].sort();
  }, [allRows]);

  const rows = useMemo(() => {
    const needle = query.trim().toLowerCase();
    return allRows.filter((row) => {
      if (!progression.data) return false;
      const task = progression.data.tasks[row.taskId];
      if (!task || !visibleInMode(task.name, profile.mode)) return false;
      if (firOnly && !row.foundInRaid) return false;
      if (targetOnly && tree.size && !tree.has(row.taskId)) return false;
      if (trader && row.trader !== trader) return false;
      const state = availability[row.taskId] ?? taskStatus[row.taskId];
      if (hideFinished && (state === "completed" || state === "failed" || state === "ignored")) {
        return false;
      }
      if (needle) {
        const hay = `${row.itemName} ${row.taskName} ${row.trader ?? ""}`.toLowerCase();
        if (!hay.includes(needle)) return false;
      }
      return true;
    });
  }, [
    allRows,
    progression.data,
    profile.mode,
    firOnly,
    targetOnly,
    tree,
    trader,
    hideFinished,
    availability,
    taskStatus,
    query,
  ]);

  const remainingFir = useMemo(() => {
    const byItem = new Map<string, { need: number; have: number }>();
    for (const row of rows) {
      if (!row.foundInRaid) continue;
      const prev = byItem.get(row.itemId) ?? { need: 0, have: row.have };
      prev.need += row.need;
      byItem.set(row.itemId, prev);
    }
    return [...byItem.values()].filter((r) => r.need > r.have).length;
  }, [rows]);

  if (!progression.data) {
    return <EmptyState title="Loading items" hint="The task graph has not loaded yet." />;
  }

  return (
    <div>
      <p className="text-sm" style={{ color: "var(--text-dim)" }}>
        Every hand-in on your remaining quests. FIR is the ones you have to extract with.
        Counts are your stash — one pile, used by hideout as well.
      </p>

      <div className="mt-3 flex flex-wrap items-center gap-2">
        <input
          className="input min-w-[12rem] flex-1"
          placeholder="Search items or quests"
          data-search
          value={typed}
          onChange={(e) => setTyped(e.target.value)}
          aria-label="Search items"
        />
        <select
          className="input"
          style={{ width: "auto", paddingRight: "1.75rem" }}
          value={trader ?? ""}
          onChange={(e) => setTrader(e.target.value || null)}
          aria-label="Filter by trader"
        >
          <option value="">All traders</option>
          {traders.map((name) => (
            <option key={name} value={name}>
              {name}
            </option>
          ))}
        </select>
        <button type="button" className="btn" aria-pressed={audit} onClick={() => setAudit((v) => !v)}>
          {audit ? "Table" : "Stash audit"}
        </button>
      </div>

      <div className="mt-2 flex flex-wrap items-center gap-x-4 gap-y-2 text-[0.75rem]" style={{ color: "var(--text-dim)" }}>
        <label className="flex items-center gap-1.5">
          <Tick checked={firOnly} label="Found in raid only" onChange={() => setFirOnly((v) => !v)} />
          Found in raid only
        </label>
        <label className="flex items-center gap-1.5">
          <Tick
            checked={hideFinished}
            label="Hide finished quests"
            onChange={() => setHideFinished((v) => !v)}
          />
          Hide finished quests
        </label>
        {profile.targetTaskId && (
          <label className="flex items-center gap-1.5">
            <Tick
              checked={targetOnly}
              label="Target path only"
              onChange={() => setTargetOnly((v) => !v)}
            />
            Target path only
          </label>
        )}
        <span className="text-[0.72rem]" style={{ color: "var(--text-faint)" }}>
          {rows.length} row{rows.length === 1 ? "" : "s"}
          {remainingFir > 0 ? ` · ${remainingFir} FIR still needed` : ""}
        </span>
      </div>

      {rows.length === 0 ? (
        <div className="mt-4">
          <EmptyState
            title="Nothing to track"
            hint="Either those quests are done, or the filters are hiding the rest."
          />
        </div>
      ) : audit ? (
        <AuditGrid rows={rows} catalog={catalog.data?.items ?? {}} onBump={bumpItemCount} />
      ) : (
        <ItemTable
          rows={rows}
          availability={availability}
          catalog={catalog.data?.items ?? {}}
          onBump={bumpItemCount}
        />
      )}

      <SavePanel />
    </div>
  );
}

function ItemTable({
  rows,
  availability,
  catalog,
  onBump,
}: {
  rows: TaskItemRow[];
  availability: Record<string, TaskAvailability>;
  catalog: Record<string, { craftableStations: string[] }>;
  onBump: (id: string, delta: number) => void;
}) {
  return (
    <ul className="mt-3 space-y-1">
      {rows.map((row) => {
        const state = availability[row.taskId];
        const craft = catalog[row.itemId]?.craftableStations ?? [];
        return (
          <li key={row.key} className="surface-2 flex flex-wrap items-center gap-2 p-2 sm:flex-nowrap">
            {row.icon && (
              <img src={row.icon} alt="" width={32} height={32} className="flex-none rounded" />
            )}
            <div className="min-w-0 flex-1">
              <p className="flex flex-wrap items-baseline gap-1.5 text-sm font-medium">
                <span className="truncate">{row.itemName}</span>
                {row.foundInRaid ? (
                  <span className="chip chip-accent" title="Must be found in raid">
                    FIR
                  </span>
                ) : (
                  <span className="chip" title="Does not need to be found in raid">
                    Any
                  </span>
                )}
              </p>
              <p className="truncate text-[0.7rem]" style={{ color: "var(--text-faint)" }}>
                <span className="tabular-nums">lvl {row.level}</span>
                {" · "}
                {row.trader ?? "Unknown"}
                {" · "}
                <button
                  type="button"
                  className="underline-offset-2 hover:underline"
                  onClick={() =>
                    row.maps[0]
                      ? navigate(href.map(row.maps[0], row.taskId))
                      : navigate(href.quests())
                  }
                >
                  <TaskName name={row.taskName} />
                </button>
                {state === "active" ? " · active" : ""}
                {craft.length ? ` · craft: ${craft.join(", ")}` : ""}
                {row.maps.length ? ` · ${row.maps.map(prettyMapName).join(", ")}` : ""}
              </p>
            </div>
            <div className="ml-auto flex items-center gap-1">
              <button
                type="button"
                className="btn btn-ghost"
                aria-label={`Remove one ${row.itemName}`}
                onClick={() => onBump(row.itemId, -1)}
              >
                −
              </button>
              <span
                className="min-w-[3.5rem] text-center tabular-nums text-sm"
                title="Have / need"
                style={{ color: row.remaining === 0 ? "var(--ok)" : undefined }}
              >
                {row.have}/{row.need}
              </span>
              <button
                type="button"
                className="btn btn-ghost"
                aria-label={`Add one ${row.itemName}`}
                onClick={() => onBump(row.itemId, 1)}
              >
                +
              </button>
            </div>
          </li>
        );
      })}
    </ul>
  );
}

function AuditGrid({
  rows,
  catalog,
  onBump,
}: {
  rows: TaskItemRow[];
  catalog: Record<string, { width?: number; height?: number }>;
  onBump: (id: string, delta: number) => void;
}) {
  const unique = useMemo(() => {
    const seen = new Map<string, TaskItemRow>();
    for (const row of rows) {
      const prev = seen.get(row.itemId);
      if (!prev) seen.set(row.itemId, { ...row });
      else {
        prev.need += row.need;
        prev.remaining = Math.max(0, prev.need - prev.have);
      }
    }
    return [...seen.values()];
  }, [rows]);

  return (
    <div className="mt-3 flex flex-wrap gap-2">
      {unique.map((row) => {
        const item = catalog[row.itemId];
        const w = Math.max(1, item?.width ?? 1);
        const h = Math.max(1, item?.height ?? 1);
        return (
          <button
            key={row.itemId}
            type="button"
            className="surface-2 relative flex items-center justify-center overflow-hidden"
            style={{ width: 64 * w, height: 64 * h }}
            onClick={() => onBump(row.itemId, 1)}
            onContextMenu={(e) => {
              e.preventDefault();
              onBump(row.itemId, -1);
            }}
            title={`${row.itemName}: ${row.have}/${row.need}. Click to add, right-click to remove.`}
          >
            {row.icon && <img src={row.icon} alt="" className="h-full w-full object-contain p-1" />}
            {row.foundInRaid && (
              <span className="absolute left-1 top-1 rounded bg-black/70 px-1 text-[0.6rem]">FIR</span>
            )}
            <span
              className="absolute right-1 bottom-1 rounded bg-black/70 px-1 text-[0.7rem] tabular-nums"
              style={{ color: row.remaining === 0 ? "var(--ok)" : undefined }}
            >
              {row.have}/{row.need}
            </span>
          </button>
        );
      })}
    </div>
  );
}
