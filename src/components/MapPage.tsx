import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import MapCanvas, { type FocusRequest } from "./MapCanvas";
import LayerPanel from "./LayerPanel";
import TaskPanel from "./TaskPanel";
import SettingsPanel from "./SettingsPanel";
import DetailPanel from "./DetailPanel";
import MapSwitcher from "./MapSwitcher";
import RaidClock from "./RaidClock";
import ShortcutHelp, { isTypingInto, useSlashSearch } from "./ShortcutHelp";
import { Icon, icons, Menu, MenuItem, MenuLabel } from "./ui";
import { availableStyles, floorsFor } from "../lib/base-layer";
import { LAYERS } from "../lib/layers";
import { swatchSvg } from "../lib/marker-icons";
import { filterQuests, type Selection } from "../lib/build-layers";
import { useProgression } from "../lib/data";
import { withinExtents } from "../lib/leaflet-crs";
import { documentTypesOnMap, withSeasonTasks } from "../lib/kord-season";
import { availableOnMap, computeAvailability } from "../lib/progression";
import { displayName, visibleInMode } from "../lib/task-variant";
import { useMarkerDone, useStore, useTaskStatus } from "../store";
import { href, navigate, onNavClick } from "../lib/router";
import type { MapData, MapIndexEntry, Vec3 } from "../types";

type Tab = "layers" | "tasks" | "settings";

const TABS: { id: Tab; label: string; icon: string }[] = [
  { id: "layers", label: "Layers", icon: icons.layers },
  { id: "tasks", label: "Tasks", icon: icons.tasks },
  { id: "settings", label: "Settings", icon: icons.settings },
];

/**
 * The four shapes worth naming in the first-run key. Read out of LAYERS rather
 * than restated, so the swatch on the card is drawn by the same code that
 * draws the marker on the map and the two can never drift apart.
 */
const PRIMER_KEY = (["pmc-spawns", "pmc-extracts", "quests", "keys"] as const)
  .map((id) => LAYERS.find((l) => l.id === id))
  .filter((l): l is (typeof LAYERS)[number] => Boolean(l));

export default function MapPage({
  data,
  maps,
  deepLinkTask,
}: {
  data: MapData;
  maps: MapIndexEntry[];
  deepLinkTask: string | null;
}) {
  const layers = useStore((s) => s.layers);
  const openMapLayers = useStore((s) => s.openMapLayers);

  // Before paint, so a map never flashes the previous map's layers.
  useLayoutEffect(() => openMapLayers(data.normalizedName), [data.normalizedName, openMapLayers]);
  const settings = useStore((s) => s.settings);
  const primerSeen = useStore((s) => s.ui.mapPrimerSeen);
  const setUiFlag = useStore((s) => s.setUiFlag);
  const quest = useStore((s) => s.quest);
  const setQuestFilter = useStore((s) => s.setQuestFilter);
  const setLayer = useStore((s) => s.setLayer);
  const taskStatus = useTaskStatus();
  const markerDone = useMarkerDone();
  const setSetting = useStore((s) => s.setSetting);

  const [tab, setTab] = useState<Tab>("layers");
  const [sheetOpen, setSheetOpen] = useState(false);
  const [selection, setSelection] = useState<Selection | null>(null);
  const [focus, setFocus] = useState<FocusRequest | null>(null);
  const focusToken = useRef(0);
  /*
   * The rail collapses rather than unmounts, so the tab you were on and how far
   * you had scrolled survive the round trip. Kept as local state, not in the
   * store: this is a "get out of the way for a second" gesture, not a setting
   * somebody wants remembered next time they open the site.
   */
  const [railCollapsed, setRailCollapsed] = useState(false);
  const [showHelp, setShowHelp] = useState(false);
  const [fitToken, setFitToken] = useState(0);

  /*
   * Two separate ideas that used to be one, which is why fullscreen used to
   * take the panels away with it:
   *
   *   immersive   the site's own chrome is hidden — header, side panel, tab
   *               bar — leaving nothing but map. `H`.
   *   fullscreen  the browser is showing this page and nothing else. `F`.
   *
   * They compose. Going fullscreen with the panels up is the normal case and
   * the one this page is usually asked for: a bigger map *and* the task list.
   * Wanting only map is a different request, and `H` is how you make it —
   * in a window or out of one.
   */
  const [immersive, setImmersive] = useState(false);
  const [nativeFullscreen, setNativeFullscreen] = useState(false);
  /*
   * The fallback for when the browser will not hand over the screen: an iOS
   * Safari that has no element fullscreen at all, or an iframe the embedder
   * did not mark `allow="fullscreen"`. The page pins itself over the viewport
   * instead. It is not quite fullscreen — the browser's own chrome stays — but
   * it is the thing the button promises, and it beats a control that silently
   * does nothing.
   */
  const [filled, setFilled] = useState(false);
  const shellRef = useRef<HTMLDivElement>(null);
  const isFullscreen = nativeFullscreen || filled;

  const floors = useMemo(() => floorsFor(data.geo), [data.geo]);
  const [floorId, setFloorId] = useState(floors[0]?.id ?? "ground");
  const floor = floors.find((f) => f.id === floorId) ?? floors[0];

  const styles = availableStyles(data.geo);
  // Fall back gracefully when a map only ships one of the two artwork styles.
  const style = styles.includes(settings.style) ? settings.style : (styles[0] ?? "clean");

  /*
   * The task graph, so the map can draw what you could pick up here without
   * being told. It is 285KB and loads on demand — until it arrives
   * `availability` is empty and the map falls back to your active tasks, which
   * is exactly the old behaviour rather than a blank screen.
   */
  const progression = useProgression();
  const profile = useStore((s) => s.profile);

  const mapData = useMemo(() => withSeasonTasks(data, profile.mode), [data, profile.mode]);

  const availability = useMemo(
    () => computeAvailability(progression.data, taskStatus, profile),
    [progression.data, taskStatus, profile],
  );

  const availableHere = useMemo(
    () => new Set(availableOnMap(progression.data, availability, mapData.normalizedName)),
    [progression.data, availability, mapData.normalizedName],
  );

  const allowedTasks = useMemo(() => {
    const ids = new Set<string>();
    for (const task of Object.values(mapData.tasks)) {
      if (visibleInMode(task.name, profile.mode)) ids.add(task.id);
    }
    return ids;
  }, [mapData, profile.mode]);

  const visibleQuests = useMemo(
    () => filterQuests(mapData, quest, taskStatus, availableHere, allowedTasks),
    [mapData, quest, taskStatus, availableHere, allowedTasks],
  );

  const docTypes = useMemo(
    () => documentTypesOnMap(mapData.normalizedName),
    [mapData.normalizedName],
  );

  /*
   * Reset per-map view state when the map changes. This runs before the
   * deep-link effect below, so a `?q=` link still gets its task focused.
   */
  useEffect(() => {
    setSelection(null);
    setFloorId(floors[0]?.id ?? "ground");
    // A task isolated on one map means nothing on the next one.
    setQuestFilter("focusTask", null);
  }, [data.normalizedName, floors, setQuestFilter]);

  /* A deep link (#/m/customs?q=<task>) opens that task isolated on the map. */
  useEffect(() => {
    if (deepLinkTask && mapData.tasks[deepLinkTask]) {
      setQuestFilter("focusTask", deepLinkTask);
      setTab("tasks");
    }
  }, [deepLinkTask, mapData, setQuestFilter]);

  const focusOn = useCallback(
    (position: Vec3) => {
      // Send the user to the floor the marker actually lives on, otherwise
      // we would fly to a spot with nothing visible at it.
      const target = floors.find(
        (f) => f.id !== "all" && withinExtents({ position }, f.extents),
      );
      if (target && target.id !== floorId) setFloorId(target.id);
      focusToken.current += 1;
      setFocus({ position, token: focusToken.current });
      setSheetOpen(false);
    },
    [floors, floorId],
  );

  const openTask = useCallback(
    (taskId: string) => {
      setQuestFilter("focusTask", quest.focusTask === taskId ? null : taskId);
      setTab("tasks");
    },
    [setQuestFilter, quest.focusTask],
  );

  const handleSelect = useCallback((next: Selection | null) => {
    setSelection(next);
    if (next) setSheetOpen(false);
  }, []);

  /* ---------------------------------------------------------- fullscreen */

  /*
   * The *page* goes fullscreen, not the canvas. Fullscreening the canvas alone
   * is what left the header, the side panel and the tab bar outside the
   * fullscreen element — present in the document, invisible on screen, and
   * unreachable until you came back out. Everything the map page owns is
   * inside this element, so it all comes along.
   */
  const toggleFullscreen = useCallback(() => {
    const shell = shellRef.current;
    if (!shell) return;

    if (document.fullscreenElement) {
      void document.exitFullscreen().catch(() => {});
      return;
    }
    if (filled) {
      setFilled(false);
      return;
    }

    const request = shell.requestFullscreen?.();
    if (!request) {
      setFilled(true);
      return;
    }
    // The promise is the only place a refusal shows up. Swallowing it is what
    // made the button look broken in an iframe: nothing happened, and nothing
    // said why.
    void request.catch(() => setFilled(true));
  }, [filled]);

  // Tracked by event rather than by the click, because Escape and the browser's
  // own chrome can leave fullscreen without going through the button.
  useEffect(() => {
    const sync = () => setNativeFullscreen(document.fullscreenElement === shellRef.current);
    document.addEventListener("fullscreenchange", sync);
    return () => document.removeEventListener("fullscreenchange", sync);
  }, []);

  /* Escape leaves the filled state, matching what it does to real fullscreen. */
  useEffect(() => {
    if (!filled) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") setFilled(false);
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [filled]);

  /* ----------------------------------------------------------- shortcuts */

  useSlashSearch();

  /*
   * Everything is guarded by isTypingInto, without which searching a task list
   * for "flash" would trip Fullscreen, Layers, Settings and hide-the-panel on
   * the way through.
   */
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        // One thing at a time, outermost first, so Escape never clears more
        // than the user was looking at.
        if (showHelp) setShowHelp(false);
        else if (sheetOpen) setSheetOpen(false);
        else if (selection) setSelection(null);
        else if (quest.focusTask) setQuestFilter("focusTask", null);
        else if (immersive) setImmersive(false);
        return;
      }
      if (e.metaKey || e.ctrlKey || e.altKey || isTypingInto(e.target)) return;

      const key = e.key.toLowerCase();
      const openTab = (next: Tab) => {
        e.preventDefault();
        setTab(next);
        // A shortcut has to bring the panel back with it, or pressing L while
        // the rail is hidden looks like nothing happened.
        setImmersive(false);
        setRailCollapsed(false);
        // On a phone the panel is a sheet, so a shortcut has to open it too.
        setSheetOpen(true);
      };

      if (key === "l") openTab("layers");
      else if (key === "t") openTab("tasks");
      else if (key === "s") openTab("settings");
      else if (key === "[") {
        e.preventDefault();
        setRailCollapsed((v) => !v);
      } else if (key === "h") {
        e.preventDefault();
        setImmersive((v) => !v);
        setSheetOpen(false);
      } else if (key === "f") {
        e.preventDefault();
        toggleFullscreen();
      } else if (key === "0") {
        e.preventDefault();
        setFitToken((n) => n + 1);
      } else if (key === "?" || (key === "/" && e.shiftKey)) {
        e.preventDefault();
        setShowHelp((v) => !v);
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [
    showHelp,
    sheetOpen,
    selection,
    quest.focusTask,
    immersive,
    setQuestFilter,
    toggleFullscreen,
  ]);

  const panel = (
    <>
      {tab === "layers" && <LayerPanel data={mapData} visibleQuestCount={visibleQuests.length} />}
      {tab === "tasks" && (
        <TaskPanel data={mapData} availability={availability} onFocus={focusOn} />
      )}
      {tab === "settings" && (
        <SettingsPanel data={data} floors={floors} floorId={floorId} onFloorChange={setFloorId} />
      )}
    </>
  );

  return (
    <div
      ref={shellRef}
      className="map-shell flex h-full flex-col"
      data-filled={filled || undefined}
      style={{ background: "var(--bg)" }}
    >
      {/* ------------------------------------------------------------ header */}
      {!immersive && (
        /*
         * What stays on the bar is what you touch during a raid: which map,
         * what time it is in there, which floor, and the panel toggle. The
         * once-a-session controls — fit, art style, hide the interface,
         * shortcuts, and the links to the other sections — moved into the
         * menu. Eleven controls abreast wrapped onto a second row over the
         * map at 900px, and none of them were findable anyway.
         */
        <header className="map-glass map-bar" style={{ borderColor: "var(--line)" }}>
          <a
            href={href.home()}
            onClick={onNavClick(href.home())}
            className="btn btn-ghost btn-icon flex-none"
            aria-label="All maps"
            title="All maps"
          >
            <Icon path={icons.back} size={18} />
          </a>

          <MapSwitcher maps={maps} current={data.normalizedName} onPick={(name) => navigate(href.map(name))} />

          <div className="ml-auto flex flex-none items-center gap-1.5">
            <RaidClock mapName={data.normalizedName} />

            {floors.length > 1 && (
              <label className="hidden md:block">
                <span className="sr-only">Level</span>
                <select
                  className="input"
                  style={{ width: "auto", paddingRight: "1.5rem" }}
                  value={floorId}
                  onChange={(e) => setFloorId(e.target.value)}
                >
                  {floors.map((f) => (
                    <option key={f.id} value={f.id}>
                      {f.name}
                    </option>
                  ))}
                </select>
              </label>
            )}

            <button
              type="button"
              className="btn hidden flex-none text-[0.72rem] md:inline-flex"
              aria-pressed={!railCollapsed}
              onClick={() => setRailCollapsed((v) => !v)}
              title="Hide or show the side panel ([)"
            >
              {railCollapsed ? "Show panel" : "Hide panel"}
            </button>

            <Menu label="More map options" icon={icons.stack}>
              {(close) => (
                <>
                  <MenuLabel>This map</MenuLabel>
                  <MenuItem
                    icon={icons.fit}
                    hint="Zoom out until the whole map is on screen"
                    onClick={() => {
                      setFitToken((n) => n + 1);
                      close();
                    }}
                  >
                    Fit map
                  </MenuItem>
                  {floors.length > 1 && (
                    <div className="md:hidden">
                      {floors.map((f) => (
                        <MenuItem
                          key={f.id}
                          pressed={floorId === f.id}
                          onClick={() => {
                            setFloorId(f.id);
                            close();
                          }}
                        >
                          {f.name}
                        </MenuItem>
                      ))}
                    </div>
                  )}
                  {styles.length > 1 && (
                    <>
                      <MenuLabel>Artwork</MenuLabel>
                      {styles.map((s) => (
                        <MenuItem
                          key={s}
                          pressed={style === s}
                          hint={
                            s === "clean"
                              ? "Drawn vector map, easiest to read"
                              : "Photographic tiles, matches what you see in game"
                          }
                          onClick={() => {
                            setSetting("style", s);
                            close();
                          }}
                        >
                          {s === "clean" ? "Clean" : "Satellite"}
                        </MenuItem>
                      ))}
                    </>
                  )}

                  <MenuLabel>View</MenuLabel>
                  <MenuItem
                    icon={icons.eye}
                    hint="Map only — press H to bring it back"
                    onClick={() => {
                      setImmersive(true);
                      setSheetOpen(false);
                      close();
                    }}
                  >
                    Hide the interface
                  </MenuItem>
                  <MenuItem
                    icon={icons.keyboard}
                    onClick={() => {
                      setShowHelp(true);
                      close();
                    }}
                  >
                    Keyboard shortcuts
                  </MenuItem>

                  <MenuLabel>Go to</MenuLabel>
                  <MenuItem icon={icons.compass} to={href.dashboard()} hint="What to run next">
                    Dashboard
                  </MenuItem>
                  <MenuItem icon={icons.tasks} to={href.quests()} hint="Track your quests">
                    Quests
                  </MenuItem>
                </>
              )}
            </Menu>
          </div>
        </header>
      )}

      {showHelp && <ShortcutHelp onClose={() => setShowHelp(false)} />}

      <div className="flex min-h-0 flex-1">
        {/* ---------------------------------------------------- desktop rail */}
        {!immersive && (
          <aside
            className="hidden w-[19rem] flex-none flex-col overflow-hidden border-r transition-[width] duration-200 md:flex lg:w-[22rem]"
            // Inline width only kicks in while collapsed; expanded keeps the
            // responsive Tailwind widths above.
            style={{
              borderColor: "var(--line)",
              background: "var(--panel)",
              // Border goes too, or a 1px sliver of panel stays on screen.
              ...(railCollapsed ? { width: 0, borderRightWidth: 0 } : null),
            }}
            /* `inert`, not `aria-hidden`: the rail is hidden with width:0 and
               overflow-hidden so it can animate, which leaves every control in it
               still tabbable. aria-hidden only told assistive tech to ignore them,
               so a keyboard user tabbed through dozens of invisible buttons.
               `inert` removes them from the tab order and the a11y tree, and
               unlike display:none it does not kill the width transition. */
            inert={railCollapsed}
          >
            <nav
              className="flex flex-none gap-1 border-b p-2"
              style={{ borderColor: "var(--line-soft)" }}
              aria-label="Map tools"
            >
              {TABS.map((t) => (
                <button
                  key={t.id}
                  type="button"
                  className="btn flex-1"
                  style={{ padding: "0.45rem 0.5rem" }}
                  aria-pressed={tab === t.id}
                  onClick={() => setTab(t.id)}
                >
                  <Icon path={t.icon} size={15} />
                  {t.label}
                </button>
              ))}
            </nav>
            <div className="scroll-y min-h-0 flex-1">{panel}</div>
          </aside>
        )}

        {/* ---------------------------------------------------------- canvas */}
        <main className="relative min-w-0 flex-1">
          <MapCanvas
            key={data.normalizedName}
            data={data}
            style={style}
            floor={floor}
            layers={layers}
            visibleQuests={visibleQuests}
            taskStatus={taskStatus}
            markerDone={markerDone}
            markerScale={settings.markerScale}
            showZones={settings.showZones}
            showMarkerLabels={settings.showMarkerLabels}
            showQuestLabels={settings.showQuestLabels}
            showPlaceLabels={settings.showPlaceLabels}
            dimCompleted={settings.dimCompleted}
            selection={selection}
            onSelect={handleSelect}
            focus={focus}
            fitToken={fitToken}
            isFullscreen={isFullscreen}
            onToggleFullscreen={toggleFullscreen}
          />

          {/* Rail handle. Lives in the canvas, not the rail, so it stays
              reachable once the rail itself has no width left. */}
          {!immersive && (
            <button
              type="button"
              className="btn absolute left-0 top-1/2 z-[500] hidden -translate-y-1/2 md:flex"
              style={{
                boxShadow: "var(--shadow)",
                padding: "0.9rem 0.1rem",
                borderTopLeftRadius: 0,
                borderBottomLeftRadius: 0,
              }}
              aria-expanded={!railCollapsed}
              title={railCollapsed ? "Show the panel ([)" : "Hide the panel ([)"}
              aria-label={railCollapsed ? "Show the panel" : "Hide the panel"}
              onClick={() => setRailCollapsed((v) => !v)}
            >
              <span style={{ transform: `rotate(${railCollapsed ? -90 : 90}deg)`, display: "block" }}>
                <Icon path={icons.chevron} size={15} />
              </span>
            </button>
          )}

          {/* The one control that survives hiding the interface. Without it,
              `H` on a device with no keyboard is a one-way door. */}
          {immersive && (
            <button
              type="button"
              className="btn animate-in absolute left-3 top-3 z-[600] text-[0.72rem]"
              style={{ boxShadow: "var(--shadow)", padding: "0.34rem 0.6rem" }}
              onClick={() => setImmersive(false)}
            >
              <Icon path={icons.eye} size={14} />
              Show the interface
            </button>
          )}

          {quest.focusTask && mapData.tasks[quest.focusTask] && (
            <button
              type="button"
              /* Centred with auto margins rather than a translate: `.animate-in`
                 animates `transform` and holds `none` afterwards, which would
                 cancel a `-translate-x-1/2`. */
              className="surface animate-in absolute inset-x-0 top-3 z-[500] mx-auto flex w-max max-w-[calc(100%-1.5rem)] items-center gap-2 px-3 py-1.5 text-xs"
              style={{ boxShadow: "var(--shadow)", maxWidth: "min(20rem, calc(100% - 1.5rem))" }}
              onClick={() => setQuestFilter("focusTask", null)}
            >
              <span className="truncate">
                Showing only <b>{displayName(mapData.tasks[quest.focusTask].name)}</b>
              </span>
              <Icon path={icons.close} size={13} />
            </button>
          )}

          {/*
            * The one rule the map runs on, shown over it the first time
            * somebody opens one and never again. A new player looking at four
            * hundred coloured shapes has no way to learn this from the map
            * itself, and it was previously filed inside a collapsed `details`
            * at the bottom of the map *list*, which is a page they may never
            * scroll.
            */}
          {!primerSeen && !selection && (
            <aside className="surface animate-in map-primer" style={{ boxShadow: "var(--shadow-lg)" }}>
              <div className="flex items-start justify-between gap-3">
                <div className="min-w-0">
                  <p className="text-[0.875rem] font-semibold">Reading the map</p>
                  <p className="mt-1 text-meta">
                    Colour says <em>who</em> it belongs to, shape says <em>what</em> it is. Tap
                    anything for the detail panel, and use the layer switches on the left to show
                    only what you care about.
                  </p>
                </div>
                <button
                  type="button"
                  className="btn btn-ghost btn-icon flex-none"
                  aria-label="Dismiss the map key"
                  onClick={() => setUiFlag("mapPrimerSeen", true)}
                >
                  <Icon path={icons.close} size={15} />
                </button>
              </div>
              <div className="mt-2.5 flex flex-wrap gap-x-4 gap-y-1.5 text-[0.72rem]">
                {PRIMER_KEY.map((row) => (
                  <span key={row.id} className="inline-flex items-center gap-1.5">
                    <span
                      className="flex-none"
                      aria-hidden="true"
                      dangerouslySetInnerHTML={{ __html: swatchSvg(row.shape, row.color, 14) }}
                    />
                    {row.label}
                  </span>
                ))}
              </div>
              <button
                type="button"
                className="btn btn-primary btn-sm mt-3"
                onClick={() => setUiFlag("mapPrimerSeen", true)}
              >
                Got it
              </button>
            </aside>
          )}

          {!layers.documents && mapData.markers.documents.length > 0 && (
            <button
              type="button"
              className="surface animate-in map-hint"
              style={{ boxShadow: "var(--shadow)" }}
              onClick={() => setLayer("documents", true)}
            >
              <span className="truncate">
                {mapData.markers.documents.length} document spawn
                {mapData.markers.documents.length === 1 ? "" : "s"}
                {docTypes.length > 0
                  ? ` · ${docTypes.map((d) => d.name.replace(/ documents?| documentation/gi, "")).join(", ")}`
                  : ""}
              </span>
              <span className="flex-none" style={{ color: "var(--accent)" }}>Show</span>
            </button>
          )}

          {/* Detail card floats over the map on desktop, bottom sheet on phones.
              No collapse handle here on purpose — the card's own X already
              dismisses it, and two controls a centimetre apart that both make
              the panel go away is one too many. */}
          {selection && (
            <div
              className="surface animate-in absolute right-3 top-3 z-[600] hidden max-h-[calc(100%-1.5rem)] w-[21rem] overflow-y-auto md:block"
              style={{ boxShadow: "var(--shadow)" }}
            >
              <DetailPanel
                data={data}
                selection={selection}
                onClose={() => setSelection(null)}
                onOpenTask={openTask}
              />
            </div>
          )}
        </main>
      </div>

      {/* ------------------------------------------------------- mobile bar */}
      {!immersive && (
        <nav
          className="flex flex-none items-stretch gap-1 border-t p-1.5 md:hidden"
          style={{
            borderColor: "var(--line)",
            background: "var(--panel)",
            paddingBottom: "calc(0.375rem + env(safe-area-inset-bottom, 0px))",
          }}
          aria-label="Map tools (mobile)"
        >
          {TABS.map((t) => (
            <button
              key={t.id}
              type="button"
              className="btn btn-ghost flex-1 flex-col gap-0.5 py-1.5 text-[0.65rem]"
              aria-pressed={sheetOpen && tab === t.id}
              onClick={() => {
                if (sheetOpen && tab === t.id) setSheetOpen(false);
                else {
                  setTab(t.id);
                  setSheetOpen(true);
                  setSelection(null);
                }
              }}
            >
              <Icon path={t.icon} size={18} />
              {t.label}
            </button>
          ))}
          <button
            type="button"
            className="btn btn-ghost flex-1 flex-col gap-0.5 py-1.5 text-[0.65rem]"
            aria-label="Hide the interface"
            onClick={() => {
              setImmersive(true);
              setSheetOpen(false);
              setSelection(null);
            }}
          >
            <Icon path={icons.eye} size={18} />
            Hide
          </button>
        </nav>
      )}

      {/* ----------------------------------------------------- mobile sheets */}
      {sheetOpen && (
        <>
          <div
            className="fixed inset-0 z-[700] bg-black/45 md:hidden"
            onClick={() => setSheetOpen(false)}
            aria-hidden="true"
          />
          <div
            className="animate-sheet fixed inset-x-0 bottom-0 z-[800] flex max-h-[72dvh] flex-col rounded-t-2xl border-t md:hidden"
            style={{ borderColor: "var(--line)", background: "var(--panel)", boxShadow: "var(--shadow)" }}
            role="dialog"
            aria-label={TABS.find((t) => t.id === tab)?.label}
          >
            <div className="flex flex-none items-center justify-between px-3 pb-1 pt-2">
              <span className="mx-auto h-1 w-9 rounded-full" style={{ background: "var(--line)" }} />
            </div>
            <div className="scroll-y min-h-0 flex-1 pb-[env(safe-area-inset-bottom,0px)]">{panel}</div>
          </div>
        </>
      )}

      {selection && (
        <div
          className="animate-sheet fixed inset-x-0 bottom-0 z-[800] max-h-[62dvh] overflow-y-auto rounded-t-2xl border-t md:hidden"
          style={{
            borderColor: "var(--line)",
            background: "var(--panel)",
            boxShadow: "var(--shadow)",
            paddingBottom: "env(safe-area-inset-bottom, 0px)",
          }}
          role="dialog"
          aria-label="Marker details"
        >
          <DetailPanel
            data={data}
            selection={selection}
            onClose={() => setSelection(null)}
            onOpenTask={openTask}
          />
        </div>
      )}
    </div>
  );
}
