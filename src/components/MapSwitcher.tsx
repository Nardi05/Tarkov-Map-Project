import { useEffect, useRef, useState } from "react";
import { prefetchMap } from "../lib/data";
import type { MapIndexEntry } from "../types";
import { Icon, icons } from "./ui";

/** Map name in the header, doubling as the jump-to-another-map control. */
export default function MapSwitcher({
  maps,
  current,
  onPick,
}: {
  maps: MapIndexEntry[];
  current: string;
  onPick: (normalizedName: string) => void;
}) {
  const [open, setOpen] = useState(false);
  const rootRef = useRef<HTMLDivElement>(null);
  const entry = maps.find((m) => m.normalizedName === current);

  useEffect(() => {
    if (!open) return;
    const onPointerDown = (e: PointerEvent) => {
      if (!rootRef.current?.contains(e.target as Node)) setOpen(false);
    };
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && setOpen(false);
    document.addEventListener("pointerdown", onPointerDown);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("pointerdown", onPointerDown);
      document.removeEventListener("keydown", onKey);
    };
  }, [open]);

  return (
    <div ref={rootRef} className="relative min-w-0">
      <button
        type="button"
        className="btn btn-ghost min-w-0 max-w-full"
        aria-expanded={open}
        aria-haspopup="listbox"
        onClick={() => setOpen((v) => !v)}
      >
        <span className="truncate text-sm font-semibold">{entry?.name ?? current}</span>
        <Icon path={icons.chevron} size={15} />
      </button>

      {open && (
        <div
          className="surface animate-in absolute left-0 top-full z-[900] mt-1.5 max-h-[70vh] w-[17rem] overflow-y-auto p-1"
          style={{ boxShadow: "var(--shadow)" }}
          role="listbox"
        >
          {maps.map((map) => {
            const active = map.normalizedName === current;
            return (
              <button
                key={map.normalizedName}
                type="button"
                role="option"
                aria-selected={active}
                className="flex w-full items-center gap-2 rounded-lg px-2 py-1.5 text-left transition-colors hover:bg-[var(--panel-2)]"
                style={{ background: active ? "var(--panel-3)" : undefined }}
                onMouseEnter={() => prefetchMap(map.normalizedName)}
                onClick={() => {
                  onPick(map.normalizedName);
                  setOpen(false);
                }}
              >
                <span className="min-w-0 flex-1">
                  <span className="block truncate text-[0.8125rem] font-medium">{map.name}</span>
                  <span className="block text-[0.68rem]" style={{ color: "var(--text-faint)" }}>
                    {map.players ? `${map.players} players` : "—"}
                    {map.raidDuration ? ` · ${map.raidDuration} min` : ""}
                  </span>
                </span>
                {active && (
                  <span style={{ color: "var(--accent)" }}>
                    <Icon path={icons.check} size={15} />
                  </span>
                )}
              </button>
            );
          })}
        </div>
      )}
    </div>
  );
}
