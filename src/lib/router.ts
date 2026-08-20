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

const TAB_ORDER: Partial<Record<Route["name"], number>> = {
  dashboard: 0,
  home: 1,
  quests: 2,
};

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

function reducedMotion(): boolean {
  return typeof window !== "undefined" && window.matchMedia("(prefers-reduced-motion: reduce)").matches;
}

export function navigate(path: string, replace = false) {
  const target = path.startsWith("#") ? path : `#${path}`;
  if (location.hash === target) return;

  const next = parse(target);
  const from = TAB_ORDER[current.name];
  const to = TAB_ORDER[next.name];
  const slide =
    from != null && to != null && from !== to ? (to > from ? "fwd" : "back") : null;

  const apply = () => {
    if (location.hash !== target) {
      if (replace) history.replaceState(null, "", target);
      else location.hash = target;
    }
    onHashChange();
  };

  const doc = document as Document & {
    startViewTransition?: (cb: () => void) => { ready?: Promise<unknown>; finished?: Promise<unknown> };
  };
  if (slide && !reducedMotion() && typeof doc.startViewTransition === "function") {
    document.documentElement.dataset.slide = slide;
    try {
      const vt = doc.startViewTransition(apply);
      const fallback = window.setTimeout(() => {
        if (location.hash !== target) apply();
      }, 120);
      void vt?.ready?.then(() => window.clearTimeout(fallback)).catch(() => {
        window.clearTimeout(fallback);
        if (location.hash !== target) apply();
      });
      void vt?.finished?.finally(() => {
        window.clearTimeout(fallback);
        delete document.documentElement.dataset.slide;
        if (location.hash !== target) apply();
      });
      return;
    } catch {
      delete document.documentElement.dataset.slide;
    }
  }
  apply();
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
