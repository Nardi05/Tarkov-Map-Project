import { useMemo } from "react";
import { useHideoutData } from "../lib/data";
import { KORD_SEASON, seasonDaysLeft, SEASON_TITLE } from "../lib/kord-season";
import { MODE_META } from "../lib/mode";
import { href, navigate, onNavClick } from "../lib/router";
import { endingById, hideoutLevels, progressFor } from "../lib/story";
import { useHideout, useStore, useStory, useTaskStatus } from "../store";
import { Icon, icons } from "./ui";

/**
 * The site's progression systems, each with its own setup and its own status.
 *
 * Tasks, story and season are tracked separately because they are separate in
 * game: trader side tasks and the story chapters advance independently, and a
 * seasonal character is a whole second wipe. Maps and the dashboard have no
 * setup of their own — they read whatever the trackers hold.
 */

export type TrackerId = "tasks" | "story" | "season" | "hideout" | "maps";

export interface Tracker {
  id: TrackerId;
  title: string;
  icon: string;
  blurb: string;
  /** What else on the site reads this tracker. */
  feeds: string;
  /** One line of where the player is, or null when nothing is tracked. */
  status: string | null;
  /** 0–1, when there is a meaningful fraction to show. */
  fraction: number | null;
  setUp: boolean;
  open: { label: string; to: string };
  /** Absent for the pages that need no walkthrough. */
  setup?: { label: string; run: () => void };
  tone?: "season";
}

export function useTrackers(): Tracker[] {
  const mode = useStore((s) => s.profile.mode);
  const setProfile = useStore((s) => s.setProfile);
  const seasonStatus = useStore((s) => s.progress.season.taskStatus);
  const lastMap = useStore((s) => s.lastMap);
  const taskStatus = useTaskStatus();
  const story = useStory();
  const hideout = useHideout();
  const stations = useHideoutData().data?.stations;

  return useMemo(() => {
    const modeLabel = MODE_META[mode].label;

    const traderIds = Object.keys(taskStatus).filter((id) => !id.startsWith("kord:"));
    const tasksDone = traderIds.filter((id) => taskStatus[id] === "completed").length;
    const tasksActive = traderIds.filter(
      (id) => taskStatus[id] === "active" || taskStatus[id] === "pinned",
    ).length;

    const line = KORD_SEASON.questline;
    const seasonDone = line.filter((q) => seasonStatus[q.id] === "completed").length;
    const seasonTracked = Object.keys(seasonStatus).length > 0;
    const days = seasonDaysLeft();

    const ending = endingById(story.target);
    const built = hideoutLevels(stations, hideout);
    const storyStats = ending ? progressFor(ending, story.ticks, story.choices, built) : null;
    const storyTicked = Object.keys(story.ticks).length;

    const levelsDone = Object.values(hideout).filter((v) => v === "completed").length;
    const levelsTotal = stations?.reduce((n, s) => n + s.levels.length, 0) ?? 0;

    return [
      {
        id: "tasks",
        title: "Tasks",
        icon: icons.tasks,
        blurb:
          "Trader side tasks. Tick what your traders have given you and it works out everything behind them.",
        feeds: "Task markers on maps, next raid, keys and items on the dashboard",
        status: traderIds.length
          ? `${tasksActive} active · ${tasksDone} done on ${modeLabel}`
          : null,
        fraction: null,
        setUp: traderIds.length > 0,
        open: { label: "Open tasks", to: href.quests() },
        setup: {
          label: traderIds.length ? "Re-run task setup" : "Set up tasks",
          run: () => navigate(href.setup()),
        },
      },
      {
        id: "story",
        title: "Story",
        icon: icons.book,
        blurb:
          "The main story chapters and the four endings. Pick an ending, record the choices you have made, and follow the path.",
        feeds: "Story steps on maps, story progress on the dashboard",
        status: ending
          ? `${ending.name} · ${storyStats!.requiredDone} of ${storyStats!.required} steps`
          : storyTicked
            ? `${storyTicked} steps ticked · no ending picked`
            : null,
        fraction: storyStats && storyStats.required ? storyStats.requiredDone / storyStats.required : null,
        setUp: Boolean(ending) || storyTicked > 0,
        open: { label: "Open story", to: ending ? href.story(ending.id) : href.story() },
        setup: {
          label: ending || storyTicked ? "Re-run story setup" : "Set up story",
          run: () => navigate(href.storySetup()),
        },
      },
      {
        id: "season",
        title: "Season",
        icon: icons.calendar,
        blurb: `${SEASON_TITLE}: the seasonal story line and battle-pass documents, on its own seasonal character.`,
        feeds: "Season quests and document spawns on maps, season summary on the dashboard",
        status: seasonTracked
          ? `${seasonDone} of ${line.length} season tasks${days > 0 ? ` · ${days} days left` : ""}`
          : null,
        fraction: seasonTracked ? seasonDone / line.length : null,
        setUp: seasonTracked,
        open: { label: "Open season", to: href.season() },
        setup: {
          label: seasonTracked ? "Re-run season setup" : "Set up season",
          run: () => {
            setProfile("mode", "season");
            navigate(href.setup());
          },
        },
        tone: "season",
      },
      {
        id: "hideout",
        title: "Hideout",
        icon: icons.home,
        blurb: "Station levels and what each upgrade still needs. Tick stations as you build them.",
        feeds: "Hideout steps in the story, hideout summary on the dashboard",
        status: levelsDone ? `${levelsDone}${levelsTotal ? ` of ${levelsTotal}` : ""} levels built` : null,
        fraction: levelsDone && levelsTotal ? levelsDone / levelsTotal : null,
        setUp: levelsDone > 0,
        open: { label: "Open hideout", to: href.hideout() },
      },
      {
        id: "maps",
        title: "Maps",
        icon: icons.map,
        blurb:
          "Every location with spawns, extracts, keys and bosses — plus markers from whichever trackers you use.",
        feeds: "Reads from tasks, story and season",
        status: lastMap ? `Last opened: ${prettyName(lastMap)}` : null,
        fraction: null,
        setUp: true,
        open: {
          label: lastMap ? `Continue ${prettyName(lastMap)}` : "Browse maps",
          to: lastMap ? href.map(lastMap) : href.maps(),
        },
      },
    ];
  }, [mode, setProfile, seasonStatus, lastMap, taskStatus, story, hideout, stations]);
}

function prettyName(slug: string): string {
  return slug
    .split("-")
    .map((w) => (w === "of" ? w : w.charAt(0).toUpperCase() + w.slice(1)))
    .join(" ");
}

/** Large cards for the landing page: what each tracker is and how to start it. */
export function TrackerCards({ only }: { only?: TrackerId[] }) {
  const trackers = useTrackers().filter((t) => !only || only.includes(t.id));
  return (
    <ul className="tracker-grid">
      {trackers.map((t) => (
        <li key={t.id} className="card tracker-card" data-tone={t.tone}>
          <div className="flex items-start gap-3">
            <span className="tracker-icon">
              <Icon path={t.icon} size={17} />
            </span>
            <div className="min-w-0 flex-1">
              <div className="flex flex-wrap items-center gap-2">
                <h3 className="text-[0.95rem] font-semibold">{t.title}</h3>
                {t.setup && (
                  <span className={t.setUp ? "chip chip-accent" : "chip"}>
                    {t.setUp ? "Tracking" : "Not set up"}
                  </span>
                )}
              </div>
              <p className="mt-1 text-meta">{t.blurb}</p>
            </div>
          </div>

          {t.status && (
            <div className="mt-3">
              <p className="text-[0.8rem] font-medium">{t.status}</p>
              {t.fraction != null && <Bar value={t.fraction} tone={t.tone} />}
            </div>
          )}

          <p className="mt-3 text-[0.7rem] faint">
            <span className="kicker mr-1.5 inline">Feeds</span>
            {t.feeds}
          </p>

          <div className="mt-auto flex flex-wrap gap-2 pt-4">
            {t.setup && !t.setUp ? (
              <>
                <button type="button" className="btn btn-primary btn-sm" onClick={t.setup.run}>
                  {t.setup.label}
                  <Icon path={icons.forward} size={14} />
                </button>
                <a className="btn btn-sm" href={t.open.to} onClick={onNavClick(t.open.to)}>
                  {t.open.label}
                </a>
              </>
            ) : (
              <>
                <a className="btn btn-primary btn-sm" href={t.open.to} onClick={onNavClick(t.open.to)}>
                  {t.open.label}
                  <Icon path={icons.forward} size={14} />
                </a>
                {t.setup && (
                  <button type="button" className="btn btn-sm" onClick={t.setup.run}>
                    {t.setup.label}
                  </button>
                )}
              </>
            )}
          </div>
        </li>
      ))}
    </ul>
  );
}

/** The dashboard's version: one row per tracker, status first. */
export function TrackerList() {
  const trackers = useTrackers().filter((t) => t.id !== "maps");
  return (
    <ul className="tracker-rows">
      {trackers.map((t) => (
        <li key={t.id} className="tracker-row" data-tone={t.tone}>
          <span className="tracker-icon">
            <Icon path={t.icon} size={15} />
          </span>
          <div className="min-w-0 flex-1">
            <a
              className="text-[0.85rem] font-semibold hover:underline"
              href={t.open.to}
              onClick={onNavClick(t.open.to)}
            >
              {t.title}
            </a>
            <p className="truncate text-[0.72rem] faint">{t.status ?? "Not set up yet"}</p>
            {t.fraction != null && <Bar value={t.fraction} tone={t.tone} />}
          </div>
          {t.setup && !t.setUp ? (
            <button type="button" className="btn btn-primary btn-sm flex-none" onClick={t.setup.run}>
              Set up
            </button>
          ) : (
            <a className="btn btn-sm flex-none" href={t.open.to} onClick={onNavClick(t.open.to)}>
              Open
            </a>
          )}
        </li>
      ))}
    </ul>
  );
}

function Bar({ value, tone }: { value: number; tone?: "season" }) {
  const pct = Math.round(Math.min(1, Math.max(0, value)) * 100);
  return (
    <span
      className="tracker-bar"
      data-tone={tone}
      role="progressbar"
      aria-valuenow={pct}
      aria-valuemin={0}
      aria-valuemax={100}
      aria-label="Progress"
    >
      <i style={{ width: `${pct}%` }} />
    </span>
  );
}
