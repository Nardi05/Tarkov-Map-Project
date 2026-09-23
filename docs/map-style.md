# Map style spec

The contract every map on this site renders under. One shell, one marker set,
one interaction model — a map supplies art and marker JSON and nothing else.

If you are adding or changing a map and find yourself writing a colour, a
marker size, or a hover rule, stop: it belongs here, not in the map.

---

## 1. Where the art comes from

Base geometry is **not ours**. Every map loads from `assets.tarkov.dev`:

| Source | What | Licence |
| --- | --- | --- |
| [`the-hideout/tarkov-dev-svg-maps`](https://github.com/the-hideout/tarkov-dev-svg-maps) | Layered vector SVGs — `svg/<Map>.svg` | **CC BY-NC-SA 4.0** |
| tarkov.dev tile pyramids | Photographic satellite tiles | tarkov.dev |

> **Licence warning.** The SVG art is CC BY-NC-SA 4.0. This repository is
> GPL-3.0. Those are incompatible — CC BY-NC-SA cannot be relicensed under the
> GPL, and its NonCommercial clause contradicts the GPL's guarantee of
> commercial use. **Do not vendor the SVGs into this repo** without either
> (a) placing them in their own directory with their own `LICENSE` and
> attribution, kept out of the GPL tree, or (b) replacing them with art under a
> compatible licence. Hotlinking, which is what we do today, distributes
> nothing and keeps the two apart.

Coverage is uneven, and that is a content problem no amount of styling fixes:

| Map | Vector SVG | Satellite tiles |
| --- | --- | --- |
| customs, factory, ground-zero, interchange, reserve, shoreline, woods | yes | yes |
| lighthouse, streets-of-tarkov, terminal | yes | **no** |
| icebreaker, the-lab, the-labyrinth | **no** | yes |

Three maps can never show the clean vector style, and three can never show
satellite. `availableStyles()` in `lib/base-layer.ts` is what stops the UI
offering a style a map does not have.

---

## 2. Tokens

Declared in `src/styles.css` on `:root`, overridden under
`[data-theme="light"]`. Nothing in the map layer may hard-code a colour.

| Token | Purpose |
| --- | --- |
| `--map-base-dim` | Opacity of the ground plan while another floor sits on it. `0.3` dark, `0.45` light — pale art dimmed as hard as dark art simply disappears. |
| `--marker-stroke` | Stroke width on every marker glyph. |
| `--marker-hover-scale` | Hover growth, identical on every layer. |
| `--place-label` / `--place-halo` | Fill and halo for place names, used both by the artwork's own `<text>` and by our `.tk-place-label` overlays. |
| `--bg-deep` | The void behind the artwork. |

Layer hues live in `lib/layers.ts`, not here, and are **deliberately
theme-independent**: colour carries meaning, and a PMC extract has to stay the
same blue in both themes.

---

## 3. The two channels

The single rule that makes every map readable, and the one thing never to
break:

- **Colour says _who_ it belongs to** — PMC, Scav, shared, boss, quest, hazard.
- **Shape says _what_ it is** — spawn, exit, transit, key door, objective.

So a blue square is a PMC extract on Customs, on Labs, and on Streets. A player
learns it once.

### Marker shapes

Defined once as `GLYPHS` in `lib/marker-icons.ts`, sized once by `BASE_SIZE`,
rendered once by `markerSvg()`. There is no per-map override and there must not
be one.

`dot` · `skull` · `crosshair` · `exit` · `transit` · `key` · `quest` ·
`beacon` · `stash` · `target` · `runner` · `switch` · `document` · `hazard`

### Layers

`lib/layers.ts` owns the taxonomy — id, group, label, one-sentence plain-English
hint, colour, shape, and whether it is on by default. The layer panel, the
legend and the map all read that one list, so they cannot drift apart.

Groups: `spawns` · `exits` · `tasks` · `world`.

Defaults are deliberately sparse. A freshly opened map is not a wall of dots.

---

## 4. Floors

Two implementations behind one `Floor` type (`lib/base-layer.ts`):

- **Vector** — floors are top-level `<g>` groups in the SVG, selected by id.
- **Satellite** — floors are separate tile pyramids.

Both are georeferenced by the same transform, so **markers do not move when you
switch style**. That is the property that lets a quest pin land on the art.

`setFloor` marks each visible group with the part it plays:

| `data-role` | Meaning | Opacity |
| --- | --- | --- |
| `active` | The floor you asked for | `1` |
| `base` | The ground plan showing through beneath it | `--map-base-dim` |
| *(absent, `display: none`)* | A floor you are not looking at | — |

The ground plan is only `base` while a *different* floor is on top of it; on
the ground floor and on "All levels" it is what you came to look at, and renders
at full strength.

Every multi-floor map also offers an explicit **All levels** escape hatch, so
nothing can hide from somebody who has not yet noticed the floor control.

Marker filtering is by elevation `extents`, applied at render time after the
floor filter — never at build time. Two points on different levels of
Interchange are not one place however close they look from above.

### Off-floor pips

A floor filter is the one place the map throws information away, so it has to
say so. Anything the active floor hides gets a faint dashed ring over where it
actually is, in its layer's colour, with an arrow for which way to go; clicking
it switches to that floor and opens the thing. `offFloorPoints()` in
`lib/map-index.ts`.

Three rules it must keep:

- **Direction comes from elevation, not from the order of the floor menu.**
  Every map lists its basement last, so reading the list sent players upstairs
  to reach Factory's tunnels.
- **One pip per name per floor.** A quest item with eleven spawns downstairs is
  one pip that says "11 here", and a door both factions can use is one pip, not
  two on the same pixel.
- **Silence where the map does not know.** A point no floor claims gets no pip;
  a guess is worse than nothing. A ground floor with no elevation band of its
  own — Interchange — filters nothing, so it hides nothing, so it says nothing.

---

## 5. Interaction

| Gesture | Behaviour |
| --- | --- |
| Pan | Drag, or one finger |
| Zoom | Wheel, pinch, or `+`/`-`. `zoomSnap: 0.1`, `zoomDelta: 0.25`, `wheelPxPerZoomLevel: 110` — fine enough to frame a building. |
| Marker click | Opens the detail panel; on a phone, the bottom sheet |
| Marker hover | Tooltip, and the glyph grows by `--marker-hover-scale` |
| Off-floor pip click | Switches to the floor the thing is on and opens it |
| Find on this map | Names every extract, transit, key, switch, hazard, boss zone, document spawn and task objective. Arrows move, Enter goes — turning on the layer, switching to the right floor, flying there and opening the card |
| Quest step → map | `href.map(map, taskId)` focuses the map on that task and highlights its pins |
| `0` | Fit the whole map |
| `[` | Hide or show the side panel |
| `H` | Hide the interface entirely (map only) |
| `F` | Fullscreen |

`minZoom` adapts to the viewport: the configured floor assumes a desktop, and a
phone that cannot fit the map at that zoom gets a lower one rather than a map
it cannot see all of.

---

## 6. Performance rules

Non-negotiable, because a map that stutters is worse than a map that is plain.

- **Spawns are canvas `circleMarker`s**, not div icons. Some maps carry 400+ and
  that is the difference between smooth panning and a stutter. `preferCanvas:
  true`, one shared `L.canvas({ padding: 0.4 })` renderer.
- **Icons are cached** by `markerIcon()` on shape + colour + scale, so panning
  never rebuilds SVG strings.
- **Quest layers rebuild independently** of the other eleven, because ticking
  locations happens constantly during a raid.
- **Base art lives in its own Leaflet pane** below the overlay pane. Leaflet's
  own stylesheet stacks `<svg>` above `<canvas>` within a pane, which would bury
  the spawn dots under the map.
- **Only opacity animates**, and only on a floor change — never during a pan or
  a zoom. Nothing else on the map is allowed to animate.
- **One map payload per map**, loaded on demand, 25–225 KB.
- `ResizeObserver` → `invalidateSize`, so a rail collapsing or a phone rotating
  does not leave a clipped canvas.

---

## 7. Labels

Place names come from two places and must look identical:

- baked into the artwork as SVG `<text>`
- drawn by us as `.tk-place-label`

Both get `--place-label` fill over a `--place-halo` halo. On the artwork this is
done with `paint-order: stroke fill`, which is what keeps a street name legible
over both a dark roof and a pale car park — and keeps it sharp at any zoom,
because it is still vector text.

Labels that would collide at the current zoom are hidden rather than allowed to
pile up, and return on hover, so the information is never actually lost.

---

## 8. Adding a map

1. Add its georeferencing to `src/data/geo.json` — transform, bounds, rotation,
   `svgBounds`, floors, place labels.
2. Point `svgPath` and/or `tilePath` at the art.
3. That is all. Markers, colours, floors, tooltips, off-floor pips, search and
   the layer panel are inherited.

If step 3 is not true, the shell has a gap — fix the shell, not the map.

---

## 9. Known gaps

Tracked honestly rather than quietly:

- **Six maps cannot offer both styles** — see §1. Blocked on source art.
- **Markers read small on a 4K desktop.** `--tk-marker-scale` is capped at 1, so
  past about 1900px of map the pins stop growing with the artwork. The marker
  size setting covers it, but the default could be better.
- **Story steps have no photos.** `task-images.json` covers trader tasks only.

### Measured, not assumed

- **Mixed DPI.** Customs at 1440×900, `devicePixelRatio` 1 vs 2: the base SVG's
  box and every marker's offset from it are identical to the pixel, and the
  canvas backing store is exactly 2× its CSS size. Nothing drifts with density.
- **4K.** 3840×2160 at 2×: no clipped canvas, no horizontal page scroll, art and
  pins aligned. The artwork takes longer to parse at that size — closer to five
  seconds than two on a cold load.
- **Phone.** 390px: no horizontal overflow, and the panel is reachable as a
  sheet with the search box in it.
