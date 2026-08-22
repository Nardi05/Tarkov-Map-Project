import { useEffect, useState } from "react";
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
 * Data lives as static JSON next to the bundle (see scripts/build-data.mjs).
 * One fetch per map, cached in memory, so switching back to a map you've
 * already opened is instant.
 */
const BASE = `${import.meta.env.BASE_URL}data`;

const mapCache = new Map<string, Promise<MapData>>();
let indexPromise: Promise<MapIndex> | null = null;
let progressionPromise: Promise<Progression> | null = null;
let imagesPromise: Promise<TaskImages> | null = null;
let hideoutPromise: Promise<HideoutData> | null = null;
let itemsPromise: Promise<ItemCatalog> | null = null;

async function getJson<T>(url: string): Promise<T> {
  const res = await fetch(url);
  if (!res.ok) throw new Error(`Could not load ${url} (${res.status})`);
  return (await res.json()) as T;
}

export function loadIndex(): Promise<MapIndex> {
  indexPromise ??= getJson<MapIndex>(`${BASE}/index.json`).catch((err) => {
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
  progressionPromise ??= getJson<Progression>(`${BASE}/progression.json`)
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
  const coverage = progression.coverage
    ? { ...progression.coverage, tasks: Object.keys(tasks).length }
    : progression.coverage;
  return { ...progression, tasks, coverage };
}

export function useProgression() {
  return useAsync(loadProgression, []);
}

export function loadHideout(): Promise<HideoutData> {
  hideoutPromise ??= getJson<HideoutData>(`${BASE}/hideout.json`).catch(() => ({
    generated: "",
    stations: [],
  }));
  return hideoutPromise;
}

export function useHideoutData() {
  return useAsync(loadHideout, []);
}

export function loadItems(): Promise<ItemCatalog> {
  itemsPromise ??= getJson<ItemCatalog>(`${BASE}/items.json`).catch(() => ({
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
  imagesPromise ??= getJson<TaskImages>(`${BASE}/task-images.json`).catch((err) => {
    imagesPromise = null;
    throw err;
  });
  return imagesPromise;
}

export function useTaskImages(taskId: string | null) {
  const [images, setImages] = useState<TaskImage[]>([]);
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
  }, [taskId]);
  return images;
}

export function loadMap(name: string): Promise<MapData> {
  let promise = mapCache.get(name);
  if (!promise) {
    promise = getJson<MapData>(`${BASE}/maps/${name}.json`).catch((err) => {
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
  }, deps);

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
