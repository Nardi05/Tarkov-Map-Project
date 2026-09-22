import { useMemo } from "react";
import { useHideoutData, useProgression } from "../lib/data";
import {
  buildSideMissions,
  mergeItems,
  mergeKeys,
  nextStorySteps,
  objectiveLabel,
  storyChapters,
  storyKeys,
  upcomingSideMissions,
  type MissionItemRow,
  type MissionKeyRow,
  type SideMission,
} from "../lib/missions";
import { endingById, hideoutLevels, mapLabel } from "../lib/story";
import { href, onNavClick } from "../lib/router";
import {
  useHideout,
  useItemCounts,
  useKeysOwned,
  useStore,
  useStory,
  useTaskStatus,
} from "../store";
import { EmptyState, Icon, icons, Term } from "./ui";

/**
 * The dashboard's mission panels.
 *
 * All four read the same model (lib/missions) so they cannot disagree with each
 * other — the keys panel lists keys for exactly the quests the "do next" panel
 * is showing, and the find-in-raid panel lists items for exactly those. Before
 * this they were three independent queries over the task graph with three
 * slightly different ideas of what "next" meant.
 *
 * They live here rather than in DashboardPage because that file was already
 * 1,200 lines and these are the parts most likely to keep changing.
 */

/** Everything the panels need, computed once and shared. */
export function useMissionBoard() {
  const progression = useProgression();
  const taskStatus = useTaskStatus();
  const itemCounts = useItemCounts();
  const keysOwned = useKeysOwned();
  const profile = useStore((s) => s.profile);
  const story = useStory();
  const hideout = useHideout();
  const stations = useHideoutData().data?.stations;

  const built = useMemo(() => hideoutLevels(stations, hideout), [stations, hideout]);

  const missions = useMemo(
    () =>
      buildSideMissions({
        progression: progression.data,
        taskStatus,
        profile,
        itemCounts,
        keysOwned,
      }),
    [progression.data, taskStatus, profile, itemCounts, keysOwned],
  );

  const ending = endingById(story.target);

  const chapters = useMemo(
    () => (ending ? storyChapters(ending, story.ticks, story.choices, built) : []),
    [ending, story.ticks, story.choices, built],
  );

  const nextStory = useMemo(() => nextStorySteps(chapters, 5), [chapters]);

  return {
    loading: progression.loading && !progression.data,
    progression: progression.data,
    missions,
    ending,
    chapters,
    nextStory,
    keysOwned,
  };
}

/* ------------------------------------------------------- side quests: next */

export function UpcomingSidePanel({ limit = 8 }: { limit?: number }) {
  const { missions, loading } = useMissionBoard();
  const cycleTaskStatus = useStore((s) => s.cycleTaskStatus);
  const rows = useMemo(() => upcomingSideMissions(missions, limit), [missions, limit]);

  if (loading) return <PanelSkeleton rows={4} />;

  if (rows.length === 0) {
    return (
      <EmptyState
        compact
        title="Nothing open right now"
        hint="Tick the quests your traders have given you and this fills in."
        action={
          <a className="btn btn-sm" href={href.setup()} onClick={onNavClick(href.setup())}>
            Set up my progress
          </a>
        }
      />
    );
  }

  const open = missions.filter(
    (m) => m.availability === "active" || m.availability === "available" || m.availability === "pinned",
  ).length;

  return (
    <>
      <ul className="space-y-1.5">
        {rows.map((mission) => (
          <li key={mission.id}>
            <MissionRow mission={mission} onCycle={() => cycleTaskStatus(mission.id)} />
          </li>
        ))}
      </ul>
      {open > rows.length && (
        <p className="mt-2.5">
          <a className="btn btn-sm" href={href.quests()} onClick={onNavClick(href.quests())}>
            All {open} open side quests
            <Icon path={icons.forward} size={13} />
          </a>
        </p>
      )}
    </>
  );
}

/**
 * One quest, as much of it as fits: what it asks for, where, and what it needs.
 *
 * The objective sentences are the point. A row that says only "Chumming" tells
 * somebody who has not done it nothing; "Stash Golden neck chains in the
 * microwave on the 3rd floor of the dorm" tells them the whole task.
 */
function MissionRow({ mission, onCycle }: { mission: SideMission; onCycle: () => void }) {
  const first = mission.objectives[0];
  const more = Math.max(0, mission.objectives.length - 1);

  return (
    <div className="surface-2 flex items-start gap-2.5 p-2.5">
      <button
        type="button"
        className="tick tap-target mt-0.5"
        data-on={mission.availability === "active" || mission.availability === "pinned"}
        aria-label={`Mark ${mission.name} active or done`}
        title="Not started → active → done"
        onClick={onCycle}
      >
        <Icon path={icons.check} size={11} />
      </button>

      <div className="min-w-0 flex-1">
        <p className="flex flex-wrap items-baseline gap-x-2 gap-y-1">
          <a
            className="text-[0.85rem] font-medium hover:underline"
            href={href.quests("list", mission.id)}
            onClick={onNavClick(href.quests("list", mission.id))}
          >
            {mission.name}
          </a>
          <span className="text-[0.68rem] faint">
            {mission.trader}
            {mission.level > 1 ? ` · lvl ${mission.level}` : ""}
          </span>
          {mission.availability === "active" && <span className="badge badge-accent">Active</span>}
        </p>

        {first && (
          <p className="mt-1 text-meta">
            <span className="badge mr-1.5">{objectiveLabel(first.type)}</span>
            {first.text}
            {more > 0 && <span className="faint"> +{more} more</span>}
          </p>
        )}

        <p className="mt-1.5 flex flex-wrap items-center gap-1">
          {mission.maps.slice(0, 3).map((map) => (
            <a
              key={map}
              className="chip chip-button"
              href={href.map(map, mission.id)}
              onClick={onNavClick(href.map(map, mission.id))}
              title={`Open ${mapLabel(map)} with this quest shown`}
            >
              <Icon path={icons.map} size={11} />
              {mapLabel(map)}
            </a>
          ))}
          {mission.keys.length > 0 && (
            <span className="chip" title={mission.keys.map((k) => k.name).join(", ")}>
              <Icon path={icons.pin} size={11} />
              {mission.keys.length} key{mission.keys.length === 1 ? "" : "s"}
            </span>
          )}
          {mission.items.some((i) => i.foundInRaid) && (
            <span className="chip chip-accent">
              {mission.items.filter((i) => i.foundInRaid).length} FIR
            </span>
          )}
        </p>
      </div>
    </div>
  );
}

/* ------------------------------------------------------------ story: next */

export function StoryNextPanel() {
  const { ending, chapters, nextStory, loading } = useMissionBoard();
  const toggleStoryTick = useStore((s) => s.toggleStoryTick);
  const story = useStory();

  if (loading) return <PanelSkeleton rows={3} />;

  if (!ending) {
    return (
      <EmptyState
        compact
        title="No ending targeted"
        hint="Pick Savior, Survivor, Debtor or Fallen and the path appears here."
        action={
          <a className="btn btn-sm" href={href.story()} onClick={onNavClick(href.story())}>
            Choose an ending
          </a>
        }
      />
    );
  }

  const done = chapters.filter((c) => c.complete).length;

  if (nextStory.length === 0) {
    return (
      <EmptyState
        compact
        title={`${ending.name} — every step ticked`}
        hint="Nothing left on this path."
      />
    );
  }

  return (
    <>
      <p className="mb-2 flex flex-wrap items-center gap-2 text-meta">
        <span className="badge badge-accent">{ending.name}</span>
        <span className="tabular-nums">
          {done} of {chapters.length} chapters complete
        </span>
      </p>

      <ul className="space-y-1.5">
        {nextStory.map(({ step, chapter }) => (
          <li key={step.id} className="surface-2 flex items-start gap-2.5 p-2.5">
            <button
              type="button"
              className="tick tap-target mt-0.5"
              data-on={!!story.ticks[step.id]}
              aria-label={`Tick ${step.title}`}
              onClick={() => toggleStoryTick(step.id)}
            >
              <Icon path={icons.check} size={11} />
            </button>
            <div className="min-w-0 flex-1">
              <p className="flex flex-wrap items-baseline gap-x-2">
                <span className="text-[0.85rem] font-medium">{step.title}</span>
                {chapter.storyline && <span className="badge">Evidence</span>}
              </p>
              <p className="mt-0.5 text-[0.68rem] faint">
                Chapter {chapter.number} · {chapter.name}
              </p>
              {step.detail && <p className="mt-1 text-meta">{step.detail}</p>}
              <p className="mt-1.5 flex flex-wrap items-center gap-1">
                {(step.maps ?? []).slice(0, 3).map((map) => (
                  <a
                    key={map}
                    className="chip chip-button"
                    href={href.map(map)}
                    onClick={onNavClick(href.map(map))}
                  >
                    <Icon path={icons.map} size={11} />
                    {mapLabel(map)}
                  </a>
                ))}
                {step.location && <span className="chip">{step.location}</span>}
                {step.trader && <span className="chip">{step.trader}</span>}
              </p>
            </div>
          </li>
        ))}
      </ul>

      <p className="mt-2.5">
        <a
          className="btn btn-sm"
          href={href.story(ending.id)}
          onClick={onNavClick(href.story(ending.id))}
        >
          Open the full path
          <Icon path={icons.forward} size={13} />
        </a>
      </p>
    </>
  );
}

/* ------------------------------------------------------------------- keys */

/**
 * Keys for everything coming up, side quests and story together.
 *
 * Deliberately one list rather than two. You carry one keyring into a raid, and
 * a key that opens a door for a story chapter and a trader task is one key —
 * splitting the panel by which system asked for it would be organising the
 * screen around the code rather than the raid.
 */
export function KeysPanel({ limit = 12 }: { limit?: number }) {
  const { missions, chapters, progression, keysOwned, loading } = useMissionBoard();
  const setKeyOwned = useStore((s) => s.setKeyOwned);

  const rows = useMemo(() => {
    const upcoming = upcomingSideMissions(missions, 24);
    const side = mergeKeys(upcoming);
    const fromStory = storyKeys(chapters, progression, keysOwned);

    const byId = new Map<string, MissionKeyRow>();
    for (const row of [...side, ...fromStory]) {
      const id = row.id ?? row.name.toLowerCase();
      const existing = byId.get(id);
      if (!existing) {
        byId.set(id, { ...row, maps: [...row.maps], wantedBy: [...row.wantedBy] });
        continue;
      }
      for (const map of row.maps) if (!existing.maps.includes(map)) existing.maps.push(map);
      for (const ref of row.wantedBy) {
        if (!existing.wantedBy.some((w) => w.id === ref.id)) existing.wantedBy.push(ref);
      }
    }
    return [...byId.values()]
      .sort((a, b) => Number(a.owned) - Number(b.owned) || b.wantedBy.length - a.wantedBy.length)
      .slice(0, limit);
  }, [missions, chapters, progression, keysOwned, limit]);

  if (loading) return <PanelSkeleton rows={3} />;

  if (rows.length === 0) {
    return (
      <EmptyState
        compact
        title="No keys needed"
        hint="Nothing coming up goes through a locked door."
      />
    );
  }

  return (
    <ul className="space-y-1">
      {rows.map((key) => (
        <li key={key.id ?? key.name} className="surface-2 flex items-center gap-2.5 p-2">
          {key.icon ? (
            <img
              src={key.icon}
              alt=""
              width={26}
              height={26}
              loading="lazy"
              className="flex-none rounded"
              onError={(e) => {
                e.currentTarget.style.visibility = "hidden";
              }}
            />
          ) : (
            <span
              className="h-[26px] w-[26px] flex-none rounded"
              style={{ background: "var(--panel-3)" }}
            />
          )}

          <div className="min-w-0 flex-1">
            <p className="truncate text-[0.8rem] font-medium">{key.name}</p>
            <p className="truncate text-[0.68rem] faint">
              {key.maps.map(mapLabel).join(", ") || "—"}
              {key.wantedBy.length > 0 && ` · ${key.wantedBy.length} quest${key.wantedBy.length === 1 ? "" : "s"}`}
            </p>
          </div>

          {key.id && (
            <button
              type="button"
              className="tick tap-target flex-none"
              data-on={key.owned}
              aria-label={`${key.owned ? "Remove" : "Mark"} ${key.name} as owned`}
              title={key.owned ? "You have this" : "Mark as owned"}
              onClick={() => setKeyOwned(key.id!, !key.owned)}
            >
              <Icon path={icons.check} size={11} />
            </button>
          )}
        </li>
      ))}
    </ul>
  );
}

/* ------------------------------------------------------------ find in raid */

export function NeedsPanel({ limit = 18 }: { limit?: number }) {
  const { missions, loading } = useMissionBoard();
  const bumpItemCount = useStore((s) => s.bumpItemCount);

  const rows = useMemo(() => {
    const upcoming = upcomingSideMissions(missions, 24);
    return mergeItems(upcoming, true).slice(0, limit);
  }, [missions, limit]);

  if (loading) return <PanelSkeleton rows={3} />;

  if (rows.length === 0) {
    return (
      <EmptyState
        compact
        title="Nothing to find"
        hint={
          <>
            No <Term id="fir">found-in-raid</Term> items outstanding on what is coming up.
          </>
        }
      />
    );
  }

  return (
    <ul className="grid grid-cols-1 gap-1 sm:grid-cols-2">
      {rows.map((item) => (
        <ItemRow key={item.itemId} item={item} onBump={(d) => bumpItemCount(item.itemId, d)} />
      ))}
    </ul>
  );
}

function ItemRow({ item, onBump }: { item: MissionItemRow; onBump: (delta: number) => void }) {
  return (
    <li className="surface-2 flex items-center gap-2 p-1.5">
      {item.icon ? (
        <img
          src={item.icon}
          alt=""
          width={26}
          height={26}
          loading="lazy"
          className="flex-none rounded"
          onError={(e) => {
            e.currentTarget.style.visibility = "hidden";
          }}
        />
      ) : (
        <span className="h-[26px] w-[26px] flex-none rounded" style={{ background: "var(--panel-3)" }} />
      )}

      <div className="min-w-0 flex-1">
        <p className="truncate text-[0.78rem] font-medium">{item.name}</p>
        <p className="truncate text-[0.66rem] faint">
          {item.wantedBy.length} quest{item.wantedBy.length === 1 ? "" : "s"}
        </p>
      </div>

      <button
        type="button"
        className="btn btn-ghost btn-icon flex-none"
        aria-label={`Remove one ${item.name}`}
        onClick={() => onBump(-1)}
      >
        <Icon path={icons.minus} size={13} />
      </button>
      <span className="w-11 flex-none text-center text-[0.75rem] tabular-nums">
        {item.have}/{item.need}
      </span>
      <button
        type="button"
        className="btn btn-ghost btn-icon flex-none"
        aria-label={`Add one ${item.name}`}
        onClick={() => onBump(1)}
      >
        <Icon path={icons.plus} size={13} />
      </button>
    </li>
  );
}

/* ------------------------------------------------------------------ shared */

function PanelSkeleton({ rows }: { rows: number }) {
  return (
    <ul className="space-y-1.5" aria-hidden="true">
      {Array.from({ length: rows }, (_, i) => (
        <li key={i} className="skeleton h-12" />
      ))}
    </ul>
  );
}
