/**
 * Collects the Kord Breach battle-pass document spawns from the EFT wiki and
 * caches them in data/kord-documents.json, which is committed to the repo.
 *
 *   npm run kord-docs
 *
 * Deliberately NOT part of `npm run data`, for the same reason as
 * fetch-task-images.mjs: a deploy must not depend on the wiki being up.
 *
 * ## Why the wiki and not a data feed
 *
 * tarkov.dev does not model these at all — the whole feed has one unrelated
 * Prapor task called "Documents". The community map editor at
 * github.com/KalleLeskinen/KordMap keeps its markers in a Postgres database
 * behind Next.js server actions; the only data committed to that repo is a
 * 1.6KB list of which document types appear on which map, with no positions.
 * The wiki is the one public source that documents individual spawns.
 *
 * ## What it can and cannot give us
 *
 * Each spawn is a screenshot plus a sentence: "Inside 3 story dorms, in room
 * 304 on the nightstand". Accurate, but prose — there are no coordinates
 * anywhere, so nothing here can produce a surveyed pin.
 *
 * What it can do is anchor a spawn to a named place. We already ship 303 place
 * labels with positions in src/data/geo.json ("Dorms", "Crackhouse", "Big
 * Red"), and the wiki's sentences name those same places, because both are
 * written by the same community using the same vocabulary. So a spawn whose
 * description contains a known label is pinned at that label and flagged
 * approximate; everything else keeps its description and screenshot and is
 * listed without a pin. Nothing is dropped and nothing is invented — a pin
 * means "the wiki says this document spawns somewhere in Dorms", which is the
 * honest reading of the source.
 */
import fs from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = path.join(path.dirname(fileURLToPath(import.meta.url)), "..");
const OUT = path.join(ROOT, "data", "kord-documents.json");
const GEO = path.join(ROOT, "src", "data", "geo.json");
const API = "https://escapefromtarkov.fandom.com/api.php";
const UA = "tarkov-map-project/0.1 (personal fan project; contact via GitHub)";

/** The eight battle-pass documents, as the wiki titles them. */
const DOCUMENTS = [
  "Blueprints and technical documentation",
  "Financial documents",
  "Medical documents",
  "PMC personnel files",
  "Project documentation",
  "Technical documentation",
  "Test documentation",
  "User documentation",
];

/** Wiki section headings -> our normalizedName. */
const MAP_ALIASES = {
  customs: "customs",
  factory: "factory",
  "ground zero": "ground-zero",
  interchange: "interchange",
  "the lab": "the-lab",
  labs: "the-lab",
  "the labyrinth": "the-labyrinth",
  labyrinth: "the-labyrinth",
  lighthouse: "lighthouse",
  reserve: "reserve",
  shoreline: "shoreline",
  "streets of tarkov": "streets-of-tarkov",
  streets: "streets-of-tarkov",
  woods: "woods",
  icebreaker: "icebreaker",
  terminal: "terminal",
};

/* ------------------------------------------------------------------- wiki io */

async function api(params, attempt = 0) {
  const url = `${API}?${new URLSearchParams({ format: "json", formatversion: "2", ...params })}`;
  try {
    const res = await fetch(url, { headers: { "user-agent": UA } });
    if (res.status === 429 || res.status >= 500) throw new Error(`HTTP ${res.status}`);
    if (!res.ok) return null;
    return await res.json();
  } catch (err) {
    if (attempt >= 3) {
      console.warn(`  ! ${params.page ?? params.titles}: ${err.message}`);
      return null;
    }
    await new Promise((r) => setTimeout(r, 500 * 2 ** attempt));
    return api(params, attempt + 1);
  }
}

/* ------------------------------------------------------------------ parsing */

/** Turns `[[Page|shown]]` / `[[Page]]` / `''emphasis''` into plain prose. */
function clean(text) {
  return text
    .replace(/\[\[([^\]|]+)\|([^\]]+)\]\]/g, "$2")
    .replace(/\[\[([^\]]+)\]\]/g, "$1")
    .replace(/'{2,}/g, "")
    .replace(/<[^>]+>/g, "")
    .replace(/\s+/g, " ")
    .trim();
}

/**
 * The Location section is a run of `===[[Map]]===` headings, each followed by a
 * <gallery> whose lines are `File:shot.png|where it is`. Both the heading level
 * and the gallery wrapper vary between pages, so this tracks the current map
 * heading and takes any File: line under it rather than trying to match one
 * rigid shape.
 */
function parseLocations(wikitext) {
  const section =
    (wikitext.match(/==\s*Location[s]?\s*==([\s\S]*?)(?=\n==[^=][\s\S]*?==|$)/i) ?? [])[1] ?? "";
  if (!section) return [];

  const out = [];
  let map = null;
  for (const line of section.split("\n")) {
    const heading = line.match(/^\s*={3,}\s*(.+?)\s*={3,}\s*$/);
    if (heading) {
      const name = clean(heading[1]).toLowerCase();
      map = MAP_ALIASES[name] ?? null;
      if (!map) console.warn(`  ? unrecognised map heading: "${clean(heading[1])}"`);
      continue;
    }
    if (!map) continue;
    const file = line.match(/^\s*(?:\*\s*)?File:([^|\]]+?\.(?:png|jpe?g|webp))\s*\|(.+)$/i);
    if (!file) continue;
    const note = clean(file[2]);
    if (note) out.push({ map, file: `File:${file[1].trim()}`, note });
  }
  return out;
}

/* --------------------------------------------------------------- geocoding */

/**
 * Wording the wiki uses for a place we label differently.
 *
 * Only unambiguous synonyms belong here — one phrase that can only mean one
 * labelled place on that map. Anything that could plausibly be two places
 * (Labs' "infirmary", which is both Infirmary Lvl 1 and Lvl 2; Factory's
 * "gate 2"/"gate 3", which we do not label at all) is deliberately left out
 * and ships unpinned. A pin in the wrong room is worse than no pin, because
 * the reader has no way to tell it is wrong.
 */
const PLACE_ALIASES = {
  factory: {
    "medical tent": "Med Tent",
    "medical area": "Med Tent",
    "breachable room": "Breach Room",
    "breachable door": "Breach Room",
    offices: "Office Building",
    "office building": "Office Building",
  },
  "the-lab": {
    "recreation zone": "Recreation Area",
    "lecture room": "Lecture Hall",
    "server room": "Server Room",
    "sterile lab": "Sterile Laboratory",
  },
  reserve: {
    "white pawn building": "White Pawn",
    "black pawn building": "Black Pawn",
  },
  lighthouse: {
    // No `chalet` alias. Lighthouse has several — the wiki names a blue one, a
    // black one, a north one and a south one — and we label only Grand Chalet,
    // so aliasing the bare word put seven spawns from four different buildings
    // on one pin.
    "water treatment plant": "Water Treatment",
  },
  "ground-zero": {
    "terragroup office": "TerraGroup",
    "terragroup building": "TerraGroup",
  },
};

/**
 * Words that name a kind of room rather than a place, and so cannot locate
 * anything on their own.
 *
 * Streets labels one building "Office", which matched "inside the TerraGroup
 * building in a office", "in the FINANCE building… first office" and "inside
 * the terragroup office" — three pins in the wrong building, since neither
 * TerraGroup nor Finance is a Streets label.
 *
 * This list is deliberately short. Most single-word labels are proper nouns
 * (Goshan, Beluga, Crackhouse, Fortress) and the common-noun ones in use are
 * right: Shoreline's "Pier" matches "at the pier", and Cafeteria, Checkpoint
 * and Sawmill all match their real places. Blocking those would destroy good
 * pins. Only `office` has evidence against it; the rest are here because they
 * describe interiors and currently match nothing, so they cost nothing.
 *
 * Applies to single-word matches only — "Warehouse 17", "Science Office" and
 * "Office Building" are specific and stay eligible.
 */
const GENERIC_LABELS = new Set([
  "office",
  "reception",
  "parking",
  "garage",
  "storage",
  "warehouse",
  "hole",
  "pit",
  "platform",
  "connector",
  "servers",
  "sinks",
]);

/**
 * Wording that makes the place a bearing rather than the destination.
 *
 * "Inside the TTS store in front of EMERCOM medical unit key zone" names two
 * labelled places, and the document is in the first one — EMERCOM is how you
 * find TTS. Longest-match alone picked EMERCOM and pinned the wrong store.
 *
 * "behind" is deliberately absent: "behind OLI administration office key door"
 * means inside the room that door opens, which is the place we want.
 */
const BEARING = /(in front of|next to|nearby|near|opposite|outside of|outside|beside|across from)\s*$/;

/**
 * Anchors a description to a place label on the same map.
 *
 * A place the sentence puts the document *in* beats one it merely steers by;
 * after that, the longest match wins, so "Old Gas" beats "Gas" and
 * "Warehouse 17" beats "Warehouse". Matching is whole-word to stop "Pit"
 * hitting "pitch" and "Hole" hitting "whole". A miss is fine and expected —
 * the spawn still ships, it just has no pin.
 */
function anchorFor(note, labels, map) {
  const haystack = note.toLowerCase();
  const positionOf = (text) =>
    labels.find((l) => (l.text ?? "").trim().toLowerCase() === text.toLowerCase())?.position ?? null;

  const candidates = [];
  for (const label of labels) {
    const text = (label.text ?? "").trim();
    if (text.length < 3) continue;
    if (!text.includes(" ") && GENERIC_LABELS.has(text.toLowerCase())) continue;
    candidates.push([text, text, label.position]);
  }
  for (const [phrase, target] of Object.entries(PLACE_ALIASES[map] ?? {})) {
    const position = positionOf(target);
    if (position) candidates.push([phrase, target, position]);
    else console.warn(`  ? alias "${phrase}" -> unknown label "${target}" on ${map}`);
  }

  let best = null;
  for (const [phrase, text, position] of candidates) {
    const needle = phrase.toLowerCase().replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
    const match = new RegExp(`\\b${needle}\\b`).exec(haystack);
    if (!match) continue;
    // Everything the sentence said before this place decides whether it is
    // where the document is, or just how you get your bearings.
    const contained = !BEARING.test(haystack.slice(0, match.index));
    const better = !best || (contained && !best.contained) ||
      (contained === best.contained && phrase.length > best.matched.length);
    if (better) best = { text, position, matched: phrase, contained };
  }
  return best;
}

/* -------------------------------------------------------------------- main */

const geo = JSON.parse(await fs.readFile(GEO, "utf8"));

console.log(`Reading ${DOCUMENTS.length} document pages from the wiki…`);
const spawnsByMap = {};
const files = new Set();
let total = 0;
let duplicates = 0;

for (const doc of DOCUMENTS) {
  const parsed = await api({ action: "parse", page: doc, prop: "wikitext" });
  const wikitext = parsed?.parse?.wikitext;
  if (typeof wikitext !== "string") {
    console.warn(`  ! no wikitext for "${doc}" — skipped`);
    continue;
  }

  const found = parseLocations(wikitext);
  console.log(`  ${doc}: ${found.length} spawn(s)`);
  for (const entry of found) {
    /*
     * The wiki lists a couple of spawns twice in the same gallery — Ground
     * Zero's "room no.3 on the 2nd floor of the TerraGroup building" and the
     * Labyrinth's "on top of a box inside the assembly room". Same document,
     * same sentence, one place. Keyed on the wording, and per map, so two
     * spawns of one document described differently both survive.
     */
    const already = (spawnsByMap[entry.map] ?? []).some(
      (s) => s.document === doc && s.note === entry.note,
    );
    if (already) {
      duplicates++;
      continue;
    }

    const labels = geo[entry.map]?.labels ?? [];
    const anchor = anchorFor(entry.note, labels, entry.map);
    (spawnsByMap[entry.map] ??= []).push({
      document: doc,
      note: entry.note,
      file: entry.file,
      image: null,
      imageWidth: 0,
      imageHeight: 0,
      position: anchor?.position ?? null,
      place: anchor?.text ?? null,
    });
    files.add(entry.file);
    total++;
  }
}

/* Resolve File: titles to CDN urls in batches; the API caps titles per call. */
console.log(`\nResolving ${files.size} screenshot url(s)…`);
const urlByFile = new Map();
const list = [...files];
for (let i = 0; i < list.length; i += 40) {
  const info = await api({
    action: "query",
    titles: list.slice(i, i + 40).join("|"),
    prop: "imageinfo",
    // Dimensions come along for the ride so the gallery can reserve the right
    // box before the image lands, the same shape task screenshots use.
    iiprop: "url|size",
  });
  for (const page of info?.query?.pages ?? []) {
    const ii = page.imageinfo?.[0];
    if (ii?.url) urlByFile.set(page.title, { url: ii.url, width: ii.width ?? 0, height: ii.height ?? 0 });
  }
}

let pinned = 0;
for (const spawns of Object.values(spawnsByMap)) {
  for (const spawn of spawns) {
    const image = urlByFile.get(spawn.file);
    spawn.image = image?.url ?? null;
    spawn.imageWidth = image?.width ?? 0;
    spawn.imageHeight = image?.height ?? 0;
    delete spawn.file;
    if (spawn.position) pinned++;
  }
}

const payload = {
  generated: new Date().toISOString(),
  source: "https://escapefromtarkov.fandom.com",
  note: "Positions are anchored to named place labels, not surveyed coordinates. A spawn with no recognisable place keeps its description and screenshot and ships without a position.",
  maps: Object.fromEntries(
    Object.entries(spawnsByMap).sort(([a], [b]) => a.localeCompare(b)),
  ),
};

await fs.mkdir(path.dirname(OUT), { recursive: true });
await fs.writeFile(OUT, `${JSON.stringify(payload, null, 1)}\n`);

console.log(`\n${"=".repeat(62)}`);
console.log(`${total} spawn(s) across ${Object.keys(spawnsByMap).length} map(s)`);
if (duplicates) console.log(`${duplicates} duplicate listing(s) dropped`);
console.log(`${pinned} anchored to a place (${((pinned / (total || 1)) * 100).toFixed(0)}%), ${total - pinned} listed without a pin`);
for (const [map, spawns] of Object.entries(spawnsByMap).sort()) {
  const p = spawns.filter((s) => s.position).length;
  console.log(`  ${map.padEnd(18)} ${String(spawns.length).padStart(3)} spawn(s), ${p} anchored`);
}
console.log(`\nWrote ${path.relative(ROOT, OUT)}`);
