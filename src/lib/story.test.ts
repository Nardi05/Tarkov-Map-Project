import assert from "node:assert/strict";
import { test } from "node:test";
import {
  STORY,
  STORY_ENDING_IDS,
  chaptersForSetup,
  choiceConflicts,
  effectiveChoices,
  endingById,
  emptyStory,
  hideoutLevels,
  locksForEnding,
  mergeStory,
  progressFor,
  stepIsDone,
  stepsForEnding,
  storyStepsOnMap,
  warningsForEnding,
} from "./story.ts";
import type { HideoutStation } from "../types.ts";

test("four endings, unique ids, Savior ranked best", () => {
  assert.deepEqual(
    STORY.endings.map((e) => e.id),
    STORY_ENDING_IDS,
  );
  assert.equal(endingById("savior")?.rank, 1);
  assert.equal(endingById("fallen")?.outcome, "worst");
  assert.equal(new Set(STORY.endings.map((e) => e.id)).size, 4);
});

test("every lock option, chapter, step and evidence id is unique", () => {
  const lockIds = STORY.locks.map((l) => l.id);
  assert.equal(new Set(lockIds).size, lockIds.length);
  const chapterIds = STORY.chapters.map((c) => c.id);
  assert.equal(new Set(chapterIds).size, chapterIds.length);
  const stepIds = STORY.chapters.flatMap((c) => c.steps.map((s) => s.id));
  assert.equal(new Set(stepIds).size, stepIds.length, "duplicate step ids");
  const evIds = STORY.evidence.map((e) => e.id);
  assert.equal(new Set(evIds).size, evIds.length);
  assert.equal(STORY.evidence.filter((e) => e.major).length, 9);
  assert.equal(STORY.minorEvidence.length, 36);
});

test("Savior wants keep / accept / agree / eight", () => {
  const savior = endingById("savior")!;
  assert.deepEqual(savior.choices, {
    case: "keep",
    kerman: "accept",
    dirt: "agree",
    evidence: "eight",
  });
  assert.equal(locksForEnding(savior).length, 4);
  assert.ok(warningsForEnding("savior").some((w) => /Alpha-1/.test(w.text)));
});

test("refusing Kerman bricks Savior and is the Survivor lock", () => {
  const savior = endingById("savior")!;
  const conflicts = choiceConflicts(savior, { kerman: "refuse" });
  assert.equal(conflicts.length, 1);
  assert.equal(conflicts[0].lock.id, "kerman");
  const survivor = endingById("survivor")!;
  assert.equal(choiceConflicts(survivor, { kerman: "refuse" }).length, 0);
});

test("Savior path includes Alpha-1 and 8-of-9; Survivor does not", () => {
  const savior = endingById("savior")!;
  const saviorSteps = stepsForEnding("savior", effectiveChoices(savior, {}));
  const titles = saviorSteps.map((r) => r.step.title);
  assert.ok(titles.some((t) => /Alpha-1/.test(t)));
  assert.ok(titles.some((t) => /8 of 9/.test(t)));
  assert.ok(titles.some((t) => /ACCEPT Kerman/.test(t)));
  assert.equal(
    titles.some((t) => /REFUSE Kerman/.test(t)),
    false,
  );

  const survivor = endingById("survivor")!;
  const survSteps = stepsForEnding("survivor", effectiveChoices(survivor, {}));
  const survTitles = survSteps.map((r) => r.step.title);
  assert.ok(survTitles.some((t) => /REFUSE Kerman/.test(t)));
  assert.equal(
    survTitles.some((t) => /Alpha-1/.test(t)),
    false,
  );
  assert.equal(
    survTitles.some((t) => /8 of 9/.test(t)),
    false,
  );
});

test("giving Prapor the case adds the Lightkeeper retrieval on Savior", () => {
  const planned = stepsForEnding("savior", { case: "keep", kerman: "accept", dirt: "agree", evidence: "eight" });
  const given = stepsForEnding("savior", { case: "give", kerman: "accept", dirt: "agree", evidence: "eight" });
  assert.equal(
    planned.some((r) => r.chapter.id === "retrieve-case"),
    false,
  );
  assert.ok(given.some((r) => r.chapter.id === "retrieve-case"));
});

test("progress counts required steps and next-up skips what is done", () => {
  const savior = endingById("savior")!;
  const fresh = progressFor(savior, {}, {}, {});
  assert.ok(fresh.required > 10);
  assert.equal(fresh.requiredDone, 0);
  assert.equal(fresh.evidenceNeed, 8);
  assert.equal(fresh.evidenceTotal, 9);
  assert.equal(fresh.next[0]?.step.id, "tour-ground-zero");

  const ticks = { "tour-ground-zero": true as const, "tour-therapist": true as const };
  const mid = progressFor(savior, ticks, {}, {});
  assert.equal(mid.requiredDone, 2);
  assert.equal(mid.next[0]?.step.id, "tour-streets-pay");
});

test("Savior includes every evidence storyline and all 9 major pieces", () => {
  const savior = endingById("savior")!;
  const steps = stepsForEnding("savior", effectiveChoices(savior, {}));
  const chapterIds = new Set(steps.map((r) => r.chapter.id));
  for (const id of [
    "accidental-witness",
    "batya",
    "blue-fire",
    "boreas",
    "labyrinth",
    "unheard",
    "already-here",
    "ms-a",
  ]) {
    assert.ok(chapterIds.has(id), `missing storyline ${id}`);
  }
  for (const ev of STORY.evidence.filter((e) => e.major)) {
    assert.ok(
      steps.some((r) => r.step.id === ev.id),
      `missing evidence step ${ev.id}`,
    );
  }
  const stats = progressFor(savior, {}, {}, {});
  assert.equal(stats.parallel.length, 8);
  assert.ok(stats.required > 80);
});

test("Survivor skips the evidence storylines", () => {
  const survivor = endingById("survivor")!;
  const steps = stepsForEnding("survivor", effectiveChoices(survivor, {}));
  assert.equal(
    steps.some((r) => r.chapter.id === "accidental-witness"),
    false,
  );
});

test("a hideout station already built ticks the matching step", () => {
  const stations: HideoutStation[] = [
    {
      id: "intel",
      name: "Intelligence Center",
      image: null,
      levels: [
        { id: "intel-1", level: 1, itemRequirements: [], stationLevelRequirements: [] },
        { id: "intel-2", level: 2, itemRequirements: [], stationLevelRequirements: [] },
        { id: "intel-3", level: 3, itemRequirements: [], stationLevelRequirements: [] },
      ],
    },
  ];
  const built = hideoutLevels(stations, { "intel-1": "completed", "intel-2": "completed", "intel-3": "completed" });
  assert.equal(built["Intelligence Center"], 3);
  const step = STORY.chapters.flatMap((c) => c.steps).find((s) => s.id === "open-intel-1")!;
  assert.equal(stepIsDone(step, {}, built), true);
  assert.equal(stepIsDone(step, {}, {}), false);
});

test("mergeStory fills a missing slice and drops junk", () => {
  assert.deepEqual(mergeStory(undefined), emptyStory());
  const merged = mergeStory({
    target: "savior",
    ticks: { a: true, b: false },
    choices: { kerman: "accept", dirt: 3 },
  });
  assert.equal(merged.target, "savior");
  assert.deepEqual(merged.ticks, { a: true });
  assert.deepEqual(merged.choices, { kerman: "accept" });
});

test("Debtor and Fallen each have their own grind chapter", () => {
  const debtor = stepsForEnding("debtor", effectiveChoices(endingById("debtor")!, {}));
  assert.ok(debtor.some((r) => /100 PMC dogtags/.test(r.step.title)));
  const fallen = stepsForEnding("fallen", effectiveChoices(endingById("fallen")!, {}));
  assert.ok(fallen.some((r) => /1,000,000 USD/.test(r.step.title)));
});

test("story setup with no ending offers only chapters every ending shares", () => {
  const rows = chaptersForSetup(null, {});
  assert.ok(rows.length > 0);
  for (const row of rows) {
    assert.equal(row.chapter.endings, undefined, row.chapter.id);
    assert.ok(row.stepIds.length > 0);
  }
  assert.ok(rows.some((r) => r.chapter.id === "tour"));
});

test("story setup for an ending matches the guide's steps for it", () => {
  for (const id of STORY_ENDING_IDS) {
    const ending = endingById(id)!;
    const choices = effectiveChoices(ending, {});
    const fromSetup = chaptersForSetup(id, choices).flatMap((r) => r.stepIds).sort();
    const fromGuide = stepsForEnding(id, choices).map((r) => r.step.id).sort();
    assert.deepEqual(fromSetup, fromGuide, id);
  }
});

test("the map lists only unfinished target steps pinned to that map", () => {
  assert.deepEqual(storyStepsOnMap(emptyStory(), "ground-zero"), []);
  const story = { ...emptyStory(), target: "survivor" };
  const rows = storyStepsOnMap(story, "ground-zero");
  assert.ok(rows.length > 0);
  assert.ok(rows.every((r) => r.step.maps?.includes("ground-zero")));
  const done = { ...story, ticks: Object.fromEntries(rows.map((r) => [r.step.id, true as const])) };
  assert.deepEqual(storyStepsOnMap(done, "ground-zero"), []);
});
