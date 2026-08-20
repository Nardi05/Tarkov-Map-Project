import { useMemo, useState } from "react";
import {
  KORD_SEASON,
  dailyDocumentLimit,
  kordQuestById,
  prettyMapName,
  seasonDaysLeft,
  seasonElapsed,
  type SeasonQuest,
} from "../lib/kord-season";
import { href, navigate } from "../lib/router";
import type { GameMode } from "../lib/persist-migrate";
import type { TaskAvailability, TaskStatus } from "../types";
import TaskStatusControl from "./TaskStatusControl";
import { Icon, icons } from "./ui";

export default function SeasonPanel({
  mode,
  taskStatus,
  availability,
  onCycle,
}: {
  mode: GameMode;
  taskStatus: Record<string, TaskStatus>;
  availability: Record<string, TaskAvailability>;
  onCycle: (taskId: string) => void;
}) {
  const [showAll, setShowAll] = useState(false);
  const days = seasonDaysLeft();
  const elapsed = seasonElapsed();
  const line = KORD_SEASON.questline;
  const done = line.filter((q) => taskStatus[q.id] === "completed").length;
  const active = line.filter((q) => taskStatus[q.id] === "active").length;

  const nextUp = useMemo(() => {
    return line.filter((q) => {
      const stated = taskStatus[q.id];
      if (stated) return stated === "active";
      return (availability[q.id] ?? "locked") !== "locked";
    });
  }, [line, taskStatus, availability]);

  const visibleLine = showAll ? line : line.filter((q) => nextUp.includes(q));

  return (
    <section className="season-banner surface p-4 sm:p-5">
      <header className="mb-3 flex flex-wrap items-start justify-between gap-2">
        <div>
          <p className="eyebrow" style={{ color: "var(--season)" }}>
            Season 1
          </p>
          <h2 className="mt-1 text-lg font-semibold">{KORD_SEASON.name}</h2>
          <p className="mt-1 text-[0.72rem]" style={{ color: "var(--text-faint)" }}>
            {days > 0 ? `${days} day${days === 1 ? "" : "s"} left` : "Season has ended"}
            {" · "}
            ends {KORD_SEASON.ends}
            {mode === "season" && (
              <>
                {" · "}
                {done}/{line.length} story tasks
                {active ? ` · ${active} active` : ""}
              </>
            )}
          </p>
          <span className="season-meter" style={{ ["--p" as string]: elapsed }}>
            <i />
          </span>
        </div>
        <a
          className="btn btn-ghost btn-icon"
          href={KORD_SEASON.wiki}
          target="_blank"
          rel="noreferrer noopener"
          aria-label="Kord Breach on the wiki"
        >
          <Icon path={icons.external} size={15} />
        </a>
      </header>

      <p className="mb-3 text-[0.75rem] leading-relaxed" style={{ color: "var(--text-dim)" }}>
        {mode === "season"
          ? "This line is only offered on a seasonal character. Tick what Prapor has given you — the rest of the chain follows."
          : "The story line is seasonal-only. Switch to Season to track it. Battle-pass documents drop in every mode."}
      </p>

      {mode === "season" && (
        <>
          <ol className="mb-2 space-y-1">
            {(showAll ? line : visibleLine).map((quest) => (
              <SeasonRow
                key={quest.id}
                quest={quest}
                index={line.indexOf(quest) + 1}
                status={taskStatus[quest.id]}
                availability={availability[quest.id] ?? "locked"}
                onCycle={() => onCycle(quest.id)}
              />
            ))}
          </ol>
          {visibleLine.length === 0 && !showAll && (
            <p className="mb-2 text-[0.72rem]" style={{ color: "var(--text-faint)" }}>
              Nothing in this line is active or available yet. Tick Uninvited Guests if Prapor has given it to you.
            </p>
          )}
          <button
            type="button"
            className="btn btn-ghost mb-3 text-[0.72rem]"
            style={{ padding: "0.2rem 0.45rem" }}
            onClick={() => setShowAll((v) => !v)}
          >
            {showAll ? "Show only what's next" : `Show all ${line.length} story tasks`}
          </button>
        </>
      )}

      <DocumentHunt mode={mode} />
    </section>
  );
}

function SeasonRow({
  quest,
  index,
  status,
  availability,
  onCycle,
}: {
  quest: SeasonQuest;
  index: number;
  status: TaskStatus | undefined;
  availability: TaskAvailability;
  onCycle: () => void;
}) {
  const locked = !status && availability === "locked";
  const prior = quest.requires
    .map((r) => kordQuestById(r.task)?.name)
    .filter(Boolean) as string[];

  return (
    <li
      className="surface-2 flex items-start gap-2 p-2"
      style={{ opacity: status === "completed" ? 0.62 : locked ? 0.72 : 1 }}
    >
      <span className="mt-0.5 w-4 flex-none text-center text-[0.66rem] tabular-nums" style={{ color: "var(--text-faint)" }}>
        {index}
      </span>
      <span className="mt-0.5">
        <TaskStatusControl status={status} name={quest.name} onCycle={onCycle} />
      </span>
      <div className="min-w-0 flex-1">
        <p className="text-[0.8125rem] font-medium leading-tight">{quest.name}</p>
        <p className="mt-0.5 text-[0.68rem]" style={{ color: "var(--text-faint)" }}>
          {quest.trader}
          {quest.traderLevel ? ` LL${quest.traderLevel}` : ""}
          {locked && prior.length > 0 ? ` · needs ${prior.join(" or ")}` : ""}
        </p>
        <p className="mt-1 text-[0.72rem] leading-snug" style={{ color: "var(--text-dim)" }}>
          {quest.summary}
        </p>
        {quest.spots && quest.spots.length > 0 && (status === "active" || !locked) && (
          <ul className="mt-1 space-y-0.5 text-[0.68rem]" style={{ color: "var(--text-faint)" }}>
            {quest.spots.map((spot) => (
              <li key={spot}>· {spot}</li>
            ))}
          </ul>
        )}
        {quest.maps.length > 0 && (
          <p className="mt-1.5 flex flex-wrap gap-1">
            {quest.maps.map((map) => (
              <button
                key={map}
                type="button"
                className="chip chip-accent"
                onClick={() => navigate(href.map(map, quest.id))}
              >
                {prettyMapName(map)}
              </button>
            ))}
          </p>
        )}
      </div>
      <a
        className="btn btn-ghost btn-icon flex-none"
        href={quest.wiki}
        target="_blank"
        rel="noreferrer noopener"
        aria-label={`${quest.name} on the wiki`}
      >
        <Icon path={icons.external} size={15} />
      </a>
    </li>
  );
}

function DocumentHunt({ mode }: { mode: GameMode }) {
  const limit = dailyDocumentLimit(mode);
  return (
    <div className="border-t pt-3" style={{ borderColor: "var(--line-soft)" }}>
      <h3 className="text-[0.78rem] font-semibold">Battle-pass documents</h3>
      <p className="mt-0.5 text-[0.7rem] leading-snug" style={{ color: "var(--text-faint)" }}>
        Shared across every mode. You can pick up {limit} per day on {mode === "season" ? "Season" : mode === "pve" ? "PvE" : "PvP Zone"}.
        Pins mark the building, not the shelf — open one for the screenshot.
      </p>
      <ul className="mt-2 grid grid-cols-1 gap-1 sm:grid-cols-2">
        {KORD_SEASON.documentTypes.map((doc) => (
          <li key={doc.name} className="flex flex-wrap items-baseline gap-x-1.5 gap-y-0.5 px-0.5 py-0.5">
            <span className="text-[0.72rem] font-medium">{doc.name.replace(" documentation", "").replace(" documents", "")}</span>
            <span className="flex flex-wrap gap-1">
              {doc.maps.map((map) => (
                <button
                  key={map}
                  type="button"
                  className="chip"
                  onClick={() => navigate(href.map(map))}
                >
                  {prettyMapName(map)}
                </button>
              ))}
            </span>
          </li>
        ))}
      </ul>
    </div>
  );
}
