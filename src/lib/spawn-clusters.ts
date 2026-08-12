import type { MapData, Spawn, Vec3 } from "../types";

/**
 * Spawn points close enough together to be one place on the map, drawn as a
 * single dot at their centre.
 */
export interface SpawnCluster {
  id: string;
  group: Spawn["group"];
  centre: Vec3;
  spawns: Spawn[];
}

/**
 * How close two spawn points must be to become one dot, in game units.
 *
 * The game scatters a handful of spawn points a few metres apart inside one
 * physical spot, which drew as an unreadable clump of overlapping dots. Scaled
 * to the map because 25u is a whole courtyard on Factory and a rounding error
 * on Woods; clamped so the extremes stay sane at both ends.
 */
export function clusterRadius(data: MapData): number {
  const [[x1, z1], [x2, z2]] = data.geo.bounds;
  const extent = Math.min(Math.abs(x2 - x1), Math.abs(z2 - z1));
  return Math.max(8, Math.min(30, extent * 0.03));
}

const centre = (points: Vec3[]): Vec3 => {
  const sum = points.reduce<Vec3>((acc, p) => [acc[0] + p[0], acc[1] + p[1], acc[2] + p[2]], [0, 0, 0]);
  const n = points.length || 1;
  return [sum[0] / n, sum[1] / n, sum[2] / n];
};

/**
 * Greedy proximity clustering: a point joins the first cluster whose centre is
 * within `radius`, otherwise it starts one. Unlike single-linkage this cannot
 * chain across the map — a cluster stays roughly `radius` wide, so its centre
 * is always a fair answer to "where is this spawn".
 *
 * Deliberately ignores the zone name: the game's spawn zones overlap heavily in
 * space, so one visible clump routinely carries three or four zone names, and
 * grouping by zone left the clump on screen.
 *
 * Callers must filter by floor first — two points on different levels of
 * Interchange are not one spot, whatever their ground distance says.
 */
export function clusterSpawns(spawns: Spawn[], radius: number): SpawnCluster[] {
  const clusters: SpawnCluster[] = [];
  // Sorted so the output is stable across rebuilds rather than feed order.
  const ordered = [...spawns].sort(
    (a, b) => a.position[0] - b.position[0] || a.position[2] - b.position[2],
  );

  for (const spawn of ordered) {
    const hit = clusters.find(
      (c) => Math.hypot(c.centre[0] - spawn.position[0], c.centre[2] - spawn.position[2]) <= radius,
    );
    if (hit) {
      hit.spawns.push(spawn);
      hit.centre = centre(hit.spawns.map((s) => s.position));
    } else {
      clusters.push({
        id: `${spawn.group}-${spawn.id}`,
        group: spawn.group,
        centre: spawn.position,
        spawns: [spawn],
      });
    }
  }
  return clusters;
}
