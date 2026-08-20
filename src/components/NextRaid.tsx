import { href, navigate } from "../lib/router";
import type { RaidPick } from "../lib/next-raid";

/** Ranked "queue this map" list, built from active tasks. */
export default function NextRaid({
  picks,
  emptyHint,
}: {
  picks: RaidPick[];
  emptyHint?: string;
}) {
  if (picks.length === 0) {
    return (
      <p className="text-[0.78rem] leading-relaxed" style={{ color: "var(--text-faint)" }}>
        {emptyHint ?? "Tick a task active and this will tell you which map to queue."}
      </p>
    );
  }

  return (
    <ul className="grid grid-cols-1 gap-2.5 sm:grid-cols-2">
      {picks.map((pick, i) => (
        <li key={pick.map.normalizedName}>
          <a
            href={href.map(pick.map.normalizedName)}
            onClick={(e) => {
              if (e.metaKey || e.ctrlKey || e.shiftKey || e.button !== 0) return;
              e.preventDefault();
              navigate(href.map(pick.map.normalizedName));
            }}
            className="surface-2 map-card flex h-full flex-col gap-1.5 p-3.5"
          >
            <span className="flex items-baseline justify-between gap-2">
              <span className="text-sm font-semibold">{pick.map.name}</span>
              <span
                className="chip flex-none tabular-nums"
                style={
                  i === 0 && pick.active.length > 0
                    ? {
                        borderColor: "color-mix(in srgb, var(--accent) 45%, transparent)",
                        color: "var(--accent)",
                      }
                    : undefined
                }
              >
                {i === 0 && pick.active.length > 0 ? "best raid" : `#${i + 1}`}
              </span>
            </span>
            <span className="text-[0.75rem] leading-snug" style={{ color: "var(--text-dim)" }}>
              {pick.active.length > 0
                ? pick.active.map((t) => t.name).join(" · ")
                : "No active tasks — documents only"}
            </span>
            <span className="mt-auto pt-1 text-[0.66rem]" style={{ color: "var(--text-faint)" }}>
              {pick.active.length > 0 && (
                <span>
                  {pick.active.length} active task{pick.active.length === 1 ? "" : "s"}
                </span>
              )}
              {pick.active.length > 0 && pick.documents > 0 && " · "}
              {pick.documents > 0 && (
                <span>
                  {pick.documents} document spawn{pick.documents === 1 ? "" : "s"}
                </span>
              )}
            </span>
          </a>
        </li>
      ))}
    </ul>
  );
}
