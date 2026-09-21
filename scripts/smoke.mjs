/**
 * End-to-end smoke test. Opens every map against a running preview server,
 * turns on every layer, walks every floor and every artwork style, and fails
 * if any map logs a console error or renders no base artwork. Then opens the
 * routes that are not maps — the dashboard, the quest tracker and its
 * walkthrough — and fails the same way if any logs an error or never renders.
 *
 *   npm run build && npm run preview &
 *   npm run smoke
 *
 * Env:
 *   TK_URL     preview server origin      (default http://localhost:4173)
 *   TK_MIRROR  directory mirroring assets.tarkov.dev, used when the machine
 *              running the test has no outbound access to it. Requests fall
 *              back to a transparent pixel for anything the mirror lacks.
 *   TK_CHROMIUM  path to a Chromium binary, when the environment provides one
 *              instead of Playwright's own download.
 */
import fs from "node:fs";
import path from "node:path";
import { chromium } from "playwright";

const BASE = process.env.TK_URL ?? "http://localhost:4173";
const MIRROR = process.env.TK_MIRROR ?? null;
const PIXEL = Buffer.from(
  "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==",
  "base64",
);

const maps = JSON.parse(fs.readFileSync("public/data/index.json", "utf8")).maps;

const browser = await chromium.launch(
  process.env.TK_CHROMIUM ? { executablePath: process.env.TK_CHROMIUM } : {},
);
const page = await browser.newPage({ viewport: { width: 1440, height: 900 } });

if (MIRROR) {
  await page.route("**://assets.tarkov.dev/**", (route) => {
    const file = path.join(MIRROR, new URL(route.request().url()).pathname);
    if (fs.existsSync(file)) {
      return route.fulfill({
        status: 200,
        contentType: file.endsWith(".svg") ? "image/svg+xml" : "image/png",
        body: fs.readFileSync(file),
      });
    }
    return route.fulfill({ status: 200, contentType: "image/png", body: PIXEL });
  });
}

/*
 * What counts as a failure.
 *
 * Anything the app itself did: a thrown error, or something it logged. Not a
 * third-party asset that would not load — map artwork and task photos are
 * hotlinked from assets.tarkov.dev and the wiki, the web font comes from
 * Google, and every one of them has a designed fallback. A machine with no
 * outbound access to those hosts is not a broken build, and treating it as
 * one makes the whole pass red for a reason nobody can act on.
 *
 * Same-origin requests are still held to the full standard: a 404 on our own
 * JSON, or a missing bundle, is exactly what this exists to catch.
 */
const sameOrigin = (url) => {
  try {
    return new URL(url).origin === new URL(BASE).origin;
  } catch {
    return true;
  }
};

const errors = [];
page.on("pageerror", (e) => errors.push("PAGEERROR " + e.message));
page.on("console", (m) => {
  if (m.type() !== "error") return;
  // Resource failures are reported through the request events below, with the
  // URL attached; the console copy carries no origin to judge them by.
  if (/^Failed to load resource/.test(m.text()) && !sameOrigin(m.location()?.url ?? "")) return;
  errors.push(m.text());
});
page.on("requestfailed", (r) => {
  if (sameOrigin(r.url())) errors.push(`REQUEST FAILED ${r.url()} ${r.failure()?.errorText ?? ""}`);
});
page.on("response", (r) => {
  if (r.status() >= 400 && sameOrigin(r.url())) errors.push(`HTTP ${r.status()} ${r.url()}`);
});

let failures = 0;

for (const map of maps) {
  errors.length = 0;
  await page.goto(`${BASE}/#/m/${map.normalizedName}`, { waitUntil: "load" });
  await page.waitForTimeout(1500);

  await page.getByRole("button", { name: "Layers", exact: true }).first().click();
  await page.getByRole("button", { name: "Everything" }).click();
  await page.waitForTimeout(700);

  const stats = await page.evaluate(() => ({
    markers: document.querySelectorAll(".tk-marker").length,
    canvases: document.querySelectorAll(".leaflet-overlay-pane canvas").length,
    base: !!document.querySelector(".tk-base"),
  }));

  await page.getByRole("button", { name: "Settings", exact: true }).first().click();
  await page.waitForTimeout(200);

  // Exact match: `hasText` is case-insensitive, so a loose filter here picks up
  // any section whose text merely contains "level" rather than the floor switch.
  const levelButtons = page
    .locator("aside section")
    .filter({ has: page.getByText("Level", { exact: true }) })
    .locator("button");
  const floors = await levelButtons.count();
  for (let i = 0; i < floors; i++) {
    await levelButtons.nth(i).click();
    await page.waitForTimeout(250);
  }

  // The style switch only renders when a map ships both kinds of artwork.
  for (const style of map.styles.length > 1 ? map.styles : []) {
    await page
      .locator("aside")
      .getByRole("button", { name: style === "clean" ? "Clean vector" : "Satellite", exact: true })
      .click();
    await page.waitForTimeout(400);
  }

  const why = [!stats.base ? "no base artwork" : null, ...errors.slice(0, 2)].filter(Boolean);
  const bad = why.length > 0;
  if (bad) failures++;
  console.log(
    `${bad ? "FAIL" : "ok  "} ${map.normalizedName.padEnd(20)} ` +
      `markers:${String(stats.markers).padStart(5)} canvas:${stats.canvases} ` +
      `floors:${floors} styles:${map.styles.join("/")} ${why.join(" | ")}`,
  );
}

/*
 * The routes that are not maps.
 *
 * The dashboard, the quest tracker and its walkthrough are two thirds of the
 * app and none is reachable from the loop above, so without this the smoke
 * pass could go green with all three of them throwing on load. They need no
 * interaction to be worth checking: the tracker builds the whole 511-task
 * graph on mount and the wizard resolves every trader, so simply rendering
 * exercises most of what either can get wrong.
 *
 * Checked against a heading rather than a screenful of markup — it is the one
 * thing that cannot be there unless the page got past its data load.
 */
const routes = [
  { hash: "#/", heading: "Know the map. Run the right raid." },
  { hash: "#/welcome", heading: "Know the map. Run the right raid." },
  { hash: "#/dashboard", heading: "Dashboard" },
  { hash: "#/maps", heading: "Maps" },
  { hash: "#/quests", heading: "Quests" },
  { hash: "#/quests/graph", heading: "Quests" },
  { hash: "#/quests/items", heading: "Quests" },
  { hash: "#/quests/setup", heading: "Set up your progress" },
  { hash: "#/hideout", heading: "Hideout" },
  { hash: "#/settings", heading: "Settings" },
];

for (const route of routes) {
  errors.length = 0;
  await page.goto(`${BASE}/${route.hash}`, { waitUntil: "load" });

  let rendered = true;
  try {
    await page
      .getByRole("heading", { level: 1, name: route.heading, exact: true })
      .waitFor({ timeout: 10000 });
  } catch {
    rendered = false;
  }
  await page.waitForTimeout(500);

  const bad = errors.length > 0 || !rendered;
  if (bad) failures++;
  console.log(
    `${bad ? "FAIL" : "ok  "} ${route.hash.padEnd(20)} ` +
      `${rendered ? "rendered" : "NO HEADING"} ${errors.slice(0, 2).join(" | ")}`,
  );
}

/*
 * The two things the map page promises that no static render can prove:
 * that the panels are still there once it is fullscreen, and that the
 * keyboard shortcuts are actually wired to something. Both have been shipped
 * broken before — the shortcut list rendered a table of keys nothing
 * listened for — so they are checked rather than assumed.
 */
{
  errors.length = 0;
  await page.goto(`${BASE}/#/m/customs`, { waitUntil: "load" });
  await page.waitForTimeout(1500);

  const railWidth = () =>
    page.evaluate(() => {
      const rail = document.querySelector("aside");
      return rail ? Math.round(rail.getBoundingClientRect().width) : 0;
    });

  await page.keyboard.press("t");
  await page.waitForTimeout(200);
  const tasksOpen = await page.evaluate(
    () =>
      [...document.querySelectorAll("aside nav button")].find(
        (b) => b.getAttribute("aria-pressed") === "true",
      )?.textContent === "Tasks",
  );

  await page.keyboard.press("[");
  await page.waitForTimeout(350);
  const collapsed = (await railWidth()) === 0;
  await page.keyboard.press("[");
  await page.waitForTimeout(350);
  const restored = (await railWidth()) > 0;

  await page.keyboard.press("f");
  await page.waitForTimeout(600);
  const fullscreenKeepsPanels = await page.evaluate(() => {
    const el = document.fullscreenElement;
    if (!el) return false;
    const rail = document.querySelector("aside");
    // The panels must be inside the element the browser put fullscreen, or
    // they are on screen in the DOM and nowhere at all on the display.
    return !!rail && el.contains(rail) && rail.getBoundingClientRect().width > 0;
  });
  await page.keyboard.press("f");
  await page.waitForTimeout(400);

  const checks = { tasksOpen, collapsed, restored, fullscreenKeepsPanels };
  const bad = errors.length > 0 || Object.values(checks).some((v) => !v);
  if (bad) failures++;
  console.log(
    `${bad ? "FAIL" : "ok  "} ${"map shortcuts".padEnd(20)} ` +
      Object.entries(checks)
        .map(([k, v]) => `${k}:${v ? "y" : "N"}`)
        .join(" ") +
      ` ${errors.slice(0, 2).join(" | ")}`,
  );
}

console.log(failures ? `\n${failures} check(s) failed` : "\nall maps and routes ok");
await browser.close();
process.exit(failures ? 1 : 0);
