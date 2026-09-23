import assert from "node:assert/strict";
import { test } from "node:test";
import { requested } from "../api/data/[...path].js";

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

test("the router's own answer still wins where it gives one", () => {
  assert.equal(
    requested({ url: "/ignored", query: { path: ["maps", "woods.json"] } }),
    "maps/woods.json",
  );
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
