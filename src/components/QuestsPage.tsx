import { useMemo, useState } from "react";
import { useProgression } from "../lib/data";
import {
  computeAvailability,
  lockReasons,
  prerequisiteClosure,
  type LockReason,
} from "../lib/progression";
import { href, navigate } from "../lib/router";
import { useMarkerDone, useStore, useTaskStatus } from "../store";
import type { Faction, GameMode, Profile } from "../lib/persist-migrate";
import type { KeyItem, Progression, TaskAvailability, TaskItemNeed } from "../types";
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
  /** Populated only for locked rows — computing it for all 511 is wasted work. */
  blockers: LockReason[];
}

const FACTIONS: Faction[] = ["Any", "USEC", "BEAR"];
const MODE_LABEL: Record<GameMode, string> = { pvp: "PvP", pve: "PvE" };

export default function QuestsPage() {
  const progression = useProgression();
  const taskStatus = useTaskStatus();
  const markerDone = useMarkerDone();
  const profile = useStore((s) => s.profile);
  const setProfile = useStore((s) => s.setProfile);
  const cycleTaskStatus = useStore((s) => s.cycleTaskStatus);
  const setTaskStatus = useStore((s) => s.setTaskStatus);

  const [query, setQuery] = useState("");

  const data = progression.data;

  const availability = useMemo(
    () => computeAvailability(data, taskStatus, profile),
    [data, taskStatus, profile],
  );

  const rows = useMemo<Row[]>(() => {
    if (!data) return [];
    return Object.entries(data.tasks).map(([id, task]) => ({
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
      blockers: [],
    }));
  }, [data, availability]);

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
    !needle || row.name.toLowerCase().includes(needle) || row.trader.toLowerCase().includes(needle);

  const active = rows.filter((r) => r.availability === "active" && matches(r));
  const available = rows.filter((r) => r.availability === "available" && matches(r));
  const completed = rows.filter((r) => r.availability === "completed" && matches(r));

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
  const keys = useMemo(() => collectKeys(data, upcoming), [data, upcoming]);
  const needs = useMemo(() => collectNeeds(data, upcoming), [data, upcoming]);

  /** "I finished this one" also means everything behind it is finished. */
  const completeWithHistory = (taskId: string) => {
    setTaskStatus(taskId, "completed");
    for (const prior of prerequisiteClosure(data, taskId)) {
      if (!taskStatus[prior]) setTaskStatus(prior, "completed");
    }
  };

  const trackedCount = Object.keys(taskStatus).length;

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
        <p
          className="mb-2 text-[0.7rem] font-semibold uppercase tracking-[0.16em]"
          style={{ color: "var(--accent)" }}
        >
          Escape from Tarkov
        </p>
        <h1 className="text-3xl font-semibold tracking-tight sm:text-4xl">Quest tracker</h1>
        <p
          className="mt-3 max-w-2xl text-[0.95rem] leading-relaxed"
          style={{ color: "var(--text-dim)" }}
        >
          Tell it what you have finished and it works out what you can pick up next, which keys to
          bring and what to hand in found-in-raid. Whatever you tick here is what the maps draw.
        </p>
      </header>

      <ProfileBar
        profile={profile}
        setProfile={setProfile}
        traders={gatingTraders}
        trackedCount={trackedCount}
        markerCount={Object.keys(markerDone).length}
      />

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
                easy to stop reading. This says how much is actually known. */}
            Prerequisites are known for{" "}
            <strong style={{ color: "var(--text)" }}>
              {data.coverage.withPrereq} of {data.coverage.tasks}
            </strong>{" "}
            tasks. The remaining {data.coverage.ungated} have nothing recorded gating them at all,
            so they show as available from the start — the game may not offer them yet. Your own
            ticks are never affected.
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
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          aria-label="Search tasks"
        />
      </div>

      {progression.loading && !data ? (
        <p className="py-16 text-center text-sm" style={{ color: "var(--text-dim)" }}>
          Loading the task graph…
        </p>
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
              />
            )}
          </Panel>

          <Panel
            title="Keys you'll need"
            count={keys.length}
            hint="Doors your active and available tasks go through."
          >
            {keys.length === 0 ? (
              <EmptyState title="No keys needed" hint="Nothing coming up is behind a locked door." />
            ) : (
              <ul className="space-y-1">
                {keys.map((k) => (
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
                    <span className="chip flex-none tabular-nums">×{n.count}</span>
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
                  />
                ))}
              </ul>
            )}
          </Panel>

          {completed.length > 0 && (
            <Panel
              title="Finished"
              count={completed.length}
              hint="Untick anything here that you have not actually done."
              className="lg:col-span-2"
              collapsed
            >
              <ByTrader
                rows={completed}
                onCycle={cycleTaskStatus}
                onCompleteChain={completeWithHistory}
              />
            </Panel>
          )}
        </div>
      )}
    </Shell>
  );
}

/* ------------------------------------------------------------------ layout */

function Shell({ children }: { children: React.ReactNode }) {
  return (
    <div className="scroll-y h-full" style={{ background: "var(--bg)" }}>
      <div className="mx-auto w-full max-w-6xl px-4 py-6 sm:px-6 sm:py-10">
        <nav className="mb-6 flex items-center gap-1.5">
          <a href={href.home()} className="btn btn-ghost btn-icon flex-none" aria-label="All maps">
            <Icon path={icons.back} size={18} />
          </a>
          <a href={href.home()} className="btn">
            Maps
          </a>
          <span className="btn is-active" aria-current="page">
            Quests
          </span>
        </nav>
        {children}
      </div>
    </div>
  );
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
  return (
    <div className="surface flex flex-wrap items-end gap-3 p-3">
      <Field label="Mode" hint="PvP and PvE keep separate progress.">
        <div className="flex gap-1 rounded-lg p-0.5" style={{ background: "var(--panel-2)" }}>
          {(["pvp", "pve"] as GameMode[]).map((m) => (
            <button
              key={m}
              type="button"
              className="btn btn-ghost text-[0.75rem]"
              style={{ padding: "0.3rem 0.7rem" }}
              aria-pressed={profile.mode === m}
              onClick={() => setProfile("mode", m)}
            >
              {MODE_LABEL[m]}
            </button>
          ))}
        </div>
      </Field>

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

      <p className="ml-auto text-[0.7rem] leading-snug" style={{ color: "var(--text-faint)" }}>
        {trackedCount} task{trackedCount === 1 ? "" : "s"} tracked
        <br />
        {markerCount} location{markerCount === 1 ? "" : "s"} ticked
      </p>

      {traders.length > 0 && (
        <div className="w-full border-t pt-3" style={{ borderColor: "var(--line-soft)" }}>
          <p
            className="text-[0.68rem] font-semibold uppercase tracking-[0.09em]"
            style={{ color: "var(--text-dim)" }}
          >
            Trader loyalty
          </p>
          <p className="mt-0.5 text-[0.66rem] leading-snug" style={{ color: "var(--text-faint)" }}>
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
        </div>
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
}: {
  rows: Row[];
  onCycle: (id: string) => void;
  onCompleteChain: (id: string) => void;
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
                status={row.availability === "completed" ? "completed" : undefined}
                onCycle={() => onCycle(row.id)}
                onCompleteChain={() => onCompleteChain(row.id)}
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
}: {
  rows: Row[];
  onCycle: (id: string) => void;
  onCompleteChain: (id: string) => void;
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
}: {
  row: Row;
  status: "active" | "completed" | undefined;
  onCycle: () => void;
  onCompleteChain: () => void;
}) {
  return (
    <li className="surface-2 flex items-start gap-2.5 p-2">
      <span className="mt-0.5">
        <TaskStatusControl status={status} name={row.name} onCycle={onCycle} />
      </span>

      <div className="min-w-0 flex-1">
        <p className="flex flex-wrap items-baseline gap-x-2 gap-y-0.5">
          <span className="text-[0.8125rem] font-medium">{row.name}</span>
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
                className="chip chip-accent"
                onClick={() => navigate(href.map(map, row.id))}
                title={`Open ${row.name} on this map`}
              >
                {map.replace(/-/g, " ")}
              </button>
            ))}
          </p>
        )}
      </div>

      <div className="flex flex-none items-center gap-1">
        {status !== "completed" && (
          <button
            type="button"
            className="btn btn-ghost text-[0.68rem]"
            style={{ padding: "0.25rem 0.5rem", color: "var(--text-faint)" }}
            onClick={onCompleteChain}
            title={`Mark ${row.name} done, and everything it needed before it`}
          >
            + before
          </button>
        )}
        {row.wiki && (
          <a
            className="btn btn-ghost btn-icon"
            href={row.wiki}
            target="_blank"
            rel="noreferrer noopener"
            aria-label={`${row.name} on the wiki`}
          >
            <Icon path={icons.external} size={15} />
          </a>
        )}
      </div>
    </li>
  );
}

/* -------------------------------------------------------------- shopping lists */

interface KeyRow {
  item: KeyItem;
  tasks: string[];
  maps: string[];
}

function collectKeys(progression: Progression | null, rows: Row[]): KeyRow[] {
  if (!progression) return [];
  const out = new Map<string, KeyRow>();

  for (const row of rows) {
    const task = progression.tasks[row.id];
    if (!task) continue;
    for (const entry of task.keys) {
      for (const keyId of entry.keys) {
        const item = progression.keys[keyId];
        if (!item) continue;
        const existing = out.get(keyId) ?? { item, tasks: [], maps: [] };
        if (!existing.tasks.includes(task.name)) existing.tasks.push(task.name);
        const map = entry.map?.replace(/-/g, " ");
        if (map && !existing.maps.includes(map)) existing.maps.push(map);
        out.set(keyId, existing);
      }
    }
  }

  return [...out.values()].sort((a, b) => b.tasks.length - a.tasks.length);
}

interface NeedRow {
  name: string;
  icon: string | null;
  count: number;
  tasks: string[];
}

/**
 * Found-in-raid hand-ins only. A task also wanting a bought item is not news —
 * you can buy it on the way to the trader; a FIR item changes how you play the
 * raid, which is the whole reason this list exists.
 *
 * Grouped by item name rather than id: several tasks want the same item under
 * different ids in the feed, and a player reads "8 × Bolts", not two rows.
 */
function collectNeeds(progression: Progression | null, rows: Row[]): NeedRow[] {
  if (!progression) return [];
  const out = new Map<string, NeedRow>();

  for (const row of rows) {
    const task = progression.tasks[row.id];
    if (!task) continue;
    for (const need of task.needs as TaskItemNeed[]) {
      if (!need.foundInRaid) continue;
      const existing = out.get(need.name) ?? {
        name: need.name,
        icon: need.icon,
        count: 0,
        tasks: [],
      };
      existing.count += need.count;
      if (!existing.tasks.includes(task.name)) existing.tasks.push(task.name);
      out.set(need.name, existing);
    }
  }

  return [...out.values()].sort((a, b) => b.count - a.count || a.name.localeCompare(b.name));
}
