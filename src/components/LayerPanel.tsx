import { useMemo, useState } from "react";
import { LAYER_GROUPS, LAYERS, PRESETS, type LayerId } from "../lib/layers";
import { swatchSvg } from "../lib/marker-icons";
import { useStore } from "../store";
import type { MapData } from "../types";
import { Icon, icons, Section, Toggle } from "./ui";

/** How many of a layer's markers this map actually has, for the count badges. */
function useCounts(data: MapData, visibleQuestCount: number): Record<LayerId, number> {
  return useMemo(() => {
    const m = data.markers;
    const spawns = (test: (g: string) => boolean) => m.spawns.filter((s) => test(s.group)).length;
    const bossZones = new Set(m.bossSpawns.map((b) => `${b.name}|${b.zone ?? ""}`)).size;

    return {
      "pmc-spawns": spawns((g) => g === "pmc"),
      "pmc-bot-spawns": spawns((g) => g === "pmc-ai"),
      "scav-spawns": spawns((g) => g === "scav" || g === "scav-ai"),
      "boss-spawns": bossZones,
      "sniper-spawns": spawns((g) => g === "sniper"),
      "pmc-extracts": m.extracts.filter((e) => e.faction === "pmc").length,
      "scav-extracts": m.extracts.filter((e) => e.faction === "scav").length,
      "shared-extracts": m.extracts.filter((e) => e.faction === "shared").length,
      transits: m.transits.length,
      quests: visibleQuestCount,
      keys: m.locks.length,
      switches: m.switches.length,
      hazards: m.hazards.length,
    };
  }, [data, visibleQuestCount]);
}

export default function LayerPanel({
  data,
  visibleQuestCount,
}: {
  data: MapData;
  visibleQuestCount: number;
}) {
  const layers = useStore((s) => s.layers);
  const toggleLayer = useStore((s) => s.toggleLayer);
  const setGroupLayers = useStore((s) => s.setGroupLayers);
  const applyPreset = useStore((s) => s.applyPreset);
  const customViews = useStore((s) => s.customViews);
  const saveCustomView = useStore((s) => s.saveCustomView);
  const removeCustomView = useStore((s) => s.removeCustomView);
  const counts = useCounts(data, visibleQuestCount);
  const [naming, setNaming] = useState(false);
  const [draftName, setDraftName] = useState("");

  const activePreset = useMemo(() => {
    const on = LAYERS.filter((l) => layers[l.id]).map((l) => l.id).sort();
    const matches = (ids: LayerId[]) =>
      ids.length === on.length && [...ids].sort().every((id, i) => id === on[i]);
    return (
      PRESETS.find((p) => matches(p.layers))?.id ?? customViews.find((v) => matches(v.layers))?.id
    );
  }, [layers, customViews]);

  const commitName = () => {
    saveCustomView(draftName);
    setDraftName("");
    setNaming(false);
  };

  return (
    <div>
      <Section title="Quick views" hint="One tap to switch what the map is for.">
        <div className="flex flex-wrap gap-1.5">
          {PRESETS.map((preset) => (
            <button
              key={preset.id}
              type="button"
              className="btn"
              aria-pressed={activePreset === preset.id}
              title={preset.hint}
              onClick={() => applyPreset(preset.id)}
            >
              {preset.label}
            </button>
          ))}

          {/* Saved views sit with the built-ins — they do the same job — but
              carry a remove control, which the built-ins can't have. */}
          {customViews.map((view) => (
            <span
              key={view.id}
              className="btn"
              style={{ gap: "0.35rem", paddingRight: "0.3rem" }}
              aria-pressed={activePreset === view.id}
            >
              <button
                type="button"
                className="bg-transparent p-0 text-inherit"
                title={`${view.layers.length} layers, saved by you`}
                onClick={() => applyPreset(view.id)}
              >
                {view.label}
              </button>
              <button
                type="button"
                className="grid place-items-center rounded bg-transparent p-0"
                style={{ width: "1rem", height: "1rem", color: "var(--text-faint)" }}
                title={`Delete "${view.label}"`}
                aria-label={`Delete quick view ${view.label}`}
                onClick={() => removeCustomView(view.id)}
              >
                <Icon path={icons.close} size={11} />
              </button>
            </span>
          ))}
        </div>

        {naming ? (
          <div className="mt-2 flex gap-1.5">
            <input
              className="input"
              autoFocus
              maxLength={32}
              placeholder="Name this view…"
              value={draftName}
              onChange={(e) => setDraftName(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter") commitName();
                if (e.key === "Escape") {
                  setNaming(false);
                  setDraftName("");
                }
              }}
            />
            <button type="button" className="btn" disabled={!draftName.trim()} onClick={commitName}>
              Save
            </button>
            <button
              type="button"
              className="btn btn-ghost"
              onClick={() => {
                setNaming(false);
                setDraftName("");
              }}
            >
              Cancel
            </button>
          </div>
        ) : (
          <button
            type="button"
            className="btn btn-ghost mt-2 text-[0.7rem]"
            style={{ padding: "0.22rem 0.5rem", color: "var(--text-dim)" }}
            onClick={() => setNaming(true)}
          >
            + Save these layers as a quick view
          </button>
        )}
      </Section>

      <div className="h-px" style={{ background: "var(--line-soft)" }} />

      {LAYER_GROUPS.map((group) => {
        const groupLayers = LAYERS.filter((l) => l.group === group.id);
        const ids = groupLayers.map((l) => l.id);
        const allOn = ids.every((id) => layers[id]);

        return (
          <Section
            key={group.id}
            title={group.label}
            hint={group.hint}
            action={
              <button
                type="button"
                className="btn btn-ghost text-[0.7rem]"
                style={{ padding: "0.2rem 0.4rem" }}
                onClick={() => setGroupLayers(ids, !allOn)}
              >
                {allOn ? "None" : "All"}
              </button>
            }
          >
            <ul className="flex flex-col gap-0.5">
              {groupLayers.map((layer) => {
                const count = counts[layer.id];
                const empty = count === 0;
                return (
                  <li key={layer.id}>
                    <label
                      className="flex cursor-pointer items-start gap-2.5 rounded-lg px-2 py-1.5 transition-colors hover:bg-[var(--panel-2)]"
                      style={{ opacity: empty ? 0.45 : 1 }}
                    >
                      <span
                        className="mt-px flex-none"
                        aria-hidden="true"
                        dangerouslySetInnerHTML={{ __html: swatchSvg(layer.shape, layer.color, 17) }}
                      />
                      <span className="min-w-0 flex-1">
                        <span className="flex items-baseline gap-1.5">
                          <span className="truncate text-[0.8125rem] font-medium">{layer.label}</span>
                          <span className="text-[0.65rem] tabular-nums" style={{ color: "var(--text-faint)" }}>
                            {empty ? "none here" : count}
                          </span>
                        </span>
                        <span
                          className="mt-0.5 block text-[0.7rem] leading-snug"
                          style={{ color: "var(--text-faint)" }}
                        >
                          {layer.hint}
                        </span>
                      </span>
                      <Toggle
                        checked={!!layers[layer.id] && !empty}
                        onChange={() => !empty && toggleLayer(layer.id)}
                        color={layer.color}
                        label={layer.label}
                      />
                    </label>
                  </li>
                );
              })}
            </ul>
          </Section>
        );
      })}
    </div>
  );
}
