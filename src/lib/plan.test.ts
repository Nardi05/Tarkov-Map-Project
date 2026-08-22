import assert from "node:assert/strict";
import { test } from "node:test";
import { buildPlan, targetTree } from "./plan.ts";
import type { Progression, ProgressionTask } from "../types.ts";

const task = (over: Partial<ProgressionTask> = {}): ProgressionTask => ({
  name: "A task",
  trader: "Prapor",
  minPlayerLevel: 0,
  factionName: null,
  kappaRequired: false,
  lightkeeperRequired: false,
  experience: 1000,
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

const profile = (over: Record<string, unknown> = {}) => ({
  level: 40,
  faction: "Any" as const,
  mode: "pvp" as const,
  traderLevels: {},
  targetTaskId: null as string | null,
  ...over,
});

/** Debut -> Checking -> Collector */
const wipe = graph({
  debut: task({ name: "Debut", kappaRequired: true }),
  checking: task({
    name: "Checking",
    kappaRequired: true,
    requires: [[{ task: "debut", status: ["complete"] }]],
  }),
  collector: task({
    name: "Collector",
    kappaRequired: true,
    minPlayerLevel: 45,
    requires: [[{ task: "checking", status: ["complete"] }]],
  }),
  side: task({ name: "Side job", kappaRequired: false }),
});

test("with no target, currently doable tasks are the plan", () => {
  const plan = buildPlan(wipe, {}, profile({ level: 1 }));
  assert.deepEqual(plan.current.sort(), ["debut", "side"]);
  assert.equal(plan.targetId, null);
});

test("a target tree hides off-path side jobs", () => {
  const plan = buildPlan(wipe, {}, profile({ targetTaskId: "collector", level: 50 }));
  assert.deepEqual(plan.current, ["debut"]);
  assert.ok(!plan.current.includes("side"));
  assert.equal(plan.remainingToTarget, 3);
  assert.equal(plan.targetName, "Collector");
});

test("finishing the first hop puts the next one in current and the rest in high", () => {
  const plan = buildPlan(
    wipe,
    { debut: "completed" },
    profile({ targetTaskId: "collector", level: 50 }),
  );
  assert.deepEqual(plan.current, ["checking"]);
  assert.ok(plan.high.includes("collector") || plan.normal.includes("collector"));
  assert.equal(plan.remainingToTarget, 2);
});

test("ignored tasks leave the plan but still count toward remaining", () => {
  const plan = buildPlan(
    wipe,
    { debut: "ignored" },
    profile({ targetTaskId: "collector", level: 50 }),
  );
  assert.ok(!plan.current.includes("debut"));
  // Ignoring a required parent does not pretend Collector is closer.
  assert.equal(plan.remainingToTarget, 3);
});

test("a pinned off-tree task still jumps the queue", () => {
  const plan = buildPlan(
    wipe,
    { side: "pinned" },
    profile({ targetTaskId: "collector", level: 1 }),
  );
  assert.equal(plan.current[0], "side");
  assert.ok(plan.critical.includes("side"));
});

test("the target tree is the task plus everything behind it", () => {
  const tree = targetTree(wipe, "collector");
  assert.deepEqual([...tree].sort(), ["checking", "collector", "debut"]);
});
