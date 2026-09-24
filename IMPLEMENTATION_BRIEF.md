# Implementation brief — Tarkov Map Project

**For:** Luke Nardi + Claude Code (or any implementer)  
**Date:** 2026-09-25 (AEST)  
**Repo:** `Nardi05/Tarkov-Map-Project`  
**Primary preview branch:** `claude/repo-review-preview-us4rgf` @ `fdc2f37`  
**Punch-list PR:** https://github.com/Nardi05/Tarkov-Map-Project/pull/12  
**Live preview (SSO may apply):** deploy from that Claude tip; share/bypass if Deployment Protection is on  

This document is the single source of truth for *what to build and why*. `PUNCHLIST.md` is the checklist form of the same work. Prefer this brief when starting a session; tick boxes in `PUNCHLIST.md` as you finish.

---

## 1. Product north star (Luke’s words, locked in)

Build the **ultimate Tarkov companion**: a **nice, neat, understandable front** for information that already exists online.

| Want | Meaning |
|------|---------|
| **Forge / TTracker completeness** | One place for the wipe: maps, trader tasks, story, season, hideout, stash / “what to keep” |
| **Without their pain** | Those tools feel confusing, ugly, cluttered, too much happening at once |
| **eft-kappa look** | Clean, modern, sparse, readable (eft-kappa before it shut down) — visual north star |
| **MapGenie maps** | Map quality and usefulness should feel like MapGenie (depth, layers, readability) |
| **Tarkov Market systems, not UI** | Market-grade logic (value, flea, keep/sell **and** quest Tree/by-chains graph model) without Market’s chrome |
| **Compose, don’t reinvent** | Front for wiki + forums + Market + tarkov.dev + Tracker-style progress — not a new encyclopedia |

### One-line thesis

> Same surface area as TarkovForge / TTracker; half the friction; eft-kappa clarity; MapGenie-grade maps; Market-grade systems behind a calm UI; data composed from existing sources.

### Progressive disclosure (how all-in-one stays usable)

- **Do not cut pillars** (maps / tasks / story / season / hideout / stash stay in the product).
- **Do not unfold every pillar on first paint.** Defaults and empty states show the *next useful action* only. Depth is one click away.
- Between raids (≈30–90s): **Continue last map + next ~3 objectives**. Everything else waits.

### Quest graph imprint (locked)

**Reference:** [Tarkov Market — interactive quests](https://tarkov-market.com/progression/quests-interactive) → **Tree** → **By chains**.

Task tracking in *our* product is a **dependency graph / chain graph**, not a flat trader checklist.

| Rule | Meaning |
|------|---------|
| **Primary axis = by chains** | Prerequisite → successor stacks that can **cross traders**. Trader is a filter/label, not the only axis. |
| **Nodes carry gates** | PMC level, trader loyalty/rep, karma, prior quests. |
| **Edges unlock next** | Completing a node unlocks successor mission(s). Branches and mutually exclusive choices are first-class. |
| **Progress overlays the graph** | Completed / active (**frontier**) / available / locked — know where you are and what unlocks next. |
| **P0.6 = data half of this imprint** | Synced actives = frontier; auto-fill prerequisite closure as completed; keep actives active. See §P0.6 below. |
| **Steal graph logic, not chrome** | Progressive disclosure: between-raid = **next ~3 on your chain**; full Tree is a power view later (calm UI, not Market’s dense overview). |

Related: open **PR #14** already implements **P0.1** one-screen setup with prereq inference on tick/save (graph thinking on the setup path). Still need **P0.6** wired into sync / OCR / import paths that do not go through setup.

---

## 2. Inspiration map (steal the right thing from each)

| Source | Steal | Do not steal |
|--------|-------|----------------|
| **TarkovForge / TTracker** | Coverage: quests, hideout, maps, stash, wipe loop | Kitchen-sink home, long setup, visual noise |
| **eft-kappa** (defunct) | Typography, spacing, calm hierarchy, “one job per view” | Narrow kappa-only scope (we’re broader) |
| **MapGenie Tarkov** | Map interaction quality, filters, marker craft | Paywalled core maps, oversized noisy defaults |
| **Tarkov Market** | Pricing / flea / value *systems* **and** quest **Tree → By chains** *graph model* (dependency/chain graph, cross-trader) | Dense Market UI chrome / overview density |
| **tarkov.dev** | Live wipe data + API as backbone | Treating the site as a personal progress diary |
| **Official wiki / forums** | Authoritative text, locations, community nuance | Pasting walls of wiki prose into the app; use structured extracts + “Open on wiki” |

---

## 3. Current project state (as of 2026-09-25)

### Branches (after tidy)

| Branch | Role |
|--------|------|
| `main` | Production tip — **do not merge here without Luke’s explicit yes** |
| `tracking-overhaul` | Prior hot product line (includes pin-drift fix from PR #11) |
| `claude/repo-review-preview-us4rgf` | Latest Claude-built preview (wiki quest/key/story detail) — **implement against this tip** |
| `fused-kappa-tracker` | Kept backup |
| `docs/wipe-player-punchlist` | This brief + `PUNCHLIST.md` (PR #12 → Claude branch) |

### Stack (keep it)

TypeScript, React, Vite, Leaflet (or map stack already in branch), Zustand (or current store), Vercel.  
**Do not rewrite the framework.** Friction is UX + payloads + defaults, not language choice.

### What already works well (do not regress)

1. Map **Quick Views** (Learning / Questing / Scav / Threats / Battle pass) — purpose presets  
2. Clean **vector maps** + landmark labels  
3. **Boss cards** with hard numbers (chance / zone / guards)  
4. **Free, no account, browser-local** progress + export/restore  
5. **Separate PvP / Season / PvE** characters  
6. **Story ending tracker concept** (Savior / evidence / Terminal) — keep concept, collapse presentation  
7. **Stash FIR +/− counts** — “what do I keep” hook  
8. **Screenshot OCR** for trader sync — right problem; shrink the wizard around it  
9. Domain care: progression/plan logic, pin-drift lessons, local persist migrations  

### What’s wrong (honest)

**First-hour / between-raid UX**

- Quest setup is a **13–14 step trader wizard** — wipe players will bounce  
- **Dashboard** empty state is a multi-thousand-pixel scroll of “Not set up yet” + Edit layout  
- **Landing** reads like a brochure; returning users should skip to last map / dashboard  
- **Map defaults** land too close to “Everything” (spawn dots, skulls) — MapGenie-noise failure mode  
- **Story** dumps 100+ steps (e.g. Savior 0/112) instead of “next 3 + evidence”  
- **Stash** can show hundreds of rows / duplicates instead of still-needed  
- **Season** page scolds when you’re on PvP character instead of switching in context  
- **Duplicate chrome**: character/mode controls in Settings + map settings + header + landing  
- Essay-length copy on toggles and panels — eft-kappa would use labels + tooltips  
- **Hideout modal** clipped / mostly off-screen at normal viewports — ship blocker  
- **API/data**: silent fallbacks after 404s look “live” when stale — trust killer  
- High-zoom map **label overlap**; FAB can eat edge clicks; faction “USEC or BEAR” placeholder  

**Architecture smells (from code pass)**

- Overlapping trackers + dual setup wizards + dashboard sprawl (very large pages/components)  
- Parallel settings/shells (page vs panel)  
- Eager app graph (little route code-splitting) + large client JSON  
- Aggressive map prefetch  
- Marker CSS is fragile (Leaflet `position` regressions — protect `.tk-marker` / equivalent)  

**Vercel**

- Ignored Build Step previously canceled Claude-branch deploys; may have been cleared for a forced preview  
- SSO / Deployment Protection can block anonymous preview — use share link or team login when testing  

---

## 4. Competitor reality (why players alt-tab)

Players usually run a **stack**: Tracker (progress) + map (glance) + wiki (text) + Market (money). All-in-ones win only if the **between-raid loop is faster** than bouncing tabs.

| Tool | Job | Lesson |
|------|-----|--------|
| TarkovTracker | Progress clipboard, Kappa, items to keep | Speed + filters; users hate load failures and missing PvP/PvE split |
| MapGenie | Map markers | Quality maps; hate noise, paywalls, lag after patches |
| tarkov.dev | Data hub + API | Prefer as **backend truth**, not the only UI |
| Wiki | Canonical text | Link out; don’t become Fandom-with-React |
| Forge / TTracker | Kitchen sink | Proof of demand for one app; proof that clutter kills love |

---

## 5. Implementation principles (for every PR)

1. **Compose sources** — tarkov.dev / wiki extracts / local progress; show **source + freshness** on panels.  
2. **One job above the fold** — next actions, not configuration guilt.  
3. **Calm maps by default** — Questing or Learning Quick View; PMC spawns off until asked.  
4. **Setup ≤ ~2 minutes** — or one-click fresh wipe; OCR optional, not a gauntlet.  
5. **eft-kappa visual discipline** — fewer borders, less purple prose, more hierarchy.  
6. **No stack rewrite** — split routes, diet JSON, fix modals, collapse wizards.  
7. **`main` is sacred** — land on `claude/repo-review-preview-us4rgf` (or agreed feature branch); merge to `main` only with Luke’s explicit yes.  
8. **Tests for progression / persist** — don’t break wipe save migrations.

---

## 6. Build plan (prioritized)

Work in order. Each item should be its own PR or a tight PR group with screenshots.

### P0 — wipe-ready blockers (do these first)

| ID | Player complaint | Implement |
|----|------------------|-----------|
| P0.1 | “I don’t have time for Step 2 of 13.” | Collapse trader setup to **one screen**: search + tick active + optional OCR. One-click **fresh wipe / L1**. No forced 13-step sequence. |
| P0.2 | “Why a 5700px Dashboard of Not set up yet?” | Empty dashboard = **one CTA** (mark quests *or* open Customs) + **Continue last map**. Hide **Edit layout** until ≥1 tracker has data. Cap / collapse empty panels. |
| P0.3 | “Map is already blue dots and skulls.” | Default Quick View = **Questing** (or Learning on first map visit). **PMC spawns off**. Never land on Everything. Persist last Quick View per map. |
| P0.4 | “Hideout modal is off-screen.” | Modal fully in viewport: `max-height` + internal scroll (or centered drawer). Verify 1280×720 and 1920×1080. |
| P0.5 | “Is this live data or a ghost?” | On API/wiki failure: **visible stale/error banner** with last-success time. Never look fully healthy on silent fallback. |
| P0.6 | “Collector is active but 200 early quests still open.” | After **task sync / OCR / bulk active import**, auto-run the same fill as Settings recalc: for each active/pinned task, `fillCompleted(prerequisiteClosure(...))`. Keep actives **active**. Never clobber failed/ignored. Show “Marked N earlier tasks done…”. |


#### P0.6 detail — infer completed chain on sync (Luke, 2026-09-25)

**This is the data imprint of Quest graph (locked):** synced actives = frontier; prerequisite closure → completed; actives stay active. Full Tree UI stays Later.

Late wipe, Kappa done, target = all doable. Player task-syncs currently **active** quests. The site must treat that frontier as truth:

- Active quests stay **active**
- Every prerequisite leading up to those actives becomes **completed** (player clearly finished them already)
- Other synced actives stay active and get the same treatment

**Example:** Collector active → mark the prerequisite closure behind Collector completed (Kappa path) → keep Collector + any other actives as active.

**Already exists (wire it; don’t reinvent):**
- `prerequisiteClosure` — `src/lib/progression.ts`
- `fillCompleted` / `completeWithPrereqs` — `src/store.ts`
- Settings **Recalc** in `src/components/SettingsPage.tsx` already does this **only on button click**

**Bug:** Sync / OCR / import marks actives but does **not** call that fill automatically.

**Acceptance:** Sync with Collector (+ other actives) → Collector still active, prereq/Kappa chain completed, no manual Settings recalc required. Unit test: Debut→Checking→Collector; sync Collector active → Debut+Checking completed, Collector active.


**P0 acceptance**

- [ ] Fresh wipe player marks active quests in **under ~2 minutes** (or skips) and opens a map with **quest-relevant markers only**.  
- [ ] Dashboard above the fold answers: **what map / what ~3 things next**.  
- [ ] Hideout dialog usable at 1080p without moving the window.  
- [ ] Killing the task feed shows an explicit error/stale state.
- [ ] Late-wipe sync fills prereq chain behind actives (Collector example) without Settings recalc.

### P1 — first-hour trust

| ID | Implement |
|----|-----------|
| P1.1 | **Single character switcher** (PvP / Season / PvE). Remove duplicates from Settings / map settings / landing. One change updates all surfaces. |
| P1.2 | **Returning users** skip brochure landing → last map or Dashboard. |
| P1.3 | **Story**: show next ~3 steps + evidence bars; collapse the 100+ path behind “Show full path.” |
| P1.4 | **Stash**: dedupe rows; default filter **still needed**; compact density. |
| P1.5 | **Season** vs active character: auto-switch or allow in-context tick; **one** warning max (no scolding page). |
| P1.6 | Replace essay toggle copy with **labels + tooltips**. |
| P1.7 | Dashboard hierarchy: **Continue map + Do next (3)** first; everything else secondary. |

### P2 — polish

| ID | Implement |
|----|-----------|
| P2.1 | Faction shows real USEC/BEAR or hide the control. |
| P2.2 | FAB doesn’t eat right-edge clicks / overlap lists. |
| P2.3 | One floor-level control (remove duplicate). |
| P2.4 | Route-level code splitting + reduce eager JSON / idle map prefetch. |
| P2.5 | Protect marker CSS from Leaflet `position` regressions (pin drift). |

### Later (after P0–P1 feel good) — “ultimate front” depth

Do **not** start these before P0 is green unless Luke says otherwise.

- Market-grade **systems**: “what to keep / sell” using flea/value data, calm UI  
- **Quest Tree UI** (Market Tree / By chains mental model): power view of the full chain graph with calm progressive disclosure — between-raid stays next ~3; do **not** ship Market’s dense overview chrome  
- Deeper **wiki composition**: structured objectives/keys already started on Claude tip — extend carefully, link out for prose  
- tarkov.dev as primary live feed with wiki fallback (already directionally there)  
- Optional overlays / export for power users  
- Visual pass explicitly toward **eft-kappa** spacing/type once density is fixed  

---

## 7. Non-goals

- No React → Vue/Svelte/etc. rewrite  
- No merge to `main` without Luke’s explicit yes in chat  
- No account system / cloud sync in this phase (local-first stays a feature)  
- No MapGenie PRO paywall imitation  
- No pasting full wiki articles into panels  
- No “redesign everything” cosmetic pass before P0 behavior fixes  
- No deleting story / season / hideout / stash pillars to “simplify”

---

## 8. Suggested Claude Code session protocol

1. Read this file + `PUNCHLIST.md`.  
2. Check out `claude/repo-review-preview-us4rgf`, branch e.g. `fix/p0-setup-and-defaults`.  
3. Pick **one P0 ID** per PR when possible.  
4. Implement + add/adjust tests if touching progression/persist.  
5. Manual test against the Test plan below; attach screenshots for UI PRs.  
6. Open PR **into** `claude/repo-review-preview-us4rgf` (not `main`).  
7. Tick the matching boxes in `PUNCHLIST.md` in the same PR or a tiny docs follow-up.

---

## 9. Test plan (minimum)

- [ ] Cold load → landing; second visit → skip brochure  
- [ ] Fresh wipe skip + OCR path on one trader  
- [ ] Customs: default layers vs Questing Quick View; spawns off  
- [ ] Hideout open/close at 1280×720 and 1920×1080  
- [ ] DevTools offline / block task API → banner appears  
- [ ] Switch PvP ↔ Season ↔ PvE once; maps/tasks/season/hideout/dashboard agree  
- [ ] Stash: no duplicate rows for the same need; still-needed default  
- [ ] Story: collapsed path shows ≤ ~3 next steps until expanded  
- [ ] Regression: map pins do not drift after CSS changes  

---

## 10. Voice / UI copy guidelines

- Sound like a wipe companion, not a landing-page agency.  
- Prefer short labels; put teaching in tooltips or a dismissible “Reading the map” overlay (once).  
- Empty states: **one** action, not four “Set up” guilt rows.  
- Errors: plain language (“Task data from tarkov.dev failed — showing last good snapshot from …”).  

---

## 11. Out-of-scope decisions for Luke (ask before doing)

- Merging preview → `tracking-overhaul` or `main`  
- Enabling/disabling Vercel Deployment Protection for public playtests  
- Adding accounts / sync  
- Paying for MapGenie-like assets or reshaping map art pipeline  

---

## 12. Reference links

- Punch-list PR: https://github.com/Nardi05/Tarkov-Map-Project/pull/12  
- Quest graph imprint: https://tarkov-market.com/progression/quests-interactive (Tree → By chains)  
- Related open PR (P0.1 setup + prereq on tick/save): https://github.com/Nardi05/Tarkov-Map-Project/pull/14  
- Preview branch: `claude/repo-review-preview-us4rgf`  
- Prior pin fix on tracking line: PR #11 (historical; preview branch may differ)  

---

*End of brief. If this conflicts with a later message from Luke in chat, Luke wins — update this file in the same PR series.*
