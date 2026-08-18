import assert from "node:assert/strict";
import { test } from "node:test";
import {
  candidateLines,
  fold,
  matchTasks,
  similarity,
  stripChrome,
  CONFIDENT,
} from "./ocr-match.ts";

/* A slice of Prapor's real list — the set a Prapor screenshot competes against. */
const PRAPOR = [
  { id: "debut", name: "Debut" },
  { id: "checking", name: "Checking" },
  { id: "shootout", name: "Shootout Picnic" },
  { id: "delivery", name: "Delivery from the Past" },
  { id: "bad-rep", name: "Bad Rep Evidence" },
  { id: "ice-cream", name: "Ice Cream Cones" },
  { id: "punisher1", name: "The Punisher - Part 1" },
  { id: "punisher2", name: "The Punisher - Part 2" },
  { id: "punisher3", name: "The Punisher - Part 3" },
  { id: "bp-depot", name: "BP Depot" },
];

test("clean text matches exactly and confidently", () => {
  const { matches, unmatched } = matchTasks("Debut\nShootout Picnic\nBP Depot", PRAPOR);

  assert.deepEqual(matches.map((m) => m.id).sort(), ["bp-depot", "debut", "shootout"]);
  assert.equal(unmatched.length, 0);
  assert.ok(matches.every((m) => m.score >= CONFIDENT));
});

test("the confusions OCR actually makes still land", () => {
  // l/I/1, O/0, rn/m — shape collisions, which is most of what goes wrong.
  const { matches } = matchTasks("Shootoul Picnlc\nBad Rep Evldence\nlce Cream C0nes", PRAPOR);

  assert.deepEqual(matches.map((m) => m.id).sort(), ["bad-rep", "ice-cream", "shootout"]);
});

test("near-identical siblings are not confused with each other", () => {
  // Every word shared but one — the case a word-overlap score alone gets
  // wrong, and the reason similarity takes the better of two measures.
  const { matches } = matchTasks("The Punisher - Part 2", PRAPOR);

  assert.equal(matches.length, 1);
  assert.equal(matches[0].id, "punisher2");
});

test("one task cannot be claimed twice", () => {
  const { matches } = matchTasks("Debut\nDebut\nDebut", PRAPOR);
  assert.equal(matches.filter((m) => m.id === "debut").length, 1);
});

test("a name wrapped across two lines is rejoined", () => {
  const { matches } = matchTasks("Delivery from\nthe Past", PRAPOR);

  assert.equal(matches.length, 1);
  assert.equal(matches[0].id, "delivery");
});

test("interface chrome is not forced onto a task", () => {
  const { matches, unmatched } = matchTasks(
    "COMPLETED\nTurn in\n3/5\nAvailable\nDebut\nLevel 12",
    PRAPOR,
  );

  assert.deepEqual(matches.map((m) => m.id), ["debut"]);
  assert.deepEqual(unmatched, []);
});

test("text that is nobody's task is reported, not forced", () => {
  const { matches, unmatched } = matchTasks("Ballistic Analysis\nDebut", PRAPOR);

  assert.deepEqual(matches.map((m) => m.id), ["debut"]);
  assert.deepEqual(unmatched, ["Ballistic Analysis"]);
});

test("an empty or useless screenshot yields nothing rather than guesses", () => {
  assert.deepEqual(matchTasks("", PRAPOR), { matches: [], unmatched: [] });
  assert.deepEqual(matchTasks("   \n\n  ", PRAPOR), { matches: [], unmatched: [] });
  assert.deepEqual(matchTasks("Debut", []), { matches: [], unmatched: [] });
});

test("folding ignores what OCR gets arbitrarily wrong", () => {
  assert.equal(fold("The Punisher — Part 1"), fold("the punisher - part 1"));
  assert.equal(fold("Ice-Cream Cones!"), fold("Ice Cream Cones"));
  assert.equal(fold("  DEBUT  "), "debut");
});

test("similarity is bounded and ordered sensibly", () => {
  assert.equal(similarity("debut", "debut"), 1);
  assert.equal(similarity("", "debut"), 0);
  assert.ok(similarity("debut", "debu") > similarity("debut", "checking"));
  assert.ok(similarity(fold("The Punisher - Part 1"), fold("The Punisher - Part 2")) < 1);
});

test("line filtering drops prose and counters but keeps names", () => {
  const lines = candidateLines(
    [
      "Debut",
      "12/30",
      "%%%",
      "Eliminate 5 Scavs on Customs while using a shotgun and then hand over the items",
      "BP Depot",
    ].join("\n"),
  );

  assert.deepEqual(lines, ["Debut", "BP Depot"]);
});

test("a status on the same row as the name still matches", () => {
  // The case that broke this the first time it met a realistic screenshot.
  // The game puts the status to the right of the name, so OCR reads one line.
  const { matches } = matchTasks(
    [
      "Debut In progress",
      "Shootout Picnic In progress",
      "Bad Rep Evidence Completed",
      "BP Depot 3/5",
    ].join("\n"),
    PRAPOR,
  );

  assert.deepEqual(
    matches.map((m) => m.id).sort(),
    ["bad-rep", "bp-depot", "debut", "shootout"],
  );
  assert.ok(
    matches.every((m) => m.score >= CONFIDENT),
    `all should be confident, got ${JSON.stringify(matches.map((m) => [m.name, m.score]))}`,
  );
});

test("stripping chrome leaves the name alone when there is none", () => {
  assert.equal(stripChrome("Debut"), "Debut");
  assert.equal(stripChrome("Debut In progress"), "Debut");
  assert.equal(stripChrome("Completed  Ice Cream Cones"), "Ice Cream Cones");
  assert.equal(stripChrome("BP Depot 3/5"), "BP Depot");
  assert.equal(stripChrome("The Punisher - Part 1"), "The Punisher - Part 1");
});
