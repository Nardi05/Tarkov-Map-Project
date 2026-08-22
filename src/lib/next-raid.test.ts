import assert from "node:assert/strict";
import { test } from "node:test";
import { nextRaids } from "./next-raid.ts";
import type { MapIndexEntry, Progression } from "../types.ts";

const map = (name: string, docs = 0): MapIndexEntry => ({
  id: name,
  name: name[0].toUpperCase() + name.slice(1),
  normalizedName: name,
  description: null,
  players: null,
  raidDuration: null,
  bosses: [],
  styles: ["clean"],
  preview: null,
  counts: { spawns: 1, bosses: 0, extracts: 1, transits: 0, keys: 0, quests: 1, docs },
});

const graph = (tasks: Progression["tasks"]): Progression => ({
  generated: "",
  degraded: false,
  tasks,
  keys: {},
});

test("maps with more active tasks rank first", () => {
  const customs = map("customs", 20);
  const woods = map("woods", 20);
  const progression = graph({
    a: {
      name: "Debut",
      trader: "Prapor",
      minPlayerLevel: 1,
      factionName: null,
      kappaRequired: false,
      lightkeeperRequired: false,
      requires: [],
      maps: ["customs"],
      traderGates: [],
      needs: [],
      keys: [],
      wiki: null,
    },
    b: {
      name: "Checking",
      trader: "Prapor",
      minPlayerLevel: 1,
      factionName: null,
      kappaRequired: false,
      lightkeeperRequired: false,
      requires: [],
      maps: ["customs"],
      traderGates: [],
      needs: [],
      keys: [],
      wiki: null,
    },
    c: {
      name: "The Survivalist Path",
      trader: "Jaeger",
      minPlayerLevel: 1,
      factionName: null,
      kappaRequired: false,
      lightkeeperRequired: false,
      requires: [],
      maps: ["woods"],
      traderGates: [],
      needs: [],
      keys: [],
      wiki: null,
    },
  });

  const picks = nextRaids(
    [woods, customs],
    progression,
    { a: "active", b: "active", c: "active" },
    2,
  );
  assert.equal(picks[0].map.normalizedName, "customs");
  assert.equal(picks[0].active.length, 2);
  assert.equal(picks[1].map.normalizedName, "woods");
});

test("documents only appear as a tie-break, never above an active task", () => {
  const factory = map("factory", 30);
  const shoreline = map("shoreline", 0);
  const progression = graph({
    a: {
      name: "Uninvited Guests - Part 1 [KORD BREACH]",
      trader: "Prapor",
      minPlayerLevel: 0,
      factionName: null,
      kappaRequired: false,
      lightkeeperRequired: false,
      requires: [],
      maps: ["shoreline"],
      traderGates: [],
      needs: [],
      keys: [],
      wiki: null,
    },
  });
  const picks = nextRaids([factory, shoreline], progression, { a: "active" }, 2);
  assert.equal(picks[0].map.normalizedName, "shoreline");
  assert.equal(picks[0].active[0].name, "Uninvited Guests - Part 1");
});

test("with no active tasks, fallback ids still rank a map", () => {
  const customs = map("customs", 0);
  const woods = map("woods", 0);
  const progression = graph({
    c: {
      name: "The Survivalist Path",
      trader: "Jaeger",
      minPlayerLevel: 1,
      factionName: null,
      kappaRequired: false,
      lightkeeperRequired: false,
      requires: [],
      maps: ["woods"],
      traderGates: [],
      needs: [],
      keys: [],
      wiki: null,
    },
  });
  const picks = nextRaids([customs, woods], progression, {}, 2, ["c"]);
  assert.equal(picks[0].map.normalizedName, "woods");
  assert.equal(picks[0].active[0].id, "c");
});
