import { useEffect, useMemo, useState } from "react";
import { useProgression } from "../lib/data";
import { KORD_SEASON, SEASON_TITLE } from "../lib/kord-season";
import { MODE_META, MODE_ORDER } from "../lib/mode";
import { disposeOcr } from "../lib/ocr";
import { hasCharacterData } from "../lib/onboarding";
import { href, navigate, onNavClick } from "../lib/router";
import {
  cycleStaged,
  impliedDone,
  matchesQuery,
  setupGroups,
  setupWrites,
  stageActive,
  type SetupGroup,
} from "../lib/setup";
import { displayName } from "../lib/task-variant";
import { useStore, useTaskStatus } from "../store";
import type { Faction } from "../lib/persist-migrate";
import type { TaskStatus } from "../types";
import ModeSwitch from "./ModeSwitch";
import PageShell from "./PageShell";
import ScreenshotImport from "./ScreenshotImport";
import TaskName from "./TaskName";
import TaskStatusControl from "./TaskStatusControl";
import { EmptyState, Icon, icons, Term } from "./ui";

/**
 * Task setup, on one screen: which quests are you holding right now?
 *
 * It used to be a thirteen-step walk, one trader per screen — exactly the
 * wizard a wipe-night player bounces off. Now every trader is a chip on the
 * same screen, search spans all of them, the screenshot reader is one press
 * away, and a fresh wipe needs no ticking at all.
 *
 * Two rules carried over from the wizard, because they are what make it safe:
 *
 *   Nothing is written until Save. Ticks are staged, so unticking is free and a
 *   mistaken tick never silently marks a dozen tasks done.
 *
 *   The inference is shown before it happens. The bar says how many earlier
 *   tasks your ticks imply, and "review" lists them by name.
 */
export default function SetupWizard() {
  const progression = useProgression();
  const profile = useStore((s) => s.profile);
  const setProfile = useStore((s) => s.setProfile);
  const importTaskStatus = useStore((s) => s.importTaskStatus);
  const clearProgress = useStore((s) => s.clearProgress);
  const setEntry = useStore((s) => s.setEntry);
  const existing = useTaskStatus();
  const modeHasData = useStore((s) =>
    hasCharacterData({ [s.profile.mode]: s.progress[s.profile.mode] }),
  );

  const [staged, setStaged] = useState<Record<string, TaskStatus>>({});
  const [query, setQuery] = useState("");
  const [groupId, setGroupId] = useState<string | null>(null);
  const [review, setReview] = useState(false);
  const [saved, setSaved] = useState<{ active: number; done: number } | null>(null);

  const data = progression.data;

  const groups = useMemo(
    () =>
      setupGroups(
        data,
        { mode: profile.mode, faction: profile.faction },
        { label: SEASON_TITLE, order: KORD_SEASON.questline.map((q) => q.id) },
      ),
    [data, profile.mode, profile.faction],
  );

  // Switching character changes the whole list; staged ticks belong to the old one.
  useEffect(() => {
    setStaged({});
    setGroupId(null);
    setSaved(null);
  }, [profile.mode]);

  /* The reader holds several megabytes of wasm; let it go with the screen. */
  useEffect(() => () => void disposeOcr(), []);

  const group: SetupGroup | undefined = groups.find((g) => g.id === groupId) ?? groups[0];
  const implied = useMemo(() => impliedDone(data, staged), [data, staged]);
  const activeCount = Object.values(staged).filter((s) => s === "active").length;
  const doneCount = Object.values(staged).filter((s) => s === "completed").length + implied.size;
  const anything = activeCount + doneCount > 0;

  const searching = query.trim().length > 0;
  const shown = useMemo(() => {
    if (!searching) return group ? [{ group, tasks: group.tasks }] : [];
    return groups
      .map((g) => ({ group: g, tasks: g.tasks.filter((t) => matchesQuery(t, query)) }))
      .filter((g) => g.tasks.length);
  }, [searching, group, groups, query]);

  const save = () => {
    importTaskStatus(setupWrites(staged, implied));
    setEntry("tracker");
    setSaved({ active: activeCount, done: doneCount });
  };

  const freshWipe = () => {
    const label = MODE_META[profile.mode].label;
    if (
      modeHasData &&
      !window.confirm(
        `Start a fresh wipe on ${label}? This clears the quests, stash, hideout and story ` +
          `stored for ${label}. Your other characters are not touched.`,
      )
    ) {
      return;
    }
    if (modeHasData) clearProgress();
    setProfile("level", 1);
    setEntry("tracker");
    navigate(href.dashboard());
  };

  const skip = () => {
    setEntry("tracker");
    navigate(href.dashboard());
  };

  if (saved) {
    const others = MODE_ORDER.filter((m) => m !== profile.mode);
    return (
      <PageShell>
        <h1 className="display text-2xl sm:text-3xl">Saved</h1>
        <p className="mt-2 text-sm muted">
          {saved.active} active and {saved.done} done on {MODE_META[profile.mode].label}. Maps now
          draw your active objectives.
        </p>
        <div className="mt-4 flex flex-wrap gap-2">
          <a className="btn btn-primary" href={href.dashboard()} onClick={onNavClick(href.dashboard())}>
            Open the dashboard
          </a>
          <a className="btn" href={href.maps()} onClick={onNavClick(href.maps())}>
            Open a map
          </a>
        </div>
        <p className="mt-6 flex flex-wrap items-center gap-2 text-meta">
          Also set up:
          {others.map((m) => (
            <button key={m} type="button" className="btn btn-sm" onClick={() => setProfile("mode", m)}>
              {MODE_META[m].label}
            </button>
          ))}
          <a className="btn btn-sm" href={href.storySetup()} onClick={onNavClick(href.storySetup())}>
            Story
          </a>
        </p>
      </PageShell>
    );
  }

  return (
    <PageShell
      aside={
        <button type="button" className="btn btn-ghost btn-sm" onClick={skip}>
          Skip for now
        </button>
      }
    >
      <header className="setup-head">
        <div className="min-w-0">
          <h1 className="display text-2xl sm:text-3xl">Mark your active quests</h1>
          <p className="mt-1.5 text-[0.9rem] muted">
            Tick what your <Term id="trader">traders</Term> have given you. Everything before them
            is filled in for you.
          </p>
        </div>
        <button
          type="button"
          className="btn flex-none"
          onClick={freshWipe}
          title="Nothing to tick: start this character at level 1 with no quests done"
        >
          <Icon path={icons.refresh} size={14} />
          Fresh wipe · level 1
        </button>
      </header>

      <div className="setup-character">
        <ModeSwitch value={profile.mode} onChange={(m) => setProfile("mode", m)} size="sm" />
        <label className="setup-field">
          <span className="kicker">Level</span>
          <input
            className="input tabular-nums"
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
        </label>
        <label className="setup-field">
          <span className="kicker">Faction</span>
          <select
            className="input"
            value={profile.faction}
            onChange={(e) => setProfile("faction", e.target.value as Faction)}
            aria-label="Faction"
          >
            {(["Any", "USEC", "BEAR"] as Faction[]).map((f) => (
              <option key={f} value={f}>
                {f === "Any" ? "Either" : f}
              </option>
            ))}
          </select>
        </label>
      </div>

      {progression.error ? (
        <EmptyState title="The task list could not be loaded" hint={progression.error.message} />
      ) : !data ? (
        <p className="py-16 text-center text-sm muted">Loading the task list…</p>
      ) : (
        <>
          <div className="setup-tools">
            <div className="relative min-w-0 flex-1">
              <span className="pointer-events-none absolute left-2.5 top-1/2 -translate-y-1/2 faint">
                <Icon path={icons.search} size={15} />
              </span>
              <input
                className="input input-icon"
                type="search"
                placeholder="Search every trader's quests…"
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                aria-label="Search quests"
                data-search
              />
            </div>
          </div>

          <nav className="setup-chips" aria-label="Traders">
            {groups.map((g) => {
              const n = g.tasks.filter((t) => staged[t.id]).length;
              const on = !searching && g.id === group?.id;
              return (
                <button
                  key={g.id}
                  type="button"
                  className={on ? "chip chip-button chip-accent" : "chip chip-button"}
                  aria-pressed={on}
                  onClick={() => {
                    setQuery("");
                    setGroupId(g.id);
                  }}
                >
                  {g.label}
                  {n > 0 && <span className="setup-chip-n">{n}</span>}
                </button>
              );
            })}
          </nav>

          {group && !searching && (
            <ScreenshotImport
              trader={group.trader}
              candidates={group.tasks}
              alreadyStaged={(id) => !!staged[id]}
              onApply={(ids) => setStaged((prev) => stageActive(prev, ids))}
            />
          )}

          <div className="mt-3">
            {shown.length === 0 && (
              <EmptyState title="Nothing matches" hint="No quest or trader by that name." />
            )}
            {shown.map(({ group: g, tasks }) => (
              <section key={g.id} className="mb-4">
                {searching && <h2 className="kicker mb-1.5">{g.label}</h2>}
                <ul className="space-y-1">
                  {tasks.map((task) => {
                    const status = staged[task.id];
                    const inferred = !status && implied.has(task.id);
                    const stored = existing[task.id];
                    return (
                      <li
                        key={task.id}
                        className="surface-2 flex items-center gap-2.5 px-2 py-1.5"
                        style={inferred ? { opacity: 0.7 } : undefined}
                      >
                        <TaskStatusControl
                          status={status}
                          name={task.name}
                          onCycle={() => setStaged((prev) => cycleStaged(prev, task.id))}
                        />
                        <span className="min-w-0 flex-1 text-[0.8125rem] font-medium">
                          <TaskName name={task.name} />
                          {task.level > 1 && (
                            <span className="ml-2 text-[0.68rem] faint">lvl {task.level}</span>
                          )}
                          {task.kappa && <span className="chip ml-2">Kappa</span>}
                        </span>
                        {inferred && <span className="chip flex-none">done for you</span>}
                        {!status && !inferred && stored && (
                          <span className="chip flex-none" title="Already stored on this character">
                            {stored === "completed" ? "already done" : "already active"}
                          </span>
                        )}
                      </li>
                    );
                  })}
                </ul>
              </section>
            ))}
          </div>

          <div className="setup-bar">
            <div className="min-w-0 flex-1">
              <p className="text-[0.8rem] font-medium tabular-nums">
                {anything
                  ? `${activeCount} active · ${doneCount} done`
                  : "Tick once for active, twice for done"}
              </p>
              {implied.size > 0 && (
                <button
                  type="button"
                  className="text-[0.7rem] underline underline-offset-2 faint"
                  aria-expanded={review}
                  onClick={() => setReview((v) => !v)}
                >
                  {implied.size} earlier task{implied.size === 1 ? "" : "s"} worked out ·{" "}
                  {review ? "hide" : "review"}
                </button>
              )}
              {review && implied.size > 0 && (
                <p className="mt-1.5 flex max-h-40 flex-wrap gap-1 overflow-auto">
                  {[...implied]
                    .map((id) => displayName(data.tasks[id]?.name ?? id))
                    .sort((a, b) => a.localeCompare(b))
                    .map((name) => (
                      <span key={name} className="chip">
                        {name}
                      </span>
                    ))}
                </p>
              )}
            </div>
            <button type="button" className="btn btn-primary flex-none" disabled={!anything} onClick={save}>
              Save
            </button>
          </div>
        </>
      )}
    </PageShell>
  );
}
