import { useEffect, useState } from "react";
import { raidClock } from "../lib/tarkov-time";

/**
 * The two raid times for this map, as shown on the game's own map screen.
 *
 * Ticks once a second: the world clock runs at 7x, so a minute of game time
 * passes every ~8.6 real seconds and a slower tick would visibly stutter.
 */
export default function RaidClock({ mapName }: { mapName: string }) {
  const [clock, setClock] = useState(() => raidClock(mapName));

  useEffect(() => {
    setClock(raidClock(mapName));
    const id = window.setInterval(() => setClock(raidClock(mapName)), 1000);
    return () => window.clearInterval(id);
  }, [mapName]);

  const title = clock.note
    ? `${clock.note}. Raids run at these two times.`
    : "The two raids you can queue into now, 12 hours apart. Tarkov time runs 7x real time.";

  return (
    <div
      className="hidden items-center gap-1.5 rounded-lg px-2 py-1 sm:flex"
      style={{ background: "var(--panel-2)" }}
      title={title}
    >
      {clock.hasTime ? (
        <>
          <Face time={clock.left} day={clock.leftIsDay} />
          <span style={{ color: "var(--text-faint)" }}>/</span>
          <Face time={clock.right} day={!clock.leftIsDay} />
        </>
      ) : (
        // Sun/moon faces would be a lie on a map that has neither.
        <span style={{ fontSize: "0.72rem", color: "var(--text-dim)" }}>{clock.note}</span>
      )}
    </div>
  );
}

function Face({ time, day }: { time: string; day: boolean }) {
  return (
    <span className="flex items-center gap-1">
      <span aria-hidden="true" style={{ fontSize: "0.7rem", lineHeight: 1 }}>
        {day ? "☀" : "☾"}
      </span>
      <span
        className="tabular-nums"
        style={{ fontSize: "0.78rem", color: day ? "var(--text)" : "var(--text-dim)" }}
      >
        {time}
      </span>
      <span className="sr-only">{day ? "day raid" : "night raid"}</span>
    </span>
  );
}
