import { useSyncExternalStore, useCallback, type MouseEvent } from "react";

/**
 * Hash routing, hand-rolled. The site has a handful of routes, and hash URLs
 * mean the build drops onto any static host — including a subpath — with no
 * server rewrite rules.
 *
 *   #/              dashboard
 *   #/maps          map picker
 *   #/m/<map>       one map, optionally ?q=<taskId> to deep-link a task
 *   #/quests        the quest tracker
 *   #/quests/setup  the first-run walkthrough of each trader
 */
export type Route =
  | { name: "dashboard" }
  | { name: "home" }
  | { name: "quests" }
  | { name: "setup" }
  | { name: "map"; map: string; task: string | null };

/**
 * The three tab pages, left to right, as the section nav shows them.
 *
 * Exported because the shell animates the body in the direction you moved
 * along this row, and both have to agree on which way that is.
 */
export type TabId = "dashboard" | "maps" | "quests";

export const TAB_ORDER: Record<TabId, number> = {
  dashboard: 0,
  maps: 1,
  quests: 2,
};

/** The tab a route belongs to, or null for the map and the walkthrough. */
export function tabOf(route: Route): TabId | null {
  if (route.name === "dashboard") return "dashboard";
  if (route.name === "home") return "maps";
  if (route.name === "quests") return "quests";
  return null;
}

function parse(hash: string): Route {
  const raw = hash.replace(/^#/, "");
  const [pathPart, queryPart] = raw.split("?");
  const segments = pathPart.split("/").filter(Boolean);
  if (segments[0] === "m" && segments[1]) {
    const task = new URLSearchParams(queryPart ?? "").get("q");
    return { name: "map", map: decodeURIComponent(segments[1]), task };
  }
  if (segments[0] === "quests") {
    return segments[1] === "setup" ? { name: "setup" } : { name: "quests" };
  }
  if (segments[0] === "maps") return { name: "home" };
  return { name: "dashboard" };
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
  // `hashchange` is asynchronous, and a caller that navigates then reads the
  // route straight back should not see the old one.
  onHashChange();
}

export function useNavigate() {
  return useCallback(navigate, []);
}

/** Same-tab hash navigation, leaving modifier-clicks to open a new tab. */
export function onNavClick(to: string) {
  return (e: MouseEvent<HTMLAnchorElement>) => {
    if (e.metaKey || e.ctrlKey || e.shiftKey || e.altKey || e.button !== 0) return;
    e.preventDefault();
    navigate(to);
  };
}

export const href = {
  dashboard: () => "#/",
  home: () => "#/maps",
  maps: () => "#/maps",
  quests: () => "#/quests",
  setup: () => "#/quests/setup",
  map: (map: string, task?: string | null) => `#/m/${encodeURIComponent(map)}${task ? `?q=${task}` : ""}`,
};
