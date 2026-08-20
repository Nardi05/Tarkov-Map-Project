import assert from "node:assert/strict";
import { test } from "node:test";
import {
  DASH_PANELS,
  DEFAULT_DASHBOARD,
  mergeDashboard,
  movePanel,
  reorderPanels,
  setPanelFlag,
  type DashPanel,
} from "./dashboard.ts";

const ids = (panels: DashPanel[]) => panels.map((p) => p.id);

test("an empty store gets the shipped layout", () => {
  assert.deepEqual(mergeDashboard(undefined), DEFAULT_DASHBOARD);
});

test("the original panelOrder shape keeps its order and gains the new panels", () => {
  const out = mergeDashboard({ panelOrder: ["needs", "upcoming", "keys"] } as never);
  // What the player arranged comes first, untouched.
  assert.deepEqual(ids(out.panels).slice(0, 3), ["needs", "upcoming", "keys"]);
  // Everything added since is appended rather than dropped on the floor.
  assert.deepEqual([...ids(out.panels)].sort(), [...DASH_PANELS].sort());
  assert.equal(out.panels.every((p) => p.visible || !["needs", "upcoming", "keys"].includes(p.id)), true);
});

test("a stored layout keeps hidden and wide flags", () => {
  const out = mergeDashboard({
    panels: [
      { id: "keys", visible: false, wide: true },
      { id: "upcoming", visible: true, wide: false },
    ],
    upcomingLimit: 12,
    columns: 1,
  });
  assert.deepEqual(ids(out.panels).slice(0, 2), ["keys", "upcoming"]);
  assert.equal(out.panels[0].visible, false);
  assert.equal(out.panels[0].wide, true);
  assert.equal(out.panels[1].wide, false);
  assert.equal(out.upcomingLimit, 12);
  assert.equal(out.columns, 1);
});

test("junk in the stored layout cannot produce a broken dashboard", () => {
  const out = mergeDashboard({
    panels: [
      { id: "nope" as never, visible: true, wide: true },
      { id: "keys", visible: true, wide: true },
      // A duplicate must not render the same panel twice.
      { id: "keys", visible: false, wide: false },
      null as never,
    ],
    upcomingLimit: 999,
    columns: 7 as never,
  });
  assert.deepEqual([...ids(out.panels)].sort(), [...DASH_PANELS].sort());
  assert.equal(out.panels.filter((p) => p.id === "keys").length, 1);
  assert.equal(out.upcomingLimit, DEFAULT_DASHBOARD.upcomingLimit);
  assert.equal(out.columns, 2);
});

test("reorderPanels moves one panel and leaves the rest in order", () => {
  const panels = mergeDashboard(undefined).panels;
  const moved = reorderPanels(panels, 0, 3);
  assert.equal(moved[3].id, panels[0].id);
  assert.deepEqual(
    ids(moved).filter((id) => id !== panels[0].id),
    ids(panels).filter((id) => id !== panels[0].id),
  );
  // Out-of-range targets clamp rather than losing the panel.
  assert.deepEqual([...ids(reorderPanels(panels, 0, 99))].sort(), [...ids(panels)].sort());
  assert.deepEqual(ids(reorderPanels(panels, 2, 2)), ids(panels));
});

test("movePanel steps over hidden panels so the button always looks like it worked", () => {
  const panels: DashPanel[] = [
    { id: "progress", visible: true, wide: true },
    { id: "raid", visible: false, wide: true },
    { id: "upcoming", visible: true, wide: true },
  ];
  // Up from `upcoming` skips the hidden `raid` and lands above `progress`.
  assert.deepEqual(ids(movePanel(panels, "upcoming", -1)), ["upcoming", "progress", "raid"]);
  // Nothing above the first visible panel: the order is left alone.
  assert.deepEqual(ids(movePanel(panels, "progress", -1)), ids(panels));
  assert.deepEqual(ids(movePanel(panels, "nope" as never, 1)), ids(panels));
});

test("setPanelFlag touches one panel and copies rather than mutates", () => {
  const panels = mergeDashboard(undefined).panels;
  const hidden = setPanelFlag(panels, "keys", "visible", false);
  assert.equal(hidden.find((p) => p.id === "keys")!.visible, false);
  assert.equal(panels.find((p) => p.id === "keys")!.visible, true);
  assert.equal(hidden.filter((p) => !p.visible).length, 1);
});
