import assert from "node:assert/strict";
import { test } from "node:test";
import { chapterMedia, words, type StoryMediaData } from "./story-media.ts";
import type { StoryChapter, StoryStep } from "./story";
import type { TaskImage } from "../types";

const shot = (title: string): TaskImage => ({
  url: `https://wiki/${title.replace(/\s+/g, "_")}.png`,
  width: 1920,
  height: 1080,
  title,
});

function step(id: string, title: string, detail = "", location?: string): StoryStep {
  return { id, title, detail, kind: "item", ...(location ? { location } : null) };
}

function chapter(name: string, steps: StoryStep[], id = "ch"): StoryChapter {
  return {
    id,
    number: 1,
    name,
    tone: "blue",
    summary: "",
    wiki: "",
    howToStart: "",
    maps: [],
    steps,
  };
}

const media = (page: string, titles: string[], chapterId = "ch"): StoryMediaData => ({
  pages: { [page]: titles.map(shot) },
  chapters: { [chapterId]: page },
});

/* ----------------------------------------------------------------- words */

test("camelCase splits, and runs of capitals stay whole", () => {
  assert.deepEqual(words("FallingSkiesGWagonUSBSpawn"), ["falling", "skie", "wagon", "usb"]);
});

test("the wiki's two spellings of one name reduce to the same words", () => {
  assert.deepEqual(words("FallingSkiesMap"), words("Falling Skies Map"));
});

test("filing words earn nothing, because every photo has them", () => {
  assert.deepEqual(words("Armory key Spawn Map"), ["armory", "key"]);
});

/* --------------------------------------------------------------- matching */

test("no data at all is not an error, just nothing", () => {
  const out = chapterMedia(null, chapter("Tour", []), []);
  assert.equal(out.pooled, false);
  assert.equal(out.byStep.size, 0);
});

test("a chapter whose wiki page has no photos reports nothing pooled", () => {
  const out = chapterMedia({ pages: { Tour: [] }, chapters: { ch: "Tour" } }, chapter("Tour", []), []);
  assert.equal(out.pooled, false);
});

test("a photo lands on the step it is named after", () => {
  const steps = [
    step("a", "Take the armored case from behind the cockpit"),
    step("b", "Hand Prapor five dogtags"),
  ];
  const out = chapterMedia(
    media("Falling Skies", ["FallingSkiesArmoredCaseSpawn", "Falling Skies Banner"]),
    chapter("Falling Skies", steps),
    steps,
  );
  assert.deepEqual(out.byStep.get("a")?.map((i) => i.title), ["FallingSkiesArmoredCaseSpawn"]);
  assert.equal(out.byStep.has("b"), false);
});

test("two steps sharing words get the photo that fits best, not both", () => {
  // The real case: both Falling Skies steps say "flash drive", and only one of
  // them is about Elektronik's. Taking the best photo per step gave the G-Wagon
  // step a picture of the wrong drive.
  const steps = [
    step("gwagon", "Shoreline: G-Wagon flash drive", "Hand the drive to Prapor."),
    step("chairman", "Chairman's house: crew transcript + Elektronik's flash drive"),
  ];
  const out = chapterMedia(
    media("Falling Skies", [
      "FallingSkiesElektroniksFlashDrive",
      "FallingSkiesGWagonUSBSpawn",
      "FallingSkiesFlightRecorderSpawn",
    ]),
    chapter("Falling Skies", steps),
    steps,
  );
  assert.deepEqual(out.byStep.get("chairman")?.map((i) => i.title), [
    "FallingSkiesElektroniksFlashDrive",
  ]);
  assert.deepEqual(out.byStep.get("gwagon")?.map((i) => i.title), ["FallingSkiesGWagonUSBSpawn"]);
});

test("a map name alone never places a photo", () => {
  // "Unlock Woods" mentions Shoreline in passing; that is not a reason to show
  // a photo of a Shoreline tower.
  const steps = [step("a", "Unlock Woods", "Extract Survived. Shoreline stays closed.")];
  const out = chapterMedia(
    media("Tour", ["Tour Shoreline Tower", "Tour Banner"]),
    chapter("Tour", steps),
    steps,
  );
  assert.equal(out.byStep.size, 0);
});

test("but a map name plus a real subject still places one", () => {
  const steps = [step("a", "Lighthouse: directive in the north freight warehouse")];
  const out = chapterMedia(
    media("Boreas", ["Boreas Lighthouse Warehouse Map", "Boreas Banner", "Boreas Equipment"]),
    chapter("Boreas", steps),
    steps,
  );
  assert.deepEqual(out.byStep.get("a")?.map((i) => i.title), ["Boreas Lighthouse Warehouse Map"]);
});

test("a photo named after one thing is an establishing shot, not a step", () => {
  const steps = [step("a", "Find the crashed plane on Woods")];
  const out = chapterMedia(
    media("Falling Skies", ["Woods Showcase", "Falling Skies Plane Wreck", "Falling Skies Banner"]),
    chapter("Falling Skies", steps),
    steps,
  );
  // "Woods Showcase" reduces to one word and never competes.
  assert.equal(
    out.byStep.get("a")?.some((i) => i.title === "Woods Showcase") ?? false,
    false,
  );
});

test("unclaimed photos become the chapter's gallery", () => {
  const steps = [step("a", "Take the armored case")];
  const out = chapterMedia(
    media("Falling Skies", ["FallingSkiesArmoredCaseSpawn", "Falling Skies Banner", "Falling Skies Map"]),
    chapter("Falling Skies", steps),
    steps,
  );
  assert.deepEqual(out.chapter.map((i) => i.title), ["Falling Skies Banner", "Falling Skies Map"]);
});

test("a shared wiki page narrows to the chapter that owns the photo", () => {
  // Eight endgame chapters share The Ticket's 234 photos; the wiki prefixes
  // each one's files with the chapter it belongs to.
  const pool = [
    "AccidentalWitnessAnastasiaMailboxNote",
    "AccidentalWitnessAnastasiaBuildingEntrance",
    "AccidentalWitnessPashaNote",
    "BoreasScientistIntercom",
    "BoreasEngineRoomDoor",
    "The Ticket Banner",
  ];
  const steps = [
    step("a", "Locate Anastasia's apartment, then the mailbox", "Her building entrance is off the courtyard."),
  ];
  const out = chapterMedia(
    media("The Ticket", pool),
    chapter("Accidental Witness", steps),
    steps,
  );
  assert.equal(out.byStep.get("a")?.length, 2);
  assert.equal(
    out.byStep.get("a")?.every((i) => i.title.startsWith("AccidentalWitness")),
    true,
  );
  // And nothing from another chapter leaks into this one's gallery either.
  assert.equal(out.chapter.some((i) => i.title.startsWith("Boreas")), false);
});

test("a step's location counts as much as its title", () => {
  // Nothing in the title says G-Wagon; the location is the only place it appears.
  const steps = [step("a", "Grab the drive", "Driver-side running board.", "G-Wagon by Tunnel")];
  const out = chapterMedia(
    media("Falling Skies", [
      "FallingSkiesGWagonUSBSpawn",
      "FallingSkiesGWagonUSBMap",
      "FallingSkiesArmoredCaseSpawn",
      "FallingSkiesFlightRecorderSpawn",
      "FallingSkiesKermanNoteSpawn",
      "Falling Skies Banner",
    ]),
    chapter("Falling Skies", steps),
    steps,
  );
  assert.deepEqual(out.byStep.get("a")?.map((i) => i.title), [
    "FallingSkiesGWagonUSBMap",
    "FallingSkiesGWagonUSBSpawn",
  ]);
});

test("at most four photos per step", () => {
  const steps = [step("a", "Find the flight recorder")];
  const out = chapterMedia(
    media("Falling Skies", [
      ...[1, 2, 3, 4, 5, 6].map((n) => `FallingSkiesFlightRecorderSpawn ${n}`),
      "FallingSkiesArmoredCaseSpawn",
      "FallingSkiesKermanNoteSpawn",
      "Falling Skies Banner",
    ]),
    chapter("Falling Skies", steps),
    steps,
  );
  assert.equal(out.byStep.get("a")?.length, 4);
});
