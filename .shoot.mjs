import { chromium } from "playwright";
const OUT = "/tmp/claude-0/-home-user-Tarkov-Map-Project/0ea27c97-ec09-526d-8323-96d2c2534092/scratchpad/shots";
const BASE = "http://localhost:4173";
const VIEWS = {
  small: { width: 360, height: 740, isMobile: true, hasTouch: true, deviceScaleFactor: 2 },
  phone: { width: 390, height: 844, isMobile: true, hasTouch: true, deviceScaleFactor: 2 },
  tablet: { width: 820, height: 1180, isMobile: true, hasTouch: true, deviceScaleFactor: 1 },
  wide: { width: 1024, height: 768 },
  desktop: { width: 1440, height: 900 },
};
const ROUTES = (process.env.TK_ROUTES || "dash:#/,maps:#/maps,quests:#/quests,map:#/m/customs,setup:#/quests/setup")
  .split(",").map(s => s.split(":")).map(([a, ...b]) => [a, b.join(":")]);
const SCROLLS = (process.env.TK_SCROLL || "0").split(",").map(Number);
const browser = await chromium.launch({ executablePath: "/opt/pw-browsers/chromium" });
const which = process.argv[2] ? process.argv[2].split(",") : Object.keys(VIEWS);
for (const name of which) {
  const ctx = await browser.newContext({ viewport: { width: VIEWS[name].width, height: VIEWS[name].height }, ...VIEWS[name] });
  const page = await ctx.newPage();
  const errs = [];
  page.on("pageerror", (e) => errs.push("PAGEERROR " + e.message));
  page.on("console", (m) => m.type() === "error" && !/insights|fonts.googleapis|ERR_CONNECTION_RESET|Failed to load resource/.test(m.text()) && errs.push(m.text()));
  for (const [label, hash] of ROUTES) {
    await page.goto("about:blank");
    await page.goto(`${BASE}/${hash}`, { waitUntil: "load" });
    await page.waitForTimeout(2200);
    const over = await page.evaluate(() => {
      const bad = [];
      const w = document.documentElement.clientWidth;
      for (const el of document.querySelectorAll("body *")) {
        const r = el.getBoundingClientRect();
        if (r.width === 0 || r.height === 0) continue;
        if (r.right > w + 1 || r.left < -1) bad.push(`${el.tagName}.${(el.className || "").toString().split(" ").slice(0,2).join(".")} L${Math.round(r.left)} R${Math.round(r.right)}`);
      }
      return [...new Set(bad)].slice(0, 6);
    });
    if (over.length) console.log(`  OVERFLOW ${name}/${label}:`, over.join(" | "));
    for (const y of SCROLLS) {
      if (y) await page.evaluate((y) => { const el = document.querySelector(".page.scroll-y") || document.scrollingElement; el.scrollTop = y; }, y);
      await page.waitForTimeout(300);
      await page.screenshot({ path: `${OUT}/${name}-${label}${y ? "-" + y : ""}.png` });
    }
  }
  console.log(name, errs.length ? "ERRORS: " + errs.slice(0, 4).join(" | ") : "clean");
  await ctx.close();
}
await browser.close();
