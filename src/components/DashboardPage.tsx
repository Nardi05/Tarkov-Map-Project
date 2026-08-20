import { useMemo } from "react";
import { useMapIndex, useProgression } from "../lib/data";
import { KORD_SEASON, prettyMapName, seasonDaysLeft } from "../lib/kord-season";
import { nextRaids } from "../lib/next-raid";
import {
  chainDepth,
  computeAvailability,
  unlocksAfter,
} from "../lib/progression";
import { collectKeys, collectNeeds } from "../lib/quest-lists";
import { href, navigate, onNavClick } from "../lib/router";
import { displayName, visibleInMode } from "../lib/task-variant";
import type { GameMode } from "../lib/persist-migrate";
import {
  UPCOMING_LIMITS,
  useStore,
  useTaskStatus,
  type DashPanelId,
} from "../store";
import type { Progression, TaskAvailability } from "../types";
import ModeSwitch from "./ModeSwitch";
import NextRaid from "./NextRaid";
import TaskName from "./TaskName";
import TaskStatusControl from "./TaskStatusControl";
import { EmptyState, Icon, PageChrome, icons } from "./ui";

const TRADER_ORDER = [
  "Prapor",
  "Therapist",
  "Skier",
  "Peacekeeper",
  "Mechanic",
  "Ragman",
  "Jaeger",
  "Fence",
  "Ref",
  "Lightkeeper",
  "BTR Driver",
];

const THEN_CAP = 3;

interface UpcomingRow {
  id: string;
  name: string;
  trader: string;
  level: number;
  availability: TaskAvailability;
  maps: string[];
  wiki: string | null;
  next: { id: string; name: string }[];
}

export default function DashboardPage() {
  const progression = useProgression();
  const maps = useMapIndex();
  const taskStatus = useTaskStatus();
  const profile = useStore((s) => s.profile);
  const setProfile = useStore((s) => s.setProfile);
  const dashboard = useStore((s) => s.dashboard);
  const lastMap = useStore((s) => s.lastMap);
  const moveDashPanel = useStore((s) => s.moveDashPanel);
  const setUpcomingLimit = useStore((s) => s.setUpcomingLimit);
  const cycleTaskStatus = useStore((s) => s.cycleTaskStatus);

  const data = progression.data;
  const fresh = Object.keys(taskStatus).length === 0;
  const resume = maps.data?.maps.find((m) => m.normalizedName === lastMap);

  const availability = useMemo(
    () => computeAvailability(data, taskStatus, profile),
    [data, taskStatus, profile],
  );

  const upcoming = useMemo(
    () => pickUpcoming(data, availability, profile.mode, dashboard.upcomingLimit),
    [data, availability, profile.mode, dashboard.upcomingLimit],
  );

  const upcomingIds = useMemo(() => upcoming.map((r) => r.id), [upcoming]);
  const keys = useMemo(() => collectKeys(data, upcomingIds), [data, upcomingIds]);
  const needs = useMemo(() => collectNeeds(data, upcomingIds), [data, upcomingIds]);
  const raidPicks = useMemo(
    () => nextRaids(maps.data?.maps ?? [], data, taskStatus, 3).filter((p) => p.active.length > 0),
    [maps.data, data, taskStatus],
  );

  return (
    <div className="page scroll-y h-full">
      <div className="mx-auto w-full max-w-6xl px-4 py-8 sm:px-6 sm:py-12">
        <PageChrome current="dashboard">
          <ModeSwitch value={profile.mode} onChange={(m) => setProfile("mode", m)} size="sm" />
        </PageChrome>

        <header className="mb-5 flex flex-wrap items-end justify-between gap-3">
          <div>
            <h1 className="display text-2xl sm:text-3xl">Dashboard</h1>
            <p className="mt-1.5 max-w-xl text-sm" style={{ color: "var(--text-dim)" }}>
              What to run next, the keys those tasks go through, and what to find in raid.
            </p>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            {resume && (
              <a
                className="btn is-active text-[0.75rem]"
                style={{ padding: "0.32rem 0.7rem" }}
                href={href.map(resume.normalizedName)}
                onClick={onNavClick(href.map(resume.normalizedName))}
              >
                Continue on {resume.name}
              </a>
            )}
            <label className="flex items-center gap-2 text-[0.75rem]" style={{ color: "var(--text-dim)" }}>
              Upcoming
              <select
                className="input tabular-nums"
                style={{ width: "auto", padding: "0.3rem 1.6rem 0.3rem 0.55rem" }}
                value={dashboard.upcomingLimit}
                onChange={(e) => setUpcomingLimit(Number(e.target.value))}
                aria-label="How many upcoming tasks to show"
              >
                {UPCOMING_LIMITS.map((n) => (
                  <option key={n} value={n}>
                    {n}
                  </option>
                ))}
              </select>
            </label>
          </div>
        </header>

        {progression.error && (
          <EmptyState title="The task graph could not be loaded" hint={progression.error.message} />
        )}

        {progression.loading && !data && (
          <p className="py-16 text-center text-sm" style={{ color: "var(--text-dim)" }}>
            Loading the task graph…
          </p>
        )}

        {data && fresh && (
          <section className="surface mb-3 p-4">
            <h2 className="text-sm font-semibold">Set up your progress</h2>
            <p className="mt-1 text-[0.8rem] leading-relaxed" style={{ color: "var(--text-dim)" }}>
              Walk through your traders once. Until then, the opening tasks the graph knows about
              are below — not your real next raid.
            </p>
            <a
              className="btn is-active mt-3 inline-flex"
              href={href.setup()}
              onClick={onNavClick(href.setup())}
            >
              Set up my progress
            </a>
          </section>
        )}

        {data && <SeasonStrip mode={profile.mode} />}

        {raidPicks.length > 0 && (
          <section className="mb-3">
            <h2 className="mb-2 text-sm font-semibold">Next raid</h2>
            <NextRaid picks={raidPicks} />
          </section>
        )}

        {data && (
          <div className="flex flex-col gap-3">
            {dashboard.panelOrder.map((id, i) => (
              <DashPanel
                key={id}
                id={id}
                fresh={fresh}
                canUp={i > 0}
                canDown={i < dashboard.panelOrder.length - 1}
                onMove={moveDashPanel}
              >
                {id === "upcoming" && (
                  <UpcomingList rows={upcoming} onCycle={cycleTaskStatus} fresh={fresh} />
                )}
                {id === "keys" && <KeyList rows={keys} />}
                {id === "needs" && <NeedList rows={needs} />}
              </DashPanel>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

function SeasonStrip({ mode }: { mode: GameMode }) {
  const days = seasonDaysLeft();
  const to = href.quests();
  return (
    <a
      href={to}
      onClick={onNavClick(to)}
      className="surface surface-link mb-3 flex flex-wrap items-center justify-between gap-3 p-3.5"
    >
      <div className="min-w-0">
        <p className="text-sm font-semibold">
          {KORD_SEASON.name}
          <span className="ml-2 font-normal" style={{ color: "var(--text-faint)" }}>
            {days > 0 ? `${days}d left` : "ended"}
          </span>
        </p>
        <p className="mt-0.5 text-[0.72rem]" style={{ color: "var(--text-faint)" }}>
          {mode === "season"
            ? "Seasonal story line and daily documents"
            : "Daily documents drop in every mode — story line is seasonal-only"}
        </p>
      </div>
      <span className="btn flex-none">Quests</span>
    </a>
  );
}

function pickUpcoming(
  data: Progression | null,
  availability: Record<string, TaskAvailability>,
  mode: GameMode,
  limit: number,
): UpcomingRow[] {
  if (!data) return [];

  const rows: UpcomingRow[] = [];
  for (const [id, task] of Object.entries(data.tasks)) {
    if (!visibleInMode(task.name, mode)) continue;
    const state = availability[id];
    if (state !== "active" && state !== "available") continue;
    rows.push({
      id,
      name: task.name,
      trader: task.trader ?? "Unknown",
      level: task.minPlayerLevel,
      availability: state,
      maps: task.maps,
      wiki: task.wiki,
      next: unlocksAfter(data, id)
        .filter((nid) => {
          const child = data.tasks[nid];
          return !!child && visibleInMode(child.name, mode);
        })
        .map((nid) => ({
          id: nid,
          name: displayName(data.tasks[nid]?.name ?? nid),
        })),
    });
  }

  const traderRank = (name: string) => {
    const i = TRADER_ORDER.indexOf(name);
    return i === -1 ? 99 : i;
  };

  const rank = (a: UpcomingRow, b: UpcomingRow) => {
    if (a.availability !== b.availability) return a.availability === "active" ? -1 : 1;
    const da = chainDepth(data, a.id) - chainDepth(data, b.id);
    if (da) return da;
    if (a.level !== b.level) return a.level - b.level;
    const ta = traderRank(a.trader) - traderRank(b.trader);
    if (ta) return ta;
    return displayName(a.name).localeCompare(displayName(b.name));
  };

  return rows.sort(rank).slice(0, limit);
}

function DashPanel({
  id,
  fresh,
  canUp,
  canDown,
  onMove,
  children,
}: {
  id: DashPanelId;
  fresh: boolean;
  canUp: boolean;
  canDown: boolean;
  onMove: (id: DashPanelId, dir: -1 | 1) => void;
  children: React.ReactNode;
}) {
  const title =
    id === "upcoming"
      ? fresh
        ? "Starting tasks"
        : "Upcoming"
      : id === "keys"
        ? "Keys you'll need"
        : "Find in raid";
  const hint =
    id === "upcoming"
      ? fresh
        ? "What the graph says is open on a fresh wipe. Set up to get your real next list."
        : "Active first, then what the graph unlocks next — in chain order."
      : id === "keys"
        ? "Doors those upcoming tasks go through."
        : "Found-in-raid hand-ins for those upcoming tasks.";

  return (
    <section className="surface p-3.5">
      <header className="mb-2.5 flex items-start justify-between gap-2">
        <div>
          <h2 className="text-sm font-semibold">{title}</h2>
          <p className="mt-0.5 text-[0.7rem]" style={{ color: "var(--text-faint)" }}>
            {hint}
          </p>
        </div>
        <div className="flex flex-none gap-1">
          <button
            type="button"
            className="btn btn-icon"
            style={{ width: "1.7rem", height: "1.7rem", padding: 0 }}
            disabled={!canUp}
            aria-label={`Move ${title} up`}
            onClick={() => onMove(id, -1)}
          >
            <span style={{ transform: "rotate(180deg)", display: "block" }}>
              <Icon path={icons.chevron} size={14} />
            </span>
          </button>
          <button
            type="button"
            className="btn btn-icon"
            style={{ width: "1.7rem", height: "1.7rem", padding: 0 }}
            disabled={!canDown}
            aria-label={`Move ${title} down`}
            onClick={() => onMove(id, 1)}
          >
            <Icon path={icons.chevron} size={14} />
          </button>
        </div>
      </header>
      {children}
    </section>
  );
}

function UpcomingList({
  rows,
  onCycle,
  fresh,
}: {
  rows: UpcomingRow[];
  onCycle: (id: string) => void;
  fresh: boolean;
}) {
  if (rows.length === 0) {
    return (
      <EmptyState
        compact
        title={fresh ? "No opening tasks in this mode" : "Nothing upcoming"}
        hint={fresh ? undefined : "Mark a task active, or finish one so the next in the chain opens."}
      />
    );
  }

  return (
    <ul className="space-y-1">
      {rows.map((row) => (
        <li key={row.id} className="surface-2 flex items-start gap-2.5 p-2">
          <span className="mt-0.5">
            <TaskStatusControl
              status={row.availability === "active" || row.availability === "completed" ? row.availability : undefined}
              name={row.name}
              onCycle={() => onCycle(row.id)}
            />
          </span>
          <div className="min-w-0 flex-1">
            <p className="flex flex-wrap items-baseline gap-x-2 gap-y-0.5">
              <span className="text-[0.8125rem] font-medium">
                <TaskName name={row.name} />
              </span>
              <span className="text-[0.68rem]" style={{ color: "var(--text-faint)" }}>
                {row.trader}
                {row.level > 1 ? ` · lvl ${row.level}` : ""}
                {row.availability === "active" ? " · active" : ""}
              </span>
            </p>
            {row.maps.length > 0 && (
              <p className="mt-1 flex flex-wrap gap-1">
                {row.maps.map((map) => (
                  <button
                    key={map}
                    type="button"
                    className="chip chip-accent"
                    onClick={() => navigate(href.map(map, row.id))}
                  >
                    {prettyMapName(map)}
                  </button>
                ))}
              </p>
            )}
            {row.next.length > 0 && (
              <p className="mt-1 text-[0.7rem] leading-snug" style={{ color: "var(--text-faint)" }}>
                Then: {row.next.slice(0, THEN_CAP).map((n) => n.name).join(", ")}
                {row.next.length > THEN_CAP ? ` +${row.next.length - THEN_CAP}` : ""}
              </p>
            )}
          </div>
          {row.wiki && (
            <a
              className="btn btn-ghost btn-icon flex-none"
              href={row.wiki}
              target="_blank"
              rel="noreferrer noopener"
              aria-label={`${displayName(row.name)} on the wiki`}
            >
              <Icon path={icons.external} size={15} />
            </a>
          )}
        </li>
      ))}
    </ul>
  );
}

function KeyList({ rows }: { rows: ReturnType<typeof collectKeys> }) {
  if (rows.length === 0) {
    return <EmptyState compact title="No keys needed" hint="Nothing coming up is behind a locked door." />;
  }
  return (
    <ul className="space-y-1">
      {rows.map((k) => (
        <li key={k.item.id} className="surface-2 flex items-center gap-2.5 p-2">
          {k.item.icon && (
            <img src={k.item.icon} alt="" width={28} height={28} loading="lazy" className="flex-none rounded" />
          )}
          <div className="min-w-0 flex-1">
            <p className="truncate text-[0.8125rem] font-medium">{k.item.name}</p>
            <p className="truncate text-[0.7rem]" style={{ color: "var(--text-faint)" }}>
              {k.tasks.join(", ")}
              {k.maps.length ? ` · ${k.maps.join(", ")}` : ""}
            </p>
          </div>
        </li>
      ))}
    </ul>
  );
}

function NeedList({ rows }: { rows: ReturnType<typeof collectNeeds> }) {
  if (rows.length === 0) {
    return (
      <EmptyState compact title="Nothing to find" hint="No found-in-raid hand-ins among the upcoming tasks." />
    );
  }
  return (
    <ul className="space-y-1">
      {rows.map((n) => (
        <li key={n.name} className="surface-2 flex items-center gap-2.5 p-2">
          {n.icon && (
            <img src={n.icon} alt="" width={28} height={28} loading="lazy" className="flex-none rounded" />
          )}
          <div className="min-w-0 flex-1">
            <p className="truncate text-[0.8125rem] font-medium">{n.name}</p>
            <p className="truncate text-[0.7rem]" style={{ color: "var(--text-faint)" }}>
              {n.tasks.join(", ")}
            </p>
          </div>
          <span className="chip flex-none tabular-nums">×{n.count}</span>
        </li>
      ))}
    </ul>
  );
}
