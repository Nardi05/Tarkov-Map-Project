/**
 * What the story photo matcher actually picks, chapter by chapter.
 *
 * Not a test — a thing to read. The matcher is a heuristic over 625 wiki file
 * names, and the only way to know whether a threshold is right is to look at
 * what it chose and ask whether that is the photo you wanted. Run it after
 * touching `lib/story-media.ts` or refetching the images.
 *
 *   node --experimental-strip-types scripts/story-media-report.mjs
 *   node --experimental-strip-types scripts/story-media-report.mjs falling-skies
 */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { chapterMedia } from "../src/lib/story-media.ts";

const ROOT = path.join(path.dirname(fileURLToPath(import.meta.url)), "..");
const read = (p) => JSON.parse(fs.readFileSync(path.join(ROOT, p), "utf8"));

const media = read("data/task-images.json").story;
const chapters = [
  ...read("src/data/story-endings.json").chapters,
  ...read("src/data/story-storylines.json").chapters,
];

const only = process.argv[2];
let steps = 0;
let withPhoto = 0;

for (const chapter of chapters) {
  if (only && chapter.id !== only) continue;
  const result = chapterMedia(media, chapter, chapter.steps);
  const page = media.chapters[chapter.id];
  const hit = chapter.steps.filter((s) => result.byStep.has(s.id)).length;
  steps += chapter.steps.length;
  withPhoto += hit;

  console.log(
    `\n=== ${chapter.id}  (${page}, pool ${media.pages[page]?.length ?? 0}) — ${hit}/${chapter.steps.length} steps matched`,
  );
  for (const step of chapter.steps) {
    const shots = result.byStep.get(step.id);
    console.log(`  ${shots ? "*" : " "} ${step.title.slice(0, 74)}`);
    for (const s of shots ?? []) console.log(`      ${s.title}`);
  }
  if (result.chapter.length) {
    console.log(`  + chapter gallery: ${result.chapter.map((i) => i.title).join(", ")}`);
  }
}

console.log(`\n${withPhoto}/${steps} steps have at least one photo`);
