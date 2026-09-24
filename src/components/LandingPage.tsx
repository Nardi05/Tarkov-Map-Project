import { useMapIndex } from "../lib/data";
import { hasCharacterData } from "../lib/onboarding";
import { href, navigate, onNavClick } from "../lib/router";
import { useStore } from "../store";
import DataFreshness from "./DataFreshness";
import { MapLegend } from "./Onboarding";
import { TrackerCards } from "./Trackers";
import { Card, Icon, icons, Steps, Wordmark } from "./ui";

const SOURCE = "https://github.com/Nardi05/Tarkov-Map-Project";

/**
 * The first screen a new visitor sees.
 *
 * The site is several trackers — trader tasks, the story, the season, the
 * hideout — plus maps and a dashboard that read from them. The previous page
 * forked a visitor into "maps only" or one big tracker setup; this one lays
 * the trackers out side by side, each with its own setup, so somebody who only
 * cares about their ending never has to tick five hundred trader tasks first.
 */

/**
 * What the site currently holds, counted from the live index rather than
 * written into the copy.
 *
 * A landing page that claims "500+ quests" is a number somebody typed once and
 * nobody will ever correct. This one is whatever came back from the data
 * endpoint thirty seconds ago, which is also the most direct demonstration of
 * the thing the page says two sections further down.
 */
function AtAGlance() {
  const index = useMapIndex();
  const maps = index.data?.maps ?? [];

  const totals = maps.reduce(
    (acc, m) => ({
      spawns: acc.spawns + m.counts.spawns,
      exits: acc.exits + m.counts.extracts + m.counts.transits,
      tasks: acc.tasks + m.counts.quests,
      keys: acc.keys + m.counts.keys,
    }),
    { spawns: 0, exits: 0, tasks: 0, keys: 0 },
  );

  const rows: [string, number][] = [
    ["Maps", maps.length],
    ["Spawn points", totals.spawns],
    ["Exits and transits", totals.exits],
    ["Task objectives", totals.tasks],
    ["Locked doors", totals.keys],
  ];

  return (
    <aside className="card hero-glance" aria-label="What the site holds">
      <p className="kicker">On the map right now</p>
      <dl className="mt-3 divide-y" style={{ borderColor: "var(--line-soft)" }}>
        {rows.map(([label, value]) => (
          <div key={label} className="flex items-baseline justify-between gap-3 py-2">
            <dt className="text-[0.8125rem] muted">{label}</dt>
            <dd className="text-lg font-semibold tabular-nums">
              {index.loading && !index.data ? "—" : value.toLocaleString("en-GB")}
            </dd>
          </div>
        ))}
      </dl>
      <p className="mt-2 text-meta">
        Counted from the data the site is serving, not from a number typed into this page.
      </p>
    </aside>
  );
}

export default function LandingPage() {
  const setEntry = useStore((s) => s.setEntry);
  const returning = useStore((s) => s.entry === "tracker" || hasCharacterData(s.progress));

  const mapsOnly = () => {
    setEntry("maps");
    navigate(href.home());
  };

  const toDashboard = () => {
    setEntry("tracker");
    navigate(href.dashboard());
  };

  const chooseTrackers = () => {
    const el = document.getElementById("trackers");
    el?.scrollIntoView({ behavior: "smooth", block: "start" });
    el?.querySelector<HTMLElement>("h2")?.focus({ preventScroll: true });
  };

  return (
    <div className="page scroll-y h-full">
      <header className="app-bar">
        <div className="app-bar-inner">
          <Wordmark href={href.welcome()} />
          <div className="app-bar-tools">
            <a
              className="btn btn-ghost btn-sm"
              href={SOURCE}
              target="_blank"
              rel="noreferrer noopener"
            >
              <Icon path={icons.external} size={14} />
              Source
            </a>
            <a
              className="btn btn-ghost btn-icon"
              href={href.settings()}
              onClick={onNavClick(href.settings())}
              aria-label="Settings"
              title="Settings"
            >
              <Icon path={icons.settings} size={17} />
            </a>
          </div>
        </div>
      </header>

      <div className="shell landing-hero">
        {/* ------------------------------------------------------------ hero */}
        <section className="hero hero-split">
          <div className="min-w-0">
            <p className="eyebrow">Escape from Tarkov</p>
            <h1 className="hero-title mt-3">
              Track the parts
              <br />
              you care about.
            </h1>
            <p className="hero-lead">
              Separate trackers for trader tasks, the story, the season and your hideout. Maps
              draw markers from whichever you use, and the dashboard sums them all up. Free, no
              account, and everything stays in this browser.
            </p>

            <div className="hero-actions">
              <button type="button" className="btn btn-primary btn-lg" onClick={chooseTrackers}>
                Choose what to track
                <Icon path={icons.chevron} size={16} />
              </button>
              {returning ? (
                <button type="button" className="btn btn-lg" onClick={toDashboard}>
                  Go to my dashboard
                </button>
              ) : (
                <button type="button" className="btn btn-lg" onClick={mapsOnly}>
                  Just browse the maps
                </button>
              )}
            </div>
            <p className="mt-3 text-meta">
              Each tracker has its own short setup, and you can skip any of them. Set up one and
              the dashboard opens itself next time.
            </p>
          </div>

          <AtAGlance />
        </section>

        {/* ------------------------------------------------------ trackers */}
        <section id="trackers" className="mt-8 scroll-mt-6">
          <h2 className="display text-xl" tabIndex={-1}>
            Choose what to track
          </h2>
          <p className="mt-1 max-w-2xl text-meta">
            Tasks and Season share one walkthrough — a seasonal character is just a second set of
            trader lists. The story has its own. Maps and the hideout need no setup at all.
          </p>
          <div className="mt-4">
            <TrackerCards />
          </div>
        </section>

        {/* --------------------------------------------------- how it fits */}
        <section className="mt-10">
          <Card
            title="How the pieces fit"
            hint="Every tracker stands on its own. The maps and the dashboard are where they meet."
          >
            <Steps
              items={[
                {
                  title: "Set up the trackers you want",
                  body: "Tasks: tick the quests your traders have given you and the site works out what came before. Story: pick an ending and mark the chapters you have finished. Season: the same trader walkthrough, on your seasonal character.",
                },
                {
                  title: "Open a map",
                  body: "It draws your active task objectives, the story steps for your ending that happen there, and season document spawns — on top of spawns, extracts, keys and bosses.",
                },
                {
                  title: "Check the dashboard",
                  body: "A summary of every tracker in one place: what to run next, story progress, days left in the season. Rearrange it, hide what you do not use.",
                },
              ]}
            />
          </Card>
        </section>

        {/* -------------------------------------------------------- the key */}
        <section className="mt-10">
          <Card
            title="One rule to read any map"
            hint={
              <>
                Colour is <em>who</em> it belongs to. Shape is <em>what</em> it is. Learn those two
                and every map on the site reads the same way.
              </>
            }
          >
            <MapLegend limit={6} />
          </Card>
        </section>

        {/* ------------------------------------------------------- the data */}
        <section className="mt-10">
          <Card title="Kept current on its own">
            <p className="text-body">
              Maps, quests, keys and hideout requirements are rebuilt from{" "}
              <a className="underline" href="https://tarkov.dev" target="_blank" rel="noreferrer noopener">
                tarkov.dev
              </a>{" "}
              every day, live — not frozen at whatever the last deploy happened to catch. A patch
              that changes a task shows up here without anyone touching the site.
            </p>
            <div className="mt-3 border-t pt-3" style={{ borderColor: "var(--line-soft)" }}>
              <DataFreshness />
            </div>
          </Card>
        </section>

        {/* ------------------------------------------------------- footer */}
        <footer className="mt-14 border-t pt-7" style={{ borderColor: "var(--line)" }}>
          <div className="grid gap-6 sm:grid-cols-[1.5fr_1fr]">
            <div>
              <h2 className="text-[0.875rem] font-semibold">Credits</h2>
              <p className="mt-2 max-w-xl text-meta">
                Map artwork and game data from{" "}
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
                . Screenshots, document spawns and quest prerequisites from the{" "}
                <a
                  className="underline"
                  href="https://escapefromtarkov.fandom.com"
                  target="_blank"
                  rel="noreferrer noopener"
                >
                  Escape from Tarkov wiki
                </a>
                . Escape from Tarkov is a trademark of Battlestate Games; this is an unofficial fan
                project with no affiliation.
              </p>
            </div>

            <div>
              <h2 className="text-[0.875rem] font-semibold">Coming next</h2>
              <ul className="mt-2 space-y-1.5 text-meta">
                {[
                  "Cloud backup, so a cleared browser is not the end of a wipe",
                  "A Discord for feedback and wipe notes",
                  "Season 2 tracking the day it lands",
                ].map((item) => (
                  <li key={item} className="flex gap-2">
                    <span
                      className="mt-1.5 h-1 w-1 flex-none rounded-full"
                      style={{ background: "var(--accent)" }}
                    />
                    <span>{item}</span>
                  </li>
                ))}
              </ul>
            </div>
          </div>

          <div className="mt-6 flex flex-wrap items-center gap-2">
            <a className="btn btn-sm" href={SOURCE} target="_blank" rel="noreferrer noopener">
              <Icon path={icons.external} size={13} />
              Source
            </a>
            <a
              className="btn btn-sm"
              href={href.settings()}
              onClick={onNavClick(href.settings())}
            >
              Settings
            </a>
            <span className="chip" title="Placeholder — not live yet">
              Discord · soon
            </span>
          </div>
        </footer>
      </div>
    </div>
  );
}
