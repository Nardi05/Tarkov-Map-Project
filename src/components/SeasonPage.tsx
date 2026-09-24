import { useMemo } from "react";
import { useProgression } from "../lib/data";
import { KORD_SEASON, SEASON_TITLE } from "../lib/kord-season";
import { MODE_META } from "../lib/mode";
import { computeAvailability } from "../lib/progression";
import { href, navigate, onNavClick } from "../lib/router";
import { useStore } from "../store";
import SeasonPanel from "./SeasonPanel";
import { Callout, Card, icons, PageHeader } from "./ui";

/**
 * Seasonal tracking: the Kord Breach story line and the battle-pass documents.
 *
 * The line lives on the seasonal character, so this page always reads the
 * season slice — you can look at it from a PvP profile, but ticking it means
 * switching to Season, which is what the game makes you do too.
 */
export default function SeasonPage() {
  const progression = useProgression();
  const profile = useStore((s) => s.profile);
  const setProfile = useStore((s) => s.setProfile);
  const cycleTaskStatus = useStore((s) => s.cycleTaskStatus);
  const seasonStatus = useStore((s) => s.progress.season.taskStatus);
  const onSeason = profile.mode === "season";

  const seasonProfile = useMemo(() => ({ ...profile, mode: "season" as const }), [profile]);
  const availability = useMemo(
    () => computeAvailability(progression.data, seasonStatus, seasonProfile),
    [progression.data, seasonStatus, seasonProfile],
  );

  const traderTicks = Object.keys(seasonStatus).filter((id) => !id.startsWith("kord:")).length;

  return (
    <>
      <PageHeader
        title="Season"
        lead={`${SEASON_TITLE}: the seasonal story line, the battle-pass documents, and how long is left. Tracked on its own character.`}
      >
        <button
          type="button"
          className="btn"
          onClick={() => {
            setProfile("mode", "season");
            navigate(href.setup());
          }}
        >
          {Object.keys(seasonStatus).length ? "Re-run season setup" : "Set up season"}
        </button>
      </PageHeader>

      {!onSeason && (
        <Callout tone="accent" className="mb-4" icon={icons.info}>
          <b className="font-semibold" style={{ color: "var(--text)" }}>
            You are on your {MODE_META[profile.mode].label} character.
          </b>{" "}
          Season progress is kept separately. Switch to it to tick the line below and to have
          maps, tasks and the dashboard follow your seasonal wipe.{" "}
          <button
            type="button"
            className="underline underline-offset-2"
            onClick={() => setProfile("mode", "season")}
          >
            Switch to Season
          </button>
        </Callout>
      )}

      <div className="stack">
        <SeasonPanel
          mode={profile.mode}
          taskStatus={seasonStatus}
          availability={availability}
          onCycle={(id) => {
            if (onSeason) cycleTaskStatus(id);
          }}
        />

        <Card
          title="Trader tasks on your seasonal character"
          hint={
            traderTicks
              ? `${traderTicks} trader task${traderTicks === 1 ? "" : "s"} tracked on Season. They live on the Tasks page while Season is selected.`
              : "The seasonal character has its own trader lists. The task setup walks through them the same way it does for PvP."
          }
          action={
            onSeason ? (
              <a className="btn btn-sm flex-none" href={href.quests()} onClick={onNavClick(href.quests())}>
                Open tasks
              </a>
            ) : undefined
          }
        />

        {KORD_SEASON.notes.length > 0 && (
          <Card title="Season notes">
            <ul className="space-y-1.5 text-meta">
              {KORD_SEASON.notes.map((note) => (
                <li key={note} className="flex gap-2">
                  <span
                    className="mt-1.5 h-1 w-1 flex-none rounded-full"
                    style={{ background: "var(--season)" }}
                  />
                  <span>{note}</span>
                </li>
              ))}
            </ul>
          </Card>
        )}
      </div>
    </>
  );
}
