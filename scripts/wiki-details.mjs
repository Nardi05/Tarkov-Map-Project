/**
 * Reading quest, key and story-chapter pages out of wiki markup.
 *
 * Pure string functions, kept apart from the scraper so they can be tested
 * against sample wikitext without touching the network — the same split as
 * wiki-infobox.mjs, whose parameter reader this builds on.
 *
 * The pages are community-written, so every reader here is defensive: a
 * missing section is an empty list, never a throw, and anything unrecognised
 * is dropped rather than guessed at.
 */
import { infoboxParam, questEdges, wikiLinks } from "./wiki-infobox.mjs";

/* ------------------------------------------------------------------ sections */

/**
 * Level-2 sections by title, each with its level-3+ subsections folded in.
 * Titles are compared case-insensitively, so "Key location" and "Key Location"
 * are the same section.
 */
export function sections(wikitext) {
  const out = new Map();
  const re = /^(={2,6})\s*(.+?)\s*\1\s*$/gm;
  const heads = [];
  for (const m of wikitext.matchAll(re)) heads.push({ level: m[1].length, title: m[2], at: m.index, end: m.index + m[0].length });
  for (let i = 0; i < heads.length; i++) {
    const h = heads[i];
    if (h.level !== 2) continue;
    let stop = wikitext.length;
    for (let j = i + 1; j < heads.length; j++) {
      if (heads[j].level <= 2) {
        stop = heads[j].at;
        break;
      }
    }
    const key = plain(h.title).toLowerCase();
    if (!out.has(key)) out.set(key, wikitext.slice(h.end, stop));
  }
  return out;
}

/** Splits a section body on its own sub-headings: [{heading, body}]. */
export function subsections(body) {
  const out = [];
  const re = /^(={3,6})\s*(.+?)\s*\1\s*$/gm;
  let last = 0;
  let heading = null;
  for (const m of body.matchAll(re)) {
    out.push({ heading, body: body.slice(last, m.index) });
    heading = plain(m[2]);
    last = m.index + m[0].length;
  }
  out.push({ heading, body: body.slice(last) });
  return out.filter((s) => s.heading || s.body.trim());
}

/* ---------------------------------------------------------------- plain text */

/** Removes `[[File:…]]`, which can itself contain links, by bracket depth. */
function dropFiles(text) {
  let out = "";
  let i = 0;
  while (i < text.length) {
    const m = /\[\[\s*(File|Image):/i.exec(text.slice(i));
    if (!m) {
      out += text.slice(i);
      break;
    }
    out += text.slice(i, i + m.index);
    let j = i + m.index;
    let depth = 0;
    for (; j < text.length; j++) {
      if (text.startsWith("[[", j)) {
        depth++;
        j++;
      } else if (text.startsWith("]]", j)) {
        depth--;
        j++;
        if (depth === 0) {
          j++;
          break;
        }
      }
    }
    i = j;
  }
  return out;
}

/** Removes `{{…}}` templates, nested ones included. */
function dropTemplates(text) {
  let prev;
  do {
    prev = text;
    text = text.replace(/\{\{[^{}]*\}\}/g, "");
  } while (text !== prev);
  return text;
}

/** Wiki markup to readable plain text, one line per source line. */
export function plain(text) {
  if (!text) return "";
  let t = String(text);
  t = t.replace(/<!--[\s\S]*?-->/g, "");
  t = t.replace(/<li[^>]*>\s*<gallery[\s\S]*?<\/gallery>\s*<\/li>/gi, "");
  t = t.replace(/<gallery[\s\S]*?<\/gallery>/gi, "");
  t = t.replace(/<ref[^>]*\/>/gi, "").replace(/<ref[\s\S]*?<\/ref>/gi, "");
  t = dropFiles(t);
  t = dropTemplates(t);
  // Category tags and the links to other-language editions are page furniture.
  t = t.replace(/\[\[\s*(?:Category|[a-z]{2,3}(?:-[a-z]+)?)\s*:[^\]]*\]\]/gi, "");
  t = t.replace(/\[\[(?:[^\]|]*\|)?([^\]]*)\]\]/g, "$1");
  t = t.replace(/\[https?:\/\/\S+\s+([^\]]+)\]/g, "$1").replace(/\[https?:\/\/\S+\]/g, "");
  t = t.replace(/<br\s*\/?>/gi, "\n");
  t = t.replace(/<\/?[a-z][^>]*>/gi, "");
  t = t.replace(/'''''|'''|''/g, "");
  t = t.replace(/&nbsp;/g, " ").replace(/&amp;/g, "&").replace(/&ndash;/g, "–").replace(/&mdash;/g, "—");
  t = t.replace(/__[A-Z]+__/g, "");
  return t
    .split("\n")
    .map((line) => line.replace(/[ \t]+/g, " ").trim())
    .join("\n")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}

/* ------------------------------------------------------------------- bullets */

const OPTIONAL = /^\(\s*optional\s*\)\s*/i;

/**
 * Bullet and numbered list items in a section: [{text, depth, optional}].
 * `depth` is 1 for a top-level item. A wiki "(Optional)" prefix becomes the
 * flag rather than staying in the text.
 */
export function bullets(body) {
  const out = [];
  for (const raw of String(body ?? "").split("\n")) {
    const m = /^([*#]+)\s*(.*)$/.exec(raw);
    if (!m) continue;
    let text = plain(m[2]).replace(/\n+/g, " ").trim();
    if (!text) continue;
    const optional = OPTIONAL.test(text);
    if (optional) text = text.replace(OPTIONAL, "");
    out.push({ text, depth: m[1].length, optional });
  }
  return out;
}

/** Paragraph text of a section, lists flattened to "• " lines, tables dropped. */
export function prose(body) {
  const withoutTables = String(body ?? "").replace(/^\{\|[\s\S]*?^\|\}/gm, "");
  const lines = [];
  for (const raw of withoutTables.split("\n")) {
    const m = /^([*#]+)\s*(.*)$/.exec(raw);
    // Indentation would not survive `plain`'s trimming, so depth is the marker.
    lines.push(m ? `${m[1].length > 1 ? "◦" : "•"} ${m[2]}` : raw);
  }
  return plain(lines.join("\n"));
}

/* --------------------------------------------------------------------- tables */

/**
 * The "Related Quest Items" table on a quest page, as rows keyed by column.
 * Headers vary slightly between pages, so columns are found by name.
 */
export function questItemTable(wikitext) {
  const tables = String(wikitext).match(/^\{\|[\s\S]*?^\|\}/gm) ?? [];
  const table = tables.find((t) => /related quest items/i.test(t));
  if (!table) return [];
  const rows = table.split(/^\|-.*$/m).slice(1);
  let columns = null;
  const out = [];
  for (const row of rows) {
    const cells = [];
    for (const line of row.split("\n")) {
      const m = /^([|!])(.*)$/.exec(line);
      if (!m || line.startsWith("|}")) continue;
      // `!!` / `||` put several cells on one line.
      for (const part of m[2].split(/!!|\|\|/)) cells.push({ header: m[1] === "!", text: part });
    }
    if (!cells.length) continue;
    if (!columns && cells.every((c) => c.header)) {
      columns = cells.map((c) => plain(c.text).toLowerCase());
      continue;
    }
    if (!columns) continue;
    const get = (name) => {
      const i = columns.findIndex((c) => c.includes(name));
      return i >= 0 && cells[i] ? plain(cells[i].text.replace(/^[^|[\]]*\|(?!\|)/, "")) : "";
    };
    const name = get("item");
    if (!name) continue;
    const amount = Number.parseInt(get("amount").replace(/[^\d]/g, ""), 10);
    const fir = get("find in raid") || get("found in raid") || get("raid");
    out.push({
      name,
      amount: Number.isFinite(amount) ? amount : null,
      requirement: get("requirement") || null,
      foundInRaid: /^yes/i.test(fir) ? true : /^no/i.test(fir) ? false : null,
      notes: get("notes") || null,
    });
  }
  return out;
}

/* ----------------------------------------------------------------- the pages */

/**
 * A section as [{heading, text}] blocks, trimmed to a readable length.
 *
 * Quest guides are capped tighter than story chapters: there are five hundred
 * of them, and past a couple of screens the wiki page itself is the better
 * read. There are ten chapters, and their guides are the point.
 */
function blocks(body, { blockCap = 1200, totalCap = 4000 } = {}) {
  const out = [];
  let total = 0;
  for (const sub of subsections(body ?? "")) {
    let text = prose(sub.body);
    if (!text && !sub.heading) continue;
    if (text.length > blockCap) text = `${text.slice(0, blockCap).replace(/\s+\S*$/, "")}…`;
    if (total + text.length > totalCap) break;
    total += text.length;
    if (text) out.push({ heading: sub.heading, text });
  }
  return out;
}

/** List items grouped under the section's own sub-headings. */
function groupedBullets(body) {
  return subsections(body ?? "")
    .map((sub) => ({ heading: sub.heading, items: bullets(sub.body) }))
    .filter((g) => g.items.length);
}

function yesNo(value) {
  const v = plain(value ?? "").toLowerCase();
  if (v.startsWith("yes")) return true;
  if (v.startsWith("no")) return false;
  return null;
}

export function parseQuestPage(wikitext) {
  const secs = sections(wikitext);
  const requirementsText = prose(secs.get("requirements") ?? "");
  // Only the Requirements section: elsewhere on a page "must be level N" is as
  // likely to describe a different quest in the chain.
  const level = /must be (?:at least )?level (\d+)/i.exec(requirementsText);
  const ll = Number.parseInt(plain(infoboxParam(wikitext, "LL requirement") ?? ""), 10);
  const edges = questEdges(wikitext);
  return {
    trader: wikiLinks(infoboxParam(wikitext, "given by"))[0] ?? null,
    locations: wikiLinks(infoboxParam(wikitext, "location")),
    loyaltyLevel: Number.isFinite(ll) ? ll : null,
    minPlayerLevel: level ? Number(level[1]) : null,
    kappaRequired: yesNo(infoboxParam(wikitext, "reqkappa")),
    previous: edges.previous,
    leadsTo: edges.leadsTo,
    requirements: requirementsText ? requirementsText.split("\n").filter(Boolean) : [],
    objectives: bullets(secs.get("objectives")),
    rewards: bullets(secs.get("rewards")),
    items: questItemTable(wikitext),
    guide: blocks(secs.get("guide")),
  };
}

export function parseKeyPage(wikitext) {
  const secs = sections(wikitext);
  const found = [];
  for (const sub of subsections(secs.get("key location") ?? "")) {
    const items = bullets(sub.body).map((b) => b.text);
    const text = items.length ? items : [prose(sub.body)].filter(Boolean);
    if (text.length) found.push({ map: sub.heading, spots: text });
  }
  const behind = prose(secs.get("behind the lock") ?? "");
  const lock = prose(secs.get("lock location") ?? "");
  return {
    itemId: plain(infoboxParam(wikitext, "node") ?? "") || null,
    usage: plain(infoboxParam(wikitext, "usage") ?? "") || null,
    found,
    lock: lock || null,
    behind: behind || null,
    quests: wikiLinks(secs.get("quests") ?? ""),
  };
}

export function parseChapterPage(wikitext) {
  const secs = sections(wikitext);
  const start = secs.get("requirements") ?? secs.get("how to start") ?? "";
  return {
    start: prose(start) || null,
    objectives: groupedBullets(secs.get("objectives")),
    rewards: groupedBullets(secs.get("rewards")),
    guide: blocks(secs.get("guide") ?? secs.get("walkthrough"), { blockCap: 3000, totalCap: 40000 }),
  };
}
