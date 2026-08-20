import { useCallback, useId, useMemo, useState } from "react";
import { useMapIndex, useProgression } from "../lib/data";
import { KORD_SEASON, prettyMapName, seasonDaysLeft, seasonElapsed } from "../lib/kord-season";
import { nextRaids, type RaidPick } from "../lib/next-raid";
import { MODE_META } from "../lib/mode";
import { chainDepth, computeAvailability, unlocksAfter } from "../lib/progression";
import { collectKeys, collectNeeds } from "../lib/quest-lists";
import { href, navigate, onNavClick } from "../lib/router";
import { displayName, visibleInMode } from "../lib/task-variant";
import { useDragReorder } from "../lib/use-drag-reorder";
import type { GameMode } from "../lib/persist-migrate";
import {
  DASH_PANEL_META,
  UPCOMING_LIMITS,
  useStore,
  useTaskStatus,
  type DashPanel,
  type DashPanelId,
} from "../store";
import type { MapIndexEntry, Progression, TaskAvailability } from "../types";
import ModeSwitch from "./ModeSwitch";
import NextRaid from "./NextRaid";
import TaskName from "./TaskName";
import TaskStatusControl from "./TaskStatusControl";
import { EmptyState, Icon, PageChrome, icons } from "./ui";

/**
 * The dashboard: one screen answering "what do I do next", assembled from
 * panels the player arranges themselves.
 *
 * The layout lives in the store (see lib/dashboard.ts) rather than here, so it
 * survives a reload and can be migrated when a panel is added. This file owns
 * what each panel *is*; the store owns where it sits.
 */

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

interface Stats {
  total: number;
  done: number;
  active: number;
  available: number;
  kappaTotal: number;
  kappaDone: number;
}

export default function DashboardPage() {
  const progression = useProgression();
  const maps = useMapIndex();
  const taskStatus = useTaskStatus();
  const profile = useStore((s) => s.profile);
  const setProfile = useStore((s) => s.setProfile);
  const dashboard = useStore((s) => s.dashboard);
  const lastMap = useStore((s) => s.lastMap);
  const cycleTaskStatus = useStore((s) => s.cycleTaskStatus);

  const [editing, setEditing] = useState(false);

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
  const stats = useMemo(
    () => summarise(data, availability, profile.mode),
    [data, availability, profile.mode],
  );
  const traders = useMemo(
    () => byTrader(data, availability, profile.mode),
    [data, availability, profile.mode],
  );
  const raidPicks = useMemo(
    () => nextRaids(maps.data?.maps ?? [], data, taskStatus, 4),
    [maps.data, data, taskStatus],
  );

  const body = useCallback(
    (id: DashPanelId) => {
      switch (id) {
        case "progress":
          return <ProgressPanel stats={stats} level={profile.level} mode={profile.mode} />;
        case "raid":
          return <NextRaid picks={raidPicks} />;
        case "upcoming":
          return <UpcomingList rows={upcoming} onCycle={cycleTaskStatus} fresh={fresh} />;
        case "keys":
          return <KeyList rows={keys} />;
        case "needs":
          return <NeedList rows={needs} />;
        case "traders":
          return <TraderList rows={traders} />;
        case "season":
          return <SeasonSummary mode={profile.mode} />;
        case "maps":
          return <MapList maps={maps.data?.maps ?? []} resume={resume ?? null} picks={raidPicks} />;
      }
    },
    [stats, profile.level, profile.mode, raidPicks, upcoming, cycleTaskStatus, fresh, keys, needs, traders, maps.data, resume],
  );

  return (
    <div className="page scroll-y h-full">
      <div className="mx-auto w-full max-w-6xl px-4 py-6 sm:px-6 sm:py-12">
        <PageChrome current="dashboard">
          <ModeSwitch value={profile.mode} onChange={(m) => setProfile("mode", m)} size="sm" />
        </PageChrome>

        <header className="mb-4 flex flex-wrap items-end justify-between gap-3">
          <div className="min-w-0">
            <h1 className="display text-2xl sm:text-3xl">Dashboard</h1>
            <p className="mt-1.5 max-w-xl text-sm" style={{ color: "var(--text-dim)" }}>
              What to run next, the keys those tasks go through, and what to find in raid.
            </p>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            {resume && (
              <a
                className="btn is-active"
                style={{ padding: "0.34rem 0.72rem", fontSize: "0.75rem" }}
                href={href.map(resume.normalizedName)}
                onClick={onNavClick(href.map(resume.normalizedName))}
              >
                Continue on {resume.name}
              </a>
            )}
            <button
              type="button"
              className="btn"
              style={{ padding: "0.34rem 0.72rem", fontSize: "0.75rem" }}
              aria-pressed={editing}
              onClick={() => setEditing((v) => !v)}
            >
              <Icon path={icons.layout} size={14} />
              {editing ? "Done" : "Customise"}
            </button>
          </div>
        </header>

        {progression.error && (
          <EmptyState title="The task graph could not be loaded" hint={progression.error.message} />
        )}

        {progression.loading && !data && <DashboardSkeleton />}

        {data && fresh && !editing && (
          <section className="surface mb-3 flex flex-wrap items-center gap-3 p-4">
            <div className="w-full min-w-0 sm:w-auto sm:flex-1">
              <h2 className="text-sm font-semibold">Set up your progress</h2>
              <p className="mt-1 text-[0.8rem] leading-relaxed" style={{ color: "var(--text-dim)" }}>
                Walk through your traders once. Until then, the opening tasks the graph knows about
                are below — not your real next raid.
              </p>
            </div>
            <a
              className="btn is-active w-full flex-none sm:w-auto"
              href={href.setup()}
              onClick={onNavClick(href.setup())}
            >
              Set up my progress
            </a>
          </section>
        )}

        {data && editing && <CustomiseBar />}

        {data && <PanelGrid editing={editing} fresh={fresh} body={body} />}
      </div>
    </div>
  );
}

/* -------------------------------------------------------------------- grid */

function PanelGrid({
  editing,
  fresh,
  body,
}: {
  editing: boolean;
  fresh: boolean;
  body: (id: DashPanelId) => React.ReactNode;
}) {
  const panels = useStore((s) => s.dashboard.panels);
  const columns = useStore((s) => s.dashboard.columns);
  const moveDashPanel = useStore((s) => s.moveDashPanel);
  const reorderDashPanels = useStore((s) => s.reorderDashPanels);
  const toggleDashPanel = useStore((s) => s.toggleDashPanel);
  const setDashPanelWide = useStore((s) => s.setDashPanelWide);

  const visible = useMemo(() => panels.filter((p) => p.visible), [panels]);
  const hidden = useMemo(() => panels.filter((p) => !p.visible), [panels]);

  /*
   * The drag indexes are positions in `visible`, but the store reorders the
   * full list — so both ends are translated back through the panel ids rather
   * than passed as raw indexes, which would move the wrong panel the moment
   * anything was switched off.
   */
  const drop = useCallback(
    (from: number, to: number) => {
      const moved = visible[from];
      const target = visible[to];
      if (!moved || !target) return;
      const all = panels.map((p) => p.id);
      reorderDashPanels(all.indexOf(moved.id), all.indexOf(target.id));
    },
    [visible, panels, reorderDashPanels],
  );

  const drag = useDragReorder(drop);

  if (visible.length === 0) {
    return (
      <section className="surface p-8 text-center">
        <h2 className="text-base font-semibold">Every panel is switched off</h2>
        <p className="mx-auto mt-2 max-w-sm text-[0.82rem] leading-relaxed" style={{ color: "var(--text-dim)" }}>
          Turn one back on and the dashboard comes back.
        </p>
        {!editing && (
          <p className="mt-4">
            <span className="chip">Press Customise, above</span>
          </p>
        )}
        {editing && <HiddenTray hidden={hidden} onAdd={toggleDashPanel} />}
      </section>
    );
  }

  return (
    <>
      <div className="dash-grid" data-columns={columns} data-editing={editing || undefined}>
        {visible.map((panel, i) => (
          <DashPanelCard
            key={panel.id}
            panel={panel}
            index={i}
            count={visible.length}
            columns={columns}
            editing={editing}
            fresh={fresh}
            drag={drag}
            onMove={moveDashPanel}
            onHide={() => toggleDashPanel(panel.id)}
            onWide={(wide) => setDashPanelWide(panel.id, wide)}
          >
            {body(panel.id)}
          </DashPanelCard>
        ))}
      </div>

      {editing && hidden.length > 0 && <HiddenTray hidden={hidden} onAdd={toggleDashPanel} />}

      <p aria-live="polite" className="sr-only">
        {drag.from != null && drag.to != null
          ? `Moving ${DASH_PANEL_META[visible[drag.from].id].title} to position ${drag.to + 1} of ${visible.length}`
          : ""}
      </p>
    </>
  );
}

function DashPanelCard({
  panel,
  index,
  count,
  columns,
  editing,
  fresh,
  drag,
  onMove,
  onHide,
  onWide,
  children,
}: {
  panel: DashPanel;
  index: number;
  count: number;
  columns: 1 | 2;
  editing: boolean;
  fresh: boolean;
  drag: ReturnType<typeof useDragReorder>;
  onMove: (id: DashPanelId, dir: -1 | 1) => void;
  onHide: () => void;
  onWide: (wide: boolean) => void;
  children: React.ReactNode;
}) {
  const meta = DASH_PANEL_META[panel.id];
  const title = panel.id === "upcoming" && fresh ? "Starting tasks" : meta.title;
  const hint =
    panel.id === "upcoming" && fresh
      ? "What the graph says is open on a fresh wipe. Set up to get your real next list."
      : meta.hint;

  const isDragged = drag.from === index;
  const isTarget = drag.from != null && drag.to === index && drag.to !== drag.from;

  return (
    <section
      ref={drag.register(index)}
      className="surface dash-panel"
      data-wide={columns === 2 && panel.wide ? "true" : undefined}
      data-dragged={isDragged || undefined}
      data-target={isTarget || undefined}
      style={
        isDragged
          ? { transform: `translate3d(${drag.offset.x}px, ${drag.offset.y}px, 0)` }
          : undefined
      }
      aria-label={title}
    >
      <header className="dash-panel-head">
        <div className="min-w-0">
          <h2 className="text-sm font-semibold">{title}</h2>
          <p className="mt-0.5 text-[0.7rem] leading-snug" style={{ color: "var(--text-faint)" }}>
            {hint}
          </p>
        </div>

        {editing && (
          <div className="dash-panel-tools">
            <button
              type="button"
              className="btn btn-icon dash-grip"
              style={{ width: "1.75rem", height: "1.75rem", padding: 0 }}
              aria-label={`Drag ${title} to reorder, or use the arrow keys`}
              title="Drag to reorder"
              onPointerDown={drag.start(index)}
              onKeyDown={(e) => {
                if (e.key === "ArrowUp" || e.key === "ArrowLeft") {
                  e.preventDefault();
                  onMove(panel.id, -1);
                } else if (e.key === "ArrowDown" || e.key === "ArrowRight") {
                  e.preventDefault();
                  onMove(panel.id, 1);
                }
              }}
            >
              <Icon path={icons.grip} size={14} />
            </button>
            <button
              type="button"
              className="btn btn-icon"
              style={{ width: "1.75rem", height: "1.75rem", padding: 0 }}
              disabled={index === 0}
              aria-label={`Move ${title} up`}
              onClick={() => onMove(panel.id, -1)}
            >
              <span style={{ transform: "rotate(180deg)", display: "block" }}>
                <Icon path={icons.chevron} size={13} />
              </span>
            </button>
            <button
              type="button"
              className="btn btn-icon"
              style={{ width: "1.75rem", height: "1.75rem", padding: 0 }}
              disabled={index === count - 1}
              aria-label={`Move ${title} down`}
              onClick={() => onMove(panel.id, 1)}
            >
              <Icon path={icons.chevron} size={13} />
            </button>
            {columns === 2 && (
              <button
                type="button"
                className="btn btn-icon"
                style={{ width: "1.75rem", height: "1.75rem", padding: 0 }}
                aria-pressed={panel.wide}
                aria-label={`${title}: full width`}
                title="Full width"
                onClick={() => onWide(!panel.wide)}
              >
                <Icon path={icons.paneFull} size={14} />
              </button>
            )}
            <button
              type="button"
              className="btn btn-icon"
              style={{ width: "1.75rem", height: "1.75rem", padding: 0 }}
              aria-label={`Hide ${title}`}
              title="Hide this panel"
              onClick={onHide}
            >
              <Icon path={icons.close} size={13} />
            </button>
          </div>
        )}
      </header>

      <div className="dash-panel-body">{children}</div>
    </section>
  );
}

function HiddenTray({
  hidden,
  onAdd,
}: {
  hidden: DashPanel[];
  onAdd: (id: DashPanelId) => void;
}) {
  return (
    <section className="surface mt-3 p-3.5">
      <h2 className="text-sm font-semibold">Panels you have switched off</h2>
      <p className="mt-0.5 text-[0.7rem]" style={{ color: "var(--text-faint)" }}>
        They keep their place in the order, so adding one back puts it where it was.
      </p>
      <ul className="mt-2.5 grid grid-cols-1 gap-2 sm:grid-cols-2">
        {hidden.map((panel) => {
          const meta = DASH_PANEL_META[panel.id];
          return (
            <li key={panel.id}>
              <button
                type="button"
                className="surface-2 surface-link flex w-full items-center gap-3 p-2.5 text-left"
                onClick={() => onAdd(panel.id)}
              >
                <span className="min-w-0 flex-1">
                  <span className="block text-[0.8125rem] font-medium">{meta.title}</span>
                  <span className="mt-0.5 block text-[0.7rem] leading-snug" style={{ color: "var(--text-faint)" }}>
                    {meta.blurb}
                  </span>
                </span>
                <span className="chip chip-accent flex-none">Add</span>
              </button>
            </li>
          );
        })}
      </ul>
    </section>
  );
}

function CustomiseBar() {
  const columnsId = useId();
  const columns = useStore((s) => s.dashboard.columns);
  const upcomingLimit = useStore((s) => s.dashboard.upcomingLimit);
  const setDashColumns = useStore((s) => s.setDashColumns);
  const setUpcomingLimit = useStore((s) => s.setUpcomingLimit);
  const resetDashboard = useStore((s) => s.resetDashboard);

  return (
    <section className="surface animate-in mb-3 flex flex-wrap items-end gap-x-5 gap-y-3 p-3.5">
      <p className="w-full text-[0.72rem] leading-snug sm:w-auto sm:flex-1" style={{ color: "var(--text-dim)" }}>
        <b style={{ color: "var(--text)" }}>Arranging the dashboard.</b> Drag a panel by its grip,
        or use the arrows. Wide panels fill the row; the × switches one off.
      </p>

      {/*
        A group, not a <label>. A label wrapping two buttons binds itself to
        the first one and hands it the label's whole text as its accessible
        name, so "One" announced as "Columns Two" — the label's words plus the
        *other* button's. Only a single form control can be named that way.
      */}
      <div className="flex flex-col gap-1" role="group" aria-labelledby={columnsId}>
        <span
          id={columnsId}
          className="eyebrow"
          style={{ color: "var(--text-dim)", letterSpacing: "0.1em" }}
        >
          Columns
        </span>
        <span className="flex gap-1">
          {([1, 2] as const).map((n) => (
            <button
              key={n}
              type="button"
              className="btn"
              style={{ padding: "0.28rem 0.6rem", fontSize: "0.75rem" }}
              aria-pressed={columns === n}
              onClick={() => setDashColumns(n)}
            >
              {n === 1 ? "One" : "Two"}
            </button>
          ))}
        </span>
        <span className="text-[0.66rem] leading-snug lg:hidden" style={{ color: "var(--text-faint)" }}>
          Two columns — and the panel widths — need a wider screen than this
          one. They are saved either way.
        </span>
      </div>

      <label className="flex flex-col gap-1">
        <span className="eyebrow" style={{ color: "var(--text-dim)", letterSpacing: "0.1em" }}>
          Upcoming
        </span>
        {/* One control, so the wrapping label names it — and names it with the
            words on screen rather than a second, different sentence. */}
        <select
          className="input tabular-nums"
          style={{ width: "auto", padding: "0.3rem 1.6rem 0.3rem 0.6rem" }}
          value={upcomingLimit}
          onChange={(e) => setUpcomingLimit(Number(e.target.value))}
        >
          {UPCOMING_LIMITS.map((n) => (
            <option key={n} value={n}>
              {n} tasks
            </option>
          ))}
        </select>
      </label>

      <div className="flex gap-1.5">
        <button
          type="button"
          className="btn"
          style={{ padding: "0.34rem 0.7rem", fontSize: "0.75rem" }}
          onClick={resetDashboard}
        >
          Reset layout
        </button>
      </div>
    </section>
  );
}

function DashboardSkeleton() {
  return (
    <div className="dash-grid" data-columns={2} aria-hidden="true">
      {[0, 1, 2, 3].map((i) => (
        <div key={i} className="surface dash-panel" data-wide={i < 2 ? "true" : undefined}>
          <div className="dash-panel-body">
            <span className="skeleton block h-4 w-40" />
            <span className="skeleton mt-3 block h-12 w-full" />
            <span className="skeleton mt-2 block h-12 w-full" />
          </div>
        </div>
      ))}
      <p className="sr-only">Loading the task graph…</p>
    </div>
  );
}

/* ------------------------------------------------------------------ panels */

function ProgressPanel({
  stats,
  level,
  mode,
}: {
  stats: Stats;
  level: number;
  mode: GameMode;
}) {
  if (stats.total === 0) {
    return <EmptyState compact title="No tasks in this mode" hint="Switch mode to see a progression." />;
  }
  const pct = Math.round((stats.done / stats.total) * 100);
  const kappaPct = stats.kappaTotal ? Math.round((stats.kappaDone / stats.kappaTotal) * 100) : 0;

  return (
    <div>
      <ul className="stat-row">
        <Stat label="Done" value={stats.done} of={stats.total} />
        <Stat label="Active" value={stats.active} tone="accent" />
        <Stat label="Available" value={stats.available} />
        <Stat label="Level" value={level} />
      </ul>

      {/* The figure is on the right of every meter, so the label says what is
          being measured rather than repeating it. */}
      <Meter label={`Tasks done · ${MODE_META[mode].label}`} value={pct} />
      {stats.kappaTotal > 0 && (
        <Meter label={`Kappa · ${stats.kappaDone} of ${stats.kappaTotal}`} value={kappaPct} tone="accent" />
      )}
    </div>
  );
}

function Stat({
  label,
  value,
  of,
  tone,
}: {
  label: string;
  value: number;
  of?: number;
  tone?: "accent";
}) {
  return (
    <li className="stat">
      <span className="stat-value tabular-nums" style={tone === "accent" ? { color: "var(--accent)" } : undefined}>
        {value}
        {of != null && (
          <span className="stat-of" style={{ color: "var(--text-faint)" }}>
            /{of}
          </span>
        )}
      </span>
      <span className="stat-label">{label}</span>
    </li>
  );
}

function Meter({ label, value, tone }: { label: string; value: number; tone?: "accent" }) {
  return (
    <div className="mt-2.5">
      <p className="mb-1 flex items-baseline justify-between text-[0.7rem]" style={{ color: "var(--text-faint)" }}>
        <span>{label}</span>
        <span className="tabular-nums">{value}%</span>
      </p>
      <span className="meter">
        <i
          style={{
            width: `${value}%`,
            background: tone === "accent" ? "var(--accent)" : "var(--ok)",
          }}
        />
      </span>
    </div>
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
              status={row.availability === "active" ? "active" : undefined}
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
                    className="chip chip-accent chip-button"
                    onClick={() => navigate(href.map(map, row.id))}
                    title={`Open ${displayName(row.name)} on ${prettyMapName(map)}`}
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

interface TraderRow {
  trader: string;
  available: number;
  active: number;
  next: string | null;
}

function TraderList({ rows }: { rows: TraderRow[] }) {
  if (rows.length === 0) {
    return <EmptyState compact title="No traders to show" hint="The task graph has not loaded yet." />;
  }
  return (
    <ul className="grid grid-cols-1 gap-1.5 sm:grid-cols-2">
      {rows.map((row) => (
        <li key={row.trader} className="surface-2 flex items-baseline gap-2 p-2">
          <span className="flex-none text-[0.8125rem] font-medium">{row.trader}</span>
          <span className="min-w-0 flex-1 truncate text-[0.7rem]" style={{ color: "var(--text-faint)" }}>
            {row.next ?? "nothing open"}
          </span>
          <span className="chip flex-none tabular-nums" title={`${row.available} available, ${row.active} active`}>
            {row.active > 0 && (
              <span style={{ color: "var(--accent)" }}>{row.active}·</span>
            )}
            {row.available}
          </span>
        </li>
      ))}
    </ul>
  );
}

function SeasonSummary({ mode }: { mode: GameMode }) {
  const days = seasonDaysLeft();
  const elapsed = seasonElapsed();
  const to = href.quests();

  return (
    <div>
      <p className="flex flex-wrap items-baseline gap-x-2">
        <span className="text-sm font-semibold">{KORD_SEASON.name}</span>
        <span className="text-[0.72rem]" style={{ color: "var(--text-faint)" }}>
          {days > 0 ? `${days} day${days === 1 ? "" : "s"} left` : "ended"} · ends {KORD_SEASON.ends}
        </span>
      </p>
      <span className="season-meter" style={{ ["--p" as string]: elapsed }}>
        <i />
      </span>
      <p className="mt-2.5 text-[0.75rem] leading-relaxed" style={{ color: "var(--text-dim)" }}>
        {mode === "season"
          ? "The story line runs on this character. Daily documents drop in every mode."
          : "Daily documents drop in every mode. The story line is offered on a seasonal character only."}
      </p>
      <a className="btn mt-2.5 inline-flex" href={to} onClick={onNavClick(to)}>
        Open the season line
      </a>
    </div>
  );
}

function MapList({
  maps,
  resume,
  picks,
}: {
  maps: MapIndexEntry[];
  resume: MapIndexEntry | null;
  picks: RaidPick[];
}) {
  if (maps.length === 0) {
    return <EmptyState compact title="Maps are still loading" />;
  }
  // Whatever the raid picker already ranked, then the rest alphabetically —
  // so the useful maps are first without hiding any of them.
  const ranked = [
    ...picks.map((p) => p.map),
    ...maps.filter((m) => !picks.some((p) => p.map.normalizedName === m.normalizedName)),
  ];

  return (
    <div>
      {resume && (
        <a
          className="surface-2 surface-link mb-2 flex items-center gap-3 p-2.5"
          href={href.map(resume.normalizedName)}
          onClick={onNavClick(href.map(resume.normalizedName))}
        >
          <span className="min-w-0 flex-1">
            <span className="block text-[0.8125rem] font-medium">{resume.name}</span>
            <span className="block text-[0.7rem]" style={{ color: "var(--text-faint)" }}>
              Where you left off
            </span>
          </span>
          <span className="chip chip-accent flex-none">Open</span>
        </a>
      )}
      <ul className="flex flex-wrap gap-1.5">
        {ranked.map((map) => (
          <li key={map.normalizedName}>
            <a
              className="chip chip-button"
              href={href.map(map.normalizedName)}
              onClick={onNavClick(href.map(map.normalizedName))}
            >
              {map.name}
            </a>
          </li>
        ))}
      </ul>
    </div>
  );
}

/* -------------------------------------------------------------------- data */

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

function summarise(
  data: Progression | null,
  availability: Record<string, TaskAvailability>,
  mode: GameMode,
): Stats {
  const stats: Stats = { total: 0, done: 0, active: 0, available: 0, kappaTotal: 0, kappaDone: 0 };
  if (!data) return stats;

  for (const [id, task] of Object.entries(data.tasks)) {
    if (!visibleInMode(task.name, mode)) continue;
    stats.total++;
    const state = availability[id];
    if (state === "completed") stats.done++;
    else if (state === "active") stats.active++;
    else if (state === "available") stats.available++;
    if (task.kappaRequired) {
      stats.kappaTotal++;
      if (state === "completed") stats.kappaDone++;
    }
  }
  return stats;
}

function byTrader(
  data: Progression | null,
  availability: Record<string, TaskAvailability>,
  mode: GameMode,
): TraderRow[] {
  if (!data) return [];

  const rows = new Map<string, TraderRow & { depth: number }>();
  for (const [id, task] of Object.entries(data.tasks)) {
    if (!task.trader || !visibleInMode(task.name, mode)) continue;
    const state = availability[id];
    if (state !== "available" && state !== "active") continue;

    const row = rows.get(task.trader) ?? {
      trader: task.trader,
      available: 0,
      active: 0,
      next: null,
      depth: Infinity,
    };
    if (state === "active") row.active++;
    else row.available++;

    // The shallowest chain is the one they are most likely on next; an active
    // task always speaks for the trader over a merely available one.
    const depth = chainDepth(data, id) + (state === "active" ? -1000 : 0);
    if (depth < row.depth) {
      row.depth = depth;
      row.next = displayName(task.name);
    }
    rows.set(task.trader, row);
  }

  return [...rows.values()]
    .sort((a, b) => {
      const ra = TRADER_ORDER.indexOf(a.trader);
      const rb = TRADER_ORDER.indexOf(b.trader);
      return (ra === -1 ? 99 : ra) - (rb === -1 ? 99 : rb) || a.trader.localeCompare(b.trader);
    })
    .map(({ trader, available, active, next }) => ({ trader, available, active, next }));
}
