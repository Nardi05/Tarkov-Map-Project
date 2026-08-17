/**
 * Reading `Infobox quest` out of a wiki page's wikitext.
 *
 * Kept apart from the scraper so it can be tested without touching the network.
 * Everything here is a pure string function over sample wikitext.
 *
 * The quest infobox is the reason this approach works at all. The prerequisite
 * chain is not buried in prose — it is two structured template parameters:
 *
 *   |previous     =[[Debut]]
 *   |leads to     =[[Search Mission]]<br/>[[Luxurious Life]]
 *
 * and the two describe the same edges from opposite ends, so they check each
 * other. That is worth more than either one alone.
 */

/**
 * Pulls one template parameter's raw value.
 *
 * A parameter runs from its `|name =` to the next parameter or the end of the
 * template. Splitting on `|` alone would cut a value in half the moment it
 * contains a piped link (`[[Page|label]]`) or a nested template, so this tracks
 * link and brace depth and only treats a `|` at depth zero as a boundary.
 */
export function infoboxParam(wikitext, name) {
  const start = wikitext.search(new RegExp(`\\|\\s*${escapeRe(name)}\\s*=`, "i"));
  if (start === -1) return null;

  const from = wikitext.indexOf("=", start) + 1;
  let depth = 0;

  for (let i = from; i < wikitext.length; i++) {
    const two = wikitext.slice(i, i + 2);
    if (two === "[[" || two === "{{") {
      depth++;
      i++;
      continue;
    }
    if (two === "]]" || two === "}}") {
      // A `}}` at depth zero is the end of the infobox itself.
      if (depth === 0) return wikitext.slice(from, i).trim();
      depth--;
      i++;
      continue;
    }
    if (wikitext[i] === "|" && depth === 0) return wikitext.slice(from, i).trim();
  }

  return wikitext.slice(from).trim();
}

/**
 * Every `[[Page]]` / `[[Page|label]]` target in a value, in order.
 *
 * Takes the target, never the label: the label is whatever read well in that
 * sentence, while the target is the page title, which is what we can match
 * against a task's own wiki link. Anchors (`Page#Section`) are trimmed to the
 * page.
 */
export function wikiLinks(value) {
  if (!value) return [];
  const out = [];
  for (const match of value.matchAll(/\[\[([^\]|#]+)(?:#[^\]|]*)?(?:\|[^\]]*)?\]\]/g)) {
    const target = match[1].trim();
    if (target) out.push(target);
  }
  return out;
}

/**
 * The prerequisite edges one page states, from both directions.
 *
 * `previous` names what must come before this page; `leads to` names what this
 * page unlocks. Returned separately rather than merged so the caller can report
 * how often the two agree — that percentage is the only honest quality signal
 * available for a community-maintained source.
 */
export function questEdges(wikitext) {
  return {
    previous: wikiLinks(infoboxParam(wikitext, "previous")),
    leadsTo: wikiLinks(infoboxParam(wikitext, "leads to")),
  };
}

/**
 * Folds a page title or task name to something matchable.
 *
 * The wiki, the feed and the URL disagree about punctuation constantly: hyphen
 * against en dash, underscore against space, curly against straight quotes. All
 * of that is noise for identity, so it goes.
 */
export function foldName(name) {
  return String(name)
    .normalize("NFKD")
    .replace(/[‐-―]/g, "-")
    .replace(/[‘’]/g, "'")
    .replace(/[“”]/g, '"')
    .replace(/_/g, " ")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, " ")
    .trim();
}

/** The page title out of a fandom wiki URL. */
export function pageTitle(url) {
  const match = /\/wiki\/([^?#]+)/.exec(String(url ?? ""));
  if (!match) return null;
  return decodeURIComponent(match[1]).replace(/_/g, " ");
}

const escapeRe = (s) => s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
