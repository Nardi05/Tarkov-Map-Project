import assert from "node:assert/strict";
import { test } from "node:test";
import {
  SEASON_GROUP,
  cycleStaged,
  impliedDone,
  matchesQuery,
  setupGroups,
  setupWrites,
  stageActive,
} from "./setup.ts";
import type { Progression, ProgressionTask } from "../types.ts";

const task = (over: Partial<ProgressionTask> = {}): ProgressionTask => ({
  name: "A task",
  trader: "Prapor",
  minPlayerLevel: 0,
  factionName: null,
  kappaRequired: false,
  lightkeeperRequired: false,
  requires: [],
  maps: [],
  traderGates: [],
  needs: [],
  keys: [],
  wiki: null,
  ...over,
});

const after = (id: string) => [[{ task: id, status: ["complete"] }]];

const data: Progression = {
  generated: "",
  degraded: false,
  keys: {},
  tasks: {
    debut: task({ name: "Debut" }),
    checking: task({ name: "Background Check", requires: after("debut") }),
    shootout: task({ name: "Shootout Picnic", requires: after("checking") }),
    shortage: task({ name: "Shortage", trader: "Therapist" }),
    usec: task({ name: "Textile", trader: "Ragman", factionName: "USEC" }),
    fence: task({ name: "Collector", trader: "Fence" }),
    zone: task({ name: "Debut [PVP ZONE]" }),
    "kord:b": task({ name: "Second [KORD BREACH]", requires: after("kord:a") }),
    "kord:a": task({ name: "First [KORD BREACH]" }),
  },
};

const ids = (groups: ReturnType<typeof setupGroups>) =>
  groups.map((g) => [g.id, g.tasks.map((t) => t.id)]);

test("tasks group by trader in unlock order, each chain in the order it is handed out", () => {
  const groups = setupGroups(data, { mode: "pvp", faction: "Any" });
  assert.deepEqual(ids(groups), [
    ["Prapor", ["debut", "zone", "checking", "shootout"]],
    ["Therapist", ["shortage"]],
    ["Ragman", ["usec"]],
    ["Fence", ["fence"]],
  ]);
});

test("the other faction's tasks and the season line stay off a PvP character", () => {
  const groups = setupGroups(data, { mode: "pvp", faction: "BEAR" });
  assert.equal(groups.some((g) => g.id === "Ragman"), false);
  assert.equal(groups.some((g) => g.id === SEASON_GROUP), false);
});

test("a seasonal character gets the season line first, in story order", () => {
  const groups = setupGroups(
    data,
    { mode: "season", faction: "Any" },
    { label: "Kord Breach", order: ["kord:a", "kord:b"] },
  );
  assert.deepEqual(groups[0], {
    id: SEASON_GROUP,
    label: "Kord Breach",
    trader: "Prapor",
    tasks: groups[0].tasks,
  });
  assert.deepEqual(groups[0].tasks.map((t) => t.id), ["kord:a", "kord:b"]);
});

test("search matches the display name and the trader", () => {
  const [prapor] = setupGroups(data, { mode: "pvp", faction: "Any" });
  const picnic = prapor.tasks.find((t) => t.id === "shootout")!;
  assert.equal(matchesQuery(picnic, "  PICNIC "), true);
  assert.equal(matchesQuery(picnic, "prapor"), true);
  assert.equal(matchesQuery(picnic, "therapist"), false);
  assert.equal(matchesQuery(picnic, ""), true);
});

test("an active task implies its whole chain is done, and nothing it did not need", () => {
  const staged = { shootout: "active" as const };
  const implied = impliedDone(data, staged);
  assert.deepEqual([...implied].sort(), ["checking", "debut"]);
  assert.deepEqual(setupWrites(staged, implied), {
    shootout: "active",
    checking: "completed",
    debut: "completed",
  });
});

test("a tick the player made is never overwritten by what it implies", () => {
  const staged = { shootout: "active" as const, checking: "active" as const };
  assert.deepEqual([...impliedDone(data, staged)], ["debut"]);
});

test("ticking cycles not started, active, done, and back", () => {
  let s = cycleStaged({}, "debut");
  assert.equal(s.debut, "active");
  s = cycleStaged(s, "debut");
  assert.equal(s.debut, "completed");
  s = cycleStaged(s, "debut");
  assert.equal("debut" in s, false);
});

test("a screenshot never demotes a task already marked done", () => {
  const s = stageActive({ debut: "completed" }, ["debut", "checking"]);
  assert.deepEqual(s, { debut: "completed", checking: "active" });
});
