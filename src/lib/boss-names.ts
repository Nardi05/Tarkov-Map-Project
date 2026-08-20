/**
 * Tarkov.dev names the Goon trio after Knight (and sometimes lists them as
 * "Rogue"). Players just say Goons. The map picker uses this; pins still use
 * the individual names, because a marker is a person, not the group.
 */
const GOON_ALIASES = new Set(["knight", "big pipe", "birdeye", "death knight", "rogue", "rogues"]);
/** Feed leftovers that are not a boss a player would look for. */
const HIDDEN = new Set(["af"]);

export function displayBossName(name: string): string {
  return GOON_ALIASES.has(name.trim().toLowerCase()) ? "Goons" : name;
}

/** Unique labels for a map card, with the Goon aliases collapsed. */
export function listMapBosses(names: string[]): string[] {
  const out: string[] = [];
  const seen = new Set<string>();
  for (const raw of names) {
    const key = raw.trim().toLowerCase();
    if (HIDDEN.has(key)) continue;
    const label = displayBossName(raw);
    const seenKey = label.toLowerCase();
    if (seen.has(seenKey)) continue;
    seen.add(seenKey);
    out.push(label);
  }
  return out;
}

export function bossMatchesSearch(names: string[], needle: string): boolean {
  const q = needle.trim().toLowerCase();
  if (!q) return true;
  if (listMapBosses(names).some((n) => n.toLowerCase().includes(q))) return true;
  if (q.includes("goon") && names.some((n) => GOON_ALIASES.has(n.trim().toLowerCase()))) return true;
  return names.some((n) => n.toLowerCase().includes(q));
}
