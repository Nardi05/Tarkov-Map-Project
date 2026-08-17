import { useEffect } from "react";
import HomePage from "./components/HomePage";
import MapPage from "./components/MapPage";
import { useMapData, useMapIndex } from "./lib/data";
import { href, navigate, useRoute } from "./lib/router";
import { useStore } from "./store";

export default function App() {
  const route = useRoute();
  const theme = useStore((s) => s.settings.theme);
  const setLastMap = useStore((s) => s.setLastMap);

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
      route.name === "map" && map.data ? `${map.data.name} — Tarkov Maps` : "Tarkov Maps";
  }, [route, map.data]);

  useEffect(() => {
    if (map.data) setLastMap(map.data.normalizedName);
  }, [map.data, setLastMap]);

  if (index.error) {
    return (
      <Message
        title="Map data failed to load"
        detail={index.error.message}
        action={{ label: "Try again", onClick: () => location.reload() }}
      />
    );
  }

  if (route.name !== "map") {
    if (index.loading || !index.data) return <Loading label="Loading maps" />;
    return <HomePage maps={index.data.maps} />;
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
    <MapPage
      data={map.data}
      maps={index.data.maps}
      deepLinkTask={route.task}
    />
  );
}

function Loading({ label }: { label: string }) {
  return (
    <div className="grid h-full place-items-center" style={{ background: "var(--bg)" }}>
      <div className="flex flex-col items-center gap-3">
        <span
          className="h-7 w-7 animate-spin rounded-full border-2 border-transparent"
          style={{ borderTopColor: "var(--accent)", borderRightColor: "var(--accent)" }}
        />
        <p className="text-sm" style={{ color: "var(--text-dim)" }}>
          {label}…
        </p>
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
    <div className="grid h-full place-items-center p-6" style={{ background: "var(--bg)" }}>
      <div className="surface max-w-md p-6 text-center">
        <h1 className="text-base font-semibold">{title}</h1>
        {detail && (
          <p className="mt-2 text-sm" style={{ color: "var(--text-dim)" }}>
            {detail}
          </p>
        )}
        {action && (
          <button type="button" className="btn mt-4" onClick={action.onClick}>
            {action.label}
          </button>
        )}
      </div>
    </div>
  );
}
