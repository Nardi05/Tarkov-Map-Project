import { useEffect, useState } from "react";
import type { MapData, MapIndex } from "../types";

/**
 * Data lives as static JSON next to the bundle (see scripts/build-data.mjs).
 * One fetch per map, cached in memory, so switching back to a map you've
 * already opened is instant.
 */
const BASE = `${import.meta.env.BASE_URL}data`;

const mapCache = new Map<string, Promise<MapData>>();
let indexPromise: Promise<MapIndex> | null = null;

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
