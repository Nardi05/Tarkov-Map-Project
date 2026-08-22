import { useEffect, useMemo, useState } from "react";
import { useMapIndex, useProgression } from "../lib/data";
import { useDebouncedInput } from "../lib/use-debounced-input";
import {
  computeAvailability,
  failureUnlocks,
  lockReasons,
  prerequisiteClosure,
  type LockReason,
} from "../lib/progression";
import { prettyMapName } from "../lib/kord-season";
import { collectKeys, collectNeeds } from "../lib/quest-lists";
import { href, navigate, onNavClick, type QuestView } from "../lib/router";
import { nextRaids } from "../lib/next-raid";
import { displayName, visibleInMode } from "../lib/task-variant";
import { useItemCounts, useKeysOwned, useMarkerDone, useStore, useTaskStatus } from "../store";
import { GAME_EDITIONS, type Faction, type GameEdition, type Profile } from "../lib/persist-migrate";
import type { TaskAvailability, TaskStatus } from "../types";
import ItemAudit from "./ItemAudit";
import NextRaid from "./NextRaid";
import SavePanel from "./SavePanel";
import SeasonPanel from "./SeasonPanel";
import TaskGraphPage from "./TaskGraphPage";
import { useSlashSearch } from "./ShortcutHelp";
import TaskName from "./TaskName";
import TaskStatusControl from "./TaskStatusControl";
import { EmptyState, Icon, icons } from "./ui";

/**
 * The quest tracker.
 *
 * The maps answer "what is on this map"; this answers "what should I be doing".
 * It reads the full task graph — including the ~165 tasks that never appear on
 * a map, which is why it cannot be built from the per-map payloads — and works
 * out what is available given what the player has told us they have done.
 *
 * The rule this page exists to honour: the graph may infer, but what the player
 * declares always wins. Every task shown here carries its own status control,
 * so a wrong inference is one click from being corrected, and the correction is
 * what the map then draws.
 */

/** A task flattened into what the lists actually render. */
interface Row {
  id: string;
  name: string;
  trader: string;
  level: number;
  availability: TaskAvailability;
  kappa: boolean;
  maps: string[];
  gates: string[];
  wiki: string | null;
  /** True when some other quest is offered only if you fail this one. */
  failable: boolean;
  /** Populated only for locked rows — computing it for all 511 is wasted work. */
  blockers: LockReason[];
}

const FACTIONS: Faction[] = ["Any", "USEC", "BEAR"];

const QUEST_VIEWS: { id: QuestView; label: string }[] = [
  { id: "list", label: "List" },
  { id: "graph", label: "Graph" },
  { id: "items", label: "Items" },
];

const EDITION_LABEL: Record<GameEdition, string> = {
  standard: "Standard",
  leftBehind: "Left Behind",
  prepareToEscape: "Prepare for Escape",
  edgeOfDarkness: "Edge of Darkness",
  unheard: "The Unheard",
};

export default function QuestsPage({
  view = "list",
  focus = null,
}: {
  view?: QuestView;
  focus?: string | null;
}) {
  useSlashSearch();
  const progression = useProgression();
  const taskStatus = useTaskStatus();
  const markerDone = useMarkerDone();
  const itemCounts = useItemCounts();
  const keysOwned = useKeysOwned();
  const profile = useStore((s) => s.profile);
  const setProfile = useStore((s) => s.setProfile);
  const cycleTaskStatus = useStore((s) => s.cycleTaskStatus);
  const setTaskStatus = useStore((s) => s.setTaskStatus);
  const completeWithPrereqs = useStore((s) => s.completeWithPrereqs);
  const setKeyOwned = useStore((s) => s.setKeyOwned);

  /* Committed search term; `typed` is what the box shows while you type. */
  const [query, setQuery] = useState("");
  const [typed, setTyped] = useDebouncedInput(query, setQuery);

  const data = progression.data;
  const maps = useMapIndex();

  useEffect(() => {
    if (!focus || !data) return;
    const task = data.tasks[focus];
    const label = task ? displayName(task.name) : focus;
    setQuery(label);
  }, [focus, data, setQuery]);

  const availability = useMemo(
    () => computeAvailability(data, taskStatus, profile),
    [data, taskStatus, profile],
  );

  /*
   * The handful of quests whose *failure* the graph branches on. Two today —
   * Hot Wheels and Chemical - Part 4 — and between them they gate six tasks
   * that no player could otherwise ever be shown.
   */
  const failable = useMemo(() => failureUnlocks(data), [data]);

  const rows = useMemo<Row[]>(() => {
    if (!data) return [];
    return Object.entries(data.tasks)
      .filter(([, task]) => visibleInMode(task.name, profile.mode))
      .map(([id, task]) => ({
        id,
        name: task.name,
        trader: task.trader ?? "Unknown",
        level: task.minPlayerLevel,
        availability: availability[id] ?? "locked",
        kappa: task.kappaRequired,
        maps: task.maps,
        gates: task.traderGates
          .filter((g) => g.kind === "level")
          .map((g) => `${g.trader} LL${g.value}`),
        wiki: task.wiki,
        failable: failable.has(id),
        blockers: [],
      }));
  }, [data, availability, profile.mode, failable]);

  /*
   * Only traders that actually gate something get a control. Offering all
   * eleven would put four dead selects on screen — Fence, Ref, Lightkeeper and
   * the BTR Driver hand out tasks but never gate one on loyalty.
   */
  const gatingTraders = useMemo(() => {
    const names = new Set<string>();
    for (const task of Object.values(data?.tasks ?? {})) {
      for (const gate of task.traderGates) if (gate.kind === "level") names.add(gate.trader);
    }
    return [...names].sort();
  }, [data]);

  const needle = query.trim().toLowerCase();
  const matches = (row: Row) =>
    !needle ||
    displayName(row.name).toLowerCase().includes(needle) ||
    row.trader.toLowerCase().includes(needle);

  /*
   * Bucketed in one pass, and memoised.
   *
   * These used to be three bare `rows.filter(...)` calls, which meant a new
   * array identity on every render — so `upcoming` below never hit its memo,
   * and neither did the key and find-in-raid lists built from it. Typing in the
   * search box rebuilt both shopping lists on every keystroke.
   */
  const { active, available, completed } = useMemo(() => {
    const out = { active: [] as Row[], available: [] as Row[], completed: [] as Row[] };
    for (const row of rows) {
      if (!matches(row)) continue;
      if (row.availability === "active") out.active.push(row);
      else if (row.availability === "available") out.available.push(row);
      // Failed sits with finished so it stays on screen and can be undone. It
      // is a state you set by hand, so there has to be somewhere to unset it.
      else if (row.availability === "completed" || row.availability === "failed") {
        out.completed.push(row);
      }
    }
    return out;
    // `matches` closes over `needle`, which is the dependency that matters.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [rows, needle]);

  /*
   * Locked is 300+ tasks on a fresh profile and nobody scrolls that. What is
   * actually useful is the edge of the wall — the tasks one step away — so this
   * ranks by how few things are missing, then by level, and shows the top of
   * that list. The blockers are only computed for what survives the filter.
   */
  const locked = useMemo(() => {
    if (!data) return [];
    return rows
      .filter((r) => r.availability === "locked" && matches(r))
      .map((r) => ({ ...r, blockers: lockReasons(data, r.id, taskStatus, profile) }))
      .sort((a, b) => a.blockers.length - b.blockers.length || a.level - b.level)
      .slice(0, 60);
    // `matches` closes over `needle`, which is the dependency that matters.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [data, rows, taskStatus, profile, needle]);

  /** Keys and hand-ins for what you can do next — active first, then available. */
  const upcoming = useMemo(() => [...active, ...available], [active, available]);
  const upcomingIds = useMemo(() => upcoming.map((r) => r.id), [upcoming]);
  const keys = useMemo(() => collectKeys(data, upcomingIds), [data, upcomingIds]);
  const needs = useMemo(
    () => collectNeeds(data, upcomingIds, itemCounts),
    [data, upcomingIds, itemCounts],
  );

  /** "I finished this one" also means everything behind it is finished. */
  const completeWithHistory = (taskId: string) => {
    completeWithPrereqs(taskId, prerequisiteClosure(data, taskId, taskStatus));
  };

  const trackedCount = Object.keys(taskStatus).length;
  const raidPicks = useMemo(
    () => nextRaids(maps.data?.maps ?? [], data, taskStatus, 4, upcomingIds),
    [maps.data, data, taskStatus, upcomingIds],
  );

  if (progression.error) {
    return (
      <Shell>
        <EmptyState
          title="The task graph could not be loaded"
          hint={progression.error.message}
        />
      </Shell>
    );
  }

  return (
    <Shell>
      <header className="mb-6">
        <h1 className="display text-2xl sm:text-3xl">Quests</h1>
        <p className="mt-1.5 max-w-xl text-sm leading-relaxed" style={{ color: "var(--text-dim)" }}>
          Tick what you have accepted. The graph fills in what that unlocks, which map to queue,
          which keys to bring, and what to find in raid.
        </p>
        <nav className="mt-4 flex flex-wrap gap-1.5" aria-label="Quest views">
          {QUEST_VIEWS.map((v) => (
            <a
              key={v.id}
              href={href.quests(v.id)}
              onClick={onNavClick(href.quests(v.id))}
              className={view === v.id ? "chip chip-accent" : "chip chip-button"}
              aria-current={view === v.id ? "page" : undefined}
            >
              {v.label}
            </a>
          ))}
        </nav>
      </header>

      {view === "graph" ? <TaskGraphPage /> : view === "items" ? <ItemAudit /> : null}
      {view !== "list" ? null : (
      <>


      {/* The call to action comes first on a fresh visit. It used to sit third,
          below seven optional trader-loyalty selects — which also made it the
          fourteenth tab stop, so the one thing a new player needs was the
          hardest thing on the page to reach. */}
      <section
        className={`surface flex flex-wrap items-center gap-4 p-4 ${trackedCount === 0 ? "mt-1" : "mt-4"}`}
      >
        <div className="w-full min-w-0 sm:w-auto sm:flex-1">
          <h2 className="text-sm font-semibold">
            {trackedCount === 0 ? "Start by telling it where you are" : "Update your progress"}
          </h2>
          <p className="mt-0.5 text-[0.72rem] leading-snug" style={{ color: "var(--text-faint)" }}>
            {/* Framed by what it costs, because the objection to any setup flow
                is "how long is this going to take". Ticking actives is genuinely
                the whole job — the history falls out of it. */}
            Walk through your traders and tick the quests you have accepted. A quest in your list
            means everything behind it is done, so a couple of dozen ticks rebuild the whole wipe.
          </p>
        </div>
        <a
          className="btn is-active w-full flex-none sm:w-auto"
          href={href.setup()}
          onClick={onNavClick(href.setup())}
        >
          {trackedCount === 0 ? "Set up my progress" : "Run the walkthrough"}
        </a>
      </section>

      <ProfileBar
        profile={profile}
        setProfile={setProfile}
        traders={gatingTraders}
        trackedCount={trackedCount}
        markerCount={Object.keys(markerDone).length}
      />

      <div className="mt-4">
        <SeasonPanel
          mode={profile.mode}
          taskStatus={taskStatus}
          availability={availability}
          onCycle={cycleTaskStatus}
        />
      </div>

      {trackedCount > 0 && (
        <section className="surface mt-4 p-4">
          <h2 className="text-sm font-semibold">Next raid</h2>
          <p className="mb-3 mt-1 text-[0.72rem]" style={{ color: "var(--text-faint)" }}>
            Maps that hold your active tasks, documents as a tie-break.
          </p>
          <NextRaid picks={raidPicks} />
        </section>
      )}

      {data?.coverage && data.coverage.ungated > 0 && (
        <p
          className="surface-2 mt-4 flex items-start gap-2 p-3 text-[0.78rem] leading-relaxed"
          style={{ color: "var(--text-dim)" }}
        >
          <span className="mt-0.5 flex-none" style={{ color: "var(--warn, #facc15)" }}>
            <Icon path={icons.info} size={15} />
          </span>
          <span>
            {/* Numbers, not a vague warning. The old banner said "data may be
                incomplete" on every visit, which tells nobody anything and is
                easy to stop reading. This says how much is actually known.

                "The remaining" used to introduce the ungated count, which is a
                different and much smaller set than the tasks without a
                prerequisite — 372 of 528 followed by "the remaining 58" simply
                does not add up, and the one number a reader can check was the
                one that was wrong. */}
            Prerequisites are known for{" "}
            <strong style={{ color: "var(--text)" }}>
              {data.coverage.withPrereq} of {data.coverage.tasks}
            </strong>{" "}
            tasks. Of the {data.coverage.tasks - data.coverage.withPrereq} without one,{" "}
            <strong style={{ color: "var(--text)" }}>{data.coverage.ungated}</strong> have nothing
            recorded gating them at all — no prerequisite, no level, no loyalty — so they show as
            available from the start and the game may not offer them yet. Your own ticks are never
            affected.
          </span>
        </p>
      )}

      <div className="relative mt-5 w-full max-w-sm">
        <span
          className="pointer-events-none absolute left-2.5 top-1/2 -translate-y-1/2"
          style={{ color: "var(--text-faint)" }}
        >
          <Icon path={icons.search} size={15} />
        </span>
        <input
          className="input input-icon"
          type="search"
          placeholder="Find a task or trader…"
          value={typed}
          onChange={(e) => setTyped(e.target.value)}
          aria-label="Search tasks"
          data-search
        />
      </div>

      {progression.loading && !data ? (
        <p className="py-16 text-center text-sm" style={{ color: "var(--text-dim)" }}>
          Loading the task graph…
        </p>
      ) : trackedCount === 0 && !needle ? (
        /* Five panels of empty states told a new player nothing five times
           over. One sentence and the list of what they will get is a better
           use of the screen. */
        <section className="surface mt-6 p-8 text-center">
          <h2 className="text-base font-semibold">Nothing tracked yet</h2>
          <p
            className="mx-auto mt-2 max-w-md text-[0.85rem] leading-relaxed"
            style={{ color: "var(--text-dim)" }}
          >
            Once you have marked what you are running, this page shows your active tasks, what each
            trader will offer next, the keys those tasks go through and everything you need to find
            in raid — and every map draws your objectives without being asked.
          </p>
          <a className="btn is-active mt-4 inline-flex" href={href.setup()} onClick={onNavClick(href.setup())}>
            Walk me through it
          </a>
          <p className="mt-3 text-[0.72rem]" style={{ color: "var(--text-faint)" }}>
            Or use the search above and tick tasks one at a time.
          </p>

          {/* Restoring has to be reachable from exactly here. Hiding the whole
              backup panel until there is progress also hid the way to bring
              progress back on a new browser, which is the one moment it is
              needed. */}
          <div className="mt-5 border-t pt-4" style={{ borderColor: "var(--line-soft)" }}>
            <SavePanel compact />
          </div>
        </section>
      ) : (
        <div className="mt-6 grid grid-cols-1 gap-4 lg:grid-cols-2">
          <Panel
            title="Active"
            count={active.length}
            hint="Tasks you have in your list right now. These are the ones your maps draw."
            className="lg:col-span-2"
          >
            {active.length === 0 ? (
              <EmptyState
                title="Nothing marked active"
                hint="Tick a task below and it appears here, and on the map it belongs to."
              />
            ) : (
              <TaskList
                rows={active}
                onCycle={cycleTaskStatus}
                onCompleteChain={completeWithHistory}
                onFail={(id) => setTaskStatus(id, "failed")}
              />
            )}
          </Panel>

          <Panel
            title="Available now"
            count={available.length}
            hint="Everything the graph says you can pick up at your level, by trader."
            className="lg:col-span-2"
          >
            {available.length === 0 ? (
              <EmptyState
                title="Nothing available"
                hint="Mark a task or two you have already finished — the rest follows from there."
              />
            ) : (
              <ByTrader
                rows={available}
                onCycle={cycleTaskStatus}
                onCompleteChain={completeWithHistory}
                onFail={(id) => setTaskStatus(id, "failed")}
              />
            )}
          </Panel>

          <Panel
            title="Keys you'll need"
            count={keys.filter((k) => !keysOwned[k.item.id]).length}
            hint="Doors your active and available tasks go through. Tick one when you have it."
          >
            {keys.filter((k) => !keysOwned[k.item.id]).length === 0 ? (
              <EmptyState compact title="No keys needed" hint="Nothing coming up is behind a locked door." />
            ) : (
              <ul className="space-y-1">
                {keys
                  .filter((k) => !keysOwned[k.item.id])
                  .map((k) => (
                  <li key={k.item.id} className="surface-2 flex items-center gap-2.5 p-2">
                    {k.item.icon && (
                      <img
                        src={k.item.icon}
                        alt=""
                        width={28}
                        height={28}
                        loading="lazy"
                        className="flex-none rounded"
                      />
                    )}
                    <div className="min-w-0 flex-1">
                      <p className="truncate text-[0.8125rem] font-medium">{k.item.name}</p>
                      <p className="truncate text-[0.7rem]" style={{ color: "var(--text-faint)" }}>
                        {k.tasks.length} task{k.tasks.length === 1 ? "" : "s"}
                        {k.maps.length ? ` · ${k.maps.join(", ")}` : ""}
                      </p>
                    </div>
                    <button
                      type="button"
                      className="btn btn-ghost btn-icon flex-none"
                      aria-label={`Mark ${k.item.name} acquired`}
                      title="Mark acquired"
                      onClick={() => setKeyOwned(k.item.id, true)}
                    >
                      <span className="key-acquire" aria-hidden="true" />
                    </button>
                  </li>
                ))}
              </ul>
            )}
          </Panel>

          <Panel
            title="Find in raid"
            count={needs.length}
            hint="Items your coming tasks want handed in, found in raid."
          >
            {needs.length === 0 ? (
              <EmptyState
                compact
                title="Nothing to find"
                hint="No found-in-raid hand-ins among your active and available tasks."
              />
            ) : (
              <ul className="space-y-1">
                {needs.map((n) => (
                  <li key={n.name} className="surface-2 flex items-center gap-2.5 p-2">
                    {n.icon && (
                      <img
                        src={n.icon}
                        alt=""
                        width={28}
                        height={28}
                        loading="lazy"
                        className="flex-none rounded"
                      />
                    )}
                    <div className="min-w-0 flex-1">
                      <p className="truncate text-[0.8125rem] font-medium">{n.name}</p>
                      <p className="truncate text-[0.7rem]" style={{ color: "var(--text-faint)" }}>
                        {n.tasks.join(", ")}
                      </p>
                    </div>
                    <span
                      className="chip flex-none tabular-nums"
                      title={`${n.count - n.remaining} in stash, ${n.count} needed`}
                      style={n.remaining === 0 ? { color: "var(--ok)" } : undefined}
                    >
                      {n.remaining === 0 ? "have" : `×${n.remaining}`}
                    </span>
                  </li>
                ))}
              </ul>
            )}
          </Panel>

          <Panel
            title="Coming up"
            count={locked.length}
            hint="Locked tasks, closest first, with what is standing in the way."
            className="lg:col-span-2"
          >
            {locked.length === 0 ? (
              <EmptyState title="Nothing locked" hint="Everything the graph knows about is open." />
            ) : (
              <ul className="space-y-1">
                {locked.map((row) => (
                  <TaskRow
                    key={row.id}
                    row={row}
                    status={undefined}
                    onCycle={() => cycleTaskStatus(row.id)}
                    onCompleteChain={() => completeWithHistory(row.id)}
                    onFail={row.failable ? () => setTaskStatus(row.id, "failed") : undefined}
                  />
                ))}
              </ul>
            )}
          </Panel>

          {completed.length > 0 && (
            <Panel
              title="Finished"
              count={completed.length}
              hint="Everything you have closed out, done or failed. Untick anything you have not actually done."
              className="lg:col-span-2"
              collapsed
            >
              <ByTrader
                rows={completed}
                onCycle={cycleTaskStatus}
                onCompleteChain={completeWithHistory}
                onFail={(id) => setTaskStatus(id, "failed")}
              />
            </Panel>
          )}
        </div>
      )}

      {/* Last, and only when there is something to save. Offering to back up an
          empty profile is noise on the one screen a new player most needs to
          be able to read. */}
      {trackedCount > 0 && <SavePanel />}
      </>
      )}
    </Shell>
  );
}

/* ------------------------------------------------------------------ layout */

/*
 * The page frame — the scroll container, the wordmark, the section nav and the
 * mode switch — now belongs to TabShell, one level up, so it survives a change
 * of tab. What is left here is only what this page puts inside it.
 */
function Shell({ children }: { children: React.ReactNode }) {
  return <>{children}</>;
}

function Panel({
  title,
  count,
  hint,
  className,
  collapsed,
  children,
}: {
  title: string;
  count: number;
  hint: string;
  className?: string;
  /** Starts shut. For lists that are long and rarely the reason you came. */
  collapsed?: boolean;
  children: React.ReactNode;
}) {
  const [open, setOpen] = useState(!collapsed);

  return (
    <section className={`surface p-3 ${className ?? ""}`}>
      <header className="mb-2 flex items-start gap-2">
        <button
          type="button"
          className="flex min-w-0 flex-1 items-start gap-2 text-left"
          aria-expanded={open}
          onClick={() => setOpen((v) => !v)}
        >
          <span
            className="mt-0.5 flex-none transition-transform"
            style={{ color: "var(--text-faint)", transform: open ? undefined : "rotate(-90deg)" }}
          >
            <Icon path={icons.chevron} size={16} />
          </span>
          <span className="min-w-0">
            <span className="flex items-baseline gap-2">
              <h2 className="text-sm font-semibold">{title}</h2>
              <span className="chip flex-none tabular-nums">{count}</span>
            </span>
            <span
              className="mt-0.5 block text-[0.7rem] leading-snug"
              style={{ color: "var(--text-faint)" }}
            >
              {hint}
            </span>
          </span>
        </button>
      </header>
      {open && children}
    </section>
  );
}

function ProfileBar({
  profile,
  setProfile,
  traders,
  trackedCount,
  markerCount,
}: {
  profile: Profile;
  setProfile: <K extends keyof Profile>(key: K, value: Profile[K]) => void;
  /** Traders that actually gate something, from the graph. */
  traders: string[];
  trackedCount: number;
  markerCount: number;
}) {
  const set = traders.filter((t) => typeof profile.traderLevels[t] === "number").length;

  return (
    <div className="surface mt-4 flex flex-wrap items-end gap-3 p-4">
      <Field label="Faction" hint="Hides the other side's exclusive tasks.">
        <select
          className="input"
          style={{ width: "auto", paddingRight: "1.75rem" }}
          value={profile.faction}
          onChange={(e) => setProfile("faction", e.target.value as Faction)}
          aria-label="Faction"
        >
          {FACTIONS.map((f) => (
            <option key={f} value={f}>
              {f}
            </option>
          ))}
        </select>
      </Field>

      <Field label="Edition" hint="Which game edition this character is.">
        <select
          className="input"
          style={{ width: "auto", paddingRight: "1.75rem" }}
          value={profile.gameEdition}
          onChange={(e) => setProfile("gameEdition", e.target.value as GameEdition)}
          aria-label="Game edition"
        >
          {GAME_EDITIONS.map((ed) => (
            <option key={ed} value={ed}>
              {EDITION_LABEL[ed]}
            </option>
          ))}
        </select>
      </Field>

      <Field label="Level" hint="Level-gated tasks stay locked until you reach them.">
        <input
          className="input tabular-nums"
          style={{ width: "5rem" }}
          type="number"
          min={1}
          max={79}
          value={profile.level}
          onChange={(e) => {
            const n = Number(e.target.value);
            if (Number.isFinite(n)) setProfile("level", Math.min(79, Math.max(1, Math.round(n))));
          }}
          aria-label="PMC level"
        />
      </Field>

      <p
        className="w-full text-[0.7rem] leading-snug sm:ml-auto sm:w-auto sm:text-right"
        style={{ color: "var(--text-faint)" }}
      >
        {trackedCount} task{trackedCount === 1 ? "" : "s"} tracked
        <span className="hidden sm:inline">
          <br />
        </span>
        <span className="sm:hidden"> · </span>
        {markerCount} location{markerCount === 1 ? "" : "s"} ticked
      </p>

      {traders.length > 0 && (
        <details className="w-full border-t pt-3" style={{ borderColor: "var(--line-soft)" }}>
          <summary
            className="cursor-pointer text-[0.68rem] font-semibold uppercase tracking-[0.09em]"
            style={{ color: "var(--text-dim)" }}
          >
            Trader loyalty
            {set > 0 && (
              <span className="ml-1.5 font-normal normal-case tracking-normal" style={{ color: "var(--text-faint)" }}>
                {set} set
              </span>
            )}
          </summary>
          <p className="mt-1 text-[0.66rem] leading-snug" style={{ color: "var(--text-faint)" }}>
            {/* The honest framing: this only ever narrows the list, and only for
                traders you name. Blank is a valid answer, not an unfinished one. */}
            Optional. Set a trader and its higher-loyalty tasks stay locked until you get there.
            Leave one blank and it is never used against you.
          </p>
          <div className="mt-2 flex flex-wrap gap-2">
            {traders.map((trader) => (
              <label key={trader} className="flex items-center gap-1.5">
                <span className="text-[0.72rem]" style={{ color: "var(--text-dim)" }}>
                  {trader}
                </span>
                <select
                  className="input tabular-nums"
                  style={{ width: "auto", padding: "0.2rem 1.4rem 0.2rem 0.45rem" }}
                  value={profile.traderLevels[trader] ?? ""}
                  onChange={(e) => {
                    const next = { ...profile.traderLevels };
                    // Removing the key, not storing 0: absent means "not told",
                    // and the engine treats those two very differently.
                    if (e.target.value === "") delete next[trader];
                    else next[trader] = Number(e.target.value);
                    setProfile("traderLevels", next);
                  }}
                  aria-label={`${trader} loyalty level`}
                >
                  <option value="">—</option>
                  {[1, 2, 3, 4].map((n) => (
                    <option key={n} value={n}>
                      LL{n}
                    </option>
                  ))}
                </select>
              </label>
            ))}
          </div>
        </details>
      )}
    </div>
  );
}

function Field({
  label,
  hint,
  children,
}: {
  label: string;
  hint: string;
  children: React.ReactNode;
}) {
  return (
    <label className="block">
      <span
        className="mb-1 block text-[0.68rem] font-semibold uppercase tracking-[0.09em]"
        style={{ color: "var(--text-dim)" }}
      >
        {label}
      </span>
      {children}
      <span className="mt-1 block text-[0.66rem]" style={{ color: "var(--text-faint)" }}>
        {hint}
      </span>
    </label>
  );
}

/* ------------------------------------------------------------------- lists */

function ByTrader({
  rows,
  onCycle,
  onCompleteChain,
  onFail,
}: {
  rows: Row[];
  onCycle: (id: string) => void;
  onCompleteChain: (id: string) => void;
  onFail?: (id: string) => void;
}) {
  const groups = useMemo(() => {
    const byTrader = new Map<string, Row[]>();
    for (const row of rows) {
      const list = byTrader.get(row.trader);
      if (list) list.push(row);
      else byTrader.set(row.trader, [row]);
    }
    return [...byTrader.entries()]
      .map(([trader, list]) => ({
        trader,
        list: [...list].sort((a, b) => a.level - b.level || a.name.localeCompare(b.name)),
      }))
      // Alphabetical, not biggest-first: a player looks for a trader by name,
      // and a list that reorders itself as they tick things off is unreadable.
      .sort((a, b) => a.trader.localeCompare(b.trader));
  }, [rows]);

  return (
    <div className="space-y-3">
      {groups.map((group) => (
        <div key={group.trader}>
          <h3
            className="mb-1 text-[0.7rem] font-semibold uppercase tracking-[0.09em]"
            style={{ color: "var(--text-dim)" }}
          >
            {group.trader}
            <span className="ml-1.5 font-normal" style={{ color: "var(--text-faint)" }}>
              {group.list.length}
            </span>
          </h3>
          <ul className="space-y-1">
            {group.list.map((row) => (
              <TaskRow
                key={row.id}
                row={row}
                status={
                  row.availability === "completed" || row.availability === "failed"
                    ? row.availability
                    : undefined
                }
                onCycle={() => onCycle(row.id)}
                onCompleteChain={() => onCompleteChain(row.id)}
                onFail={row.failable && onFail ? () => onFail(row.id) : undefined}
              />
            ))}
          </ul>
        </div>
      ))}
    </div>
  );
}

function TaskList({
  rows,
  onCycle,
  onCompleteChain,
  onFail,
}: {
  rows: Row[];
  onCycle: (id: string) => void;
  onCompleteChain: (id: string) => void;
  onFail?: (id: string) => void;
}) {
  return (
    <ul className="space-y-1">
      {[...rows]
        .sort((a, b) => a.trader.localeCompare(b.trader) || a.level - b.level)
        .map((row) => (
          <TaskRow
            key={row.id}
            row={row}
            status="active"
            onCycle={() => onCycle(row.id)}
            onCompleteChain={() => onCompleteChain(row.id)}
            onFail={row.failable && onFail ? () => onFail(row.id) : undefined}
          />
        ))}
    </ul>
  );
}

function TaskRow({
  row,
  status,
  onCycle,
  onCompleteChain,
  onFail,
}: {
  row: Row;
  status: TaskStatus | undefined;
  onCycle: () => void;
  onCompleteChain: () => void;
  /** Only passed for a quest the graph branches on failing. */
  onFail?: () => void;
}) {
  return (
    <li className="surface-2 flex items-start gap-2.5 p-2">
      <span className="mt-0.5">
        <TaskStatusControl status={status} name={row.name} onCycle={onCycle} />
      </span>

      <div className="min-w-0 flex-1">
        <p className="flex flex-wrap items-baseline gap-x-2 gap-y-0.5">
          <span className="text-[0.8125rem] font-medium">
            <TaskName name={row.name} />
          </span>
          <span className="text-[0.68rem]" style={{ color: "var(--text-faint)" }}>
            {/* Most tasks report level 0, which is not a requirement worth
                printing 300 times. */}
            {row.trader}
            {row.level > 1 ? ` · lvl ${row.level}` : ""}
          </span>
          {row.kappa && <span className="chip flex-none">Kappa</span>}
        </p>

        {row.gates.length > 0 && (
          /* Shown, not enforced: the site has no way to know your loyalty
             levels, so treating these as locks would hide half the game. */
          <p className="mt-1 flex flex-wrap gap-1">
            {row.gates.map((g) => (
              <span key={g} className="chip">
                {g}
              </span>
            ))}
          </p>
        )}

        {row.blockers.length > 0 && (
          <p className="mt-1 text-[0.7rem] leading-snug" style={{ color: "var(--text-faint)" }}>
            Needs{" "}
            {row.blockers.map((b, i) => (
              <span key={`${b.kind}-${b.label}`}>
                {i > 0 && ", "}
                {b.label}
                {/* The feed states barely half of these; the rest are the
                    wiki's word. Somebody deciding whether to trust a lock
                    should be able to see which they are looking at. */}
                {b.from === "wiki" && (
                  <span title="From the wiki, not the game data feed"> (per the wiki)</span>
                )}
              </span>
            ))}
          </p>
        )}

        {row.maps.length > 0 && (
          <p className="mt-1 flex flex-wrap gap-1">
            {row.maps.map((map) => (
              <button
                key={map}
                type="button"
                className="chip chip-accent chip-button"
                onClick={() => navigate(href.map(map, row.id))}
                title={`Open ${displayName(row.name)} on this map`}
              >
                {prettyMapName(map)}
              </button>
            ))}
          </p>
        )}
      </div>

      <div className="flex flex-none items-center gap-1">
        {status !== "completed" && status !== "failed" && (
          <button
            type="button"
            className="btn btn-ghost text-[0.68rem]"
            style={{ padding: "0.25rem 0.5rem", color: "var(--text-faint)" }}
            onClick={onCompleteChain}
            title={`Mark ${displayName(row.name)} done, and everything it needed before it`}
          >
            Done + earlier
          </button>
        )}
        {/* Offered only where failing actually leads somewhere, which keeps a
            destructive-sounding button off 500 rows that have no use for it. */}
        {onFail && status !== "failed" && (
          <button
            type="button"
            className="btn btn-ghost text-[0.68rem]"
            style={{ padding: "0.25rem 0.5rem", color: "var(--danger)" }}
            onClick={onFail}
            title={`Mark ${displayName(row.name)} failed — that is what unlocks the quests that follow a failure`}
          >
            Failed
          </button>
        )}
        {row.wiki && (
          <a
            className="btn btn-ghost btn-icon"
            href={row.wiki}
            target="_blank"
            rel="noreferrer noopener"
            aria-label={`${displayName(row.name)} on the wiki`}
          >
            <Icon path={icons.external} size={15} />
          </a>
        )}
      </div>
    </li>
  );
}


