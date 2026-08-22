import { useEffect, useMemo, useState } from "react";
import { useHideoutData, useItemCatalog } from "../lib/data";
import { completeThrough, hideoutRows } from "../lib/hideout";
import { useHideout, useItemCounts, useStore } from "../store";
import { EmptyState, Icon, icons } from "./ui";

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
      <header className="mb-6">
        <h1 className="display text-2xl sm:text-3xl">Hideout</h1>
        <p className="mt-1.5 max-w-xl text-sm leading-relaxed" style={{ color: "var(--text-dim)" }}>
          Station levels for this character. Item counts are the same stash the quest planner uses.
        </p>
      </header>

      {data.loading && !data.data && (
        <EmptyState title="Loading hideout" hint="Fetching station data." />
      )}

      {rows.length === 0 && !data.loading && (
        <EmptyState
          title="No hideout data yet"
          hint="Stations live in public/data/hideout.json, baked with the rest of the game data."
        />
      )}

      <ul className="grid grid-cols-1 gap-2 sm:grid-cols-2">
        {rows.map((row) => (
          <li key={row.station.id}>
            <button
              type="button"
              className="surface flex w-full items-center gap-3 p-3 text-left"
              onClick={() => setOpenId(row.station.id)}
            >
              {row.station.image && (
                <img src={row.station.image} alt="" width={40} height={40} className="rounded" />
              )}
              <div className="min-w-0 flex-1">
                <p className="font-medium">{row.station.name}</p>
                <p className="text-[0.75rem]" style={{ color: "var(--text-faint)" }}>
                  {row.next
                    ? `Level ${row.completedLevel} · next ${row.next.level} (${row.status})`
                    : `Level ${row.completedLevel} · maxed`}
                </p>
              </div>
            </button>
          </li>
        ))}
      </ul>

      {open && (
        <div className="fixed inset-0 z-40 grid place-items-end sm:place-items-center" role="dialog" aria-modal="true">
          <button type="button" className="absolute inset-0 bg-black/50" aria-label="Close" onClick={() => setOpenId(null)} />
          <div className="surface relative z-10 max-h-[90vh] w-full max-w-lg overflow-auto p-4 sm:rounded-2xl">
            <header className="mb-3 flex items-start justify-between gap-2">
              <h2 className="text-lg font-semibold">{open.station.name}</h2>
              <button type="button" className="btn btn-ghost btn-icon" onClick={() => setOpenId(null)} aria-label="Close">
                <Icon path={icons.close} size={16} />
              </button>
            </header>
            <ol className="space-y-2">
              {open.station.levels.map((level) => {
                const status = hideout[level.id];
                return (
                  <li key={level.id} className="surface-2 p-3">
                    <div className="mb-2 flex items-center justify-between gap-2">
                      <p className="text-sm font-medium">Level {level.level}</p>
                      <div className="flex gap-1">
                        <button
                          type="button"
                          className="chip chip-button"
                          onClick={() => {
                            if (status === "completed") {
                              setHideoutStatus(level.id, null);
                              return;
                            }
                            for (const id of completeThrough(open.station, level.level)) {
                              setHideoutStatus(id, "completed");
                            }
                          }}
                        >
                          {status === "completed" ? "Completed" : "Mark done"}
                        </button>
                      </div>
                    </div>
                    <ul className="space-y-1">
                      {level.itemRequirements.map((req) => {
                        const item = catalog.data?.items[req.itemId];
                        const have = itemCounts[req.itemId] ?? 0;
                        return (
                          <li key={req.itemId} className="flex items-center gap-2 text-sm">
                            {item?.icon && <img src={item.icon} alt="" width={24} height={24} className="rounded" />}
                            <span className="min-w-0 flex-1 truncate">{item?.name ?? req.itemId}</span>
                            <button
                              type="button"
                              className="btn btn-ghost"
                              aria-label={`Remove one ${item?.name ?? req.itemId}`}
                              onClick={() => bumpItemCount(req.itemId, -1)}
                            >
                              −
                            </button>
                            <span className="tabular-nums">
                              {have}/{req.count}
                            </span>
                            <button
                              type="button"
                              className="btn btn-ghost"
                              aria-label={`Add one ${item?.name ?? req.itemId}`}
                              onClick={() => bumpItemCount(req.itemId, 1)}
                            >
                              +
                            </button>
                          </li>
                        );
                      })}
                    </ul>
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
