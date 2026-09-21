import { useMemo, useState } from "react";
import { useHideoutData } from "../lib/data";
import { href, navigate, onNavClick } from "../lib/router";
import {
  STORY,
  choiceConflicts,
  effectiveChoices,
  endingById,
  headlineRewards,
  hideoutLevels,
  locksForEnding,
  mapLabel,
  outcomeLabel,
  progressFor,
  stepIsDone,
  stepsForEnding,
  warningsForEnding,
  type StoryChapter,
  type StoryEnding,
  type StoryEndingId,
  type StoryEvidence,
  type StoryLock,
  type VisibleStep,
} from "../lib/story";
import { useHideout, useStore, useStory } from "../store";
import { EmptyState, Icon, icons, PageHeader, Tick } from "./ui";

const TONE: Record<string, string> = {
  savior: "var(--ok)",
  survivor: "var(--accent)",
  debtor: "var(--season)",
  fallen: "var(--danger)",
  best: "var(--ok)",
  neutral: "var(--accent)",
  bad: "var(--season)",
  worst: "var(--danger)",
  blue: "#7dd3fc",
  gold: "var(--accent)",
  purple: "var(--season)",
  green: "var(--ok)",
};

export default function StoryPage({ endingId }: { endingId: string | null }) {
  const ending = endingById(endingId);
  if (endingId && !ending) {
    return (
      <>
        <PageHeader title="Story" lead="That ending is not one of the four." />
        <EmptyState
          title="Unknown ending"
          hint="Pick Savior, Survivor, Debtor or Fallen from the list."
        />
        <p className="mt-4">
          <a className="btn" href={href.story()} onClick={onNavClick(href.story())}>
            All endings
          </a>
        </p>
      </>
    );
  }
  if (!ending) return <Overview />;
  return <Guide ending={ending} />;
}

function Overview() {
  const story = useStory();
  const setStoryTarget = useStore((s) => s.setStoryTarget);
  const targeted = endingById(story.target);
  const hideout = useHideout();
  const stations = useHideoutData().data?.stations;
  const built = useMemo(() => hideoutLevels(stations, hideout), [stations, hideout]);

  const targetStats = targeted
    ? progressFor(targeted, story.ticks, story.choices, built)
    : null;

  const pick = (id: StoryEndingId) => {
    setStoryTarget(id);
    navigate(href.story(id));
  };

  return (
    <>
      <PageHeader
        title="Story"
        lead="Four endings. Pick one and we walk you through every chapter, lock, and item — in the order you should do them."
      />

      {targeted && targetStats && (
        <a
          href={href.story(targeted.id)}
          onClick={onNavClick(href.story(targeted.id))}
          className="surface surface-link mb-5 flex flex-wrap items-center justify-between gap-3 p-4"
        >
          <div className="min-w-0">
            <p className="eyebrow" style={{ color: TONE[targeted.id] }}>
              Your target
            </p>
            <p className="mt-1 text-lg font-semibold">{targeted.name}</p>
            <p className="mt-0.5 text-[0.8rem]" style={{ color: "var(--text-dim)" }}>
              {targetStats.requiredDone} of {targetStats.required} steps
              {targetStats.evidenceNeed
                ? ` · ${targetStats.evidenceHave} of ${targetStats.evidenceNeed} evidence`
                : ""}
            </p>
          </div>
          <span className="btn is-active">Continue</span>
        </a>
      )}

      <ul className="grid grid-cols-1 gap-3 lg:grid-cols-2">
        {STORY.endings.map((row) => (
          <li key={row.id}>
            <EndingCard
              ending={row}
              targeted={story.target === row.id}
              onTarget={() => pick(row.id)}
            />
          </li>
        ))}
      </ul>

      <p className="mt-6 text-[0.72rem] leading-relaxed" style={{ color: "var(--text-faint)" }}>
        Difficulty is a community read of time and grind, not an in-game rating. Choices are
        permanent on this character. Sources:{" "}
        <a href={STORY.wiki} target="_blank" rel="noreferrer">
          Endings
        </a>
        {" · "}
        <a href={STORY.ticketWiki} target="_blank" rel="noreferrer">
          The Ticket
        </a>
        {", current for patch "}
        {STORY.patch}.
      </p>
    </>
  );
}

function EndingCard({
  ending,
  targeted,
  onTarget,
}: {
  ending: StoryEnding;
  targeted: boolean;
  onTarget: () => void;
}) {
  const color = TONE[ending.id];
  const headlines = headlineRewards(ending, 5);
  return (
    <article className="surface flex h-full flex-col p-4" data-ending={ending.id}>
      <header className="flex items-start justify-between gap-3">
        <div>
          <p className="eyebrow" style={{ color }}>
            {outcomeLabel(ending.outcome)}
          </p>
          <h2 className="mt-1 text-xl font-semibold">{ending.name}</h2>
        </div>
        <DifficultyDots rank={ending.difficulty.rank} label={ending.difficulty.label} />
      </header>
      <p className="mt-2 text-[0.88rem] leading-relaxed" style={{ color: "var(--text-dim)" }}>
        {ending.tagline}
      </p>
      <p className="mt-2 text-[0.75rem] leading-relaxed" style={{ color: "var(--text-faint)" }}>
        {ending.difficulty.note}
      </p>
      <ul className="mt-3 flex flex-wrap gap-1.5">
        {headlines.map((r) => (
          <li key={r.name} className="chip">
            {r.name}
          </li>
        ))}
      </ul>
      <div className="mt-4 flex flex-wrap gap-2">
        <button type="button" className={targeted ? "btn is-active" : "btn"} onClick={onTarget}>
          {targeted ? "Open guide" : "Target this"}
        </button>
        <a
          className="btn btn-ghost"
          href={href.story(ending.id)}
          onClick={onNavClick(href.story(ending.id))}
        >
          Read path
        </a>
      </div>
    </article>
  );
}

function Guide({ ending }: { ending: StoryEnding }) {
  const story = useStory();
  const setStoryTarget = useStore((s) => s.setStoryTarget);
  const toggleStoryTick = useStore((s) => s.toggleStoryTick);
  const setStoryChoice = useStore((s) => s.setStoryChoice);
  const resetStory = useStore((s) => s.resetStory);
  const hideout = useHideout();
  const stations = useHideoutData().data?.stations;
  const built = useMemo(() => hideoutLevels(stations, hideout), [stations, hideout]);
  const color = TONE[ending.id];
  const isTarget = story.target === ending.id;

  const choices = effectiveChoices(ending, story.choices);
  const stats = useMemo(
    () => progressFor(ending, story.ticks, story.choices, built),
    [ending, story.ticks, story.choices, built],
  );
  const rows = useMemo(
    () => stepsForEnding(ending.id, choices),
    [ending.id, choices],
  );
  const conflicts = useMemo(
    () => choiceConflicts(ending, story.choices),
    [ending, story.choices],
  );
  const locks = locksForEnding(ending);
  const warnings = warningsForEnding(ending.id);
  const pct = stats.required ? Math.round((stats.requiredDone / stats.required) * 100) : 0;

  const chapters = useMemo(() => {
    const seen: StoryChapter[] = [];
    const ids = new Set<string>();
    for (const row of rows) {
      if (ids.has(row.chapter.id)) continue;
      ids.add(row.chapter.id);
      seen.push(row.chapter);
    }
    return seen;
  }, [rows]);

  const [open, setOpen] = useState<string | null>(null);

  const tick = (id: string) => toggleStoryTick(id);
  const choose = (lockId: string, value: string) => {
    setStoryChoice(lockId, story.choices[lockId] === value ? null : value);
  };

  return (
    <>
      <nav className="mb-3 flex flex-wrap items-center gap-2">
        <a
          href={href.story()}
          onClick={onNavClick(href.story())}
          className="btn btn-ghost"
        >
          <Icon path={icons.back} size={14} />
          All endings
        </a>
        <span className="chip" style={{ color, borderColor: color }}>
          {outcomeLabel(ending.outcome)}
        </span>
        <DifficultyDots rank={ending.difficulty.rank} label={ending.difficulty.label} />
      </nav>

      <PageHeader title={ending.name} lead={ending.summary}>
        <button
          type="button"
          className={isTarget ? "btn is-active" : "btn"}
          onClick={() => setStoryTarget(isTarget ? null : ending.id)}
        >
          {isTarget ? "Targeted" : "Set as target"}
        </button>
      </PageHeader>

      <p className="story-epigraph" style={{ color }}>
        {ending.epilogue}
      </p>

      <section className="surface dash-command mb-4">
        <div>
          <p className="dash-command-kicker">Path</p>
          <p className="text-lg font-semibold tabular-nums">
            {stats.requiredDone}
            <span style={{ color: "var(--text-faint)" }}> / {stats.required}</span>
          </p>
          <span className="meter mt-2">
            <i style={{ width: `${pct}%`, background: color }} />
          </span>
        </div>
        {stats.evidenceNeed > 0 && (
          <div>
            <p className="dash-command-kicker">Major evidence</p>
            <p className="text-lg font-semibold tabular-nums">
              {stats.evidenceHave}
              <span style={{ color: "var(--text-faint)" }}>
                {" "}
                / {stats.evidenceNeed} of {stats.evidenceTotal}
              </span>
            </p>
            <span className="meter mt-2">
              <i
                style={{
                  width: `${Math.min(100, (stats.evidenceHave / stats.evidenceNeed) * 100)}%`,
                  background: color,
                }}
              />
            </span>
          </div>
        )}
        <div>
          <p className="dash-command-kicker">Terminal access</p>
          <p className="text-[0.85rem] leading-snug">{ending.accessItem}</p>
        </div>
      </section>

      {conflicts.length > 0 && (
        <section className="story-never mb-4" role="alert">
          <h2 className="text-sm font-semibold">This choice locks a different ending</h2>
          <ul className="mt-2 space-y-1.5 text-[0.82rem] leading-relaxed">
            {conflicts.map((c) => (
              <li key={c.lock.id}>
                You marked <strong>{c.recordedLabel}</strong> on {c.lock.name}. {ending.name} needs{" "}
                <strong>{c.neededLabel}</strong>
                {c.warning ? ` — ${c.warning}` : "."}
              </li>
            ))}
          </ul>
        </section>
      )}

      {stats.next.length > 0 && (
        <section className="surface mb-4 p-4">
          <h2 className="text-sm font-semibold">Do next</h2>
          <p className="mt-0.5 text-[0.75rem]" style={{ color: "var(--text-faint)" }}>
            Active story work, in order. Tick as you finish.
          </p>
          <ol className="mt-3 space-y-2">
            {stats.next.map((row, i) => (
              <li key={row.step.id}>
                <StepRow
                  n={i + 1}
                  row={row}
                  done={stepIsDone(row.step, story.ticks, built)}
                  onTick={() => tick(row.step.id)}
                  onChoose={choose}
                  selected={row.step.choice ? story.choices[row.step.choice.lock] : undefined}
                />
              </li>
            ))}
          </ol>
        </section>
      )}

      {locks.length > 0 && (
        <section className="mb-4">
          <h2 className="mb-2 text-sm font-semibold">The locks — choose these, exactly</h2>
          <ul className="grid grid-cols-1 gap-2 sm:grid-cols-2">
            {locks.map((lock) => (
              <li key={lock.id}>
                <LockCard
                  lock={lock}
                  needed={ending.choices[lock.id]}
                  recorded={story.choices[lock.id]}
                  onChoose={choose}
                />
              </li>
            ))}
          </ul>
        </section>
      )}

      <ol className="space-y-3">
        {chapters.map((chapter) => {
          const steps = rows.filter((r) => r.chapter.id === chapter.id);
          const doneCount = steps.filter((r) => stepIsDone(r.step, story.ticks, built)).length;
          const expanded = open === chapter.id;
          return (
            <li key={chapter.id} className="surface overflow-hidden">
              <button
                type="button"
                className="story-chapter-head"
                aria-expanded={expanded}
                onClick={() => setOpen(expanded ? null : chapter.id)}
              >
                <span
                  className="story-chapter-n"
                  style={{ background: TONE[chapter.tone] ?? color, color: "var(--accent-ink)" }}
                >
                  {chapter.number}
                </span>
                <span className="min-w-0 flex-1 text-left">
                  <span className="block font-semibold">{chapter.name}</span>
                  <span className="mt-0.5 block text-[0.75rem]" style={{ color: "var(--text-faint)" }}>
                    {chapter.howToStart}
                  </span>
                </span>
                <span className="tabular-nums text-[0.75rem]" style={{ color: "var(--text-faint)" }}>
                  {doneCount}/{steps.length}
                </span>
              </button>
              {expanded && (
                <div className="border-t px-3 py-3" style={{ borderColor: "var(--line-soft)" }}>
                  <p className="text-[0.82rem] leading-relaxed" style={{ color: "var(--text-dim)" }}>
                    {chapter.summary}
                  </p>
                  {chapter.maps.length > 0 && (
                    <p className="mt-2 flex flex-wrap gap-1.5">
                      {chapter.maps.map((m) => (
                        <MapChip key={m} map={m} />
                      ))}
                    </p>
                  )}
                  <ol className="mt-3 space-y-2">
                    {steps.map((row) => (
                      <li key={row.step.id}>
                        <StepRow
                          row={row}
                          done={stepIsDone(row.step, story.ticks, built)}
                          onTick={() => tick(row.step.id)}
                          onChoose={choose}
                          selected={row.step.choice ? story.choices[row.step.choice.lock] : undefined}
                        />
                      </li>
                    ))}
                  </ol>
                  {chapter.wiki && (
                    <p className="mt-3">
                      <a
                        className="text-[0.75rem]"
                        href={chapter.wiki}
                        target="_blank"
                        rel="noreferrer"
                        style={{ color: "var(--text-faint)" }}
                      >
                        Wiki: {chapter.name}
                      </a>
                    </p>
                  )}
                </div>
              )}
            </li>
          );
        })}
      </ol>

      {ending.id === "savior" || ending.id === "debtor" ? (
        <EvidencePanel endingId={ending.id} ticks={story.ticks} onTick={tick} />
      ) : null}

      {warnings.length > 0 && (
        <section className="story-never mt-4">
          <h2 className="text-sm font-semibold">Never do these on a {ending.name} run</h2>
          <ul className="mt-2 space-y-1 text-[0.82rem] leading-relaxed">
            {warnings.map((w) => (
              <li key={w.id}>× {w.text}</li>
            ))}
          </ul>
        </section>
      )}

      <RewardsPanel ending={ending} />

      <p className="mt-6 flex flex-wrap gap-2">
        <button type="button" className="btn btn-ghost text-[0.75rem]" onClick={() => resetStory()}>
          Clear story ticks
        </button>
        <a
          className="btn btn-ghost text-[0.75rem]"
          href={ending.wiki}
          target="_blank"
          rel="noreferrer"
        >
          Wiki guide
        </a>
      </p>
    </>
  );
}

function StepRow({
  row,
  done,
  onTick,
  onChoose,
  selected,
  n,
}: {
  row: VisibleStep;
  done: boolean;
  onTick: () => void;
  onChoose: (lockId: string, value: string) => void;
  selected?: string;
  n?: number;
}) {
  const step = row.step;
  const isChoice = step.kind === "choice" && step.choice;
  const chosen = isChoice && selected === step.choice!.value;
  return (
    <div className="story-step" data-done={done || chosen || undefined}>
      {n != null && (
        <span className="story-step-n tabular-nums" style={{ color: "var(--text-faint)" }}>
          {n}
        </span>
      )}
      {!isChoice && <Tick checked={done} label={step.title} onChange={onTick} />}
      <div className="min-w-0 flex-1">
        {isChoice ? (
          <button
            type="button"
            className={chosen ? "story-lock-btn is-on" : "story-lock-btn"}
            onClick={() => onChoose(step.choice!.lock, step.choice!.value)}
          >
            {step.title}
          </button>
        ) : (
          <p className="font-medium leading-snug">{step.title}</p>
        )}
        <p className="mt-0.5 text-[0.75rem] leading-relaxed" style={{ color: "var(--text-dim)" }}>
          {step.detail}
        </p>
        <p className="mt-1 flex flex-wrap gap-1.5">
          {step.maps?.map((m) => (
            <MapChip key={m} map={m} />
          ))}
          {step.location && <span className="chip">{step.location}</span>}
          {step.trader && <span className="chip">{step.trader}</span>}
          {step.hideout && (
            <a className="chip chip-button" href={href.hideout()} onClick={onNavClick(href.hideout())}>
              {step.hideout.station} {step.hideout.level}
            </a>
          )}
          {step.wait && <span className="chip">{step.wait}</span>}
          {step.keys?.map((k) => (
            <span key={k} className="chip">
              {k}
            </span>
          ))}
        </p>
      </div>
    </div>
  );
}

function LockCard({
  lock,
  needed,
  recorded,
  onChoose,
}: {
  lock: StoryLock;
  needed?: string;
  recorded?: string;
  onChoose: (lockId: string, value: string) => void;
}) {
  return (
    <article className="surface-2 p-3">
      <p className="text-[0.72rem] font-semibold uppercase tracking-[0.08em]" style={{ color: "var(--text-faint)" }}>
        {lock.name}
      </p>
      <p className="mt-1 text-[0.8rem] leading-relaxed" style={{ color: "var(--text-dim)" }}>
        {lock.prompt}
      </p>
      <div className="mt-2 flex flex-col gap-1.5">
        {lock.options.map((opt) => {
          const on = recorded === opt.id;
          const want = needed === opt.id;
          return (
            <button
              key={opt.id}
              type="button"
              className={on ? "story-lock-btn is-on" : "story-lock-btn"}
              data-want={want || undefined}
              onClick={() => onChoose(lock.id, opt.id)}
            >
              <span className="block font-semibold">{opt.label}</span>
              <span className="mt-0.5 block text-[0.72rem] font-normal" style={{ opacity: 0.85 }}>
                {opt.hint}
              </span>
            </button>
          );
        })}
      </div>
    </article>
  );
}

function EvidencePanel({
  endingId,
  ticks,
  onTick,
}: {
  endingId: StoryEndingId;
  ticks: Record<string, true>;
  onTick: (id: string) => void;
}) {
  const [minors, setMinors] = useState(false);
  const have = STORY.evidence.filter((e) => ticks[e.id]).length;
  const minorHave = STORY.minorEvidence.filter((e) => ticks[e.id]).length;
  return (
    <section className="surface mt-4 p-4">
      <h2 className="text-sm font-semibold">
        Nine major evidence pieces — hand in any eight
        <span className="ml-2 font-normal tabular-nums" style={{ color: "var(--text-faint)" }}>
          {have} of 9
        </span>
      </h2>
      {endingId === "debtor" && (
        <p className="mt-1 text-[0.78rem]" style={{ color: "var(--danger)" }}>
          Debtor: hand in exactly two, then refuse to continue. Do not collect eight.
        </p>
      )}
      <p className="mt-1 text-[0.75rem]" style={{ color: "var(--text-faint)" }}>
        Optional chapters can be started during Tour. Do not skip Ms. A.
      </p>
      <ul className="mt-3 grid grid-cols-1 gap-2 sm:grid-cols-2">
        {STORY.evidence.map((row, i) => (
          <li key={row.id}>
            <EvidenceRow n={i + 1} row={row} done={!!ticks[row.id]} onTick={() => onTick(row.id)} />
          </li>
        ))}
      </ul>
      <button
        type="button"
        className="btn btn-ghost mt-3 text-[0.75rem]"
        onClick={() => setMinors((v) => !v)}
      >
        {minors ? "Hide" : "Show"} 36 minor evidence ({minorHave}/36, optional achievement)
      </button>
      {minors && (
        <ul className="mt-2 grid grid-cols-1 gap-1 sm:grid-cols-2">
          {STORY.minorEvidence.map((row) => (
            <li key={row.id} className="flex items-center gap-2">
              <Tick checked={!!ticks[row.id]} label={row.name} onChange={() => onTick(row.id)} />
              <span className="text-[0.78rem]">{row.name}</span>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}

function EvidenceRow({
  n,
  row,
  done,
  onTick,
}: {
  n: number;
  row: StoryEvidence;
  done: boolean;
  onTick: () => void;
}) {
  return (
    <div className="story-step" data-done={done || undefined}>
      <span className="story-step-n tabular-nums" style={{ color: "var(--text-faint)" }}>
        {n}
      </span>
      <Tick checked={done} label={row.name} onChange={onTick} />
      <div className="min-w-0 flex-1">
        <p className="font-medium leading-snug">{row.name}</p>
        <p className="text-[0.75rem]" style={{ color: "var(--text-dim)" }}>
          {row.chapterName} · {row.source}
        </p>
        <p className="mt-1 flex flex-wrap gap-1.5">
          {row.map && <MapChip map={row.map} />}
          <span className="chip">{row.howToStart}</span>
        </p>
        {row.note && (
          <p className="mt-1 text-[0.72rem]" style={{ color: "var(--danger)" }}>
            {row.note}
          </p>
        )}
      </div>
    </div>
  );
}

function RewardsPanel({ ending }: { ending: StoryEnding }) {
  const groups = [
    { id: "cosmetic" as const, label: "Cosmetics" },
    { id: "achievement" as const, label: "Achievements" },
    { id: "stash" as const, label: "Stash" },
  ];
  return (
    <section className="surface mt-4 p-4">
      <h2 className="text-sm font-semibold">Rewards for {ending.name}</h2>
      {groups.map((g) => {
        const rows = ending.rewards.filter((r) => r.group === g.id);
        if (!rows.length) return null;
        return (
          <div key={g.id} className="mt-3">
            <p className="eyebrow">{g.label}</p>
            <ul className="mt-1.5 flex flex-wrap gap-1.5">
              {rows.map((r) => (
                <li key={r.name} className="chip">
                  {r.name}
                </li>
              ))}
            </ul>
          </div>
        );
      })}
    </section>
  );
}

function MapChip({ map }: { map: string }) {
  if (map === "terminal") {
    return <span className="chip">{mapLabel(map)}</span>;
  }
  return (
    <a className="chip chip-button" href={href.map(map)} onClick={onNavClick(href.map(map))}>
      {mapLabel(map)}
    </a>
  );
}

function DifficultyDots({ rank, label }: { rank: number; label: string }) {
  return (
    <span className="inline-flex items-center gap-1.5" title={label}>
      <span className="flex gap-0.5" aria-hidden="true">
        {[1, 2, 3, 4].map((n) => (
          <i
            key={n}
            className="story-dot"
            style={{ opacity: n <= rank ? 1 : 0.25, background: "var(--accent)" }}
          />
        ))}
      </span>
      <span className="text-[0.68rem] font-semibold uppercase tracking-[0.08em]" style={{ color: "var(--text-faint)" }}>
        {label}
      </span>
    </span>
  );
}
