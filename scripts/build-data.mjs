/**
 * Build the site's data payloads into public/data.
 *
 *   node scripts/build-data.mjs
 *
 * The pipeline itself lives in scripts/lib/build-data-core.mjs, because the
 * live endpoint (api/data.js) runs exactly the same code against an
 * in-memory filesystem. What this file produces is the *fallback*: the copy
 * that ships inside the bundle and gets served when the live endpoint is not
 * reachable — a static host with no functions, an upstream outage, a cold
 * start that timed out. It is not what a healthy deploy serves.
 *
 * Env:
 *   TK_ALLOW_SPARSE_TASKS=1  accept a feed that looks broken rather than
 *                            refusing to overwrite the last good data.
 */
import process from "node:process";
import { buildData, SparseFeedError } from "./lib/build-data-core.mjs";

try {
  await buildData({ allowSparse: Boolean(process.env.TK_ALLOW_SPARSE_TASKS) });
} catch (err) {
  if (err instanceof SparseFeedError) {
    console.error(`\n${err.message}`);
    process.exit(1);
  }
  throw err;
}
