import L from "leaflet";
import type { Geo, Vec3 } from "../types";

/**
 * Tarkov's world axes are (x, y, z) with y as elevation, and each map image is
 * georeferenced by an affine transform plus a rotation that turns the raw world
 * axes into the orientation players see in game.
 *
 * We express that as a Leaflet CRS so markers and the base image share one
 * coordinate system: `L.CRS.Simple` with the map's scale/offset baked into the
 * transformation, and the rotation applied inside the projection. Anything
 * drawn with `toLatLng()` then lands in the right place at every zoom level.
 *
 * (Transform values are the ones the-hideout calibrated for these map images.)
 */
function rotate(latLng: L.LatLng, degrees: number): L.LatLng {
  if (!degrees || (!latLng.lat && !latLng.lng)) return latLng;
  const rad = (degrees * Math.PI) / 180;
  const cos = Math.cos(rad);
  const sin = Math.sin(rad);
  const { lng: x, lat: y } = latLng;
  return L.latLng(x * sin + y * cos, x * cos - y * sin);
}

export function createCRS(geo: Geo): L.CRS {
  const [scaleX, marginX, scaleYRaw, marginY] = geo.transform ?? [1, 0, 1, 0];
  const rotation = geo.coordinateRotation ?? 0;

  return L.extend({}, L.CRS.Simple, {
    // Leaflet's y axis grows downward, hence the negated vertical scale.
    transformation: new L.Transformation(scaleX, marginX, -scaleYRaw, marginY),
    projection: L.extend({}, L.Projection.LonLat, {
      project: (latLng: L.LatLng) => L.Projection.LonLat.project(rotate(latLng, rotation)),
      unproject: (point: L.Point) => rotate(L.Projection.LonLat.unproject(point), -rotation),
    }),
  }) as L.CRS;
}

/** World position -> Leaflet LatLng. Elevation (y) is carried separately. */
export function toLatLng(position: Vec3 | [number, number]): L.LatLng {
  return position.length === 3
    ? L.latLng(position[2], position[0])
    : L.latLng(position[1], position[0]);
}

/** `bounds` is stored as [[x, z], [x, z]] in the map's own orientation. */
export function toBounds(bounds: [[number, number], [number, number]]): L.LatLngBounds {
  return L.latLngBounds(
    L.latLng(bounds[0][1], bounds[0][0]),
    L.latLng(bounds[1][1], bounds[1][0]),
  );
}

/** Panning room around the map image, so it never sticks to the viewport edge. */
export function paddedBounds(
  bounds: [[number, number], [number, number]],
  factor = 1.4,
): L.LatLngBounds {
  const cx = (bounds[0][0] + bounds[1][0]) / 2;
  const cy = (bounds[0][1] + bounds[1][1]) / 2;
  const w = ((bounds[1][0] - bounds[0][0]) * factor) / 2;
  const h = ((bounds[1][1] - bounds[0][1]) * factor) / 2;
  return L.latLngBounds(L.latLng(cy - h, cx - w), L.latLng(cy + h, cx + w));
}

/*
 * Floor extents live in `./extents`, which is deliberately Leaflet-free so the
 * map index can share the rule without dragging a DOM library into its tests.
 * Re-exported here because this is where callers have always looked for it.
 */
export { withinExtents, type Extent, type Placed } from "./extents";
