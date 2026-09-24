/**
 * Whether the game data on screen deserves a warning, and what to say.
 *
 * The site has three ways of quietly showing something other than today's
 * data: the live endpoint serving its own snapshot because tarkov.dev failed,
 * the endpoint itself failing so the browser falls back to the bundled copy,
 * and tarkov.dev answering with a feed too thin to trust. Each one used to
 * look exactly like a healthy load. This decides which, if any, to say out
 * loud — kept free of React so the rules can be tested.
 */

export type DataSource = "live" | "snapshot";

/** Why the data is not a fresh live build, when we know. */
export type DataProblem =
  /** The live endpoint answered with its snapshot because the rebuild failed. */
  | { kind: "upstream"; detail: string | null }
  /** The live endpoint itself errored or could not be reached. */
  | { kind: "endpoint"; detail: string | null };

export interface HealthInput {
  source: DataSource | null;
  generated: string | null;
  problem: DataProblem | null;
  /** tarkov.dev's task feed came back incomplete; gaps were patched from fallbacks. */
  degraded: boolean;
}

export interface Health {
  level: "ok" | "warn";
  /** One line, for the banner and the footer. Empty when healthy. */
  title: string;
  detail: string | null;
}

/** A snapshot this old is worth mentioning even when nothing failed. */
export const STALE_SNAPSHOT_DAYS = 3;

const OK: Health = { level: "ok", title: "", detail: null };

/** "24 Sep 2026, 07:29" in the viewer's zone; null for a missing or bad date. */
export function formatWhen(iso: string | null): string | null {
  if (!iso) return null;
  const t = Date.parse(iso);
  if (Number.isNaN(t)) return null;
  return new Date(t).toLocaleString("en-GB", {
    day: "numeric",
    month: "short",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}

export function dataHealth(input: HealthInput, now = Date.now()): Health {
  if (input.source === null) return OK;
  const when = formatWhen(input.generated);
  const lastGood = when ? `the last good copy, from ${when}` : "the last good copy";

  if (input.problem?.kind === "upstream") {
    return {
      level: "warn",
      title: `Game data from tarkov.dev failed to update — showing ${lastGood}.`,
      detail: input.problem.detail,
    };
  }
  if (input.problem?.kind === "endpoint") {
    return {
      level: "warn",
      title: `The live game data could not be reached — showing ${lastGood}.`,
      detail: input.problem.detail,
    };
  }
  if (input.degraded) {
    return {
      level: "warn",
      title: "tarkov.dev's task feed is incomplete right now.",
      detail:
        "Missing levels and Kappa flags are filled from the last complete copy and the wiki, so a few may be out of date.",
    };
  }
  if (input.source === "snapshot" && input.generated) {
    const days = (now - Date.parse(input.generated)) / 86_400_000;
    if (days >= STALE_SNAPSHOT_DAYS) {
      return {
        level: "warn",
        title: `This game data is ${Math.floor(days)} days old (from ${when}).`,
        detail: "Live updates are not available here, so a patch since then will not show.",
      };
    }
  }
  return OK;
}
