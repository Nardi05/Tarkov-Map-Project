import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import L from "leaflet";
import type { MapData, Vec3 } from "../types";
import { createCRS, paddedBounds, toBounds, toLatLng } from "../lib/leaflet-crs";
import {
  createBasePane,
  createPlaceLabels,
  createSvgBase,
  createTileBase,
  type Floor,
  type SvgBase,
} from "../lib/base-layer";
import { buildLayer, type Selection } from "../lib/build-layers";
import { createDeclutterer } from "../lib/declutter";
import { LAYERS, type LayerId } from "../lib/layers";
import type { QuestMarker, TaskStatus } from "../types";
import type { MapStyle } from "../store";
import { icons } from "./ui";

export interface FocusRequest {
  position: Vec3;
  /** Bumped by the caller so repeat focus on the same marker still fires. */
  token: number;
  zoom?: number;
}

interface Props {
  data: MapData;
  style: MapStyle;
  floor: Floor;
  layers: Record<LayerId, boolean>;
  visibleQuests: QuestMarker[];
  taskStatus: Record<string, TaskStatus>;
  markerDone: Record<string, true>;
  markerScale: number;
  showZones: boolean;
  showMarkerLabels: boolean;
  showQuestLabels: boolean;
  showPlaceLabels: boolean;
  dimCompleted: boolean;
  selection: Selection | null;
  onSelect: (selection: Selection | null) => void;
  focus: FocusRequest | null;
}

/** Where the currently selected thing sits, so we can ring it on the map. */
function selectionPosition(selection: Selection | null): Vec3 | null {
  if (!selection) return null;
  switch (selection.kind) {
    case "spawn":
      return selection.cluster.centre;
    case "boss":
      return selection.boss.centre;
    case "extract":
      return selection.extract.position;
    case "transit":
      return selection.transit.position;
    case "lock":
      return selection.lock.position;
    case "quest":
      return selection.marker.position;
    case "switch":
      return selection.sw.position;
    case "hazard":
      return selection.hazard.position;
  }
}

export default function MapCanvas(props: Props) {
  const { data, style, floor, layers, selection, onSelect, focus } = props;
  const shellRef = useRef<HTMLDivElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const mapRef = useRef<L.Map | null>(null);
  const rendererRef = useRef<L.Renderer | null>(null);
  const baseRef = useRef<L.Layer | null>(null);
  const svgBaseRef = useRef<SvgBase | null>(null);
  const labelsRef = useRef<L.LayerGroup | null>(null);
  const markerLayersRef = useRef(new Map<LayerId, L.LayerGroup>());
  const highlightRef = useRef<L.Layer | null>(null);
  const declutterRef = useRef<(() => void) | null>(null);
  const refitRef = useRef<(() => void) | null>(null);
  const fitRef = useRef<(() => void) | null>(null);
  const [baseError, setBaseError] = useState<string | null>(null);
  const [isFullscreen, setIsFullscreen] = useState(false);

  const geo = data.geo;

  /*
   * Fullscreen puts the map shell — not the whole document — into the
   * browser's fullscreen mode, so the floating detail card and the map
   * controls come along with it. The map's ResizeObserver below picks up the
   * size change on its own, so nothing has to tell Leaflet about it.
   */
  const toggleFullscreen = useCallback(() => {
    const shell = shellRef.current;
    if (!shell) return;
    if (document.fullscreenElement) void document.exitFullscreen().catch(() => {});
    else void shell.requestFullscreen().catch(() => {});
  }, []);

  // Tracked by event rather than by the click, because Escape and the browser's
  // own chrome can leave fullscreen without going through the button.
  useEffect(() => {
    const sync = () => setIsFullscreen(document.fullscreenElement === shellRef.current);
    document.addEventListener("fullscreenchange", sync);
    return () => document.removeEventListener("fullscreenchange", sync);
  }, []);

  /* ------------------------------------------------------------ map instance */
  useEffect(() => {
    const container = containerRef.current;
    if (!container || mapRef.current) return;

    const map = L.map(container, {
      crs: createCRS(geo),
      attributionControl: false,
      zoomControl: false,
      // Fractional zoom keeps pinch and wheel gestures feeling continuous.
      // The steps are deliberately small: a map's whole usable range is only
      // four or five levels (see geo.json), so half a level per button press
      // threw away a tenth of the range at a time.
      zoomSnap: 0.1,
      zoomDelta: 0.25,
      wheelPxPerZoomLevel: 110,
      minZoom: geo.minZoom,
      maxZoom: Math.max(7, geo.maxZoom),
      maxBounds: paddedBounds(geo.bounds, 1.5),
      maxBoundsViscosity: 0.7,
      preferCanvas: true,
    });

    createBasePane(map);
    L.control.zoom({ position: "bottomright" }).addTo(map);
    map.on("click", () => onSelect(null));

    const bounds = toBounds(geo.bounds);

    /** Map width in CSS pixels at zoom 0, used to reason about legibility. */
    const baseWidth = Math.abs(
      map.project(bounds.getNorthEast(), 0).x - map.project(bounds.getSouthWest(), 0).x,
    );
    /** Below roughly this width the artwork and markers stop being readable. */
    const MIN_LEGIBLE_WIDTH = 520;

    /**
     * The configured minZoom assumes a desktop viewport. On a phone, fitting a
     * wide map like Customs needs a zoom below it, and Leaflet would otherwise
     * clamp and silently crop the map — so the floor becomes whatever it takes
     * to see the whole thing, and "fit map" is always available.
     */
    const relaxMinZoom = () => {
      map.setMinZoom(-10);
      const fitZoom = map.getBoundsZoom(bounds);
      map.setMinZoom(Math.min(geo.minZoom, fitZoom));
      return fitZoom;
    };

    let fittedZoom = relaxMinZoom();

    fitRef.current = () => map.fitBounds(bounds, { animate: true });

    // Opening at the fitted zoom on a phone would show the whole map at a size
    // nobody can read, so open no further out than legibility allows and let
    // the user pinch out (or press "fit map") for the overview.
    const openZoom = Math.max(fittedZoom, Math.log2(MIN_LEGIBLE_WIDTH / baseWidth));
    if (openZoom > fittedZoom + 0.01) map.setView(bounds.getCenter(), openZoom, { animate: false });
    else map.fitBounds(bounds, { animate: false });

    /**
     * Two things have to stay in proportion to the map rather than the screen,
     * or a phone ends up with a postage-stamp map under desktop-sized pins:
     *
     *   --tk-marker-scale  shrinks pins as the map renders smaller
     *   --tk-label-scale   sizes place names like printed map labels
     */
    const syncScales = () => {
      const px = map.project(bounds.getNorthEast()).x - map.project(bounds.getSouthWest()).x;
      const markerScale = Math.min(1, Math.max(0.55, Math.abs(px) / 900));
      container.style.setProperty("--tk-marker-scale", markerScale.toFixed(3));

      const labelScale = Math.min(2.4, Math.max(0.55, 2 ** (map.getZoom() - fittedZoom)));
      container.style.setProperty("--tk-label-scale", labelScale.toFixed(3));
    };
    syncScales();

    refitRef.current = () => {
      fittedZoom = relaxMinZoom();
      syncScales();
    };

    rendererRef.current = L.canvas({ padding: 0.4 });
    declutterRef.current = createDeclutterer(container);
    map.on("zoomend moveend", () => {
      syncScales();
      declutterRef.current?.();
    });
    mapRef.current = map;

    return () => {
      map.remove();
      mapRef.current = null;
      rendererRef.current = null;
      baseRef.current = null;
      svgBaseRef.current = null;
      labelsRef.current = null;
      markerLayersRef.current.clear();
      highlightRef.current = null;
      declutterRef.current = null;
      refitRef.current = null;
      fitRef.current = null;
    };
    // The parent remounts this component per map, so this runs exactly once.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  /* -------------------------------------------------------------- base layer */
  const wantSvg = style === "clean" && !!geo.svgPath;

  useEffect(() => {
    const map = mapRef.current;
    if (!map) return;
    let cancelled = false;
    setBaseError(null);

    const swap = (layer: L.Layer) => {
      if (cancelled) return;
      if (baseRef.current) map.removeLayer(baseRef.current);
      baseRef.current = layer;
      layer.addTo(map);
    };

    if (wantSvg) {
      // Reuse the parsed SVG across floor changes; only visibility differs.
      if (svgBaseRef.current) {
        svgBaseRef.current.setFloor(floor);
        swap(svgBaseRef.current.layer);
      } else {
        createSvgBase(geo).then(
          (base) => {
            if (cancelled) return;
            svgBaseRef.current = base;
            base.setFloor(floor);
            base.setPlaceLabels(props.showPlaceLabels);
            swap(base.layer);
          },
          (err: Error) => !cancelled && setBaseError(err.message),
        );
      }
    } else if (geo.tilePath) {
      swap(createTileBase(geo, floor));
    } else {
      setBaseError("No artwork available for this map.");
    }

    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [wantSvg, floor.id, geo]);

  useEffect(() => {
    svgBaseRef.current?.setPlaceLabels(props.showPlaceLabels);
  }, [props.showPlaceLabels, baseError]);

  /* ------------------------------------------------------------ place labels */
  useEffect(() => {
    const map = mapRef.current;
    if (!map) return;
    // The vector artwork carries its own labels; only the tile style needs ours.
    const wanted = props.showPlaceLabels && !wantSvg && geo.labels.length > 0;
    if (wanted && !labelsRef.current) {
      labelsRef.current = createPlaceLabels(geo).addTo(map);
    } else if (!wanted && labelsRef.current) {
      map.removeLayer(labelsRef.current);
      labelsRef.current = null;
    }
    declutterRef.current?.();
  }, [props.showPlaceLabels, wantSvg, geo]);

  /* ----------------------------------------------------------------- markers */
  const buildCtx = () => ({
    data,
    extents: floor.extents,
    markerScale: props.markerScale,
    showZones: props.showZones,
    showMarkerLabels: props.showMarkerLabels,
    showQuestLabels: props.showQuestLabels,
    dimCompleted: props.dimCompleted,
    taskStatus: props.taskStatus,
    markerDone: props.markerDone,
    visibleQuests: props.visibleQuests,
    renderer: rendererRef.current!,
    onSelect,
  });

  /**
   * Everything that changes what the non-quest layers look like. Quest state is
   * deliberately absent: ticking a task or a single objective location happens
   * many times per raid, and rebuilding all twelve layers each time would stall
   * the map for no reason.
   */
  const baseDeps = [
    data,
    floor.id,
    props.markerScale,
    props.showZones,
    props.showMarkerLabels,
    props.dimCompleted,
  ];

  useEffect(() => {
    const map = mapRef.current;
    if (!map || !rendererRef.current) return;

    for (const layer of markerLayersRef.current.values()) map.removeLayer(layer);
    markerLayersRef.current.clear();

    const ctx = buildCtx();
    for (const def of LAYERS) {
      markerLayersRef.current.set(def.id, buildLayer(def.id, ctx));
    }
    // Adding happens in the visibility effect below, which runs straight after.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, baseDeps);

  /* Quest markers alone, rebuilt whenever task progress or filtering changes. */
  useEffect(() => {
    const map = mapRef.current;
    if (!map || !rendererRef.current) return;
    // Skip the first run: the effect above has just built every layer, quests
    // included, from the same inputs.
    if (!markerLayersRef.current.has("quests")) return;

    const previous = markerLayersRef.current.get("quests");
    const wasOn = !!previous && map.hasLayer(previous);
    if (previous) map.removeLayer(previous);

    const next = buildLayer("quests", buildCtx());
    markerLayersRef.current.set("quests", next);
    if (wasOn && layers.quests) next.addTo(map);
    declutterRef.current?.();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [props.visibleQuests, props.taskStatus, props.markerDone, props.showQuestLabels]);

  useEffect(() => {
    const map = mapRef.current;
    if (!map) return;
    for (const [id, group] of markerLayersRef.current) {
      const on = layers[id];
      if (on && !map.hasLayer(group)) group.addTo(map);
      else if (!on && map.hasLayer(group)) map.removeLayer(group);
    }
    declutterRef.current?.();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [layers, ...baseDeps]);

  /* --------------------------------------------------------------- highlight */
  const highlightAt = useMemo(() => selectionPosition(selection), [selection]);

  useEffect(() => {
    const map = mapRef.current;
    if (!map) return;
    if (highlightRef.current) {
      map.removeLayer(highlightRef.current);
      highlightRef.current = null;
    }
    if (!highlightAt) return;
    highlightRef.current = L.marker(toLatLng(highlightAt), {
      interactive: false,
      keyboard: false,
      zIndexOffset: -100,
      icon: L.divIcon({ className: "tk-highlight", html: "<span></span>", iconSize: [0, 0] }),
    }).addTo(map);
  }, [highlightAt]);

  /* ------------------------------------------------------------------- focus */
  useEffect(() => {
    const map = mapRef.current;
    if (!map || !focus) return;
    map.flyTo(toLatLng(focus.position), focus.zoom ?? Math.max(map.getZoom(), geo.maxZoom - 1.5), {
      duration: 0.6,
    });
  }, [focus, geo.maxZoom]);

  /* ------------------------------------------------ keep size honest on resize */
  useEffect(() => {
    const map = mapRef.current;
    const container = containerRef.current;
    if (!map || !container || typeof ResizeObserver === "undefined") return;
    const observer = new ResizeObserver(() => {
      map.invalidateSize({ animate: false });
      refitRef.current?.();
      declutterRef.current?.();
    });
    observer.observe(container);
    return () => observer.disconnect();
  }, []);

  return (
    <div ref={shellRef} className="relative h-full w-full" style={{ background: "var(--bg)" }}>
      <div ref={containerRef} className="tk-map h-full w-full" role="application" aria-label={`${data.name} map`} />

      {/* Stacked above the fit button, which sits above Leaflet's zoom control. */}
      <button
        type="button"
        className="btn btn-icon absolute bottom-[3.5rem] right-3 z-[500] md:bottom-[10rem]"
        style={{ boxShadow: "var(--shadow)" }}
        aria-pressed={isFullscreen}
        title={isFullscreen ? "Leave fullscreen" : "Fill the screen with the map"}
        aria-label={isFullscreen ? "Leave fullscreen" : "Fill the screen with the map"}
        onClick={toggleFullscreen}
      >
        <svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" strokeWidth="1.9" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
          {isFullscreen ? (
            <path d="M9 3v6H3M21 9h-6V3M15 21v-6h6M3 15h6v6" />
          ) : (
            <path d={icons.expand} />
          )}
        </svg>
      </button>

      <button
        type="button"
        className="btn btn-icon absolute bottom-3 right-3 z-[500] md:bottom-[6.5rem]"
        style={{ boxShadow: "var(--shadow)" }}
        title="Fit the whole map on screen"
        aria-label="Fit the whole map on screen"
        onClick={() => fitRef.current?.()}
      >
        <svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" strokeWidth="1.9" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
          <path d="M4 9V6a2 2 0 0 1 2-2h3M15 4h3a2 2 0 0 1 2 2v3M20 15v3a2 2 0 0 1-2 2h-3M9 20H6a2 2 0 0 1-2-2v-3" />
        </svg>
      </button>
      {baseError && (
        <div className="pointer-events-none absolute inset-0 grid place-items-center p-6">
          <p className="pointer-events-auto rounded-lg border border-red-500/40 bg-red-950/80 px-4 py-3 text-sm text-red-100 backdrop-blur">
            {baseError}
          </p>
        </div>
      )}
    </div>
  );
}
