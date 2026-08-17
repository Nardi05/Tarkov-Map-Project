import { useSyncExternalStore, useCallback } from "react";

/**
 * Hash routing, hand-rolled. The site has a handful of routes, and hash URLs
 * mean the build drops onto any static host — including a subpath — with no
 * server rewrite rules.
 *
 *   #/            map picker
 *   #/m/<map>     one map, optionally ?q=<taskId> to deep-link a task
 *   #/quests      the quest tracker dashboard
 */
export type Route =
  | { name: "home" }
  | { name: "quests" }
  | { name: "map"; map: string; task: string | null };

function parse(hash: string): Route {
  const raw = hash.replace(/^#/, "");
  const [pathPart, queryPart] = raw.split("?");
  const segments = pathPart.split("/").filter(Boolean);
  if (segments[0] === "m" && segments[1]) {
    const task = new URLSearchParams(queryPart ?? "").get("q");
    return { name: "map", map: decodeURIComponent(segments[1]), task };
  }
  if (segments[0] === "quests") return { name: "quests" };
  return { name: "home" };
}

let current = parse(typeof location === "undefined" ? "" : location.hash);
const listeners = new Set<() => void>();

function onHashChange() {
  const next = parse(location.hash);
  if (next.name === current.name && JSON.stringify(next) === JSON.stringify(current)) return;
  current = next;
  for (const l of listeners) l();
}

if (typeof window !== "undefined") window.addEventListener("hashchange", onHashChange);

function subscribe(listener: () => void) {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

export function useRoute(): Route {
  return useSyncExternalStore(
    subscribe,
    () => current,
    () => current,
  );
}

export function navigate(path: string, replace = false) {
  const target = path.startsWith("#") ? path : `#${path}`;
  if (location.hash === target) return;
  if (replace) history.replaceState(null, "", target);
  else location.hash = target;
  onHashChange();
}

export function useNavigate() {
  return useCallback(navigate, []);
}

export const href = {
  home: () => "#/",
  quests: () => "#/quests",
  map: (map: string, task?: string | null) => `#/m/${encodeURIComponent(map)}${task ? `?q=${task}` : ""}`,
};
