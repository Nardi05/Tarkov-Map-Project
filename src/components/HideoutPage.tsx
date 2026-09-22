import { useEffect, useMemo, useState } from "react";
import { useHideoutData, useItemCatalog } from "../lib/data";
import { completeThrough, hideoutRows, hideoutStatusLabel, type HideoutRow } from "../lib/hideout";
import { useHideout, useItemCounts, useStore } from "../store";
import { Callout, Card, EmptyState, Icon, icons, PageHeader, SectionHead, Term } from "./ui";

/**
 * The hideout.
 *
 * Restructured around the only question anybody opens it with: what can I
 * build right now? The list used to be twenty-six identical rows in feed
 * order, where a station you could start on this minute looked exactly like
 * one gated three upgrades away — so answering that question meant reading
 * every row. Now they are grouped by what you can do with them, and the ones
 * you can act on are first.
 */

type Group = "ready" | "building" | "locked" | "done";

const GROUP_META: Record<Group, { title: string; hint: string }> = {
  ready: {
    title: "Ready to build",
    hint: "Nothing is gating these. Only the items are missing.",
  },
  building: { title: "In progress", hint: "Marked as under way." },
  locked: {
    title: "Waiting on another station",
    hint: "Build what they depend on first, and they move up.",
  },
  done: { title: "Finished", hint: "Every level built." },
};

const GROUP_ORDER: Group[] = ["ready", "building", "locked", "done"];

function groupOf(row: HideoutRow): Group {
  if (!row.next || row.status === "completed") return "done";
  if (row.status === "active") return "building";
  if (row.status === "locked") return "locked";
  return "ready";
}

export default function HideoutPage() {
  const data = useHideoutData();
  const catalog = useItemCatalog();
  const hideout = useHideout();
  const itemCounts = useItemCounts();
  const setHideoutStatus = useStore((s) => s.setHideoutStatus);
  const bumpItemCount = useStore((s) => s.bumpItemCount);
  const [openId, setOpenId] = useState<string | null>(null);

  const rows = useMemo(() => hideoutRows(data.data, hideout), [data.data, hideout]);
  const open = rows.find((r) => r.station.id === openId) ?? null;

  const grouped = useMemo(() => {
    const out: Record<Group, HideoutRow[]> = { ready: [], building: [], locked: [], done: [] };
    for (const row of rows) out[groupOf(row)].push(row);
    for (const key of GROUP_ORDER) {
      out[key].sort((a, b) => a.station.name.localeCompare(b.station.name));
    }
    return out;
  }, [rows]);

  /** Built levels out of every level there is — one number for the whole base. */
  const progress = useMemo(() => {
    let built = 0;
    let total = 0;
    for (const row of rows) {
      built += row.completedLevel;
      total += row.station.levels.reduce((n, l) => Math.max(n, l.level), 0);
    }
    return { built, total, pct: total ? built / total : 0 };
  }, [rows]);

  useEffect(() => {
    if (!openId) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") setOpenId(null);
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [openId]);

  return (
    <>
      <PageHeader
        title="Hideout"
        lead={
          <>
            Which <Term id="hideout">stations</Term> you have built, what the next level of each
            one needs, and which requirement is the one holding it up.
          </>
        }
      />

      {data.loading && !data.data && (
        <Card>
          <EmptyState title="Loading the hideout" hint="Fetching station data." />
        </Card>
      )}

      {rows.length === 0 && !data.loading && (
        <Card>
          <EmptyState
            icon={icons.home}
            title="No hideout data yet"
            hint="Stations come from the live game data feed. If this persists, the feed could not be reached."
          />
        </Card>
      )}

      {rows.length > 0 && (
        <div className="stack-lg flex flex-col">
          <Card
            title="Base progress"
            hint="Item counts here are the same stash the quest tracker uses — tick something off in one and it shows in the other."
          >
            <p className="flex items-baseline justify-between gap-3">
              <span className="text-2xl font-semibold tabular-nums">
                {progress.built}
                <span className="stat-of">/{progress.total}</span>
              </span>
              <span className="text-meta tabular-nums">
                {Math.round(progress.pct * 100)}% of all station levels built
              </span>
            </p>
            <span className="meter mt-2">
              <i style={{ width: `${progress.pct * 100}%`, background: "var(--accent)" }} />
            </span>
          </Card>

          {grouped.ready.length === 0 && grouped.building.length === 0 && (
            <Callout tone="accent">
              Nothing is ready to build. Mark a station done below and whatever it was gating
              appears here.
            </Callout>
          )}

          {GROUP_ORDER.filter((g) => grouped[g].length > 0).map((group) => (
            <section key={group}>
              <SectionHead
                title={
                  <>
                    {GROUP_META[group].title}{" "}
                    <span className="chip ml-1 tabular-nums">{grouped[group].length}</span>
                  </>
                }
                hint={GROUP_META[group].hint}
              />
              <ul className="grid grid-cols-1 gap-2 sm:grid-cols-2">
                {grouped[group].map((row) => (
                  <li key={row.station.id}>
                    <StationRow
                      row={row}
                      group={group}
                      onOpen={() => setOpenId(row.station.id)}
                    />
                  </li>
                ))}
              </ul>
            </section>
          ))}
        </div>
      )}

      {open && (
        <div
          className="fixed inset-0 z-50 grid place-items-end sm:place-items-center"
          role="dialog"
          aria-modal="true"
          aria-label={open.station.name}
        >
          <button
            type="button"
            className="absolute inset-0 bg-black/60 backdrop-blur-sm"
            aria-label="Close"
            onClick={() => setOpenId(null)}
          />
          <div
            className="surface animate-sheet relative z-10 max-h-[90vh] w-full max-w-lg overflow-auto p-4 sm:animate-none"
            style={{ boxShadow: "var(--shadow-lg)" }}
          >
            <header className="mb-3 flex items-start justify-between gap-2">
              <div className="min-w-0">
                <h2 className="text-lg font-semibold">{open.station.name}</h2>
                <p className="card-sub">{hideoutStatusLabel(open)}</p>
              </div>
              <button
                type="button"
                className="btn btn-ghost btn-icon flex-none"
                onClick={() => setOpenId(null)}
                aria-label="Close"
              >
                <Icon path={icons.close} size={16} />
              </button>
            </header>

            <ol className="space-y-2">
              {open.station.levels.map((level) => {
                const status = hideout[level.id];
                const done = status === "completed";
                return (
                  <li key={level.id} className="surface-2 p-3" data-done={done || undefined}>
                    <div className="mb-2 flex items-center justify-between gap-2">
                      <p className="text-sm font-semibold">Level {level.level}</p>
                      <button
                        type="button"
                        className={done ? "chip chip-button chip-accent" : "chip chip-button"}
                        onClick={() => {
                          if (done) {
                            setHideoutStatus(level.id, null);
                            return;
                          }
                          for (const id of completeThrough(open.station, level.level)) {
                            setHideoutStatus(id, "completed");
                          }
                        }}
                      >
                        {done ? "Built — undo" : "Mark built"}
                      </button>
                    </div>

                    {level.itemRequirements.length === 0 ? (
                      <p className="text-meta">No items needed for this level.</p>
                    ) : (
                      <ul className="space-y-1">
                        {level.itemRequirements.map((req) => {
                          const item = catalog.data?.items[req.itemId];
                          const have = itemCounts[req.itemId] ?? 0;
                          const enough = have >= req.count;
                          return (
                            <li key={req.itemId} className="flex items-center gap-2 text-sm">
                              {item?.icon ? (
                                <img
                                  src={item.icon}
                                  alt=""
                                  width={24}
                                  height={24}
                                  className="flex-none rounded"
                                  onError={(e) => {
                                    e.currentTarget.style.visibility = "hidden";
                                  }}
                                />
                              ) : (
                                <span className="h-6 w-6 flex-none rounded" style={{ background: "var(--panel-3)" }} />
                              )}
                              <span className="min-w-0 flex-1 truncate">
                                {item?.name ?? req.itemId}
                              </span>
                              <button
                                type="button"
                                className="btn btn-ghost btn-icon"
                                aria-label={`Remove one ${item?.name ?? req.itemId}`}
                                onClick={() => bumpItemCount(req.itemId, -1)}
                              >
                                <Icon path={icons.minus} size={14} />
                              </button>
                              <span
                                className="w-12 flex-none text-center tabular-nums"
                                style={{ color: enough ? "var(--ok)" : "var(--text-dim)" }}
                              >
                                {have}/{req.count}
                              </span>
                              <button
                                type="button"
                                className="btn btn-ghost btn-icon"
                                aria-label={`Add one ${item?.name ?? req.itemId}`}
                                onClick={() => bumpItemCount(req.itemId, 1)}
                              >
                                <Icon path={icons.plus} size={14} />
                              </button>
                            </li>
                          );
                        })}
                      </ul>
                    )}
                  </li>
                );
              })}
            </ol>
          </div>
        </div>
      )}
    </>
  );
}

function StationRow({
  row,
  group,
  onOpen,
}: {
  row: HideoutRow;
  group: Group;
  onOpen: () => void;
}) {
  /*
   * Station icons are hotlinked from tarkov.dev. A grid of broken-image glyphs
   * is the fastest way to make a working page look derelict, so a failure
   * falls back to the station's initial — which is indistinguishable from a
   * station that simply has no icon.
   */
  const [failed, setFailed] = useState(false);
  const max = row.station.levels.reduce((n, l) => Math.max(n, l.level), 0);
  const pct = max ? row.completedLevel / max : 0;

  return (
    <button type="button" className="card card-tight surface-link w-full text-left" onClick={onOpen}>
      <span className="flex items-center gap-3">
        {row.station.image && !failed ? (
          <img
            src={row.station.image}
            alt=""
            width={38}
            height={38}
            loading="lazy"
            className="flex-none rounded"
            onError={() => setFailed(true)}
          />
        ) : (
          <span
            className="grid h-[38px] w-[38px] flex-none place-items-center rounded text-sm font-semibold"
            style={{ background: "var(--panel-2)", color: "var(--text-faint)" }}
            aria-hidden="true"
          >
            {row.station.name.slice(0, 2).toUpperCase()}
          </span>
        )}

        <span className="min-w-0 flex-1">
          <span className="flex items-baseline justify-between gap-2">
            <span className="truncate font-medium">{row.station.name}</span>
            <span className="flex-none text-[0.7rem] tabular-nums faint">
              {row.completedLevel}/{max}
            </span>
          </span>
          <span className="mt-1 block text-meta">{hideoutStatusLabel(row)}</span>
          <span className="meter mt-1.5">
            <i
              style={{
                width: `${pct * 100}%`,
                background: group === "done" ? "var(--ok)" : "var(--accent)",
              }}
            />
          </span>
        </span>
      </span>
    </button>
  );
}
