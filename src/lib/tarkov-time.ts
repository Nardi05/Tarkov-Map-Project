/**
 * The in-game clock.
 *
 * Tarkov's world runs at 7x real time, and every map offers two raids exactly
 * 12 hours apart — so the pair below is "the two raids you can queue into right
 * now", not a time and its timezone.
 *
 * The formula is the community-standard one (matching tarkov.dev's own
 * implementation, itself derived from adamburgess/tarkov-time): midnight in
 * game is Unix 10,800,000 rather than 0, i.e. UTC+3, because Tarkov is in
 * Russia. Everything is read back in UTC so the viewer's own timezone can't
 * shift it.
 */
const RATIO = 7;
const HOUR = 60 * 60 * 1000;
const DAY = 24 * HOUR;
/** Tarkov's midnight sits at UTC+3, not Unix 0. */
const RUSSIA = 3 * HOUR;

export interface RaidClock {
  left: string;
  right: string;
  /** True when the left clock is in daylight; the right is then its opposite. */
  leftIsDay: boolean;
  /** Set when the map ignores the world clock, explaining why. */
  note: string | null;
  /** False for maps with no time of day at all, which show the note instead. */
  hasTime: boolean;
}

const hhmm = (ms: number) => {
  const d = new Date(ms);
  return `${String(d.getUTCHours()).padStart(2, "0")}:${String(d.getUTCMinutes()).padStart(2, "0")}`;
};

/**
 * Daylight, per the wiki's day/night table: sunrise 05:45, sunset 21:30. Used
 * only to label which clock is the day raid, so the edges being soft is fine.
 */
const isDaylight = (ms: number) => {
  const minutes = new Date(ms).getUTCHours() * 60 + new Date(ms).getUTCMinutes();
  return minutes >= 5 * 60 + 45 && minutes < 21 * 60 + 30;
};

function rawTarkovTime(now: number, left: boolean): number {
  return (RUSSIA + (left ? 0 : 12 * HOUR) + now * RATIO) % DAY;
}

/**
 * Two maps don't follow the world clock, and showing them a ticking one would
 * be a lie:
 *   - Factory's raid clocks are pinned at 15:28 / 03:28.
 *   - The Lab is underground, lit the same whatever the hour, and offers no
 *     time choice at all.
 */
export function raidClock(mapName: string, now = Date.now()): RaidClock {
  if (mapName === "factory") {
    return {
      left: "15:28",
      right: "03:28",
      leftIsDay: true,
      note: "Factory's raid times are fixed",
      hasTime: true,
    };
  }
  if (mapName === "the-lab") {
    return {
      left: "",
      right: "",
      leftIsDay: true,
      note: "No day or night underground",
      hasTime: false,
    };
  }

  const left = rawTarkovTime(now, true);
  return {
    left: hhmm(left),
    right: hhmm(rawTarkovTime(now, false)),
    leftIsDay: isDaylight(left),
    note: null,
    hasTime: true,
  };
}
