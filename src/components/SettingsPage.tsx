import { useMemo, useState } from "react";
import { useProgression } from "../lib/data";
import { MODE_META, MODE_ORDER, modeLabel } from "../lib/mode";
import { GAME_EDITIONS, GAME_MODES, type Faction, type GameEdition } from "../lib/persist-migrate";
import { prerequisiteClosure } from "../lib/progression";
import { href, onNavClick } from "../lib/router";
import { useStore, type Theme } from "../store";
import DataFreshness from "./DataFreshness";
import ModeSwitch from "./ModeSwitch";
import PageShell from "./PageShell";
import SavePanel from "./SavePanel";
import TargetPicker from "./TargetPicker";
import { PageHeader, Term } from "./ui";

const FACTIONS: Faction[] = ["Any", "USEC", "BEAR"];

const EDITION_LABEL: Record<GameEdition, string> = {
  standard: "Standard",
  leftBehind: "Left Behind",
  prepareToEscape: "Prepare for Escape",
  edgeOfDarkness: "Edge of Darkness",
  unheard: "The Unheard",
};

const THEMES: { id: Theme; label: string }[] = [
  { id: "dark", label: "Dark" },
  { id: "light", label: "Light" },
  { id: "system", label: "System" },
];

export default function SettingsPage() {
  const progression = useProgression();
  const profile = useStore((s) => s.profile);
  const setProfile = useStore((s) => s.setProfile);
  const progress = useStore((s) => s.progress);
  const taskStatus = useStore((s) => s.progress[s.profile.mode].taskStatus);
  const fillCompleted = useStore((s) => s.fillCompleted);
  const resetTasks = useStore((s) => s.resetTasks);
  const resetItems = useStore((s) => s.resetItems);
  const clearProgress = useStore((s) => s.clearProgress);
  const settings = useStore((s) => s.settings);
  const setSetting = useStore((s) => s.setSetting);
  const [note, setNote] = useState<string | null>(null);

  const counts = useMemo(() => {
    const out = {} as Record<string, number>;
    for (const mode of GAME_MODES) {
      out[mode] = Object.keys(progress[mode].taskStatus).length;
    }
    return out;
  }, [progress]);

  const current = progress[profile.mode];
  const taskCount = Object.keys(current.taskStatus).length;
  const itemCount = Object.keys(current.itemCounts).length + Object.keys(current.keysOwned).length;
  const label = modeLabel(profile.mode);

  const gatingTraders = useMemo(() => {
    const names = new Set<string>();
    for (const task of Object.values(progression.data?.tasks ?? {})) {
      for (const gate of task.traderGates) if (gate.kind === "level") names.add(gate.trader);
    }
    return [...names].sort();
  }, [progression.data]);

  const recalc = () => {
    const ids = new Set<string>();
    for (const [id, status] of Object.entries(taskStatus)) {
      if (status !== "active" && status !== "pinned") continue;
      for (const prior of prerequisiteClosure(progression.data, id, taskStatus)) ids.add(prior);
    }
    const filled = fillCompleted([...ids]);
    setNote(
      filled
        ? `Filled in ${filled} earlier task${filled === 1 ? "" : "s"} behind what you have accepted. The plan re-ranks toward your target.`
        : "Nothing to fill in — mark a quest active first, or run Task Sync.",
    );
  };

  return (
    <PageShell>
      <div>
        <PageHeader
          title="Settings"
          lead={
            <>
              Three characters, same as the game: <Term id="pvp-zone" />, Season, and{" "}
              <Term id="pve" />. This page edits the one you have selected.{" "}
              <Term id="unheard">The Unheard</Term> is an edition, not a character.
            </>
          }
        />

        <section className="surface mt-5 p-4">
          <h2 className="text-sm font-semibold">Characters</h2>
          <ul className="mt-3 grid grid-cols-1 gap-2 sm:grid-cols-3">
            {MODE_ORDER.map((mode) => (
              <li key={mode}>
                <button
                  type="button"
                  className="surface-2 flex w-full flex-col items-start gap-1 p-3 text-left"
                  aria-pressed={profile.mode === mode}
                  onClick={() => setProfile("mode", mode)}
                  style={
                    profile.mode === mode
                      ? { outline: "2px solid var(--accent)", outlineOffset: "-2px" }
                      : undefined
                  }
                >
                  <span className="font-medium">{MODE_META[mode].label}</span>
                  <span className="text-[0.7rem]" style={{ color: "var(--text-faint)" }}>
                    {counts[mode]} quest{counts[mode] === 1 ? "" : "s"} tracked
                  </span>
                </button>
              </li>
            ))}
          </ul>
        </section>

        <section className="surface mt-3 p-4">
          <h2 className="text-sm font-semibold">{label}</h2>
          <div className="mt-3 flex flex-wrap items-end gap-3">
            <label className="block">
              <span className="mb-1 block text-[0.68rem] font-semibold uppercase tracking-[0.09em]" style={{ color: "var(--text-dim)" }}>
                Mode
              </span>
              <ModeSwitch value={profile.mode} onChange={(m) => setProfile("mode", m)} />
            </label>
            <label className="block">
              <span className="mb-1 block text-[0.68rem] font-semibold uppercase tracking-[0.09em]" style={{ color: "var(--text-dim)" }}>
                Faction
              </span>
              <select
                className="input"
                style={{ width: "auto", paddingRight: "1.75rem" }}
                value={profile.faction}
                onChange={(e) => setProfile("faction", e.target.value as Faction)}
              >
                {FACTIONS.map((f) => (
                  <option key={f} value={f}>
                    {f}
                  </option>
                ))}
              </select>
            </label>
            <label className="block">
              <span className="mb-1 block text-[0.68rem] font-semibold uppercase tracking-[0.09em]" style={{ color: "var(--text-dim)" }}>
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
                  if (Number.isFinite(n)) setProfile("level", Math.min(79, Math.max(1, Math.round(n))));
                }}
              />
            </label>
            <label className="block">
              <span className="mb-1 block text-[0.68rem] font-semibold uppercase tracking-[0.09em]" style={{ color: "var(--text-dim)" }}>
                Edition
              </span>
              <select
                className="input"
                style={{ width: "auto", paddingRight: "1.75rem" }}
                value={profile.gameEdition}
                onChange={(e) => setProfile("gameEdition", e.target.value as GameEdition)}
              >
                {GAME_EDITIONS.map((ed) => (
                  <option key={ed} value={ed}>
                    {EDITION_LABEL[ed]}
                  </option>
                ))}
              </select>
            </label>
          </div>
          <div className="mt-4">
            <p className="mb-1 text-[0.68rem] font-semibold uppercase tracking-[0.09em]" style={{ color: "var(--text-dim)" }}>
              Target task
            </p>
            <TargetPicker remaining={null} />
          </div>
          {gatingTraders.length > 0 && (
            <div className="mt-4 border-t pt-3" style={{ borderColor: "var(--line-soft)" }}>
              <p className="text-[0.68rem] font-semibold uppercase tracking-[0.09em]" style={{ color: "var(--text-dim)" }}>
                Trader loyalty
              </p>
              <p className="mt-1 text-[0.66rem] leading-snug" style={{ color: "var(--text-faint)" }}>
                Optional. Blank means “not told” and is never used against you.
              </p>
              <div className="mt-2 flex flex-wrap gap-2">
                {gatingTraders.map((trader) => (
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
            </div>
          )}
        </section>

        <section className="surface mt-3 p-4">
          <h2 className="text-sm font-semibold">Recalculate plan</h2>
          <p className="mt-1 text-[0.75rem] leading-relaxed" style={{ color: "var(--text-dim)" }}>
            Fills in everything behind the quests you currently have accepted, then re-ranks What
            to do next toward your target. Does not mark those accepted quests done.
          </p>
          <button type="button" className="btn mt-3" onClick={recalc}>
            Recalculate from active tasks
          </button>
          {note && (
            <p className="mt-2 text-[0.75rem]" style={{ color: "var(--text-dim)" }}>
              {note}
            </p>
          )}
        </section>

        <section className="surface mt-3 p-4">
          <h2 className="text-sm font-semibold">Reset {label}</h2>
          <p className="mt-1 text-[0.75rem] leading-relaxed" style={{ color: "var(--text-faint)" }}>
            Only this character. The other two modes are left alone.
          </p>
          <div className="mt-3 flex flex-wrap gap-2">
            <button
              type="button"
              className="btn"
              disabled={!taskCount}
              onClick={() => {
                if (confirm(`Clear every ${label} quest status and ticked location? Stash counts stay.`)) {
                  resetTasks();
                  setNote("Quest statuses cleared.");
                }
              }}
            >
              Reset tasks{taskCount ? ` (${taskCount})` : ""}
            </button>
            <button
              type="button"
              className="btn"
              disabled={!itemCount}
              onClick={() => {
                if (confirm(`Clear ${label} item counts and acquired keys? Quests stay.`)) {
                  resetItems();
                  setNote("Item counts and keys cleared.");
                }
              }}
            >
              Reset items{itemCount ? ` (${itemCount})` : ""}
            </button>
            <button
              type="button"
              className="btn"
              style={{ color: "var(--danger)" }}
              onClick={() => {
                if (
                  confirm(
                    `Wipe the entire ${label} character — quests, items, keys and hideout? This cannot be undone.`,
                  )
                ) {
                  clearProgress();
                  setNote(`${label} wiped.`);
                }
              }}
            >
              Wipe character
            </button>
          </div>
        </section>

        <SavePanel />

        <section className="surface mt-3 p-4">
          <h2 className="text-sm font-semibold">About</h2>
          <p className="mt-1 text-[0.75rem] leading-relaxed" style={{ color: "var(--text-dim)" }}>
            Fan maps and tracker. Data from tarkov.dev and the Tarkov wiki.
          </p>
          <div className="mt-3 flex flex-wrap gap-2">
            <a className="btn" href={href.welcome()} onClick={onNavClick(href.welcome())}>
              Start page
            </a>
            <a
              className="btn"
              href="https://github.com/Nardi05/Tarkov-Map-Project"
              target="_blank"
              rel="noreferrer"
            >
              Source
            </a>
          </div>
        </section>

        <section className="surface mt-3 p-4">
          <h2 className="text-sm font-semibold">Appearance</h2>
          <p className="card-sub">
            Dark by default. System follows whatever your phone or desktop is set to.
          </p>
          <div className="mt-3 flex gap-1.5">
            {THEMES.map((theme) => (
              <button
                key={theme.id}
                type="button"
                className="btn flex-1"
                aria-pressed={settings.theme === theme.id}
                onClick={() => setSetting("theme", theme.id)}
              >
                {theme.label}
              </button>
            ))}
          </div>
        </section>

        {/*
          * Where the game data came from, and a way to go and get it again.
          * It belongs here rather than only in the footer: "is this current?"
          * is a settings question, and the answer used to be unanswerable.
          */}
        <section className="surface mt-3 p-4">
          <h2 className="text-sm font-semibold">Game data</h2>
          <div className="mt-3">
            <DataFreshness compact={false} />
          </div>
        </section>
      </div>
    </PageShell>
  );
}
