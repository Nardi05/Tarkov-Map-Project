import { computeAvailability, lockReasons, unlocksAfter, type LockReason, type ProfileInput } from "./progression.ts";
import {
  STORY,
  effectiveChoices,
  stepIsDone,
  stepsForEnding,
  type StoryChapter,
  type StoryEnding,
  type StoryStep,
  type VisibleStep,
} from "./story.ts";
import { displayName, visibleInMode } from "./task-variant.ts";
import type { GameMode } from "./persist-migrate";
import type {
  KeyItem,
  Progression,
  TaskAvailability,
  TaskObjective,
  TaskStatus,
} from "../types";

/**
 * The two kinds of thing this site tracks, behind one vocabulary.
 *
 * Tarkov has a story — the 1.0 ending path, twenty-one chapters of it — and it
 * has five hundred trader tasks that have nothing to do with the story. Both
 * are "quests" in the game and the site used to treat them as unrelated
 * features: one hand-written guide page, one graph-driven tracker, no shared
 * shape and no screen that showed both.
 *
 * That is the gap this module closes. A **side mission** is a trader task, read
 * out of the progression graph. A **story mission** is a chapter of the ending
 * path, read out of the vendored guide. They stay separate types because they
 * genuinely are different — a chapter has prose and a task has a prerequisite
 * graph — but both answer the same three questions, and the dashboard asks them
 * of both:
 *
 *   what should I do next, which door does it go through, and what do I need
 *   to be carrying.
 *
 * Nothing here touches React or storage. It takes what the player has said and
 * what the feed shipped, and returns rows.
 */

/* ------------------------------------------------------------------- keys */

export interface MissionKeyRow {
  /** Null for story steps, which name their keys rather than carrying an id. */
  id: string | null;
  name: string;
  shortName: string | null;
  icon: string | null;
  wiki: string | null;
  /** Maps the key is used on, across every mission that wants it. */
  maps: string[];
  owned: boolean;
  /** What wants it, so a key row can say why it is on the list. */
  wantedBy: { id: string; name: string }[];
}

/* ------------------------------------------------------------------ items */

export interface MissionItemRow {
  itemId: string;
  name: string;
  icon: string | null;
  need: number;
  have: number;
  remaining: number;
  foundInRaid: boolean;
  wantedBy: { id: string; name: string }[];
}

/* ---------------------------------------------------------- side missions */

export interface SideMission {
  id: string;
  name: string;
  trader: string;
  level: number;
  kappa: boolean;
  lightkeeper: boolean;
  faction: string | null;
  experience: number;
  wiki: string | null;
  /** What the player declared, if anything. Absent means "not started". */
  status: TaskStatus | undefined;
  /** What the graph works out, with a declared status always winning. */
  availability: TaskAvailability;
  maps: string[];
  objectives: TaskObjective[];
  keys: MissionKeyRow[];
  items: MissionItemRow[];
  /** Tasks this one opens, so a row can say what it is worth. */
  unlocks: { id: string; name: string }[];
  /** Only filled for locked rows — computing it for all 526 is wasted work. */
  blockers: LockReason[];
}

export interface SideMissionInput {
  progression: Progression | null;
  taskStatus: Record<string, TaskStatus>;
  profile: ProfileInput & { mode: GameMode };
  itemCounts: Record<string, number>;
  keysOwned: Record<string, true>;
}

function keyRow(
  key: KeyItem | undefined,
  id: string,
  maps: string[],
  owned: Record<string, true>,
  wantedBy: { id: string; name: string },
): MissionKeyRow {
  return {
    id,
    name: key?.name ?? "Unknown key",
    shortName: key?.shortName ?? null,
    icon: key?.icon ?? null,
    wiki: key?.wiki ?? null,
    maps,
    owned: !!owned[id],
    wantedBy: [wantedBy],
  };
}

/**
 * Every trader task the current character could care about, as rows.
 *
 * Deliberately returns all of them rather than a filtered set: the pages want
 * different slices of the same list — everything, only what is open, only what
 * is locked — and computing it once and filtering is cheaper and more
 * consistent than four builders that could disagree.
 *
 * `blockers` is the one field that is not free, so it is filled only for rows
 * the graph says are locked.
 */
export function buildSideMissions({
  progression,
  taskStatus,
  profile,
  itemCounts,
  keysOwned,
}: SideMissionInput): SideMission[] {
  if (!progression) return [];
  const availability = computeAvailability(progression, taskStatus, profile);
  const out: SideMission[] = [];

  for (const [id, task] of Object.entries(progression.tasks)) {
    if (!visibleInMode(task.name, profile.mode)) continue;
    // A task locked to the other faction can never be in your list.
    if (task.factionName && profile.faction !== "Any" && task.factionName !== profile.faction) {
      continue;
    }

    const name = displayName(task.name);
    const ref = { id, name };
    const state = availability[id] ?? "available";

    const keys: MissionKeyRow[] = [];
    for (const group of task.keys ?? []) {
      for (const keyId of group.keys) {
        keys.push(
          keyRow(progression.keys[keyId], keyId, group.map ? [group.map] : [], keysOwned, ref),
        );
      }
    }

    /*
     * A defensive fold, for payloads built before the pipeline learned to do
     * this itself.
     *
     * The feed states one requirement as two objectives — find four car
     * batteries, then hand over four — and those are the same four. Older
     * payloads carry both rows, so the larger wins rather than the sum, which
     * is what made Car Repair ask for eight. `scripts/lib/build-data-core.mjs`
     * now folds them at the source, so on current data this never fires.
     */
    const byItem = new Map<string, MissionItemRow>();
    for (const need of task.needs ?? []) {
      const itemId = need.items[0] ?? "";
      const existing = byItem.get(itemId);
      if (existing) {
        existing.need = Math.max(existing.need, need.count);
        existing.remaining = Math.max(0, existing.need - existing.have);
        // A found-in-raid requirement anywhere makes the whole line FIR: the
        // stricter of the two is the one you have to satisfy.
        existing.foundInRaid ||= need.foundInRaid;
        continue;
      }
      const have = itemCounts[itemId] ?? 0;
      byItem.set(itemId, {
        itemId,
        name: need.name,
        icon: need.icon,
        need: need.count,
        have,
        remaining: Math.max(0, need.count - have),
        foundInRaid: need.foundInRaid,
        wantedBy: [ref],
      });
    }
    const items: MissionItemRow[] = [...byItem.values()];

    out.push({
      id,
      name,
      trader: task.trader ?? "—",
      level: task.minPlayerLevel,
      kappa: task.kappaRequired,
      lightkeeper: task.lightkeeperRequired,
      faction: task.factionName,
      experience: task.experience ?? 0,
      wiki: task.wiki,
      status: taskStatus[id],
      availability: state,
      maps: task.maps ?? [],
      objectives: task.objectives ?? [],
      keys,
      items,
      unlocks: unlocksAfter(progression, id)
        .map((next) => ({ id: next, name: displayName(progression.tasks[next]?.name ?? next) }))
        .slice(0, 6),
      blockers:
        state === "locked" ? lockReasons(progression, id, taskStatus, profile) : [],
    });
  }

  return out;
}

/**
 * How a mission is sorted when the question is "what next".
 *
 * Active first because the player said so, then what is open to them, and
 * within each by level — the cheapest thing they can do is the thing they
 * should probably do. Locked and finished never appear here.
 */
const NEXT_RANK: Partial<Record<TaskAvailability, number>> = {
  pinned: 0,
  active: 1,
  available: 2,
};

export function upcomingSideMissions(missions: SideMission[], limit = 8): SideMission[] {
  return missions
    .filter((m) => NEXT_RANK[m.availability] !== undefined)
    .sort(
      (a, b) =>
        (NEXT_RANK[a.availability] ?? 9) - (NEXT_RANK[b.availability] ?? 9) ||
        a.level - b.level ||
        a.name.localeCompare(b.name),
    )
    .slice(0, limit);
}

/**
 * Fold per-mission keys into one list, merging the duplicates.
 *
 * Six tasks behind the same dorm key is one key to bring, not six — and the
 * row has to say all six, because that is the argument for carrying it.
 */
export function mergeKeys(missions: SideMission[]): MissionKeyRow[] {
  const byKey = new Map<string, MissionKeyRow>();
  for (const mission of missions) {
    for (const key of mission.keys) {
      const id = key.id ?? key.name.toLowerCase();
      const existing = byKey.get(id);
      if (!existing) {
        byKey.set(id, { ...key, maps: [...key.maps], wantedBy: [...key.wantedBy] });
        continue;
      }
      for (const map of key.maps) if (!existing.maps.includes(map)) existing.maps.push(map);
      for (const ref of key.wantedBy) {
        if (!existing.wantedBy.some((w) => w.id === ref.id)) existing.wantedBy.push(ref);
      }
    }
  }
  return [...byKey.values()].sort(
    (a, b) => b.wantedBy.length - a.wantedBy.length || a.name.localeCompare(b.name),
  );
}

/** The same fold for hand-in items, so the shopping list is one of each. */
export function mergeItems(missions: SideMission[], firOnly = false): MissionItemRow[] {
  const byItem = new Map<string, MissionItemRow>();
  for (const mission of missions) {
    for (const item of mission.items) {
      if (firOnly && !item.foundInRaid) continue;
      if (!item.itemId) continue;
      const existing = byItem.get(item.itemId);
      if (!existing) {
        byItem.set(item.itemId, { ...item, wantedBy: [...item.wantedBy] });
        continue;
      }
      existing.need += item.need;
      // `have` is a stash count, not a per-task one — it must not be summed.
      existing.remaining = Math.max(0, existing.need - existing.have);
      for (const ref of item.wantedBy) {
        if (!existing.wantedBy.some((w) => w.id === ref.id)) existing.wantedBy.push(ref);
      }
    }
  }
  return [...byItem.values()]
    .filter((row) => row.remaining > 0)
    .sort((a, b) => b.wantedBy.length - a.wantedBy.length || a.name.localeCompare(b.name));
}

/** Which maps the given missions would send you to, busiest first. */
export function mapWorkload(missions: SideMission[]): { map: string; count: number }[] {
  const counts = new Map<string, number>();
  for (const mission of missions) {
    for (const map of mission.maps) counts.set(map, (counts.get(map) ?? 0) + 1);
  }
  return [...counts.entries()]
    .map(([map, count]) => ({ map, count }))
    .sort((a, b) => b.count - a.count || a.map.localeCompare(b.map));
}

/* --------------------------------------------------------- story missions */

export interface StoryChapterView {
  chapter: StoryChapter;
  steps: { step: StoryStep; done: boolean }[];
  done: number;
  total: number;
  /** True when every step in the chapter is ticked. */
  complete: boolean;
  /** The first unfinished step, which is what the dashboard shows. */
  next: StoryStep | null;
  /** Key names the chapter's steps call for. */
  keys: string[];
  maps: string[];
}

/**
 * The ending path, grouped the way the game tells it.
 *
 * The story page used to render one flat list of steps per ending, which is how
 * the data is shaped but not how anybody thinks about it — the game hands you a
 * chapter at a time, and the chapters have names. Grouping restores that, and
 * gives each one a progress figure, which a flat list cannot have.
 *
 * Storyline chapters (the evidence hunt) are included: they are optional for
 * three of the four endings, and `chapter.storyline` is how a caller tells.
 */
export function storyChapters(
  ending: StoryEnding,
  ticks: Record<string, true>,
  recorded: Record<string, string>,
  built: Record<string, number>,
): StoryChapterView[] {
  const choices = effectiveChoices(ending, recorded);
  const rows = stepsForEnding(ending.id, choices);

  const byChapter = new Map<string, VisibleStep[]>();
  for (const row of rows) {
    const list = byChapter.get(row.chapter.id) ?? [];
    list.push(row);
    byChapter.set(row.chapter.id, list);
  }

  const views: StoryChapterView[] = [];
  for (const [chapterId, list] of byChapter) {
    const chapter = list[0].chapter;
    const steps = list.map((row) => ({
      step: row.step,
      done: stepIsDone(row.step, ticks, built),
    }));
    const done = steps.filter((s) => s.done).length;

    const keys = new Set<string>();
    const maps = new Set<string>(chapter.maps ?? []);
    for (const { step } of steps) {
      for (const key of step.keys ?? []) keys.add(key);
      for (const map of step.maps ?? []) maps.add(map);
    }

    views.push({
      chapter,
      steps,
      done,
      total: steps.length,
      complete: done === steps.length && steps.length > 0,
      next: steps.find((s) => !s.done)?.step ?? null,
      keys: [...keys],
      maps: [...maps],
    });
    void chapterId;
  }

  // Chapter number, then storyline chapters after the spine at the same number:
  // the evidence hunt runs alongside the main path rather than after it.
  return views.sort(
    (a, b) =>
      a.chapter.number - b.chapter.number ||
      Number(!!a.chapter.storyline) - Number(!!b.chapter.storyline) ||
      a.chapter.name.localeCompare(b.chapter.name),
  );
}

export interface StoryNextStep {
  step: StoryStep;
  chapter: StoryChapter;
}

/**
 * The next few story steps to actually do.
 *
 * The spine first, in order, because it is sequential. Then one step from each
 * unfinished storyline chapter — those run in parallel and can be picked up
 * whenever, so showing all of them would bury the spine.
 */
export function nextStorySteps(views: StoryChapterView[], limit = 5): StoryNextStep[] {
  const out: StoryNextStep[] = [];

  for (const view of views) {
    if (view.chapter.storyline) continue;
    for (const { step, done } of view.steps) {
      if (done) continue;
      out.push({ step, chapter: view.chapter });
      if (out.length >= limit) return out;
    }
  }

  for (const view of views) {
    if (!view.chapter.storyline || view.complete || !view.next) continue;
    out.push({ step: view.next, chapter: view.chapter });
    if (out.length >= limit) break;
  }

  return out.slice(0, limit);
}

/**
 * Key names the upcoming story steps call for, matched to real key records
 * where the name lines up.
 *
 * The story guide is vendored from the wiki and names its keys in prose
 * ("TerraGroup Labs access keycard") rather than by id, so this is a name
 * match and it is allowed to miss. A key it cannot resolve still appears —
 * with no icon and no wiki link, but it still tells you what to bring, which
 * is the part that matters.
 */
export function storyKeys(
  views: StoryChapterView[],
  progression: Progression | null,
  keysOwned: Record<string, true>,
): MissionKeyRow[] {
  const byName = new Map<string, KeyItem & { id: string }>();
  for (const [id, key] of Object.entries(progression?.keys ?? {})) {
    byName.set(key.name.toLowerCase(), { ...key, id });
  }

  const out = new Map<string, MissionKeyRow>();
  for (const view of views) {
    if (view.complete) continue;
    for (const { step, done } of view.steps) {
      if (done) continue;
      /*
       * The step's maps, not the chapter's. A chapter like "Blue fire" spans
       * six maps while the step that wants the car dealership key is only
       * about Streets — reading the key's location off the chapter told
       * people to bring a Labs keycard to Customs.
       */
      const maps = step.maps?.length ? step.maps : view.chapter.maps ?? [];
      for (const name of step.keys ?? []) {
        const match = byName.get(name.toLowerCase());
        const id = match?.id ?? null;
        const rowKey = id ?? name.toLowerCase();
        const ref = { id: view.chapter.id, name: view.chapter.name };
        const existing = out.get(rowKey);
        if (existing) {
          for (const map of maps) if (!existing.maps.includes(map)) existing.maps.push(map);
          if (!existing.wantedBy.some((w) => w.id === ref.id)) existing.wantedBy.push(ref);
          continue;
        }
        out.set(rowKey, {
          id,
          name: match?.name ?? name,
          shortName: match?.shortName ?? null,
          icon: match?.icon ?? null,
          wiki: match?.wiki ?? null,
          maps: [...maps],
          owned: id ? !!keysOwned[id] : false,
          wantedBy: [ref],
        });
      }
    }
  }
  return [...out.values()].sort((a, b) => a.name.localeCompare(b.name));
}

/** Major evidence the ending needs, with what is already ticked. */
export function storyEvidence(ticks: Record<string, true>) {
  const major = STORY.evidence.filter((e) => e.major);
  return {
    all: major,
    have: major.filter((e) => ticks[e.id]).length,
    outstanding: major.filter((e) => !ticks[e.id]),
  };
}

/** Human label for an objective's feed type, for the checklist badge. */
export function objectiveLabel(type: string): string {
  switch (type) {
    case "giveItem":
    case "giveQuestItem":
      return "Hand in";
    case "findItem":
    case "findQuestItem":
      return "Find";
    case "plantItem":
    case "plantQuestItem":
      return "Stash";
    case "mark":
      return "Mark";
    case "shoot":
      return "Kill";
    case "visit":
      return "Visit";
    case "extract":
      return "Extract";
    case "buildWeapon":
      return "Build";
    case "skill":
      return "Skill";
    case "traderLevel":
    case "traderStanding":
      return "Trader";
    case "taskStatus":
      return "Quest";
    case "useItem":
      return "Use";
    case "sellItem":
      return "Sell";
    default:
      return "Do";
  }
}
