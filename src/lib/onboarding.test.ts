import assert from "node:assert/strict";
import { test } from "node:test";
import { emptyProgress } from "./persist-migrate.ts";
import { hasCharacterData, homeFor, parseEntry } from "./onboarding.ts";

test("empty progress is not character data", () => {
  assert.equal(hasCharacterData(undefined), false);
  assert.equal(hasCharacterData(emptyProgress()), false);
});

test("a single ticked task counts as a character", () => {
  const progress = emptyProgress();
  progress.pvp.taskStatus["debut"] = "active";
  assert.equal(hasCharacterData(progress), true);
});

test("hideout or stash on any mode counts", () => {
  const hideout = emptyProgress();
  hideout.season.hideout["station-1"] = "completed";
  assert.equal(hasCharacterData(hideout), true);
  const stash = emptyProgress();
  stash.pve.itemCounts["roubles"] = 3;
  assert.equal(hasCharacterData(stash), true);
});

test("homeFor sends new visitors to the landing page", () => {
  assert.equal(homeFor(null, emptyProgress()), "landing");
});

test("homeFor honours a maps-only choice until they store a character", () => {
  assert.equal(homeFor("maps", emptyProgress()), "maps");
  const progress = emptyProgress();
  progress.pvp.taskStatus["debut"] = "completed";
  assert.equal(homeFor("maps", progress), "dashboard");
});

test("homeFor sends a tracker setup or stored progress to the dashboard", () => {
  assert.equal(homeFor("tracker", emptyProgress()), "dashboard");
  const progress = emptyProgress();
  progress.pvp.keysOwned["key"] = true;
  assert.equal(homeFor(null, progress), "dashboard");
});

test("parseEntry rejects junk", () => {
  assert.equal(parseEntry("maps"), "maps");
  assert.equal(parseEntry("tracker"), "tracker");
  assert.equal(parseEntry("dashboard"), null);
  assert.equal(parseEntry(undefined), null);
});
