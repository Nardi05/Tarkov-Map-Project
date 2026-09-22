import { useEffect, useMemo, useState } from "react";
import { prefetchIdleMaps, prefetchMap, prefetchProgression, useProgression } from "../lib/data";
import { KORD_SEASON, seasonDaysLeft } from "../lib/kord-season";
import { bossMatchesSearch, listMapBosses } from "../lib/boss-names";
import { MODE_META } from "../lib/mode";
import { nextRaids } from "../lib/next-raid";
import { href, navigate, onNavClick } from "../lib/router";
import { useStore, useTaskStatus } from "../store";
import type { MapIndexEntry } from "../types";
import NextRaid from "./NextRaid";
import { MapPrimer } from "./Onboarding";
import { useSlashSearch } from "./ShortcutHelp";
import { Card, EmptyState, Icon, icons, PageHeader, SectionHead, Term } from "./ui";

/**
 * The map picker.
 *
 * Its job is to get somebody onto the right map in one decision, so the order
 * is: what you were last doing, what your quests say you should do, then all
 * thirteen. The two promotional rows that used to sit above the grid (Story,
 * Kord Breach) are still here but pushed below it — they are worth knowing
 * about, and they are not what anybody opened this page for.
 */
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
  const suggested = raidPicks.filter((p) => p.active.length > 0);

  return (
    <>
      <PageHeader
        title="Maps"
        lead={
          <>
            Every playable location, with <Term id="pmc" /> and <Term id="scav" /> spawns, every{" "}
            <Term id="extract" />, and the quests you have ticked active.
          </>
        }
      >
        <div className="relative w-full sm:w-72">
          <span className="pointer-events-none absolute left-2.5 top-1/2 -translate-y-1/2 faint">
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
      </PageHeader>

      <div className="stack-lg flex flex-col">
        {/* ------------------------------------------------- pick up again */}
        {(resume || suggested.length > 0) && !query && (
          <section>
            <SectionHead
              title="Pick up where you left off"
              hint={`Showing ${MODE_META[profile.mode].label}. ${MODE_META[profile.mode].hint}`}
            />
            <div className="grid gap-2.5 lg:grid-cols-[minmax(0,1fr)_minmax(0,2fr)]">
              {resume && (
                <a
                  href={href.map(resume.normalizedName)}
                  onClick={onNavClick(href.map(resume.normalizedName))}
                  className="card surface-link justify-between"
                >
                  <div>
                    <p className="kicker">Last opened</p>
                    <p className="mt-1 text-lg font-semibold">{resume.name}</p>
                  </div>
                  <p className="mt-3 inline-flex items-center gap-1.5 text-[0.8rem] font-semibold"
                     style={{ color: "var(--accent)" }}>
                    Continue
                    <Icon path={icons.forward} size={14} />
                  </p>
                </a>
              )}
              {suggested.length > 0 && (
                <Card
                  title="Best map for your active quests"
                  hint="Ranked by how many of the tasks you have accepted are on it."
                >
                  <NextRaid picks={suggested} />
                </Card>
              )}
            </div>
          </section>
        )}

        {/* ------------------------------------------------------ the grid */}
        <section>
          <SectionHead
            title={query ? `Matching “${query.trim()}”` : "All maps"}
            hint={
              query
                ? `${filtered.length} of ${maps.length}`
                : "Tap one to open it. Hover to start loading it before you click."
            }
          />
          {filtered.length === 0 ? (
            <Card>
              <EmptyState
                icon={icons.search}
                title={`No map matches “${query.trim()}”`}
                hint="Try a map name, or a boss like Reshala, Killa or Goons."
                action={
                  <button type="button" className="btn" onClick={() => setQuery("")}>
                    Clear the search
                  </button>
                }
              />
            </Card>
          ) : (
            <ul className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3">
              {filtered.map((map, i) => (
                <MapCard key={map.normalizedName} map={map} priority={i < 3} />
              ))}
            </ul>
          )}
        </section>

        {/* ----------------------------------------------------- the primer */}
        {!query && <MapPrimer />}

        {/* --------------------------------------------------- what's on it */}
        {!query && (
          <section>
            <SectionHead title="Elsewhere on the site" />
            <div className="tile-grid">
              <a href={href.story()} onClick={onNavClick(href.story())} className="card surface-link">
                <p className="text-[0.875rem] font-semibold">Story endings</p>
                <p className="mt-1 text-meta">
                  Savior, Survivor, Debtor, Fallen — pick a target and follow the chapters, locks
                  and item spots.
                </p>
                <span className="mt-3 inline-flex items-center gap-1.5 text-[0.8rem] font-semibold"
                      style={{ color: "var(--accent)" }}>
                  Open Story
                  <Icon path={icons.forward} size={14} />
                </span>
              </a>
              <a
                href={href.quests()}
                onClick={onNavClick(href.quests())}
                className="card surface-link"
              >
                <p className="text-[0.875rem] font-semibold">
                  {KORD_SEASON.name}
                  <span className="ml-2 chip chip-season">
                    {days > 0 ? `${days}d left` : "ended"}
                  </span>
                </p>
                <p className="mt-1 text-meta">
                  The <Term id="kord">seasonal</Term> story line, battle-pass document spawns, and
                  what to run next for it.
                </p>
                <span className="mt-3 inline-flex items-center gap-1.5 text-[0.8rem] font-semibold"
                      style={{ color: "var(--accent)" }}>
                  Open Quests
                  <Icon path={icons.forward} size={14} />
                </span>
              </a>
            </div>
          </section>
        )}

        <footer className="text-meta">
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

  const bosses = listMapBosses(map.bosses);

  // Zeroes are omitted rather than printed. "0 extracts 0 tasks 0 keys" under
  // Icebreaker reads as a broken card; saying nothing reads as a small map.
  const stats: [string, number][] = (
    [
      ["spawns", map.counts.spawns],
      ["exits", map.counts.extracts + map.counts.transits],
      ["tasks", map.counts.quests],
      ["keys", map.counts.keys],
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
        <div className="relative aspect-[16/9] overflow-hidden" style={{ background: "var(--bg-deep)" }}>
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
          {/* Keeps the name legible over the lightest corner of any artwork. */}
          <div
            className="pointer-events-none absolute inset-x-0 bottom-0 h-16"
            style={{ background: "linear-gradient(to top, var(--panel), transparent)" }}
          />
        </div>

        <div className="flex flex-1 flex-col px-3.5 pb-3.5 pt-2">
          <div className="flex items-baseline justify-between gap-2">
            <h3 className="truncate text-[1rem] font-semibold">{map.name}</h3>
            <span className="flex-none text-[0.68rem] tabular-nums faint">
              {map.players ? `${map.players} PMC` : ""}
              {map.raidDuration ? `${map.players ? " · " : ""}${map.raidDuration} min` : ""}
            </span>
          </div>

          {bosses.length > 0 && (
            <p className="mt-2 flex flex-wrap gap-1">
              {bosses.slice(0, 3).map((boss) => (
                <span key={boss} className="chip">
                  {boss}
                </span>
              ))}
              {bosses.length > 3 && <span className="chip">+{bosses.length - 3}</span>}
            </p>
          )}

          <dl className="mt-auto flex flex-wrap gap-x-3.5 gap-y-0.5 pt-3 text-[0.7rem] faint">
            {stats.map(([label, value]) => (
              <div key={label} className="flex items-baseline gap-1">
                <dt className="sr-only">{label}</dt>
                <dd className="font-semibold tabular-nums" style={{ color: "var(--text)" }}>
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
