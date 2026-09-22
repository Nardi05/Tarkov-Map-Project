/**
 * The vocabulary this site assumes you already have.
 *
 * Tarkov's jargon is the single biggest thing standing between a new player
 * and a site like this one. "Tick the Kappa-required tasks that are FIR" is
 * four pieces of knowledge in six words, and none of them are guessable. The
 * old build simply used the words; this is where they get explained, once,
 * next to wherever they are used.
 *
 * Definitions are deliberately short — one or two sentences, in the terms a
 * player who has done a handful of raids would recognise. Anything longer
 * belongs on the wiki, which every entry that needs one links to.
 */

export interface GlossaryEntry {
  /** What shows in the popover's heading. */
  term: string;
  /** One or two sentences. Plain text; no markup. */
  body: string;
}

export type TermId =
  | "pmc"
  | "scav"
  | "raid"
  | "extract"
  | "transit"
  | "wipe"
  | "kappa"
  | "fir"
  | "quest-item"
  | "key"
  | "hideout"
  | "trader"
  | "loyalty"
  | "kord"
  | "pvp-zone"
  | "pve"
  | "lightkeeper"
  | "boss"
  | "prestige"
  | "stash";

export const GLOSSARY: Record<TermId, GlossaryEntry> = {
  pmc: {
    term: "PMC",
    body: "Your own character — the one whose gear you lose when you die and whose quests you are tracking. Every other player's main character is a PMC too.",
  },
  scav: {
    term: "Scav",
    body: "A scavenger. Player Scavs are a free throwaway character you can run on a timer; AI Scavs are the bots that shoot at you. They spawn in different places from PMCs, which is why the map separates them.",
  },
  raid: {
    term: "Raid",
    body: "One run into a map. You load in, do what you came for, and leave through an extract — or you die and lose what you brought.",
  },
  extract: {
    term: "Extract",
    body: "The exit that ends a raid and keeps what you are carrying. Some are open to everyone, some only to PMCs or Scavs, and some need a condition met first — a toll, a switch, a co-op partner.",
  },
  transit: {
    term: "Transit",
    body: "An exit that drops you straight into the next map with the gear and the raid timer you already had, instead of ending the raid.",
  },
  wipe: {
    term: "Wipe",
    body: "A full reset of every player's progress at the start of a new season. Quests, traders, stash and hideout all go back to zero.",
  },
  kappa: {
    term: "Kappa",
    body: "The largest secure container in the game. Earning it needs a specific long list of quests finished, which is why tasks are flagged for whether they count toward it.",
  },
  fir: {
    term: "Found in raid",
    body: "An item you picked up inside a raid and extracted with, rather than bought from a trader. Most quest hand-ins require it, and the tracker counts those separately.",
  },
  "quest-item": {
    term: "Quest item",
    body: "An item that only exists for one task. It can spawn in several places, but the game only puts it in one of them per raid — so the map shows a single pin for the whole spread.",
  },
  key: {
    term: "Key",
    body: "Opens one locked door. Most are found in raid or bought from a trader, and a few have limited uses before they break.",
  },
  hideout: {
    term: "Hideout",
    body: "Your base. Upgrading its stations unlocks crafting, healing, bigger stash space and passive income, and each level asks for specific items and a trader level.",
  },
  trader: {
    term: "Trader",
    body: "One of the NPC dealers who hand out quests and sell gear. Prapor, Therapist, Skier and the rest each run their own quest chain.",
  },
  loyalty: {
    term: "Loyalty level",
    body: "How far a trader trusts you, from LL1 to LL4. It rises as you finish their quests and spend money, and some tasks will not appear until you reach a given level.",
  },
  kord: {
    term: "Kord Breach",
    body: "The current season's storyline and battle pass. It runs on a separate character with its own stash, traders and quests, and it ends when the season does.",
  },
  "pvp-zone": {
    term: "PvP Zone",
    body: "Your persistent PvP character, introduced in 1.1. Unlike the seasonal one, it does not wipe when a season ends.",
  },
  pve: {
    term: "PvE",
    body: "The co-op mode, with AI instead of other players. It is a completely separate progression from PvP — separate stash, separate quests, separate hideout.",
  },
  lightkeeper: {
    term: "Lightkeeper",
    body: "A hidden trader on Lighthouse. Reaching him needs a long chain of tasks finished without failing the ones that lock him out.",
  },
  boss: {
    term: "Boss",
    body: "A named enemy who spawns on one map with a guard squad and a spawn chance below 100%. The map shows where each one can appear and how likely it is.",
  },
  prestige: {
    term: "Prestige",
    body: "Resetting a maxed character on purpose, in exchange for permanent bonuses that carry across wipes.",
  },
  stash: {
    term: "Stash",
    body: "Your storage between raids. The item tracker on this site counts against what you say is in it, so hand-in requirements can tell you what is still missing.",
  },
};

/** Look a term up without the caller having to narrow the id type. */
export function glossary(id: string): GlossaryEntry | null {
  return (GLOSSARY as Record<string, GlossaryEntry | undefined>)[id] ?? null;
}
