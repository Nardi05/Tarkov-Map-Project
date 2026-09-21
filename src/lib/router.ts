import { useSyncExternalStore, useCallback, type MouseEvent } from "react";

/**
 * Hash routing, hand-rolled. The site has a handful of routes, and hash URLs
 * mean the build drops onto any static host — including a subpath — with no
 * server rewrite rules.
 *
 *   #/              smart home: landing, maps, or dashboard
 *   #/welcome       the first-run landing page, always
 *   #/dashboard     the dashboard, even for maps-only visitors
 *   #/maps          map picker
 *   #/m/<map>       one map, optionally ?q=<taskId> to deep-link a task
 *   #/quests        the quest tracker
 *   #/quests/graph  task dependency graph
 *   #/quests/items  item tracker + stash audit
 *   #/quests/setup  the first-run walkthrough of each trader
 *   #/story         story endings overview
 *   #/story/<id>    one ending's guided path
 *   #/hideout       hideout stations
 *   #/settings      profile, reset, backup
 */
export type QuestView = "list" | "graph" | "items";

export type Route =
  | { name: "root" }
  | { name: "dashboard" }
  | { name: "welcome" }
  | { name: "home" }
  | { name: "quests"; view: QuestView; focus: string | null }
  | { name: "setup" }
  | { name: "story"; ending: string | null }
  | { name: "hideout" }
  | { name: "settings" }
  | { name: "map"; map: string; task: string | null };

/**
 * The tab pages, left to right, as the section nav shows them.
 *
 * Exported because the shell animates the body in the direction you moved
 * along this row, and both have to agree on which way that is.
 */
export type TabId = "dashboard" | "maps" | "story" | "quests" | "hideout";

export const TAB_ORDER: Record<TabId, number> = {
  dashboard: 0,
  maps: 1,
  story: 2,
  quests: 3,
  hideout: 4,
};

/** The tab a route belongs to, or null for the map and the walkthrough. */
export function tabOf(route: Route): TabId | null {
  if (route.name === "dashboard" || route.name === "root") return "dashboard";
  if (route.name === "home") return "maps";
  if (route.name === "story") return "story";
  if (route.name === "quests") return "quests";
  if (route.name === "hideout") return "hideout";
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
    const focus = new URLSearchParams(queryPart ?? "").get("q");
    if (segments[1] === "setup") return { name: "setup" };
    if (segments[1] === "graph") return { name: "quests", view: "graph", focus };
    if (segments[1] === "items") return { name: "quests", view: "items", focus };
    return { name: "quests", view: "list", focus };
  }
  if (segments[0] === "story") {
    return { name: "story", ending: segments[1] ? decodeURIComponent(segments[1]) : null };
  }
  if (segments[0] === "hideout") return { name: "hideout" };
  if (segments[0] === "settings") return { name: "settings" };
  if (segments[0] === "maps") return { name: "home" };
  if (segments[0] === "welcome") return { name: "welcome" };
  if (segments[0] === "dashboard") return { name: "dashboard" };
  return { name: "root" };
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
  root: () => "#/",
  dashboard: () => "#/dashboard",
  welcome: () => "#/welcome",
  home: () => "#/maps",
  maps: () => "#/maps",
  quests: (view: QuestView = "list", focus?: string | null) => {
    const base = view === "list" ? "#/quests" : `#/quests/${view}`;
    return focus ? `${base}?q=${encodeURIComponent(focus)}` : base;
  },
  setup: () => "#/quests/setup",
  story: (ending?: string | null) =>
    ending ? `#/story/${encodeURIComponent(ending)}` : "#/story",
  hideout: () => "#/hideout",
  settings: () => "#/settings",
  map: (map: string, task?: string | null) => `#/m/${encodeURIComponent(map)}${task ? `?q=${task}` : ""}`,
};
