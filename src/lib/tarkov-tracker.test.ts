import assert from "node:assert/strict";
import { test } from "node:test";
import { parsePasted, toImport, looksLikeToken, TrackerError } from "./tarkov-tracker.ts";

const known = new Set(["a", "b", "c"]);

test("only completed, known tasks are written", () => {
  const result = toImport(
    {
      tasksProgress: [
        { id: "a", complete: true },
        { id: "b", complete: false },
        { id: "zzz", complete: true },
      ],
    },
    known,
  );

  assert.deepEqual(result.taskStatus, { a: "completed" });
  assert.equal(result.matched, 1);
  assert.equal(result.unknown, 1);
});

test("a failed task is counted, never written as done", () => {
  const result = toImport({ tasksProgress: [{ id: "a", failed: true, complete: false }] }, known);

  assert.deepEqual(result.taskStatus, {});
  assert.equal(result.failed, 1);
});

test("a task both failed and complete counts as complete", () => {
  // The tracker sets both on the branches you finish by failing on purpose.
  const result = toImport({ tasksProgress: [{ id: "a", failed: true, complete: true }] }, known);

  assert.deepEqual(result.taskStatus, { a: "completed" });
  assert.equal(result.failed, 0);
});

test("invalid entries are ignored entirely", () => {
  const result = toImport({ tasksProgress: [{ id: "a", complete: true, invalid: true }] }, known);

  assert.deepEqual(result.taskStatus, {});
  assert.equal(result.matched, 0);
  assert.equal(result.unknown, 0);
});

test("level and faction come across, clamped", () => {
  assert.equal(toImport({ tasksProgress: [], playerLevel: 42 }, known).level, 42);
  assert.equal(toImport({ tasksProgress: [], playerLevel: 999 }, known).level, 79);
  assert.equal(toImport({ tasksProgress: [], playerLevel: 0 }, known).level, null);
  assert.equal(toImport({ tasksProgress: [], pmcFaction: "USEC" }, known).faction, "USEC");
  assert.equal(toImport({ tasksProgress: [], pmcFaction: "Nobody" }, known).faction, null);
});

test("a pasted export is accepted wrapped or bare", () => {
  const bare = parsePasted(JSON.stringify({ tasksProgress: [{ id: "a", complete: true }] }));
  const wrapped = parsePasted(
    JSON.stringify({ data: { tasksProgress: [{ id: "a", complete: true }] } }),
  );

  assert.equal(bare.tasksProgress?.length, 1);
  assert.equal(wrapped.tasksProgress?.length, 1);
});

test("junk paste fails with something a human can act on", () => {
  assert.throws(() => parsePasted("not json"), TrackerError);
  assert.throws(() => parsePasted(JSON.stringify({ hello: 1 })), TrackerError);
});

test("token shape check rejects the obvious mistakes", () => {
  assert.equal(looksLikeToken("1hPXpHErq8ASiM1NnkCymQ"), true);
  assert.equal(looksLikeToken("  1hPXpHErq8ASiM1NnkCymQ  "), true);
  assert.equal(looksLikeToken(""), false);
  assert.equal(looksLikeToken("short"), false);
  assert.equal(looksLikeToken("Bearer 1hPXpHErq8ASiM1NnkCymQ"), false);
});
