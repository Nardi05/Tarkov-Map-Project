# Tarkov Map Project

Interactive maps for Escape from Tarkov: PMC and Scav spawns, extracts, transits,
keys, boss spawns and every task objective — on one map, with every layer
explained in plain English so a new player can learn a map without a second tab
open.

Covers all 13 playable maps, works from a phone up to a desktop, and rebuilds
its game data from tarkov.dev every day without a redeploy.

Every piece of Tarkov jargon on the site — Kappa, found-in-raid, transits,
Scavs, Kord Breach — explains itself on hover or tap, so a new player is not
expected to arrive already fluent.

## How the site is organised

The site is a set of separate trackers, plus two places where they meet:

| Section | What it tracks | Setup |
| --- | --- | --- |
| **Tasks** (`#/quests`) | trader side tasks, keys, find-in-raid items | Tasks & Season walkthrough (`#/quests/setup`) |
| **Story** (`#/story`) | the main chapters, lock choices and the four endings | Story setup (`#/story/setup`) |
| **Season** (`#/season`) | the Kord Breach line and battle-pass documents, on the seasonal character | the Tasks & Season walkthrough, on Season |
| **Hideout** (`#/hideout`) | station levels | none — tick stations on the page |
| **Maps** (`#/maps`) | — | none; draws task objectives, story steps for your ending and season documents from the trackers |
| **Dashboard** (`#/dashboard`) | — | none; a customisable summary of every tracker |

The landing page (`#/welcome`) lays the trackers out side by side, each with its
own setup, so nobody has to tick five hundred trader tasks to follow the story.
Once anything is tracked, `#/` opens the dashboard instead.

## Live

- **Production** (`main`) — the stable build: https://tarkov-map-project.vercel.app
- **Dev previews** — every other branch gets its own Vercel preview URL.

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
  the built-in ones; re-saving under the same name updates it. Every map opens
  on **Questing** (objectives, keys, extracts, transits — no spawn dots or boss
  skulls) until you pick something else for it, and each map remembers its own
  last view.
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

Season tracking has its own tab, `#/season`: the story line (always read from
the Season character, so it can be viewed from any profile), days left, and the
battle-pass documents as a first-class hunt — a type-to-map list, a **Battle pass
hunt** layer preset, and a "show documents" prompt on any map that has them.
Daily pickup limits differ by mode (30 / 20 / 15).

Setting up a Season character uses the same walkthrough as the traders, with a
Kord Breach step first.

## Story endings

`#/story` is its own tab, next to Maps. The overview lists the four Tarkov 1.0
endings — **Savior**, **Survivor**, **Debtor**, **Fallen** — with community
difficulty, the lock choices that lead there, and the rewards.

Target one and the page becomes a guided path: what to do next, every lock
with the right answer highlighted, chapter checklists, major-evidence spots
(8 of 9 for Savior), hideout gates, map links, and a "never do these" list.
Ticks and choices are stored per character (PvP / Season / PvE) with the rest
of your progress.

**Setting it up.** `#/story/setup` is separate from the task walkthrough: pick an
ending (or "not decided"), record the lock choices you have already made, and
tick the chapters behind you. Like the task setup it writes nothing until
Finish and only ever adds. Maps then list the target ending's unfinished steps
that happen on them, in the Tasks panel beside the map.

The chapters are not in the tarkov.dev feed. They are vendored from the wiki
into `src/data/story-endings.json`.

## The dashboard

`#/dashboard` is the home page for anyone tracking something: a summary of every
tracker, then the shortest answer to "what do I do next" — which map to queue,
the tasks open on it, the keys they go through, and what to keep for a hand-in.

It is assembled from eleven panels — your trackers, task progress, story,
next raid, upcoming, season, keys, hideout, find in raid, by trader, jump back
in — and **you arrange it**. Press
**Customise** and each panel grows a grip you can drag it by, arrows for the
keyboard, a control for full or half width, and an × that puts it in a tray at
the bottom. The tray remembers where a panel came from, so switching one back on
returns it to its old place rather than the end. The grid itself is one column
or two. Upcoming and keys paginate 10 or 20 at a time: ticking a quest done or a
key acquired drops it from the list and the next row fills in.

The header bar holds the raid clocks and the target task, so those are not
separate dashboard tiles.

The **trackers** panel shows where tasks, story, season and hideout stand and
offers the setup for anything not started. An older saved layout gets it added
at the top; everything else new is appended.

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

## The task tracker

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
npm run dev       # serves the app *and* the live data endpoint at /api/data
```

`npm run data` is optional for development — `npm run dev` serves the live
endpoint, so the committed snapshot in `public/data` only matters when that
cannot be reached. Run it when you want to refresh the fallback:

```bash
npm run data      # rebuild the public/data snapshot (needs network)
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

## Where the game data comes from

Maps, quests, keys, items and hideout requirements are rebuilt from
[tarkov.dev](https://tarkov.dev) **on request, daily**, not at deploy time. A
patch that changes a task shows up here without anyone touching the site.

```
GET /api/data/index.json
        |
        |  CDN hit for the next 24h (s-maxage=86400), and
        |  stale-while-revalidate serves the old copy while
        |  the new one is being built, so nobody ever waits
        v
api/data/[...path].js  ->  scripts/lib/build-data-core.mjs
                           (the same pipeline `npm run data` runs,
                            against an in-memory filesystem)
                                     |
                                     |  tarkov.dev down, or the feed
                                     |  comes back too thin to trust
                                     v
                           public/data/*.json, the snapshot baked
                           into the bundle at build time
```

The response says which one you got in `x-tk-source`, and the site repeats that
in the footer and on the Settings page — a stale answer is fine, a stale answer
presented as current is not.

Three layers keep it cheap: the CDN answers for a day, so roughly one request
per region per day reaches the function at all; a warm function reuses one
build for an hour, so the thirteen map payloads cost one pipeline run between
them rather than thirteen; and the browser holds its own copy for the session.
The whole pipeline takes about 1.2s and ~250MB, well inside a serverless
function's budget.

`npm run build` still runs `npm run data`, but only to lay down the fallback.
It is not what a healthy deploy serves.

**On a host with no functions** — a plain static bundle, `vite preview` without
this repo's config, GitHub Pages — `/api/data/*` 404s once, the client notices,
and everything falls back to the snapshot. The site works identically; it just
says "snapshot" instead of "live". `vite.config.ts` mounts the same endpoint in
`npm run dev` and `npm run preview`, so the path the deployed site takes is not
the one path that never gets exercised locally.

### What comes from the wiki

tarkov.dev is built from the game files, so it wins wherever it has an answer.
It does not carry everything, and its task feed has been thin lately (2.5% of
tasks flagged Kappa, 55% with no level gate, where a healthy feed sits near 50%
and 15%). `npm run wiki-details` (`scripts/fetch-wiki-details.mjs`) fills the
gaps from the [Escape from Tarkov Wiki](https://escapefromtarkov.fandom.com)
(CC BY-SA), fetching pages fifty to a request and caching them on disk:

| From the wiki | Written to | Shown |
| --- | --- | --- |
| every quest's objectives (optional ones marked), rewards, quest-item table, how to start it, and guide — 530 of 531 quests | `data/wiki-tasks.json` → `public/data/task-details.json` | the task sheet (click a task name on Tasks, the dashboard or the graph), and on the map under a clicked objective |
| every map key's spawn spots, lock location, what is behind the lock, and the quests that use it — all 203 keys | `data/wiki-keys.json` → each map payload's `keys[].detail` | on the map, when you click a locked door |
| all ten story chapters: how each starts, every objective grouped by path, rewards, and the guide | `data/wiki-story.json` → `public/data/story-details.json` | "Full chapter from the wiki" in each chapter on the story page |
| the "Required for Kappa" flag | used by the build | fills the Kappa flag while the feed is degraded (130 → 250 tasks) |

What is deliberately **not** taken from the wiki: player levels. Where the wiki
and the feed both state one they disagree 46% of the time, and in every
disagreement the live feed could settle, it sided with the site's existing
value. Quest prerequisites keep coming from `npm run quest-prereqs`, which now
reads the same page cache instead of refetching.

The scrape runs best-effort on every deploy (`npm run data`), and refuses to
replace a committed file with one that lost more than a fifth of its entries.

## Deploying

The repo is set up for Vercel: connect it as a project and every push to the
production branch redeploys automatically. `vercel.json` sets the build command
to `npm run data && npm run build` and gives `api/data/[...path].js` the
vendored inputs it needs via `includeFiles`.

Each deploy refreshes the fallback snapshot from tarkov.dev and best-effort
updates the wiki-scraped parts — quest prereqs, Kord document spawns, task
screenshots (a down wiki keeps the last good scrape). Those are the pieces that
change rarely; the runtime endpoint re-pulls only tarkov.dev.

Preview deploys from non-`main` branches are unlisted Vercel URLs. Production
stays on `main`. There is no site-password gate.

## How it fits together

```
scripts/refresh-sources.mjs
                         runs on every `npm run data` / Vercel deploy: wiki
                         scrapes (best-effort) then tarkov.dev rebuild
scripts/build-data.mjs   the CLI: writes the fallback snapshot into public/data
scripts/lib/build-data-core.mjs
                         the pipeline itself — fetches tarkov.dev's JSON feeds,
                         resolves translations, writes one small payload per
                         map. Takes its filesystem as a parameter, which is
                         what lets the live endpoint run it in memory
scripts/lib/overlay-fs.mjs
                         copy-on-write filesystem: reads fall through to disk,
                         writes land in a Map. How the pipeline runs where
                         there is nowhere to write
scripts/lib/data-middleware.mjs
                         mounts the live endpoint in `vite dev` and
                         `vite preview` so local and deployed agree
api/data/[...path].js    the live endpoint. Runs the pipeline on request behind
                         a one-day CDN cache, falls back to the snapshot
scripts/fetch-task-images.mjs
                         caches the wiki's task screenshots into
                         data/task-images.json
scripts/fetch-kord-documents.mjs
                         caches the battle-pass document spawns into
                         data/kord-documents.json
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
                         the frame the six tab pages share, mounted above the
                         route switch so the section nav is the same element
                         across a tab change — which is what lets its
                         highlight slide instead of being redrawn in place.
                         Also owns the phone's bottom tab bar
src/components/PageShell.tsx
                         the same bar for the pages that are not a section —
                         Settings and the setup walkthroughs
src/components/ui.tsx    the shared component vocabulary: card, callout, empty
                         state, menu, page header, the nav, the glossary term.
                         Anything a page repeats more than twice lives here
src/lib/glossary.ts      the jargon the site used to assume you already knew —
                         Kappa, FIR, transit, Scav, Kord Breach — each one
                         explained in a sentence, shown on hover or tap
src/components/Trackers.tsx
                         each progression system's status and setup, shared
                         by the landing page and the dashboard
src/components/Onboarding.tsx
                         the map legend
src/lib/persist-migrate.ts
                         the persisted-state migrations. The rule every
                         version has to clear: a migration may never drop a
                         task
src/components/          map canvas, layer panel, task panel, detail panel,
                         and the dashboard's panels
```

Opening a map is one request for a 25–225KB JSON file (well under 50KB gzipped
for most maps), served by the live endpoint or, if that cannot answer, by the
snapshot in the bundle. Either way the site keeps working when the upstream API
is down — see "Where the game data comes from" above.

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
