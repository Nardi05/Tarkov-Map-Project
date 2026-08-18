/**
 * Turning OCR output into a set of task suggestions.
 *
 * This is the half of screenshot import that decides whether the feature is
 * useful, and it is kept pure so it can be tested without a browser, a wasm
 * blob or a real screenshot.
 *
 * The problem is much narrower than "read this image", and that is the whole
 * reason it works. By the time we get here the player has already told us which
 * trader they are on, so a garbled line is matched against that trader's
 * fifty-odd task names rather than all five hundred, and against a closed set
 * rather than free text. "Shootoul Picnlc" has exactly one plausible reading in
 * a list that contains "Shootout Picnic".
 *
 * Everything here proposes; nothing decides. The wizard shows what matched and
 * what was read but not understood, and the player confirms. A wrong guess
 * costs one click to remove, which is the right price for a guess.
 */

export interface Candidate {
  id: string;
  name: string;
}

export interface OcrMatch {
  id: string;
  name: string;
  /** The line as OCR read it, so a player can see why it matched. */
  line: string;
  /** 0-1. At or above CONFIDENT it is pre-ticked; below, merely offered. */
  score: number;
}

export interface MatchResult {
  matches: OcrMatch[];
  /** Lines that looked like a task name but matched nothing. */
  unmatched: string[];
}

/** Below this a line is not offered at all — noise, not a bad reading. */
export const MIN_SCORE = 0.62;
/** At or above this the suggestion starts ticked rather than merely listed. */
export const CONFIDENT = 0.8;

/**
 * Folds a string to its comparable core.
 *
 * OCR confusions are overwhelmingly about shape — l/I/1, O/0, rn/m — and about
 * punctuation and spacing it invents or drops. Case and punctuation carry no
 * signal for identity here, so they go before anything is compared.
 */
export function fold(text: string): string {
  return text
    .normalize("NFKD")
    .replace(/[‐-―]/g, "-")
    .replace(/[‘’]/g, "'")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, " ")
    .trim();
}

/*
 * A trader panel is full of text that is not a quest: counters, "Turn in",
 * timers, item names, description prose. Filtering the obvious chrome before
 * matching keeps a stray "COMPLETED" from being forced onto some poor task
 * whose name happens to share a few letters.
 */
const CHROME =
  /^(completed|complete|in progress|available|locked|failed|turn in|hand over|accept|decline|start|tasks?|quests?|rewards?|objectives?|description|requirements?|show all|filter|search|back|next|level \d+|[\d\s/%.,:-]+)$/i;

export function candidateLines(text: string): string[] {
  const out: string[] = [];
  for (const raw of text.split(/\r?\n/)) {
    const line = raw.replace(/\s+/g, " ").trim();
    if (!line) continue;
    // Task names are short-ish; a long line is description prose.
    if (line.length < 3 || line.length > 60) continue;
    if (CHROME.test(line)) continue;
    // Needs a run of letters — pure numbers and symbols are counters and icons.
    if (!/[a-z]{3}/i.test(line)) continue;
    out.push(line);
  }
  return out;
}

/** Levenshtein distance, two-row variant — the strings here are short. */
function distance(a: string, b: string): number {
  if (a === b) return 0;
  if (!a.length) return b.length;
  if (!b.length) return a.length;

  let prev = Array.from({ length: b.length + 1 }, (_, i) => i);
  let curr = new Array<number>(b.length + 1);

  for (let i = 1; i <= a.length; i++) {
    curr[0] = i;
    for (let j = 1; j <= b.length; j++) {
      const cost = a[i - 1] === b[j - 1] ? 0 : 1;
      curr[j] = Math.min(curr[j - 1] + 1, prev[j] + 1, prev[j - 1] + cost);
    }
    [prev, curr] = [curr, prev];
  }
  return prev[b.length];
}

/**
 * How alike two folded strings are, 0-1.
 *
 * The better of two measures, because neither works alone. Character distance
 * punishes a dropped word too harshly — OCR often loses "- Part 1" off the end
 * of a row, and "The Punisher" should still find "The Punisher - Part 1". Word
 * overlap is too generous on its own, since "Gunsmith - Part 3" and "Gunsmith
 * - Part 8" share every word but one. Each covers the other's blind spot.
 */
export function similarity(a: string, b: string): number {
  if (!a || !b) return 0;
  if (a === b) return 1;

  const byChar = 1 - distance(a, b) / Math.max(a.length, b.length);

  const wordsA = a.split(" ").filter(Boolean);
  const wordsB = b.split(" ").filter(Boolean);
  const pool = [...wordsB];
  let hits = 0;
  for (const word of wordsA) {
    const at = pool.indexOf(word);
    if (at !== -1) {
      pool.splice(at, 1);
      hits++;
    }
  }
  // Measured against the longer side, so matching three words of a ten-word
  // name does not score as well as matching three of four.
  const byWord = hits / Math.max(wordsA.length, wordsB.length);

  return Math.max(byChar, byWord);
}

/**
 * Best assignment of lines to tasks.
 *
 * Greedy over every pair sorted by score, each line and each task used at most
 * once. A trader list has tens of rows, so the quadratic pass is trivial, and
 * best-first gets the same answer as anything cleverer when one row is one
 * task.
 *
 * Adjacent lines are also tried joined: a long name wraps in the game's UI and
 * OCR faithfully reports two lines, neither of which matches alone.
 */
export function matchTasks(text: string, candidates: Candidate[]): MatchResult {
  const lines = candidateLines(text);
  if (!lines.length || !candidates.length) return { matches: [], unmatched: [] };

  /** Each probe knows which source lines it consumed, so a join claims both. */
  const probes: { text: string; lines: number[] }[] = [];
  lines.forEach((line, i) => {
    probes.push({ text: line, lines: [i] });
    if (i + 1 < lines.length) probes.push({ text: `${line} ${lines[i + 1]}`, lines: [i, i + 1] });
  });

  const folded = candidates.map((c) => ({ ...c, folded: fold(c.name) }));

  const pairs: { probe: number; candidate: number; score: number }[] = [];
  probes.forEach((probe, pi) => {
    const f = fold(probe.text);
    if (!f) return;
    folded.forEach((cand, ci) => {
      const score = similarity(f, cand.folded);
      if (score >= MIN_SCORE) pairs.push({ probe: pi, candidate: ci, score });
    });
  });

  pairs.sort((a, b) => b.score - a.score);

  const usedLines = new Set<number>();
  const usedCandidates = new Set<number>();
  const matches: OcrMatch[] = [];

  for (const pair of pairs) {
    if (usedCandidates.has(pair.candidate)) continue;
    const probe = probes[pair.probe];
    if (probe.lines.some((l) => usedLines.has(l))) continue;

    usedCandidates.add(pair.candidate);
    for (const l of probe.lines) usedLines.add(l);
    matches.push({
      id: folded[pair.candidate].id,
      name: folded[pair.candidate].name,
      line: probe.text,
      score: pair.score,
    });
  }

  matches.sort((a, b) => b.score - a.score || a.name.localeCompare(b.name));

  return {
    matches,
    // Reported, not swallowed: a name the player can see was read but not
    // placed is the difference between "it missed one" and "it is broken".
    unmatched: lines.filter((_, i) => !usedLines.has(i)),
  };
}
