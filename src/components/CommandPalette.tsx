import { useEffect, useMemo, useState } from "react";
import { useHideoutData, useMapIndex, useProgression } from "../lib/data";
import { href, navigate } from "../lib/router";
import { STORY } from "../lib/story";
import { displayName, visibleInMode } from "../lib/task-variant";
import { useStore } from "../store";
import { Icon, icons, Kbd } from "./ui";

const GO_TO: { kind: string; label: string; href: string }[] = [
  { kind: "Go", label: "Dashboard", href: href.dashboard() },
  { kind: "Go", label: "Start page", href: href.welcome() },
  { kind: "Go", label: "Maps", href: href.home() },
  { kind: "Go", label: "Story", href: href.story() },
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
    /*
     * The visible way in. ⌘K has always worked and nothing on screen said so,
     * which made the fastest route around the site invisible to anyone who had
     * not read the source — so the header now carries a search button, and it
     * opens the palette through this event rather than by lifting `open` into
     * a store nothing else needs.
     */
    const onAsk = () => setOpen(true);
    window.addEventListener("tk:palette", onAsk);
    return () => {
      window.removeEventListener("keydown", onKey, true);
      window.removeEventListener("tk:palette", onAsk);
    };
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

    for (const ending of STORY.endings) {
      if (!q || matches(ending.name) || matches("story") || matches(ending.tagline)) {
        out.push({ kind: "Story", label: `${ending.name} ending`, href: href.story(ending.id) });
      }
    }

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
    <div
      className="fixed inset-0 z-50 grid place-items-start justify-center px-4 pt-[12vh]"
      role="dialog"
      aria-modal="true"
      aria-label="Search"
    >
      <button
        type="button"
        className="absolute inset-0 bg-black/60 backdrop-blur-sm"
        aria-label="Close search"
        onClick={() => setOpen(false)}
      />
      <div
        className="surface animate-in relative z-10 w-[min(34rem,100%)] p-3"
        style={{ boxShadow: "var(--shadow-lg)" }}
      >
        <div className="relative">
          <span className="pointer-events-none absolute left-2.5 top-1/2 -translate-y-1/2 faint">
            <Icon path={icons.search} size={15} />
          </span>
        <input
          autoFocus
          className="input input-icon w-full"
          placeholder="Search maps, quests, hideout stations…"
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
        </div>
        <ul className="scroll-y mt-2 max-h-[min(22rem,50vh)]">
          {results.map((r, i) => (
            <li key={`${r.kind}:${r.label}:${r.href}`}>
              <button
                type="button"
                className="flex w-full items-center gap-2.5 rounded-[var(--r-sm)] px-2 py-2 text-left text-sm"
                style={
                  i === selected
                    ? { background: "var(--accent-soft)", color: "var(--accent)" }
                    : undefined
                }
                onClick={() => jump(r.href)}
                onMouseEnter={() => setSelected(i)}
              >
                <span className="badge w-[4.5rem] flex-none justify-center">{r.kind}</span>
                <span className="min-w-0 flex-1 truncate">{r.label}</span>
                {i === selected && <Icon path={icons.forward} size={14} />}
              </button>
            </li>
          ))}
          {q && results.length === 0 && (
            <li className="px-2 py-4 text-center text-sm faint">
              Nothing matches “{query.trim()}”.
            </li>
          )}
        </ul>
        <p className="mt-2 flex flex-wrap items-center gap-x-3 gap-y-1 border-t pt-2 text-[0.68rem] faint"
           style={{ borderColor: "var(--line-soft)" }}>
          <span className="inline-flex items-center gap-1">
            <Kbd>↑</Kbd>
            <Kbd>↓</Kbd> move
          </span>
          <span className="inline-flex items-center gap-1">
            <Kbd>↵</Kbd> open
          </span>
          <span className="inline-flex items-center gap-1">
            <Kbd>esc</Kbd> close
          </span>
        </p>
      </div>
    </div>
  );
}
