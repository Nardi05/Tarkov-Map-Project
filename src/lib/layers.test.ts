import assert from "node:assert/strict";
import { test } from "node:test";
import {
  DEFAULT_LAYER_STATE,
  DEFAULT_PRESET,
  LAYERS,
  PRESETS,
  layersForMap,
  mergeLayerState,
  mergeMapLayers,
} from "./layers.ts";

const on = (state: Record<string, boolean>) =>
  Object.entries(state)
    .filter(([, v]) => v)
    .map(([id]) => id)
    .sort();

test("a map nobody has opened shows exactly the Questing view", () => {
  const questing = PRESETS.find((p) => p.id === DEFAULT_PRESET)!;
  assert.deepEqual(on(DEFAULT_LAYER_STATE), [...questing.layers].sort());
});

test("the default never lands on spawn dots, bosses or everything", () => {
  assert.equal(DEFAULT_LAYER_STATE["pmc-spawns"], false);
  assert.equal(DEFAULT_LAYER_STATE["scav-spawns"], false);
  assert.equal(DEFAULT_LAYER_STATE["boss-spawns"], false);
  assert.ok(on(DEFAULT_LAYER_STATE).length < LAYERS.length);
});

test("each map remembers its own view, and an unseen map gets the default", () => {
  const stored = { customs: { ...DEFAULT_LAYER_STATE, "pmc-spawns": true } };
  assert.equal(layersForMap(stored, "customs")["pmc-spawns"], true);
  assert.deepEqual(layersForMap(stored, "woods"), DEFAULT_LAYER_STATE);
  // A copy, so editing what a map shows cannot write through to the store.
  layersForMap(stored, "woods").quests = false;
  assert.equal(DEFAULT_LAYER_STATE.quests, true);
});

test("stored layer state is cleaned: unknown ids dropped, new layers default", () => {
  const out = mergeLayerState({ quests: false, "not-a-layer": true, keys: "yes" });
  assert.equal(out.quests, false);
  assert.equal(out.keys, DEFAULT_LAYER_STATE.keys);
  assert.equal("not-a-layer" in out, false);
  assert.deepEqual(Object.keys(out).sort(), LAYERS.map((l) => l.id).sort());
});

test("junk per-map memory reads back as nothing rather than breaking a map", () => {
  assert.deepEqual(mergeMapLayers(undefined), {});
  assert.deepEqual(mergeMapLayers("nope"), {});
  const out = mergeMapLayers({ customs: { hazards: true }, woods: null, "": {} });
  assert.deepEqual(Object.keys(out), ["customs"]);
  assert.equal(out.customs.hazards, true);
  assert.equal(out.customs.quests, true);
});
