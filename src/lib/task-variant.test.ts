import assert from "node:assert/strict";
import { test } from "node:test";
import { displayName, taskZone, visibleInMode, zoneChip } from "./task-variant.ts";

test("displayName strips the mode suffix and leaves ordinary names alone", () => {
  assert.equal(displayName("Easy Money - Part 1 [PVP ZONE]"), "Easy Money - Part 1");
  assert.equal(displayName("Easy Money - Part 1 [PVE ZONE]"), "Easy Money - Part 1");
  assert.equal(displayName("Uninvited Guests - Part 1 [KORD BREACH]"), "Uninvited Guests - Part 1");
  assert.equal(displayName("Debut"), "Debut");
});

test("a shared task is visible in every mode", () => {
  assert.equal(visibleInMode("Debut", "pvp"), true);
  assert.equal(visibleInMode("Debut", "pve"), true);
  assert.equal(visibleInMode("Debut", "season"), true);
});

test("[PVP ZONE] is hidden from PvE and shown on both PvP profiles", () => {
  const name = "Easy Money - Part 1 [PVP ZONE]";
  assert.equal(taskZone(name), "pvp");
  assert.equal(visibleInMode(name, "pvp"), true);
  assert.equal(visibleInMode(name, "season"), true);
  assert.equal(visibleInMode(name, "pve"), false);
});

test("[PVE ZONE] is only for the PvE character", () => {
  const name = "Easy Money - Part 1 [PVE ZONE]";
  assert.equal(visibleInMode(name, "pve"), true);
  assert.equal(visibleInMode(name, "pvp"), false);
  assert.equal(visibleInMode(name, "season"), false);
});

test("[KORD BREACH] is seasonal-only", () => {
  const name = "Uninvited Guests - Part 1 [KORD BREACH]";
  assert.equal(taskZone(name), "season");
  assert.equal(visibleInMode(name, "season"), true);
  assert.equal(visibleInMode(name, "pvp"), false);
  assert.equal(visibleInMode(name, "pve"), false);
  assert.equal(zoneChip(name)?.label, "Kord");
});
