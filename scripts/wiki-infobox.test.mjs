import assert from "node:assert/strict";
import { test } from "node:test";
import { foldName, infoboxParam, pageTitle, questEdges, wikiLinks } from "./wiki-infobox.mjs";

/* Trimmed from the real Debut and Search Mission pages. */
const DEBUT = `{{Infobox quest
|icon         =
|image        =DebutQuestPicture.png
|given by     =[[Prapor]]
|previous     =
|leads to     =[[Search Mission]]<br/>[[Luxurious Life]]
|reqkappa     =<font color="red">Yes</font>
}}

'''{{PAGENAME}}''' is a [[Quests|Quest]].`;

const SEARCH = `{{Infobox quest
|given by     =[[Prapor]]
|previous     =[[Debut]]
|leads to     =
}}`;

test("a parameter reads up to the next one", () => {
  assert.equal(infoboxParam(DEBUT, "image"), "DebutQuestPicture.png");
  assert.equal(infoboxParam(SEARCH, "previous"), "[[Debut]]");
});

test("an empty parameter is empty, not missing", () => {
  assert.equal(infoboxParam(DEBUT, "previous"), "");
  assert.equal(infoboxParam(DEBUT, "nonexistent"), null);
});

test("a piped link does not cut the value in half", () => {
  // Splitting on "|" alone loses everything after the pipe.
  const text = "{{Infobox quest\n|previous =[[Quests|The Quest]]\n|leads to =[[Next]]\n}}";
  assert.equal(infoboxParam(text, "previous"), "[[Quests|The Quest]]");
  assert.deepEqual(wikiLinks(infoboxParam(text, "previous")), ["Quests"]);
});

test("the last parameter stops at the template's own closing braces", () => {
  assert.equal(infoboxParam(SEARCH, "leads to"), "");
  const tail = "{{Infobox quest\n|leads to =[[Last One]]\n}}\n\nBody text [[Not A Link Value]]";
  assert.deepEqual(wikiLinks(infoboxParam(tail, "leads to")), ["Last One"]);
});

test("links give the target, never the label, and drop anchors", () => {
  assert.deepEqual(wikiLinks("[[Page|shown text]]"), ["Page"]);
  assert.deepEqual(wikiLinks("[[Page#Section]]"), ["Page"]);
  assert.deepEqual(wikiLinks("[[A]]<br/>[[B]]"), ["A", "B"]);
  assert.deepEqual(wikiLinks(""), []);
  assert.deepEqual(wikiLinks(null), []);
});

test("both directions of the same edge are read", () => {
  assert.deepEqual(questEdges(DEBUT), {
    previous: [],
    leadsTo: ["Search Mission", "Luxurious Life"],
  });
  assert.deepEqual(questEdges(SEARCH), { previous: ["Debut"], leadsTo: [] });
});

test("folding survives the punctuation the three sources disagree on", () => {
  assert.equal(foldName("Gunsmith - Part 5"), foldName("Gunsmith – Part 5"));
  assert.equal(foldName("Gunsmith_-_Part_5"), foldName("Gunsmith - Part 5"));
  assert.equal(foldName("The Punisher — Part 1"), foldName("The Punisher - Part 1"));
  assert.equal(foldName("Don't Touch It"), foldName("Don’t Touch It"));
  assert.notEqual(foldName("Debut"), foldName("Delivery"));
});

test("page titles come out of the feed's own wiki urls", () => {
  assert.equal(
    pageTitle("https://escapefromtarkov.fandom.com/wiki/Background_Check"),
    "Background Check",
  );
  assert.equal(
    pageTitle("https://escapefromtarkov.fandom.com/wiki/Gunsmith_%E2%80%93_Part_5"),
    "Gunsmith – Part 5",
  );
  assert.equal(pageTitle("not a url"), null);
  assert.equal(pageTitle(null), null);
});
