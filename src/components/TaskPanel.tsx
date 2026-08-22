import { createElement, useMemo, useState } from "react";
import { groupQuests, type QuestGroup } from "../lib/build-layers";
import { useDebouncedInput } from "../lib/use-debounced-input";
import { displayName, visibleInMode } from "../lib/task-variant";
import { useMarkerDone, useStore, useTaskStatus } from "../store";
import type { KeyItem, MapData, TaskAvailability, TaskStatus, Vec3 } from "../types";
import TaskName from "./TaskName";
import TaskStatusControl from "./TaskStatusControl";
import { EmptyState, Icon, Tick, icons } from "./ui";

/**
 * The task board for one map.
 *
 * Everything here is declared by the player, never inferred: the list is every
 * task with objectives on this map, you tick the ones that are in your in-game
 * list, and the map draws those. Sections mirror that — each one is a state you
 * set yourself, so nothing can disagree with what the game is telling you.
 */

/** Section order. `key` is the stored status; `undefined` is "not started". */
/**
 * The panel is grouped by what state a task is in, not by trader — during a
 * raid the question is "what can I do", and the answer is a short list.
 *
 * "Available" and "Locked" come from the task graph, so they only appear once
 * it has loaded; anything the graph has never heard of falls into "Not started"
 * and behaves exactly as it did before availability existed.
 */
type SectionKey = TaskStatus | "available" | "locked" | "none";

const SECTIONS: { key: SectionKey; label: string; startsOpen: boolean }[] = [
  { key: "active", label: "Active", startsOpen: true },
  { key: "pinned", label: "Pinned", startsOpen: true },
  { key: "available", label: "Available now", startsOpen: true },
  { key: "none", label: "Not started", startsOpen: true },
  { key: "locked", label: "Locked", startsOpen: false },
  { key: "ignored", label: "Ignored", startsOpen: false },
  { key: "completed", label: "Done", startsOpen: false },
];

export default function TaskPanel({
  data,
  availability,
  onFocus,
}: {
  data: MapData;
  /** From the task graph. Empty while it loads, which is a fine default. */
  availability: Record<string, TaskAvailability>;
  onFocus: (position: Vec3) => void;
}) {
  const quest = useStore((s) => s.quest);
  const setQuestFilter = useStore((s) => s.setQuestFilter);
  const clearQuestFilters = useStore((s) => s.clearQuestFilters);
  const taskStatus = useTaskStatus();
  const markerDone = useMarkerDone();
  const cycleTaskStatus = useStore((s) => s.cycleTaskStatus);
  const setTaskStatus = useStore((s) => s.setTaskStatus);
  const toggleMarkerDone = useStore((s) => s.toggleMarkerDone);
  const layers = useStore((s) => s.layers);
  const setLayer = useStore((s) => s.setLayer);
  const mode = useStore((s) => s.profile.mode);

  /*
   * The committed term lives in the store, which is what the map filters on —
   * so an un-debounced keystroke re-filtered every marker and rebuilt the whole
   * quest layer on the canvas, per character.
   */
  const [typedSearch, setTypedSearch] = useDebouncedInput(quest.search, (v) =>
    setQuestFilter("search", v),
  );

  const [expanded, setExpanded] = useState<string | null>(null);
  /** Held here so a section that filters down to nothing keeps its state. */
  const [openSections, setOpenSections] = useState<Partial<Record<SectionKey, boolean>>>({});

  /**
   * Every task with objectives on this map, before any filtering.
   *
   * The search text is built once here rather than per row per keystroke, and
   * it includes quest item names because the map's own filter does
   * (`filterQuests`) and the search box promises "items". Without them, typing
   * an item name narrowed the pins while this list said "Nothing matches".
   */
  const allGroups = useMemo(
    () =>
      groupQuests(data, data.markers.quests, true).map((g) => ({
        ...g,
        searchText: [
          displayName(g.task.name),
          g.task.name,
          ...g.markers.map((m) => m.description),
          ...g.markers.map((m) => m.item?.name ?? ""),
        ]
          .join(" ")
          .toLowerCase(),
      })),
    [data],
  );

  const modeGroups = useMemo(
    () => allGroups.filter((g) => visibleInMode(g.task.name, mode)),
    [allGroups, mode],
  );

  /** Search / trader / Kappa narrowing. Status is handled by the sections. */
  const matching = useMemo(() => {
    const needle = quest.search.trim().toLowerCase();
    return modeGroups.filter((g) => {
      if (quest.kappaOnly && !g.task.kappaRequired) return false;
      if (quest.trader && g.task.trader?.name !== quest.trader) return false;
      if (!needle) return true;
      return g.searchText.includes(needle);
    });
  }, [modeGroups, quest.search, quest.trader, quest.kappaOnly]);

  const buckets = useMemo(() => {
    const out = new Map<SectionKey, QuestGroup[]>();
    for (const g of matching) {
      // What the player said wins; the graph only fills the silence.
      const key: SectionKey = taskStatus[g.task.id] ?? availability[g.task.id] ?? "none";
      const bucket = out.get(key);
      if (bucket) bucket.push(g);
      else out.set(key, [g]);
    }
    return out;
  }, [matching, taskStatus, availability]);

  const traders = useMemo(() => {
    const names = new Set<string>();
    for (const g of modeGroups) if (g.task.trader) names.add(g.task.trader.name);
    return [...names].sort();
  }, [modeGroups]);

  const counts = useMemo(() => {
    let active = 0;
    let done = 0;
    for (const g of modeGroups) {
      const s = taskStatus[g.task.id];
      if (s === "active") active++;
      else if (s === "completed") done++;
    }
    return { active, done };
  }, [modeGroups, taskStatus]);

  const filtersActive = !!quest.search || !!quest.trader || quest.kappaOnly || !!quest.focusTask;

  const bring = useMemo(() => {
    const names: string[] = [];
    const seen = new Set<string>();
    for (const g of matching) {
      if (taskStatus[g.task.id] !== "active" && taskStatus[g.task.id] !== "pinned") continue;
      for (const id of g.task.keys) {
        const key = data.keys[id];
        if (!key || seen.has(key.id)) continue;
        seen.add(key.id);
        names.push(key.shortName || key.name);
      }
    }
    return names;
  }, [matching, taskStatus, data.keys]);

  if (modeGroups.length === 0) {
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
            value={typedSearch}
            onChange={(e) => setTypedSearch(e.target.value)}
            aria-label="Search tasks on this map"
            data-search
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
          <Tick
            checked={quest.showAll}
            label="Show every task on the map"
            onChange={() => setQuestFilter("showAll", !quest.showAll)}
          />
          <span style={{ color: "var(--text-dim)" }}>Show every task on the map</span>
        </label>

        {/* The denominator is every task on this map, which since the panel
            started listing tasks with no coordinates is a bigger number than it
            used to be — a returning player's bar dropped with no explanation.
            Say what it counts rather than quietly changing what it means. */}
        <p className="mt-2.5 text-[0.7rem]" style={{ color: "var(--text-faint)" }}>
          <b style={{ color: "var(--accent)" }}>{counts.active} active</b> · {counts.done} of{" "}
          {modeGroups.length} tasks on {data.name} done
        </p>
        <div className="mt-1.5 h-1 overflow-hidden rounded-full" style={{ background: "var(--panel-3)" }}>
          <div
            className="h-full rounded-full transition-[width] duration-300"
            style={{
              width: `${modeGroups.length ? (counts.done / modeGroups.length) * 100 : 0}%`,
              background: "#22c55e",
            }}
          />
        </div>
      </div>

      <div className="scroll-y mt-2 min-h-0 flex-1 px-2 pb-3">
        {matching.length === 0 && (
          <EmptyState title="Nothing matches" hint="Loosen the filters above to see more tasks." />
        )}

        {bring.length > 0 && (
          <div
            className="mb-2 rounded-lg px-2.5 py-2 text-[0.7rem] leading-snug"
            style={{ background: "var(--panel-3)", color: "var(--text-dim)" }}
          >
            <p className="font-semibold" style={{ color: "var(--text)" }}>
              Bring
            </p>
            <p className="mt-0.5">{bring.join(" · ")}</p>
          </div>
        )}

        {counts.active === 0 && matching.length > 0 && !quest.showAll && (
          <p
            className="mb-2 rounded-lg px-2.5 py-2 text-[0.7rem] leading-snug"
            style={{ background: "var(--panel-3)", color: "var(--text-dim)" }}
          >
            The map is showing what you could pick up here. Tick the tasks you have actually
            accepted in game and it narrows to just those.
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
              open={openSections[section.key] ?? section.startsOpen}
              onToggle={() =>
                setOpenSections((s) => ({
                  ...s,
                  [section.key]: !(s[section.key] ?? section.startsOpen),
                }))
              }
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
                  onClear={() => setTaskStatus(group.task.id, null)}
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

/**
 * Open/closed is owned by the panel, not by this component.
 *
 * A section with nothing in it renders nothing, which used to unmount this and
 * throw away its `useState`. Filtering a long list empties and refills sections
 * constantly, so an expanded "Done" would silently collapse the moment a search
 * excluded everything in it.
 */
function Section({
  label,
  count,
  open,
  onToggle,
  children,
}: {
  label: string;
  count: number;
  open: boolean;
  onToggle: () => void;
  children: React.ReactNode;
}) {
  return (
    <section className="mb-2">
      <button
        type="button"
        className="mb-1 flex w-full items-center gap-1.5 px-1 py-1 text-left"
        aria-expanded={open}
        onClick={onToggle}
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
  onClear,
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
  onClear: () => void;
  onComplete: () => void;
  onToggleMarker: (markerId: string) => void;
  onFocus: (position: Vec3) => void;
  onIsolate: () => void;
}) {
  const { task, markers } = group;
  const centre = group.centre;
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
          {/* A task with no coordinates has nowhere to fly to, so it isn't a
              button. It used to render one anyway: focusable, keyboard
              reachable, and silently doing nothing — which on Icebreaker was
              every row on the map. */}
          {createElement(
            centre ? "button" : "div",
            centre
              ? { type: "button", onClick: () => onFocus(centre), className: "block w-full text-left" }
              : { className: "block w-full text-left" },
            <>
              <span className="block truncate text-[0.8125rem] font-medium leading-tight">
                <TaskName name={task.name} />
              </span>
              <span
                className="mt-0.5 flex flex-wrap items-center gap-x-1.5 gap-y-0.5 text-[0.68rem]"
                style={{ color: "var(--text-faint)" }}
              >
                {task.trader && <span>{task.trader.name}</span>}
                {task.minPlayerLevel > 0 && <span>· Lv {task.minPlayerLevel}</span>}
                {markers.length === 0 ? (
                  <span title="This task is on this map, but the game data carries no position for its objectives — kill counts, extract-from-here and survival tasks usually have none.">
                    {/* Named for the consequence, not the data: "not pinned"
                        left people wondering why ticking changed nothing. */}
                    · <span title="This task is done on this map, but the game data has no coordinates for its objectives, so there is nothing to draw.">no map location</span>
                  </span>
                ) : markers.length > 1 ? (
                  <span>
                    · {doneHere}/{markers.length} locations
                  </span>
                ) : (
                  <span>· 1 location</span>
                )}
                {task.kappaRequired && <span className="chip chip-accent">Kappa</span>}
                {task.factionName && <span className="chip">{task.factionName}</span>}
              </span>
            </>,
          )}

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
                      <Tick
                        checked={done}
                        label={`Location ${i + 1}${done ? ", done" : ""}`}
                        onChange={() => onToggleMarker(marker.id)}
                      />
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
          {/* Straight back to not started. The status control is a cycle, so
              undoing a mis-tap otherwise means passing through "done" and
              writing progress the player never made. */}
          {status && (
            <button
              type="button"
              className="btn btn-icon"
              style={{ width: "1.7rem", height: "1.7rem", padding: 0 }}
              title={`Move "${task.name}" back to not started`}
              aria-label={`Move ${task.name} back to not started`}
              onClick={onClear}
            >
              <Icon path={icons.reset} size={13} />
            </button>
          )}
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
          {/* Isolating a task with no pins leaves "Showing only <task>" hanging
              over an empty map, so the control isn't offered. */}
          {centre && (
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
          )}
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
