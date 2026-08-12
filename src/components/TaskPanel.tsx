import { useMemo, useState } from "react";
import { groupQuests, type QuestGroup } from "../lib/build-layers";
import { useStore } from "../store";
import type { KeyItem, MapData, TaskStatus, Vec3 } from "../types";
import TaskStatusControl from "./TaskStatusControl";
import { EmptyState, Icon, icons } from "./ui";

/**
 * The task board for one map.
 *
 * Everything here is declared by the player, never inferred: the list is every
 * task with objectives on this map, you tick the ones that are in your in-game
 * list, and the map draws those. Sections mirror that — each one is a state you
 * set yourself, so nothing can disagree with what the game is telling you.
 */

/** Section order. `key` is the stored status; `undefined` is "not started". */
const SECTIONS: { key: TaskStatus | "none"; label: string; startsOpen: boolean }[] = [
  { key: "active", label: "Active", startsOpen: true },
  { key: "none", label: "Not started", startsOpen: true },
  { key: "completed", label: "Done", startsOpen: false },
];

export default function TaskPanel({
  data,
  onFocus,
}: {
  data: MapData;
  onFocus: (position: Vec3) => void;
}) {
  const quest = useStore((s) => s.quest);
  const setQuestFilter = useStore((s) => s.setQuestFilter);
  const clearQuestFilters = useStore((s) => s.clearQuestFilters);
  const taskStatus = useStore((s) => s.taskStatus);
  const markerDone = useStore((s) => s.markerDone);
  const cycleTaskStatus = useStore((s) => s.cycleTaskStatus);
  const setTaskStatus = useStore((s) => s.setTaskStatus);
  const toggleMarkerDone = useStore((s) => s.toggleMarkerDone);
  const layers = useStore((s) => s.layers);
  const setLayer = useStore((s) => s.setLayer);

  const [expanded, setExpanded] = useState<string | null>(null);

  /** Every task with objectives on this map, before any filtering. */
  const allGroups = useMemo(() => groupQuests(data, data.markers.quests), [data]);

  /** Search / trader / Kappa narrowing. Status is handled by the sections. */
  const matching = useMemo(() => {
    const needle = quest.search.trim().toLowerCase();
    return allGroups.filter((g) => {
      if (quest.kappaOnly && !g.task.kappaRequired) return false;
      if (quest.trader && g.task.trader?.name !== quest.trader) return false;
      if (!needle) return true;
      const haystack = `${g.task.name} ${g.markers.map((m) => m.description).join(" ")}`.toLowerCase();
      return haystack.includes(needle);
    });
  }, [allGroups, quest.search, quest.trader, quest.kappaOnly]);

  const buckets = useMemo(() => {
    const out = new Map<TaskStatus | "none", QuestGroup[]>();
    for (const g of matching) {
      const key = taskStatus[g.task.id] ?? "none";
      const bucket = out.get(key);
      if (bucket) bucket.push(g);
      else out.set(key, [g]);
    }
    return out;
  }, [matching, taskStatus]);

  const traders = useMemo(() => {
    const names = new Set<string>();
    for (const g of allGroups) if (g.task.trader) names.add(g.task.trader.name);
    return [...names].sort();
  }, [allGroups]);

  const counts = useMemo(() => {
    let active = 0;
    let done = 0;
    for (const g of allGroups) {
      const s = taskStatus[g.task.id];
      if (s === "active") active++;
      else if (s === "completed") done++;
    }
    return { active, done };
  }, [allGroups, taskStatus]);

  const filtersActive = !!quest.search || !!quest.trader || quest.kappaOnly || !!quest.focusTask;

  if (allGroups.length === 0) {
    return (
      <EmptyState
        title="No task objectives on this map"
        hint="Nothing in the current quest data is anchored here. Try another map."
      />
    );
  }

  return (
    <div className="flex h-full flex-col">
      <div className="flex-none px-3 pt-3">
        {!layers.quests && (
          <button
            type="button"
            className="mb-2 flex w-full items-center gap-2 rounded-lg px-2.5 py-2 text-left text-xs"
            style={{ background: "color-mix(in srgb, #22c55e 14%, transparent)", color: "#7ee2a8" }}
            onClick={() => setLayer("quests", true)}
          >
            <Icon path={icons.info} size={15} />
            Quest markers are hidden. Tap to show them on the map.
          </button>
        )}

        <div className="relative">
          <span
            className="pointer-events-none absolute left-2.5 top-1/2 -translate-y-1/2"
            style={{ color: "var(--text-faint)" }}
          >
            <Icon path={icons.search} size={15} />
          </span>
          <input
            className="input input-icon"
            type="search"
            placeholder="Search tasks, objectives, items…"
            value={quest.search}
            onChange={(e) => setQuestFilter("search", e.target.value)}
          />
        </div>

        <div className="mt-2 flex flex-wrap items-center gap-1.5">
          <button
            type="button"
            className="btn text-[0.7rem]"
            style={{ padding: "0.22rem 0.5rem" }}
            aria-pressed={quest.kappaOnly}
            onClick={() => setQuestFilter("kappaOnly", !quest.kappaOnly)}
            title="Only tasks required for the Kappa secure container"
          >
            Kappa only
          </button>
          {traders.map((name) => (
            <button
              key={name}
              type="button"
              className="btn text-[0.7rem]"
              style={{ padding: "0.22rem 0.5rem" }}
              aria-pressed={quest.trader === name}
              onClick={() => setQuestFilter("trader", quest.trader === name ? null : name)}
            >
              {name}
            </button>
          ))}
          {filtersActive && (
            <button
              type="button"
              className="btn btn-ghost text-[0.7rem]"
              style={{ padding: "0.22rem 0.5rem", color: "var(--text-dim)" }}
              onClick={clearQuestFilters}
            >
              Clear
            </button>
          )}
        </div>

        {/* The one view control left: normally the map shows only what you
            ticked, which is the point — this is the escape hatch for browsing
            a map you haven't started tracking yet. */}
        <label className="mt-2 flex cursor-pointer items-center gap-2 text-[0.7rem]">
          <input
            type="checkbox"
            checked={quest.showAll}
            onChange={(e) => setQuestFilter("showAll", e.target.checked)}
          />
          <span style={{ color: "var(--text-dim)" }}>Show every task on the map</span>
        </label>

        <p className="mt-2.5 text-[0.7rem]" style={{ color: "var(--text-faint)" }}>
          <b style={{ color: "var(--accent)" }}>{counts.active} active</b> · {counts.done} done ·{" "}
          {allGroups.length} on {data.name}
        </p>
        <div className="mt-1.5 h-1 overflow-hidden rounded-full" style={{ background: "var(--panel-3)" }}>
          <div
            className="h-full rounded-full transition-[width] duration-300"
            style={{
              width: `${allGroups.length ? (counts.done / allGroups.length) * 100 : 0}%`,
              background: "#22c55e",
            }}
          />
        </div>
      </div>

      <div className="scroll-y mt-2 min-h-0 flex-1 px-2 pb-3">
        {matching.length === 0 && (
          <EmptyState title="Nothing matches" hint="Loosen the filters above to see more tasks." />
        )}

        {counts.active === 0 && matching.length > 0 && !quest.showAll && (
          <p
            className="mb-2 rounded-lg px-2.5 py-2 text-[0.7rem] leading-snug"
            style={{ background: "var(--panel-3)", color: "var(--text-dim)" }}
          >
            Tick the tasks you have accepted in game and they will appear on the map together.
          </p>
        )}

        {SECTIONS.map((section) => {
          const groups = buckets.get(section.key) ?? [];
          if (groups.length === 0) return null;
          return (
            <Section
              key={section.key}
              label={section.label}
              count={groups.length}
              startsOpen={section.startsOpen}
            >
              {groups.map((group) => (
                <TaskRow
                  key={group.id}
                  group={group}
                  status={taskStatus[group.task.id]}
                  markerDone={markerDone}
                  keys={group.task.keys.map((id) => data.keys[id]).filter(Boolean)}
                  expanded={expanded === group.id}
                  focused={quest.focusTask === group.task.id}
                  onToggleExpand={() => setExpanded(expanded === group.id ? null : group.id)}
                  onCycle={() => cycleTaskStatus(group.task.id)}
                  onComplete={() => setTaskStatus(group.task.id, "completed")}
                  onToggleMarker={toggleMarkerDone}
                  onFocus={onFocus}
                  onIsolate={() =>
                    setQuestFilter("focusTask", quest.focusTask === group.task.id ? null : group.task.id)
                  }
                />
              ))}
            </Section>
          );
        })}
      </div>
    </div>
  );
}

function Section({
  label,
  count,
  startsOpen,
  children,
}: {
  label: string;
  count: number;
  startsOpen: boolean;
  children: React.ReactNode;
}) {
  const [open, setOpen] = useState(startsOpen);
  return (
    <section className="mb-2">
      <button
        type="button"
        className="mb-1 flex w-full items-center gap-1.5 px-1 py-1 text-left"
        aria-expanded={open}
        onClick={() => setOpen(!open)}
      >
        <span
          className="transition-transform"
          style={{ color: "var(--text-faint)", transform: open ? undefined : "rotate(-90deg)" }}
        >
          <Icon path={icons.chevron} size={13} />
        </span>
        <span
          className="text-[0.68rem] font-semibold uppercase tracking-[0.09em]"
          style={{ color: "var(--text-dim)" }}
        >
          {label}
        </span>
        <span className="text-[0.65rem] tabular-nums" style={{ color: "var(--text-faint)" }}>
          {count}
        </span>
      </button>
      {open && <ul>{children}</ul>}
    </section>
  );
}

function TaskRow({
  group,
  status,
  markerDone,
  keys,
  expanded,
  focused,
  onToggleExpand,
  onCycle,
  onComplete,
  onToggleMarker,
  onFocus,
  onIsolate,
}: {
  group: QuestGroup;
  status: TaskStatus | undefined;
  markerDone: Record<string, true>;
  keys: KeyItem[];
  expanded: boolean;
  focused: boolean;
  onToggleExpand: () => void;
  onCycle: () => void;
  onComplete: () => void;
  onToggleMarker: (markerId: string) => void;
  onFocus: (position: Vec3) => void;
  onIsolate: () => void;
}) {
  const { task, markers } = group;
  const doneHere = markers.filter((m) => markerDone[m.id]).length;
  const allLocationsDone = markers.length > 0 && doneHere === markers.length;
  const sharedDescription =
    markers.length > 1 && markers.every((m) => m.description === markers[0].description)
      ? markers[0].description
      : null;
  // Pickup markers are alternative spawns for one item, not a checklist.
  const alternatives = markers.length > 1 && markers.every((m) => m.kind === "pickup");

  return (
    <li
      className="surface-2 mb-1.5 px-2.5 py-2"
      style={{
        opacity: status === "completed" ? 0.62 : 1,
        borderColor: focused ? "var(--accent)" : undefined,
      }}
    >
      <div className="flex items-start gap-2.5">
        <span className="mt-0.5">
          <TaskStatusControl status={status} name={task.name} onCycle={onCycle} />
        </span>

        <div className="min-w-0 flex-1">
          <button type="button" onClick={() => onFocus(group.centre)} className="block w-full text-left">
            <span className="block truncate text-[0.8125rem] font-medium leading-tight">{task.name}</span>
            <span
              className="mt-0.5 flex flex-wrap items-center gap-x-1.5 gap-y-0.5 text-[0.68rem]"
              style={{ color: "var(--text-faint)" }}
            >
              {task.trader && <span>{task.trader.name}</span>}
              {task.minPlayerLevel > 0 && <span>· Lv {task.minPlayerLevel}</span>}
              {markers.length > 1 ? (
                <span>
                  · {doneHere}/{markers.length} locations
                </span>
              ) : (
                <span>· 1 location</span>
              )}
              {task.kappaRequired && <span className="chip chip-accent">Kappa</span>}
              {task.factionName && <span className="chip">{task.factionName}</span>}
            </span>
          </button>

          {keys.length > 0 && (
            <p className="mt-1 flex flex-wrap items-center gap-1 text-[0.68rem]" style={{ color: "var(--text-dim)" }}>
              <span style={{ color: "var(--text-faint)" }}>Keys:</span>
              {keys.map((k) => (
                <span key={k.id} className="chip" title={k.name}>
                  {k.shortName || k.name}
                </span>
              ))}
            </p>
          )}

          {expanded && (
            <div className="mt-1.5">
              {/* When every location shares one description — the usual case for
                  an item that can spawn in several places — say it once. */}
              {sharedDescription && (
                <p className="mb-1 px-1 text-[0.68rem] leading-snug" style={{ color: "var(--text-dim)" }}>
                  {sharedDescription}
                  {alternatives && (
                    <span style={{ color: "var(--text-faint)" }}> — it is at one of these spots.</span>
                  )}
                </p>
              )}
              <ul className="flex flex-col gap-1">
                {markers.map((marker, i) => {
                  const done = !!markerDone[marker.id];
                  return (
                    <li
                      key={marker.id}
                      className="flex items-start gap-2 rounded-lg px-1.5 py-1"
                      style={{ background: "var(--panel)" }}
                    >
                      <button
                        type="button"
                        role="checkbox"
                        aria-checked={done}
                        aria-label={`Location ${i + 1}${done ? " done" : ""}`}
                        onClick={() => onToggleMarker(marker.id)}
                        className="mt-px grid h-4 w-4 flex-none place-items-center rounded border"
                        style={{
                          borderColor: done ? "#22c55e" : "var(--line)",
                          background: done ? "#22c55e" : "transparent",
                          color: done ? "#062b16" : "transparent",
                        }}
                      >
                        <Icon path={icons.check} size={10} />
                      </button>
                      <button
                        type="button"
                        className="min-w-0 flex-1 text-left text-[0.68rem] leading-snug"
                        style={{ color: done ? "var(--text-faint)" : "var(--text-dim)" }}
                        onClick={() => onFocus(marker.position)}
                      >
                        {sharedDescription ? `Location ${i + 1}` : marker.description}
                        {marker.count && marker.count > 1 ? ` (needs ${marker.count})` : ""}
                      </button>
                    </li>
                  );
                })}
              </ul>
            </div>
          )}

          {allLocationsDone && status !== "completed" && (
            <button
              type="button"
              className="mt-1.5 w-full rounded-lg px-2 py-1.5 text-left text-[0.7rem]"
              style={{ background: "color-mix(in srgb, #22c55e 14%, transparent)", color: "#7ee2a8" }}
              onClick={onComplete}
            >
              {alternatives
                ? "All spots checked — mark the whole task done?"
                : "All locations ticked — mark the whole task done?"}
            </button>
          )}
        </div>

        <div className="flex flex-none items-center gap-1">
          {markers.length > 1 && (
            <button
              type="button"
              className="btn btn-icon"
              style={{ width: "1.7rem", height: "1.7rem", padding: 0 }}
              aria-expanded={expanded}
              title={expanded ? "Hide locations" : "Show each location"}
              onClick={onToggleExpand}
            >
              <span style={{ transform: expanded ? undefined : "rotate(-90deg)", display: "block" }}>
                <Icon path={icons.chevron} size={13} />
              </span>
            </button>
          )}
          <button
            type="button"
            className="btn btn-icon"
            style={{ width: "1.7rem", height: "1.7rem", padding: 0 }}
            aria-pressed={focused}
            title={focused ? "Show all tasks again" : "Show only this task on the map"}
            onClick={onIsolate}
          >
            <Icon path={icons.target} size={14} />
          </button>
          {task.wiki && (
            <a
              className="btn btn-icon"
              style={{ width: "1.7rem", height: "1.7rem", padding: 0 }}
              href={task.wiki}
              target="_blank"
              rel="noreferrer noopener"
              title="Open the wiki page for this task"
            >
              <Icon path={icons.external} size={13} />
            </a>
          )}
        </div>
      </div>
    </li>
  );
}
