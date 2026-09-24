# Tarkov Map Project

A calm all-in-one companion for Escape from Tarkov: interactive maps, trader tasks, story endings, the seasonal Kord Breach line, hideout stations, and a stash of what your quests still need. Built for wipe players who want TarkovForge / TarkovTracker coverage without the clutter — MapGenie-grade maps, eft-kappa clarity, and Tarkov Market *systems* knowledge (value, flea intuition, quest chain order) behind a quiet UI.

Covers all 13 playable maps, works from phone to desktop, and rebuilds game data from tarkov.dev every day. Tarkov jargon on the site explains itself on hover or tap.

## Live

- **Production** (`main`): https://tarkov-map-project.vercel.app
- **Branch previews**: every other branch gets its own Vercel preview URL.

## What's in the app

| Section | What it does |
| --- | --- |
| **Maps** (`#/maps`, `#/m/<map>`) | Spawns, extracts, transits, keys, bosses, task objectives — layers you can calm down with Quick Views |
| **Tasks** (`#/quests`) | Active / done trader tasks; also `#/quests/items` (stash) and `#/quests/graph` (dependency graph) |
| **Story** (`#/story`, `#/story/<id>`) | Main chapters, lock choices, four endings (Savior / Survivor / Debtor / Fallen) |
| **Season** (`#/season`) | Kord Breach line + battle-pass document hunt (Season character) |
| **Hideout** (`#/hideout`) | Station levels against the same stash counts |
| **Dashboard** (`#/dashboard`) | Summary of every tracker + “what do I do next” |

The landing page (`#/welcome`) lays the trackers out side by side, each with its own setup — you don’t have to tick five hundred trader tasks just to follow the story. Once anything is tracked, `#/` opens the dashboard instead.

Between raids the useful loop is short: **continue the last map + the next ~3 objectives**. Depth (full dashboards, every layer, long story lists) stays one click away.

Stash lives under Tasks as item / key counts for what you still need — not a separate account or cloud inventory.

## Maps

| Layer | What it tells you |
| --- | --- |
| PMC / Scav / AI PMC spawns | Where players and bots can start |
| Boss / Sniper Scav spawns | Positions, spawn chance where known |
| PMC / Scav / shared extracts | Who can use each exit, and what it needs |
| Transits | Move to the next map keeping gear and timer |
| Quest objectives | Active task pins (and available ones if nothing is tracked yet) |
| Battle pass documents | Kord Breach document spawns |
| Locked doors & keys | Which key opens what |
| Switches / hazards | Levers, minefields, restricted zones |

**Quick Views** (one tap): Learning the map · Questing · Scav run · Threats · Battle pass hunt · Everything. You can save your own layer combinations alongside the built-ins.

Also on the map page:

- **Raid clocks** — the two in-game times (7× real time, always 12 hours apart). Factory and Labs call out their own rules instead of lying.
- **Floors** — multi-level maps (Interchange, Reserve, Streets, Labs, Icebreaker) filter markers by level.
- **Two art styles** — clean vector or photographic satellite, georeferenced the same so pins don’t jump; place names (Dorms, Big Red…) show on both.
- **Shortcuts** — `F` fullscreen, `H` hide chrome, `L` / `T` / `S` panels, `[` side panel, `0` fit map, `/` search, `Esc` close, `?` for the list.

## Task tracking

Before a raid, mark the tasks in your in-game list as **active**; the map draws those objectives (and nothing else). During the raid you can tick individual locations — a task with three mark spots remembers which ones you did — and mark the whole task **done** when you finish. **Failed** is a real state for the handful of quests that branch on failure.

If you haven’t marked anything active on a map yet, it shows what the graph says you could pick up there. Once something is active, it narrows to that. Tick **Show every task on the map** to browse everything regardless.

About a third of objectives carry coordinates; the rest (kill counts, “survive and extract”, and so on) still list on that map with nowhere to point. Tasks with pins sort first.

Where the wiki has screenshots, the task detail panel shows them as a carousel — usually the fastest way to turn “somewhere in this building” into “that shelf”.

### Quest graph (data, not a Tree screen)

The site knows prerequisite → unlock order the way Tarkov Market’s Tree → By chains does: cross-trader dependency chains, gates (level, loyalty, prior quests), and a progress frontier. That knowledge drives setup inference, planning, and map reasoning — imprint is data/order, not a UI chrome goal. `#/quests/graph` is a dependency graph page over that same data; there is still **no** Market-style pannable Tree canvas planned. Between raids you still only see the next few objectives.

Late-wipe sync that fills earlier prerequisites when you mark a late quest active is planned (**P0.6**). Setup already does some of this when you tick and save.

### Setup on this branch

Task setup is still the trader-by-trader walkthrough (`#/quests/setup`), with optional in-browser screenshot reading per trader. Nothing writes until Finish, and ticks only ever add. A one-screen setup with search, optional OCR, and a fresh-wipe / level-1 skip is in progress (open **PR #14**) — not merged here yet.

Story has its own short setup (`#/story/setup`): pick an ending (or “not decided”), record lock choices, tick chapters behind you. Season uses the same task walkthrough with a Kord Breach step first when you’re on the Season character.

## Local progress

Free, no account, no server. Progress lives in this browser only, kept separate for **PvP Zone**, **Season**, and **PvE**.

Settings (`#/settings`) is the profile page: switch character, set faction / level / edition / trader loyalty, aim the planner at a target (usually Collector), reset tasks or stash, or wipe the character. The other two modes are left alone.

**Save to a file** / **Restore** write and replace quests, item counts, keys, and hideout for all three characters as readable JSON. Restore asks first. `⌘K` / `Ctrl+K` jumps to a map, task, hideout, or any page.

## Run locally

```bash
npm install
npm run dev       # app + live /api/data endpoint
npm run build     # stage OCR assets, type-check, bundle into dist/
npm run preview
npm test          # unit tests (no browser, no network)
```

Optional data tooling:

```bash
npm run data          # rebuild public/data snapshot from tarkov.dev (needs network)
npm run images        # refresh wiki task screenshot cache
npm run wiki-details  # quest / key / story detail extracts from the wiki
npm run quest-prereqs # rescrape quest prerequisites
npm run kord-docs     # battle-pass document spawns
npm run task-facts    # level / Kappa fallback from known-good data
npm run check-quests  # cross-check quest data against the wiki
npm run setup-ocr     # stage OCR runtime into public/ocr (also done by dev/build)
npm run og            # redraw the social preview card
npm run typecheck     # TypeScript only (no bundle)
npm run smoke         # open every map in a browser and check for errors
npm run audit-graph   # structural audit of the built quest graph
```

`dist/` is a static site with hash routing — it drops on any static host, including a subpath, with no rewrite rules.

## Data

Maps, quests, keys, items, and hideout requirements rebuild from [tarkov.dev](https://tarkov.dev) **on request, daily** via `GET /api/data/…` (CDN-cached ~24h, stale-while-revalidate). If the live endpoint can’t answer — tarkov.dev down, thin feed, or a static host with no functions — the site falls back to the snapshot in `public/data` and says so in the footer and on Settings.

Wiki extracts (CC BY-SA) fill gaps tarkov.dev doesn’t carry well: quest detail sheets, key lock text, story chapter guides, and prerequisite edges. Those land via `npm run wiki-details` / `quest-prereqs` / `images` / `kord-docs` and ship as committed caches so a deploy does not depend on the wiki being up. The feed wins wherever it has an opinion; wiki edges fill silence.

Kord Breach season tasks and story endings are vendored from the wiki (`src/data/kord-season.json`, `src/data/story-endings.json`) because they aren’t in the tarkov.dev feed.

### Notes for contributors

- Prefer the live `/api/data` path in `npm run dev` / `preview`; the committed snapshot is the fallback.
- `npm run data` refuses to publish a visibly worse build than the last one (sparse Kappa / missing quest markers get guarded).
- Task screenshots are hotlinked from the wiki CDN; keep `referrerPolicy="no-referrer"` on those images or the CDN 404s them.
- Marker CSS and Leaflet positioning are fragile — don’t “fix” pin drift with casual `position` changes on `.tk-marker`.
- After a wipe or big patch: `npm run data`, commit `public/data`, then `npm run audit-graph` / `npm test`.

## Deploy

The repo is set up for Vercel (`vercel.json`: `npm run data && npm run build`). Each deploy refreshes the fallback snapshot; the runtime endpoint re-pulls tarkov.dev. Non-`main` branches get preview URLs; production stays on `main`.

**`main` is sacred** — do not merge there without Luke’s explicit yes. Product work lands on `claude/repo-review-preview-us4rgf` (or an agreed feature branch) first.

Open wipe-ready work targeting that Claude branch (not merged yet): **#14** one-screen setup, **#16** dashboard empty state, **#17** calm map defaults, **#18** hideout modal in viewport. Quest-graph imprint wording: **#15**.

## Credits

Map artwork and game data from [tarkov.dev](https://tarkov.dev) and the [the-hideout SVG map project](https://github.com/the-hideout/tarkov-dev-svg-maps). Task screenshots from the [Escape from Tarkov Wiki](https://escapefromtarkov.fandom.com) (CC BY-SA).

Escape from Tarkov is a trademark of Battlestate Games. This is an unofficial fan project with no affiliation.
