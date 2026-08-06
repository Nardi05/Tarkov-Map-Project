import { useMemo } from "react";
import { filterQuests, groupQuests, type QuestGroup } from "../lib/build-layers";
import { useStore } from "../store";
import type { MapData, Vec3 } from "../types";
import { EmptyState, Icon, icons } from "./ui";

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
  const completed = useStore((s) => s.completed);
  const toggleCompleted = useStore((s) => s.toggleCompleted);
  const layers = useStore((s) => s.layers);
  const setLayer = useStore((s) => s.setLayer);

  /** Every task on this map, ignoring filters — the denominator for progress. */
  const allGroups = useMemo(
    () => groupQuests(data, data.markers.quests),
    [data],
  );

  const groups = useMemo(
    () => groupQuests(data, filterQuests(data, quest, completed)),
    [data, quest, completed],
  );

  const traders = useMemo(() => {
    const names = new Set<string>();
    for (const g of allGroups) if (g.task.trader) names.add(g.task.trader.name);
    return [...names].sort();
  }, [allGroups]);

  const doneCount = allGroups.filter((g) => completed[g.task.id]).length;
  const filtersActive =
    !!quest.search || !!quest.trader || quest.kappaOnly || quest.hideCompleted || !!quest.focusTask;

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
          <span className="pointer-events-none absolute left-2.5 top-1/2 -translate-y-1/2" style={{ color: "var(--text-faint)" }}>
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
          <button
            type="button"
            className="btn text-[0.7rem]"
            style={{ padding: "0.22rem 0.5rem" }}
            aria-pressed={quest.hideCompleted}
            onClick={() => setQuestFilter("hideCompleted", !quest.hideCompleted)}
          >
            Hide done
          </button>
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

        {traders.length > 1 && (
          <div className="mt-2 flex flex-wrap gap-1.5">
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
          </div>
        )}

        <p className="mt-2.5 text-[0.7rem]" style={{ color: "var(--text-faint)" }}>
          {doneCount} of {allGroups.length} tasks marked done on {data.name}
          {groups.length !== allGroups.length && ` · showing ${groups.length}`}
        </p>
        <div className="mt-1.5 h-1 overflow-hidden rounded-full" style={{ background: "var(--panel-3)" }}>
          <div
            className="h-full rounded-full transition-[width] duration-300"
            style={{
              width: `${allGroups.length ? (doneCount / allGroups.length) * 100 : 0}%`,
              background: "#22c55e",
            }}
          />
        </div>
      </div>

      <ul className="scroll-y mt-2 min-h-0 flex-1 px-2 pb-3">
        {groups.length === 0 && (
          <EmptyState title="Nothing matches" hint="Loosen the filters above to see more tasks." />
        )}
        {groups.map((group) => (
          <TaskRow
            key={group.id}
            group={group}
            done={!!completed[group.task.id]}
            focused={quest.focusTask === group.task.id}
            keys={group.task.keys.map((id) => data.keys[id]).filter(Boolean)}
            onToggleDone={() => toggleCompleted(group.task.id)}
            onFocus={() => onFocus(group.centre)}
            onIsolate={() =>
              setQuestFilter("focusTask", quest.focusTask === group.task.id ? null : group.task.id)
            }
          />
        ))}
      </ul>
    </div>
  );
}

function TaskRow({
  group,
  done,
  focused,
  keys,
  onToggleDone,
  onFocus,
  onIsolate,
}: {
  group: QuestGroup;
  done: boolean;
  focused: boolean;
  keys: { id: string; name: string; shortName: string; icon: string | null }[];
  onToggleDone: () => void;
  onFocus: () => void;
  onIsolate: () => void;
}) {
  const { task, markers } = group;

  return (
    <li
      className="surface-2 mb-1.5 px-2.5 py-2"
      style={{
        opacity: done ? 0.6 : 1,
        borderColor: focused ? "var(--accent)" : undefined,
      }}
    >
      <div className="flex items-start gap-2.5">
        <button
          type="button"
          role="checkbox"
          aria-checked={done}
          aria-label={done ? `Mark ${task.name} not done` : `Mark ${task.name} done`}
          onClick={onToggleDone}
          className="mt-0.5 grid h-[1.15rem] w-[1.15rem] flex-none place-items-center rounded-md border transition-colors"
          style={{
            borderColor: done ? "#22c55e" : "var(--line)",
            background: done ? "#22c55e" : "transparent",
            color: done ? "#062b16" : "transparent",
          }}
        >
          <Icon path={icons.check} size={12} />
        </button>

        <div className="min-w-0 flex-1">
          <button type="button" onClick={onFocus} className="block w-full text-left">
            <span className="block truncate text-[0.8125rem] font-medium leading-tight">{task.name}</span>
            <span className="mt-0.5 flex flex-wrap items-center gap-x-1.5 gap-y-0.5 text-[0.68rem]" style={{ color: "var(--text-faint)" }}>
              {task.trader && <span>{task.trader.name}</span>}
              {task.minPlayerLevel > 0 && <span>· Lv {task.minPlayerLevel}</span>}
              <span>· {markers.length} marker{markers.length === 1 ? "" : "s"}</span>
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
        </div>

        <div className="flex flex-none items-center gap-1">
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
