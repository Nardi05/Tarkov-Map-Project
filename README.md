# Tarkov Map Project

Interactive maps for Escape from Tarkov: PMC and Scav spawns, extracts, transits,
keys, boss spawns and every task objective — on one map, with every layer
explained in plain English so a new player can learn a map without a second tab
open.

Covers all 13 playable maps, works from a phone up to a desktop, and ships as a
static site with no backend.

## What's on the map

| Layer | What it tells you |
| --- | --- |
| PMC spawns | Where you and the other PMCs can start |
| Scav spawns | Player-Scav starts and AI Scav spawn points |
| AI PMCs | Where Raiders, Rogues and roaming PMC bots enter |
| Boss spawns | Boss positions, with the chance the boss shows at all |
| Sniper Scavs | Marksman positions and the ground they cover |
| PMC / Scav / shared extracts | Who can use each exit, and what it needs first |
| Transits | Move into the next map keeping your gear and timer |
| Quest objectives | Every task objective anchored to the map |
| Locked doors & keys | Which key opens what |
| Switches | Levers that unlock extracts and doors |
| Hazards | Minefields and restricted zones |

Colour says *who* something belongs to, shape says *what* it is — so a blue
square is a PMC exit wherever you see it.

Beyond the layers:

- **Quick views** — one tap to switch the map between learning it, questing,
  a Scav run, or threat-spotting.
- **Floors** — multi-level maps (Interchange, Reserve, Streets, Labs, Icebreaker)
  filter markers by the level they are actually on.
- **Two art styles** — a clean vector map and photographic satellite tiles,
  georeferenced identically so markers never shift between them.
- **Configurable** — marker size, name labels, zone outlines, place names, dark
  and light themes.

## Tracking tasks through a raid

The task panel is built around the way you actually play. Before a raid, open
the map's task list and tick the tasks that are in your in-game list as
**active**; the map then draws those objectives and nothing else, so you see
every active location at once instead of a wall of green. During the raid you
can tick off individual locations — a task with three mark spots remembers which
one you did — and mark the whole task done when you finish it.

A task is in one of three states, and you set all of them yourself:

- **Not started** — the default.
- **Active** — it is in your in-game task list right now. These are what the
  map draws.
- **Done** — finished. Tick every location off and the panel offers to mark the
  whole task done in one go.

Nothing here is inferred. The site never guesses which tasks you could have
picked up or hides one behind a prerequisite it thinks you haven't met, so the
panel can't disagree with what the game is telling you. If you just want to
study a map you haven't started, tick **Show every task on the map**.

Everything is stored in your browser only, and survives a reload.

## Running it

```bash
npm install
npm run data      # fetch game data and build public/data (needs network)
npm run dev
```

```bash
npm run build     # type-check + production bundle into dist/
npm run preview
npm run smoke     # opens every map in a browser and checks for errors
```

`dist/` is a plain static site — the app uses hash routing, so it drops onto any
static host, including a subpath, with no rewrite rules.

## Deploying a private preview

The repo is set up for Vercel: connect it as a project and every push to the
production branch redeploys automatically (`vercel.json` sets the build command
to `npm run data && npm run build`, so each deploy fetches current game data
rather than a stale snapshot).

While the site isn't ready to be public, `middleware.ts` puts a password in
front of every request — including static assets, not just the page — using
[Vercel Routing Middleware](https://vercel.com/docs/routing-middleware). Set
these in the project's Environment Variables:

- `SITE_PASSWORD` — the shared password. Required; the site fails closed
  (503) if it's missing, rather than opening up by accident.
- `SITE_PRIVATE` — set to `false` when it's time to go public. Anything else
  (including leaving it unset) keeps the gate on.

No custom domain or extra setup needed beyond that — share the Vercel-assigned
URL and password with whoever's testing.

## How it fits together

```
scripts/build-data.mjs   fetches tarkov.dev's JSON feeds, resolves translations,
                         and writes one small payload per map
src/data/geo.json        vendored georeferencing (transform, bounds, rotation,
                         floors, place labels) for each map
src/lib/leaflet-crs.ts   turns that into a Leaflet CRS so markers and artwork
                         share one coordinate system
src/lib/layers.ts        the layer taxonomy: colour, shape, and the plain-English
                         explanation shown in the UI
src/lib/build-layers.ts  data -> Leaflet layers, one builder per layer
src/components/          map canvas, layer panel, task panel, detail panel
```

Data is baked at build time rather than fetched at runtime: opening a map is one
request for a 25–225KB JSON file (well under 50KB gzipped for most maps), and
the site keeps working if the upstream API is down.

A few details worth knowing if you touch this code:

- Spawn points are canvas `circleMarker`s, not div icons — some maps have 400+
  of them and that is the difference between smooth panning and a stutter.
- The base artwork lives in its own Leaflet pane below the overlay pane, because
  Leaflet's stylesheet stacks `<svg>` above `<canvas>` within a pane and would
  otherwise bury the spawn dots under the map.
- Quest marker ids are derived from their ground position rather than an array
  index, because they are persisted when you tick a location off. An index would
  silently move your ticks if the upstream feed reordered a spawn list.
- Quest layers rebuild independently of the other eleven, since ticking
  locations happens constantly during a raid.

To refresh game data after a wipe or patch, re-run `npm run data` and commit the
regenerated `public/data`.

## Credits

Map artwork and game data come from [tarkov.dev](https://tarkov.dev) and the
[the-hideout SVG map project](https://github.com/the-hideout/tarkov-dev-svg-maps).

Escape from Tarkov is a trademark of Battlestate Games. This is an unofficial
fan project with no affiliation.
