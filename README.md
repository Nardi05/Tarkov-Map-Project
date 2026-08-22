# Tarkov Map Project

Interactive maps for Escape from Tarkov: PMC and Scav spawns, extracts, transits,
keys, boss spawns and every task objective — on one map, with every layer
explained in plain English so a new player can learn a map without a second tab
open.

Covers all 13 playable maps, works from a phone up to a desktop, and ships as a
static site with no backend.

## Live

Both are behind the same site password.

- **Production** (`main`) — the stable build: https://tarkov-map-project.vercel.app
- **Dev previews** — every other branch gets its own Vercel preview URL, listed
  on the deployment in the Vercel dashboard. They sit behind the same password.

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
| Battle pass documents | Where Kord Breach documents can spawn |
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

The task panel is built around the way you actually play. Before a raid, tick
the tasks that are in your in-game list as **active**; the map then draws those
objectives and nothing else, so you see every active location at once instead of
a wall of green. During the raid you can tick off individual locations — a task
with three mark spots remembers which one you did — and mark the whole task done
when you finish it.

A task is in one of three states, and you set all of them yourself:

- **Not started** — the default.
- **Active** — it is in your in-game task list right now. These are what the
  map draws.
- **Done** — finished. Tick every location off and the panel offers to mark the
  whole task done in one go.

The control cycles forward, so a task carrying any status also gets an undo
button that puts it straight back to not started — a mis-tap shouldn't have to
be walked through "done", inventing progress you never made.

If you have ticked nothing on a map, it draws what the graph says you could pick
up there, so an unfamiliar map is useful the moment it opens. The instant you
mark something active, it narrows to exactly that: **active if known, else
available**. To browse everything regardless, tick **Show every task on the
map**.

Some rows say **no map location**. Only about a third of objectives in the game
data carry coordinates; the rest name their map and stop there — kill counts,
"survive and extract from here", most of the Survivalist Path. Those tasks are
still yours to do on that map, so they are listed and simply have nowhere to
point. Tasks that do have pins sort first, so ticking from the top of the list
always moves something.

Where the wiki has screenshots for a task, the detail panel shows them as a
carousel — arrows to step through, click to blow one up full screen, Escape or
another click to come back. Neighbouring photos and the full-size copy are
fetched while you look at the current one, so only the first costs a wait. It is
usually the fastest way to turn "somewhere in this building" into "that shelf".

### Keyboard, fullscreen and getting out of the way

The map page has two different ways to give you more room, and they compose
rather than fighting:

- **Fullscreen** (`F`) hands the whole page to the browser — header, side panel
  and all. The panels come with it, because a bigger map you can't pick a task
  on is not what anyone was asking for. Where the browser will not hand over
  the screen — iOS Safari has no element fullscreen, and an iframe needs
  `allow="fullscreen"` — the page pins itself over the viewport instead, so the
  button always does the thing it says.
- **Hide the interface** (`H`) takes the site's own chrome away and leaves
  nothing but map, in a window or out of one. One control stays behind to undo
  it, so it is never a one-way door on a device with no keyboard.

The rest: `L`, `T` and `S` open the layers, tasks and settings panels, `[`
hides or shows the side panel, `0` fits the whole map on screen, `/` jumps to
the search box, `Esc` closes whatever is open, and `?` lists all of it. Every
shortcut pauses while you are typing, so searching a task list for "flash" does
not send you fullscreen.

## Kord Breach (Season 1)

The site now tracks three characters, because the game does: **PvP Zone**, **Season**,
and **PvE**. Progress never crosses between them.

The seasonal story line is not in the tarkov.dev feed. It is vendored from the wiki
into `src/data/kord-season.json` and folded into the graph at load, so Uninvited
Guests through Digital Puzzle show up on the tracker when you are on Season.

Quest names that gained a `[PVP ZONE]` / `[PVE ZONE]` suffix after 1.1 are stripped
in the UI and filtered by the mode you picked — a PvE character no longer sees the
PvP Zone variants.

Battle-pass documents are a first-class hunt: a type-to-map list on the quest
page, a **Battle pass hunt** layer preset, and a "show documents" prompt on any
map that has them. Daily pickup limits differ by mode (30 / 20 / 15).

The quest tracker also ranks **which map to queue** from your active tasks.

## The dashboard

`#/` is the front page and the shortest answer to "what do I do next": which map
to queue, the tasks that are open on it, the keys those tasks go through, and
what to keep out of raid for a hand-in.

It is assembled from eight panels — progress, next raid, upcoming, keys, find in
raid, by trader, season, jump back in — and **you arrange it**. Press
**Customise** and each panel grows a grip you can drag it by, arrows for the
keyboard, a control for full or half width, and an × that puts it in a tray at
the bottom. The tray remembers where a panel came from, so switching one back on
returns it to its old place rather than the end. The grid itself is one column
or two. Upcoming and keys paginate 10 or 20 at a time: ticking a quest done or a
key acquired drops it from the list and the next row fills in.

The header bar holds the raid clocks and the target task, so those are not
separate dashboard tiles.

**Kord Breach** is listed in full on the seasonal panel, from Uninvited Guests
through Digital Puzzle (and Riding the Wave). Tick the story line on a Season
character.

## Settings, hideout and a save file

`#/settings` is the profile page: switch between the three characters, set
faction / level / edition / trader loyalty, aim the planner at a target (usually
Collector), recalculate the plan from the quests you currently have accepted,
reset tasks or stash, or wipe the character. The other two modes are left alone.

`#/hideout` tracks station levels on the same stash counts the item list uses.
Marking a level done also ticks every level below it.

Progress lives in this browser only. **Save to a file** on settings (or after
task sync) writes quests, item counts, keys and hideout for all three characters
as readable JSON; **Restore** replaces rather than merges, and asks first.

`⌘K` / `Ctrl+K` jumps to a map, a task, hideout, or any of the pages.

The layout is saved in your browser with the rest of your settings. A layout
written before a panel existed picks the new panel up rather than being thrown
away, and **Reset layout** puts everything back as it shipped.

Dragging is pointer-based rather than HTML5 drag-and-drop, so it works with a
finger. Everything it can do is also on a button, so it works without one.

## The quest tracker

`#/quests` answers a different question from the maps. They tell you what is on
a map; it tells you what you should be doing — your active tasks, what each
trader will offer next, the keys those tasks go through, and everything you need
to find in raid.

It runs on the full task graph, including the ~165 tasks that never appear on a
map, which is why the per-map payloads cannot answer it alone.

**Setting it up.** Open the walkthrough and go through the traders in the order
they unlock, ticking whatever is in your list. That is the whole job: a quest
sitting in your list means the trader already gave it to you, so everything
behind it must be done, and the site fills in the rest of your wipe from there.
Ticking one late Prapor quest fills in three earlier ones without being asked.
Nothing is written until you press Finish, and the summary names every task it
worked out for you before it does.

**Screenshots instead of ticking.** Each trader step can read its list off a
screenshot. Because you have already said which trader you are on, a garbled
line is matched against that trader's fifty-odd names rather than all 511, which
is what makes it workable. It proposes and you confirm — strong matches start
ticked, loose ones are listed unticked and marked, and anything it read but
could not place is shown rather than dropped. The reader runs entirely in your
browser; the image is not uploaded anywhere.

**What it infers, and what it never does.** The graph works out `locked` and
`available` from prerequisites, level, faction and trader loyalty. It never
invents `active`, `done` or `failed` — those only ever come from you, and what
you say always wins over what it worked out.

**Failing a quest is a state too.** Six tasks across the BTR Driver, Ragman and
Lightkeeper sit behind a failure: `Hot Wheels - Let's Try Again` is offered
precisely when you fail `Hot Wheels`, and `Loyalty Buyout` when you fail
`Chemical - Part 4`. With no way to say so, none of the six could ever appear
for anybody. A **Failed** button shows on the handful of quests the graph
actually branches on failing — read from the data, not listed by hand — and
those tasks then sit in Finished, where you can undo them. Every row carries the same control as the
map panels, so a wrong inference is one click from corrected.

Prerequisites come from two sources. The tarkov.dev feed states them for barely
half its tasks, so the rest are read off the wiki's quest infoboxes by
`npm run quest-prereqs` into `data/quest-prereqs.json`. The feed wins wherever it
has an opinion; wiki edges only fill silence, and a lock that only the wiki
claims says so on screen. The dashboard reports its own coverage rather than
warning vaguely.

**Trader loyalty** is optional and only ever narrows the list, and only for
traders you name. Leaving it blank gives exactly the list you would have had
without the feature.

**Your progress is yours.** It lives in your browser, kept separately for PvP
Zone, Season and PvE, with no account and no server. Save it to a file to back it up or move
it to another device; restoring replaces rather than merges, and tells you what
is about to be overwritten first.

## Running it

```bash
npm install
npm run data      # fetch game data and build public/data (needs network)
npm run dev
```

```bash
npm test              # unit tests (no browser, no network)
npm run images        # refresh the wiki screenshot cache (optional, slow)
npm run kord-docs     # refresh the battle-pass document spawns from the wiki
npm run quest-prereqs # rescrape quest prerequisites from the wiki (slow)
npm run check-quests  # cross-check quest data against the wiki (optional, slow)
npm run task-facts    # refresh the level/Kappa fallback from known-good data
npm run og            # redraw the social preview card (needs a browser)
npm run build         # stage OCR assets, type-check, bundle into dist/
npm run preview
npm run smoke         # opens every map in a browser and checks for errors
```

`dist/` is a plain static site — the app uses hash routing, so it drops onto any
static host, including a subpath, with no rewrite rules.

`npm run build` stages the OCR runtime into `public/ocr` first (gitignored,
copied from `node_modules` plus the committed language model), so screenshot
reading works without fetching anything from a CDN at runtime. None of it is
downloaded by a visitor unless they open the screenshot panel.

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
scripts/fetch-kord-documents.mjs
                         caches the battle-pass document spawns into
                         data/kord-documents.json (committed; not run on deploy)
scripts/check-quests.mjs cross-checks trader/level/Kappa against the wiki and
                         prints disagreements; changes nothing
scripts/audit-graph.mjs  structural audit of the built graph — dangling edges,
                         cycles, and a playthrough that proves every task can
                         be reached by somebody. No network, so it runs in the
                         tests too (src/lib/graph-integrity.test.ts)
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
src/lib/dashboard.ts     the dashboard layout model — which panels, in what
                         order, how wide — kept free of React so it can be
                         tested without a browser, and able to read every
                         shape this has ever stored
src/lib/use-drag-reorder.ts
                         pointer-based drag reordering, because HTML5
                         drag-and-drop does not fire on touch at all
src/components/TabShell.tsx
                         the frame the three tab pages share, mounted above
                         the route switch so the section nav is the same
                         element across a tab change — which is what lets its
                         highlight slide instead of being redrawn in place
src/lib/persist-migrate.ts
                         the persisted-state migrations. The rule every
                         version has to clear: a migration may never drop a
                         task
src/components/          map canvas, layer panel, task panel, detail panel,
                         and the dashboard's panels
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
  - Quest objectives lose their map positions. Seen for real, twice: a build
    kept every spawn but dropped 218 of 817 quest markers. Nothing about the
    task fields catches that, so the build also compares its marker count
    against the previous one.
  On a big drop the build keeps everything it just produced and puts back only
  the markers it lost, from the committed `public/data`. Positions don't move
  without a patch, so a marker upstream dropped this morning is still where it
  was yesterday. Below the threshold the fresh build stands on its own, so
  content genuinely removed in a wipe does disappear.
  `TK_ALLOW_SPARSE_TASKS=1` skips the backfill and ships the thin build as-is.

  This has been through two worse designs, both worth not repeating. Refusing
  the build outright fails the whole deploy, so unrelated work can't ship while
  upstream is broken — and it refuses *after* `public/data` has been rewritten,
  leaving the thin data on disk anyway. Swapping the entire previous directory
  back in fixes the deploy but throws away the build that just ran, so any
  change to how data is derived — a new layer, a fix to which tasks get listed
  — silently never reaches the site. Merging is what actually holds both: new
  code, complete map.
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
- Battle pass document pins are anchored, not surveyed, and **the list is the
  feature — the pins are the bonus.** No feed carries these: tarkov.dev doesn't
  model them, and the community editor at
  [KordMap](https://github.com/KalleLeskinen/KordMap) keeps its markers in a
  database, committing only a list of which document types appear per map. The
  wiki documents each spawn, but as a sentence and a screenshot — "inside 3
  story dorms, in room 304 on the nightstand". So a spawn whose description
  names one of the map's place labels is pinned at that label, and the rest ship
  with no position rather than a guessed one. That is most of them: 109 of 265.
  Expanding the layer's row in the panel lists every spawn on the map with its
  description and photo, grouped by building, which is the only surface the
  unplaced ones have — Icebreaker and the Labyrinth have no pins at all. Pins
  are exempt from floor filtering, because a place label has no elevation and
  filtering on an invented `y` would hide them.
- Anchoring prefers the place the sentence puts the document *in* over one it
  steers by. "Inside the TTS store in front of EMERCOM medical unit key zone"
  names two labelled places and longest-match alone picked the wrong one. Bare
  interior nouns are refused outright: Streets labels a building "Office", which
  matched three descriptions of *other* buildings' offices. Proper nouns and
  distinctive landmarks are untouched — Shoreline's "Pier" means the pier.
- Changing tab does not remount the section nav, and that is load-bearing
  rather than an optimisation. When each page rendered its own, the highlight
  pill was created already sitting under the new tab, so the `transition:
  transform` it carries never had two positions to move between — the whole
  change read as a reload. The body slides with a keyed CSS animation rather
  than a View Transition: `startViewTransition` is not in every browser that
  will open this, and where it is, it snapshots the document as soon as its
  callback returns, while React has only *scheduled* the re-render.
- Leaflet's `setMinZoom` zooms the map for you when the new floor is above
  where you currently are. The floor is derived from the container size, so it
  rises whenever the viewport grows — which meant pressing Fullscreen on a map
  you had zoomed out to see whole jumped the view back in, and read as the
  button resetting the map rather than enlarging it. The floor now only ever
  comes down, and measurements are taken without touching map state.
- Spawn clusters ignore the game's zone names. Zones overlap heavily in space,
  so one visible clump routinely carries three or four of them and grouping by
  name left the clump on screen.

- Task names are cleaned before anything keys off them, and both reasons cost
  real data rather than looking untidy. "Arena Business [PVP ZONE]" arrives
  with a trailing newline — the zone suffix is matched at end-of-string, the
  wiki is asked for a page by that title, and edges from other quests are
  matched by name, so one invisible character cost that quest its wiki page and
  cost "Balancing - Part 1" the edge pointing at it. Separately, the English
  dictionary answers three of the four Prestige quests with the German
  "Neuanfang"; a name that collides with another task's is rebuilt from
  `normalizedName`, the feed's own English slug, which stays distinct.
- `npm run task-facts` refuses to run against a `public/data` that was built
  while the feed was degraded, and it reads that verdict from `index.json`
  rather than measuring the snapshot. Measuring cannot work: when the feed is
  thin, `npm run data` patches it *from task-facts.json*, so the snapshot on
  disk reads healthy again and the old ratio check sailed past — in exactly the
  case it existed to catch. A run in that state wrote the feed's blanks back
  out as asserted facts, and a fill-only patch never revisits a value that is
  already there.

To refresh game data after a wipe or patch, re-run `npm run data` and commit the
regenerated `public/data`. Then run `npm run audit-graph` and read the report —
`npm test` enforces the parts of it that must never regress.

## Credits

Map artwork and game data come from [tarkov.dev](https://tarkov.dev) and the
[the-hideout SVG map project](https://github.com/the-hideout/tarkov-dev-svg-maps).
Task screenshots are served from the
[Escape from Tarkov Wiki](https://escapefromtarkov.fandom.com), whose text and
images are licensed CC BY-SA.

Escape from Tarkov is a trademark of Battlestate Games. This is an unofficial
fan project with no affiliation.
