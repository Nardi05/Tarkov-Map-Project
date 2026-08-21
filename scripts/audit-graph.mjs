/**
 * Structural audit of the task graph.
 *
 *   npm run audit-graph
 *   npm run audit-graph -- --json     machine-readable, for a diff between builds
 *
 * `check-quests.mjs` asks whether our *facts* match the wiki — trader, level,
 * Kappa. This asks a different and cheaper question: whether the graph we ship
 * is a coherent progression at all. It needs no network, so it can run on every
 * build and in the tests.
 *
 * The headline check is the playthrough. Start from nothing, repeatedly finish
 * everything the engine says is available, and see how far you get. A task the
 * simulation can never reach is one no player can ever be told to do — the most
 * expensive kind of graph bug, because nothing else surfaces it: the task looks
 * perfectly normal sitting in the file, and simply never appears in the UI.
 *
 * Everything here is a *finding*, not necessarily a defect. Upstream data is
 * genuinely incomplete in places, and the honest thing is to count it rather
 * than to pretend. `--json` output plus the thresholds in graph-audit.test.ts
 * are what turn a count into a regression gate.
 */
import fs from "node:fs";
import path from "node:path";
import process from "node:process";
import { fileURLToPath } from "node:url";
import { auditGraph, formatReport } from "./graph-audit.mjs";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const FILE = path.join(ROOT, "public", "data", "progression.json");

if (!fs.existsSync(FILE)) {
  console.error(`No graph at ${FILE}. Run \`npm run data\` first.`);
  process.exit(1);
}

const graph = JSON.parse(fs.readFileSync(FILE, "utf8"));
const report = auditGraph(graph);

if (process.argv.includes("--json")) {
  console.log(JSON.stringify(report, null, 2));
} else {
  console.log(formatReport(report, graph));
}

// The two findings that are always defects rather than thin data: an edge that
// points at nothing, and a loop that locks its own members out forever.
process.exit(report.dangling.length || report.cycles.length ? 1 : 0);
