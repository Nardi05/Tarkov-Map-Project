import { useEffect, useState } from "react";
import { raidClock } from "../lib/tarkov-time";

/**
 * The two raid times for this map, as shown on the game's own map screen.
 *
 * Ticks once a second: the world clock runs at 7x, so a minute of game time
 * passes every ~8.6 real seconds and a slower tick would visibly stutter.
 */
export default function RaidClock({
  mapName,
  variant = "compact",
}: {
  mapName: string;
  /** `board` is the dashboard header pair, labelled like Kappa's raid time. */
  variant?: "compact" | "board";
}) {
  const [clock, setClock] = useState(() => raidClock(mapName));

  useEffect(() => {
    setClock(raidClock(mapName));
    const id = window.setInterval(() => setClock(raidClock(mapName)), 1000);
    return () => window.clearInterval(id);
  }, [mapName]);

  const title = clock.note
    ? `${clock.note}. Raids run at these two times.`
    : "The two raids you can queue into now, 12 hours apart. Tarkov time runs 7x real time.";

  if (variant === "board") {
    return (
      <div className="raid-board" title={title}>
        <p className="raid-board-label">Raid time</p>
        {clock.hasTime ? (
          <div className="raid-board-pair">
            <span className="raid-board-face tabular-nums">{clock.left}</span>
            <span className="raid-board-face tabular-nums">{clock.right}</span>
          </div>
        ) : (
          <p className="text-[0.75rem]" style={{ color: "var(--text-dim)" }}>
            {clock.note}
          </p>
        )}
      </div>
    );
  }

  return (
    <div
      className="raid-clock flex flex-none items-center rounded-lg"
      style={{ background: "var(--panel-2)" }}
      title={title}
    >
      {clock.hasTime ? (
        <>
          <Face time={clock.left} day={clock.leftIsDay} />
          <span aria-hidden="true" style={{ color: "var(--text-faint)" }}>
          /
        </span>
          <Face time={clock.right} day={!clock.leftIsDay} />
        </>
      ) : (
        // Sun/moon faces would be a lie on a map that has neither.
        <span style={{ color: "var(--text-dim)" }}>{clock.note}</span>
      )}
    </div>
  );
}

function Face({ time, day }: { time: string; day: boolean }) {
  return (
    <span className="flex items-center gap-0.5">
      <span aria-hidden="true" className="raid-clock-face">
        {day ? "☀" : "☾"}
      </span>
      <span className="tabular-nums" style={{ color: day ? "var(--text)" : "var(--text-dim)" }}>
        {time}
      </span>
      <span className="sr-only">{day ? "day raid" : "night raid"}</span>
    </span>
  );
}
