import type { GameMode } from "./persist-migrate";

/**
 * After 1.1, a handful of tasks exist in three named variants:
 *
 *   Easy Money - Part 1 [PVP ZONE]
 *   Easy Money - Part 1 [PVE ZONE]
 *   Uninvited Guests - Part 1 [KORD BREACH]
 *
 * The suffix is how the feed (and the game) tells them apart. Players do not
 * think in suffixes — they think "I'm on my seasonal character" — so the UI
 * strips the tag and uses the current mode to decide which variant is real.
 *
 * A task with no tag is shared across every mode.
 */

export type TaskZone = "pvp" | "pve" | "season";

const TAG = /\s*\[(PVP ZONE|PVE ZONE|KORD BREACH)\]\s*$/i;

export function displayName(name: string): string {
  return name.replace(TAG, "").replace(/\s+/g, " ").trim();
}

export function taskZone(name: string): TaskZone | null {
  const match = name.match(TAG);
  if (!match) return null;
  const tag = match[1].toUpperCase();
  if (tag === "PVE ZONE") return "pve";
  if (tag === "KORD BREACH") return "season";
  return "pvp";
}

/**
 * Whether this task exists on the character the player said they are playing.
 *
 * Seasonal PvP is still PvP, so it sees the [PVP ZONE] Arena/Ref variants
 * rather than the PvE ones. The Kord story line is seasonal-only.
 */
export function visibleInMode(name: string, mode: GameMode): boolean {
  const zone = taskZone(name);
  if (!zone) return true;
  if (zone === "season") return mode === "season";
  if (zone === "pve") return mode === "pve";
  return mode === "pvp" || mode === "season";
}

export function zoneChip(name: string): { label: string; title: string } | null {
  const zone = taskZone(name);
  if (zone === "pvp") return { label: "PvP Zone", title: "This variant is for PvP Zone and seasonal characters." };
  if (zone === "pve") return { label: "PvE", title: "This variant is for the PvE character." };
  if (zone === "season") return { label: "Kord", title: "Seasonal KORD BREACH quest. Only offered on a seasonal character." };
  return null;
}
