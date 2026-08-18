import assert from "node:assert/strict";
import { test } from "node:test";
import { DEFAULT_PROFILE, migrate, mergeProfile, mergeProgress } from "./persist-migrate.ts";

/**
 * These exist for one reason: a migration bug silently destroys progress that
 * took someone weeks to accumulate, and it is not recoverable from anywhere.
 * Every assertion is "nothing was lost", not "the shape looks right".
 */

test("v3 -> v4 moves every task status into the PvP progression", () => {
  const v3 = {
    taskStatus: { a: "active", b: "completed", c: "active" },
    markerDone: { m1: true, m2: true },
    lastMap: "customs",
  };
  const out = migrate(structuredClone(v3), 3) as Record<string, any>;

  assert.deepEqual(Object.keys(out.progress.pvp.taskStatus).sort(), ["a", "b", "c"]);
  assert.equal(out.progress.pvp.taskStatus.b, "completed");
  assert.deepEqual(Object.keys(out.progress.pvp.markerDone).sort(), ["m1", "m2"]);
  // PvE starts empty rather than inheriting — it is a different progression.
  assert.deepEqual(out.progress.pve, { taskStatus: {}, markerDone: {} });
  assert.equal(out.lastMap, "customs");
  // The flat records are gone, so nothing can read them by accident.
  assert.equal(out.taskStatus, undefined);
  assert.equal(out.markerDone, undefined);
});

test("v1 -> v4 carries the original completed flags all the way through", () => {
  const out = migrate({ completed: { x: true, y: true } }, 1) as Record<string, any>;
  assert.deepEqual(Object.keys(out.progress.pvp.taskStatus).sort(), ["x", "y"]);
  assert.equal(out.progress.pvp.taskStatus.x, "completed");
  assert.equal(out.completed, undefined);
});

test('v2 "failed" becomes not-started rather than a guess', () => {
  const v2 = {
    taskStatus: { keep: "active", gone: "failed" },
    markerDone: {},
    profile: { level: 20, faction: "BEAR" },
  };
  const out = migrate(structuredClone(v2), 2) as Record<string, any>;

  assert.equal(out.progress.pvp.taskStatus.keep, "active");
  assert.equal("gone" in out.progress.pvp.taskStatus, false);
  // v2's profile has no `mode`, so it gives way to a clean default.
  assert.equal(out.profile, undefined);
});

test("the profile delete is scoped, so a v4 profile survives a later migration", () => {
  const v4 = { profile: { mode: "pve", faction: "USEC", level: 42 }, progress: {} };
  const out = migrate(structuredClone(v4), 4) as Record<string, any>;
  assert.deepEqual(out.profile, { mode: "pve", faction: "USEC", level: 42 });
});

test("merge fills in slices a stored state predates", () => {
  assert.deepEqual(mergeProfile(undefined), DEFAULT_PROFILE);
  assert.equal(mergeProfile({ level: 30 }).mode, DEFAULT_PROFILE.mode);
  assert.equal(mergeProfile({ level: 30 }).level, 30);

  const empty = mergeProgress(undefined);
  assert.deepEqual(empty.pvp, { taskStatus: {}, markerDone: {} });
  assert.deepEqual(empty.pve, { taskStatus: {}, markerDone: {} });

  // A save written before PvE existed must not come back with pve undefined.
  const partial = mergeProgress({ progress: { pvp: { taskStatus: { a: "active" } } } });
  assert.equal(partial.pvp.taskStatus.a, "active");
  assert.deepEqual(partial.pvp.markerDone, {});
  assert.deepEqual(partial.pve, { taskStatus: {}, markerDone: {} });
});

test("migrating twice is a no-op, not a second move", () => {
  const once = migrate({ taskStatus: { a: "active" }, markerDone: {} }, 3) as Record<string, any>;
  const twice = migrate(structuredClone(once), 4) as Record<string, any>;
  assert.deepEqual(twice.progress.pvp.taskStatus, { a: "active" });
});

test("a save from before trader levels gets an object, never undefined", () => {
  // Every read site indexes traderLevels; undefined here would throw on load.
  assert.deepEqual(mergeProfile({ level: 30 }).traderLevels, {});
  assert.deepEqual(
    mergeProfile({ traderLevels: undefined } as never).traderLevels,
    {},
  );
  assert.deepEqual(mergeProfile({ traderLevels: { Prapor: 3 } }).traderLevels, { Prapor: 3 });
});

test("v5 deletes the stored TarkovTracker token, and nothing else", () => {
  // A field dropped from the type still sits in localStorage. This one is a
  // credential, so it gets deleted rather than merely ignored.
  const out = migrate(
    { trackerToken: "secret", progress: { pvp: { taskStatus: { a: "active" }, markerDone: {} } } },
    4,
  ) as Record<string, any>;

  assert.equal("trackerToken" in out, false);
  assert.deepEqual(out.progress.pvp.taskStatus, { a: "active" });
});
