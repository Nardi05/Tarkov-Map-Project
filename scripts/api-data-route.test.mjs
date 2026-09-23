import assert from "node:assert/strict";
import { test } from "node:test";
import { requested } from "../api/data.js";

/**
 * Which payload a request is asking for.
 *
 * Worth its own tests because the deployed answer and the local answer were
 * different for a week and nothing said so: `req.query.path` is populated under
 * Vite's middleware and empty on Vercel, so every live request 404'd and the
 * site quietly served the build-time snapshot instead — the exact failure the
 * live endpoint exists to prevent. A route that is only exercised in
 * production is one that needs a test that is not.
 */

test("a shared payload is found from the URL alone", () => {
  assert.equal(requested({ url: "/api/data/index.json" }), "index.json");
  assert.equal(requested({ url: "/api/data/progression.json" }), "progression.json");
});

test("a query string does not become part of the filename", () => {
  assert.equal(requested({ url: "/api/data/index.json?_vercel_share=abc" }), "index.json");
  assert.equal(requested({ url: "/api/data/index.json#frag" }), "index.json");
});

test("per-map payloads are two segments under maps/", () => {
  assert.equal(requested({ url: "/api/data/maps/customs.json" }), "maps/customs.json");
});

test("a rewrite that moves the path into a query param still resolves", () => {
  // What `/api/data/:path*` -> `/api/data?path=:path*` hands the function.
  assert.equal(requested({ url: "/api/data", query: { path: "maps/woods.json" } }), "maps/woods.json");
  assert.equal(requested({ url: "/api/data", query: { path: "index.json" } }), "index.json");
});

test("and so does a catch-all route handing over an array", () => {
  assert.equal(
    requested({ url: "/api/data", query: { path: ["maps", "woods.json"] } }),
    "maps/woods.json",
  );
});

test("the URL wins over the query when both say something", () => {
  // A direct request is the truth; the query is only how a rewrite relays it.
  assert.equal(
    requested({ url: "/api/data/index.json", query: { path: "maps/woods.json" } }),
    "index.json",
  );
});

test("a rewritten traversal is refused too", () => {
  assert.equal(requested({ url: "/api/data", query: { path: "maps/../index.json" } }), null);
  assert.equal(requested({ url: "/api/data", query: { path: "../../etc/passwd" } }), null);
});

test("the directory itself is not a payload", () => {
  assert.equal(requested({ url: "/api/data" }), null);
  assert.equal(requested({ url: "/api/data/" }), null);
});

test("traversal is refused rather than normalised away", () => {
  // `new URL` resolves `..` before you can look at it, which is why the path is
  // split by hand — a guard that cannot see what it guards against is not one.
  assert.equal(requested({ url: "/api/data/../../etc/passwd" }), null);
  assert.equal(requested({ url: "/api/data/maps/../index.json" }), null);
  assert.equal(requested({ url: "/api/data/%2e%2e/index.json" }), null);
});

test("anything not on the allowlist is refused", () => {
  assert.equal(requested({ url: "/api/data/secrets.json" }), null);
  assert.equal(requested({ url: "/api/data/maps/customs.json/extra" }), null);
  assert.equal(requested({ url: "/api/data/maps/customs.txt" }), null);
});
