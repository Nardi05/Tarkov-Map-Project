import assert from "node:assert/strict";
import { test } from "node:test";
import { buildSave, parseSave, saveFileName, SaveFileError, SAVE_KIND } from "./save-file.ts";
import { DEFAULT_PROFILE, emptyProgress } from "./persist-migrate.ts";

const withProgress = () => {
  const p = emptyProgress();
  p.pvp.taskStatus = { a: "active", b: "completed" };
  p.pvp.markerDone = { m1: true };
  return p;
};

test("a save round-trips through export and import", () => {
  const file = buildSave({ ...DEFAULT_PROFILE, level: 42 }, withProgress());
  const back = parseSave(JSON.stringify(file));

  assert.deepEqual(back.progress.pvp.taskStatus, { a: "active", b: "completed" });
  assert.deepEqual(back.progress.pvp.markerDone, { m1: true });
  assert.equal(back.profile?.level, 42);
  assert.deepEqual(back.counts.pvp, { tasks: 2, markers: 1 });
});

test("a mode absent from the file comes back empty, not undefined", () => {
  const back = parseSave(JSON.stringify(buildSave(DEFAULT_PROFILE, withProgress())));
  assert.deepEqual(back.progress.pve, { taskStatus: {}, markerDone: {} });
  assert.deepEqual(back.progress.season, { taskStatus: {}, markerDone: {} });
});

test("someone else's JSON is refused by name", () => {
  assert.throws(() => parseSave("not json"), SaveFileError);
  assert.throws(() => parseSave(JSON.stringify({ hello: 1 })), SaveFileError);
  assert.throws(() => parseSave(JSON.stringify([1, 2, 3])), SaveFileError);
});

test("a save from a newer site version is refused rather than half-read", () => {
  const file = { ...buildSave(DEFAULT_PROFILE, withProgress()), version: 99 };
  assert.throws(() => parseSave(JSON.stringify(file)), /newer version/);
});

test("statuses we no longer understand are dropped, not trusted", () => {
  // "failed" used to be the sample here, and stopped being a good one when the
  // graph turned out to branch on it — see failureUnlocks. The invariant is
  // unchanged: a status this version cannot act on is not carried forward.
  const file = {
    kind: SAVE_KIND,
    version: 1,
    progress: { pvp: { taskStatus: { a: "abandoned", b: "completed", c: 7 }, markerDone: {} } },
  };
  assert.deepEqual(parseSave(JSON.stringify(file)).progress.pvp.taskStatus, { b: "completed" });
});

test("a failed quest survives a save round trip", () => {
  // Two quests are only ever offered after a failure, and six more sit behind
  // those, so losing a declared failure on restore loses that whole branch.
  const progress = {
    ...emptyProgress(),
    pvp: { taskStatus: { hotWheels: "failed" as const }, markerDone: {} },
  };
  const restored = parseSave(JSON.stringify(buildSave(DEFAULT_PROFILE, progress)));
  assert.equal(restored.progress.pvp.taskStatus.hotWheels, "failed");
  assert.equal(restored.counts.pvp.tasks, 1);
});

test("an empty save is refused, so a mis-click cannot look like success", () => {
  const file = buildSave(DEFAULT_PROFILE, emptyProgress());
  assert.throws(() => parseSave(JSON.stringify(file)), /no progress/);
});

test("the file name sorts and says which mode it holds", () => {
  assert.equal(saveFileName("pvp", new Date("2026-08-17T10:00:00Z")), "tarkov-progress-pvp-2026-08-17.json");
  assert.equal(saveFileName("pve", new Date("2026-01-02T10:00:00Z")), "tarkov-progress-pve-2026-01-02.json");
  assert.equal(saveFileName("season", new Date("2026-08-19T10:00:00Z")), "tarkov-progress-season-2026-08-19.json");
});
