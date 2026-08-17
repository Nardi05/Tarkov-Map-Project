import { useMemo, useState } from "react";
import { prefetchMap } from "../lib/data";
import { href, navigate } from "../lib/router";
import { LAYERS } from "../lib/layers";
import { swatchSvg } from "../lib/marker-icons";
import { useStore } from "../store";
import type { MapIndexEntry } from "../types";
import { Icon, icons } from "./ui";

export default function HomePage({ maps }: { maps: MapIndexEntry[] }) {
  const [query, setQuery] = useState("");
  const lastMap = useStore((s) => s.lastMap);

  const filtered = useMemo(() => {
    const needle = query.trim().toLowerCase();
    if (!needle) return maps;
    return maps.filter(
      (m) =>
        m.name.toLowerCase().includes(needle) ||
        m.bosses.some((b) => b.toLowerCase().includes(needle)),
    );
  }, [maps, query]);

  const resume = maps.find((m) => m.normalizedName === lastMap);

  return (
    <div className="scroll-y h-full" style={{ background: "var(--bg)" }}>
      <div className="mx-auto w-full max-w-6xl px-4 py-8 sm:px-6 sm:py-12">
        <nav className="mb-6 flex items-center gap-1.5">
          <span className="btn is-active" aria-current="page">
            Maps
          </span>
          <a className="btn" href={href.quests()}>
            Quests
          </a>
        </nav>

        <header className="mb-8 sm:mb-10">
          <p
            className="mb-2 text-[0.7rem] font-semibold uppercase tracking-[0.16em]"
            style={{ color: "var(--accent)" }}
          >
            Escape from Tarkov
          </p>
          <h1 className="text-3xl font-semibold tracking-tight sm:text-4xl">Interactive maps</h1>
          <p className="mt-3 max-w-2xl text-[0.95rem] leading-relaxed" style={{ color: "var(--text-dim)" }}>
            Spawns, extracts, transits, keys and every task objective — on one map, with each layer
            explained in plain English. Pick a map to start.
          </p>

          <div className="mt-5 flex flex-wrap items-center gap-2">
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
                placeholder="Find a map or boss…"
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                aria-label="Search maps"
              />
            </div>
            {resume && (
              <a className="btn" href={href.map(resume.normalizedName)}>
                Continue on {resume.name}
              </a>
            )}
          </div>
        </header>

        <ul className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {filtered.map((map) => (
            <MapCard key={map.normalizedName} map={map} />
          ))}
        </ul>

        {filtered.length === 0 && (
          <p className="py-16 text-center text-sm" style={{ color: "var(--text-dim)" }}>
            No map matches “{query}”.
          </p>
        )}

        <Primer />

        <footer
          className="mt-12 border-t pt-6 text-xs leading-relaxed"
          style={{ borderColor: "var(--line)", color: "var(--text-faint)" }}
        >
          <p>
            Map artwork and game data come from{" "}
            <a className="underline" href="https://tarkov.dev" target="_blank" rel="noreferrer noopener">
              tarkov.dev
            </a>{" "}
            and the{" "}
            <a
              className="underline"
              href="https://github.com/the-hideout/tarkov-dev-svg-maps"
              target="_blank"
              rel="noreferrer noopener"
            >
              the-hideout SVG map project
            </a>
            . Escape from Tarkov is a trademark of Battlestate Games. This is an unofficial fan
            project with no affiliation.
          </p>
        </footer>
      </div>
    </div>
  );
}

function MapCard({ map }: { map: MapIndexEntry }) {
  const stats: [string, number][] = [
    ["spawns", map.counts.spawns],
    ["extracts", map.counts.extracts + map.counts.transits],
    ["tasks", map.counts.quests],
    ["keys", map.counts.keys],
  ];

  return (
    <li>
      <a
        href={href.map(map.normalizedName)}
        onMouseEnter={() => prefetchMap(map.normalizedName)}
        onFocus={() => prefetchMap(map.normalizedName)}
        onClick={(e) => {
          // Let modifier-clicks open a new tab as the user expects.
          if (e.metaKey || e.ctrlKey || e.shiftKey || e.button !== 0) return;
          e.preventDefault();
          navigate(href.map(map.normalizedName));
        }}
        className="surface map-card group flex h-full flex-col overflow-hidden"
      >
        <div
          className="relative aspect-[16/9] overflow-hidden"
          style={{ background: "var(--bg-deep)" }}
        >
          {map.preview ? (
            <img
              src={map.preview}
              alt=""
              loading="lazy"
              decoding="async"
              className="h-full w-full object-cover transition-transform duration-300 group-hover:scale-[1.04]"
              style={{ opacity: 0.92 }}
            />
          ) : (
            <div
              className="grid h-full w-full place-items-center text-4xl font-semibold"
              style={{ color: "var(--line)" }}
            >
              {map.name.slice(0, 2).toUpperCase()}
            </div>
          )}
          <div
            className="pointer-events-none absolute inset-0"
            style={{ background: "linear-gradient(to top, var(--panel) 4%, transparent 55%)" }}
          />
        </div>

        <div className="flex flex-1 flex-col p-3">
          <div className="flex items-baseline justify-between gap-2">
            <h2 className="truncate text-base font-semibold">{map.name}</h2>
            <span className="flex-none text-[0.68rem]" style={{ color: "var(--text-faint)" }}>
              {map.players ?? "—"}
              {map.raidDuration ? ` · ${map.raidDuration}m` : ""}
            </span>
          </div>

          {map.bosses.length > 0 && (
            <p className="mt-1.5 flex flex-wrap gap-1">
              {map.bosses.slice(0, 3).map((boss) => (
                <span key={boss} className="chip">
                  {boss}
                </span>
              ))}
              {map.bosses.length > 3 && <span className="chip">+{map.bosses.length - 3}</span>}
            </p>
          )}

          <dl className="mt-auto flex flex-wrap gap-x-3 gap-y-0.5 pt-3 text-[0.68rem]" style={{ color: "var(--text-faint)" }}>
            {stats.map(([label, value]) => (
              <div key={label} className="flex items-baseline gap-1">
                <dt className="sr-only">{label}</dt>
                <dd className="font-medium tabular-nums" style={{ color: "var(--text-dim)" }}>
                  {value}
                </dd>
                <span>{label}</span>
              </div>
            ))}
          </dl>
        </div>
      </a>
    </li>
  );
}

/** A short orientation for players who have never used a Tarkov map site. */
function Primer() {
  const picks = ["pmc-spawns", "pmc-extracts", "transits", "quests", "keys", "boss-spawns"];
  const items = LAYERS.filter((l) => picks.includes(l.id));

  return (
    <section className="mt-12">
      <h2 className="text-lg font-semibold tracking-tight">New to Tarkov maps?</h2>
      <p className="mt-1.5 max-w-2xl text-sm leading-relaxed" style={{ color: "var(--text-dim)" }}>
        Here is what the symbols mean. Colour tells you <em>who</em> something belongs to, shape
        tells you <em>what</em> it is — so a blue square is always a PMC exit, wherever you see it.
      </p>
      <ul className="mt-4 grid grid-cols-1 gap-2 sm:grid-cols-2 lg:grid-cols-3">
        {items.map((layer) => (
          <li key={layer.id} className="surface-2 flex items-start gap-2.5 p-3">
            <span
              className="mt-0.5 flex-none"
              aria-hidden="true"
              dangerouslySetInnerHTML={{ __html: swatchSvg(layer.shape, layer.color, 19) }}
            />
            <div>
              <p className="text-[0.8125rem] font-medium">{layer.label}</p>
              <p className="mt-0.5 text-[0.72rem] leading-snug" style={{ color: "var(--text-faint)" }}>
                {layer.hint}
              </p>
            </div>
          </li>
        ))}
      </ul>
    </section>
  );
}
