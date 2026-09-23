import raw from "../data/story-endings.json" with { type: "json" };
import storylines from "../data/story-storylines.json" with { type: "json" };
import type { HideoutStation } from "../types";
import { emptyStory, type HideoutStatus, type ModeStory } from "./persist-migrate.ts";
import { prettyMapName } from "./kord-season.ts";

export { emptyStory };
export type StoryProgress = ModeStory;

/**
 * Story endings for Tarkov 1.0 / Season 1.
 *
 * The four endings, the lock choices, and the chapter checklists are not in
 * the tarkov.dev feed. They live in `src/data/story-endings.json` the same
 * way Kord Breach quests live in kord-season.json — vendored from the wiki,
 * so a data rebuild cannot drop them.
 */

export type StoryEndingId = "savior" | "survivor" | "debtor" | "fallen";
export type StoryLockId = "case" | "kerman" | "dirt" | "evidence";
export type StoryOutcome = "best" | "neutral" | "bad" | "worst";
export type StoryStepKind =
  | "quest"
  | "choice"
  | "item"
  | "hideout"
  | "reputation"
  | "extract"
  | "craft"
  | "wait"
  | "finale"
  | "note";

export interface StoryReward {
  name: string;
  group: "cosmetic" | "achievement" | "stash";
}

export interface StoryDifficulty {
  rank: 1 | 2 | 3 | 4;
  label: string;
  note: string;
}

export interface StoryEnding {
  id: StoryEndingId;
  name: string;
  tagline: string;
  epilogue: string;
  rank: number;
  outcome: StoryOutcome;
  difficulty: StoryDifficulty;
  summary: string;
  wiki: string;
  choices: Partial<Record<StoryLockId, string>>;
  accessItem: string;
  rewards: StoryReward[];
}

export interface StoryLockOption {
  id: string;
  label: string;
  hint: string;
  warning?: string;
}

export interface StoryLock {
  id: StoryLockId;
  name: string;
  chapter: string;
  prompt: string;
  options: StoryLockOption[];
}

export interface StoryWhen {
  lock: StoryLockId;
  is: string;
}

export interface StoryStep {
  id: string;
  title: string;
  detail: string;
  kind: StoryStepKind;
  maps?: string[];
  location?: string;
  hideout?: { station: string; level: number };
  trader?: string;
  wait?: string;
  choice?: { lock: StoryLockId; value: string };
  endings?: StoryEndingId[];
  required?: boolean;
  parallel?: boolean;
  when?: StoryWhen[];
  keys?: string[];
}

export interface StoryChapter {
  id: string;
  number: number;
  name: string;
  tone: string;
  summary: string;
  wiki: string;
  howToStart: string;
  maps: string[];
  lock?: StoryLockId;
  endings?: StoryEndingId[];
  when?: StoryWhen[];
  /** Evidence-hunt questline. Required for Savior; optional pick-two for Debtor. */
  storyline?: boolean;
  steps: StoryStep[];
}

export interface StoryEvidence {
  id: string;
  name: string;
  chapter: string | null;
  chapterName: string;
  source: string;
  map: string | null;
  howToStart: string;
  note?: string;
  keys?: string[];
  major: boolean;
}

export interface StoryMinor {
  id: string;
  name: string;
}

export interface StoryWarning {
  id: string;
  text: string;
  endings: StoryEndingId[];
}

export interface StoryData {
  id: string;
  name: string;
  patch: string;
  wiki: string;
  ticketWiki: string;
  notes: string[];
  endings: StoryEnding[];
  locks: StoryLock[];
  chapters: StoryChapter[];
  evidence: StoryEvidence[];
  minorEvidence: StoryMinor[];
  warnings: StoryWarning[];
}

const base = raw as StoryData;
const extra = storylines as { chapters: StoryChapter[] };

export const STORY: StoryData = {
  ...base,
  chapters: [...base.chapters, ...extra.chapters],
};

export const STORY_ENDING_IDS: StoryEndingId[] = ["savior", "survivor", "debtor", "fallen"];

const ENDING_SET = new Set<string>(STORY_ENDING_IDS);

export function isEndingId(v: string | null | undefined): v is StoryEndingId {
  return !!v && ENDING_SET.has(v);
}

export function endingById(id: string | null | undefined): StoryEnding | null {
  if (!isEndingId(id)) return null;
  return STORY.endings.find((e) => e.id === id) ?? null;
}

export function lockById(id: string): StoryLock | undefined {
  return STORY.locks.find((l) => l.id === id);
}

/** Choices the targeted ending wants, with anything the player already locked in winning. */
export function effectiveChoices(
  ending: StoryEnding | null,
  recorded: Record<string, string>,
): Record<string, string> {
  return { ...(ending?.choices ?? {}), ...recorded };
}

function whenMatch(when: StoryWhen[] | undefined, choices: Record<string, string>): boolean {
  if (!when?.length) return true;
  return when.every((w) => choices[w.lock] === w.is);
}

function onEnding(endings: StoryEndingId[] | undefined, id: StoryEndingId): boolean {
  return !endings || endings.includes(id);
}

export interface VisibleStep {
  step: StoryStep;
  chapter: StoryChapter;
}

/** Steps that belong on this ending given the current (or planned) lock choices. */
export function stepsForEnding(
  endingId: StoryEndingId,
  choices: Record<string, string>,
): VisibleStep[] {
  const out: VisibleStep[] = [];
  for (const chapter of STORY.chapters) {
    if (!onEnding(chapter.endings, endingId)) continue;
    if (!whenMatch(chapter.when, choices)) continue;
    for (const step of chapter.steps) {
      if (!onEnding(step.endings, endingId)) continue;
      if (!whenMatch(step.when, choices)) continue;
      out.push({ step, chapter });
    }
  }
  return out;
}

export function locksForEnding(ending: StoryEnding): StoryLock[] {
  const wanted = new Set(Object.keys(ending.choices));
  return STORY.locks.filter((l) => wanted.has(l.id));
}

export function warningsForEnding(endingId: StoryEndingId): StoryWarning[] {
  return STORY.warnings.filter((w) => w.endings.includes(endingId));
}

/**
 * Highest completed level per station name, so a hideout step can tick itself
 * when the player already marked that station done on the hideout page.
 */
export function hideoutLevels(
  stations: HideoutStation[] | undefined,
  hideout: Record<string, HideoutStatus>,
): Record<string, number> {
  const out: Record<string, number> = {};
  if (!stations) return out;
  for (const station of stations) {
    let prefix = 0;
    for (const level of [...station.levels].sort((a, b) => a.level - b.level)) {
      if (hideout[level.id] === "completed") prefix = level.level;
      else break;
    }
    out[station.name] = prefix;
  }
  return out;
}

export function stepIsDone(
  step: StoryStep,
  ticks: Record<string, true>,
  built: Record<string, number>,
): boolean {
  if (ticks[step.id]) return true;
  if (step.hideout && (built[step.hideout.station] ?? 0) >= step.hideout.level) return true;
  return false;
}

export function evidenceIsDone(id: string, ticks: Record<string, true>): boolean {
  return !!ticks[id];
}

export interface StoryConflict {
  lock: StoryLock;
  recorded: string;
  needed: string;
  recordedLabel: string;
  neededLabel: string;
  warning?: string;
}

/** Recorded lock choices that brick the targeted ending. */
export function choiceConflicts(
  ending: StoryEnding,
  recorded: Record<string, string>,
): StoryConflict[] {
  const out: StoryConflict[] = [];
  for (const [lockId, needed] of Object.entries(ending.choices)) {
    const recordedValue = recorded[lockId];
    if (!recordedValue || recordedValue === needed) continue;
    const lock = lockById(lockId);
    if (!lock) continue;
    const rec = lock.options.find((o) => o.id === recordedValue);
    const need = lock.options.find((o) => o.id === needed);
    out.push({
      lock,
      recorded: recordedValue,
      needed,
      recordedLabel: rec?.label ?? recordedValue,
      neededLabel: need?.label ?? needed,
      warning: rec?.warning,
    });
  }
  return out;
}

export interface StoryProgressStats {
  required: number;
  requiredDone: number;
  optional: number;
  optionalDone: number;
  evidenceNeed: number;
  evidenceHave: number;
  evidenceTotal: number;
  next: VisibleStep[];
  parallel: VisibleStep[];
}

const SAVIOR_EVIDENCE_NEED = 8;

function stepCountsAsRequired(row: VisibleStep, endingId: StoryEndingId): boolean {
  if (row.step.required === false) return false;
  if (row.chapter.storyline && endingId !== "savior") return false;
  return true;
}

export function progressFor(
  ending: StoryEnding,
  ticks: Record<string, true>,
  recorded: Record<string, string>,
  built: Record<string, number>,
): StoryProgressStats {
  const choices = effectiveChoices(ending, recorded);
  const rows = stepsForEnding(ending.id, choices);
  const required = rows.filter((r) => stepCountsAsRequired(r, ending.id));
  const optional = rows.filter((r) => !stepCountsAsRequired(r, ending.id));
  const requiredDone = required.filter((r) => stepIsDone(r.step, ticks, built)).length;
  const optionalDone = optional.filter((r) => stepIsDone(r.step, ticks, built)).length;

  const evidenceNeed = ending.id === "savior" ? SAVIOR_EVIDENCE_NEED : ending.id === "debtor" ? 2 : 0;
  const evidenceHave = STORY.evidence.filter((e) => e.major && ticks[e.id]).length;

  const incompleteReq = required.filter((r) => !stepIsDone(r.step, ticks, built));
  const next = incompleteReq.filter((r) => !r.chapter.storyline && !r.step.parallel).slice(0, 3);

  const parallel: VisibleStep[] = [];
  const seen = new Set<string>();
  for (const row of rows) {
    if (!row.chapter.storyline || seen.has(row.chapter.id)) continue;
    if (stepIsDone(row.step, ticks, built)) continue;
    if (row.step.required === false) continue;
    seen.add(row.chapter.id);
    parallel.push(row);
  }

  return {
    required: required.length,
    requiredDone,
    optional: optional.length,
    optionalDone,
    evidenceNeed,
    evidenceHave,
    evidenceTotal: STORY.evidence.filter((e) => e.major).length,
    next,
    parallel,
  };
}

export function storylineChaptersFor(endingId: StoryEndingId): StoryChapter[] {
  return STORY.chapters.filter((c) => c.storyline && onEnding(c.endings, endingId));
}

export function headlineRewards(ending: StoryEnding, cap = 6): StoryReward[] {
  const preferred = ending.rewards.filter(
    (r) => r.group === "cosmetic" || r.group === "achievement" || /USD|EUR|RUB|THICC|T H I C C|Red Rebel|Taiga|Money case/i.test(r.name),
  );
  const seen = new Set<string>();
  const out: StoryReward[] = [];
  for (const row of preferred) {
    if (seen.has(row.name)) continue;
    seen.add(row.name);
    out.push(row);
    if (out.length >= cap) return out;
  }
  for (const row of ending.rewards) {
    if (seen.has(row.name)) continue;
    seen.add(row.name);
    out.push(row);
    if (out.length >= cap) break;
  }
  return out;
}

export function outcomeLabel(outcome: StoryOutcome): string {
  if (outcome === "best") return "Best ending";
  if (outcome === "neutral") return "Clean escape";
  if (outcome === "bad") return "Escape in debt";
  return "Worst ending";
}

/**
 * The words to hand the map's search when a step says "show me".
 *
 * Story steps know where they mean in prose, not in coordinates — the
 * checklists come from the wiki. So the map is pointed at by name, and this
 * picks the part of the step that names a place: the location line first, then
 * a key, since a locked door is a place too.
 *
 * Trimmed to the first clause, because "G-Wagon by Tunnel extract · Shoreline
 * island house" is two places and the search can only look for one.
 */
export function stepSearchText(step: StoryStep): string | null {
  const source = step.location ?? step.keys?.[0] ?? null;
  if (!source) return null;
  const first = source.split(/\s+·\s+|\s+then\s+|,\s+/)[0].trim();
  return first.length >= 3 ? first : null;
}

export function mapLabel(slug: string): string {
  if (slug === "the-lab") return "The Lab";
  if (slug === "the-labyrinth") return "The Labyrinth";
  if (slug === "ground-zero") return "Ground Zero";
  if (slug === "streets-of-tarkov") return "Streets of Tarkov";
  return prettyMapName(slug);
}

export function mergeStory(raw: unknown): StoryProgress {
  const base = emptyStory();
  if (!raw || typeof raw !== "object") return base;
  const row = raw as Partial<StoryProgress>;
  const ticks: Record<string, true> = {};
  if (row.ticks && typeof row.ticks === "object") {
    for (const id of Object.keys(row.ticks)) if (row.ticks[id]) ticks[id] = true;
  }
  const choices: Record<string, string> = {};
  if (row.choices && typeof row.choices === "object") {
    for (const [k, v] of Object.entries(row.choices)) {
      if (typeof v === "string" && v) choices[k] = v;
    }
  }
  return {
    target: typeof row.target === "string" && row.target ? row.target : null,
    ticks,
    choices,
  };
}
