import { useEffect, useRef, useSyncExternalStore } from "react";
import DashboardPage from "./components/DashboardPage";
import HideoutPage from "./components/HideoutPage";
import HomePage from "./components/HomePage";
import LandingPage from "./components/LandingPage";
import MapPage from "./components/MapPage";
import QuestsPage from "./components/QuestsPage";
import SettingsPage from "./components/SettingsPage";
import SetupWizard from "./components/SetupWizard";
import StoryPage from "./components/StoryPage";
import TabShell from "./components/TabShell";
import CommandPalette from "./components/CommandPalette";
import { Icon, icons, Spinner } from "./components/ui";
import { prefetchIdleMaps, prefetchProgression, useMapData, useMapIndex } from "./lib/data";
import { homeFor } from "./lib/onboarding";
import { href, navigate, tabOf, useRoute } from "./lib/router";
import { useStore } from "./store";

function useHydrated() {
  return useSyncExternalStore(
    (onChange) => useStore.persist.onFinishHydration(onChange),
    () => useStore.persist.hasHydrated(),
    () => false,
  );
}

export default function App() {
  const route = useRoute();
  const theme = useStore((s) => s.settings.theme);
  const setLastMap = useStore((s) => s.setLastMap);
  const hydrated = useHydrated();
  const entry = useStore((s) => s.entry);
  const progress = useStore((s) => s.progress);
  const home = homeFor(entry, progress);

  const index = useMapIndex();
  const mapName = route.name === "map" ? route.map : null;
  const map = useMapData(mapName);

  /* Theme is applied to <html> so it also covers the scrollbar and overscroll. */
  useEffect(() => {
    const root = document.documentElement;
    const media = window.matchMedia("(prefers-color-scheme: light)");
    const apply = () => {
      const resolved = theme === "system" ? (media.matches ? "light" : "dark") : theme;
      root.dataset.theme = resolved;
    };
    apply();
    if (theme !== "system") return;
    media.addEventListener("change", apply);
    return () => media.removeEventListener("change", apply);
  }, [theme]);

  useEffect(() => {
    document.title =
      route.name === "map" && map.data
        ? `${map.data.name} — Tarkov Maps`
        : route.name === "quests"
          ? "Side quests — Tarkov Maps"
          : route.name === "hideout"
            ? "Hideout — Tarkov Maps"
          : route.name === "settings"
            ? "Settings — Tarkov Maps"
          : route.name === "story"
            ? "Story — Tarkov Maps"
          : route.name === "setup"
            ? "Set up your progress — Tarkov Maps"
            : route.name === "welcome" || route.name === "root"
              ? "Tarkov Maps"
            : route.name === "dashboard"
              ? "Dashboard — Tarkov Maps"
              : route.name === "home"
                ? "Maps — Tarkov Maps"
                : "Tarkov Maps";
  }, [route, map.data]);

  useEffect(() => {
    if (map.data) setLastMap(map.data.normalizedName);
  }, [map.data, setLastMap]);

  useEffect(() => {
    prefetchProgression();
  }, []);

  useEffect(() => {
    if (!hydrated) return;
    if (route.name !== "root") return;
    if (home === "maps") navigate(href.home(), true);
    if (home === "dashboard") navigate(href.dashboard(), true);
  }, [hydrated, route.name, home]);

  useEffect(() => {
    if (!index.data) return;
    const last = useStore.getState().lastMap;
    const names = index.data.maps.map((m) => m.normalizedName);
    prefetchIdleMaps(last ? [last, ...names.filter((n) => n !== last)] : names);
  }, [index.data]);

  /*
   * Manners a real page gets from the browser and a single-page app has to do
   * for itself.
   *
   * Following a link left the new page scrolled wherever the old one was — go
   * to a map from halfway down the quest tracker, come back, and you land in
   * the middle of a list you have never seen. And because nothing moves, a
   * screen reader carries on announcing from where it was, with no sign the
   * page changed at all; moving focus to the new heading is what tells it.
   *
   * Skipped on first paint: there is nothing to restore, and stealing focus
   * from a fresh load would be rude rather than helpful.
   */
  const firstRoute = useRef(true);
  const routeKey =
    route.name === "map"
      ? `map:${route.map}`
      : route.name === "quests"
        ? `quests:${route.view}`
        : route.name === "story"
          ? `story:${route.ending ?? ""}`
          : route.name;
  useEffect(() => {
    if (firstRoute.current) {
      firstRoute.current = false;
      return;
    }
    window.scrollTo({ top: 0, left: 0, behavior: "instant" as ScrollBehavior });
    // Deferred a frame so the incoming page has rendered its heading.
    const id = requestAnimationFrame(() => {
      const heading = document.querySelector<HTMLElement>("h1");
      if (!heading) return;
      // Focusable for this purpose without joining the tab order.
      heading.setAttribute("tabindex", "-1");
      heading.focus({ preventScroll: true });
    });
    return () => cancelAnimationFrame(id);
  }, [routeKey]);

  if (index.error) {
    return (
      <Message
        title="Map data failed to load"
        detail={index.error.message}
        action={{ label: "Try again", onClick: () => location.reload() }}
      />
    );
  }

  if (route.name === "welcome") {
    return (
      <>
        <LandingPage />
        <CommandPalette />
      </>
    );
  }
  if (route.name === "setup") {
    return (
      <>
        <SetupWizard />
        <CommandPalette />
      </>
    );
  }
  if (route.name === "settings") {
    return (
      <>
        <SettingsPage />
        <CommandPalette />
      </>
    );
  }

  /*
   * The three tab pages share one frame, and it is mounted once out here so it
   * survives the change between them — see TabShell for why that matters.
   */
  // Checked against the route rather than a `tabOf` result so the union
  // narrows for the map case below.
  if (route.name !== "map") {
    if (route.name === "root") {
      if (!hydrated || home !== "landing") return <Loading label="Loading" />;
      return (
        <>
          <LandingPage />
          <CommandPalette />
        </>
      );
    }
    const tab = tabOf(route)!;
    return (
      <>
        <TabShell current={tab}>
          {tab === "dashboard" && <DashboardPage />}
          {tab === "story" && (
            <StoryPage endingId={route.name === "story" ? route.ending : null} />
          )}
          {tab === "quests" && (
            <QuestsPage
              view={route.name === "quests" ? route.view : "list"}
              focus={route.name === "quests" ? route.focus : null}
            />
          )}
          {tab === "hideout" && <HideoutPage />}
          {tab === "maps" &&
            (index.data ? <HomePage maps={index.data.maps} /> : <Loading label="Loading maps" inline />)}
        </TabShell>
        <CommandPalette />
      </>
    );
  }

  if (map.error) {
    return (
      <Message
        title="That map could not be loaded"
        detail={map.error.message}
        action={{ label: "Back to all maps", onClick: () => navigate(href.home()) }}
      />
    );
  }

  if (!map.data || !index.data) return <Loading label="Loading map" />;

  return (
    <>
      <MapPage
        data={map.data}
        maps={index.data.maps}
        deepLinkTask={route.task}
      />
      <CommandPalette />
    </>
  );
}

function Loading({ label, inline }: { label: string; inline?: boolean }) {
  return (
    <div className={inline ? "grid place-items-center py-24" : "page grid h-full place-items-center"}>
      <div className="flex flex-col items-center gap-4">
        <Spinner size={32} />
        <p className="text-sm muted">{label}…</p>
      </div>
    </div>
  );
}

function Message({
  title,
  detail,
  action,
}: {
  title: string;
  detail?: string;
  action?: { label: string; onClick: () => void };
}) {
  return (
    <div className="page grid h-full place-items-center p-6">
      <div className="surface max-w-md p-8 text-center">
        <span className="empty-mark mx-auto">
          <Icon path={icons.info} size={18} />
        </span>
        <h1 className="mt-3 text-base font-semibold">{title}</h1>
        {detail && <p className="mt-2 text-sm muted">{detail}</p>}
        <p className="mx-auto mt-3 max-w-sm text-meta">
          The site falls back to the copy of the game data that shipped with it, so this usually
          means the network dropped rather than anything being broken.
        </p>
        {action && (
          <button type="button" className="btn btn-primary mt-4" onClick={action.onClick}>
            {action.label}
          </button>
        )}
      </div>
    </div>
  );
}
