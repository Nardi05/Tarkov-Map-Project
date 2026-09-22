import { href, navigate, onNavClick } from "../lib/router";
import { useStore } from "../store";
import DataFreshness from "./DataFreshness";
import { MapLegend } from "./Onboarding";
import { Card, Icon, icons, Steps, Term, Wordmark } from "./ui";

const SOURCE = "https://github.com/Nardi05/Tarkov-Map-Project";

/**
 * The first screen a new visitor sees.
 *
 * The old one opened with seven feature cards, a roadmap and a credits block —
 * a README rendered as a page. It asked the visitor to read about the site
 * before it let them use it, and then forked them into "just the maps" or a
 * five-hundred-task walkthrough, a decision nobody arriving for the first time
 * has any basis to make.
 *
 * This one leads with what the site is for in one sentence, offers one obvious
 * way in and one smaller one, and only then explains itself. Everything that
 * used to be above the fold is still here, further down, where somebody who
 * wants it will scroll.
 */

const WHAT_YOU_GET = [
  {
    icon: icons.map,
    title: "Every playable map",
    body: "Spawns, extracts, transits, keys, boss positions and hazards on all 13 maps, in a clean vector style or photographic satellite tiles.",
  },
  {
    icon: icons.tasks,
    title: "Your quests, on the map",
    body: "Tick what your traders have given you. Only those objectives are drawn, so you see your raid instead of a wall of green.",
  },
  {
    icon: icons.compass,
    title: "What to run next",
    body: "The dashboard ranks what is actually available to you, which map has most of it, and what to bring.",
  },
  {
    icon: icons.book,
    title: "Story endings",
    body: "Savior, Survivor, Debtor and Fallen. Pick a target and follow the chapters, the locks and the item spots.",
  },
  {
    icon: icons.home,
    title: "Hideout",
    body: "Station levels, what each upgrade needs, and which requirement is the one blocking it.",
  },
  {
    icon: icons.spark,
    title: "Screenshot import",
    body: "Point it at a screenshot of your trader list and it reads the quest names off it, instead of you typing twenty.",
  },
];

export default function LandingPage() {
  const setEntry = useStore((s) => s.setEntry);

  const mapsOnly = () => {
    setEntry("maps");
    navigate(href.home());
  };

  const fullSetup = () => {
    setEntry("tracker");
    navigate(href.setup());
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
        <section className="hero">
          <p className="eyebrow">Escape from Tarkov</p>
          <h1 className="hero-title mt-3">
            Know the map.
            <br />
            Run the right raid.
          </h1>
          <p className="hero-lead">
            Interactive maps for every location, and a tracker that puts <em>your</em> quests on
            them. Free, no account, and everything you tick stays in this browser.
          </p>

          <div className="hero-actions">
            <button type="button" className="btn btn-primary btn-lg" onClick={fullSetup}>
              Set up my character
              <Icon path={icons.forward} size={16} />
            </button>
            <button type="button" className="btn btn-lg" onClick={mapsOnly}>
              Just browse the maps
            </button>
          </div>
          <p className="mt-3 text-meta">
            Setting up takes about two minutes and you can skip any part of it. Already been here?
            The dashboard opens itself next time.
          </p>
        </section>

        {/* --------------------------------------------------- how it works */}
        <section className="mt-6">
          <Card
            title="How it works"
            hint="Three steps, and only the first one needs anything from you."
          >
            <Steps
              items={[
                {
                  title: "Tell it which quests you have accepted",
                  body: (
                    <>
                      Tick them off a trader list, or import a screenshot. From those it works out
                      everything you must already have finished — a <Term id="trader" /> will not
                      hand you a task until the ones behind it are done.
                    </>
                  ),
                },
                {
                  title: "Open the map you are about to queue into",
                  body: (
                    <>
                      Your active objectives are drawn on it, along with <Term id="pmc" /> and{" "}
                      <Term id="scav" /> spawns, every <Term id="extract" />, <Term id="transit" />{" "}
                      and locked door.
                    </>
                  ),
                },
                {
                  title: "Tick things off as you go",
                  body: "A task with three mark spots remembers which one you did. Nothing is uploaded; export a file when you want the same progress on another device.",
                },
              ]}
            />
          </Card>
        </section>

        {/* --------------------------------------------------- what you get */}
        <section className="mt-10">
          <h2 className="display text-xl">What's on the site</h2>
          <ul className="tile-grid tile-grid-3 mt-4">
            {WHAT_YOU_GET.map((f) => (
              <li key={f.title} className="card card-tight">
                <span className="mb-2.5 flex h-8 w-8 items-center justify-center rounded-[var(--r-xs)] border"
                      style={{ borderColor: "var(--accent-line)", background: "var(--accent-soft)", color: "var(--accent)" }}>
                  <Icon path={f.icon} size={16} />
                </span>
                <p className="text-[0.875rem] font-semibold">{f.title}</p>
                <p className="mt-1 text-meta">{f.body}</p>
              </li>
            ))}
          </ul>
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
