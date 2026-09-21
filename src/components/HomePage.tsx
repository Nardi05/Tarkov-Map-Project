import { useEffect, useMemo, useState } from "react";
import { prefetchIdleMaps, prefetchMap, prefetchProgression, useProgression } from "../lib/data";
import { KORD_SEASON, seasonDaysLeft } from "../lib/kord-season";
import { bossMatchesSearch, listMapBosses } from "../lib/boss-names";
import { MODE_META } from "../lib/mode";
import { nextRaids } from "../lib/next-raid";
import { href, navigate, onNavClick } from "../lib/router";
import { LAYERS } from "../lib/layers";
import { swatchSvg } from "../lib/marker-icons";
import { useStore, useTaskStatus } from "../store";
import type { MapIndexEntry } from "../types";
import NextRaid from "./NextRaid";
import { useSlashSearch } from "./ShortcutHelp";
import { Icon, icons, PageHeader } from "./ui";

export default function HomePage({ maps }: { maps: MapIndexEntry[] }) {
  const [query, setQuery] = useState("");
  useSlashSearch();
  const lastMap = useStore((s) => s.lastMap);
  const profile = useStore((s) => s.profile);
  const taskStatus = useTaskStatus();
  const progression = useProgression();
  const days = seasonDaysLeft();
  const raidPicks = useMemo(
    () => nextRaids(maps, progression.data, taskStatus, 3),
    [maps, progression.data, taskStatus],
  );

  useEffect(() => {
    prefetchProgression();
    const last = lastMap;
    const ranked = [
      ...raidPicks.map((p) => p.map.normalizedName),
      ...(last ? [last] : []),
      ...maps.map((m) => m.normalizedName),
    ];
    prefetchIdleMaps(ranked);
  }, [maps, lastMap, raidPicks]);

  const filtered = useMemo(() => {
    const needle = query.trim().toLowerCase();
    if (!needle) return maps;
    return maps.filter(
      (m) => m.name.toLowerCase().includes(needle) || bossMatchesSearch(m.bosses, needle),
    );
  }, [maps, query]);

  const resume = maps.find((m) => m.normalizedName === lastMap);

  return (
    <>
      <PageHeader
        title="Maps"
        lead="Open a map for spawns, extracts, keys and the quests you have ticked active."
      >
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
                data-search
              />
            </div>
            {resume && (
              <a
                className="btn is-active"
                href={href.map(resume.normalizedName)}
                onClick={onNavClick(href.map(resume.normalizedName))}
              >
                Continue {resume.name}
              </a>
            )}
      </PageHeader>
          <p className="-mt-2 mb-5 text-[0.72rem]" style={{ color: "var(--text-faint)" }}>
            Showing {MODE_META[profile.mode].label}. {MODE_META[profile.mode].hint}
          </p>

        <a
          href={href.story()}
          onClick={onNavClick(href.story())}
          className="surface surface-link mb-3 flex flex-wrap items-center justify-between gap-3 p-3.5"
        >
          <div className="min-w-0">
            <p className="text-sm font-semibold">Story endings</p>
            <p className="mt-0.5 text-[0.72rem]" style={{ color: "var(--text-faint)" }}>
              Savior, Survivor, Debtor, Fallen — pick a target and follow the path
            </p>
          </div>
          <span className="btn flex-none">Story</span>
        </a>
        <a
          href={href.quests()}
          onClick={onNavClick(href.quests())}
          className="surface surface-link mb-6 flex flex-wrap items-center justify-between gap-3 p-3.5"
        >
          <div className="min-w-0">
            <p className="text-sm font-semibold">
              {KORD_SEASON.name}
              <span className="ml-2 font-normal" style={{ color: "var(--text-faint)" }}>
                {days > 0 ? `${days}d left` : "ended"}
              </span>
            </p>
            <p className="mt-0.5 text-[0.72rem]" style={{ color: "var(--text-faint)" }}>
              Seasonal story line, documents, next raid
            </p>
          </div>
          <span className="btn flex-none">Quests</span>
        </a>

        {raidPicks.some((p) => p.active.length > 0) && (
          <section className="mb-8">
            <h2 className="mb-2 text-sm font-semibold">Next raid</h2>
            <NextRaid picks={raidPicks.filter((p) => p.active.length > 0)} />
          </section>
        )}

        <ul className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {filtered.map((map, i) => (
            <MapCard key={map.normalizedName} map={map} priority={i < 3} />
          ))}
        </ul>

        {filtered.length === 0 && (
          <p className="py-16 text-center text-sm" style={{ color: "var(--text-dim)" }}>
            No map matches “{query}”.
          </p>
        )}

        <Primer />

        <footer
          className="mt-16 border-t pt-6 text-xs leading-relaxed"
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
    </>
  );
}

function MapCard({ map, priority }: { map: MapIndexEntry; priority: boolean }) {
  /*
   * Previews are hotlinked from tarkov.dev's CDN. When one fails — a blocked
   * host, a flaky connection, an asset pulled upstream — the browser draws its
   * broken-image icon, and a grid of those makes a working site look derelict.
   * Falling back to the same placeholder used for maps that have no preview at
   * all means a failure is indistinguishable from an absence.
   */
  const [previewFailed, setPreviewFailed] = useState(false);
  const [ready, setReady] = useState(false);
  const preview = previewFailed ? null : map.preview;

  // Zeroes are omitted rather than printed. "0 extracts 0 tasks 0 keys" under
  // Icebreaker reads as a broken card; saying nothing reads as a small map.
  const bosses = listMapBosses(map.bosses);

  const stats: [string, number][] = (
    [
      ["spawns", map.counts.spawns],
      ["extracts", map.counts.extracts + map.counts.transits],
      ["tasks", map.counts.quests],
      ["keys", map.counts.keys],
      ["docs", map.counts.docs ?? 0],
    ] as [string, number][]
  ).filter(([, value]) => value > 0);

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
          {preview ? (
            <img
              src={preview}
              alt=""
              loading={priority ? "eager" : "lazy"}
              fetchPriority={priority ? "high" : "auto"}
              decoding="async"
              className={`img-fade h-full w-full object-cover ${ready ? "is-ready" : ""}`}
              onLoad={() => setReady(true)}
              onError={() => setPreviewFailed(true)}
            />
          ) : (
            <div
              className="display grid h-full w-full place-items-center text-5xl"
              style={{ color: "var(--line)" }}
            >
              {map.name.slice(0, 2).toUpperCase()}
            </div>
          )}
        </div>

        <div className="flex flex-1 flex-col px-3 pb-3 pt-2.5">
          <div className="flex items-baseline justify-between gap-2">
            <h2 className="truncate text-[0.95rem] font-semibold">{map.name}</h2>
            <span className="flex-none text-[0.68rem] tabular-nums" style={{ color: "var(--text-faint)" }}>
              {map.players ? `${map.players} PMC` : ""}
              {map.raidDuration ? `${map.players ? " · " : ""}${map.raidDuration} min` : ""}
            </span>
          </div>
          {bosses.length > 0 && (
            <p className="mt-1.5 flex flex-wrap gap-1">
              {bosses.slice(0, 4).map((boss) => (
                <span key={boss} className="chip">
                  {boss}
                </span>
              ))}
              {bosses.length > 4 && <span className="chip">+{bosses.length - 4}</span>}
            </p>
          )}

          <dl
            className="mt-auto flex flex-wrap gap-x-3.5 gap-y-0.5 pt-3 text-[0.68rem]"
            style={{ color: "var(--text-faint)" }}
          >
            {stats.map(([label, value]) => (
              <div key={label} className="flex items-baseline gap-1">
                <dt className="sr-only">{label}</dt>
                <dd className="font-medium tabular-nums" style={{ color: "var(--text)" }}>
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
    <details className="surface mt-10 p-4">
      <summary className="cursor-pointer text-sm font-semibold">How to read a map</summary>
      <p className="mt-2 max-w-2xl text-sm leading-relaxed" style={{ color: "var(--text-dim)" }}>
        Colour is <em>who</em> it belongs to. Shape is <em>what</em> it is. A blue square is always
        a PMC extract.
      </p>
      <ul className="mt-4 grid grid-cols-1 gap-2.5 sm:grid-cols-2 lg:grid-cols-3">
        {items.map((layer) => (
          <li key={layer.id} className="surface-2 flex items-start gap-3 p-3.5">
            <span
              className="mt-0.5 flex-none"
              aria-hidden="true"
              dangerouslySetInnerHTML={{ __html: swatchSvg(layer.shape, layer.color, 20) }}
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
    </details>
  );
}
