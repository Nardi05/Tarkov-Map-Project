import { useMemo, useState } from "react";
import { objectiveLabel, type MissionKeyRow, type SideMission } from "../lib/missions";
import { prerequisiteClosure } from "../lib/progression";
import { mapLabel } from "../lib/story";
import { href, onNavClick } from "../lib/router";
import { useMarkerDone, useStore, useTaskStatus } from "../store";
import type { TaskAvailability } from "../types";
import { useMissionBoard } from "./MissionPanels";
import { Card, EmptyState, Icon, icons, Term } from "./ui";

/**
 * The side-quest tracker.
 *
 * This replaced four panels — Active, Available, Keys, Coming up — that each
 * listed the same tasks a different way and none of which said what a task
 * actually wanted. A row here is the whole quest: the objectives in the feed's
 * own words, the doors it goes through, the maps it sends you to and the
 * found-in-raid items it will ask for, all under one disclosure.
 *
 * Grouped by what you can do about it rather than by trader. "Available now"
 * and "locked behind something" are different kinds of information and a list
 * sorted by trader buries that distinction.
 */

type Group = "active" | "available" | "locked" | "done";

const GROUP_META: Record<Group, { title: string; hint: string; open: boolean }> = {
  active: {
    title: "Active",
    hint: "In your trader list right now. These are the ones your maps draw.",
    open: true,
  },
  available: {
    title: "Available now",
    hint: "Open to you at your level, with nothing left standing in the way.",
    open: true,
  },
  locked: {
    title: "Coming up",
    hint: "Locked, closest first, with what is holding each one back.",
    open: false,
  },
  done: {
    title: "Finished",
    hint: "Closed out, done or failed. Untick anything you have not actually done.",
    open: false,
  },
};

const GROUP_ORDER: Group[] = ["active", "available", "locked", "done"];

function groupOf(availability: TaskAvailability): Group {
  if (availability === "active" || availability === "pinned") return "active";
  if (availability === "available") return "available";
  if (availability === "locked") return "locked";
  return "done";
}

/** Everything a row can be searched by, lower-cased once. */
function haystack(mission: SideMission): string {
  return [
    mission.name,
    mission.trader,
    ...mission.maps,
    ...mission.objectives.map((o) => o.text),
    ...mission.keys.map((k) => k.name),
    ...mission.items.map((i) => i.name),
  ]
    .join(" ")
    .toLowerCase();
}

export default function SideQuestList({ search }: { search: string }) {
  const { missions, loading } = useMissionBoard();
  const needle = search.trim().toLowerCase();

  const grouped = useMemo(() => {
    const out: Record<Group, SideMission[]> = {
      active: [],
      available: [],
      locked: [],
      done: [],
    };
    for (const mission of missions) {
      if (needle && !haystack(mission).includes(needle)) continue;
      out[groupOf(mission.availability)].push(mission);
    }
    out.active.sort((a, b) => a.name.localeCompare(b.name));
    out.available.sort((a, b) => a.level - b.level || a.name.localeCompare(b.name));
    // Closest first: fewest things standing in the way, then cheapest.
    out.locked.sort(
      (a, b) => a.blockers.length - b.blockers.length || a.level - b.level,
    );
    out.done.sort((a, b) => a.name.localeCompare(b.name));
    return out;
  }, [missions, needle]);

  if (loading) {
    return (
      <div className="space-y-2" aria-hidden="true">
        {Array.from({ length: 6 }, (_, i) => (
          <div key={i} className="skeleton h-14" />
        ))}
      </div>
    );
  }

  const total = GROUP_ORDER.reduce((n, g) => n + grouped[g].length, 0);
  if (total === 0) {
    return (
      <Card>
        <EmptyState
          icon={icons.search}
          title={needle ? `Nothing matches “${search.trim()}”` : "No quests to show"}
          hint={
            needle
              ? "Search a quest name, a trader, a map, a key, or any word from an objective."
              : "Tick what your traders have given you and this fills in."
          }
        />
      </Card>
    );
  }

  return (
    <div className="stack">
      {GROUP_ORDER.filter((g) => grouped[g].length > 0).map((group) => (
        <GroupSection key={group} group={group} missions={grouped[group]} forced={!!needle} />
      ))}
    </div>
  );
}

function GroupSection({
  group,
  missions,
  forced,
}: {
  group: Group;
  missions: SideMission[];
  /* A search opens every group: a hit hidden inside a shut section reads as
     no result at all. */
  forced: boolean;
}) {
  const meta = GROUP_META[group];
  const [open, setOpen] = useState(meta.open);
  const shown = forced || open;

  return (
    <section className="card card-tight">
      <button
        type="button"
        className="flex w-full items-start gap-2 text-left"
        aria-expanded={shown}
        onClick={() => setOpen((v) => !v)}
      >
        <span
          className="mt-0.5 flex-none faint transition-transform"
          style={{ transform: shown ? undefined : "rotate(-90deg)" }}
        >
          <Icon path={icons.chevron} size={16} />
        </span>
        <span className="min-w-0 flex-1">
          <span className="flex items-baseline gap-2">
            <span className="card-title">{meta.title}</span>
            <span className="chip flex-none tabular-nums">{missions.length}</span>
          </span>
          <span className="card-sub block">{meta.hint}</span>
        </span>
      </button>

      {shown && (
        <ul className="mt-2.5 space-y-1.5">
          {missions.map((mission) => (
            <li key={mission.id}>
              <MissionCard mission={mission} />
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}

function MissionCard({ mission }: { mission: SideMission }) {
  const [open, setOpen] = useState(false);
  const cycleTaskStatus = useStore((s) => s.cycleTaskStatus);

  const firCount = mission.items.filter((i) => i.foundInRaid).length;
  const ticked = mission.availability === "active" || mission.availability === "pinned";

  return (
    <div className="surface-2 p-2.5">
      <div className="flex items-start gap-2.5">
        <button
          type="button"
          className="tick tap-target mt-0.5"
          data-on={ticked}
          aria-label={`Mark ${mission.name} active or done`}
          title="Not started → active → done"
          onClick={() => cycleTaskStatus(mission.id)}
        >
          <Icon path={icons.check} size={11} />
        </button>

        <button
          type="button"
          className="min-w-0 flex-1 text-left"
          aria-expanded={open}
          onClick={() => setOpen((v) => !v)}
        >
          <span className="flex flex-wrap items-baseline gap-x-2 gap-y-1">
            <span className="text-[0.875rem] font-medium">{mission.name}</span>
            <span className="text-[0.68rem] faint">
              {mission.trader}
              {mission.level > 1 ? ` · lvl ${mission.level}` : ""}
            </span>
            {mission.kappa && (
              <span className="badge" title="Counts toward the Kappa container">
                Kappa
              </span>
            )}
            {mission.faction && <span className="badge">{mission.faction}</span>}
          </span>

          <span className="mt-1.5 flex flex-wrap items-center gap-1">
            {mission.objectives.length > 0 && (
              <span className="chip">
                {mission.objectives.length} objective{mission.objectives.length === 1 ? "" : "s"}
              </span>
            )}
            {mission.maps.slice(0, 3).map((map) => (
              <span key={map} className="chip">
                <Icon path={icons.map} size={11} />
                {mapLabel(map)}
              </span>
            ))}
            {mission.keys.length > 0 && (
              <span className="chip">
                <Icon path={icons.pin} size={11} />
                {mission.keys.length} key{mission.keys.length === 1 ? "" : "s"}
              </span>
            )}
            {firCount > 0 && <span className="chip chip-accent">{firCount} FIR</span>}
          </span>
        </button>

        <span
          className="mt-0.5 flex-none faint transition-transform"
          style={{ transform: open ? "rotate(180deg)" : undefined }}
          aria-hidden="true"
        >
          <Icon path={icons.chevron} size={15} />
        </span>
      </div>

      {open && <MissionDetail mission={mission} />}
    </div>
  );
}

/**
 * The guide half of a row.
 *
 * Everything here is read out of the feed rather than written by hand — the
 * objective sentences, the key each one goes through, the maps. A tracker that
 * only said "Chumming" and a tick box was asking people to keep the wiki open
 * in another tab, which is the thing this site exists not to need.
 */
function MissionDetail({ mission }: { mission: SideMission }) {
  const markerDone = useMarkerDone();
  const toggleMarkerDone = useStore((s) => s.toggleMarkerDone);
  const setKeyOwned = useStore((s) => s.setKeyOwned);
  const bumpItemCount = useStore((s) => s.bumpItemCount);
  const completeWithPrereqs = useStore((s) => s.completeWithPrereqs);
  const { progression } = useMissionBoard();
  const taskStatus = useTaskStatus();

  return (
    <div className="mt-2.5 border-t pt-2.5" style={{ borderColor: "var(--line-soft)" }}>
      {/* ------------------------------------------------------- objectives */}
      {mission.objectives.length > 0 && (
        <>
          <p className="kicker mb-1.5">What it asks for</p>
          <ul className="space-y-1">
            {mission.objectives.map((objective) => {
              /*
               * Objective ticks share the marker-done record. The two id
               * namespaces cannot collide — a marker id is
               * `<objectiveId>-<map>-<x>_<y>` — and they mean the same thing to
               * a player, so ticking a location on the map and ticking it here
               * should not be two separate memories.
               */
              const done = !!markerDone[objective.id];
              return (
                <li key={objective.id} className="flex items-start gap-2">
                  <button
                    type="button"
                    className="tick tap-target mt-0.5"
                    data-on={done}
                    aria-label={`Tick: ${objective.text}`}
                    onClick={() => toggleMarkerDone(objective.id)}
                  >
                    <Icon path={icons.check} size={11} />
                  </button>
                  <span
                    className="min-w-0 flex-1 text-[0.8rem] leading-snug"
                    style={done ? { opacity: 0.55, textDecoration: "line-through" } : undefined}
                  >
                    <span className="badge mr-1.5">{objectiveLabel(objective.type)}</span>
                    {objective.text}
                    {objective.count && objective.count > 1 && (
                      <span className="faint"> ×{objective.count}</span>
                    )}
                    {objective.optional && <span className="badge ml-1.5">Optional</span>}
                    {(objective.maps ?? []).map((map) => (
                      <a
                        key={map}
                        className="chip chip-button ml-1.5"
                        href={href.map(map, mission.id)}
                        onClick={onNavClick(href.map(map, mission.id))}
                        title={`Show this on ${mapLabel(map)}`}
                      >
                        <Icon path={icons.map} size={11} />
                        {mapLabel(map)}
                      </a>
                    ))}
                  </span>
                </li>
              );
            })}
          </ul>
        </>
      )}

      {/* ------------------------------------------------------------- keys */}
      {mission.keys.length > 0 && (
        <>
          <p className="kicker mb-1.5 mt-3">Doors it goes through</p>
          <ul className="grid grid-cols-1 gap-1 sm:grid-cols-2">
            {mission.keys.map((key) => (
              <KeyLine
                key={key.id ?? key.name}
                row={key}
                onOwn={(owned) => key.id && setKeyOwned(key.id, owned)}
              />
            ))}
          </ul>
        </>
      )}

      {/* ------------------------------------------------------------ items */}
      {mission.items.length > 0 && (
        <>
          <p className="kicker mb-1.5 mt-3">
            What to bring back
          </p>
          <ul className="grid grid-cols-1 gap-1 sm:grid-cols-2">
            {mission.items.map((item) => (
              <li
                key={item.itemId || item.name}
                className="flex items-center gap-2 rounded-[var(--r-xs)] px-1.5 py-1"
                style={{ background: "var(--panel)" }}
              >
                {item.icon ? (
                  <img
                    src={item.icon}
                    alt=""
                    width={24}
                    height={24}
                    loading="lazy"
                    className="flex-none rounded"
                    onError={(e) => {
                      e.currentTarget.style.visibility = "hidden";
                    }}
                  />
                ) : (
                  <span
                    className="h-6 w-6 flex-none rounded"
                    style={{ background: "var(--panel-3)" }}
                  />
                )}
                <span className="min-w-0 flex-1 truncate text-[0.78rem]">
                  {item.name}
                  {item.foundInRaid && <span className="badge badge-accent ml-1.5">FIR</span>}
                </span>
                <button
                  type="button"
                  className="btn btn-ghost btn-icon flex-none"
                  aria-label={`Remove one ${item.name}`}
                  onClick={() => item.itemId && bumpItemCount(item.itemId, -1)}
                >
                  <Icon path={icons.minus} size={13} />
                </button>
                <span
                  className="w-11 flex-none text-center text-[0.75rem] tabular-nums"
                  style={{ color: item.remaining === 0 ? "var(--ok)" : undefined }}
                >
                  {item.have}/{item.need}
                </span>
                <button
                  type="button"
                  className="btn btn-ghost btn-icon flex-none"
                  aria-label={`Add one ${item.name}`}
                  onClick={() => item.itemId && bumpItemCount(item.itemId, 1)}
                >
                  <Icon path={icons.plus} size={13} />
                </button>
              </li>
            ))}
          </ul>
        </>
      )}

      {/* --------------------------------------------------------- blockers */}
      {mission.blockers.length > 0 && (
        <>
          <p className="kicker mb-1.5 mt-3">Held back by</p>
          <ul className="flex flex-wrap gap-1">
            {mission.blockers.map((blocker, i) => (
              <li key={i} className="chip">
                {blocker.label}
              </li>
            ))}
          </ul>
        </>
      )}

      {/* ---------------------------------------------------------- unlocks */}
      {mission.unlocks.length > 0 && (
        <>
          <p className="kicker mb-1.5 mt-3">Finishing it opens</p>
          <ul className="flex flex-wrap gap-1">
            {mission.unlocks.map((next) => (
              <li key={next.id} className="chip">
                {next.name}
              </li>
            ))}
          </ul>
        </>
      )}

      {/* ---------------------------------------------------------- actions */}
      <div className="mt-3 flex flex-wrap gap-1.5">
        {mission.maps.map((map) => (
          <a
            key={map}
            className="btn btn-sm"
            href={href.map(map, mission.id)}
            onClick={onNavClick(href.map(map, mission.id))}
          >
            <Icon path={icons.map} size={13} />
            Open {mapLabel(map)}
          </a>
        ))}
        {mission.availability !== "completed" && (
          <button
            type="button"
            className="btn btn-sm"
            title="Marks this and every task behind it as done"
            onClick={() =>
              /*
               * Finishing a task means everything it required is finished too —
               * a trader does not hand you one out of order. Passing the
               * closure is what makes one tick reconstruct a whole chain,
               * which is the same trick the setup walkthrough runs on.
               */
              completeWithPrereqs(
                mission.id,
                prerequisiteClosure(progression, mission.id, taskStatus),
              )
            }
          >
            <Icon path={icons.check} size={13} />
            Mark done
          </button>
        )}
        {mission.wiki && (
          <a className="btn btn-sm" href={mission.wiki} target="_blank" rel="noreferrer noopener">
            <Icon path={icons.external} size={13} />
            Wiki
          </a>
        )}
      </div>
    </div>
  );
}

function KeyLine({ row, onOwn }: { row: MissionKeyRow; onOwn: (owned: boolean) => void }) {
  return (
    <li
      className="flex items-center gap-2 rounded-[var(--r-xs)] px-1.5 py-1"
      style={{ background: "var(--panel)" }}
    >
      {row.icon ? (
        <img
          src={row.icon}
          alt=""
          width={24}
          height={24}
          loading="lazy"
          className="flex-none rounded"
          onError={(e) => {
            e.currentTarget.style.visibility = "hidden";
          }}
        />
      ) : (
        <span className="h-6 w-6 flex-none rounded" style={{ background: "var(--panel-3)" }} />
      )}
      <span className="min-w-0 flex-1">
        <span className="block truncate text-[0.78rem]">{row.name}</span>
        {row.maps.length > 0 && (
          <span className="block truncate text-[0.66rem] faint">
            {row.maps.map(mapLabel).join(", ")}
          </span>
        )}
      </span>
      {row.wiki && (
        <a
          className="btn btn-ghost btn-icon flex-none"
          href={row.wiki}
          target="_blank"
          rel="noreferrer noopener"
          aria-label={`${row.name} on the wiki`}
        >
          <Icon path={icons.external} size={12} />
        </a>
      )}
      {row.id && (
        <button
          type="button"
          className="tick tap-target flex-none"
          data-on={row.owned}
          aria-label={`${row.owned ? "Remove" : "Mark"} ${row.name} as owned`}
          title={row.owned ? "You have this key" : "Mark as owned"}
          onClick={() => onOwn(!row.owned)}
        >
          <Icon path={icons.check} size={11} />
        </button>
      )}
    </li>
  );
}

/**
 * Shown once above the list, so the vocabulary is explained before it is used.
 *
 * A fragment, not a `<p>`: it is passed as a section hint, which is already a
 * paragraph, and a nested one is invalid HTML that React warns about.
 */
export function SideQuestLegend() {
  return (
    <>
      Every trader task for this character. Open one for what it asks, the doors it goes through,
      and the <Term id="fir">found-in-raid</Term> items it wants back. Ticking an objective here is
      the same tick as ticking it on the map.
    </>
  );
}
