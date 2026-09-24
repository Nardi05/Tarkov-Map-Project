import { useCallback, useId, useMemo, useState } from "react";
import { useHideoutData, useItemCatalog, useMapIndex, useProgression } from "../lib/data";
import { splitPanels } from "../lib/dashboard";
import { hideoutRows } from "../lib/hideout";
import { KORD_SEASON, prettyMapName, seasonDaysLeft, SEASON_TITLE } from "../lib/kord-season";
import { nextRaids, type RaidPick } from "../lib/next-raid";
import { buildPlan } from "../lib/plan";
import { MODE_META } from "../lib/mode";
import { hasCharacterData } from "../lib/onboarding";
import { chainDepth, computeAvailability, unlocksAfter } from "../lib/progression";
import { collectKeys, collectTaskItems } from "../lib/quest-lists";
import { href, navigate, onNavClick } from "../lib/router";
import { endingById, hideoutLevels, mapLabel, progressFor } from "../lib/story";
import { displayName, visibleInMode } from "../lib/task-variant";
import { useDragReorder } from "../lib/use-drag-reorder";
import type { GameMode } from "../lib/persist-migrate";
import {
  DASH_PANEL_META,
  useHideout,
  useItemCounts,
  useKeysOwned,
  useStore,
  useStory,
  useTaskStatus,
  type DashPanel,
  type DashPanelId,
} from "../store";
import type { MapIndexEntry, Progression, TaskAvailability } from "../types";
import NextRaid from "./NextRaid";
import RaidClock from "./RaidClock";
import TargetPicker from "./TargetPicker";
import TaskName from "./TaskName";
import TaskSheet from "./TaskSheet";
import { TrackerList } from "./Trackers";
import { Callout, Card, EmptyState, Icon, icons, PageHeader, Term } from "./ui";

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
  const dashboard = useStore((s) => s.dashboard);
  const lastMap = useStore((s) => s.lastMap);
  const setTaskStatus = useStore((s) => s.setTaskStatus);
  const setProfile = useStore((s) => s.setProfile);
  const itemCounts = useItemCounts();
  const keysOwned = useKeysOwned();
  const setKeyOwned = useStore((s) => s.setKeyOwned);
  const catalog = useItemCatalog();

  const [editing, setEditing] = useState(false);
  const [showAnyway, setShowAnyway] = useState(false);

  const data = progression.data;
  const fresh = Object.keys(taskStatus).length === 0;
  const resume = maps.data?.maps.find((m) => m.normalizedName === lastMap);

  /** Anything at all stored on this character: tasks, stash, keys, hideout, story. */
  const tracked = useStore((s) =>
    hasCharacterData({ [s.profile.mode]: s.progress[s.profile.mode] }),
  );
  const story = useStory();
  const hideout = useHideout();
  const seasonTracked = useStore((s) => Object.keys(s.progress.season.taskStatus).length > 0);

  const availability = useMemo(
    () => computeAvailability(data, taskStatus, profile),
    [data, taskStatus, profile],
  );

  const plan = useMemo(
    () => buildPlan(data, taskStatus, profile),
    [data, taskStatus, profile],
  );

  const upcoming = useMemo(() => {
    const cap = Math.max(80, dashboard.upcomingLimit);
    const planned = rowsFromPlan(data, availability, profile.mode, plan.current, cap);
    return planned.length
      ? planned
      : pickUpcoming(data, availability, profile.mode, cap);
  }, [data, availability, profile.mode, plan.current, dashboard.upcomingLimit]);

  const planIds = plan.current;
  const keys = useMemo(() => collectKeys(data, planIds), [data, planIds]);
  const mosaic = useMemo(() => {
    const wanted = new Set(planIds);
    const rows = collectTaskItems(data, itemCounts).filter(
      (row) => wanted.has(row.taskId) && row.foundInRaid,
    );
    const byItem = new Map<string, (typeof rows)[number]>();
    for (const row of rows) {
      const prev = byItem.get(row.itemId);
      if (!prev) byItem.set(row.itemId, { ...row });
      else prev.need += row.need;
    }
    return [...byItem.values()]
      .map((row) => ({ ...row, remaining: Math.max(0, row.need - row.have) }))
      .filter((row) => row.remaining > 0);
  }, [data, itemCounts, planIds]);
  const stats = useMemo(
    () => summarise(data, availability, profile.mode),
    [data, availability, profile.mode],
  );
  const traders = useMemo(
    () => byTrader(data, availability, profile.mode),
    [data, availability, profile.mode],
  );
  const raidPicks = useMemo(
    () => nextRaids(maps.data?.maps ?? [], data, taskStatus, 4, plan.current),
    [maps.data, data, taskStatus, plan.current],
  );

  const body = useCallback(
    (id: DashPanelId) => {
      switch (id) {
        case "trackers":
          return <TrackerList />;
        case "story":
          return <StorySummary />;
        case "hideout":
          return <HideoutSummary />;
        case "progress":
          return <ProgressPanel stats={stats} level={profile.level} mode={profile.mode} />;
        case "raid":
          return <NextRaid picks={raidPicks} />;
        case "upcoming":
          return (
            <UpcomingList
              rows={upcoming}
              onComplete={(id) => setTaskStatus(id, "completed")}
              fresh={fresh}
            />
          );
        case "keys":
          return <KeyList rows={keys} owned={keysOwned} onOwned={setKeyOwned} />;
        case "needs":
          return (
            <ItemMosaic
              rows={mosaic}
              catalog={catalog.data?.items ?? {}}
            />
          );
        case "traders":
          return <TraderList rows={traders} />;
        case "season":
          return <SeasonSummary />;
        case "maps":
          return <MapList maps={maps.data?.maps ?? []} resume={resume ?? null} picks={raidPicks} />;
      }
    },
    [stats, profile.level, profile.mode, raidPicks, upcoming, setTaskStatus, fresh, keys, keysOwned, setKeyOwned, mosaic, catalog.data, traders, maps.data, resume],
  );

  /** Panels that would only say "nothing here yet" — folded into one line. */
  const isEmpty = useCallback(
    (id: DashPanelId) => {
      switch (id) {
        case "trackers":
        case "maps":
          return false;
        case "progress":
          return stats.total === 0;
        case "raid":
          return raidPicks.length === 0;
        case "upcoming":
          return upcoming.length === 0;
        case "keys":
          return keys.length === 0;
        case "needs":
          return mosaic.length === 0;
        case "traders":
          return traders.length === 0;
        case "story":
          return !story.target;
        case "season":
          return !seasonTracked && profile.mode !== "season";
        case "hideout":
          return Object.keys(hideout).length === 0;
      }
    },
    [stats.total, raidPicks.length, upcoming.length, keys.length, mosaic.length, traders.length, story.target, seasonTracked, profile.mode, hideout],
  );

  /*
   * A character with nothing stored gets one thing to do, not eleven panels of
   * "not set up yet". The full dashboard is a click away for anyone curious.
   */
  if (!tracked && !showAnyway) {
    return (
      <>
        <PageHeader title="Dashboard" lead={`Nothing tracked yet on ${MODE_META[profile.mode].label}.`} />
        <EmptyDashboard resume={resume ?? null} onShowAnyway={() => setShowAnyway(true)} />
      </>
    );
  }

  return (
    <>
      <PageHeader
        title="Dashboard"
        lead="What to run next, and where everything you track stands."
      >
            {resume && (
              <a
                className="btn is-active"
                href={href.map(resume.normalizedName)}
                onClick={onNavClick(href.map(resume.normalizedName))}
              >
                Continue {resume.name}
              </a>
            )}
            {tracked && (
              <button
                type="button"
                className="btn"
                aria-pressed={editing}
                onClick={() => setEditing((v) => !v)}
              >
                <Icon path={icons.layout} size={14} />
                {editing ? "Done" : "Edit layout"}
              </button>
            )}
      </PageHeader>

        {/*
          * Who you are and what you are aiming at, above everything the page
          * then derives from it. Three related facts in one row rather than
          * three cards: every one of them is an input to the plan below.
          */}
        <section className="surface dash-command mb-4">
          <div>
            <RaidClock mapName={resume?.normalizedName ?? "customs"} variant="board" />
          </div>

          <div className="dash-command-char">
            <p className="dash-command-kicker">Character</p>
            <p className="text-lg font-semibold">{MODE_META[profile.mode].label}</p>
            <p className="dash-command-kicker mt-2.5">Level</p>
            <div className="level-step">
              <button
                type="button"
                className="btn btn-ghost btn-icon"
                aria-label="Lower level"
                disabled={profile.level <= 1}
                onClick={() => setProfile("level", Math.max(1, profile.level - 1))}
              >
                <Icon path={icons.minus} size={15} />
              </button>
              <span className="tabular-nums text-2xl font-semibold">{profile.level}</span>
              <button
                type="button"
                className="btn btn-ghost btn-icon"
                aria-label="Raise level"
                disabled={profile.level >= 79}
                onClick={() => setProfile("level", Math.min(79, profile.level + 1))}
              >
                <Icon path={icons.plus} size={15} />
              </button>
            </div>
            <p className="mt-1 text-[0.7rem] faint">
              {profile.faction === "Any" ? "USEC or BEAR" : profile.faction}
            </p>
          </div>

          <TargetPicker remaining={plan.remainingToTarget} variant="bar" />
        </section>

        {progression.error && (
          <EmptyState title="The task graph could not be loaded" hint={progression.error.message} />
        )}

        {progression.loading && !data && <DashboardSkeleton />}

        {data && fresh && !editing && (
          <Callout tone="accent" className="mb-4" icon={icons.info}>
            <b className="font-semibold" style={{ color: "var(--text)" }}>
              These are a guess, not your raid.
            </b>{" "}
            Until you tick the quests your <Term id="trader">traders</Term> have given you,
            the task panels below show what the graph says a fresh character could pick up.{" "}
            <a
              className="underline underline-offset-2"
              href={href.setup()}
              onClick={onNavClick(href.setup())}
            >
              Set up tasks
            </a>
            .
          </Callout>
        )}

      {data && editing && <CustomiseBar />}

      {data && <PanelGrid editing={editing} fresh={fresh} body={body} isEmpty={isEmpty} />}
    </>
  );
}

/* -------------------------------------------------------------------- grid */

function PanelGrid({
  editing,
  fresh,
  body,
  isEmpty,
}: {
  editing: boolean;
  fresh: boolean;
  body: (id: DashPanelId) => React.ReactNode;
  isEmpty: (id: DashPanelId) => boolean;
}) {
  const panels = useStore((s) => s.dashboard.panels);
  const columns = useStore((s) => s.dashboard.columns);
  const moveDashPanel = useStore((s) => s.moveDashPanel);
  const reorderDashPanels = useStore((s) => s.reorderDashPanels);
  const toggleDashPanel = useStore((s) => s.toggleDashPanel);
  const setDashPanelWide = useStore((s) => s.setDashPanelWide);

  // Drag positions index `visible`; nothing folds while editing, so they line up.
  const { shown: visible, folded } = useMemo(
    () => splitPanels(panels, isEmpty, editing),
    [panels, isEmpty, editing],
  );
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

      {folded.length > 0 && <FoldedPanels folded={folded} />}

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
      /* Fades in on mount. Panels are keyed by id, so reordering moves the
         node rather than remounting it and nothing animates — but switching a
         hidden panel back on does mount one, and it arriving without a word
         in the middle of a list is easy to miss. */
      className="surface dash-panel animate-in"
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
          <h2 className="card-title">{title}</h2>
          <p className="card-sub">{hint}</p>
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

/** Where each folded panel's content would come from, so the chip goes somewhere useful. */
const FOLDED_LINK: Record<DashPanelId, () => string> = {
  trackers: href.dashboard,
  progress: () => href.quests(),
  raid: () => href.quests(),
  upcoming: () => href.quests(),
  keys: () => href.quests(),
  needs: () => href.quests("items"),
  traders: () => href.quests(),
  story: href.storySetup,
  season: href.season,
  hideout: href.hideout,
  maps: href.maps,
};

function FoldedPanels({ folded }: { folded: DashPanel[] }) {
  return (
    <p className="dash-folded">
      <span className="faint">Nothing here yet:</span>
      {folded.map((panel) => {
        const to = FOLDED_LINK[panel.id]();
        return (
          <a key={panel.id} className="chip chip-button" href={to} onClick={onNavClick(to)}>
            {DASH_PANEL_META[panel.id].title}
          </a>
        );
      })}
    </p>
  );
}

function EmptyDashboard({
  resume,
  onShowAnyway,
}: {
  resume: MapIndexEntry | null;
  onShowAnyway: () => void;
}) {
  const mapTo = href.map(resume?.normalizedName ?? "customs");
  return (
    <section className="surface dash-empty">
      <h2 className="text-lg font-semibold">Mark the quests you're holding</h2>
      <p className="mt-1.5 max-w-lg text-[0.875rem] muted">
        Then this page shows which map to run and the next few objectives on it.
      </p>
      <div className="mt-4 flex flex-wrap gap-2">
        <a className="btn btn-primary btn-lg" href={href.setup()} onClick={onNavClick(href.setup())}>
          Mark active quests
          <Icon path={icons.forward} size={16} />
        </a>
        <a className="btn btn-lg" href={mapTo} onClick={onNavClick(mapTo)}>
          {resume ? `Continue ${resume.name}` : "Just open Customs"}
        </a>
      </div>
      <button type="button" className="mt-4 text-[0.75rem] underline underline-offset-2 faint" onClick={onShowAnyway}>
        Show the full dashboard anyway
      </button>
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
    <Card
      className="mt-3"
      title="Panels you have switched off"
      hint="They keep their place in the order, so adding one back puts it where it was."
    >
      <ul className="grid grid-cols-1 gap-2 sm:grid-cols-2">
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
                  <span className="mt-0.5 block text-meta">{meta.blurb}</span>
                </span>
                <span className="chip chip-accent flex-none">Add</span>
              </button>
            </li>
          );
        })}
      </ul>
    </Card>
  );
}

function CustomiseBar() {
  const columnsId = useId();
  const columns = useStore((s) => s.dashboard.columns);
  const setDashColumns = useStore((s) => s.setDashColumns);
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

function StorySummary() {
  const story = useStory();
  const hideout = useHideout();
  const stations = useHideoutData().data?.stations;
  const ending = endingById(story.target);
  const stats = useMemo(
    () =>
      ending
        ? progressFor(ending, story.ticks, story.choices, hideoutLevels(stations, hideout))
        : null,
    [ending, story, stations, hideout],
  );

  if (!ending || !stats) {
    return (
      <EmptyState
        compact
        title="No ending picked"
        hint="Pick Savior, Survivor, Debtor or Fallen and mark the chapters you have done."
        action={
          <a className="btn btn-sm" href={href.storySetup()} onClick={onNavClick(href.storySetup())}>
            Set up story
          </a>
        }
      />
    );
  }

  const pct = stats.required ? Math.round((stats.requiredDone / stats.required) * 100) : 0;
  const next = [...stats.next, ...stats.parallel].slice(0, 3);

  return (
    <div>
      <p className="text-[0.95rem] font-semibold">{ending.name}</p>
      <Meter label={`Steps · ${stats.requiredDone} of ${stats.required}`} value={pct} />
      {stats.evidenceNeed > 0 && (
        <p className="mt-2 text-[0.72rem] faint">
          Evidence {stats.evidenceHave} of {stats.evidenceNeed}
        </p>
      )}
      {next.length > 0 ? (
        <ul className="mt-3 space-y-1.5">
          {next.map(({ step, chapter }) => (
            <li key={step.id} className="surface-2 p-2">
              <p className="text-[0.8rem] font-medium leading-snug">{step.title}</p>
              <p className="mt-0.5 text-[0.68rem] faint">
                {chapter.name}
                {step.maps?.length ? ` · ${step.maps.map(mapLabel).join(", ")}` : ""}
              </p>
            </li>
          ))}
        </ul>
      ) : (
        <p className="mt-3 text-[0.78rem] muted">Every required step is ticked.</p>
      )}
      <a
        className="btn btn-sm mt-3"
        href={href.story(ending.id)}
        onClick={onNavClick(href.story(ending.id))}
      >
        Open the guide
      </a>
    </div>
  );
}

function SeasonSummary() {
  const progression = useProgression();
  const profile = useStore((s) => s.profile);
  const seasonStatus = useStore((s) => s.progress.season.taskStatus);
  const seasonProfile = useMemo(() => ({ ...profile, mode: "season" as const }), [profile]);
  const availability = useMemo(
    () => computeAvailability(progression.data, seasonStatus, seasonProfile),
    [progression.data, seasonStatus, seasonProfile],
  );

  const line = KORD_SEASON.questline;
  const done = line.filter((q) => seasonStatus[q.id] === "completed").length;
  const days = seasonDaysLeft();
  const next = line
    .filter((q) => {
      const stated = seasonStatus[q.id];
      if (stated) return stated === "active";
      return (availability[q.id] ?? "locked") !== "locked";
    })
    .slice(0, 3);

  return (
    <div>
      <p className="flex flex-wrap items-baseline justify-between gap-2">
        <span className="text-[0.95rem] font-semibold">{SEASON_TITLE}</span>
        <span className="chip chip-season">
          {days > 0 ? `${days} day${days === 1 ? "" : "s"} left` : "Ended"}
        </span>
      </p>
      <Meter
        label={`Season tasks · ${done} of ${line.length}`}
        value={Math.round((done / line.length) * 100)}
      />
      {next.length > 0 && (
        <ul className="mt-3 space-y-1.5">
          {next.map((q) => (
            <li key={q.id} className="surface-2 p-2">
              <p className="text-[0.8rem] font-medium leading-snug">{q.name}</p>
              <p className="mt-0.5 text-[0.68rem] faint">
                {seasonStatus[q.id] === "active" ? "Active" : "Available"}
                {q.maps.length ? ` · ${q.maps.map(prettyMapName).join(", ")}` : ""}
              </p>
            </li>
          ))}
        </ul>
      )}
      {profile.mode !== "season" && (
        <p className="mt-2 text-[0.72rem] faint">
          Tracked on your Season character — switch to it to tick these.
        </p>
      )}
      <a className="btn btn-sm mt-3" href={href.season()} onClick={onNavClick(href.season())}>
        Open season
      </a>
    </div>
  );
}

function HideoutSummary() {
  const data = useHideoutData();
  const hideout = useHideout();
  const rows = useMemo(() => hideoutRows(data.data, hideout), [data.data, hideout]);

  if (!data.data) {
    return <p className="text-[0.78rem] muted">Loading the hideout…</p>;
  }

  const ready = rows.filter((r) => r.next && r.status === "available");
  const building = rows.filter((r) => r.next && r.status === "active");
  const finished = rows.filter((r) => !r.next || r.status === "completed").length;

  return (
    <div>
      <ul className="stat-row">
        <Stat label="Ready" value={ready.length} tone="accent" />
        <Stat label="Building" value={building.length} />
        <Stat label="Maxed" value={finished} of={rows.length} />
      </ul>
      {[...building, ...ready].slice(0, 4).length > 0 && (
        <ul className="mt-3 space-y-1">
          {[...building, ...ready].slice(0, 4).map((r) => (
            <li key={r.station.id} className="flex items-baseline justify-between gap-2 text-[0.8rem]">
              <span className="truncate font-medium">{r.station.name}</span>
              <span className="flex-none text-[0.7rem] faint">
                {r.status === "active" ? "building" : "ready"} · level {r.next!.level}
              </span>
            </li>
          ))}
        </ul>
      )}
      <a className="btn btn-sm mt-3" href={href.hideout()} onClick={onNavClick(href.hideout())}>
        Open hideout
      </a>
    </div>
  );
}

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
  onComplete,
  fresh,
}: {
  rows: UpcomingRow[];
  onComplete: (id: string) => void;
  fresh: boolean;
}) {
  const pager = usePager(rows.length, 20);
  if (rows.length === 0) {
    return (
      <EmptyState
        compact
        title={fresh ? "No opening tasks in this mode" : "Nothing upcoming"}
        hint={fresh ? undefined : "Mark a task active, or finish one so the next in the chain opens."}
      />
    );
  }

  const slice = rows.slice(pager.start, pager.end);

  return (
    <>
    <ul className="space-y-1">
      {slice.map((row) => (
        <li key={row.id} className="surface-2 flex items-start gap-2.5 p-2">
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
          <button
            type="button"
            className="btn btn-ghost btn-icon flex-none"
            style={{ color: "var(--ok)" }}
            aria-label={`Mark ${displayName(row.name)} done`}
            title="Mark done — it leaves this list and the next quest fills in"
            onClick={() => onComplete(row.id)}
          >
            <Icon path={icons.check} size={16} />
          </button>
        </li>
      ))}
    </ul>
    <Pager {...pager} noun="quests" />
    </>
  );
}

function KeyList({
  rows,
  owned,
  onOwned,
}: {
  rows: ReturnType<typeof collectKeys>;
  owned: Record<string, true>;
  onOwned: (id: string, have: boolean) => void;
}) {
  const open = rows.filter((k) => !owned[k.item.id]);
  const pager = usePager(open.length, 20);
  if (open.length === 0) {
    return <EmptyState compact title="No keys needed" hint="Nothing coming up is behind a locked door." />;
  }
  const slice = open.slice(pager.start, pager.end);
  return (
    <>
    <ul className="space-y-1">
      {slice.map((k) => (
        <li key={k.item.id} className="surface-2 flex items-center gap-2.5 p-2">
          {k.item.icon && (
            <img
              src={k.item.icon}
              alt=""
              width={28}
              height={28}
              loading="lazy"
              className="flex-none rounded"
              onError={(e) => {
                e.currentTarget.style.visibility = "hidden";
              }}
            />
          )}
          <div className="min-w-0 flex-1">
            <p className="truncate text-[0.8125rem] font-medium">{k.item.name}</p>
            <p className="truncate text-[0.7rem]" style={{ color: "var(--text-faint)" }}>
              {k.tasks.join(", ")}
              {k.maps.length ? ` · ${k.maps.join(", ")}` : ""}
            </p>
          </div>
          <button
            type="button"
            className="btn btn-ghost btn-icon flex-none"
            aria-label={`Mark ${k.item.name} acquired`}
            title="Mark acquired — it leaves this list and the next key fills in"
            onClick={() => onOwned(k.item.id, true)}
          >
            <span className="key-acquire" aria-hidden="true" />
          </button>
        </li>
      ))}
    </ul>
    <Pager {...pager} noun="keys" />
    </>
  );
}

function ItemMosaic({
  rows,
  catalog,
}: {
  rows: ReturnType<typeof collectTaskItems>;
  catalog: Record<string, { width?: number; height?: number }>;
}) {
  const [openId, setOpenId] = useState<string | null>(null);
  if (rows.length === 0) {
    return (
      <EmptyState compact title="Nothing to find" hint="No remaining hand-ins on the current plan." />
    );
  }
  return (
    <>
      <div className="item-mosaic">
        {rows.map((row) => {
          const w = Math.min(4, Math.max(1, catalog[row.itemId]?.width ?? 1));
          const h = Math.min(4, Math.max(1, catalog[row.itemId]?.height ?? 1));
          return (
            <button
              key={row.itemId}
              type="button"
              className="item-mosaic-cell"
              style={{ gridColumn: `span ${w}`, gridRow: `span ${h}` }}
              title={`${row.itemName} · ${row.remaining} left · ${row.taskName}`}
              aria-label={`${row.itemName}, ${row.remaining} left`}
              onClick={() => setOpenId(row.taskId)}
            >
              {row.icon && (
                <img
                  src={row.icon}
                  alt=""
                  loading="lazy"
                  onError={(e) => {
                    e.currentTarget.style.visibility = "hidden";
                  }}
                />
              )}
              <span className="item-mosaic-badge">{row.remaining}</span>
            </button>
          );
        })}
      </div>
      {openId && <TaskSheet taskId={openId} onClose={() => setOpenId(null)} />}
    </>
  );
}

const PAGE_SIZES = [10, 20] as const;

function usePager(total: number, initialSize: number) {
  const [size, setSize] = useState(initialSize);
  const [page, setPage] = useState(0);
  const pages = Math.max(1, Math.ceil(total / size) || 1);
  const current = Math.min(page, pages - 1);
  return {
    page: current,
    pages,
    size,
    start: current * size,
    end: Math.min(total, (current + 1) * size),
    total,
    setPage,
    setSize: (n: number) => {
      setSize(n);
      setPage(0);
    },
  };
}

function pageWindow(current: number, pages: number): number[] {
  const span = 5;
  let from = Math.max(0, current - 2);
  let to = Math.min(pages, from + span);
  from = Math.max(0, to - span);
  return Array.from({ length: to - from }, (_, i) => from + i);
}

function Pager({
  page,
  pages,
  size,
  start,
  end,
  total,
  setPage,
  setSize,
  noun,
}: ReturnType<typeof usePager> & { noun: string }) {
  if (total === 0) return null;
  return (
    <div className="pager">
      {pages > 1 && (
        <>
      <button type="button" className="btn btn-ghost" disabled={page === 0} onClick={() => setPage(0)} aria-label="First page">
        «
      </button>
      <button
        type="button"
        className="btn btn-ghost"
        disabled={page === 0}
        onClick={() => setPage(page - 1)}
        aria-label="Previous page"
      >
        ‹
      </button>
      {pageWindow(page, pages).map((n) => (
        <button
          key={n}
          type="button"
          className={n === page ? "btn is-active" : "btn btn-ghost"}
          aria-current={n === page ? "page" : undefined}
          onClick={() => setPage(n)}
        >
          {n + 1}
        </button>
      ))}
      <button
        type="button"
        className="btn btn-ghost"
        disabled={page >= pages - 1}
        onClick={() => setPage(page + 1)}
        aria-label="Next page"
      >
        ›
      </button>
      <button
        type="button"
        className="btn btn-ghost"
        disabled={page >= pages - 1}
        onClick={() => setPage(pages - 1)}
        aria-label="Last page"
      >
        »
      </button>
        </>
      )}
      <select
        className="input"
        style={{ width: "auto", paddingRight: "1.6rem" }}
        aria-label={`${noun} per page`}
        value={size}
        onChange={(e) => setSize(Number(e.target.value))}
      >
        {PAGE_SIZES.map((n) => (
          <option key={n} value={n}>
            {n}
          </option>
        ))}
      </select>
      <span className="text-[0.68rem]" style={{ color: "var(--text-faint)" }}>
        {start + 1}–{end} of {total} {noun}
      </span>
    </div>
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

function rowsFromPlan(
  data: Progression | null,
  availability: Record<string, TaskAvailability>,
  mode: GameMode,
  ids: string[],
  limit: number,
): UpcomingRow[] {
  if (!data) return [];
  const rows: UpcomingRow[] = [];
  for (const id of ids) {
    const task = data.tasks[id];
    if (!task || !visibleInMode(task.name, mode)) continue;
    const state = availability[id];
    if (!state) continue;
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
    if (rows.length >= limit) break;
  }
  return rows;
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
    else if (state === "active" || state === "pinned") stats.active++;
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
