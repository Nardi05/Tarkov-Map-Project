import type { TaskStatus } from "../types";
import type { Faction } from "./persist-migrate";

/**
 * Importing a wipe's worth of progress from TarkovTracker.
 *
 * Nobody is going to tick two hundred tasks by hand to get a site useful, so
 * this exists for the cold start: paste the API token you already have and the
 * dashboard, the shopping lists and every map's quest layer are correct in one
 * step.
 *
 * The API allows any origin and accepts the token as a bearer header, so this
 * runs straight from the browser — the token never touches this site's servers,
 * because there are none in the path. Keep it that way; proxying it would mean
 * handling somebody else's credential for no gain.
 *
 * The mapping is deliberately conservative. TarkovTracker records what is
 * *finished*, not what you have accepted at a trader, and there is no honest
 * way to derive one from the other — so an import writes "completed" and
 * nothing else. What you are running this raid stays yours to say, and the
 * graph fills in what is available from the completions.
 */

/** As returned by GET /api/v2/progress. Only the fields we actually use. */
export interface TrackerTaskProgress {
  id: string;
  complete?: boolean;
  failed?: boolean;
  invalid?: boolean;
}

export interface TrackerProgress {
  tasksProgress?: TrackerTaskProgress[];
  playerLevel?: number;
  pmcFaction?: string;
  displayName?: string;
}

export interface ImportResult {
  /** Completions to fold into the current mode. */
  taskStatus: Record<string, TaskStatus>;
  level: number | null;
  faction: Faction | null;
  displayName: string | null;
  /** Completed tasks we recognised. */
  matched: number;
  /**
   * Completed tasks whose id is not in our graph — a wipe's worth of removed
   * or renamed quests, or our own feed being behind. Reported rather than
   * hidden: a big number here means the import is not telling the whole story.
   */
  unknown: number;
  /** Counted and dropped: the site has no failed state to put them in. */
  failed: number;
}

const API = "https://tarkovtracker.io/api/v2/progress";

export class TrackerError extends Error {}

/** A token is opaque, but an empty or obviously wrong one is worth catching. */
export function looksLikeToken(token: string): boolean {
  return /^[A-Za-z0-9._-]{16,200}$/.test(token.trim());
}

export async function fetchProgress(token: string, signal?: AbortSignal): Promise<TrackerProgress> {
  let res: Response;
  try {
    res = await fetch(API, {
      headers: { Authorization: `Bearer ${token.trim()}` },
      ...(signal ? { signal } : {}),
    });
  } catch {
    // A network-level failure here is usually an extension or a blocker
    // sitting on the request, and "failed to fetch" alone helps nobody.
    throw new TrackerError(
      "Could not reach TarkovTracker. Check your connection, or whether a browser extension is blocking it.",
    );
  }

  if (res.status === 401) throw new TrackerError("TarkovTracker rejected that token.");
  if (res.status === 429) throw new TrackerError("TarkovTracker is rate limiting. Try again shortly.");
  if (!res.ok) throw new TrackerError(`TarkovTracker returned ${res.status}.`);

  const body = (await res.json()) as { data?: TrackerProgress } | TrackerProgress;
  const data = "data" in body && body.data ? body.data : (body as TrackerProgress);
  if (!Array.isArray(data.tasksProgress)) {
    throw new TrackerError("That response did not look like TarkovTracker progress.");
  }
  return data;
}

const FACTIONS: Record<string, Faction> = { usec: "USEC", bear: "BEAR", any: "Any" };

/**
 * Turns a payload into the slice of state to apply.
 *
 * `knownTasks` is the graph's id set. Anything outside it is counted and left
 * alone rather than written — storing a status for a task no screen can show
 * would just be junk that survives every future migration.
 */
export function toImport(data: TrackerProgress, knownTasks: ReadonlySet<string>): ImportResult {
  const taskStatus: Record<string, TaskStatus> = {};
  let matched = 0;
  let unknown = 0;
  let failed = 0;

  for (const entry of data.tasksProgress ?? []) {
    if (!entry?.id || entry.invalid) continue;
    if (entry.failed && !entry.complete) {
      failed++;
      continue;
    }
    if (!entry.complete) continue;
    if (!knownTasks.has(entry.id)) {
      unknown++;
      continue;
    }
    taskStatus[entry.id] = "completed";
    matched++;
  }

  const level =
    typeof data.playerLevel === "number" && data.playerLevel >= 1
      ? Math.min(79, Math.round(data.playerLevel))
      : null;

  return {
    taskStatus,
    level,
    faction: FACTIONS[String(data.pmcFaction ?? "").toLowerCase()] ?? null,
    displayName: data.displayName ?? null,
    matched,
    unknown,
    failed,
  };
}

/**
 * The same import, from a pasted export instead of a token — for anyone who
 * would rather not hand a credential to a fan site, which is a reasonable
 * position to hold.
 */
export function parsePasted(text: string): TrackerProgress {
  let parsed: unknown;
  try {
    parsed = JSON.parse(text);
  } catch {
    throw new TrackerError("That is not valid JSON.");
  }
  const body = parsed as { data?: TrackerProgress } | TrackerProgress;
  const data = body && typeof body === "object" && "data" in body && body.data
    ? body.data
    : (body as TrackerProgress);
  if (!data || !Array.isArray(data.tasksProgress)) {
    throw new TrackerError("No tasksProgress in that JSON — is it a TarkovTracker export?");
  }
  return data;
}
