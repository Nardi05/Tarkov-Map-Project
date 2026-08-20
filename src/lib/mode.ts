import type { GameMode } from "./persist-migrate";

/**
 * How the three playable profiles are labelled.
 *
 * Patch 1.1 split Tarkov into a persistent PvP Zone, a seasonal PvP character
 * (Kord Breach this wipe), and PvE. Those are separate progressions in game,
 * so they are separate progressions here.
 */
export const MODE_META: Record<
  GameMode,
  { label: string; short: string; hint: string }
> = {
  pvp: {
    label: "PvP Zone",
    short: "PvP",
    hint: "Your persistent PvP character. Does not wipe with the season.",
  },
  season: {
    label: "Season",
    short: "Season",
    hint: "Kord Breach seasonal PvP. Separate stash, traders and quests.",
  },
  pve: {
    label: "PvE",
    short: "PvE",
    hint: "Co-op PvE character. Quest names use the PvE Zone variants.",
  },
};

export const MODE_ORDER: GameMode[] = ["pvp", "season", "pve"];

export function modeLabel(mode: GameMode): string {
  return MODE_META[mode].label;
}
