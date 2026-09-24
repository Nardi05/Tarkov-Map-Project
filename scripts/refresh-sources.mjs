/**
 * Refresh every live data source, then rebuild the site payloads.
 *
 *   node scripts/refresh-sources.mjs
 *
 * Tarkov.dev JSON is required (maps, tasks, items, hideout). Wiki scrapes
 * (quest and key detail, quest prereqs, Kord documents, task screenshots,
 * task-facts) are best-effort:
 * a down wiki keeps the last committed file so a deploy still ships.
 *
 * Set TK_SKIP_WIKI=1 to skip the wiki and only rebuild from tarkov.dev.
 */
import { spawn } from "node:child_process";
import fs from "node:fs/promises";
import path from "node:path";
import process from "node:process";
import { fileURLToPath } from "node:url";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const skipWiki = process.env.TK_SKIP_WIKI === "1";

function run(script, args = [], { required = false } = {}) {
  return new Promise((resolve, reject) => {
    const child = spawn(process.execPath, [path.join("scripts", script), ...args], {
      cwd: ROOT,
      stdio: "inherit",
      env: process.env,
    });
    child.on("error", reject);
    child.on("exit", (code) => {
      const status = code ?? 1;
      if (status !== 0 && required) {
        reject(new Error(`${script} exited ${status}`));
        return;
      }
      if (status !== 0) console.warn(`  ! ${script} exited ${status} — keeping the previous file`);
      resolve(status);
    });
  });
}

if (!skipWiki) {
  console.log("Refreshing wiki sources…");
  await run("fetch-kord-documents.mjs");
  // Batched page fetch first; the prerequisite scrape then reads its cache.
  const details = await run("fetch-wiki-details.mjs", ["--refresh"]);
  await run("fetch-quest-prereqs.mjs", details === 0 ? [] : ["--refresh"]);
} else {
  console.log("TK_SKIP_WIKI=1 — using committed wiki snapshots");
}

await run("build-data.mjs", [], { required: true });

if (!skipWiki) {
  await run("fetch-task-images.mjs");
  try {
    await fs.copyFile(
      path.join(ROOT, "data", "task-images.json"),
      path.join(ROOT, "public", "data", "task-images.json"),
    );
  } catch {
    /* optional */
  }
  await run("build-task-facts.mjs");
}
