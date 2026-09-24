import assert from "node:assert/strict";
import { test } from "node:test";
import {
  cycleWithFill,
  fillBehind,
  importWithFill,
  prereqsToFill,
  setWithFill,
  undoFill,
} from "./prereq-fill.ts";
import type { Progression, ProgressionTask, TaskStatus } from "../types.ts";

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

const after = (...ids: string[]) => [ids.map((task) => ({ task, status: ["complete"] }))];

/** Debut → Checking → Collector, plus a side quest behind Collector and an unrelated one. */
const graph: Progression = {
  generated: "",
  degraded: false,
  keys: {},
  tasks: {
    debut: task({ name: "Debut" }),
    checking: task({ name: "Background Check", requires: after("debut") }),
    shortage: task({ name: "Shortage", trader: "Therapist" }),
    collector: task({ name: "Collector", trader: "Fence", requires: after("checking", "shortage") }),
    other: task({ name: "Unrelated" }),
  },
};

const sorted = (ids: string[]) => [...ids].sort();

test("syncing Collector active fills its whole chain and keeps Collector active", () => {
  const out = importWithFill(graph, {}, { collector: "active" });
  assert.deepEqual(sorted(out.filled), ["checking", "debut", "shortage"]);
  assert.deepEqual(out.taskStatus, {
    collector: "active",
    checking: "completed",
    debut: "completed",
    shortage: "completed",
  });
});

test("a prerequisite the player marked failed is never overwritten", () => {
  const out = importWithFill(graph, { checking: "failed" }, { collector: "active" });
  assert.equal(out.taskStatus.checking, "failed");
  assert.equal(out.taskStatus.collector, "active");
  // The chain behind the failed quest is still filled: it had to be done to get there.
  assert.deepEqual(sorted(out.filled), ["debut", "shortage"]);
});

test("ignored, pinned and active prerequisites keep what the player said", () => {
  const current: Record<string, TaskStatus> = { debut: "ignored", shortage: "active" };
  const out = importWithFill(graph, current, { collector: "active" });
  assert.equal(out.taskStatus.debut, "ignored");
  assert.equal(out.taskStatus.shortage, "active");
  assert.deepEqual(out.filled, ["checking"]);
});

test("a pinned quest counts as held; completing or failing one fills nothing", () => {
  assert.deepEqual(sorted(importWithFill(graph, {}, { collector: "pinned" }).filled), [
    "checking",
    "debut",
    "shortage",
  ]);
  assert.deepEqual(importWithFill(graph, {}, { collector: "completed" }).filled, []);
  assert.deepEqual(setWithFill(graph, {}, "collector", "failed").filled, []);
  assert.deepEqual(setWithFill(graph, { collector: "active" }, "collector", null), {
    taskStatus: {},
    filled: [],
  });
});

test("an import only looks behind the quests it wrote", () => {
  // `checking` was already active and its chain left open on purpose; importing
  // an unrelated active quest must not quietly fill that in.
  const out = importWithFill(graph, { checking: "active" }, { other: "active" });
  assert.deepEqual(out.filled, []);
  assert.equal(out.taskStatus.debut, undefined);
});

test("with no status filter, the fill matches Settings → Recalc over every active", () => {
  const status: Record<string, TaskStatus> = { checking: "active", other: "active" };
  assert.deepEqual(prereqsToFill(graph, status), ["debut"]);
  assert.deepEqual(fillBehind(graph, status).taskStatus.debut, "completed");
});

test("a single tick to active fills behind that quest; the next tick completes only it", () => {
  const first = cycleWithFill(graph, {}, "checking");
  assert.deepEqual(first.taskStatus, { checking: "active", debut: "completed" });
  assert.deepEqual(first.filled, ["debut"]);
  const second = cycleWithFill(graph, first.taskStatus, "checking");
  assert.deepEqual(second.taskStatus, { checking: "completed", debut: "completed" });
  assert.deepEqual(second.filled, []);
  const third = cycleWithFill(graph, second.taskStatus, "checking");
  assert.deepEqual(third.taskStatus, { debut: "completed" });
});

test("without the task graph the write goes through untouched", () => {
  const out = importWithFill(null, {}, { collector: "active" });
  assert.deepEqual(out, { taskStatus: { collector: "active" }, filled: [] });
});

test("undo puts back only what the fill wrote and is still completed", () => {
  const { taskStatus, filled } = importWithFill(graph, {}, { collector: "active" });
  const changed = { ...taskStatus, debut: "failed" as const };
  assert.deepEqual(undoFill(changed, filled), { collector: "active", debut: "failed" });
});
