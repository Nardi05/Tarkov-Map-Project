import { describeAge, useDataRefresh, useDataStatus } from "../lib/data";
import { Icon, icons } from "./ui";

/**
 * Where the game data on screen came from, and how old it is.
 *
 * This exists because the answer used to be "whenever somebody last deployed",
 * and nothing said so. Quests, trader levels and hideout requirements change
 * with every patch, and a tracker quietly showing last month's graph is worse
 * than one that admits it — you would plan a wipe around it.
 *
 * Now the site rebuilds from tarkov.dev daily on its own, and this line is how
 * that becomes visible rather than merely true. Two states:
 *
 *   live      the live endpoint answered. The timestamp is when the pipeline
 *             last pulled the feed.
 *   snapshot  the copy that shipped with the build, served because the live
 *             endpoint is not reachable — a static host, or tarkov.dev down.
 *
 * `compact` is the footer's one-liner. The full version, with the refresh
 * button, goes on the Settings page where someone is already looking for it.
 */
export default function DataFreshness({ compact = true }: { compact?: boolean }) {
  const status = useDataStatus();
  const { refreshing, refresh } = useDataRefresh();
  const age = describeAge(status.generated);

  const label =
    status.source === null
      ? "Loading game data…"
      : status.source === "live"
        ? `Game data rebuilt from tarkov.dev ${age ?? "recently"}`
        : `Showing the bundled snapshot${age ? `, built ${age}` : ""}`;

  if (compact) {
    return (
      <p className="flex flex-wrap items-center gap-x-2 gap-y-1 text-meta">
        <span
          className="inline-block h-1.5 w-1.5 flex-none rounded-full"
          style={{
            background:
              status.source === "live"
                ? "var(--ok)"
                : status.source === "snapshot"
                  ? "var(--warn)"
                  : "var(--line)",
          }}
          aria-hidden="true"
        />
        {label}
        <button
          type="button"
          className="underline underline-offset-2 hover:text-[var(--accent)]"
          onClick={refresh}
          disabled={refreshing}
        >
          {refreshing ? "Checking…" : "Check now"}
        </button>
      </p>
    );
  }

  return (
    <div className="flex flex-wrap items-center justify-between gap-3">
      <div className="min-w-0">
        <p className="text-[0.82rem] font-medium">{label}</p>
        <p className="mt-0.5 text-meta">
          {status.source === "live"
            ? "Maps, quests, keys and hideout requirements are pulled fresh each day — no redeploy needed."
            : "The live feed could not be reached, so the site is using the copy that shipped with it. Everything still works."}
        </p>
      </div>
      <button type="button" className="btn flex-none" onClick={refresh} disabled={refreshing}>
        <Icon path={icons.refresh} size={14} />
        {refreshing ? "Checking…" : "Check for updates"}
      </button>
    </div>
  );
}
