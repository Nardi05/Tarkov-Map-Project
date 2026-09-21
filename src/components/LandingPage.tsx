import { href, navigate, onNavClick } from "../lib/router";
import { useStore } from "../store";
import { Icon, icons, Wordmark } from "./ui";

const SOURCE = "https://github.com/Nardi05/Tarkov-Map-Project";

const FEATURES = [
  {
    title: "Maps",
    body: "Spawns, extracts, keys, bosses and quest pins on every playable map.",
  },
  {
    title: "Quest tracker",
    body: "Tick what you have accepted. The map draws those, and the dashboard ranks what is next.",
  },
  {
    title: "Hideout",
    body: "Station levels, item needs, and what is blocking the next upgrade.",
  },
  {
    title: "Screenshot import",
    body: "Read a trader list off a screenshot instead of retyping twenty names.",
  },
  {
    title: "Kord Breach",
    body: "Season story and battle-pass document spawns, refreshed from the wiki on deploy.",
  },
  {
    title: "Yours, on this device",
    body: "Nothing is uploaded. Export a file when you want the same wipe on another phone or PC.",
  },
];

const PLANNED = [
  "Cloud backup, so a cleared browser is not the end of a wipe",
  "A Discord for feedback and wipe notes",
  "Season 2 tracker the day it lands",
  "Tighter pins on document spawns the wiki only describes in prose",
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
      <div className="landing-hero mx-auto w-full max-w-3xl px-4 py-10 sm:px-6 sm:py-20">
        <Wordmark href={href.welcome()} />

        <header className="mt-12 sm:mt-16">
          <p className="eyebrow">Escape from Tarkov</p>
          <h1 className="display mt-3 text-[2.4rem] leading-[1.05] sm:text-5xl">
            Know the map.
            <br />
            Run the right raid.
          </h1>
          <p className="mt-4 max-w-lg text-[0.95rem] leading-relaxed" style={{ color: "var(--text-dim)" }}>
            Interactive maps and a tracker that puts <em>your</em> quests on them. Progress stays in
            this browser until you export it.
          </p>
        </header>

        <p className="mt-10 text-[0.68rem] font-semibold uppercase tracking-[0.16em]" style={{ color: "var(--text-faint)" }}>
          Start with one
        </p>
        <div className="mt-3 grid gap-3 sm:grid-cols-2">
          <button type="button" className="surface landing-choice p-5 text-left" onClick={mapsOnly}>
            <span className="landing-choice-kicker">01</span>
            <p className="mt-3 text-base font-semibold">Just the maps</p>
            <p className="mt-2 text-[0.82rem] leading-relaxed" style={{ color: "var(--text-dim)" }}>
              Spawns, extracts, keys and locations. No character setup. Add a tracker later from
              Settings.
            </p>
            <span className="mt-5 text-sm font-semibold" style={{ color: "var(--accent)" }}>
              Open maps →
            </span>
          </button>
          <button type="button" className="surface landing-choice p-5 text-left" onClick={fullSetup}>
            <span className="landing-choice-kicker">02</span>
            <p className="mt-3 text-base font-semibold">Set up a character</p>
            <p className="mt-2 text-[0.82rem] leading-relaxed" style={{ color: "var(--text-dim)" }}>
              Mode, faction, and the quests you have accepted. Next visit opens the dashboard with
              that layout.
            </p>
            <span className="mt-5 text-sm font-semibold" style={{ color: "var(--accent)" }}>
              Start setup →
            </span>
          </button>
        </div>

        <section className="mt-14">
          <h2 className="text-sm font-semibold">On the site</h2>
          <ul className="mt-3 grid gap-3 sm:grid-cols-2">
            {FEATURES.map((f) => (
              <li key={f.title} className="surface p-4">
                <p className="text-[0.82rem] font-semibold">{f.title}</p>
                <p className="mt-1 text-[0.78rem] leading-relaxed" style={{ color: "var(--text-dim)" }}>
                  {f.body}
                </p>
              </li>
            ))}
          </ul>
        </section>

        <section className="mt-12">
          <h2 className="text-sm font-semibold">Planned</h2>
          <ul className="mt-3 space-y-2.5 text-[0.82rem] leading-relaxed" style={{ color: "var(--text-dim)" }}>
            {PLANNED.map((item) => (
              <li key={item} className="flex gap-2.5">
                <span className="mt-1.5 h-1 w-1 flex-none rounded-full" style={{ background: "var(--accent)" }} />
                <span>{item}</span>
              </li>
            ))}
          </ul>
        </section>

        <footer
          className="mt-14 border-t pt-7 text-[0.75rem] leading-relaxed"
          style={{ borderColor: "var(--line)", color: "var(--text-dim)" }}
        >
          <h2 className="text-sm font-semibold" style={{ color: "var(--text)" }}>
            Credits
          </h2>
          <p className="mt-2 max-w-xl">
            Map and quest feeds from{" "}
            <a className="underline" href="https://tarkov.dev" target="_blank" rel="noreferrer">
              tarkov.dev
            </a>
            . Screenshots, document spawns and wiki prereqs from the{" "}
            <a
              className="underline"
              href="https://escapefromtarkov.fandom.com"
              target="_blank"
              rel="noreferrer"
            >
              Escape from Tarkov wiki
            </a>
            . Unofficial fan project, not affiliated with Battlestate Games.
          </p>
          <div className="mt-4 flex flex-wrap items-center gap-2">
            <a className="btn" href={SOURCE} target="_blank" rel="noreferrer">
              <Icon path={icons.external} size={14} />
              Source
            </a>
            <span className="chip" title="Placeholder — not live yet">
              Discord · soon
            </span>
            <span className="chip" title="Placeholder — not live yet">
              Coffee · soon
            </span>
          </div>
          <p className="mt-5">
            <a className="underline" href={href.settings()} onClick={onNavClick(href.settings())}>
              Settings
            </a>
            {" · "}
            already set up? the dashboard opens itself next visit.
          </p>
        </footer>
      </div>
    </div>
  );
}
