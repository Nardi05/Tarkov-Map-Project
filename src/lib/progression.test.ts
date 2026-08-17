import assert from "node:assert/strict";
import { test } from "node:test";
import { computeAvailability, lockReasons } from "./progression.ts";
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

const graph = (tasks: Record<string, ProgressionTask>): Progression => ({
  generated: "",
  degraded: false,
  tasks,
  keys: {},
});

const gated = graph({
  a: task({ traderGates: [{ trader: "Prapor", kind: "level", value: 3 }] }),
});

const profile = (over: Record<string, unknown> = {}) => ({
  level: 40,
  faction: "Any",
  ...over,
});

test("an untold trader never gates a task", () => {
  // 83 tasks carry a loyalty gate and nothing else. Treating silence as level 1
  // would lock most of the game for anyone who has not filled the form in.
  assert.equal(computeAvailability(gated, {}, profile()).a, "available");
  assert.equal(computeAvailability(gated, {}, profile({ traderLevels: {} })).a, "available");
  assert.equal(
    computeAvailability(gated, {}, profile({ traderLevels: { Therapist: 4 } })).a,
    "available",
  );
});

test("a stated trader level below the gate locks the task", () => {
  const p = profile({ traderLevels: { Prapor: 2 } });
  assert.equal(computeAvailability(gated, {}, p).a, "locked");
  assert.deepEqual(lockReasons(gated, "a", {}, p), [{ kind: "trader", label: "Prapor LL3" }]);
});

test("a stated trader level at or above the gate opens it", () => {
  assert.equal(computeAvailability(gated, {}, profile({ traderLevels: { Prapor: 3 } })).a, "available");
  assert.equal(computeAvailability(gated, {}, profile({ traderLevels: { Prapor: 4 } })).a, "available");
});

test("reputation gates are never enforced", () => {
  // There is nowhere to ask for a reputation figure, and guessing one would be
  // inventing progress the player never reported.
  const rep = graph({ a: task({ traderGates: [{ trader: "Fence", kind: "reputation", value: 6 }] }) });
  assert.equal(computeAvailability(rep, {}, profile({ traderLevels: { Fence: 1 } })).a, "available");
});

test("what the player declared still beats every gate", () => {
  const p = profile({ traderLevels: { Prapor: 1 } });
  assert.equal(computeAvailability(gated, { a: "active" }, p).a, "active");
  assert.equal(computeAvailability(gated, { a: "completed" }, p).a, "completed");
});

test("level and faction gates still work alongside trader levels", () => {
  const g = graph({ a: task({ minPlayerLevel: 50, factionName: "USEC" }) });
  const p = profile({ level: 10, faction: "BEAR", traderLevels: {} });
  assert.equal(computeAvailability(g, {}, p).a, "locked");
  assert.deepEqual(lockReasons(g, "a", {}, p), [
    { kind: "level", label: "Level 50" },
    { kind: "faction", label: "USEC only" },
  ]);
});
