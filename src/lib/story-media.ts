/**
 * Which wiki photo belongs to which story step.
 *
 * The story chapters are vendored checklists, not feed tasks, so nothing links
 * a step to a screenshot. What we do have is the wiki's file names, and they
 * are unusually literal: `FallingSkiesGWagonUSBSpawn`,
 * `AccidentalWitnessKozlovsHideoutTapeClose`, `Boreas crew quarters keycard
 * door 18 map`. A step titled "Shoreline: G-Wagon flash drive (Tunnel extract)"
 * and an image called `FallingSkiesGWagonUSBSpawn` share the word that matters.
 *
 * So this matches on words, and it is careful about which words count. Eight of
 * the endgame chapters share one wiki page holding 234 photos; matching on
 * "map" or "spawn" would give every step the same fifty pictures. Rarity within
 * the pool decides the weight, and a match needs at least one word that is
 * actually distinctive — which is what stops a wrong photo being shown with
 * total confidence, the failure mode that matters here.
 *
 * A step with no confident match gets no photo, and the UI shows a placeholder
 * slot. That is the honest answer, and a great deal better than a picture of
 * somewhere else.
 */
import type { StoryChapter, StoryStep } from "./story.ts";
import type { TaskImage } from "../types";

export interface StoryMediaData {
  /** Wiki page title -> its screenshots. */
  pages: Record<string, TaskImage[]>;
  /** Chapter id -> the wiki page it lives on. */
  chapters: Record<string, string>;
}

/**
 * Words that appear all over the pool and say nothing about *which* thing is
 * pictured. "map", "spawn" and "location" are the wiki's own filing system, not
 * a subject; the rest are English.
 */
const STOP = new Set([
  "map", "maps", "spawn", "spawns", "location", "locations", "close", "closeup", "far",
  "banner", "screenshot", "showcase", "background", "menu", "main", "the", "and", "for",
  "with", "from", "into", "near", "any", "all", "one", "two", "new", "old", "its",
  "you", "your", "this", "that", "then", "there", "here", "has", "have", "get", "got",
  "but", "not", "are", "was", "can", "will", "also", "out", "off", "put", "pick",
  "quest", "task", "part", "page", "file", "image", "photo", "view", "inside", "outside",
]);

/**
 * Map names locate a photo without identifying it.
 *
 * They count towards coverage — a photo called `Boreas Lighthouse Warehouse
 * Map` is partly about Lighthouse — but they earn no weight of their own, so
 * a photo can never be matched to a step on a map name alone. Without this,
 * `Tour Shoreline Tower` attached itself to "Unlock Woods" because that step's
 * detail happened to mention Shoreline.
 */
const WEAK = new Set([
  "customs", "factory", "wood", "shoreline", "interchange", "reserve", "lighthouse",
  "street", "tarkov", "lab", "labs", "labyrinth", "terminal", "icebreaker", "ground",
  "zero", "activation",
]);

/**
 * Words into a comparable shape. Splits camelCase, because the wiki writes both
 * `FallingSkiesGWagonUSBSpawn` and `Falling Skies Map` and those have to reduce
 * to the same words. Runs of capitals stay whole — `USB` and `GWagon` are words,
 * not three and six of them.
 */
export function words(text: string): string[] {
  return text
    .replace(/([a-z0-9])([A-Z])/g, "$1 $2")
    .replace(/([A-Z]+)([A-Z][a-z])/g, "$1 $2")
    .toLowerCase()
    .split(/[^a-z0-9]+/)
    // A blunt plural strip, so "notes" and "note" are one word. Words of three
    // letters keep their s — "gas" is not a plural.
    .map((w) => (w.length > 3 && w.endsWith("s") && !w.endsWith("ss") ? w.slice(0, -1) : w))
    .filter((w) => w.length >= 3 && !STOP.has(w));
}

/**
 * How rare each word is in this pool, on a 0–1 scale.
 *
 * Normalised by the pool, not left as a raw idf, because the pools differ by a
 * factor of fifteen — Falling Skies has 15 photos and The Ticket has 234. A raw
 * score of 2.0 means "unique" in the first and "one in thirty" in the second,
 * so any fixed threshold over raw idf is really two different thresholds.
 * Here 1 always means "only this photo", whatever the pool.
 */
function rarity(pool: TaskImage[]): Map<string, number> {
  const counts = new Map<string, number>();
  for (const image of pool) {
    for (const word of new Set(words(image.title))) {
      counts.set(word, (counts.get(word) ?? 0) + 1);
    }
  }
  const span = Math.log(Math.max(2, pool.length));
  const out = new Map<string, number>();
  for (const [word, n] of counts) out.set(word, Math.log(pool.length / n) / span);
  return out;
}

/**
 * How much of what an image is *named after* the step has to account for.
 *
 * Coverage of the image, not of the step, is the measure that works. A step is
 * a sentence and will always leave most of itself unmatched; an image called
 * `Chairman house` is about exactly two things, and a step that accounts for
 * only one of them ("stash it in the Island house") is not what it shows.
 */
const MIN_COVERAGE = 0.5;
/**
 * What one word on its own has to be worth, on the 0–1 rarity scale, when it is
 * the only thing the step and the photo agree on.
 *
 * Coverage alone is decided by a single word when a photo is named after two
 * things, which handed "PvP: extract Scav Lands on Reserve" a photo called
 * `Tour Shoreline Map`. Two agreeing words are enough by themselves; one has to
 * be a word the chapter does not use everywhere.
 *
 * Deliberately *not* applied to the two-word case. Requiring rarity there said
 * that six photos of the flight recorder in a nine-photo chapter are not photos
 * of the flight recorder, which is exactly backwards: a chapter mostly about
 * one thing is still about that thing.
 */
const MIN_WEIGHT = 0.6;
/** Below this an image is an establishing shot, not a photo of one step. */
const MIN_CONTENT_WORDS = 2;
/** Nobody reads more than this many photos of one step. */
const PER_STEP = 4;

/** What an image is about: its own words, less the chapter prefix every file carries. */
function subject(image: TaskImage, chapterWords: Set<string>): string[] {
  return [...new Set(words(image.title))].filter((w) => !chapterWords.has(w));
}

interface Scored {
  image: TaskImage;
  step: string;
  score: number;
}

export interface ChapterMedia {
  /** Step id -> its photos, best match first. Absent means none confident. */
  byStep: Map<string, TaskImage[]>;
  /** Photos that belong to this chapter but to no one step — the establishing shots. */
  chapter: TaskImage[];
  /** True when there were photos to search at all, so the UI can tell apart
   *  "no photo for this step" from "no photos for this chapter". */
  pooled: boolean;
}

export function chapterMedia(
  media: StoryMediaData | null,
  chapter: StoryChapter,
  steps: StoryStep[],
): ChapterMedia {
  const empty: ChapterMedia = { byStep: new Map(), chapter: [], pooled: false };
  if (!media) return empty;
  const page = media.chapters[chapter.id];
  const pool = page ? media.pages[page] : undefined;
  if (!pool?.length) return empty;

  const weights = rarity(pool);

  /*
   * On a shared page, narrow to this chapter first. The Ticket's 234 photos
   * cover eight chapters, and the wiki prefixes each one's files with the
   * chapter name — so the chapter's own words are the sharpest filter there is.
   */
  const chapterWords = new Set(words(chapter.name));
  const owned = pool.filter((i) => words(i.title).some((w) => chapterWords.has(w)));
  const searchable = owned.length >= 2 ? owned : pool;

  const stepWords = steps.map((step) => ({
    id: step.id,
    // The detail line carries the specifics — which car, which room, which
    // note — and that is exactly what the file names are named after.
    words: new Set([...words(step.title), ...words(step.location ?? ""), ...words(step.detail)]),
  }));

  /*
   * Each image goes to its *best* step, rather than each step taking its best
   * images. It matters more than it sounds: the Falling Skies step for the
   * G-Wagon drive and the one for Elektronik's flash drive both say "flash
   * drive", so taking the best image per step handed the G-Wagon step a photo
   * of Elektronik's. Asking instead which step each photo belongs to sends
   * each one where it fits best and leaves the other step to find its own.
   */
  const best = new Map<string, Scored>();

  for (const image of searchable) {
    const content = subject(image, chapterWords);
    if (content.length < MIN_CONTENT_WORDS) continue;

    for (const step of stepWords) {
      const matched = content.filter((w) => step.words.has(w));
      if (matched.length / content.length < MIN_COVERAGE) continue;

      // Agreement on map names is not agreement about the subject.
      const strong = matched.filter((w) => !WEAK.has(w));
      if (!strong.length) continue;
      const rare = strong.reduce((n, w) => n + (weights.get(w) ?? 0), 0);
      if (strong.length < 2 && rare < MIN_WEIGHT) continue;

      // More words agreeing beats one rare word agreeing, when both qualify.
      const score = rare + strong.length;
      const current = best.get(image.url);
      if (!current || score > current.score) best.set(image.url, { image, step: step.id, score });
    }
  }

  const byStep = new Map<string, Scored[]>();
  for (const hit of best.values()) {
    const bucket = byStep.get(hit.step);
    if (bucket) bucket.push(hit);
    else byStep.set(hit.step, [hit]);
  }

  const out = new Map<string, TaskImage[]>();
  for (const [stepId, hits] of byStep) {
    hits.sort((a, b) => b.score - a.score || a.image.title.localeCompare(b.image.title));
    out.set(stepId, hits.slice(0, PER_STEP).map((h) => h.image));
  }

  const claimed = new Set([...out.values()].flat().map((i) => i.url));
  return {
    byStep: out,
    // Only from the chapter's own photos: the unclaimed remainder of a shared
    // page belongs to seven other chapters, not to this one.
    chapter: owned.filter((i) => !claimed.has(i.url)).slice(0, 8),
    pooled: true,
  };
}
