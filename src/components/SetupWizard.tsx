import { useEffect, useMemo, useState } from "react";
import { useProgression } from "../lib/data";
import { disposeOcr } from "../lib/ocr";
import { prerequisiteClosure } from "../lib/progression";
import { href, onNavClick } from "../lib/router";
import { displayName, visibleInMode } from "../lib/task-variant";
import { useStore, useTaskStatus } from "../store";
import type { Faction, GameMode } from "../lib/persist-migrate";
import type { Progression, TaskStatus } from "../types";
import ModeSwitch from "./ModeSwitch";
import SavePanel from "./SavePanel";
import ScreenshotImport from "./ScreenshotImport";
import TaskName from "./TaskName";
import TaskStatusControl from "./TaskStatusControl";
import { EmptyState, Icon, icons } from "./ui";

/**
 * The first-run walkthrough: what are you running at each trader right now?
 *
 * This replaced a TarkovTracker import, and it is not a downgrade. That API
 * only ever knew which tasks you had *finished*; it had no concept of one being
 * accepted at a trader. An active task is the stronger fact, because a trader
 * will not hand it to you until everything behind it is done — so twenty ticks
 * here reconstruct a whole wipe's history through `prerequisiteClosure`, and it
 * needs no third party to still be online in a year.
 *
 * Two rules shape the whole screen:
 *
 *   Nothing is written until you press Finish. Ticks are staged locally so that
 *   unticking is free. Applying the closure on every keystroke would mean a
 *   mistaken tick silently marked a dozen tasks done and unticking left them
 *   there, which is exactly the kind of quiet wrongness this feature exists to
 *   avoid.
 *
 *   The inference is shown before it happens. Every step says how many earlier
 *   tasks your ticks imply, and the last step lists them. A player who disagrees
 *   can fix it on the dashboard afterwards — as ever, what they say wins.
 */

/** The order traders unlock in game, so the walkthrough matches the player's mental map. */
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

interface TraderStep {
  trader: string;
  tasks: { id: string; name: string; level: number; kappa: boolean; depth: number }[];
}

export default function SetupWizard() {
  const progression = useProgression();
  const profile = useStore((s) => s.profile);
  const setProfile = useStore((s) => s.setProfile);
  const importTaskStatus = useStore((s) => s.importTaskStatus);
  const setEntry = useStore((s) => s.setEntry);
  const existing = useTaskStatus();

  /** Staged, not stored. See the note at the top of the file. */
  const [staged, setStaged] = useState<Record<string, TaskStatus>>({});
  const [step, setStep] = useState(0);
  const [query, setQuery] = useState("");
  const [finished, setFinished] = useState(false);

  const data = progression.data;

  /*
   * How far into a chain each task sits, as the number of tasks behind it.
   *
   * The lists were alphabetical, which for Prapor meant 66 names in an order
   * with no relationship to the game: Debut, his very first quest, sat third,
   * and the end of a chain could sit above its own beginning. Ordering by depth
   * walks each chain the way the trader hands it to you, so scanning for "where
   * am I up to" follows the list downwards instead of jumping about.
   */
  const depth = useMemo(() => {
    const out = new Map<string, number>();
    for (const id of Object.keys(data?.tasks ?? {})) {
      out.set(id, prerequisiteClosure(data, id).length);
    }
    return out;
  }, [data]);

  const steps = useMemo<TraderStep[]>(() => {
    if (!data) return [];
    const byTrader = new Map<string, TraderStep["tasks"]>();
    for (const [id, task] of Object.entries(data.tasks)) {
      if (!task.trader) continue;
      // A task locked to the other faction can never be in your list, so it is
      // noise on a screen whose whole job is "find yours quickly".
      if (task.factionName && profile.faction !== "Any" && task.factionName !== profile.faction) {
        continue;
      }
      if (!visibleInMode(task.name, profile.mode)) continue;
      const list = byTrader.get(task.trader) ?? [];
      list.push({
        id,
        name: task.name,
        level: task.minPlayerLevel,
        kappa: task.kappaRequired,
        depth: depth.get(id) ?? 0,
      });
      byTrader.set(task.trader, list);
    }

    const known = TRADER_ORDER.filter((t) => byTrader.has(t));
    const rest = [...byTrader.keys()].filter((t) => !TRADER_ORDER.includes(t)).sort();
    return [...known, ...rest].map((trader) => ({
      trader,
      tasks: (byTrader.get(trader) ?? []).sort(
        (a, b) => a.depth - b.depth || a.level - b.level || a.name.localeCompare(b.name),
      ),
    }));
  }, [data, profile.faction, profile.mode, depth]);

  /*
   * Everything the staged ticks imply, worked out fresh each render.
   *
   * A task you are running means every task behind it is done. Where a chain
   * branches, `prerequisiteClosure` follows statuses you already declared and
   * only then falls back to the shortest remaining path.
   */
  const implied = useMemo(() => {
    const out = new Set<string>();
    for (const id of Object.keys(staged)) {
      for (const prior of prerequisiteClosure(data, id, staged)) {
        if (!staged[prior]) out.add(prior);
      }
    }
    return out;
  }, [staged, data]);

  const activeCount = Object.values(staged).filter((s) => s === "active").length;
  const doneCount = Object.values(staged).filter((s) => s === "completed").length;

  /* The reader holds several megabytes of wasm; let it go with the screen. */
  useEffect(() => () => void disposeOcr(), []);

  const markActive = (ids: string[]) =>
    setStaged((prev) => {
      const next = { ...prev };
      // Never downgrades: a task the player already marked done by hand is not
      // demoted to active because a screenshot also showed it.
      for (const id of ids) if (!next[id]) next[id] = "active";
      return next;
    });

  const cycle = (id: string) =>
    setStaged((prev) => {
      const next = { ...prev };
      if (!next[id]) next[id] = "active";
      else if (next[id] === "active") next[id] = "completed";
      else delete next[id];
      return next;
    });

  const finish = () => {
    const toWrite: Record<string, TaskStatus> = { ...staged };
    for (const id of implied) toWrite[id] = "completed";
    importTaskStatus(toWrite);
    setEntry("tracker");
    setFinished(true);
  };

  if (progression.error) {
    return (
      <Shell step={0} total={1}>
        <EmptyState title="The task graph could not be loaded" hint={progression.error.message} />
      </Shell>
    );
  }
  if (!data) {
    return (
      <Shell step={0} total={1}>
        <p className="py-16 text-center text-sm" style={{ color: "var(--text-dim)" }}>
          Loading the task graph…
        </p>
      </Shell>
    );
  }

  const total = steps.length + 2; // profile, one per trader, summary
  const onProfile = step === 0;
  const onSummary = step === steps.length + 1;
  const trader = steps[step - 1];

  if (finished) {
    return (
      <Shell step={total} total={total}>
        <h1 className="display text-2xl sm:text-3xl">Wipe reconstructed</h1>
        <p className="mt-2 max-w-xl text-sm leading-relaxed" style={{ color: "var(--text-dim)" }}>
          {activeCount} active and {doneCount + implied.size} done are stored in this browser.
          Download a file now if you want to restore this wipe later or on another phone or PC.
        </p>
        <SavePanel />
        <div className="mt-4 flex flex-wrap gap-2">
          <a className="btn is-active" href={href.dashboard()} onClick={onNavClick(href.dashboard())}>
            Open the dashboard
          </a>
          <a className="btn" href={href.quests("items")} onClick={onNavClick(href.quests("items"))}>
            Open the item list
          </a>
        </div>
      </Shell>
    );
  }

  return (
    <Shell step={step} total={total}>
      {onProfile && <ProfileStep profile={profile} setProfile={setProfile} existing={existing} />}

      {trader && (
        <TraderStepView
          key={trader.trader}
          step={trader}
          staged={staged}
          implied={implied}
          query={query}
          onQuery={setQuery}
          onCycle={cycle}
          onMarkActive={markActive}
        />
      )}

      {onSummary && (
        <SummaryStep
          data={data}
          implied={implied}
          activeCount={activeCount}
          doneCount={doneCount}
        />
      )}

      <footer
        className="mt-6 flex flex-wrap items-center gap-2 border-t pt-4"
        style={{ borderColor: "var(--line)" }}
      >
        <button
          type="button"
          className="btn"
          disabled={step === 0}
          onClick={() => {
            setQuery("");
            setStep((s) => Math.max(0, s - 1));
          }}
        >
          Back
        </button>

        {!onSummary ? (
          <button
            type="button"
            className="btn is-active"
            onClick={() => {
              setQuery("");
              setStep((s) => s + 1);
            }}
          >
            {onProfile ? "Start" : "Next trader"}
          </button>
        ) : (
          <button
            type="button"
            className="btn is-active"
            // Enabled, it silently returned you to the dashboard having written
            // nothing, which reads as the save having failed.
            disabled={activeCount === 0 && doneCount === 0}
            onClick={finish}
          >
            Finish
          </button>
        )}

        <span className="ml-auto text-[0.72rem]" style={{ color: "var(--text-faint)" }}>
          {activeCount} active · {doneCount + implied.size} done
          {implied.size > 0 ? ` (${implied.size} worked out)` : ""}
        </span>

        <a className="btn btn-ghost text-[0.72rem]" href={href.dashboard()} onClick={onNavClick(href.dashboard())}>
          Cancel
        </a>
      </footer>
    </Shell>
  );
}

/* ------------------------------------------------------------------ layout */

function Shell({ step, total, children }: { step: number; total: number; children: React.ReactNode }) {
  return (
    <div className="page scroll-y h-full">
      <div className="mx-auto w-full max-w-3xl px-4 py-6 sm:px-6 sm:py-10">
        <nav className="mb-5 flex items-center gap-1.5">
          <a
            href={href.dashboard()}
            onClick={onNavClick(href.dashboard())}
            className="btn btn-ghost btn-icon flex-none"
            aria-label="Back to dashboard"
          >
            <Icon path={icons.back} size={18} />
          </a>
          <span className="text-[0.72rem]" style={{ color: "var(--text-faint)" }}>
            Step {Math.min(step + 1, total)} of {total}
          </span>
        </nav>

        <div
          className="mb-6 h-1 w-full overflow-hidden rounded-full"
          style={{ background: "var(--panel-2)" }}
          role="progressbar"
          aria-valuenow={step + 1}
          aria-valuemin={1}
          aria-valuemax={total}
          aria-label="Setup progress"
        >
          <div
            className="h-full rounded-full transition-[width] duration-200"
            style={{ width: `${((step + 1) / total) * 100}%`, background: "var(--accent)" }}
          />
        </div>

        {children}
      </div>
    </div>
  );
}

/* ------------------------------------------------------------------- steps */

function ProfileStep({
  profile,
  setProfile,
  existing,
}: {
  profile: { mode: GameMode; faction: Faction; level: number };
  setProfile: (key: "mode" | "faction" | "level", value: never) => void;
  existing: Record<string, TaskStatus>;
}) {
  const alreadyTracked = Object.keys(existing).length;

  return (
    <div>
      <h1 className="display text-2xl sm:text-3xl">Set up your progress</h1>
      <p className="mt-3 max-w-2xl text-[0.95rem] leading-relaxed" style={{ color: "var(--text-dim)" }}>
        Open the game, go through your traders, and tick the quests you have accepted. That is
        enough — a quest sitting in your list means everything behind it is already done, so the
        site fills in the rest of your wipe from it.
      </p>

      <div className="surface mt-5 flex flex-wrap items-end gap-4 p-3">
        <label className="block">
          <span
            className="mb-1 block text-[0.68rem] font-semibold uppercase tracking-[0.09em]"
            style={{ color: "var(--text-dim)" }}
          >
            Mode
          </span>
          <ModeSwitch value={profile.mode} onChange={(m) => setProfile("mode", m as never)} />
        </label>

        <label className="block">
          <span
            className="mb-1 block text-[0.68rem] font-semibold uppercase tracking-[0.09em]"
            style={{ color: "var(--text-dim)" }}
          >
            Faction
          </span>
          <select
            className="input"
            style={{ width: "auto", paddingRight: "1.75rem" }}
            value={profile.faction}
            onChange={(e) => setProfile("faction", e.target.value as never)}
            aria-label="Faction"
          >
            {(["Any", "USEC", "BEAR"] as Faction[]).map((f) => (
              <option key={f} value={f}>
                {f}
              </option>
            ))}
          </select>
        </label>

        <label className="block">
          <span
            className="mb-1 block text-[0.68rem] font-semibold uppercase tracking-[0.09em]"
            style={{ color: "var(--text-dim)" }}
          >
            Level
          </span>
          <input
            className="input tabular-nums"
            style={{ width: "5rem" }}
            type="number"
            min={1}
            max={79}
            value={profile.level}
            onChange={(e) => {
              const n = Number(e.target.value);
              if (Number.isFinite(n)) {
                setProfile("level", Math.min(79, Math.max(1, Math.round(n))) as never);
              }
            }}
            aria-label="PMC level"
          />
        </label>
      </div>

      {alreadyTracked > 0 && (
        <p
          className="surface-2 mt-4 flex items-start gap-2 p-3 text-[0.78rem] leading-relaxed"
          style={{ color: "var(--text-dim)" }}
        >
          <span className="mt-0.5 flex-none" style={{ color: "var(--warn, #facc15)" }}>
            <Icon path={icons.info} size={15} />
          </span>
          <span>
            You already have {alreadyTracked} task{alreadyTracked === 1 ? "" : "s"} tracked in this
            mode. Nothing here removes them — what you tick is added on top, so a task you have
            already marked done stays done.
          </span>
        </p>
      )}
    </div>
  );
}

function TraderStepView({
  step,
  staged,
  implied,
  query,
  onQuery,
  onCycle,
  onMarkActive,
}: {
  step: TraderStep;
  staged: Record<string, TaskStatus>;
  implied: Set<string>;
  query: string;
  onQuery: (q: string) => void;
  onCycle: (id: string) => void;
  onMarkActive: (ids: string[]) => void;
}) {
  const needle = query.trim().toLowerCase();
  const shown = needle
    ? step.tasks.filter(
        (t) =>
          t.name.toLowerCase().includes(needle) ||
          displayName(t.name).toLowerCase().includes(needle),
      )
    : step.tasks;
  const mine = step.tasks.filter((t) => staged[t.id]).length;

  return (
    <div>
      <h1 className="text-2xl font-semibold tracking-tight">{step.trader}</h1>
      <p className="mt-2 max-w-2xl text-[0.9rem] leading-relaxed" style={{ color: "var(--text-dim)" }}>
        Tick anything in your {step.trader} list right now. Tick twice for one you have already
        finished — useful when a trader has nothing active because you are through their chain.
      </p>

      <ScreenshotImport
        trader={step.trader}
        candidates={step.tasks}
        alreadyStaged={(id) => !!staged[id]}
        onApply={onMarkActive}
      />

      <div className="mt-4 flex flex-wrap items-center gap-2">
        <div className="relative w-full max-w-xs">
          <span
            className="pointer-events-none absolute left-2.5 top-1/2 -translate-y-1/2"
            style={{ color: "var(--text-faint)" }}
          >
            <Icon path={icons.search} size={15} />
          </span>
          <input
            className="input input-icon"
            type="search"
            placeholder={`Find a ${step.trader} quest…`}
            value={query}
            onChange={(e) => onQuery(e.target.value)}
            aria-label={`Search ${step.trader} quests`}
          />
        </div>
        <span className="text-[0.72rem]" style={{ color: "var(--text-faint)" }}>
          {mine} of {step.tasks.length} marked
        </span>
      </div>

      <ul className="mt-3 space-y-1">
        {shown.map((task) => {
          const status = staged[task.id];
          const inferred = !status && implied.has(task.id);
          return (
            <li
              key={task.id}
              className="surface-2 flex items-center gap-2.5 p-2"
              style={inferred ? { opacity: 0.75 } : undefined}
            >
              <TaskStatusControl status={status} name={task.name} onCycle={() => onCycle(task.id)} />
              <span className="min-w-0 flex-1">
                <span className="text-[0.8125rem] font-medium">
                  <TaskName name={task.name} />
                </span>
                {task.level > 1 && (
                  <span className="ml-2 text-[0.68rem]" style={{ color: "var(--text-faint)" }}>
                    lvl {task.level}
                  </span>
                )}
                {task.kappa && <span className="chip ml-2">Kappa</span>}
              </span>
              {inferred && (
                <span className="chip flex-none" title="Implied by something else you ticked">
                  done for you
                </span>
              )}
            </li>
          );
        })}
      </ul>

      {shown.length === 0 && (
        <EmptyState title="Nothing matches" hint={`No ${step.trader} quest by that name.`} />
      )}
    </div>
  );
}

function SummaryStep({
  data,
  implied,
  activeCount,
  doneCount,
}: {
  data: Progression;
  implied: Set<string>;
  activeCount: number;
  doneCount: number;
}) {
  const impliedNames = useMemo(
    () =>
      [...implied]
        .map((id) => displayName(data.tasks[id]?.name ?? id))
        .sort((a, b) => a.localeCompare(b)),
    [implied, data],
  );

  const nothing = activeCount === 0 && doneCount === 0;

  return (
    <div>
      <h1 className="text-2xl font-semibold tracking-tight">Ready to save</h1>

      {nothing ? (
        <EmptyState
          title="Nothing ticked yet"
          hint="Go back and mark the quests you have accepted — without them there is nothing to work out."
        />
      ) : (
        <>
          <p className="mt-3 text-[0.95rem] leading-relaxed" style={{ color: "var(--text-dim)" }}>
            <strong style={{ color: "var(--text)" }}>{activeCount}</strong> active,{" "}
            <strong style={{ color: "var(--text)" }}>{doneCount}</strong> marked done by hand, and{" "}
            <strong style={{ color: "var(--text)" }}>{implied.size}</strong> more worked out from
            what has to have come first. Nothing you had already tracked is removed.
          </p>

          {implied.size > 0 && (
            <section className="surface mt-4 p-3">
              <h2 className="text-sm font-semibold">Worked out for you</h2>
              <p className="mt-1 text-[0.72rem] leading-snug" style={{ color: "var(--text-faint)" }}>
                {/* Listed rather than summarised: this is the site making a claim
                    about somebody's history, and it should be checkable before it
                    is written, not after. */}
                These have to be finished for your active quests to be in your list. Where a chain
                branches, the shortest route is assumed — fix any of it on the dashboard.
              </p>
              <p className="mt-2 flex flex-wrap gap-1">
                {impliedNames.slice(0, 60).map((name) => (
                  <span key={name} className="chip">
                    {name}
                  </span>
                ))}
                {impliedNames.length > 60 && (
                  <span className="chip">+{impliedNames.length - 60} more</span>
                )}
              </p>
            </section>
          )}
        </>
      )}
    </div>
  );
}
