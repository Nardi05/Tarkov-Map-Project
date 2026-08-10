import type { ReactNode } from "react";
import { pct, type Selection } from "../lib/build-layers";
import { LAYER_BY_ID, QUEST_KIND_META } from "../lib/layers";
import { swatchSvg } from "../lib/marker-icons";
import { useStore } from "../store";
import { useTaskImages } from "../lib/data";
import type { MapData, TaskImage, TaskStatus } from "../types";
import TaskGallery from "./TaskGallery";
import TaskStatusControl from "./TaskStatusControl";
import { Icon, icons } from "./ui";

/**
 * The panel that opens when you click something on the map. Every entry answers
 * the same three questions in the same order: what is it, what does it mean for
 * my raid, and what do I do about it.
 */
export default function DetailPanel({
  data,
  selection,
  onClose,
  onOpenTask,
}: {
  data: MapData;
  selection: Selection;
  onClose: () => void;
  onOpenTask: (taskId: string) => void;
}) {
  const taskStatus = useStore((s) => s.taskStatus);
  const markerDone = useStore((s) => s.markerDone);
  const cycleTaskStatus = useStore((s) => s.cycleTaskStatus);
  const toggleMarkerDone = useStore((s) => s.toggleMarkerDone);
  const setMarkersDone = useStore((s) => s.setMarkersDone);
  // Only quest selections have a task, and only they show a gallery.
  const images = useTaskImages(selection.kind === "quest" ? selection.task.id : null);
  const view = describe(selection, data, {
    taskStatus,
    markerDone,
    cycleTaskStatus,
    toggleMarkerDone,
    setMarkersDone,
    images,
    onOpenTask,
  });

  return (
    <div className="animate-in flex flex-col">
      <header className="flex items-start gap-2.5 px-3 pb-2 pt-3">
        <span
          className="mt-0.5 flex-none"
          aria-hidden="true"
          dangerouslySetInnerHTML={{ __html: swatchSvg(view.shape, view.color, 20) }}
        />
        <div className="min-w-0 flex-1">
          <h2 className="text-sm font-semibold leading-tight">{view.title}</h2>
          <p className="mt-0.5 text-[0.7rem]" style={{ color: "var(--text-dim)" }}>
            {view.kind}
          </p>
        </div>
        <button type="button" className="btn btn-ghost btn-icon flex-none" onClick={onClose} aria-label="Close details">
          <Icon path={icons.close} size={16} />
        </button>
      </header>

      <div className="px-3 pb-3">
        {view.lead && (
          <p className="mb-2.5 text-[0.8125rem] leading-relaxed" style={{ color: "var(--text-dim)" }}>
            {view.lead}
          </p>
        )}

        {view.facts.length > 0 && (
          <dl className="surface-2 mb-2.5 divide-y" style={{ borderColor: "var(--line-soft)" }}>
            {view.facts.map((fact) => (
              <div key={fact.label} className="flex items-baseline justify-between gap-3 px-2.5 py-1.5">
                <dt className="text-[0.7rem]" style={{ color: "var(--text-faint)" }}>
                  {fact.label}
                </dt>
                <dd className="text-right text-[0.75rem] font-medium">{fact.value}</dd>
              </div>
            ))}
          </dl>
        )}

        {view.body}
      </div>
    </div>
  );
}

interface View {
  title: string;
  kind: string;
  shape: Parameters<typeof swatchSvg>[0];
  color: string;
  lead?: string | null;
  facts: { label: string; value: ReactNode }[];
  body?: ReactNode;
}

function Note({ children, tone = "info" }: { children: ReactNode; tone?: "info" | "warn" }) {
  const color = tone === "warn" ? "#fbbf24" : "var(--accent)";
  return (
    <p
      className="mb-2 rounded-lg px-2.5 py-2 text-[0.75rem] leading-relaxed"
      style={{
        background: `color-mix(in srgb, ${color} 12%, transparent)`,
        color: `color-mix(in srgb, ${color} 82%, var(--text))`,
      }}
    >
      {children}
    </p>
  );
}

interface DescribeContext {
  taskStatus: Record<string, TaskStatus>;
  markerDone: Record<string, true>;
  cycleTaskStatus: (id: string) => void;
  toggleMarkerDone: (markerId: string) => void;
  setMarkersDone: (markerIds: string[], done: boolean) => void;
  images: TaskImage[];
  onOpenTask: (id: string) => void;
}

function describe(selection: Selection, data: MapData, ctx: DescribeContext): View {
  switch (selection.kind) {
    case "spawn": {
      const { cluster } = selection;
      // Every spawn in a cluster shares a group and a role, so the first one
      // speaks for all of them; only the counts and zones need collecting.
      const spawn = cluster.spawns[0];
      const isSniper = spawn.group === "sniper";
      const isPmcBot = spawn.group === "pmc-ai";
      const layer = LAYER_BY_ID[
        isSniper
          ? "sniper-spawns"
          : isPmcBot
            ? "pmc-bot-spawns"
            : spawn.group === "scav" || spawn.group === "scav-ai"
              ? "scav-spawns"
              : "pmc-spawns"
      ];
      const playerStart = cluster.spawns.some((s) => s.categories.includes("player"));
      const zones = [...new Set(cluster.spawns.map((s) => s.zone).filter(Boolean))] as string[];
      const sides = [...new Set(cluster.spawns.flatMap((s) => s.sides))];
      return {
        title: isSniper
          ? "Sniper Scav position"
          : isPmcBot
            ? "AI PMC spawn"
            : playerStart
              ? "Player spawn"
              : "AI spawn",
        kind: layer.label,
        shape: layer.shape,
        color: layer.color,
        lead: isSniper
          ? "A marksman Scav holds this position from the start of the raid. It will fire on anything it can see, at long range."
          : isPmcBot
            ? "AI PMCs — Raiders, Rogues and roaming PMC bots — enter the map here. They use real weapons and tactics, so treat them like players."
            : playerStart
              ? "A raid can start here. Anyone spawning nearby is somewhere close to you in the first minute."
              : "AI spawns here during the raid. It is not a possible player start.",
        facts: [
          cluster.spawns.length > 1
            ? { label: "Spawn points here", value: cluster.spawns.length }
            : null,
          zones.length ? { label: zones.length > 1 ? "Zones" : "Zone", value: zones.join(", ") } : null,
          sides.length ? { label: "Used by", value: sides.join(", ") } : null,
          { label: "Elevation", value: `${cluster.centre[1].toFixed(1)} m` },
        ].filter(Boolean) as View["facts"],
      };
    }

    case "boss": {
      const { boss } = selection;
      const layer = LAYER_BY_ID["boss-spawns"];
      return {
        title: boss.name,
        kind: "Boss spawn",
        shape: layer.shape,
        color: layer.color,
        lead: `${boss.name} can spawn here${boss.zone ? ` in the ${boss.zone} area` : ""}. Bosses hit far harder than ordinary Scavs and usually bring guards — treat this area as a no-go until you are geared for it.`,
        facts: [
          boss.mapChance != null ? { label: "Chance on this map", value: pct(boss.mapChance) } : null,
          boss.zoneChance != null ? { label: "Chance in this zone", value: pct(boss.zoneChance) } : null,
          { label: "Known positions", value: boss.positions.length },
          boss.escorts.length
            ? {
                label: "Guards",
                value: boss.escorts.map((e) => (e.amount ? `${e.amount}× ${e.name}` : e.name)).join(", "),
              }
            : null,
        ].filter(Boolean) as View["facts"],
      };
    }

    case "extract": {
      const { extract } = selection;
      const layer = LAYER_BY_ID[
        extract.faction === "pmc" ? "pmc-extracts" : extract.faction === "scav" ? "scav-extracts" : "shared-extracts"
      ];
      const who =
        extract.faction === "pmc"
          ? "Usable when you are playing your PMC."
          : extract.faction === "scav"
            ? "Only usable on a Scav run."
            : "Usable by both PMCs and Scavs.";
      return {
        title: extract.name,
        kind: layer.label,
        shape: layer.shape,
        color: layer.color,
        lead: `${who} Stand inside the marked area and wait for the timer to finish without leaving it.`,
        facts: [
          { label: "Faction", value: extract.faction === "shared" ? "PMC and Scav" : extract.faction.toUpperCase() },
          extract.rawName !== extract.name ? { label: "Game ID", value: <code className="font-mono text-[0.7rem]">{extract.rawName}</code> } : null,
        ].filter(Boolean) as View["facts"],
        body: extract.switches.length ? (
          <Note tone="warn">
            Closed until a switch is flipped: {extract.switches.map((s) => s.name).join(", ")}. Turn on the
            “Switches” layer to find it.
          </Note>
        ) : null,
      };
    }

    case "transit": {
      const { transit } = selection;
      const layer = LAYER_BY_ID.transits;
      return {
        title: transit.name,
        kind: "Transit",
        shape: layer.shape,
        color: layer.color,
        lead:
          transit.description ??
          "A transit moves you straight into the next map with the gear you are carrying, instead of ending the raid. Useful for tasks that span two maps.",
        facts: [
          transit.target ? { label: "Goes to", value: transit.target } : null,
          transit.conditions ? { label: "Requires", value: transit.conditions } : null,
        ].filter(Boolean) as View["facts"],
      };
    }

    case "lock": {
      const { lock, key } = selection;
      const layer = LAYER_BY_ID.keys;
      return {
        title: key ? key.name : `Locked ${lock.lockType}`,
        kind: `Locked ${lock.lockType}`,
        shape: layer.shape,
        color: layer.color,
        lead: key
          ? `This ${lock.lockType} needs the ${key.name}. Keys are consumed on a limited number of uses, so check the value of what is behind it first.`
          : `This ${lock.lockType} is locked and no key is recorded for it in the current data.`,
        facts: [
          key ? { label: "Key", value: key.shortName || key.name } : null,
          lock.needsPower ? { label: "Power", value: "Must be switched on first" } : null,
        ].filter(Boolean) as View["facts"],
        body: (
          <div className="flex items-center gap-2">
            {key?.icon && <img src={key.icon} alt="" width={48} height={48} className="surface-2 p-1" loading="lazy" />}
            {key?.wiki && (
              <a className="btn" href={key.wiki} target="_blank" rel="noreferrer noopener">
                <Icon path={icons.external} size={14} /> Key details
              </a>
            )}
          </div>
        ),
      };
    }

    case "quest": {
      const { marker, task, alternatives } = selection;
      const layer = LAYER_BY_ID.quests;
      const status = ctx.taskStatus[task.id];
      const keys = task.keys.map((id) => data.keys[id]).filter(Boolean);

      // When this pin stands for several possible spawns of one item, finding
      // it once settles all of them — so they tick together.
      const spawns = alternatives.length;
      const collapsed = spawns > 1;
      const hereDone = collapsed
        ? alternatives.every((m) => !!ctx.markerDone[m.id])
        : !!ctx.markerDone[marker.id];

      // Every marker this task has on this map, so the panel can say where you
      // are in a multi-location objective.
      const siblings = data.markers.quests.filter((m) => m.task === task.id);
      const doneCount = siblings.filter((m) => ctx.markerDone[m.id]).length;
      const position = siblings.findIndex((m) => m.id === marker.id) + 1;

      const stateLabel =
        status === "active" ? "Active" : status === "completed" ? "Done" : "Not started";
      const kindMeta = QUEST_KIND_META[marker.kind];

      return {
        title: task.name,
        kind: `${kindMeta?.label ?? "Task objective"}${marker.optional ? " (optional)" : ""}`,
        // Matches the glyph actually drawn on the map for this objective kind.
        shape: kindMeta?.shape ?? layer.shape,
        color: layer.color,
        lead: marker.description,
        facts: [
          { label: "Status", value: stateLabel },
          kindMeta ? { label: "Objective", value: kindMeta.hint } : null,
          task.trader ? { label: "Trader", value: task.trader.name } : null,
          task.minPlayerLevel > 0 ? { label: "Unlocks at", value: `Level ${task.minPlayerLevel}` } : null,
          marker.count && marker.count > 1 ? { label: "Needs", value: `${marker.count}×` } : null,
          collapsed ? { label: "Possible spawns", value: `${spawns} — it is at one of them` } : null,
          !collapsed && siblings.length > 1
            ? { label: "Locations", value: `${position} of ${siblings.length} · ${doneCount} done` }
            : null,
          task.experience ? { label: "Reward", value: `${task.experience.toLocaleString()} XP` } : null,
          task.kappaRequired ? { label: "Kappa", value: "Required" } : null,
        ].filter(Boolean) as View["facts"],
        body: (
          <div className="flex flex-col gap-2">
            {marker.item && (
              <div className="surface-2 flex items-center gap-2 px-2 py-1.5">
                {marker.item.icon && <img src={marker.item.icon} alt="" width={34} height={34} loading="lazy" />}
                <div className="min-w-0">
                  <p className="truncate text-[0.75rem] font-medium">{marker.item.name}</p>
                  <p className="text-[0.68rem]" style={{ color: "var(--text-faint)" }}>
                    {collapsed
                      ? `Quest item — ${spawns} possible spawns in this area`
                      : "Quest item — one of its possible spawns"}
                  </p>
                </div>
              </div>
            )}

            {ctx.images.length > 0 && <TaskGallery images={ctx.images} taskName={task.name} />}

            {keys.length > 0 && <Note>Bring {keys.map((k) => k.name).join(", ")} for this task.</Note>}

            <div className="surface-2 flex items-center gap-2.5 px-2.5 py-2">
              <TaskStatusControl
                status={status}
                name={task.name}
                onCycle={() => ctx.cycleTaskStatus(task.id)}
              />
              <div className="min-w-0 flex-1">
                <p className="text-[0.75rem] font-medium">{stateLabel}</p>
                <p className="text-[0.68rem]" style={{ color: "var(--text-faint)" }}>
                  Tap to move between not started, active and done
                </p>
              </div>
            </div>

            <button
              type="button"
              className="btn w-full justify-start"
              aria-pressed={hereDone}
              onClick={() =>
                collapsed
                  ? ctx.setMarkersDone(
                      alternatives.map((m) => m.id),
                      !hereDone,
                    )
                  : ctx.toggleMarkerDone(marker.id)
              }
            >
              <Icon path={icons.check} size={14} />
              {hereDone
                ? collapsed
                  ? "Found — tap to undo"
                  : "Done here"
                : collapsed
                  ? "I found the item"
                  : "Mark this location done"}
            </button>

            <div className="flex flex-wrap gap-1.5">
              <button type="button" className="btn" onClick={() => ctx.onOpenTask(task.id)}>
                <Icon path={icons.target} size={14} /> Only this task
              </button>
              {task.wiki && (
                <a className="btn" href={task.wiki} target="_blank" rel="noreferrer noopener">
                  <Icon path={icons.external} size={14} /> Wiki
                </a>
              )}
            </div>
          </div>
        ),
      };
    }

    case "switch": {
      const { sw } = selection;
      const layer = LAYER_BY_ID.switches;
      return {
        title: sw.name,
        kind: "Switch",
        shape: layer.shape,
        color: layer.color,
        lead: sw.activates.length
          ? "Flipping this changes something else on the map — usually opening an extract or a door."
          : "A switch on the map. Flipping it may open a door or power a room.",
        facts: sw.switchType ? [{ label: "Type", value: sw.switchType }] : [],
        body: sw.activates.length ? (
          <ul className="flex flex-col gap-1">
            {sw.activates.map((line) => (
              <li key={line} className="surface-2 px-2.5 py-1.5 text-[0.75rem]">
                {line}
              </li>
            ))}
          </ul>
        ) : null,
      };
    }

    case "hazard": {
      const { hazard } = selection;
      const layer = LAYER_BY_ID.hazards;
      const sniper = hazard.hazardType === "sniper";
      return {
        title: sniper ? "Sniper Scav zone" : hazard.name,
        kind: "Hazard",
        shape: layer.shape,
        color: layer.color,
        lead: sniper
          ? "A marksman Scav covers this whole area. Crossing it in the open will usually get you shot — find cover or route around it."
          : "Entering this area is dangerous. Mines and restricted zones kill quickly and without warning.",
        facts: [{ label: "Type", value: hazard.hazardType }],
      };
    }
  }
}
