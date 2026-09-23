import L from "leaflet";
import type { Geo } from "../types";
import type { Extent } from "./leaflet-crs";
import { toBounds } from "./leaflet-crs";

/**
 * Base map artwork comes in two flavours:
 *
 *   clean     — one vector SVG per map. Sharp at every zoom, ~150-350KB, and
 *               its floors are `<g>` groups we show or hide.
 *   satellite — raster tiles. Photographic, and its floors are separate tile
 *               pyramids.
 *
 * Both are georeferenced by the same transform, so markers don't move when you
 * switch between them.
 */

export interface Floor {
  id: string;
  name: string;
  svgLayer: string | null;
  tilePath: string | null;
  /** null means "don't filter markers by elevation". */
  extents: Extent[] | null;
}

export function floorsFor(geo: Geo): Floor[] {
  const ground: Floor = {
    id: "ground",
    name: geo.layers.length ? "Ground level" : "Whole map",
    svgLayer: geo.svgLayer,
    tilePath: geo.tilePath,
    extents: geo.heightRange ? [{ height: geo.heightRange }] : null,
  };

  const floors = [ground, ...geo.layers.map((l, i) => ({
    id: `l${i}`,
    name: l.name,
    svgLayer: l.svgLayer,
    tilePath: l.tilePath,
    extents: l.extents,
  }))];

  // With more than one floor, offer an explicit "show everything" escape hatch
  // so nothing can hide from a user who doesn't yet know about floors.
  if (geo.layers.length) {
    floors.push({
      id: "all",
      name: "All levels",
      svgLayer: geo.svgLayer,
      tilePath: geo.tilePath,
      extents: null,
    });
  }
  return floors;
}

export function availableStyles(geo: Geo): ("clean" | "satellite")[] {
  return [geo.svgPath ? ("clean" as const) : null, geo.tilePath ? ("satellite" as const) : null].filter(
    (s): s is "clean" | "satellite" => s !== null,
  );
}

/* ----------------------------------------------------------------- svg base */

const svgCache = new Map<string, Promise<string>>();

function loadSvgText(url: string): Promise<string> {
  let promise = svgCache.get(url);
  if (!promise) {
    promise = fetch(url).then((res) => {
      if (!res.ok) throw new Error(`Map artwork failed to load (${res.status})`);
      return res.text();
    });
    svgCache.set(url, promise);
  }
  return promise;
}

export interface SvgBase {
  layer: L.SVGOverlay;
  element: SVGSVGElement;
  /** Show the ground artwork plus one floor group; hide the rest. */
  setFloor: (floor: Floor) => void;
  setPlaceLabels: (visible: boolean) => void;
}

export async function createSvgBase(geo: Geo): Promise<SvgBase> {
  const text = await loadSvgText(geo.svgPath!);

  const host = document.createElementNS("http://www.w3.org/2000/svg", "svg");
  host.setAttribute("xmlns", "http://www.w3.org/2000/svg");
  host.innerHTML = text;

  const inner = host.firstElementChild as SVGSVGElement | null;
  if (!inner) throw new Error("Map artwork is empty");
  const viewBox = inner.getAttribute("viewBox");
  if (viewBox) host.setAttribute("viewBox", viewBox);

  // Floors are the top-level <g> elements that carry an id.
  const groups = [...inner.children].filter(
    (c): c is SVGGElement => c.nodeName === "g" && !!(c as SVGGElement).id,
  );

  /**
   * Show the ground artwork plus the selected floor, and say which is which.
   *
   * Both were drawn at full strength, so picking "2nd Floor" on Interchange
   * left its walls fighting the ground plan underneath for the same ink — you
   * could see the floor, but not read it. tarkov.dev solves this by holding
   * the base back, and so does this: the group that *is* the selected floor is
   * marked `active`, the ground plan under it `base`, and the stylesheet dims
   * the latter.
   *
   * Done with a data attribute rather than an inline opacity so the amount of
   * dimming is a theme decision, and so a map with no floors at all pays
   * nothing — on those, every group is `active`.
   */
  const setFloor = (floor: Floor) => {
    const wanted = new Set([geo.svgLayer, floor.svgLayer].filter(Boolean) as string[]);
    // The ground plan is only "base" while a *different* floor is on top of
    // it. On the ground floor, and on "All levels", it is what you came to
    // look at.
    const overlaid = !!floor.svgLayer && floor.svgLayer !== geo.svgLayer;

    for (const g of groups) {
      const keep = (g.dataset as Record<string, string>).keepWithGroup;
      const owner = wanted.has(g.id) ? g.id : keep && wanted.has(keep) ? keep : null;
      if (!owner) {
        g.style.display = "none";
        delete g.dataset.role;
        continue;
      }
      g.style.display = "";
      g.dataset.role = overlaid && owner === geo.svgLayer ? "base" : "active";
    }
  };

  const setPlaceLabels = (visible: boolean) => {
    host.classList.toggle("hide-place-labels", !visible);
  };

  const bounds = toBounds(geo.svgBounds ?? geo.bounds);
  const layer = L.svgOverlay(host, bounds, {
    interactive: false,
    className: "tk-base tk-base-svg",
    // Leaflet's stylesheet stacks <svg> above <canvas> inside a pane, which
    // would bury the canvas-rendered spawn dots under the artwork. Its own
    // pane keeps the base art below every marker layer.
    pane: BASE_PANE,
  });

  return { layer, element: host, setFloor, setPlaceLabels };
}

/** Pane holding the base artwork, created below Leaflet's overlay pane. */
export const BASE_PANE = "tkBase";

export function createBasePane(map: L.Map) {
  if (map.getPane(BASE_PANE)) return;
  const pane = map.createPane(BASE_PANE);
  pane.style.zIndex = "190";
  pane.style.pointerEvents = "none";
}

/* ---------------------------------------------------------------- tile base */

export function createTileBase(geo: Geo, floor: Floor): L.TileLayer {
  const url = floor.tilePath ?? geo.tilePath!;
  return L.tileLayer(url, {
    tileSize: geo.tileSize || 256,
    bounds: toBounds(geo.bounds),
    minZoom: geo.minZoom,
    maxZoom: Math.max(7, geo.maxZoom),
    maxNativeZoom: geo.maxZoom,
    noWrap: true,
    keepBuffer: 3,
    updateWhenZooming: false,
    updateWhenIdle: true,
    className: "tk-base tk-base-tile",
  });
}

/* ------------------------------------------------------------- place labels */

/**
 * Street and area names that ship with the georeferencing rather than the
 * artwork. Their size is expressed relative to the map, so it is multiplied by
 * `--tk-label-scale` (which the map keeps in step with the zoom level) —
 * otherwise Interchange's 77 shop names would all render at full size on a
 * whole-map view and turn into a smear. Anything still colliding is dropped by
 * the label declutterer, at lower priority than marker names.
 */
export function createPlaceLabels(geo: Geo): L.LayerGroup {
  return L.layerGroup(
    geo.labels.map((label) =>
      L.marker(L.latLng(label.position[1], label.position[0]), {
        interactive: false,
        keyboard: false,
        icon: L.divIcon({
          className: "tk-place-label",
          html: `<span data-priority="-10" style="font-size:calc(${
            ((label.size ?? 100) / 100) * 0.72
          }rem * var(--tk-label-scale, 1));transform:translate(-50%,-50%) rotate(${
            label.rotation ?? 0
          }deg)">${label.text.replace(/[<>&]/g, (c) => `&#${c.charCodeAt(0)};`)}</span>`,
          iconSize: [0, 0],
        }),
      }),
    ),
  );
}
