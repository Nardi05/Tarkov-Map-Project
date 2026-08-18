/**
 * Stages the OCR runtime into public/ocr/ so screenshot import needs no CDN.
 *
 *   node scripts/setup-ocr.mjs
 *
 * Runs as part of `npm run build` and `npm run dev`. Tesseract.js fetches its
 * worker, its wasm core and its language model at runtime, and by default it
 * fetches all three from unpkg — which would mean this site quietly depending
 * on a third party staying up, the exact arrangement dropping TarkovTracker
 * was meant to end.
 *
 * The wasm and the worker come out of node_modules, which is present on any
 * machine that can build the site at all. The language model ships in no
 * package, so it is committed to data/ alongside the wiki cache and the task
 * screenshots — same rule: a deploy must not depend on somebody else's server.
 *
 * public/ocr is generated and gitignored. Only the ~2MB model is in the
 * repository; the ~6MB of wasm is copied from node_modules on each build.
 * Note that scripts/build-data.mjs wipes public/data, not public/ocr.
 */
import fs from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const OUT = path.join(ROOT, "public", "ocr");

/*
 * LSTM cores only. Tesseract ships four builds — with and without SIMD, each
 * with and without the legacy engine — and the legacy pair is roughly 600KB
 * larger apiece for a recogniser we never ask for. Both of the SIMD/non-SIMD
 * pair are needed: tesseract.js feature-detects between them at runtime.
 */
const CORE = [
  "tesseract-core-simd-lstm.js",
  "tesseract-core-simd-lstm.wasm",
  "tesseract-core-lstm.js",
  "tesseract-core-lstm.wasm",
];

await fs.rm(OUT, { recursive: true, force: true });
await fs.mkdir(OUT, { recursive: true });

let bytes = 0;
async function copy(from, to) {
  try {
    await fs.copyFile(from, to);
  } catch (err) {
    throw new Error(
      `OCR asset missing: ${path.relative(ROOT, from)} — run npm install. (${err.message})`,
    );
  }
  bytes += (await fs.stat(to)).size;
}

for (const file of CORE) {
  await copy(path.join(ROOT, "node_modules", "tesseract.js-core", file), path.join(OUT, file));
}
await copy(
  path.join(ROOT, "node_modules", "tesseract.js", "dist", "worker.min.js"),
  path.join(OUT, "worker.min.js"),
);
await copy(path.join(ROOT, "data", "eng.traineddata.gz"), path.join(OUT, "eng.traineddata.gz"));

console.log(
  `OCR runtime staged in public/ocr (${(bytes / 1048576).toFixed(1)}MB, fetched only on demand)`,
);
