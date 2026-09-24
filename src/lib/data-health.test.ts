import assert from "node:assert/strict";
import { test } from "node:test";
import { STALE_SNAPSHOT_DAYS, dataHealth, formatWhen } from "./data-health.ts";

const NOW = Date.parse("2026-09-24T12:00:00Z");
const base = { source: "live" as const, generated: "2026-09-24T07:29:00Z", problem: null, degraded: false };

test("a fresh live build is healthy and says nothing", () => {
  assert.deepEqual(dataHealth(base, NOW), { level: "ok", title: "", detail: null });
});

test("nothing is said before the first payload lands", () => {
  assert.equal(dataHealth({ ...base, source: null }, NOW).level, "ok");
});

test("a failed upstream rebuild is never silent, and names the last good copy", () => {
  const h = dataHealth(
    { ...base, source: "snapshot", problem: { kind: "upstream", detail: "tarkov.dev could not be reached" } },
    NOW,
  );
  assert.equal(h.level, "warn");
  assert.match(h.title, /failed to update/);
  assert.match(h.title, new RegExp(formatWhen(base.generated)!));
  assert.equal(h.detail, "tarkov.dev could not be reached");
});

test("an unreachable live endpoint is never silent", () => {
  const h = dataHealth({ ...base, source: "snapshot", problem: { kind: "endpoint", detail: "HTTP 500" } }, NOW);
  assert.equal(h.level, "warn");
  assert.match(h.title, /could not be reached/);
});

test("a thin feed is flagged even when the build itself succeeded", () => {
  const h = dataHealth({ ...base, degraded: true }, NOW);
  assert.equal(h.level, "warn");
  assert.match(h.title, /incomplete/);
});

test("a failure outranks a thin feed", () => {
  const h = dataHealth(
    { ...base, degraded: true, problem: { kind: "endpoint", detail: null } },
    NOW,
  );
  assert.match(h.title, /could not be reached/);
});

test("a static host's snapshot is fine while recent, and flagged once it is old", () => {
  const recent = { ...base, source: "snapshot" as const };
  assert.equal(dataHealth(recent, NOW).level, "ok");
  const old = new Date(NOW - (STALE_SNAPSHOT_DAYS + 1) * 86_400_000).toISOString();
  const h = dataHealth({ ...recent, generated: old }, NOW);
  assert.equal(h.level, "warn");
  assert.match(h.title, /4 days old/);
});

test("a missing or broken timestamp still produces a readable warning", () => {
  const h = dataHealth({ ...base, generated: "nonsense", problem: { kind: "upstream", detail: null } }, NOW);
  assert.match(h.title, /showing the last good copy\.$/);
  assert.equal(formatWhen(null), null);
});
