import assert from "node:assert/strict";
import { test } from "node:test";
import {
  buildSideMissions,
  mapWorkload,
  mergeItems,
  mergeKeys,
  nextStorySteps,
  objectiveLabel,
  storyChapters,
  storyKeys,
  upcomingSideMissions,
  type SideMission,
} from "./missions.ts";
import { STORY, endingById } from "./story.ts";
import type { Faction, GameEdition, GameMode } from "./persist-migrate.ts";
import type { Progression, ProgressionTask, TaskStatus } from "../types.ts";

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
  objectives: [],
  wiki: null,
  ...over,
});

const graph = (tasks: Record<string, ProgressionTask>, keys = {}): Progression => ({
  generated: "",
  degraded: false,
  tasks,
  keys,
});

const profile: {
  mode: GameMode;
  faction: Faction;
  level: number;
  traderLevels: Record<string, number>;
  gameEdition: GameEdition;
  targetTaskId: string | null;
} = {
  mode: "pvp",
  faction: "Any",
  level: 20,
  traderLevels: {},
  gameEdition: "standard",
  targetTaskId: null,
};

function build(
  tasks: Record<string, ProgressionTask>,
  {
    keys = {},
    taskStatus = {},
    itemCounts = {},
    keysOwned = {},
    over = {},
  }: {
    keys?: Progression["keys"];
    taskStatus?: Record<string, TaskStatus>;
    itemCounts?: Record<string, number>;
    keysOwned?: Record<string, true>;
    over?: Partial<typeof profile>;
  } = {},
): SideMission[] {
  return buildSideMissions({
    progression: graph(tasks, keys),
    taskStatus,
    profile: { ...profile, ...over },
    itemCounts,
    keysOwned,
  });
}

/* ------------------------------------------------------------ side missions */

test("a null graph yields no missions rather than throwing", () => {
  const rows = buildSideMissions({
    progression: null,
    taskStatus: {},
    profile,
    itemCounts: {},
    keysOwned: {},
  });
  assert.deepEqual(rows, []);
});

test("a task locked to the other faction never appears", () => {
  const tasks = {
    usec: task({ name: "USEC only", factionName: "USEC" }),
    bear: task({ name: "BEAR only", factionName: "BEAR" }),
    both: task({ name: "Anyone" }),
  };

  const asAny = build(tasks).map((m) => m.id).sort();
  assert.deepEqual(asAny, ["bear", "both", "usec"], "Any sees every faction's tasks");

  const asUsec = build(tasks, { over: { faction: "USEC" } }).map((m) => m.id).sort();
  assert.deepEqual(asUsec, ["both", "usec"]);
});

test("keys and hand-ins are resolved against the key index and the stash", () => {
  const [mission] = build(
    {
      t1: task({
        keys: [{ map: "customs", keys: ["k1"] }],
        needs: [
          { items: ["i1"], name: "Bolts", icon: null, count: 5, foundInRaid: true },
        ],
      }),
    },
    {
      keys: {
        k1: {
          id: "k1",
          name: "Machinery key",
          shortName: "Machinery",
          icon: null,
          wiki: null,
        },
      },
      itemCounts: { i1: 2 },
      keysOwned: { k1: true },
    },
  );

  assert.equal(mission.keys.length, 1);
  assert.equal(mission.keys[0].name, "Machinery key");
  assert.deepEqual(mission.keys[0].maps, ["customs"]);
  assert.equal(mission.keys[0].owned, true, "a key the player marked owned says so");

  assert.equal(mission.items[0].need, 5);
  assert.equal(mission.items[0].have, 2);
  assert.equal(mission.items[0].remaining, 3);
});

test("a legacy payload's find-then-hand-over pair folds to one line, not their sum", () => {
  /*
   * The feed states one requirement twice: find 3 magazines, hand over 3. They
   * are the same three. Summing told people Ice Cream Cones wanted six. The
   * pipeline now folds this at the source; this covers payloads built before
   * it did.
   */
  const [mission] = build(
    {
      t1: task({
        needs: [
          { items: ["i1"], name: "Magazine", icon: null, count: 3, foundInRaid: true },
          { items: ["i1"], name: "Magazine", icon: null, count: 3, foundInRaid: false },
          { items: ["i2"], name: "Other", icon: null, count: 1, foundInRaid: false },
        ],
      }),
    },
    { itemCounts: { i1: 1 } },
  );

  assert.equal(mission.items.length, 2, "two distinct items, not three rows");
  const mag = mission.items.find((i) => i.itemId === "i1")!;
  assert.equal(mag.need, 3, "three, not six");
  assert.equal(mag.have, 1, "one stash, counted once");
  assert.equal(mag.remaining, 2);
  assert.equal(mag.foundInRaid, true, "the stricter requirement wins");
});

test("an unknown key id still produces a row rather than disappearing", () => {
  const [mission] = build({ t1: task({ keys: [{ map: "woods", keys: ["ghost"] }] }) });
  assert.equal(mission.keys.length, 1);
  assert.equal(mission.keys[0].name, "Unknown key");
});

test("blockers are computed for locked rows only", () => {
  const rows = build({
    first: task({ name: "First" }),
    second: task({ name: "Second", requires: [[{ task: "first", status: ["complete"] }]] }),
  });
  const byId = new Map(rows.map((r) => [r.id, r]));
  assert.equal(byId.get("second")!.availability, "locked");
  assert.ok(byId.get("second")!.blockers.length > 0, "a locked task says why");
  assert.deepEqual(byId.get("first")!.blockers, [], "an open task pays nothing for blockers");
});

/* ----------------------------------------------------------------- ranking */

test("upcoming puts active before available, then sorts by level", () => {
  const rows = build(
    {
      cheap: task({ name: "Cheap", minPlayerLevel: 2 }),
      dear: task({ name: "Dear", minPlayerLevel: 15 }),
      mine: task({ name: "Mine", minPlayerLevel: 30 }),
    },
    { taskStatus: { mine: "active" }, over: { level: 40 } },
  );

  const order = upcomingSideMissions(rows).map((m) => m.name);
  assert.deepEqual(order, ["Mine", "Cheap", "Dear"]);
});

test("upcoming excludes finished and locked work", () => {
  const rows = build(
    {
      open: task({ name: "Open" }),
      done: task({ name: "Done" }),
      gated: task({ name: "Gated", requires: [[{ task: "open", status: ["complete"] }]] }),
    },
    { taskStatus: { done: "completed" } },
  );
  assert.deepEqual(upcomingSideMissions(rows).map((m) => m.name), ["Open"]);
});

/* ------------------------------------------------------------------ merges */

test("one key wanted by three quests is one row naming all three", () => {
  const keys = {
    k1: { id: "k1", name: "Dorm 314", shortName: "314", icon: null, wiki: null },
  };
  const rows = build(
    {
      a: task({ name: "A", keys: [{ map: "customs", keys: ["k1"] }] }),
      b: task({ name: "B", keys: [{ map: "customs", keys: ["k1"] }] }),
      c: task({ name: "C", keys: [{ map: "woods", keys: ["k1"] }] }),
    },
    { keys },
  );

  const merged = mergeKeys(rows);
  assert.equal(merged.length, 1, "three tasks, one key");
  assert.equal(merged[0].wantedBy.length, 3);
  assert.deepEqual(merged[0].maps.sort(), ["customs", "woods"], "maps union, deduped");
});

test("merging items sums what is wanted but never sums the stash", () => {
  const rows = build(
    {
      a: task({
        name: "A",
        needs: [{ items: ["i1"], name: "Wires", icon: null, count: 3, foundInRaid: true }],
      }),
      b: task({
        name: "B",
        needs: [{ items: ["i1"], name: "Wires", icon: null, count: 4, foundInRaid: true }],
      }),
    },
    { itemCounts: { i1: 2 } },
  );

  const [row] = mergeItems(rows, true);
  assert.equal(row.need, 7, "3 + 4 wanted");
  assert.equal(row.have, 2, "one stash, counted once — not 4");
  assert.equal(row.remaining, 5);
});

test("items already covered by the stash drop off the shopping list", () => {
  const rows = build(
    {
      a: task({
        name: "A",
        needs: [{ items: ["i1"], name: "Wires", icon: null, count: 2, foundInRaid: true }],
      }),
    },
    { itemCounts: { i1: 9 } },
  );
  assert.deepEqual(mergeItems(rows, true), []);
});

test("firOnly keeps out things you can simply buy", () => {
  const rows = build({
    a: task({
      name: "A",
      needs: [
        { items: ["fir"], name: "Found", icon: null, count: 1, foundInRaid: true },
        { items: ["buy"], name: "Bought", icon: null, count: 1, foundInRaid: false },
      ],
    }),
  });
  assert.deepEqual(mergeItems(rows, true).map((r) => r.name), ["Found"]);
  assert.equal(mergeItems(rows, false).length, 2);
});

test("map workload counts each mission once per map, busiest first", () => {
  const rows = build({
    a: task({ name: "A", maps: ["customs"] }),
    b: task({ name: "B", maps: ["customs", "woods"] }),
  });
  assert.deepEqual(mapWorkload(rows), [
    { map: "customs", count: 2 },
    { map: "woods", count: 1 },
  ]);
});

/* ----------------------------------------------------------------- story */

const savior = endingById("savior")!;

test("story chapters come back in chapter order with progress", () => {
  const views = storyChapters(savior, {}, {}, {});
  assert.ok(views.length > 0, "Savior has chapters");
  const numbers = views.map((v) => v.chapter.number);
  assert.deepEqual(numbers, [...numbers].sort((a, b) => a - b), "ordered by chapter number");
  for (const view of views) {
    assert.equal(view.total, view.steps.length);
    assert.equal(view.done, 0, "nothing ticked yet");
    assert.equal(view.complete, false);
  }
});

test("ticking every step of a chapter completes it and clears its next step", () => {
  const first = storyChapters(savior, {}, {}, {})[0];
  const ticks = Object.fromEntries(first.steps.map((s) => [s.step.id, true as const]));
  const after = storyChapters(savior, ticks, {}, {}).find(
    (v) => v.chapter.id === first.chapter.id,
  )!;

  assert.equal(after.done, after.total);
  assert.equal(after.complete, true);
  assert.equal(after.next, null);
});

test("next steps walk the spine in order before offering the evidence hunt", () => {
  const views = storyChapters(savior, {}, {}, {});
  const next = nextStorySteps(views, 5);
  assert.ok(next.length > 0);
  assert.equal(
    next[0].chapter.storyline,
    undefined,
    "the first thing offered is the main path, not a side storyline",
  );
  assert.ok(next.length <= 5, "respects the limit");
});

test("a story key is located by its step, not by the whole chapter", () => {
  /*
   * The regression this exists for: reading a key's maps off the chapter told
   * people to bring a TerraGroup Labs keycard to Customs, because one chapter
   * of the evidence hunt spans six maps.
   */
  const views = storyChapters(savior, {}, {}, {});
  const rows = storyKeys(views, null, {});
  assert.ok(rows.length > 0, "Savior's path goes through locked doors");

  for (const row of rows) {
    const owning = views.flatMap((v) =>
      v.steps.filter((s) => (s.step.keys ?? []).some((k) => k.toLowerCase() === row.name.toLowerCase())),
    );
    if (!owning.length) continue;
    const allowed = new Set(
      owning.flatMap((s) => s.step.maps ?? []),
    );
    if (allowed.size === 0) continue;
    for (const map of row.maps) {
      assert.ok(
        allowed.has(map),
        `${row.name} listed for ${map}, which no step wanting it names`,
      );
    }
  }
});

test("story keys resolve against the key index by name when one matches", () => {
  const labs = STORY.chapters
    .flatMap((c) => c.steps)
    .flatMap((s) => s.keys ?? [])
    .find((name) => /labs access keycard/i.test(name));
  assert.ok(labs, "the guide names a Labs keycard somewhere");

  const views = storyChapters(savior, {}, {}, {});
  const withIndex = storyKeys(
    views,
    graph({}, { kk: { id: "kk", name: labs!, shortName: "Labs", icon: "i.png", wiki: "w" } }),
    { kk: true },
  );
  const row = withIndex.find((r) => r.name === labs);
  assert.ok(row, "the named key is on the list");
  assert.equal(row!.id, "kk", "matched to the real record");
  assert.equal(row!.icon, "i.png");
  assert.equal(row!.owned, true);
});

test("a story key with no matching record still tells you to bring it", () => {
  const views = storyChapters(savior, {}, {}, {});
  const rows = storyKeys(views, null, {});
  assert.ok(
    rows.every((r) => r.id === null),
    "with no index nothing resolves, and every row survives anyway",
  );
  assert.ok(rows.every((r) => r.name.length > 0));
});

/* ----------------------------------------------------------------- labels */

test("objective types get a human label, and an unknown one still reads", () => {
  assert.equal(objectiveLabel("giveItem"), "Hand in");
  assert.equal(objectiveLabel("findQuestItem"), "Find");
  assert.equal(objectiveLabel("plantItem"), "Stash");
  assert.equal(objectiveLabel("shoot"), "Kill");
  assert.equal(objectiveLabel("something-new-upstream"), "Do");
});
