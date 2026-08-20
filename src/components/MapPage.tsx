import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import MapCanvas, { type FocusRequest } from "./MapCanvas";
import LayerPanel from "./LayerPanel";
import TaskPanel from "./TaskPanel";
import SettingsPanel from "./SettingsPanel";
import DetailPanel from "./DetailPanel";
import MapSwitcher from "./MapSwitcher";
import RaidClock from "./RaidClock";
import { isTypingInto } from "./ShortcutHelp";
import { Icon, icons } from "./ui";
import { availableStyles, floorsFor } from "../lib/base-layer";
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
  const settings = useStore((s) => s.settings);
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
  const [mapFullscreen, setMapFullscreen] = useState(false);
  const [fitToken, setFitToken] = useState(0);
  const hideChrome = mapFullscreen;

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

  /*
   * Shortcuts for the panels. Fullscreen lives in MapCanvas, beside the thing
   * it toggles.
   *
   * Everything is guarded by isTypingInto, without which searching a task list
   * for "flash" would trip Fullscreen, Layers, Settings and hide-the-panel on
   * the way through.
   */
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key !== "Escape" || isTypingInto(e.target)) return;
      setSelection(null);
      setSheetOpen(false);
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);

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
    <div className="flex h-full flex-col" style={{ background: "var(--bg)" }}>
      {/* ------------------------------------------------------------ header */}
      {!hideChrome && (
      <header
        className="map-glass flex flex-none items-center gap-2 border-b px-2 py-2 md:px-3"
        style={{ borderColor: "var(--line)" }}
      >
        <a
          href={href.home()}
          onClick={onNavClick(href.home())}
          className="btn btn-ghost btn-icon flex-none"
          aria-label="All maps"
        >
          <Icon path={icons.back} size={18} />
        </a>

        <MapSwitcher maps={maps} current={data.normalizedName} onPick={(name) => navigate(href.map(name))} />

        <div className="ml-auto flex items-center gap-1.5">
          <button
            type="button"
            className="btn hidden text-[0.72rem] md:inline-flex"
            style={{ padding: "0.28rem 0.6rem" }}
            aria-pressed={!railCollapsed}
            onClick={() => setRailCollapsed((v) => !v)}
          >
            {railCollapsed ? "Show panel" : "Hide panel"}
          </button>
          <button
            type="button"
            className="btn hidden text-[0.72rem] sm:inline-flex"
            style={{ padding: "0.28rem 0.6rem" }}
            onClick={() => setFitToken((n) => n + 1)}
          >
            Reset view
          </button>
          <a
            className="btn inline-flex text-[0.72rem]"
            style={{ padding: "0.28rem 0.6rem" }}
            href={href.dashboard()}
            onClick={onNavClick(href.dashboard())}
            title="What to run next"
          >
            Dashboard
          </a>
          <a
            className="btn hidden text-[0.72rem] sm:inline-flex"
            style={{ padding: "0.28rem 0.6rem" }}
            href={href.quests()}
            onClick={onNavClick(href.quests())}
            title="Track your quests"
          >
            Quests
          </a>

          <RaidClock mapName={data.normalizedName} />

          {styles.length > 1 && (
            <div className="hidden items-center gap-1 rounded-lg p-0.5 sm:flex" style={{ background: "var(--panel-2)" }}>
              {styles.map((s) => (
                <button
                  key={s}
                  type="button"
                  className="btn btn-ghost text-[0.72rem]"
                  style={{ padding: "0.28rem 0.55rem" }}
                  aria-pressed={style === s}
                  onClick={() => setSetting("style", s)}
                >
                  {s === "clean" ? "Clean" : "Satellite"}
                </button>
              ))}
            </div>
          )}

          {floors.length > 1 && (
            <label className="hidden sm:block">
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
        </div>
      </header>
      )}

      <div className="flex min-h-0 flex-1">
        {/* ---------------------------------------------------- desktop rail */}
        {!hideChrome && (
        <aside
          className="hidden w-[21rem] flex-none flex-col overflow-hidden border-r transition-[width] duration-200 md:flex lg:w-[23rem]"
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
            onFullscreen={(on) => {
              setMapFullscreen(on);
              if (on) {
                setRailCollapsed(true);
                setSheetOpen(false);
              } else {
                setRailCollapsed(false);
              }
            }}
          />

          {/* Rail handle. Lives in the canvas, not the rail, so it stays
              reachable once the rail itself has no width left. */}
          {!hideChrome && (
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
            title={railCollapsed ? "Show the panel" : "Hide the panel"}
            aria-label={railCollapsed ? "Show the panel" : "Hide the panel"}
            onClick={() => setRailCollapsed((v) => !v)}
          >
            <span style={{ transform: `rotate(${railCollapsed ? -90 : 90}deg)`, display: "block" }}>
              <Icon path={icons.chevron} size={15} />
            </span>
          </button>
          )}

          {quest.focusTask && mapData.tasks[quest.focusTask] && (
            <button
              type="button"
              className="surface animate-in absolute left-1/2 top-3 z-[500] flex -translate-x-1/2 items-center gap-2 px-3 py-1.5 text-xs"
              style={{ boxShadow: "var(--shadow)" }}
              onClick={() => setQuestFilter("focusTask", null)}
            >
              <span className="truncate" style={{ maxWidth: "16rem" }}>
                Showing only <b>{displayName(mapData.tasks[quest.focusTask].name)}</b>
              </span>
              <Icon path={icons.close} size={13} />
            </button>
          )}

          {!layers.documents && mapData.markers.documents.length > 0 && (
            <button
              type="button"
              className="surface animate-in absolute bottom-3 left-1/2 z-[500] flex -translate-x-1/2 items-center gap-2 px-3 py-1.5 text-xs"
              style={{ boxShadow: "var(--shadow)" }}
              onClick={() => setLayer("documents", true)}
            >
              <span>
                {mapData.markers.documents.length} document spawn
                {mapData.markers.documents.length === 1 ? "" : "s"}
                {docTypes.length > 0
                  ? ` · ${docTypes.map((d) => d.name.replace(/ documents?| documentation/gi, "")).join(", ")}`
                  : ""}
              </span>
              <span style={{ color: "var(--accent)" }}>Show</span>
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
      {!hideChrome && (
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
            className="animate-sheet fixed inset-x-0 bottom-0 z-[800] flex max-h-[72vh] flex-col rounded-t-2xl border-t md:hidden"
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
          className="animate-sheet fixed inset-x-0 bottom-0 z-[800] max-h-[62vh] overflow-y-auto rounded-t-2xl border-t md:hidden"
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
