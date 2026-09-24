import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import L from "leaflet";
import type { MapData, Vec3 } from "../types";
import { createCRS, paddedBounds, skipLayerPointRounding, toBounds, toLatLng } from "../lib/leaflet-crs";
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
import { LAYER_BY_ID, LAYERS, type LayerId } from "../lib/layers";
import { offFloorIcon } from "../lib/marker-icons";
import type { OffFloorPoint } from "../lib/map-index";
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
  /**
   * What the active floor is hiding. Worked out by the page, which is the only
   * place that knows both the layer switches and the quest filter.
   */
  offFloor: OffFloorPoint[];
  onGoToFloor: (floorId: string) => void;
  focus: FocusRequest | null;
  /** Bumped to ask the map to fit the whole bounds again. */
  fitToken?: number;
  /*
   * Fullscreen belongs to MapPage, which owns the element that goes fullscreen
   * — the whole page, so the header and panels come along. This component only
   * draws the button, because that is where the button belongs.
   */
  isFullscreen?: boolean;
  onToggleFullscreen?: () => void;
}

const escapeHtml = (s: string) => s.replace(/[<>&"]/g, (c) => `&#${c.charCodeAt(0)};`);

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
    case "document":
      return selection.spawn.position;
    case "hazard":
      return selection.hazard.position;
  }
}

export default function MapCanvas(props: Props) {
  const {
    data,
    style,
    floor,
    layers,
    selection,
    onSelect,
    onGoToFloor,
    focus,
    fitToken,
    isFullscreen,
    onToggleFullscreen,
  } = props;
  const containerRef = useRef<HTMLDivElement>(null);
  const mapRef = useRef<L.Map | null>(null);
  const rendererRef = useRef<L.Renderer | null>(null);
  const baseRef = useRef<L.Layer | null>(null);
  const svgBaseRef = useRef<SvgBase | null>(null);
  const labelsRef = useRef<L.LayerGroup | null>(null);
  const markerLayersRef = useRef(new Map<LayerId, L.LayerGroup>());
  /**
   * Set by the all-layers effect so the quest-only effect can tell "the layers
   * were just rebuilt from these same inputs" from "task progress changed".
   * The old guard tested whether the quests layer existed, which is true by the
   * time this effect first runs — so it never fired and every mount built the
   * quest layer twice.
   */
  const questsFreshRef = useRef(false);
  const highlightRef = useRef<L.Layer | null>(null);
  const offFloorRef = useRef<L.LayerGroup | null>(null);
  const declutterRef = useRef<(() => void) | null>(null);
  const refitRef = useRef<(() => void) | null>(null);
  const fitRef = useRef<(() => void) | null>(null);
  const [baseError, setBaseError] = useState<string | null>(null);

  const geo = data.geo;

  const fitMap = useCallback(() => {
    fitRef.current?.();
  }, []);

  useEffect(() => {
    if (fitToken) fitMap();
  }, [fitToken, fitMap]);

  /* ------------------------------------------------------------ map instance */
  useEffect(() => {
    const container = containerRef.current;
    if (!container || mapRef.current) return;

    const map = L.map(container, {
      crs: createCRS(geo),
      attributionControl: false,
      zoomControl: false,
      scrollWheelZoom: false,
      zoomSnap: 0,
      zoomDelta: 0.5,
      // Animated zoom CSS-scales the artwork isotropically; these CRSs are not.
      // Pins then lag behind the image until the animation ends.
      zoomAnimation: false,
      markerZoomAnimation: false,
      fadeAnimation: false,
      inertia: true,
      minZoom: geo.minZoom,
      maxZoom: Math.max(7, geo.maxZoom),
      maxBounds: paddedBounds(geo.bounds, 1.5),
      maxBoundsViscosity: 0.7,
      preferCanvas: true,
    });
    skipLayerPointRounding(map);

    createBasePane(map);
    L.control.zoom({ position: "bottomright" }).addTo(map);
    map.on("click", () => onSelect(null));

    /*
     * Trackpads fire a wheel event per pixel. Applying each one as a map zoom
     * re-projects every pin and is what made zoom/pan feel like lag. Coalesce
     * to one setZoomAround per frame. Pinch is wheel+ctrlKey — same path, and
     * preventDefault so the browser does not page-zoom the chrome.
     */
    let wheelZoom = map.getZoom();
    let wheelPoint: L.Point | null = null;
    let wheelFrame = 0;
    const onWheel = (e: WheelEvent) => {
      e.preventDefault();
      e.stopPropagation();
      const dy =
        e.deltaMode === 1 ? e.deltaY * 16 : e.deltaMode === 2 ? e.deltaY * window.innerHeight : e.deltaY;
      const pxPerLevel = e.ctrlKey ? 320 : 240;
      wheelZoom = Math.max(map.getMinZoom(), Math.min(map.getMaxZoom(), wheelZoom - dy / pxPerLevel));
      wheelPoint = map.mouseEventToContainerPoint(e);
      if (wheelFrame) return;
      wheelFrame = requestAnimationFrame(() => {
        wheelFrame = 0;
        if (!mapRef.current || !wheelPoint) return;
        if (Math.abs(wheelZoom - map.getZoom()) < 0.0008) return;
        map.setZoomAround(wheelPoint, wheelZoom, { animate: false });
      });
    };
    const swallowGesture = (e: Event) => e.preventDefault();
    container.addEventListener("wheel", onWheel, { passive: false, capture: true });
    container.addEventListener("gesturestart", swallowGesture, { passive: false });
    container.addEventListener("gesturechange", swallowGesture, { passive: false });
    container.addEventListener("gestureend", swallowGesture, { passive: false });

    const bounds = toBounds(geo.bounds);

    /** Map width in CSS pixels at zoom 0, used to reason about legibility. */
    const baseWidth = Math.abs(
      map.project(bounds.getNorthEast(), 0).x - map.project(bounds.getSouthWest(), 0).x,
    );
    /** Below roughly this width the artwork and markers stop being readable. */
    const MIN_LEGIBLE_WIDTH = 520;

    /**
     * The zoom at which the whole map fits the container as it is right now.
     *
     * `getBoundsZoom` clamps its answer to the current min/max, so the floor is
     * lifted for the measurement and put straight back. `options.minZoom` is
     * assigned rather than `setMinZoom` called, because setMinZoom has a side
     * effect — see `relaxMinZoom` below — and a measurement must not move the
     * map.
     */
    const fitZoomNow = () => {
      const floor = map.options.minZoom;
      map.options.minZoom = -10;
      const zoom = map.getBoundsZoom(bounds);
      map.options.minZoom = floor;
      return zoom;
    };

    /**
     * The configured minZoom assumes a desktop viewport. On a phone, fitting a
     * wide map like Customs needs a zoom below it, and Leaflet would otherwise
     * clamp and silently crop the map — so the floor becomes whatever it takes
     * to see the whole thing, and "fit map" is always available.
     *
     * The floor only ever comes *down*. Leaflet's `setMinZoom` zooms the map
     * for you when the new floor is above where the user currently is, and the
     * floor rises every time the container grows — so pressing Fullscreen on a
     * map you had zoomed out to see whole made the view jump back in, which
     * read as the button resetting the map rather than enlarging it. Enlarging
     * the viewport is never a reason to take zoom-out range away from someone
     * already using it.
     */
    const relaxMinZoom = () => {
      const fitZoom = fitZoomNow();
      const floor = Math.min(geo.minZoom, fitZoom);
      if (floor < map.options.minZoom!) {
        map.options.minZoom = floor;
        map.fire("zoomlevelschange");
      }
      return fitZoom;
    };

    // The opening floor, which may be either direction from the configured one.
    map.options.minZoom = Math.min(geo.minZoom, fitZoomNow());
    let fittedZoom = fitZoomNow();

    fitRef.current = () => map.fitBounds(bounds, { animate: false });

    // Opening at the fitted zoom on a phone would show the whole map at a size
    // nobody can read, so open no further out than legibility allows and let
    // the user pinch out (or press "fit map") for the overview.
    const openZoom = Math.max(fittedZoom, Math.log2(MIN_LEGIBLE_WIDTH / baseWidth));
    if (openZoom > fittedZoom + 0.01) map.setView(bounds.getCenter(), openZoom, { animate: false });
    else map.fitBounds(bounds, { animate: false });
    wheelZoom = map.getZoom();

    /**
     * Two things have to stay in proportion to the map rather than the screen,
     * or a phone ends up with a postage-stamp map under desktop-sized pins:
     *
     *   --tk-marker-scale  shrinks pins as the map renders smaller
     *   --tk-label-scale   sizes place names like printed map labels
     */
    const syncScales = () => {
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
    map.on("zoomend", () => {
      wheelZoom = map.getZoom();
      syncScales();
      declutterRef.current?.();
    });
    map.on("moveend", () => {
      declutterRef.current?.();
    });
    mapRef.current = map;

    return () => {
      if (wheelFrame) cancelAnimationFrame(wheelFrame);
      container.removeEventListener("wheel", onWheel, true);
      container.removeEventListener("gesturestart", swallowGesture);
      container.removeEventListener("gesturechange", swallowGesture);
      container.removeEventListener("gestureend", swallowGesture);
      map.remove();
      mapRef.current = null;
      rendererRef.current = null;
      baseRef.current = null;
      svgBaseRef.current = null;
      labelsRef.current = null;
      markerLayersRef.current.clear();
      highlightRef.current = null;
      offFloorRef.current = null;
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
    /*
     * Both styles get these. The vector artwork was assumed to carry its own
     * place names, so this used to skip it — but the SVGs contain no text at
     * all, which left the clean style with no street or area names anywhere.
     *
     * They are positioned through the CRS from game coordinates, the same as
     * every marker, so they land identically whichever artwork is underneath
     * rather than being tied to one image.
     */
    const wanted = props.showPlaceLabels && geo.labels.length > 0;
    if (wanted && !labelsRef.current) {
      labelsRef.current = createPlaceLabels(geo).addTo(map);
    } else if (!wanted && labelsRef.current) {
      map.removeLayer(labelsRef.current);
      labelsRef.current = null;
    }
    declutterRef.current?.();
  }, [props.showPlaceLabels, geo]);

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
    questsFreshRef.current = true;
    // Adding happens in the visibility effect below, which runs straight after.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, baseDeps);

  /* Quest markers alone, rebuilt whenever task progress or filtering changes. */
  useEffect(() => {
    const map = mapRef.current;
    if (!map || !rendererRef.current) return;
    // Skip when the effect above has just built every layer, quests included,
    // from these same inputs.
    if (questsFreshRef.current) {
      questsFreshRef.current = false;
      return;
    }
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

  /* --------------------------------------------------------------- off-floor */

  /**
   * The floor filter is the one place this map silently throws information
   * away: pick a level on Interchange and every extract downstairs stops
   * existing, with nothing on screen admitting it ever did. These pips sit over
   * where the hidden thing actually is, in its layer's colour so you can still
   * tell a key from an exit, and take you to its floor when clicked.
   *
   * Its own layer group rather than a LAYERS entry, because it is not a kind of
   * thing on the map — it is a note about the view, and it appears and vanishes
   * with the floor rather than with a switch.
   */
  useEffect(() => {
    const map = mapRef.current;
    if (!map) return;
    if (offFloorRef.current) {
      map.removeLayer(offFloorRef.current);
      offFloorRef.current = null;
    }
    if (!props.offFloor.length) return;

    const markers = props.offFloor.map((point) => {
      const color = LAYER_BY_ID[point.layer].color;
      const where = point.direction === "up" ? "up on" : "down on";
      const detail = point.count > 1 ? `${point.count} here, ${where} ${point.floorName}` : `${where.charAt(0).toUpperCase()}${where.slice(1)} ${point.floorName}`;
      const marker = L.marker(toLatLng(point.position), {
        icon: offFloorIcon(color, point.direction, props.markerScale, point.count),
        keyboard: true,
        // Never over a real marker: this is a footnote, not a pin.
        zIndexOffset: -300,
        title: `${point.title} — ${detail}`,
      });
      marker.bindTooltip(
        `<b>${escapeHtml(point.title)}</b><span>${escapeHtml(detail)} · click to go there</span>`,
        { direction: "top", offset: [0, -10], className: "tk-tip" },
      );
      const go = () => {
        onGoToFloor(point.floorId);
        if (point.select) onSelect(point.select);
      };
      marker.on("click", go);
      marker.on("keydown", (e) => {
        const ev = (e as unknown as { originalEvent: KeyboardEvent }).originalEvent;
        if (ev.key !== "Enter" && ev.key !== " " && ev.key !== "Spacebar") return;
        ev.preventDefault();
        go();
      });
      return marker;
    });

    const group = L.layerGroup(markers).addTo(map);
    offFloorRef.current = group;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [props.offFloor, props.markerScale]);

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
      icon: L.divIcon({ className: "tk-highlight", html: "<span></span>", iconSize: [40, 40] }),
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
    <div className="relative h-full w-full" style={{ background: "var(--bg)" }}>
      <div ref={containerRef} className="tk-map h-full w-full" role="application" aria-label={`${data.name} map`} />

      <div className="map-tools">
        {onToggleFullscreen && (
        <button
          type="button"
          className="btn btn-icon"
          style={{ boxShadow: "var(--shadow)" }}
          aria-pressed={isFullscreen}
          title={isFullscreen ? "Leave fullscreen (F)" : "Fullscreen (F)"}
          aria-label={isFullscreen ? "Leave fullscreen" : "Fullscreen"}
          onClick={onToggleFullscreen}
        >
          <svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" strokeWidth="1.9" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
            {isFullscreen ? <path d={icons.collapse} /> : <path d={icons.expand} />}
          </svg>
        </button>
        )}
        <button
          type="button"
          className="btn btn-icon"
          style={{ boxShadow: "var(--shadow)" }}
          title="Fit the whole map on screen (0)"
          aria-label="Fit the whole map on screen"
          onClick={fitMap}
        >
          <svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" strokeWidth="1.9" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
            <path d={icons.fit} />
          </svg>
        </button>
      </div>
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
