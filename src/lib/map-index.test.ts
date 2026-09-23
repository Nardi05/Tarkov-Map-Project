import assert from "node:assert/strict";
import { test } from "node:test";
import { indexMap, offFloorPoints, searchMap } from "./map-index.ts";
import type { Floor } from "./base-layer";
import type { Extract, Lock, MapData, QuestMarker, Vec3 } from "../types";

/* ------------------------------------------------------------- fixtures */

const at = (x: number, y: number, z: number): Vec3 => [x, y, z];

function extract(id: string, name: string, position: Vec3, faction: Extract["faction"] = "pmc"): Extract {
  return {
    id,
    name,
    rawName: name,
    faction,
    position,
    outline: null,
    top: null,
    bottom: null,
    switches: [],
  };
}

function lock(id: string, key: string | null, position: Vec3): Lock {
  return { id, lockType: "door", key, needsPower: false, position, outline: null, top: null, bottom: null };
}

function questMarker(id: string, task: string, objective: string, position: Vec3): QuestMarker {
  return {
    id,
    task,
    objective,
    kind: "pickup",
    optional: false,
    count: null,
    description: "Find the thing",
    position,
    outline: null,
    top: null,
    bottom: null,
    item: null,
  };
}

function mapData(over: Partial<MapData["markers"]> = {}, tasks: MapData["tasks"] = {}): MapData {
  return {
    id: "m",
    name: "Test",
    normalizedName: "test",
    description: null,
    wiki: null,
    players: null,
    raidDuration: null,
    enemies: [],
    bosses: [],
    geo: {
      key: "test",
      minZoom: 0,
      maxZoom: 6,
      tileSize: 256,
      transform: null,
      coordinateRotation: 0,
      bounds: [[-100, -100], [100, 100]],
      svgBounds: null,
      svgPath: null,
      svgLayer: null,
      tilePath: null,
      heightRange: null,
      author: null,
      authorLink: null,
      layers: [],
      labels: [],
    },
    markers: {
      spawns: [],
      bossSpawns: [],
      extracts: [],
      transits: [],
      locks: [],
      hazards: [],
      switches: [],
      quests: [],
      documents: [],
      ...over,
    },
    tasks,
    keys: {},
    generated: "2026-01-01T00:00:00.000Z",
  };
}

/** Ground band and an upstairs band, the shape every multi-floor map has. */
const FLOORS: Floor[] = [
  { id: "ground", name: "Ground level", svgLayer: "Ground", tilePath: null, extents: [{ height: [-10, 3] }] },
  { id: "l0", name: "2nd Floor", svgLayer: "Second", tilePath: null, extents: [{ height: [3, 10] }] },
  { id: "all", name: "All levels", svgLayer: "Ground", tilePath: null, extents: null },
];

const ALL = () => true;

/* ---------------------------------------------------------------- index */

test("an empty map indexes to nothing", () => {
  assert.deepEqual(indexMap(mapData()), []);
});

test("extracts are indexed under the layer their faction belongs to", () => {
  const points = indexMap(
    mapData({
      extracts: [
        extract("e1", "ZB-1011", at(0, 0, 0), "pmc"),
        extract("e2", "Old Gas", at(5, 0, 5), "scav"),
        extract("e3", "Crossroads", at(9, 0, 9), "shared"),
      ],
    }),
  );
  assert.deepEqual(
    points.map((p) => p.layer),
    ["pmc-extracts", "scav-extracts", "shared-extracts"],
  );
  assert.deepEqual(points.map((p) => p.subtitle), [
    "PMC extract",
    "Scav extract",
    "Shared extract",
  ]);
});

test("one door two factions can use is two rows, told apart and not colliding", () => {
  // The feed gives Interchange's Railway Exfil the same id under both factions.
  const data = mapData({
    extracts: [
      extract("dup", "Railway Exfil", at(0, 0, 0), "pmc"),
      extract("dup", "Railway Exfil", at(0, 0, 0), "scav"),
    ],
  });
  const points = indexMap(data);
  assert.equal(new Set(points.map((p) => p.id)).size, 2);
  assert.deepEqual(points.map((p) => p.subtitle), ["PMC extract", "Scav extract"]);
});

test("and it is still one off-floor pip, not two on the same pixel", () => {
  const data = mapData({
    extracts: [
      extract("dup", "Railway Exfil", at(0, 5, 0), "pmc"),
      extract("dup", "Railway Exfil", at(0, 5, 0), "scav"),
    ],
  });
  assert.equal(offFloorPoints(indexMap(data), FLOORS, "ground", ALL).length, 1);
});

test("a lock with a known key is titled by the key, not the door", () => {
  const data = mapData({ locks: [lock("l1", "k1", at(0, 0, 0))] });
  data.keys = {
    k1: { id: "k1", name: "Dorm room 220 key", shortName: "Dorm 220", icon: null } as never,
  };
  const [point] = indexMap(data);
  assert.equal(point.title, "Dorm room 220 key");
  // The short name is searchable without being shown — it is how people type it.
  assert.match(point.terms, /Dorm 220/);
});

test("a lock with no known key still says so rather than being dropped", () => {
  const [point] = indexMap(mapData({ locks: [lock("l1", null, at(0, 0, 0))] }));
  assert.equal(point.title, "Locked door");
  assert.equal(point.subtitle, "Locked, no key known");
});

test("ordinary spawns are left out and sniper nests are kept", () => {
  const points = indexMap(
    mapData({
      spawns: [
        { id: "s1", group: "pmc", position: at(0, 0, 0), zone: null, sides: [], categories: [] },
        { id: "s2", group: "scav", position: at(1, 0, 1), zone: null, sides: [], categories: [] },
        { id: "s3", group: "sniper", position: at(2, 0, 2), zone: "Water tower", sides: [], categories: [] },
      ],
    }),
  );
  assert.deepEqual(points.map((p) => p.id), ["sniper:s3"]);
});

test("boss spawn points collapse per zone", () => {
  const boss = (id: string, zone: string, position: Vec3) => ({
    id,
    name: "Reshala",
    normalizedName: "reshala",
    zone,
    mapChance: 0.35,
    zoneChance: null,
    escorts: [],
    position,
  });
  const points = indexMap(
    mapData({
      bossSpawns: [
        boss("b1", "Dorms", at(0, 0, 0)),
        boss("b2", "Dorms", at(2, 0, 2)),
        boss("b3", "Gas station", at(50, 0, 50)),
      ],
    }),
  );
  assert.equal(points.length, 2);
  // The pin sits between the zone's points, not on the first one.
  assert.deepEqual(points[0].position, at(1, 0, 1));
});

/* --------------------------------------------------------------- search */

test("a one-character query returns nothing rather than the whole map", () => {
  const points = indexMap(mapData({ extracts: [extract("e1", "ZB-1011", at(0, 0, 0))] }));
  assert.deepEqual(searchMap(points, "Z"), []);
});

test("a name that starts with the query outranks one that merely contains it", () => {
  const data = mapData({
    extracts: [extract("e1", "Old Dorms gate", at(0, 0, 0))],
    locks: [lock("l1", "k1", at(5, 0, 5))],
  });
  data.keys = { k1: { id: "k1", name: "Dorms key", shortName: "Dorms", icon: null } as never };
  const hits = searchMap(indexMap(data), "dorms");
  assert.deepEqual(hits.map((h) => h.title), ["Dorms key", "Old Dorms gate"]);
});

test("eleven spawns of one quest item are one result", () => {
  const quests = Array.from({ length: 11 }, (_, i) =>
    questMarker(`q${i}`, "t1", "o1", at(i, 0, i)),
  );
  const data = mapData({ quests }, { t1: { id: "t1", name: "Chemical Part 1" } as never });
  const hits = searchMap(indexMap(data), "chemical");
  assert.equal(hits.length, 1);
});

test("search matches the hidden terms as well as the name", () => {
  const points = indexMap(
    mapData({
      switches: [
        { id: "s1", name: "Power box", switchType: null, position: at(0, 0, 0), activates: ["D-2 extract"] },
      ],
    }),
  );
  assert.deepEqual(searchMap(points, "d-2").map((h) => h.title), ["Power box"]);
});

test("a result carries the floor it is on, so the picker can switch to it", () => {
  const points = indexMap(mapData({ extracts: [extract("e1", "Balcony", at(0, 5, 0))] }));
  const [hit] = searchMap(points, "balcony", FLOORS);
  assert.equal(hit.floor?.id, "l0");
});

/* ------------------------------------------------------------ off-floor */

test("a map with no floors hides nothing", () => {
  const points = indexMap(mapData({ extracts: [extract("e1", "ZB-1011", at(0, 0, 0))] }));
  assert.deepEqual(offFloorPoints(points, [], "ground", ALL), []);
});

test("All levels hides nothing, because it filters nothing", () => {
  const points = indexMap(mapData({ extracts: [extract("e1", "Balcony", at(0, 5, 0))] }));
  assert.deepEqual(offFloorPoints(points, FLOORS, "all", ALL), []);
});

test("standing on the ground floor flags what is upstairs, and says where", () => {
  const points = indexMap(
    mapData({
      extracts: [extract("e1", "Ground gate", at(0, 0, 0)), extract("e2", "Balcony", at(9, 5, 9))],
    }),
  );
  const off = offFloorPoints(points, FLOORS, "ground", ALL);
  assert.equal(off.length, 1);
  assert.equal(off[0].title, "Balcony");
  assert.equal(off[0].floorName, "2nd Floor");
  // The pip goes over where the thing is, so it reads as "up there", not "over there".
  assert.deepEqual(off[0].position, at(9, 5, 9));
});

test("the pip says which way to go", () => {
  const points = indexMap(
    mapData({ extracts: [extract("e1", "Yard", at(0, 0, 0)), extract("e2", "Balcony", at(9, 5, 9))] }),
  );
  assert.equal(offFloorPoints(points, FLOORS, "ground", ALL)[0].direction, "up");
  assert.equal(offFloorPoints(points, FLOORS, "l0", ALL)[0].direction, "down");
});

test("a basement listed last is still down", () => {
  // Every map puts its underground level at the bottom of the floor menu, which
  // is the opposite end from where it is in the building. Factory's tunnels
  // came out as "Up on Tunnels" when this was read off the listing order.
  const withTunnels: Floor[] = [
    FLOORS[0],
    FLOORS[1],
    { id: "l1", name: "Tunnels", svgLayer: "Tunnels", tilePath: null, extents: [{ height: [-40, -10] }] },
    FLOORS[2],
  ];
  const points = indexMap(mapData({ extracts: [extract("e1", "Cellar door", at(0, -20, 0))] }));
  const [pip] = offFloorPoints(points, withTunnels, "ground", ALL);
  assert.equal(pip.floorName, "Tunnels");
  assert.equal(pip.direction, "down");
});

test("the pip counts the things it stands for instead of stacking", () => {
  const quests = Array.from({ length: 11 }, (_, i) =>
    questMarker(`q${i}`, "t1", "o1", at(i, 5, i)),
  );
  const data = mapData({ quests }, { t1: { id: "t1", name: "Chemical Part 1" } as never });
  const off = offFloorPoints(indexMap(data), FLOORS, "ground", ALL);
  assert.equal(off.length, 1);
  assert.equal(off[0].count, 11);
});

test("a layer the player turned off gets no pips", () => {
  const points = indexMap(mapData({ extracts: [extract("e1", "Balcony", at(0, 5, 0))] }));
  const off = offFloorPoints(points, FLOORS, "ground", (p) => p.layer !== "pmc-extracts");
  assert.deepEqual(off, []);
});

test("a point no floor claims is not reported as being on another one", () => {
  // Above every band this map describes — so we do not know where it is, and
  // guessing would be worse than saying nothing.
  const points = indexMap(mapData({ extracts: [extract("e1", "Roof", at(0, 99, 0))] }));
  assert.deepEqual(offFloorPoints(points, FLOORS, "ground", ALL), []);
});
