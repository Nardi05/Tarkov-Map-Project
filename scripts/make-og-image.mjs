/**
 * Draws the social preview card, public/og.png.
 *
 *   npm run og
 *
 * Not part of the build: it needs a browser, it changes only when the pitch
 * changes, and a deploy should not depend on Chromium being installable. The
 * output is committed like the other generated-but-stable assets.
 *
 * Written as SVG and rasterised, rather than hand-drawn in canvas, because the
 * card is a piece of design that wants to be read and edited as markup.
 */
import fs from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { chromium } from "playwright";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");

/* 1200x630 is what every card renderer crops to. */
const HTML = `<!doctype html><html><head><meta charset="utf-8"><style>
  @font-face { font-family: dummy; src: local("Arial"); }
  * { margin: 0; box-sizing: border-box; }
  body {
    width: 1200px; height: 630px; display: flex; flex-direction: column;
    justify-content: center; padding: 0 88px; background: #0a0d11;
    font-family: Inter, "Helvetica Neue", Arial, sans-serif; color: #e7edf3;
    background-image:
      radial-gradient(1100px 520px at 88% -12%, rgba(201,178,135,.16), transparent 62%),
      linear-gradient(#0a0d11, #070a0e);
  }
  .kicker { color:#c9b287; font-size:23px; letter-spacing:.22em; font-weight:700; }
  h1 { font-size:88px; line-height:1.02; letter-spacing:-.022em; margin:22px 0 0; font-weight:650; }
  p  { color:#9aa7b4; font-size:29px; line-height:1.45; margin:26px 0 0; max-width:820px; }
  .row { display:flex; gap:13px; margin-top:44px; flex-wrap:wrap; }
  .chip { border:1px solid #263041; background:#10151b; color:#c2ccd8;
          border-radius:999px; padding:11px 21px; font-size:22px; }
  .marks { position:absolute; right:74px; bottom:64px; display:flex; gap:20px; opacity:.95; }
</style></head><body>
  <div class="kicker">ESCAPE FROM TARKOV</div>
  <h1>Interactive maps<br/>&amp; quest tracker</h1>
  <p>Spawns, extracts, keys and every task objective — and a tracker that puts your own
     quests on the map without being asked.</p>
  <div class="row">
    <span class="chip">13 maps</span>
    <span class="chip">511 tasks</span>
    <span class="chip">PvP &amp; PvE</span>
    <span class="chip">Progress stays on your machine</span>
  </div>
  <div class="marks">
    <svg width="76" height="76" viewBox="0 0 24 24"><path d="M12 1.6 22.4 12 12 22.4 1.6 12Z"
      fill="#22c55e" stroke="rgba(6,10,15,.75)" stroke-width="2"/></svg>
    <svg width="76" height="76" viewBox="0 0 24 24"><rect x="2.4" y="2.4" width="19.2" height="19.2"
      rx="5" fill="#4c8dff" stroke="rgba(6,10,15,.75)" stroke-width="2"/>
      <path d="M13.4 6.6H8.2c-.7 0-1.2.5-1.2 1.2v8.4c0 .7.5 1.2 1.2 1.2h5.2M12.6 12h5.2m-2.2-2.6L18.4 12l-2.8 2.6"
      fill="none" stroke="#fff" stroke-width="1.9" stroke-linecap="round" stroke-linejoin="round"/></svg>
    <svg width="76" height="76" viewBox="0 0 24 24"><circle cx="12" cy="12" r="10" fill="#ef4444"
      stroke="rgba(6,10,15,.75)" stroke-width="2"/>
      <path d="M12 5.6c-3.5 0-5.9 2.3-5.9 5.4 0 1.9.9 3 1.9 3.7v1.8c0 .8.6 1.4 1.4 1.4h5.2c.8 0 1.4-.6 1.4-1.4v-1.8c1-.7 1.9-1.8 1.9-3.7 0-3.1-2.4-5.4-5.9-5.4Z"
      fill="#fff"/><circle cx="9.7" cy="11.2" r="1.7" fill="#ef4444"/>
      <circle cx="14.3" cy="11.2" r="1.7" fill="#ef4444"/></svg>
  </div>
</body></html>`;

const browser = await chromium.launch({
  ...(process.env.TK_CHROMIUM ? { executablePath: process.env.TK_CHROMIUM } : {}),
});
const page = await browser.newPage({ viewport: { width: 1200, height: 630 } });
await page.setContent(HTML, { waitUntil: "load" });
await page.screenshot({ path: path.join(ROOT, "public", "og.png") });
await browser.close();

const size = (await fs.stat(path.join(ROOT, "public", "og.png"))).size;
console.log(`Wrote public/og.png (${(size / 1024).toFixed(0)}KB)`);
