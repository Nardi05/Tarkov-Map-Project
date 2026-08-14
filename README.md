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
square is a PMC exit wherever you see it. Task objectives take that one step
further and vary the glyph by what the objective actually asks of you:

| Glyph | Objective |
| --- | --- |
| Diamond | Find a quest item |
| Signal | Place a marker or jammer |
| Crate | Stash or plant an item |
| Reticle | Kills that count for the task |
| Runner | Just reach the spot |

A quest item that can spawn in eleven places gets one pin, not eleven — the
game only puts it in one of them, so the pin sits at the middle of the spread
and the panel says how many spots it covers. Objectives you must genuinely
repeat (mark three spots, plant three jammers) keep a pin each.

Spawn points are drawn one dot per place, not one per spawn. The game scatters
several spawn points a few metres apart inside a single spot, which rendered as
an unreadable clump; those collapse into one dot at their centre, and the detail
panel says how many points are behind it.

Beyond the layers:

- **Quick views** — one tap to switch the map between learning it, questing,
  a Scav run, or threat-spotting. Save your own layer combinations alongside
  the built-in ones; re-saving under the same name updates it.
- **Raid clock** — the two in-game times you can queue into, side by side, day
  and night. Tarkov time runs 7x real time and the two raids are always 12
  hours apart. Factory's clocks are fixed and Labs has no day/night, so both
  say so instead of showing a clock that would be wrong.
- **Floors** — multi-level maps (Interchange, Reserve, Streets, Labs, Icebreaker)
  filter markers by the level they are actually on.
- **Two art styles** — a clean vector map and photographic satellite tiles,
  georeferenced identically so markers never shift between them. Place names
  (Dorms, Big Red, Main Bridge…) show on both.
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

The control cycles forward, so a task carrying any status also gets an undo
button that puts it straight back to not started — a mis-tap shouldn't have to
be walked through "done", inventing progress you never made.

Nothing here is inferred. The site never guesses which tasks you could have
picked up or hides one behind a prerequisite it thinks you haven't met, so the
panel can't disagree with what the game is telling you. If you just want to
study a map you haven't started, tick **Show every task on the map**.

Where the wiki has screenshots for a task, the detail panel shows them as a
carousel — arrows to step through, click to blow one up full screen, Escape or
another click to come back. Neighbouring photos and the full-size copy are
fetched while you look at the current one, so only the first costs a wait. It is
usually the fastest way to turn "somewhere in this building" into "that shelf".

Everything is stored in your browser only. It survives a reload and switching
maps, so dying on Customs and running a Woods raid before coming back does not
cost you your ticked list.

## Running it

```bash
npm install
npm run data      # fetch game data and build public/data (needs network)
npm run dev
```

```bash
npm run images        # refresh the wiki screenshot cache (optional, slow)
npm run check-quests  # cross-check quest data against the wiki (optional, slow)
npm run task-facts    # refresh the level/Kappa fallback from known-good data
npm run build         # type-check + production bundle into dist/
npm run preview
npm run smoke         # opens every map in a browser and checks for errors
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
scripts/fetch-task-images.mjs
                         caches the wiki's task screenshots into
                         data/task-images.json (committed; not run on deploy)
scripts/check-quests.mjs cross-checks trader/level/Kappa against the wiki and
                         prints disagreements; changes nothing
scripts/build-task-facts.mjs
                         vendors a known-good level/Kappa fallback into
                         data/task-facts.json for build-data to fall back on
src/data/geo.json        vendored georeferencing (transform, bounds, rotation,
                         floors, place labels) for each map
src/lib/leaflet-crs.ts   turns that into a Leaflet CRS so markers and artwork
                         share one coordinate system
src/lib/layers.ts        the layer taxonomy: colour, shape, and the plain-English
                         explanation shown in the UI
src/lib/build-layers.ts  data -> Leaflet layers, one builder per layer
src/lib/tarkov-time.ts   the in-game clock: 7x real time, anchored at UTC+3
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
- Spawn clustering runs at render time, after the floor filter, never at build
  time. Two points on different levels of Interchange are not one place however
  close they look from above, and the raw positions stay in the payload.
- `npm run data` will not publish a visibly worse build than the last one. Two
  separate things go wrong upstream and only one is obvious:
  - Level gates and Kappa flags go sparse. Those are patched from
    `data/task-facts.json`, but only while the feed looks degraded, so once it
    recovers the live values win and the fallback can't go stale behind it.
    The patch is fill-only — a live value that exists is never overwritten.
  - Quest objectives lose their map positions. Seen for real: a build kept
    every spawn but dropped 218 of 817 quest markers. Nothing about the task
    fields catches that, so the build also compares its marker count against
    the previous one and refuses on a big drop.
  Either refusal fails the Vercel build, which leaves the previous deployment
  serving good data. `TK_ALLOW_SPARSE_TASKS=1` overrides both.
- The wiki cannot substitute for tarkov.dev here. It has no map coordinates at
  all, and while its Kappa flag is reliable it states a player level on only
  about a quarter of pages. It is a cross-check and a gap-filler, not a source.
- Task screenshots are fetched by `npm run images`, never by `npm run data`.
  A deploy must not depend on the wiki being up, so the cache is committed and
  the build just copies it in; if it is missing, galleries silently vanish.
- Wiki images are hotlinked and always requested through the CDN's
  `scale-to-width-down` transform. The originals are full game captures — one
  Streets overview is a 3.9MB PNG, versus 99KB at 640px.
- Those `<img>` tags must keep `referrerPolicy="no-referrer"`. The wiki's CDN
  blocks hotlinks by Referer and answers with a 404 carrying a 300x171
  "image not available" JPEG — a perfectly valid image, so `onError` never
  fires and you get a grey box instead of a screenshot. Sending no referrer is
  served the real file.
- Spawn clusters ignore the game's zone names. Zones overlap heavily in space,
  so one visible clump routinely carries three or four of them and grouping by
  name left the clump on screen.

To refresh game data after a wipe or patch, re-run `npm run data` and commit the
regenerated `public/data`.

## Credits

Map artwork and game data come from [tarkov.dev](https://tarkov.dev) and the
[the-hideout SVG map project](https://github.com/the-hideout/tarkov-dev-svg-maps).
Task screenshots are served from the
[Escape from Tarkov Wiki](https://escapefromtarkov.fandom.com), whose text and
images are licensed CC BY-SA.

Escape from Tarkov is a trademark of Battlestate Games. This is an unofficial
fan project with no affiliation.
