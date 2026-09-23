import assert from "node:assert/strict";
import { test } from "node:test";
import { KORD_SEASON, kordProgressionTasks, shortDocumentLabel } from "./kord-season.ts";
import { visibleInMode } from "./task-variant.ts";

test("the story line is complete from Uninvited Guests through Digital Puzzle", () => {
  const names = KORD_SEASON.questline.map((q) => q.name);
  assert.equal(names[0], "Uninvited Guests - Part 1");
  assert.ok(names.includes("Digital Puzzle"));
  assert.ok(names.includes("Riding the Wave"));
  assert.equal(new Set(KORD_SEASON.questline.map((q) => q.id)).size, KORD_SEASON.questline.length);
});

test("every requirement points at another story-line quest", () => {
  const ids = new Set(KORD_SEASON.questline.map((q) => q.id));
  for (const quest of KORD_SEASON.questline) {
    for (const req of quest.requires) {
      assert.ok(ids.has(req.task), `${quest.name} requires unknown ${req.task}`);
    }
  }
});

test("Desperate Assault is an either-or gate, not both", () => {
  const tasks = kordProgressionTasks();
  const assault = tasks["kord:desperate-assault"];
  assert.equal(assault.requires.length, 2);
  assert.equal(assault.requires[0].length, 1);
  assert.equal(assault.requires[1].length, 1);
});

test("shortDocumentLabel does not turn User documentation into Useration", () => {
  assert.equal(shortDocumentLabel("User documentation"), "User");
  assert.equal(shortDocumentLabel("Medical documents"), "Medical");
  assert.equal(shortDocumentLabel("Blueprints and technical documentation"), "Blueprints and technical");
  assert.equal(shortDocumentLabel("PMC personnel files"), "PMC personnel files");
});

test("season-tagged names only show on a seasonal character", () => {
  const tasks = kordProgressionTasks();
  const name = tasks["kord:uninvited-guests-1"].name;
  assert.equal(visibleInMode(name, "season"), true);
  assert.equal(visibleInMode(name, "pvp"), false);
  assert.equal(visibleInMode(name, "pve"), false);
});
