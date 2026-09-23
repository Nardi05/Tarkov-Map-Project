import type { Vec3 } from "../types";

/**
 * Multi-floor maps describe each floor as one or more "extents": an elevation
 * band, optionally narrowed to specific footprints on the map. Customs' second
 * floor, for instance, only means 2.7m-6.5m *inside the dorms and a handful of
 * other buildings* — elsewhere that height is still ground level.
 *
 * A marker is on the floor when its vertical span overlaps a band and, where
 * the band is bounded, its ground position falls inside one of those rectangles.
 *
 * Kept apart from the CRS on purpose: this is arithmetic on the map data and
 * touches no Leaflet, so the map index and its tests can use it without pulling
 * a DOM library in behind it.
 */
export interface Extent {
  height?: [number, number];
  /** [[x, z], [x, z], label?] rectangles the band applies to. */
  bounds?: [number, number][][];
}

/** Anything with a world position, and optionally a vertical span. */
export interface Placed {
  position: Vec3;
  top?: number | null;
  bottom?: number | null;
}

export function withinExtents(marker: Placed, extents: Extent[] | null): boolean {
  if (!extents || extents.length === 0) return true;

  const y = marker.position[1];
  const top = marker.top ?? y;
  const bottom = marker.bottom ?? y;

  for (const extent of extents) {
    const [low, high] = extent.height ?? [-Infinity, Infinity];
    if (!(top >= low && bottom < high)) continue;
    if (!extent.bounds) return true;
    for (const rect of extent.bounds) {
      const [x1, z1] = rect[0];
      const [x2, z2] = rect[1];
      const x = marker.position[0];
      const z = marker.position[2];
      if (x >= Math.min(x1, x2) && x <= Math.max(x1, x2) && z >= Math.min(z1, z2) && z <= Math.max(z1, z2)) {
        return true;
      }
    }
  }
  return false;
}
