/**
 * End-to-end smoke test. Opens every map against a running preview server,
 * turns on every layer, walks every floor and every artwork style, and fails
 * if any map logs a console error or renders no base artwork.
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

const errors = [];
page.on("pageerror", (e) => errors.push("PAGEERROR " + e.message));
page.on("console", (m) => m.type() === "error" && errors.push(m.text()));

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

  const bad = errors.length > 0 || !stats.base;
  if (bad) failures++;
  console.log(
    `${bad ? "FAIL" : "ok  "} ${map.normalizedName.padEnd(20)} ` +
      `markers:${String(stats.markers).padStart(5)} canvas:${stats.canvases} ` +
      `floors:${floors} styles:${map.styles.join("/")} ${errors.slice(0, 2).join(" | ")}`,
  );
}

console.log(failures ? `\n${failures} map(s) failed` : "\nall maps ok");
await browser.close();
process.exit(failures ? 1 : 0);
