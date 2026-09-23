import { useEffect, useMemo, useState } from "react";
import { useMapIndex, useProgression } from "../lib/data";
import { useDebouncedInput } from "../lib/use-debounced-input";
import { computeAvailability, failureUnlocks, type LockReason } from "../lib/progression";
import { href, onNavClick, type QuestView } from "../lib/router";
import { nextRaids } from "../lib/next-raid";
import { displayName, visibleInMode } from "../lib/task-variant";
import { useMarkerDone, useStore, useTaskStatus } from "../store";
import { GAME_EDITIONS, type Faction, type GameEdition, type Profile } from "../lib/persist-migrate";
import type { TaskAvailability } from "../types";
import ItemAudit from "./ItemAudit";
import NextRaid from "./NextRaid";
import SavePanel from "./SavePanel";
import SeasonPanel from "./SeasonPanel";
import SideQuestList, { SideQuestLegend } from "./SideQuestList";
import TaskGraphPage from "./TaskGraphPage";
import { useSlashSearch } from "./ShortcutHelp";
import { Callout, Card, EmptyState, Icon, icons, PageHeader, SectionHead, Term } from "./ui";

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

/**
 * The three things this page can show you. Labelled by what you get rather
 * than by what they are built from — "Unlocks" beats "Graph" for somebody who
 * has not seen one before.
 */
const QUEST_VIEWS: { id: QuestView; label: string; hint: string }[] = [
  { id: "list", label: "Your list", hint: "Active, available and locked tasks" },
  { id: "graph", label: "Unlocks", hint: "What finishing a task opens up" },
  { id: "items", label: "Stash", hint: "Items and keys your tasks need" },
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
  const profile = useStore((s) => s.profile);
  const setProfile = useStore((s) => s.setProfile);
  const cycleTaskStatus = useStore((s) => s.cycleTaskStatus);

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

  /*
   * The ids the "next raid" picker ranks maps by: what you are on, and what is
   * open to you. The page used to bucket every row here for four panels that
   * have since become one self-contained list (SideQuestList), which does its
   * own bucketing — so all that survives is this.
   */
  const upcomingIds = useMemo(
    () =>
      rows
        .filter((r) => r.availability === "active" || r.availability === "available")
        .map((r) => r.id),
    [rows],
  );


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
      <PageHeader
        title="Side quests"
        lead={
          <>
            Tick what your <Term id="trader">traders</Term> have given you. This page is only side
            quests — story chapters and endings are on{" "}
            <a className="underline" href={href.story()} onClick={onNavClick(href.story())}>
              Story
            </a>
            .
          </>
        }
      >
        <nav className="flex flex-wrap gap-1.5" aria-label="Quest views">
          {QUEST_VIEWS.map((v) => (
            <a
              key={v.id}
              href={href.quests(v.id)}
              onClick={onNavClick(href.quests(v.id))}
              className={view === v.id ? "btn is-active" : "btn"}
              aria-current={view === v.id ? "page" : undefined}
              title={v.hint}
            >
              {v.label}
            </a>
          ))}
        </nav>
      </PageHeader>

      {view === "graph" ? <TaskGraphPage /> : view === "items" ? <ItemAudit /> : null}
      {view !== "list" ? null : (
      <>


      {/* The call to action comes first on a fresh visit. It used to sit third,
          below seven optional trader-loyalty selects — which also made it the
          fourteenth tab stop, so the one thing a new player needs was the
          hardest thing on the page to reach. */}
      <div className="stack">
        <Card
          title={trackedCount === 0 ? "Start by telling it where you are" : "Update your progress"}
          hint={
            /* Framed by what it costs, because the objection to any setup flow
               is "how long is this going to take". Ticking actives is genuinely
               the whole job — the history falls out of it. */
            "Walk through your traders and tick the quests you have accepted. A quest in your list means everything behind it is done, so a couple of dozen ticks rebuild the whole wipe."
          }
          action={
            <a
              className={trackedCount === 0 ? "btn btn-primary flex-none" : "btn flex-none"}
              href={href.setup()}
              onClick={onNavClick(href.setup())}
            >
              {trackedCount === 0 ? "Set up my progress" : "Run the walkthrough"}
            </a>
          }
        />

        <ProfileBar
          profile={profile}
          setProfile={setProfile}
          traders={gatingTraders}
          trackedCount={trackedCount}
          markerCount={Object.keys(markerDone).length}
        />

        <SeasonPanel
          mode={profile.mode}
          taskStatus={taskStatus}
          availability={availability}
          onCycle={cycleTaskStatus}
        />

        {trackedCount > 0 && (
          <Card
            title="Next raid"
            hint="Maps that hold your active tasks, with document spawns as a tie-break."
          >
            <NextRaid picks={raidPicks} />
          </Card>
        )}

      {data?.coverage && data.coverage.ungated > 0 && (
        <Callout>
          <span>
            {/* Numbers, not a vague warning. The old banner said "data may be
                incomplete" on every visit, which tells nobody anything and is
                easy to stop reading. This says how much is actually known.

                "The remaining" used to introduce the ungated count, which is a
                different and much smaller set than the tasks without a
                prerequisite — 372 of 528 followed by "the remaining 58" simply
                does not add up, and the one number a reader can check was the
                one that was wrong. */}
            Unlock data covers{" "}
            <strong style={{ color: "var(--text)" }}>
              {data.coverage.withPrereq}/{data.coverage.tasks}
            </strong>{" "}
            tasks. {data.coverage.ungated} have no recorded gate and may show too early. Your ticks
            are never changed.
          </span>
        </Callout>
      )}

      <div>
        <SectionHead
          title="Your side quests"
          hint={<SideQuestLegend />}
          action={
            <div className="relative w-full sm:w-72">
              <span className="pointer-events-none absolute left-2.5 top-1/2 -translate-y-1/2 faint">
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
          }
        />
      </div>

      {progression.loading && !data ? (
        <p className="py-16 text-center text-sm muted">Loading the task graph…</p>
      ) : trackedCount === 0 && !needle ? (
        /* Five panels of empty states told a new player nothing five times
           over. One sentence and the list of what they will get is a better
           use of the screen. */
        <section className="surface p-8 text-center">
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
        <SideQuestList search={needle} />
      )}

      {/* Last, and only when there is something to save. Offering to back up an
          empty profile is noise on the one screen a new player most needs to
          be able to read. */}
      {trackedCount > 0 && <SavePanel />}
      </div>
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
    <Card
      title="This character"
      hint="What the tracker assumes about you. Getting these right is what stops it offering tasks you cannot take."
    >
      <div className="flex flex-wrap items-end gap-3">
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

      <p className="w-full text-[0.7rem] leading-snug faint sm:ml-auto sm:w-auto sm:text-right">
        {trackedCount} task{trackedCount === 1 ? "" : "s"} tracked
        <span className="hidden sm:inline">
          <br />
        </span>
        <span className="sm:hidden"> · </span>
        {markerCount} location{markerCount === 1 ? "" : "s"} ticked
      </p>
      </div>

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
    </Card>
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
