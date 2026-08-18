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
 * The `.wasm.js` single-file builds, LSTM only.
 *
 * Two things here are easy to get wrong, and I got both wrong first time. The
 * worker only ever requests `.wasm.js` — never the bare `.js` plus its sibling
 * `.wasm` — and those files embed the binary as base64 rather than fetching it,
 * so nothing else has to be staged beside them. And it picks between three
 * instruction-set builds by feature detection at load time, so all three have
 * to be present even though any one browser fetches exactly one of them.
 *
 * `-lstm` because the worker is started with oem 1. The builds carrying the
 * legacy engine as well are considerably larger for a recogniser never asked
 * for.
 *
 * That makes this ~12MB on disk and ~4MB over the wire, once, per browser.
 */
const CORE = [
  "tesseract-core-relaxedsimd-lstm.wasm.js",
  "tesseract-core-simd-lstm.wasm.js",
  "tesseract-core-lstm.wasm.js",
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
