import { useCallback, useEffect, useState, useSyncExternalStore } from "react";
import type {
  HideoutData,
  ItemCatalog,
  MapData,
  MapIndex,
  Progression,
  TaskImage,
  TaskImages,
} from "../types";
import { kordProgressionTasks } from "./kord-season";

/**
 * Where the site's game data comes from.
 *
 * Two sources, tried in that order:
 *
 *   /api/data/…   the live endpoint. Rebuilds from tarkov.dev behind a one-day
 *                 CDN cache, so what you see is what the game shipped today
 *                 rather than what it had shipped when somebody last deployed.
 *   /data/…       the snapshot baked into the bundle at build time. Served
 *                 when the live endpoint isn't there (a plain static host, a
 *                 local `vite preview`) or can't answer.
 *
 * The site works identically on both. The only visible difference is the
 * freshness line, which says which one you got and when it was built — see
 * `useDataStatus`.
 *
 * Both are relative to BASE_URL so the build still drops onto a subpath.
 */
const LIVE = `${import.meta.env.BASE_URL}api/data/`;
const SNAPSHOT = `${import.meta.env.BASE_URL}data/`;

/** How old a payload may get before a returning tab quietly refetches it. */
const STALE_AFTER_MS = 12 * 60 * 60 * 1000;

export type DataSource = "live" | "snapshot";

export interface DataStatus {
  /** Null until the first payload lands. */
  source: DataSource | null;
  /** When the data was built upstream, ISO. Null if the payload didn't say. */
  generated: string | null;
  /** When this browser last fetched it. */
  fetchedAt: number | null;
  /** True while a refresh is in flight. */
  refreshing: boolean;
}

let status: DataStatus = { source: null, generated: null, fetchedAt: null, refreshing: false };
const statusListeners = new Set<() => void>();

function setStatus(patch: Partial<DataStatus>) {
  const next = { ...status, ...patch };
  if (
    next.source === status.source &&
    next.generated === status.generated &&
    next.fetchedAt === status.fetchedAt &&
    next.refreshing === status.refreshing
  ) {
    return;
  }
  status = next;
  for (const listener of statusListeners) listener();
}

/**
 * Whether the live endpoint answered.
 *
 * Settled by the first payload that asks for it, then reused. On a host with
 * no functions this costs one 404 for the whole session rather than one per
 * file; the requests that raced that first one pay it too, which is a handful
 * at worst and not worth a lock to avoid.
 */
let liveAvailable: boolean | null = null;

/**
 * Bumped by `refreshData`. Every hook below depends on it, so incrementing it
 * is what makes an open tab re-read the payloads it already has.
 */
let generation = 0;
const generationListeners = new Set<() => void>();

function bumpGeneration() {
  generation++;
  for (const listener of generationListeners) listener();
}

function useGeneration() {
  return useSyncExternalStore(
    (onChange) => {
      generationListeners.add(onChange);
      return () => generationListeners.delete(onChange);
    },
    () => generation,
    () => generation,
  );
}

/** The freshness of the data on screen, for the footer and Settings. */
export function useDataStatus(): DataStatus {
  return useSyncExternalStore(
    (onChange) => {
      statusListeners.add(onChange);
      return () => statusListeners.delete(onChange);
    },
    () => status,
    () => status,
  );
}

async function fromLive(file: string): Promise<Response | null> {
  if (liveAvailable === false) return null;
  try {
    const res = await fetch(`${LIVE}${file}`, { headers: { Accept: "application/json" } });
    if (!res.ok) {
      // 404/405 is a host that simply has no functions — stop asking. A 5xx is
      // the endpoint itself failing, which it already handles by serving its
      // own snapshot, so treat it as a one-off and keep trying next time.
      if (res.status === 404 || res.status === 405) liveAvailable = false;
      return null;
    }
    liveAvailable = true;
    return res;
  } catch {
    liveAvailable = false;
    return null;
  }
}

async function getJson<T>(file: string): Promise<T> {
  const live = await fromLive(file);
  if (live) {
    const body = (await live.json()) as T & { generated?: string };
    setStatus({
      source: (live.headers.get("x-tk-source") as DataSource) ?? "live",
      generated: live.headers.get("x-tk-generated") ?? body.generated ?? status.generated,
      fetchedAt: Date.now(),
    });
    return body;
  }

  const res = await fetch(`${SNAPSHOT}${file}`);
  if (!res.ok) throw new Error(`Could not load ${file} (${res.status})`);
  const body = (await res.json()) as T & { generated?: string };
  setStatus({
    source: "snapshot",
    generated: body.generated ?? status.generated,
    fetchedAt: Date.now(),
  });
  return body;
}

/* ------------------------------------------------------------------ caches */

/**
 * One fetch per payload, cached in memory, so switching back to a map you've
 * already opened is instant. `refreshData` is the only thing that empties
 * these.
 */
const mapCache = new Map<string, Promise<MapData>>();
let indexPromise: Promise<MapIndex> | null = null;
let progressionPromise: Promise<Progression> | null = null;
let imagesPromise: Promise<TaskImages> | null = null;
let hideoutPromise: Promise<HideoutData> | null = null;
let itemsPromise: Promise<ItemCatalog> | null = null;

function clearCaches() {
  mapCache.clear();
  indexPromise = null;
  progressionPromise = null;
  imagesPromise = null;
  hideoutPromise = null;
  itemsPromise = null;
}

/**
 * Throw away everything and fetch it again.
 *
 * The data behind this site changes about once a day, and a tab left open over
 * a wipe would otherwise show last week's quests until it was reloaded. Called
 * from the Settings refresh button, and automatically when a tab comes back to
 * the foreground with data older than `STALE_AFTER_MS`.
 */
export async function refreshData(): Promise<void> {
  if (status.refreshing) return;
  setStatus({ refreshing: true });
  clearCaches();
  // A new chance for the live endpoint: the last failure may have been a blip.
  if (liveAvailable === false) liveAvailable = null;
  try {
    await loadIndex();
  } catch {
    /* the hooks surface the error; this only drives the spinner */
  } finally {
    setStatus({ refreshing: false });
    bumpGeneration();
  }
}

/**
 * Refetch when a tab that has been sitting in the background comes back and
 * what it is showing has gone stale.
 *
 * Deliberately silent. There is no prompt and nothing jumps: the payloads are
 * replaced and the components re-render with the newer numbers, which is what
 * someone returning to the page expects to be looking at.
 */
if (typeof document !== "undefined") {
  document.addEventListener("visibilitychange", () => {
    if (document.visibilityState !== "visible") return;
    if (!status.fetchedAt || Date.now() - status.fetchedAt < STALE_AFTER_MS) return;
    void refreshData();
  });
}

/* ----------------------------------------------------------------- loaders */

export function loadIndex(): Promise<MapIndex> {
  indexPromise ??= getJson<MapIndex>("index.json").catch((err) => {
    indexPromise = null;
    throw err;
  });
  return indexPromise;
}

/**
 * The full task graph, including the ~165 tasks that never appear on a map.
 *
 * Separate from the per-map payloads by necessity, not preference: about half
 * of all prerequisite edges point at trader turn-ins and skill tasks that have
 * no map row to hang on, so a per-map file physically cannot answer "what is
 * unlocked". 285KB, so it loads on demand — the map pages never need it.
 */
export function loadProgression(): Promise<Progression> {
  progressionPromise ??= getJson<Progression>("progression.json")
    .then(withKordSeason)
    .catch((err) => {
      progressionPromise = null;
      throw err;
    });
  return progressionPromise;
}

/**
 * Tarkov.dev does not ship the seasonal story line. Fold it in at load so
 * every consumer — tracker, wizard, maps — sees the same graph, and a data
 * rebuild that forgot to copy the file cannot drop someone's season.
 */
function withKordSeason(progression: Progression): Progression {
  const extras = kordProgressionTasks();
  let added = 0;
  const tasks = { ...progression.tasks };
  for (const [id, task] of Object.entries(extras)) {
    if (tasks[id]) continue;
    tasks[id] = task;
    added++;
  }
  if (!added) return progression;
  let withPrereq = progression.coverage?.withPrereq ?? 0;
  let ungated = progression.coverage?.ungated ?? 0;
  for (const [id, task] of Object.entries(extras)) {
    if (progression.tasks[id]) continue;
    const gated =
      task.requires.some((set) => set.length > 0) ||
      task.minPlayerLevel > 0 ||
      task.traderGates.length > 0;
    if (task.requires.some((set) => set.length > 0)) withPrereq++;
    else if (!gated) ungated++;
  }
  const coverage = progression.coverage
    ? { tasks: Object.keys(tasks).length, withPrereq, ungated }
    : progression.coverage;
  return { ...progression, tasks, coverage };
}

export function useProgression() {
  return useAsync(loadProgression, []);
}

export function loadHideout(): Promise<HideoutData> {
  hideoutPromise ??= getJson<HideoutData>("hideout.json").catch(() => ({
    generated: "",
    stations: [],
  }));
  return hideoutPromise;
}

export function useHideoutData() {
  return useAsync(loadHideout, []);
}

export function loadItems(): Promise<ItemCatalog> {
  itemsPromise ??= getJson<ItemCatalog>("items.json").catch(() => ({
    generated: "",
    items: {},
  }));
  return itemsPromise;
}

export function useItemCatalog() {
  return useAsync(loadItems, []);
}

/**
 * Task screenshots. Loaded on demand the first time a task panel wants one —
 * it is a quarter of a megabyte and most of a session never opens a photo, so
 * it has no business on the critical path.
 *
 * A failure here is not worth surfacing: the gallery just doesn't appear.
 */
export function loadTaskImages(): Promise<TaskImages> {
  imagesPromise ??= getJson<TaskImages>("task-images.json").catch((err) => {
    imagesPromise = null;
    throw err;
  });
  return imagesPromise;
}

export function useTaskImages(taskId: string | null) {
  const [images, setImages] = useState<TaskImage[]>([]);
  const gen = useGeneration();
  useEffect(() => {
    if (!taskId) return setImages([]);
    let live = true;
    loadTaskImages().then(
      (all) => live && setImages(all.tasks[taskId] ?? []),
      () => live && setImages([]),
    );
    return () => {
      live = false;
    };
  }, [taskId, gen]);
  return images;
}

export function loadMap(name: string): Promise<MapData> {
  let promise = mapCache.get(name);
  if (!promise) {
    promise = getJson<MapData>(`maps/${name}.json`).catch((err) => {
      mapCache.delete(name);
      throw err;
    });
    mapCache.set(name, promise);
  }
  return promise;
}

/** Warm the cache without blocking render — used on map-card hover. */
export function prefetchMap(name: string) {
  if (!mapCache.has(name)) void loadMap(name).catch(() => {});
}

/** Warm the 285KB task graph so opening Quests is instant. */
export function prefetchProgression() {
  void loadProgression().catch(() => {});
}

/**
 * Fetch map payloads when the browser is idle, last-opened first.
 *
 * Opening a map is one JSON request. Doing the first few in the background
 * after the home page paints makes "continue" and the next-raid cards feel
 * local without competing with first paint.
 */
export function prefetchIdleMaps(names: string[]) {
  if (typeof window === "undefined" || !names.length) return;
  const unique = [...new Set(names)];
  const run = (batch: string[]) => {
    for (const name of batch) prefetchMap(name);
  };
  const idle =
    "requestIdleCallback" in window
      ? (cb: () => void, timeout: number) => window.requestIdleCallback(cb, { timeout })
      : (cb: () => void) => window.setTimeout(cb, 350);
  idle(() => {
    run(unique.slice(0, 3));
    if (unique.length > 3) idle(() => run(unique.slice(3, 8)), 2000);
  }, 1200);
}

export interface AsyncState<T> {
  data: T | null;
  error: Error | null;
  loading: boolean;
}

export function useAsync<T>(load: () => Promise<T>, deps: unknown[]): AsyncState<T> {
  const [state, setState] = useState<AsyncState<T>>({ data: null, error: null, loading: true });
  const gen = useGeneration();

  useEffect(() => {
    let live = true;
    setState((s) => ({ data: s.data, error: null, loading: true }));
    load().then(
      (data) => live && setState({ data, error: null, loading: false }),
      (error: Error) => live && setState({ data: null, error, loading: false }),
    );
    return () => {
      live = false;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [...deps, gen]);

  return state;
}

export function useMapIndex() {
  return useAsync(loadIndex, []);
}

export function useMapData(name: string | null) {
  return useAsync(
    () => (name ? loadMap(name) : Promise.resolve(null as unknown as MapData)),
    [name],
  );
}

/* ------------------------------------------------------------- presentation */

/** "3 hours ago" / "yesterday" — for the freshness line. */
export function describeAge(iso: string | null): string | null {
  if (!iso) return null;
  const then = Date.parse(iso);
  if (Number.isNaN(then)) return null;
  const minutes = Math.max(0, Math.round((Date.now() - then) / 60000));
  if (minutes < 2) return "just now";
  if (minutes < 60) return `${minutes} minutes ago`;
  const hours = Math.round(minutes / 60);
  if (hours < 24) return `${hours} hour${hours === 1 ? "" : "s"} ago`;
  const days = Math.round(hours / 24);
  if (days === 1) return "yesterday";
  return `${days} days ago`;
}

/** A manual "check for new data" button, wired for a component. */
export function useDataRefresh() {
  const { refreshing } = useDataStatus();
  const refresh = useCallback(() => void refreshData(), []);
  return { refreshing, refresh };
}
