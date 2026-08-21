/**
 * The audit itself, kept apart from the CLI so the tests can call it.
 *
 * Pure: it takes a parsed progression graph and returns findings. No fetching,
 * no file system, no clock — so a failure is always about the data and never
 * about the machine it ran on.
 */

const ZONE_TAG = /\s*\[(PVP ZONE|PVE ZONE|KORD BREACH)\]\s*$/i;

/** The suffix the 1.1 split added, stripped the way the UI strips it. */
export const displayName = (name) => name.replace(ZONE_TAG, "").replace(/\s+/g, " ").trim();

/** Which character a task belongs to; null means every one of them. */
export function zoneOf(name) {
  const match = name.match(ZONE_TAG);
  if (!match) return null;
  const tag = match[1].toUpperCase();
  return tag === "PVE ZONE" ? "pve" : tag === "KORD BREACH" ? "season" : "pvp";
}

/**
 * Whether a requirement is one the player can ever satisfy here.
 *
 * "failed" is satisfiable only when the caller says the player is allowed to
 * declare one. Both runs matter: without failures is what somebody who only
 * ticks things off sees, and with them is whether the task is reachable at all.
 */
export function satisfiable(requirement, { allowFailures = false } = {}) {
  return requirement.status.some((s) => {
    const n = String(s).toLowerCase();
    if (n.startsWith("complet") || n === "active") return true;
    return allowFailures && n.startsWith("fail");
  });
}

/**
 * Plays the graph forward from an empty profile at max level.
 *
 * Level, faction and trader loyalty are all deliberately ignored: this is
 * asking whether the *shape* of the graph lets every task be reached, not
 * whether a particular player can reach it today. A task that only a level gate
 * holds back is fine; one that no amount of finishing other tasks will ever
 * open is not.
 */
export function reachable(tasks, options = {}) {
  const done = new Set();
  const ids = Object.keys(tasks);

  let moved = true;
  const waves = [];
  while (moved) {
    moved = false;
    const wave = [];
    for (const id of ids) {
      if (done.has(id)) continue;
      const sets = tasks[id].requires ?? [];
      const open =
        sets.length === 0 ||
        sets.some((set) => set.every((req) => satisfiable(req, options) && done.has(req.task)));
      if (open) wave.push(id);
    }
    if (wave.length) {
      for (const id of wave) done.add(id);
      waves.push(wave);
      moved = true;
    }
  }

  return { done, waves, stranded: ids.filter((id) => !done.has(id)) };
}

/** Every cycle among prerequisite edges, as lists of task ids. */
export function findCycles(tasks) {
  const edges = new Map();
  for (const [id, task] of Object.entries(tasks)) {
    const out = new Set();
    for (const set of task.requires ?? []) {
      for (const req of set) if (tasks[req.task]) out.add(req.task);
    }
    edges.set(id, [...out]);
  }

  const cycles = [];
  const state = new Map(); // id -> "open" | "closed"
  const stack = [];

  const walk = (id) => {
    state.set(id, "open");
    stack.push(id);
    for (const next of edges.get(id) ?? []) {
      if (state.get(next) === "open") {
        cycles.push(stack.slice(stack.indexOf(next)).concat(next));
      } else if (!state.has(next)) {
        walk(next);
      }
    }
    stack.pop();
    state.set(id, "closed");
  };

  for (const id of edges.keys()) if (!state.has(id)) walk(id);
  return cycles;
}

export function auditGraph(graph) {
  const tasks = graph.tasks ?? {};
  const ids = Object.keys(tasks);

  /* --- edges that point at nothing ------------------------------------- */
  const dangling = [];
  const selfReferences = [];
  const unsatisfiable = [];
  let edgeCount = 0;
  let wikiEdges = 0;

  for (const [id, task] of Object.entries(tasks)) {
    for (const set of task.requires ?? []) {
      for (const req of set) {
        edgeCount++;
        if (req.from === "wiki") wikiEdges++;
        if (req.task === id) selfReferences.push({ id, name: task.name });
        else if (!tasks[req.task]) {
          dangling.push({ id, name: task.name, missing: req.task });
        }
        if (!satisfiable(req)) {
          unsatisfiable.push({ id, name: task.name, status: req.status });
        }
      }
    }
  }

  /* --- loops, and what can never be reached ---------------------------- */
  const cycles = findCycles(tasks);
  /*
   * Two playthroughs.
   *
   * The first never fails anything, which is what a player who only ever ticks
   * "done" sees. The second is allowed to declare the failures the graph
   * branches on — the site can express that now, so it is the honest measure
   * of whether a task is reachable *at all*. A task stranded only in the first
   * run sits behind a deliberate failure and is working as intended; one
   * stranded in both can never be shown to anybody.
   */
  const { waves, stranded } = reachable(tasks);
  const { stranded: strandedEvenWithFailures } = reachable(tasks, { allowFailures: true });

  /* --- a prerequisite that outranks the task it gates ------------------- */
  const levelInversions = [];
  for (const [id, task] of Object.entries(tasks)) {
    for (const set of task.requires ?? []) {
      for (const req of set) {
        const prior = tasks[req.task];
        if (!prior) continue;
        if (prior.minPlayerLevel > task.minPlayerLevel && task.minPlayerLevel > 0) {
          levelInversions.push({
            id,
            name: task.name,
            level: task.minPlayerLevel,
            after: prior.name,
            afterLevel: prior.minPlayerLevel,
          });
        }
      }
    }
  }

  /* --- what a fresh profile is told is open ---------------------------- */
  const isOpen = (id) => {
    const sets = tasks[id].requires ?? [];
    return sets.length === 0 || sets.some((set) => set.length === 0);
  };
  const openers = ids.filter(isOpen);
  const openersByTrader = {};
  for (const id of openers) {
    const trader = tasks[id].trader ?? "(none)";
    (openersByTrader[trader] ??= []).push(displayName(tasks[id].name));
  }

  /* --- shape of the data ------------------------------------------------ */
  const noTrader = ids.filter((id) => !tasks[id].trader).map((id) => tasks[id].name);
  const withPrereq = ids.filter((id) => !isOpen(id)).length;
  const ungated = ids.filter(
    (id) => isOpen(id) && tasks[id].minPlayerLevel <= 1 && (tasks[id].traderGates ?? []).length === 0,
  );

  /* --- the same quest twice in one mode --------------------------------- */
  const byMode = {};
  for (const [id, task] of Object.entries(tasks)) {
    const zone = zoneOf(task.name);
    const modes = zone === null ? ["pvp", "pve", "season"] : zone === "pvp" ? ["pvp", "season"] : [zone];
    for (const mode of modes) {
      // Faction is part of the key: the USEC and BEAR cuts of Textile and
      // Drip-Out are meant to share a name, and the UI prints a faction chip
      // beside each. Only a collision that survives faction is ambiguous.
      const key = `${displayName(task.name).toLowerCase()}|${task.factionName ?? ""}`;
      ((byMode[mode] ??= {})[key] ??= []).push(id);
    }
  }
  const duplicates = [];
  for (const [mode, names] of Object.entries(byMode)) {
    for (const [name, hits] of Object.entries(names)) {
      if (hits.length > 1) duplicates.push({ mode, name, ids: hits });
    }
  }

  const kappa = ids.filter((id) => tasks[id].kappaRequired);
  const kappaStranded = kappa.filter((id) => strandedEvenWithFailures.includes(id));

  return {
    tasks: ids.length,
    edges: edgeCount,
    wikiEdges,
    withPrereq,
    ungated: ungated.length,
    dangling,
    selfReferences,
    unsatisfiable,
    cycles,
    behindAFailure: stranded
      .filter((id) => !strandedEvenWithFailures.includes(id))
      .map((id) => ({ id, name: tasks[id].name })),
    stranded: strandedEvenWithFailures.map((id) => ({ id, name: tasks[id].name })),
    chainDepth: waves.length,
    waveSizes: waves.map((w) => w.length),
    levelInversions,
    openers: openers.length,
    openersByTrader,
    noTrader,
    duplicates,
    kappa: kappa.length,
    kappaStranded: kappaStranded.map((id) => ({ id, name: tasks[id].name })),
    degraded: !!graph.degraded,
    generated: graph.generated ?? null,
  };
}

const list = (rows, render, cap = 8) =>
  rows
    .slice(0, cap)
    .map((r) => `      ${render(r)}`)
    .concat(rows.length > cap ? [`      … and ${rows.length - cap} more`] : [])
    .join("\n");

export function formatReport(r) {
  const lines = [];
  const say = (label, value, detail) =>
    lines.push(`  ${String(label).padEnd(26)} ${String(value).padStart(5)}${detail ? `  ${detail}` : ""}`);

  lines.push(`Task graph — built ${r.generated ?? "unknown"}${r.degraded ? "  (upstream was DEGRADED)" : ""}`);
  lines.push("");
  say("tasks", r.tasks);
  say("prerequisite edges", r.edges, `${r.wikiEdges} from the wiki`);
  say("tasks with a prerequisite", r.withPrereq, `${r.tasks - r.withPrereq} without`);
  say("nothing gating them", r.ungated, "no prereq, no level, no loyalty");
  say("longest chain", r.chainDepth, "waves to finish everything");
  say("Kappa tasks", r.kappa);
  lines.push("");

  lines.push("Defects");
  say("dangling edges", r.dangling.length);
  if (r.dangling.length) lines.push(list(r.dangling, (d) => `${d.name} -> missing ${d.missing}`));
  say("self-references", r.selfReferences.length);
  if (r.selfReferences.length) lines.push(list(r.selfReferences, (d) => d.name));
  say("cycles", r.cycles.length);
  if (r.cycles.length) lines.push(list(r.cycles, (c) => c.join(" -> ")));
  say("unreachable tasks", r.stranded.length, "even allowing declared failures");
  if (r.stranded.length) lines.push(list(r.stranded, (d) => d.name));
  say("unreachable Kappa tasks", r.kappaStranded.length);
  if (r.kappaStranded.length) lines.push(list(r.kappaStranded, (d) => d.name));
  say("duplicate names in a mode", r.duplicates.length);
  if (r.duplicates.length) lines.push(list(r.duplicates, (d) => `${d.mode}: ${d.name} (${d.ids.length})`));
  lines.push("");

  lines.push("Reachable, but only down a branch you have to opt into");
  say("behind a declared failure", r.behindAFailure.length);
  if (r.behindAFailure.length) lines.push(list(r.behindAFailure, (d) => d.name));
  lines.push("");

  lines.push("Smells — real upstream gaps as often as bugs");
  say("only-failed requirements", r.unsatisfiable.length, "reachable only by declaring a failure");
  if (r.unsatisfiable.length) lines.push(list(r.unsatisfiable, (d) => `${d.name} [${d.status.join("/")}]`));
  say("level inversions", r.levelInversions.length, "prereq outranks its own task");
  if (r.levelInversions.length) {
    lines.push(list(r.levelInversions, (d) => `${d.name} (lv ${d.level}) after ${d.after} (lv ${d.afterLevel})`));
  }
  say("tasks with no trader", r.noTrader.length);
  if (r.noTrader.length) lines.push(list(r.noTrader, (n) => n));
  lines.push("");

  lines.push(`Opening tasks — what a fresh profile is offered (${r.openers})`);
  for (const [trader, names] of Object.entries(r.openersByTrader).sort((a, b) => b[1].length - a[1].length)) {
    lines.push(`  ${trader.padEnd(14)} ${String(names.length).padStart(3)}  ${names.slice(0, 5).join(", ")}${names.length > 5 ? " …" : ""}`);
  }

  return lines.join("\n");
}
