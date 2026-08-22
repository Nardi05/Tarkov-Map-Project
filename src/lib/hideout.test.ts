import assert from "node:assert/strict";
import { test } from "node:test";
import { completeThrough, hideoutRows } from "./hideout.ts";
import type { HideoutData, HideoutStation } from "../types.ts";

const station = (over: Partial<HideoutStation> = {}): HideoutStation => ({
  id: "med",
  name: "Medstation",
  image: null,
  levels: [
    { id: "med-1", level: 1, itemRequirements: [], stationLevelRequirements: [] },
    { id: "med-2", level: 2, itemRequirements: [], stationLevelRequirements: [] },
    { id: "med-3", level: 3, itemRequirements: [], stationLevelRequirements: [] },
  ],
  ...over,
});

const data = (stations: HideoutStation[]): HideoutData => ({
  generated: "",
  stations,
});

test("completeThrough includes every earlier level", () => {
  assert.deepEqual(completeThrough(station(), 2), ["med-1", "med-2"]);
  assert.deepEqual(completeThrough(station(), 3), ["med-1", "med-2", "med-3"]);
});

test("hideoutRows treats the next unbuilt level as available when prereqs are met", () => {
  const [row] = hideoutRows(data([station()]), { "med-1": "completed" });
  assert.equal(row.completedLevel, 1);
  assert.equal(row.next?.level, 2);
  assert.equal(row.status, "available");
});

test("a station-level requirement locks the next upgrade", () => {
  const vents: HideoutStation = {
    id: "vents",
    name: "Vents",
    image: null,
    levels: [{ id: "vents-1", level: 1, itemRequirements: [], stationLevelRequirements: [] }],
  };
  const gen: HideoutStation = {
    id: "gen",
    name: "Generator",
    image: null,
    levels: [
      {
        id: "gen-1",
        level: 1,
        itemRequirements: [],
        stationLevelRequirements: [{ stationId: "vents", level: 1 }],
      },
    ],
  };
  const rows = hideoutRows(data([vents, gen]), {});
  assert.equal(rows.find((r) => r.station.id === "gen")?.status, "locked");
  const unlocked = hideoutRows(data([vents, gen]), { "vents-1": "completed" });
  assert.equal(unlocked.find((r) => r.station.id === "gen")?.status, "available");
});

test("completed level is the consecutive prefix, not the highest tick", () => {
  const [skipped] = hideoutRows(data([station()]), { "med-2": "completed" });
  assert.equal(skipped.completedLevel, 0);
  assert.equal(skipped.next?.level, 1);
  const [prefix] = hideoutRows(data([station()]), { "med-1": "completed", "med-2": "completed" });
  assert.equal(prefix.completedLevel, 2);
  assert.equal(prefix.next?.level, 3);
});
