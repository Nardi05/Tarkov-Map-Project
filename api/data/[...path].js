/**
 * The live data endpoint.
 *
 * Everything this serves is rebuilt from tarkov.dev on request, so the site
 * shows what the game shipped today rather than what it had shipped the last
 * time somebody pushed a commit. Before this existed, `public/data` was baked
 * during `vercel build` and then frozen: a deploy from three weeks ago served
 * three-week-old quests, and the only way to correct it was another deploy.
 *
 * How it stays cheap
 * ------------------
 * The pipeline is not run per visitor. Three layers sit in front of it:
 *
 *   1. The CDN. `s-maxage=86400` means Vercel's edge answers for a day and
 *      only one request per region per day reaches this function at all.
 *      `stale-while-revalidate` means even that one is served from cache while
 *      the rebuild happens behind it, so nobody ever waits on tarkov.dev.
 *   2. The instance. A warm function keeps the built payloads for an hour, so
 *      the thirteen map files and the four shared ones cost one pipeline run
 *      between them, not seventeen.
 *   3. The browser. `max-age` is short but not zero, so a reload during a
 *      session does not go back to the network for every map.
 *
 * When it can't
 * -------------
 * If tarkov.dev is down, or the feed comes back too thin to trust, the build
 * throws and this serves the snapshot committed in `public/data` instead —
 * the one `npm run data` lays down at build time. That is what that build step
 * is still for. The response says which one you got in `x-tk-source`, the site
 * shows it, and a stale answer beats an empty map.
 */
import path from "node:path";
import nodeFs from "node:fs/promises";
import { fileURLToPath } from "node:url";
import { buildData } from "../../scripts/lib/build-data-core.mjs";
import { overlayFs } from "../../scripts/lib/overlay-fs.mjs";

/** How long a warm instance reuses one build before rebuilding. */
const INSTANCE_TTL_MS = 60 * 60 * 1000;

/** How long the CDN may serve a build before it asks for a new one. */
const EDGE_TTL_S = 24 * 60 * 60;

/**
 * The payloads the site asks for. An allowlist rather than a path join, so a
 * request cannot walk out of the data directory.
 */
const SHARED = new Set([
  "index.json",
  "progression.json",
  "items.json",
  "hideout.json",
  "kord-season.json",
  "task-images.json",
]);

/**
 * The repository root as it exists wherever this is running.
 *
 * Locally that is two directories up. In a deployed function the bundle is
 * rooted at the project, and `includeFiles` in vercel.json puts the vendored
 * inputs back at the same relative paths — but the function file itself may
 * have been moved, so the location is confirmed by looking for a file that
 * only the root has rather than assumed.
 */
let rootPromise = null;
function findRoot() {
  rootPromise ??= (async () => {
    const here = path.dirname(fileURLToPath(import.meta.url));
    const candidates = [
      path.resolve(here, "..", ".."),
      process.cwd(),
      path.resolve(process.cwd(), ".."),
      "/var/task",
    ];
    for (const dir of candidates) {
      try {
        await nodeFs.access(path.join(dir, "src", "data", "geo.json"));
        return dir;
      } catch {
        /* try the next one */
      }
    }
    // Nothing to build from. The snapshot path below will fail too, and the
    // handler turns that into a 503 rather than a blank map.
    return path.resolve(here, "..", "..");
  })();
  return rootPromise;
}

/** @type {{ at: number, files: Map<string, Buffer|string>, generated: string } | null} */
let cached = null;
/** @type {Promise<typeof cached> | null} */
let inFlight = null;

async function build() {
  const root = await findRoot();
  const out = path.join(root, "public", "data");
  const fs = overlayFs(nodeFs);
  const result = await buildData({ fs, root, out });
  return { at: Date.now(), files: fs.written(out), generated: result.generated };
}

async function payloads() {
  if (cached && Date.now() - cached.at < INSTANCE_TTL_MS) return cached;
  // One rebuild at a time. Without this, a burst of map requests into a cold
  // instance would each start their own 29MB download.
  inFlight ??= build()
    .then((built) => {
      cached = built;
      return built;
    })
    .finally(() => {
      inFlight = null;
    });
  return inFlight;
}

/** The build-time snapshot, for when the live build cannot be had. */
async function snapshot(file) {
  const root = await findRoot();
  return nodeFs.readFile(path.join(root, "public", "data", file));
}

/**
 * Which payload was asked for, read off the URL rather than the router.
 *
 * This used to trust `req.query.path`, which is what a catch-all route is
 * supposed to give you. Deployed, it was empty — every request answered "No
 * such data file" while the same handler served fine under Vite — so the
 * feature silently fell back to the build-time snapshot in production, which
 * is exactly the thing it exists to avoid.
 *
 * The path is in the URL on every runtime, so it is taken from there and the
 * router's helpers are not depended on at all.
 */
export function requested(req) {
  const raw = req?.query?.path;
  let segments = Array.isArray(raw) ? raw : raw ? [raw] : [];

  if (!segments.length) {
    /*
     * Split the query off by hand rather than parsing with `new URL`, which
     * resolves `..` before returning — so `/api/data/maps/../index.json` would
     * arrive here already flattened and the traversal check below would have
     * nothing left to reject. The allowlist would still have caught it, but a
     * guard that cannot see what it is guarding against is not a guard.
     */
    const pathname = (req.url ?? "/").split(/[?#]/)[0];
    const after = pathname.replace(/^\/+api\/+data\/*/, "");
    segments = after.split("/").filter(Boolean).map(decodeURIComponent);
  }

  if (!segments.length) return null;
  if (segments.some((s) => !/^[A-Za-z0-9._-]+$/.test(s) || s === "." || s === "..")) return null;
  const file = segments.join("/");
  if (SHARED.has(file)) return file;
  if (segments.length === 2 && segments[0] === "maps" && file.endsWith(".json")) return file;
  return null;
}

export default async function handler(req, res) {
  const file = requested(req);
  if (!file) {
    res.setHeader("Cache-Control", "public, max-age=3600");
    return res.status(404).json({ error: "No such data file." });
  }

  res.setHeader("Content-Type", "application/json; charset=utf-8");

  try {
    const built = await payloads();
    const body = built.files.get(file);
    if (body == null) {
      res.setHeader("Cache-Control", "public, max-age=3600");
      return res.status(404).json({ error: "No such data file." });
    }
    res.setHeader(
      "Cache-Control",
      `public, max-age=600, s-maxage=${EDGE_TTL_S}, stale-while-revalidate=${EDGE_TTL_S * 7}`,
    );
    res.setHeader("x-tk-source", "live");
    res.setHeader("x-tk-generated", built.generated);
    return res.status(200).send(typeof body === "string" ? body : Buffer.from(body));
  } catch (err) {
    console.error(`live build failed for ${file}:`, err);
    try {
      const body = await snapshot(file);
      // Short edge cache on the fallback: the next request should try the live
      // build again rather than pinning a whole day to an outage.
      res.setHeader("Cache-Control", "public, max-age=60, s-maxage=300");
      res.setHeader("x-tk-source", "snapshot");
      return res.status(200).send(body);
    } catch {
      res.setHeader("Cache-Control", "no-store");
      return res.status(503).json({ error: "Game data is temporarily unavailable." });
    }
  }
}
