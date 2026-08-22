import type { Progression, ProgressionTask, TaskAvailability, TaskStatus } from "../types";

/**
 * Works out what state every task is in, given what the player has told us.
 *
 * The player only ever says three things: this is active, this is done, this
 * failed. Everything else — whether a task they haven't mentioned is ready to
 * pick up or still locked behind something — is derived here from the
 * prerequisite graph, their level and their faction.
 */

export interface ProfileInput {
  level: number;
  faction: string;
  /**
   * Loyalty level per trader name. A trader missing from this record is one the
   * player has not told us about, and is never enforced — see `meetsTraders`.
   */
  traderLevels?: Record<string, number>;
}

/** Why a task can't be picked up yet, in words the player can act on. */
export interface LockReason {
  kind: "task" | "level" | "faction" | "trader";
  label: string;
  /** For task blockers: which source stated the requirement. */
  from?: "feed" | "wiki";
}

/*
 * The feed's requirement vocabulary and the store's, reconciled.
 *
 * "failed" is here because the graph genuinely branches on it: `Hot Wheels -
 * Let's Try Again` is offered precisely when you fail `Hot Wheels`, and
 * `Loyalty Buyout` when you fail `Chemical - Part 4`. With no way to say so,
 * those two were unsatisfiable — and because other quests follow on from them,
 * six tasks across the BTR Driver, Ragman and Lightkeeper could never appear
 * for anybody. Declaring a failure is the player's to make, like every other
 * status here; see `failureUnlocks` for where the control is offered.
 */
const STATUS_ALIASES: Record<string, TaskStatus> = {
  complete: "completed",
  completed: "completed",
  active: "active",
  failed: "failed",
  fail: "failed",
};

/** The feed says "complete"; the store says "completed". Reconcile the two. */
function satisfies(required: string[], actual: TaskStatus | undefined): boolean {
  if (!actual) return false;
  return required.some((r) => STATUS_ALIASES[r.toLowerCase()] === actual);
}

function meetsProfile(task: ProgressionTask, profile: ProfileInput): boolean {
  if (task.minPlayerLevel > profile.level) return false;
  if (task.factionName && profile.faction !== "Any" && task.factionName !== profile.faction) {
    return false;
  }
  return unmetTraderGates(task, profile).length === 0;
}

/**
 * Trader loyalty gates the player's own levels rule out.
 *
 * A gate is only ever enforced for a trader the player has actually given a
 * level for. This matters more than it looks: 83 tasks carry a loyalty gate and
 * nothing else, so enforcing an unknown trader as level 1 would lock most of
 * the game for anybody who hasn't filled the form in. Silence means "don't
 * know", and not knowing is never a reason to hide something.
 *
 * Reputation gates are skipped entirely — the site has no way to ask for a
 * reputation figure, and guessing one would be inventing progress.
 */
function unmetTraderGates(task: ProgressionTask, profile: ProfileInput): LockReason[] {
  const levels = profile.traderLevels;
  if (!levels) return [];

  const out: LockReason[] = [];
  for (const gate of task.traderGates) {
    if (gate.kind !== "level") continue;
    const known = levels[gate.trader];
    if (typeof known !== "number") continue;
    if (known < gate.value) {
      out.push({ kind: "trader", label: `${gate.trader} LL${gate.value}` });
    }
  }
  return out;
}

/**
 * Tasks whose *failure* opens something else, so the UI knows where offering
 * "I failed this" is meaningful. Read from the graph rather than listed by
 * hand: it is two tasks today and the data decides, not this file.
 */
export function failureUnlocks(progression: Progression | null): Set<string> {
  const out = new Set<string>();
  if (!progression) return out;
  for (const task of Object.values(progression.tasks)) {
    for (const set of task.requires) {
      for (const req of set) {
        if (req.status.some((s) => s.toLowerCase().startsWith("fail"))) out.add(req.task);
      }
    }
  }
  return out;
}

export function computeAvailability(
  progression: Progression | null,
  taskStatus: Record<string, TaskStatus>,
  profile: ProfileInput,
): Record<string, TaskAvailability> {
  const out: Record<string, TaskAvailability> = {};
  if (!progression) return out;

  for (const [id, task] of Object.entries(progression.tasks)) {
    // What the player said always wins over what the graph infers.
    const stated = taskStatus[id];
    if (stated) {
      out[id] = stated;
      continue;
    }

    if (!meetsProfile(task, profile)) {
      out[id] = "locked";
      continue;
    }

    // No requirement sets at all means nothing gates it.
    const unlocked =
      task.requires.length === 0 ||
      task.requires.some((set) => set.every((req) => satisfies(req.status, taskStatus[req.task])));

    out[id] = unlocked ? "available" : "locked";
  }

  return out;
}

/**
 * What is standing between the player and a locked task. Only the immediate
 * blockers, not the whole chain — "needs Debut" is useful, the twelve tasks
 * behind Debut are not.
 */
export function lockReasons(
  progression: Progression | null,
  taskId: string,
  taskStatus: Record<string, TaskStatus>,
  profile: ProfileInput,
): LockReason[] {
  const task = progression?.tasks[taskId];
  if (!task) return [];

  const reasons: LockReason[] = [];
  if (task.minPlayerLevel > profile.level) {
    reasons.push({ kind: "level", label: `Level ${task.minPlayerLevel}` });
  }
  if (task.factionName && profile.faction !== "Any" && task.factionName !== profile.faction) {
    reasons.push({ kind: "faction", label: `${task.factionName} only` });
  }
  reasons.push(...unmetTraderGates(task, profile));

  if (task.requires.length > 0) {
    // Report the alternative that is closest to being satisfied — that is the
    // path the player is most likely actually on.
    let best: { missing: LockReason[]; count: number } | null = null;
    for (const set of task.requires) {
      const missing = set
        .filter((req) => !satisfies(req.status, taskStatus[req.task]))
        .map((req) => {
          const raw = progression?.tasks[req.task]?.name ?? "another task";
          const name = raw.replace(/\s*\[(PVP ZONE|PVE ZONE|KORD BREACH)\]\s*$/i, "").trim();
          const wants =
            req.status.some((s) => s.toLowerCase().startsWith("fail")) &&
            !req.status.some((s) => s.toLowerCase().startsWith("complet"))
              ? " (failed)"
              : "";
          // Where it came from travels with it. The feed states barely half of
          // these; the rest are the wiki's word, and a player deciding whether
          // to trust a lock deserves to know which they are looking at.
          return { kind: "task" as const, label: `${name}${wants}`, from: req.from };
        });
      if (!best || missing.length < best.count) best = { missing, count: missing.length };
    }
    if (best) reasons.push(...best.missing);
  }

  return reasons;
}

/**
 * Every task that has to be finished before this one, following the chain all
 * the way back to the start of the game.
 *
 * This exists for the cold start. Availability is only meaningful once the site
 * knows what you have already done, and nobody is going to tick off two hundred
 * tasks by hand. Instead you find the newest task you have finished, and this
 * fills in everything behind it in one go.
 *
 * Where a task has alternative requirement sets (mutually exclusive branches of
 * the same quest), the shortest branch is taken — it is the least presumptuous
 * guess about a path we can't actually observe.
 */
function pickRequirementSet(
  sets: ProgressionTask["requires"],
  taskStatus: Record<string, TaskStatus>,
): ProgressionTask["requires"][number] {
  let best = sets[0];
  let bestScore = -1;
  let bestLen = Infinity;
  for (const set of sets) {
    const completable = set.filter((req) =>
      req.status.some((s) => s.toLowerCase().startsWith("complet")),
    );
    const satisfied = completable.filter((req) => satisfies(req.status, taskStatus[req.task])).length;
    const declared = completable.filter((req) => !!taskStatus[req.task]).length;
    const score = satisfied * 100 + declared;
    if (score > bestScore || (score === bestScore && set.length < bestLen)) {
      best = set;
      bestScore = score;
      bestLen = set.length;
    }
  }
  return best;
}

export function prerequisiteClosure(
  progression: Progression | null,
  taskId: string,
  taskStatus: Record<string, TaskStatus> = {},
): string[] {
  if (!progression?.tasks[taskId]) return [];

  const collected = new Set<string>();
  const queue = [taskId];
  const seen = new Set<string>([taskId]);

  while (queue.length) {
    const current = queue.shift()!;
    const task = progression.tasks[current];
    if (!task || task.requires.length === 0) continue;

    const chosen = pickRequirementSet(task.requires, taskStatus);

    for (const req of chosen) {
      // A "must have failed" prerequisite is not something to auto-tick as
      // done — leave those for the player to say.
      if (!req.status.some((s) => s.toLowerCase().startsWith("complet"))) continue;
      if (!progression.tasks[req.task] || seen.has(req.task)) continue;
      seen.add(req.task);
      collected.add(req.task);
      queue.push(req.task);
    }
  }

  return [...collected];
}

/**
 * Tasks that name this one as a prerequisite — what opening it unlocks.
 *
 * Immediate children only. The full tree is noise; "this leads to Shortage"
 * is what you plan a raid around.
 */
export function unlocksAfter(progression: Progression | null, taskId: string): string[] {
  if (!progression) return [];
  const out: string[] = [];
  for (const [id, task] of Object.entries(progression.tasks)) {
    if (id === taskId) continue;
    const hits = task.requires.some((set) =>
      set.some(
        (req) =>
          req.task === taskId &&
          req.status.some((s) => {
            const n = s.toLowerCase();
            return n.startsWith("complet") || n === "active";
          }),
      ),
    );
    if (hits) out.push(id);
  }
  return out;
}

/** How many completed-prereq hops sit behind this task. Earlier wipe = smaller. */
export function chainDepth(progression: Progression | null, taskId: string): number {
  return prerequisiteClosure(progression, taskId).length;
}

/** Tasks the graph says are ready to pick up, limited to one map. */
export function availableOnMap(
  progression: Progression | null,
  availability: Record<string, TaskAvailability>,
  mapName: string,
): string[] {
  if (!progression) return [];
  return Object.entries(progression.tasks)
    .filter(([id, task]) => task.maps.includes(mapName) && availability[id] === "available")
    .map(([id]) => id);
}
