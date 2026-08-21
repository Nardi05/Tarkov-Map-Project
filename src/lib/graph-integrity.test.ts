import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { test } from "node:test";
import { auditGraph } from "../../scripts/graph-audit.mjs";

/**
 * The shipped task graph, held to the invariants a progression has to satisfy
 * to be usable at all.
 *
 * These run against `public/data/progression.json` — the file the site
 * actually serves — rather than a fixture, because the failure being guarded
 * against is a *data* regression: `npm run data` re-fetches on every deploy,
 * so a bad hour upstream, or a scrape that got rate-limited half way through,
 * becomes the live site. None of that shows up in a type check.
 *
 * The thresholds are deliberately the current values and not round numbers. A
 * build that makes any of them worse should have to say so in a diff.
 */

const graph = JSON.parse(
  fs.readFileSync(path.join(process.cwd(), "public", "data", "progression.json"), "utf8"),
);
const report = auditGraph(graph);

test("no prerequisite points at a task that is not in the graph", () => {
  // A dangling edge is silently un-satisfiable, so it locks its task forever.
  assert.deepEqual(report.dangling, []);
});

test("no task requires itself", () => {
  assert.deepEqual(report.selfReferences, []);
});

test("no prerequisite cycles", () => {
  // Every member of a cycle is permanently locked, and the build breaks the
  // ones its own task-merging introduces — so any left here are upstream's.
  assert.deepEqual(
    report.cycles.map((c) => c.join(" -> ")),
    [],
  );
});

test("every task can be reached by some player", () => {
  /*
   * The whole point of the graph. A task nothing can ever open is invisible on
   * every page of the site while looking perfectly normal in the data — the
   * one defect no other check catches.
   *
   * Declared failures count as reachable: `Hot Wheels - Let's Try Again` is
   * offered exactly when you fail `Hot Wheels`, and six more tasks sit behind
   * that branch. They were unreachable until the site learned to say "failed".
   */
  assert.deepEqual(
    report.stranded.map((t) => t.name),
    [],
  );
});

test("every Kappa task can be reached", () => {
  // Stricter in consequence than the check above: an unreachable Kappa task
  // makes the container itself unobtainable according to our own data.
  assert.deepEqual(
    report.kappaStranded.map((t) => t.name),
    [],
  );
});

test("no two tasks are indistinguishable in the same mode", () => {
  /*
   * Two rows with the same name, trader and faction cannot be told apart, and
   * ticking one is a coin flip. Upstream's English dictionary answers three of
   * the four Prestige quests with the German "Neuanfang"; the build rebuilds
   * those names from the feed's own slugs. Faction is excluded because the
   * USEC and BEAR cuts of Textile and Drip-Out share a name on purpose and the
   * UI prints a chip for it.
   */
  assert.deepEqual(
    report.duplicates.map((d) => `${d.mode}: ${d.name}`),
    [],
  );
});

test("task names carry no stray whitespace", () => {
  /*
   * Not cosmetic. "Arena Business [PVP ZONE]" arrived with a trailing newline:
   * the zone suffix is matched at end-of-string, the wiki is asked for a page
   * by that title, and edges from other quests are matched by name — so one
   * invisible character cost that quest its wiki page and cost
   * "Balancing - Part 1" the edge pointing at it.
   */
  const names = Object.values(graph.tasks as Record<string, { name: string }>).map((t) => t.name);
  const dirty = names.filter((n) => n !== n.trim() || /\s{2,}|[\n\r\t]/.test(n));
  assert.deepEqual(dirty, []);
});

test("the graph is big enough to be a real wipe", () => {
  // A thin build is the failure mode `npm run data` guards against; this is the
  // last line of defence if that guard is ever loosened.
  assert.ok(report.tasks > 450, `only ${report.tasks} tasks`);
  assert.ok(report.edges > 300, `only ${report.edges} prerequisite edges`);
  assert.ok(report.chainDepth > 10, `longest chain is only ${report.chainDepth}`);
});

test("most tasks are gated by something", () => {
  /*
   * A task with no prerequisite, no level and no loyalty gate reads as
   * available from the first minute of a wipe. Some genuinely are; several
   * hundred would mean the feed dropped its prerequisites and the tracker is
   * telling everybody they can do everything.
   */
  assert.ok(
    report.ungated < report.tasks * 0.2,
    `${report.ungated} of ${report.tasks} tasks have nothing gating them`,
  );
});
