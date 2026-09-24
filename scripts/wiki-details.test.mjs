import assert from "node:assert/strict";
import { test } from "node:test";
import {
  bullets,
  parseChapterPage,
  parseKeyPage,
  parseQuestPage,
  plain,
  questItemTable,
  sections,
} from "./wiki-details.mjs";

const QUEST = `{{Infobox quest
|location        =[[Customs]]
|given by        =[[Prapor]]
|LL requirement  =1
|previous        =[[Debut]]
|leads to        =
|reqkappa        =<font color="red">Yes</font>
}}

==Requirements==
* Must be level 5 to start this quest.

==Objectives==
* Obtain the [[Bronze pocket watch on a chain|bronze pocket watch]] on [[Customs]]
** (''Optional'') Obtain the [[Machinery key|key to the fuel tanker truck]]
* Hand over the [[Bronze pocket watch on a chain|found item]]

==Rewards==
* +3,000 [[EXP]]
* [[Prapor]] Rep <font color="green">'''+0.1'''</font>
** 84,000 Roubles with [[Hideout#Modules|Intelligence center]] Level 1

==Guide==
{|class="wikitable"
! colspan="6" |Related Quest Items
|-
!Icon
!Item name
!Amount
!Requirement
!'''[[Found in raid|Find in raid]]'''
!Notes
|-
|[[File:Machinery-key-Icon.png|link=Machinery key]]
|[[Machinery key]]
|1
|Required
! N/A
|Opens the truck.
|-
|[[File:Watch.png|link=Watch]]
|[[Bronze pocket watch on a chain]]
|1
|Handover item
!<font color="red">Yes</font>
|Quest item.
|}
Head into [[Customs]].
<li style="display: inline-block;"><gallery widths="300">
File:Checking Map.png|Dorms
</gallery></li>
===Truck===
The key opens the [[Machinery key|driver door]].

{{Navbox quests}}
[[Category:Quests]]
[[fr:Vérification d'antécédents]]
`;

test("sections are found case-insensitively, with subsections folded in", () => {
  const s = sections(QUEST);
  assert.ok(s.has("objectives"));
  assert.ok(s.get("guide").includes("===Truck==="));
});

test("plain text drops files, galleries, templates, categories and markup", () => {
  const out = plain(
    `A [[File:X.png|thumb|[[Link]] caption]] '''bold''' [[Page|label]] {{T|{{inner}}}} <font color="red">red</font>\n[[Category:Quests]][[de:Seite]]`,
  );
  assert.equal(out, "A bold label red");
});

test("bullets keep depth and lift the optional marker into a flag", () => {
  const out = bullets(sections(QUEST).get("objectives"));
  assert.deepEqual(out, [
    { text: "Obtain the bronze pocket watch on Customs", depth: 1, optional: false },
    { text: "Obtain the key to the fuel tanker truck", depth: 2, optional: true },
    { text: "Hand over the found item", depth: 1, optional: false },
  ]);
});

test("the quest item table reads columns by name", () => {
  assert.deepEqual(questItemTable(QUEST), [
    { name: "Machinery key", amount: 1, requirement: "Required", foundInRaid: null, notes: "Opens the truck." },
    { name: "Bronze pocket watch on a chain", amount: 1, requirement: "Handover item", foundInRaid: true, notes: "Quest item." },
  ]);
});

test("a quest page yields facts, objectives, rewards and a guide", () => {
  const q = parseQuestPage(QUEST);
  assert.equal(q.trader, "Prapor");
  assert.deepEqual(q.locations, ["Customs"]);
  assert.equal(q.loyaltyLevel, 1);
  assert.equal(q.minPlayerLevel, 5);
  assert.equal(q.kappaRequired, true);
  assert.deepEqual(q.previous, ["Debut"]);
  assert.equal(q.rewards.length, 3);
  assert.equal(q.rewards[2].depth, 2);
  assert.deepEqual(q.guide, [
    { heading: null, text: "Head into Customs." },
    { heading: "Truck", text: "The key opens the driver door." },
  ]);
});

test("a trader loyalty level is not mistaken for a player level", () => {
  const q = parseQuestPage(`==Requirements==\n* Obtain level 2 loyalty with [[Prapor]]\n`);
  assert.equal(q.minPlayerLevel, null);
  assert.equal(q.kappaRequired, null);
});

test("a key page yields spawn spots per map, the lock, and what is behind it", () => {
  const k = parseKeyPage(`{{Infobox key
|usage              =Unlocks the tower on [[Customs]].
|node               =5913915886f774123603c392
}}
==Quests==
* Used in the Quest [[Aid Stations]]
==Key Location==
* In [[Jacket]]s
===[[Customs]]===
* On a trash bag in the blue guard shack.
==Lock Location==
Door to the tower on [[Customs]].
==Behind the Lock==
* 2x Grenade box
{{Navbox keys}}
[[Category:Keys]]
[[cs:Klíč]]
`);
  assert.equal(k.itemId, "5913915886f774123603c392");
  assert.equal(k.usage, "Unlocks the tower on Customs.");
  assert.deepEqual(k.found, [
    { map: null, spots: ["In Jackets"] },
    { map: "Customs", spots: ["On a trash bag in the blue guard shack."] },
  ]);
  assert.equal(k.lock, "Door to the tower on Customs.");
  assert.equal(k.behind, "• 2x Grenade box");
  assert.deepEqual(k.quests, ["Aid Stations"]);
});

test("a chapter page keeps objectives grouped under their path headings", () => {
  const c = parseChapterPage(`==Requirements==
Visit one of:
* The radome on [[Reserve]]
==Objectives==
* Arrive at the port
===If you refuse Mr. Kerman's offer===
* Pay the debt
** (''Optional'') Keep the case
==Guide==
===Arrive===
Walk in.
`);
  assert.equal(c.start, "Visit one of:\n• The radome on Reserve");
  assert.deepEqual(c.objectives, [
    { heading: null, items: [{ text: "Arrive at the port", depth: 1, optional: false }] },
    {
      heading: "If you refuse Mr. Kerman's offer",
      items: [
        { text: "Pay the debt", depth: 1, optional: false },
        { text: "Keep the case", depth: 2, optional: true },
      ],
    },
  ]);
  assert.deepEqual(c.guide, [{ heading: "Arrive", text: "Walk in." }]);
});

test("a page missing every section parses to empties, not a throw", () => {
  const q = parseQuestPage("Just prose.");
  assert.deepEqual(q.objectives, []);
  assert.deepEqual(q.items, []);
  assert.deepEqual(q.guide, []);
  assert.deepEqual(parseKeyPage("").found, []);
});
