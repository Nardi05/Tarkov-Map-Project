import { href, navigate, onNavClick } from "../lib/router";
import { useStore } from "../store";
import { Icon, icons, Wordmark } from "./ui";

const SOURCE = "https://github.com/Nardi05/Tarkov-Map-Project";

const FEATURES = [
  {
    title: "Maps",
    body: "Spawns, extracts, keys, bosses and quest pins on every playable map, including Icebreaker and Terminal.",
  },
  {
    title: "Quest tracker",
    body: "Tick what you have accepted. The map draws those objectives and the dashboard ranks what to do next.",
  },
  {
    title: "Hideout",
    body: "Station levels, item needs and what is blocking the next upgrade.",
  },
  {
    title: "Screenshot import",
    body: "Read a quest list off a screenshot so you do not re-type twenty trader tasks.",
  },
  {
    title: "Kord Breach",
    body: "Season story line and battle-pass document spawns, pulled from the wiki on each deploy.",
  },
  {
    title: "Saves stay here",
    body: "Progress lives in this browser. Export a file when you want the same wipe on another phone or PC.",
  },
];

const PLANNED = [
  "Cloud backup of progress, so a cleared browser is not the end of a wipe",
  "A Discord for feedback and wipe notes",
  "Season 2 tracker the day it lands",
  "Tighter pins on document spawns that the wiki only describes in prose",
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
      <div className="mx-auto w-full max-w-3xl px-4 py-10 sm:px-6 sm:py-16">
        <Wordmark href={href.welcome()} />

        <header className="mt-10">
          <p className="eyebrow" style={{ color: "var(--accent)" }}>
            Escape from Tarkov
          </p>
          <h1 className="display mt-2 text-3xl sm:text-4xl">Start here</h1>
          <p className="mt-3 max-w-xl text-sm leading-relaxed" style={{ color: "var(--text-dim)" }}>
            Maps for a raid, or a tracker that follows your character. Nothing is uploaded.
            Progress stays on this device until you export it.
          </p>
        </header>

        <p className="mt-8 text-[0.72rem] font-semibold uppercase tracking-wider" style={{ color: "var(--text-faint)" }}>
          Choose one
        </p>
        <div className="mt-2 grid gap-3 sm:grid-cols-2">
          <button type="button" className="surface landing-choice p-5 text-left" onClick={mapsOnly}>
            <p className="text-sm font-semibold">Just the maps</p>
            <p className="mt-2 text-[0.8rem] leading-relaxed" style={{ color: "var(--text-dim)" }}>
              Spawns, extracts, keys and locations. Skip character setup. You can add a tracker
              later from Settings.
            </p>
            <span className="btn is-active mt-4">Open maps</span>
          </button>
          <button type="button" className="surface landing-choice p-5 text-left" onClick={fullSetup}>
            <p className="text-sm font-semibold">Set up a character</p>
            <p className="mt-2 text-[0.8rem] leading-relaxed" style={{ color: "var(--text-dim)" }}>
              Mode, faction, trader tasks and screenshot sync. Lands you on the dashboard with
              that layout next time you open the site.
            </p>
            <span className="btn is-active mt-4">Start setup</span>
          </button>
        </div>

        <section className="mt-12">
          <h2 className="text-sm font-semibold">On the site</h2>
          <ul className="mt-3 grid gap-3 sm:grid-cols-2">
            {FEATURES.map((f) => (
              <li key={f.title} className="surface p-4">
                <p className="text-[0.8rem] font-semibold">{f.title}</p>
                <p className="mt-1 text-[0.75rem] leading-relaxed" style={{ color: "var(--text-dim)" }}>
                  {f.body}
                </p>
              </li>
            ))}
          </ul>
        </section>

        <section className="mt-10">
          <h2 className="text-sm font-semibold">Planned</h2>
          <ul className="mt-3 space-y-2 text-[0.8rem] leading-relaxed" style={{ color: "var(--text-dim)" }}>
            {PLANNED.map((item) => (
              <li key={item} className="flex gap-2">
                <span style={{ color: "var(--accent)" }} aria-hidden="true">
                  ·
                </span>
                <span>{item}</span>
              </li>
            ))}
          </ul>
        </section>

        <footer
          className="mt-12 border-t pt-6 text-[0.75rem] leading-relaxed"
          style={{ borderColor: "var(--line)", color: "var(--text-dim)" }}
        >
          <h2 className="text-sm font-semibold text-[var(--text)]">Credits</h2>
          <p className="mt-2">
            Map and quest feeds from{" "}
            <a className="underline" href="https://tarkov.dev" target="_blank" rel="noreferrer">
              tarkov.dev
            </a>
            . Quest screenshots, document spawns and wiki prereqs from the{" "}
            <a
              className="underline"
              href="https://escapefromtarkov.fandom.com"
              target="_blank"
              rel="noreferrer"
            >
              Escape from Tarkov wiki
            </a>
            . Fan project, not affiliated with Battlestate Games.
          </p>
          <div className="mt-4 flex flex-wrap gap-2">
            <a
              className="btn"
              href={SOURCE}
              target="_blank"
              rel="noreferrer"
            >
              <Icon path={icons.external} size={14} />
              Source
            </a>
            <span className="btn" title="Placeholder — not live yet" aria-disabled="true">
              Discord
              <span className="ml-1.5 text-[0.65rem]" style={{ color: "var(--text-faint)" }}>
                soon
              </span>
            </span>
            <span className="btn" title="Placeholder — not live yet" aria-disabled="true">
              Buy me a coffee
              <span className="ml-1.5 text-[0.65rem]" style={{ color: "var(--text-faint)" }}>
                soon
              </span>
            </span>
          </div>
          <p className="mt-4">
            <a className="underline" href={href.settings()} onClick={onNavClick(href.settings())}>
              Settings
            </a>
            {" · "}
            already set up? the dashboard will open itself next visit.
          </p>
        </footer>
      </div>
    </div>
  );
}
