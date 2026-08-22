import { useEffect, useMemo, useState } from "react";
import { useHideoutData, useMapIndex, useProgression } from "../lib/data";
import { href, navigate } from "../lib/router";
import { displayName, visibleInMode } from "../lib/task-variant";
import { useStore } from "../store";

const GO_TO: { kind: string; label: string; href: string }[] = [
  { kind: "Go", label: "Dashboard", href: href.dashboard() },
  { kind: "Go", label: "Maps", href: href.home() },
  { kind: "Go", label: "Quests", href: href.quests() },
  { kind: "Go", label: "Task graph", href: href.quests("graph") },
  { kind: "Go", label: "Items", href: href.quests("items") },
  { kind: "Go", label: "Hideout", href: href.hideout() },
  { kind: "Go", label: "Settings", href: href.settings() },
  { kind: "Go", label: "Task sync", href: href.setup() },
];

export default function CommandPalette() {
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");
  const [selected, setSelected] = useState(0);
  const progression = useProgression();
  const maps = useMapIndex();
  const hideout = useHideoutData();
  const mode = useStore((s) => s.profile.mode);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "k" && (e.metaKey || e.ctrlKey)) {
        e.preventDefault();
        setOpen((v) => !v);
        return;
      }
      if (e.key === "Escape" && open) {
        e.preventDefault();
        e.stopPropagation();
        setOpen(false);
      }
    };
    window.addEventListener("keydown", onKey, true);
    return () => window.removeEventListener("keydown", onKey, true);
  }, [open]);

  useEffect(() => {
    if (!open) return;
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.body.style.overflow = prev;
    };
  }, [open]);

  const q = query.trim().toLowerCase();
  const results = useMemo(() => {
    const out: { kind: string; label: string; href: string }[] = [];
    const matches = (label: string) => label.toLowerCase().includes(q);

    for (const item of GO_TO) if (!q || matches(item.label)) out.push(item);
    if (!q) return out;

    for (const map of maps.data?.maps ?? []) {
      if (matches(map.name)) out.push({ kind: "Map", label: map.name, href: href.map(map.normalizedName) });
    }

    if (progression.data) {
      for (const [id, task] of Object.entries(progression.data.tasks)) {
        if (!visibleInMode(task.name, mode)) continue;
        const name = displayName(task.name);
        if (!matches(name)) continue;
        const mapSlug = task.maps[0];
        out.push({
          kind: "Task",
          label: name,
          href: mapSlug ? href.map(mapSlug, id) : href.quests("list", id),
        });
        if (out.filter((r) => r.kind === "Task").length >= 12) break;
      }
    }

    for (const station of hideout.data?.stations ?? []) {
      if (matches(station.name)) {
        out.push({ kind: "Hideout", label: station.name, href: href.hideout() });
      }
    }

    return out.slice(0, 24);
  }, [q, maps.data, progression.data, hideout.data, mode]);

  useEffect(() => {
    setSelected(0);
  }, [q, open]);

  const jump = (to: string) => {
    setOpen(false);
    setQuery("");
    navigate(to);
  };

  if (!open) return null;

  return (
    <div className="fixed inset-0 z-50 grid place-items-start justify-center pt-[15vh]" role="dialog" aria-modal="true">
      <button type="button" className="absolute inset-0 bg-black/50" aria-label="Close search" onClick={() => setOpen(false)} />
      <div className="surface relative z-10 w-[min(32rem,calc(100vw-2rem))] p-3">
        <input
          autoFocus
          className="input w-full"
          placeholder="Search tasks, maps, hideout…"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "ArrowDown") {
              e.preventDefault();
              setSelected((i) => Math.min(results.length - 1, i + 1));
            } else if (e.key === "ArrowUp") {
              e.preventDefault();
              setSelected((i) => Math.max(0, i - 1));
            } else if (e.key === "Enter" && results[selected]) {
              e.preventDefault();
              jump(results[selected].href);
            }
          }}
          aria-label="Search the site"
        />
        <ul className="mt-2 max-h-72 overflow-auto">
          {results.map((r, i) => (
            <li key={`${r.kind}:${r.label}:${r.href}`}>
              <button
                type="button"
                className="flex w-full items-baseline gap-2 rounded px-2 py-1.5 text-left text-sm hover:bg-[var(--panel-2)]"
                style={i === selected ? { background: "var(--panel-2)" } : undefined}
                onClick={() => jump(r.href)}
                onMouseEnter={() => setSelected(i)}
              >
                <span className="w-16 flex-none text-[0.68rem] uppercase" style={{ color: "var(--text-faint)" }}>
                  {r.kind}
                </span>
                <span className="min-w-0 truncate">{r.label}</span>
              </button>
            </li>
          ))}
          {q && results.length === 0 && (
            <li className="px-2 py-3 text-sm" style={{ color: "var(--text-faint)" }}>
              Nothing matches.
            </li>
          )}
        </ul>
        <p className="mt-2 text-[0.66rem]" style={{ color: "var(--text-faint)" }}>
          ⌘K / Ctrl+K · Enter to open
        </p>
      </div>
    </div>
  );
}
