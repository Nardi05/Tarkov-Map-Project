import assert from "node:assert/strict";
import { test } from "node:test";
import { displayBossName, listMapBosses, bossMatchesSearch } from "./boss-names.ts";

test("Knight, Big Pipe, Birdeye and Rogue all read as Goons", () => {
  assert.equal(displayBossName("Knight"), "Goons");
  assert.equal(displayBossName("Big Pipe"), "Goons");
  assert.equal(displayBossName("Birdeye"), "Goons");
  assert.equal(displayBossName("Rogue"), "Goons");
  assert.equal(displayBossName("Reshala"), "Reshala");
});

test("a map that lists Knight and Rogue only shows Goons once", () => {
  assert.deepEqual(listMapBosses(["Reshala", "Knight", "Partisan", "Rogue"]), [
    "Reshala",
    "Goons",
    "Partisan",
  ]);
});

test("AF is dropped rather than shown as a boss", () => {
  assert.deepEqual(listMapBosses(["Sanitar", "AF", "Knight"]), ["Sanitar", "Goons"]);
});

test("searching goons finds maps that only named Knight", () => {
  assert.equal(bossMatchesSearch(["Knight", "Partisan"], "goons"), true);
  assert.equal(bossMatchesSearch(["Tagilla"], "goons"), false);
  assert.equal(bossMatchesSearch(["Knight"], "reshala"), false);
});
