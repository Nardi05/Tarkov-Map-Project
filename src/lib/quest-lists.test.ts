import assert from "node:assert/strict";
import { test } from "node:test";
import { collectKeys, collectNeeds, collectTaskItems } from "./quest-lists.ts";
import type { Progression, ProgressionTask } from "../types.ts";

const task = (over: Partial<ProgressionTask> = {}): ProgressionTask => ({
  name: "A task",
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
  ...over,
});

const graph = (over: Partial<Progression> = {}): Progression => ({
  generated: "",
  degraded: false,
  tasks: {},
  keys: {},
  ...over,
});

test("collectNeeds subtracts the global stash, not a per-quest pile", () => {
  const progression = graph({
    tasks: {
      a: task({
        name: "Shortage",
        needs: [
          {
            items: ["gas"],
            name: "Gas analyzer",
            icon: null,
            count: 3,
            foundInRaid: true,
          },
        ],
      }),
      b: task({
        name: "Sanitary Standards",
        needs: [
          {
            items: ["gas"],
            name: "Gas analyzer",
            icon: null,
            count: 2,
            foundInRaid: true,
          },
        ],
      }),
    },
  });
  const rows = collectNeeds(progression, ["a", "b"], { gas: 4 });
  assert.equal(rows.length, 1);
  assert.equal(rows[0].count, 5);
  assert.equal(rows[0].remaining, 1);
});

test("collectNeeds ignores non-FIR hand-ins", () => {
  const progression = graph({
    tasks: {
      a: task({
        needs: [
          { items: ["roubles"], name: "Roubles", icon: null, count: 1000, foundInRaid: false },
        ],
      }),
    },
  });
  assert.deepEqual(collectNeeds(progression, ["a"], { roubles: 0 }), []);
});

test("collectTaskItems remaining is need minus have, never negative", () => {
  const progression = graph({
    tasks: {
      a: task({
        name: "Debut",
        needs: [
          { items: ["mp133"], name: "MP-133", icon: null, count: 2, foundInRaid: false },
        ],
      }),
    },
  });
  const [row] = collectTaskItems(progression, { mp133: 9 });
  assert.equal(row.remaining, 0);
  assert.equal(row.have, 9);
});

test("collectKeys names maps and does not duplicate a key", () => {
  const progression = graph({
    keys: {
      dorm: { id: "dorm", name: "Dorm room 214", shortName: "214", icon: null, wiki: null },
    },
    tasks: {
      a: task({
        name: "Checking",
        keys: [{ map: "customs", keys: ["dorm"] }],
      }),
      b: task({
        name: "The Punisher",
        keys: [{ map: "customs", keys: ["dorm"] }],
      }),
    },
  });
  const rows = collectKeys(progression, ["a", "b"]);
  assert.equal(rows.length, 1);
  assert.deepEqual(rows[0].tasks.sort(), ["Checking", "The Punisher"]);
  assert.deepEqual(rows[0].maps, ["Customs"]);
});
