# Punch list — product pass 2 (wipe-player UX)

**Branch base:** `claude/repo-review-preview-us4rgf` @ `fdc2f37`  
**Repo:** Nardi05/Tarkov-Map-Project  
**Date:** 2026-09-25 (AEST)  
**Scope:** Product / UX punch list only. No rewrite. Do not merge to `main`.

---

## Product north star (Luke)

**Be the one-stop Tarkov companion** — same job as TarkovForge / TTracker (maps + quests + story + season + hideout + stash in one place), but **more modern, clearer, and easier** than those tools.

That means:
- **Do not cut pillars** to become a single-purpose map or tracker app.
- **Do** win on first-hour UX: faster setup than Tracker, calmer maps than MapGenie, less chrome than Forge/TTracker kitchen-sink homes.
- Pattern: **progressive disclosure** — full suite available, defaults and empty states show only the next useful action. Depth is one click away, not the landing surface.

Competitors prove players will live in an all-in-one if it is fast between raids. They bounce when setup is long, markers are noisy, or every screen screams “configure me.”

---
## Competitor snapshot (what wipe players actually praise / hate)

| Tool | Praise | Complaints (2025–26) |
|------|--------|----------------------|
| **TarkovTracker** (.io / .org) | Map-filtered quest list, Kappa path, “what to keep” items, 2nd-monitor companion, fast wipe reset when it works | Data load failures, desync / manual refresh after TarkovMonitor, rewrite lost features, want PvE+PvP profiles, hide edition-locked quests |
| **MapGenie** | Filters, learning maps, extracts/keys when they work | **Noisy oversized markers**, extract labels cover the map, zoom reload/black screens, outdated after patches, paid maps, no saved filter presets |
| **tarkov.dev** | Fast lookup + API truth | Not a personal progress tool; players still open wiki for “where exactly” |
| **Wiki** | Authoritative text / locations | Terrible as a live raid companion |

**Implication for this app:** Own the **all-in-one** slot (Forge/TTracker), but beat them on **speed-to-useful, calm defaults, and modern clarity**. Lose if setup costs more than Tracker, or defaults look like MapGenie-on-steroids.

---

## A. What people would LIKE / keep (max 8)

1. **Quick Views on maps** (“Learning / Questing / Scav / Threats / Battle pass”) — one-tap purpose switch. Tracker doesn’t have this; MapGenie users beg for saved presets.
2. **Clean vector Customs (and siblings) with real landmark names** — Depot, New Gas, Dorms readable at a glance. Keep the vector style as default.
3. **Boss cards with hard numbers** (chance on map / zone, guards) — Reshala 60% / 33% / 4 guards is the kind of second-monitor info people alt-tab for.
4. **Free, no account, browser-local progress** — wipe players hate signup walls; say this louder than “brochure” marketing.
5. **PvP / Season / PvE as separate characters** — matches how people actually play 1.0+; Tracker users explicitly ask for this.
6. **Story ending tracker (Savior / Best ending, evidence + Terminal)** — unique vs Tracker/MapGenie/dev; keep the *concept*, not the 112-row dump.
7. **Stash counts on quest items (+/−, FIR)** — “what do I keep” is why Tracker exists; this is the retention hook if the list isn’t 438 noisy rows.
8. **OCR “read it from a screenshot” on trader setup** — correct problem (syncing trader lists). Keep the feature; kill the 13-step wizard around it.

---

## B. What people would want CHANGED or removed (brutal, P0–P2, max 15)

### P0 — wipe-night blockers

1. **“I don’t have time for Step 2 of 13 just to mark Prapor.”**  
   *Fix intent:* Collapse trader setup to **one screen** (search + tick active + optional screenshot OCR). Skip/“I’m fresh wipe L1” one-click. Never force 13 sequential traders.

2. **“Why am I staring at a 5700px Dashboard of ‘Not set up yet’ before I’ve done a single raid?”**  
   *Fix intent:* Empty state = **one CTA** (“Mark active quests” or “Just open Customs”) + last-map Continue. Hide Edit layout until ≥1 tracker has data. Cap fold height.

3. **“Why is the map already covered in blue spawn dots and skulls before I asked?”**  
   *Fix intent:* Default Quick View = **Questing** (or Learning for first visit) with **PMC spawns OFF**, bosses optional. Never land on “Everything.” Persist last Quick View per map.

4. **“The hideout modal is clipped off the bottom of my screen — I can’t finish upgrading.”**  
   *Fix intent:* Dialogs/drawers must be fully on-viewport (max-height + scroll, or center modal). Treat as a ship-blocker bug.

5. **“API 404s with silent fallbacks — am I looking at real wipe data or last week’s ghost?”**  
   *Fix intent:* Visible stale/error banner (“Tasks feed failed — showing cached YYYY-MM-DD”). No silent 200-looking UI on failed upstream.

### P1 — trust & friction after first hour

6. **“Why do Settings, map Settings, header toggles, and the landing all fight over the same character?”**  
   *Fix intent:* **One** character switcher (header). Settings edits level/faction/edition/loyalty only. Map sidebar keeps layers/style only — no second PvP/Season/PvE block.

7. **“Landing is a brochure. I queued already — open the map.”**  
   *Fix intent:* Returning visitors → Dashboard or last map. First visit → “Just browse maps” equal weight to setup; shrink hero copy.

8. **“Savior is 0/112 — I don’t read novels between raids.”**  
   *Fix intent:* Story UI shows **next 3 actionable steps** + evidence progress; rest collapsed. “Set as target” should drive map markers and Dashboard, not a scroll marathon.

9. **“Stash says 438 rows and duplicates the same moonshine twice.”**  
   *Fix intent:* Dedupe by item+quest; default view = **still needed** (FIR filter on); compact rows; stash audit as primary path.

10. **“I’m on the Season page but the app scolds me that I’m on PvP Zone.”**  
    *Fix intent:* Opening Season auto-switches character **or** ticks work in-context without dual banners. One warning max, with an immediate Switch action that sticks.

11. **“Every toggle has a paragraph. I’m in a raid queue.”**  
    *Fix intent:* One-line labels; move essays to tooltips/`?`. Sidebar height for toggles, not copy.

12. **“Continue Customs is the only useful button on the Dashboard — bury everything else.”**  
    *Fix intent:* Promote **Continue {last map}** + **Do next (3)** as the dashboard. Raid clocks / Edit layout / Target Task search become secondary or progressive.

### P2 — polish / debt that still bleeds trust

13. **“USEC or BEAR is still a placeholder on my character card.”**  
    *Fix intent:* Bind faction from Settings or hide until set.

14. **“Floating list FAB eats clicks on the right edge of every page.”**  
    *Fix intent:* Reposition or hide until there’s something to show; never overlap primary lists.

15. **“Floor level lives in the top bar *and* map Settings.”**  
    *Fix intent:* One control. Same for character mode duplication noted in P1.

---

## Draft PR body (copy for parent to open)

### Title

```
docs: wipe-player punch list from product pass 2 (preview branch)
```

### Body

```markdown
## Summary

Second brutally honest product pass against live preview on `claude/repo-review-preview-us4rgf` @ `fdc2f37`, with screenshots under `/workspace/tarkov-review-*.png` and a quick competitor read (TarkovTracker, MapGenie, tarkov.dev / wiki habits).

This PR **only adds** `PUNCHLIST.md` (player-facing keep/change lists + prioritized fix intents). It does **not** implement UI changes, rewrite the stack, or merge to `main`.

Stack stays **TS / React / Vite / Leaflet / Zustand**. Competitors win on speed-to-useful and calm maps; we win if maps + progress share one second-monitor surface without Tracker-length setup or MapGenie-level marker noise.

## Player keep (do not regress)

- [ ] Map Quick Views (purpose presets)
- [ ] Clean vector maps + landmark labels
- [ ] Boss spawn cards with chance / guards
- [ ] Free, no-account, local progress
- [ ] Separate PvP / Season / PvE characters
- [ ] Story ending tracker concept (Savior etc.)
- [ ] Stash FIR counts on quest items
- [ ] Screenshot OCR path for trader sync

## P0 — must fix before calling preview “wipe ready”

- [ ] Collapse quest setup from 13 trader steps → one tick/OCR screen + fresh-wipe skip
- [ ] Dashboard empty state: one CTA + Continue last map; no multi-thousand-px “Not set up” scroll; hide Edit layout until data exists
- [ ] Map defaults: not “Everything”; PMC spawns off by default; persist last Quick View
- [ ] Hideout (and any) modal fully on-screen with internal scroll
- [x] Surface API/data failures (no silent fallback that looks live)
- [ ] **Task sync infers completed prereqs:** after sync/OCR of actives (e.g. Collector), auto-fill prerequisite closure as completed; keep actives active (same as Settings recalc, automatic)

## P1 — first-hour trust

- [ ] Single character switcher; strip duplicates from Settings / map Settings / landing
- [ ] Returning users skip brochure landing → last map or Dashboard
- [ ] Story: next-3 steps + evidence bars; collapse the 100+ path
- [ ] Stash: dedupe, default to still-needed, compact
- [ ] Season page vs active character: auto-switch or in-context tick, one warning max
- [ ] Cut sidebar/dashboard essay copy → tooltips
- [ ] Dashboard hierarchy: Continue map + Do next (3) first

## P2 — polish

- [ ] Faction shows real USEC/BEAR or hidden
- [ ] FAB doesn’t eat edge clicks / overlap lists
- [ ] One floor-level control (remove duplicate)

## Non-goals

- No framework/stack rewrite
- No merge to `main` from this workstream without an explicit follow-up
- No MapGenie PRO paywall chase or pasting full wiki prose into the UI — depth stays structured, not encyclopedia pages
- No new account system / cloud sync in this punch list
- No visual redesign for its own sake — only density, defaults, setup cost, and broken chrome

## Acceptance notes

- A fresh wipe player can mark **active trader quests in under ~2 minutes** (or skip) and open a map with **quest-relevant markers only**.
- Dashboard above the fold answers: **what map / what 3 things next** — not “set up four trackers.”
- Hideout dialog usable at 1080p without dragging the window.
- Failed tarkov.dev (or wiki) fetches show an explicit stale/error state.
- Character mode changed in **one** place updates maps, tasks, season, hideout, and dashboard together.

## Test plan

- [ ] Cold load → landing vs returning-user path
- [ ] Fresh wipe skip + screenshot OCR on one trader
- [ ] Customs default layers vs Questing Quick View
- [ ] Hideout open/close at 1280×720 and 1920×1080
- [ ] Kill network to task feed → banner appears
- [ ] Switch PvP ↔ Season ↔ PvE once; confirm no dual-banner trap on Season page
- [ ] Stash: no duplicate item rows for same quest need

## Base

`claude/repo-review-preview-us4rgf` (`fdc2f37`)
```

