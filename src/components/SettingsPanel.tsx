import { useEffect, useState } from "react";
import { availableStyles, type Floor } from "../lib/base-layer";
import { LAYERS } from "../lib/layers";
import { swatchSvg } from "../lib/marker-icons";
import { useStore, type Theme } from "../store";
import type { MapData } from "../types";
import { Section, Toggle } from "./ui";

const THEMES: { id: Theme; label: string }[] = [
  { id: "dark", label: "Dark" },
  { id: "light", label: "Light" },
  { id: "system", label: "System" },
];

export default function SettingsPanel({
  data,
  floors,
  floorId,
  onFloorChange,
}: {
  data: MapData;
  floors: Floor[];
  floorId: string;
  onFloorChange: (id: string) => void;
}) {
  const settings = useStore((s) => s.settings);
  const setSetting = useStore((s) => s.setSetting);

  /*
   * Marker size is held locally while the slider is moving and written to the
   * store once, on release.
   *
   * Writing on every `input` event meant every pointer-move rebuilt all
   * thirteen marker layers — up to ~2,500 canvas circles on Streets — because
   * `markerScale` is baked into each icon's pixel size and sits in MapCanvas's
   * rebuild deps. One drag did that thirty times.
   *
   * The drag still previews, via a CSS variable the markers already multiply
   * into their transform. That covers the div-icon pins; canvas spawn dots take
   * their radius in JS and only catch up on release, which is a fair trade for
   * a settings slider nobody drags mid-raid.
   */
  const [draft, setDraft] = useState<number | null>(null);
  const markerScale = draft ?? settings.markerScale;

  useEffect(() => {
    const root = document.documentElement;
    if (draft === null) root.style.removeProperty("--tk-marker-draft");
    else root.style.setProperty("--tk-marker-draft", (draft / settings.markerScale).toFixed(3));
    return () => {
      root.style.removeProperty("--tk-marker-draft");
    };
  }, [draft, settings.markerScale]);

  const commitScale = () => {
    if (draft !== null && draft !== settings.markerScale) setSetting("markerScale", draft);
    setDraft(null);
  };
  const resetLayers = useStore((s) => s.resetLayers);
  const clearProgress = useStore((s) => s.clearProgress);
  const trackedCount = useStore(
    (s) => Object.keys(s.taskStatus).length + Object.keys(s.markerDone).length,
  );

  const styles = availableStyles(data.geo);

  return (
    <div>
      {styles.length > 1 && (
        <Section title="Map style" hint="Both styles line up exactly — markers never move.">
          <div className="flex gap-1.5">
            {styles.map((style) => (
              <button
                key={style}
                type="button"
                className="btn flex-1"
                aria-pressed={settings.style === style}
                onClick={() => setSetting("style", style)}
              >
                {style === "clean" ? "Clean vector" : "Satellite"}
              </button>
            ))}
          </div>
        </Section>
      )}

      {floors.length > 1 && (
        <Section
          title="Level"
          hint="This map has multiple floors. Pick one to see only what is on it."
        >
          <div className="flex flex-wrap gap-1.5">
            {floors.map((floor) => (
              <button
                key={floor.id}
                type="button"
                className="btn text-[0.72rem]"
                style={{ padding: "0.28rem 0.55rem" }}
                aria-pressed={floorId === floor.id}
                onClick={() => onFloorChange(floor.id)}
              >
                {floor.name}
              </button>
            ))}
          </div>
        </Section>
      )}

      <Section title="Markers" hint="Tune the density until the map reads well on your screen.">
        <label className="mb-2 block">
          <span className="mb-1 flex items-baseline justify-between text-[0.75rem]">
            Marker size
            <span className="tabular-nums" style={{ color: "var(--text-faint)" }}>
              {Math.round(markerScale * 100)}%
            </span>
          </span>
          <input
            type="range"
            min={0.6}
            max={1.8}
            step={0.1}
            value={markerScale}
            onChange={(e) => setDraft(Number(e.target.value))}
            onPointerUp={commitScale}
            onPointerCancel={commitScale}
            onKeyUp={commitScale}
            onBlur={commitScale}
            className="w-full accent-[var(--accent)]"
            aria-label="Marker size"
          />
        </label>

        <SettingRow
          label="Marker names"
          hint="Show extract, transit and boss names next to their icons."
          checked={settings.showMarkerLabels}
          onChange={(v) => setSetting("showMarkerLabels", v)}
        />
        <SettingRow
          label="Task name labels"
          hint="Print task names on quest markers. Busy maps have 150+, so this is off by default."
          checked={settings.showQuestLabels}
          onChange={(v) => setSetting("showQuestLabels", v)}
        />
        <SettingRow
          label="Zone outlines"
          hint="Draw the real footprint of extracts and quest areas, not just a pin."
          checked={settings.showZones}
          onChange={(v) => setSetting("showZones", v)}
        />
        <SettingRow
          label="Place names"
          hint="Street and building names printed on the map itself."
          checked={settings.showPlaceLabels}
          onChange={(v) => setSetting("showPlaceLabels", v)}
        />
        <SettingRow
          label="Dim finished tasks"
          hint="Keep finished task markers and locations visible but faded."
          checked={settings.dimCompleted}
          onChange={(v) => setSetting("dimCompleted", v)}
        />
      </Section>


      <Section title="Appearance">
        <div className="flex gap-1.5">
          {THEMES.map((theme) => (
            <button
              key={theme.id}
              type="button"
              className="btn flex-1"
              aria-pressed={settings.theme === theme.id}
              onClick={() => setSetting("theme", theme.id)}
            >
              {theme.label}
            </button>
          ))}
        </div>
      </Section>

      <Section title="Legend" hint="What each symbol on the map means.">
        <ul className="grid grid-cols-1 gap-1 sm:grid-cols-2">
          {LAYERS.map((layer) => (
            <li key={layer.id} className="flex items-center gap-2 py-0.5">
              <span
                className="flex-none"
                aria-hidden="true"
                dangerouslySetInnerHTML={{ __html: swatchSvg(layer.shape, layer.color, 16) }}
              />
              <span className="truncate text-[0.72rem]">{layer.label}</span>
            </li>
          ))}
        </ul>
      </Section>

      <Section title="Reset">
        <div className="flex flex-wrap gap-1.5">
          <button type="button" className="btn" onClick={resetLayers}>
            Reset layers
          </button>
          <button
            type="button"
            className="btn"
            style={{ color: trackedCount ? "var(--danger)" : undefined }}
            disabled={!trackedCount}
            onClick={() => {
              if (confirm("Clear every task status and ticked location? This cannot be undone.")) {
                clearProgress();
              }
            }}
          >
            Clear task progress{trackedCount ? ` (${trackedCount})` : ""}
          </button>
        </div>
        <p className="mt-2 text-[0.68rem] leading-relaxed" style={{ color: "var(--text-faint)" }}>
          Settings and task progress are saved in this browser only. Nothing is uploaded anywhere.
        </p>
      </Section>
    </div>
  );
}

function SettingRow({
  label,
  hint,
  checked,
  onChange,
}: {
  label: string;
  hint: string;
  checked: boolean;
  onChange: (next: boolean) => void;
}) {
  return (
    <label className="flex cursor-pointer items-start gap-2.5 rounded-lg px-1 py-1.5 hover:bg-[var(--panel-2)]">
      <span className="min-w-0 flex-1">
        <span className="block text-[0.78rem] font-medium">{label}</span>
        <span className="mt-0.5 block text-[0.68rem] leading-snug" style={{ color: "var(--text-faint)" }}>
          {hint}
        </span>
      </span>
      <Toggle checked={checked} onChange={onChange} label={label} />
    </label>
  );
}
