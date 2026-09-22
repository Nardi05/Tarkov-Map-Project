import { useMemo, useState } from "react";
import { useHideoutData, useProgression } from "../lib/data";
import { storyChapters, storyKeys } from "../lib/missions";
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
  storylineChaptersFor,
  warningsForEnding,
  type StoryChapter,
  type StoryEnding,
  type StoryEndingId,
  type StoryEvidence,
  type StoryLock,
  type VisibleStep,
} from "../lib/story";
import { useHideout, useKeysOwned, useStore, useStory } from "../store";
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
  const coreChapters = chapters.filter((c) => !c.storyline);
  const lineChapters = storylineChaptersFor(ending.id);

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

      <StoryNeeds ending={ending} built={built} />

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

      {(stats.next.length > 0 || stats.parallel.length > 0) && (
        <section className="surface mb-4 p-4">
          <h2 className="text-sm font-semibold">Do next</h2>
          <p className="mt-0.5 text-[0.75rem]" style={{ color: "var(--text-faint)" }}>
            Core path in order, plus the next step of each evidence storyline you have not finished.
          </p>
          {stats.next.length > 0 && (
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
          )}
          {stats.parallel.length > 0 && (
            <div className="mt-4">
              <p className="eyebrow">Evidence storylines — start these whenever</p>
              <ul className="mt-2 space-y-2">
                {stats.parallel.map((row) => (
                  <li key={row.step.id}>
                    <p className="mb-1 text-[0.72rem] font-semibold" style={{ color: "var(--text-faint)" }}>
                      {row.chapter.name}
                    </p>
                    <StepRow
                      row={row}
                      done={stepIsDone(row.step, story.ticks, built)}
                      onTick={() => tick(row.step.id)}
                      onChoose={choose}
                      selected={row.step.choice ? story.choices[row.step.choice.lock] : undefined}
                    />
                  </li>
                ))}
              </ul>
            </div>
          )}
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

      {lineChapters.length > 0 && (
        <section className="mb-4">
          <h2 className="mb-1 text-sm font-semibold">
            {ending.id === "savior"
              ? "Nine storylines — hand in any eight"
              : ending.id === "debtor"
                ? "Evidence storylines — pick two, then stop"
                : "Storylines"}
          </h2>
          <p className="mb-2 text-[0.75rem]" style={{ color: "var(--text-faint)" }}>
            Full quest guides. Open a chapter for every mission, key, map and item spot.
            {ending.id === "savior" ? " Do not skip Ms. A." : ""}
          </p>
          <ol className="space-y-2">
            {lineChapters.map((chapter) => (
              <li key={chapter.id}>
                <ChapterCard
                  chapter={chapter}
                  rows={rows}
                  ticks={story.ticks}
                  built={built}
                  open={open === chapter.id}
                  onToggle={() => setOpen(open === chapter.id ? null : chapter.id)}
                  onTick={tick}
                  onChoose={choose}
                  choices={story.choices}
                  color={color}
                />
              </li>
            ))}
          </ol>
        </section>
      )}

      <h2 className="mb-2 text-sm font-semibold">Core path</h2>
      <ol className="space-y-3">
        {coreChapters.map((chapter) => {
          const expanded = open === chapter.id;
          return (
            <li key={chapter.id}>
              <ChapterCard
                chapter={chapter}
                rows={rows}
                ticks={story.ticks}
                built={built}
                open={expanded}
                onToggle={() => setOpen(expanded ? null : chapter.id)}
                onTick={tick}
                onChoose={choose}
                choices={story.choices}
                color={color}
              />
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

/**
 * What the rest of this path will ask you to carry.
 *
 * The chapters below say what to do; this says what to bring before you start,
 * which is the question you ask while you are still in the stash. Keys are
 * located by the step that wants them rather than the chapter — a chapter of
 * the evidence hunt can span six maps, and reading a key's location off it
 * told people to take a Labs keycard to Customs.
 */
function StoryNeeds({
  ending,
  built,
}: {
  ending: StoryEnding;
  built: Record<string, number>;
}) {
  const story = useStory();
  const progression = useProgression();
  const keysOwned = useKeysOwned();
  const setKeyOwned = useStore((s) => s.setKeyOwned);

  const views = useMemo(
    () => storyChapters(ending, story.ticks, story.choices, built),
    [ending, story.ticks, story.choices, built],
  );
  const keys = useMemo(
    () => storyKeys(views, progression.data, keysOwned),
    [views, progression.data, keysOwned],
  );

  const remaining = views.filter((v) => !v.complete);
  if (keys.length === 0) return null;

  return (
    <section className="card mb-4">
      <header className="card-head">
        <div className="min-w-0">
          <h2 className="card-title">What to bring</h2>
          <p className="card-sub">
            Doors the {remaining.length} unfinished chapter{remaining.length === 1 ? "" : "s"} of
            this path go through. Tick one when you have it.
          </p>
        </div>
      </header>

      <ul className="grid grid-cols-1 gap-1 sm:grid-cols-2">
        {keys.map((key) => (
          <li
            key={key.id ?? key.name}
            className="surface-2 flex items-center gap-2 p-1.5"
            data-owned={key.owned || undefined}
            style={key.owned ? { opacity: 0.6 } : undefined}
          >
            {key.icon ? (
              <img
                src={key.icon}
                alt=""
                width={24}
                height={24}
                loading="lazy"
                className="flex-none rounded"
                onError={(e) => {
                  e.currentTarget.style.visibility = "hidden";
                }}
              />
            ) : (
              <span
                className="h-6 w-6 flex-none rounded"
                style={{ background: "var(--panel-3)" }}
              />
            )}
            <span className="min-w-0 flex-1">
              <span className="block truncate text-[0.78rem]">{key.name}</span>
              <span className="block truncate text-[0.66rem] faint">
                {key.maps.map(mapLabel).join(", ") || key.wantedBy.map((w) => w.name).join(", ")}
              </span>
            </span>
            {key.id && (
              <button
                type="button"
                className="tick tap-target flex-none"
                data-on={key.owned}
                aria-label={`${key.owned ? "Remove" : "Mark"} ${key.name} as owned`}
                onClick={() => setKeyOwned(key.id!, !key.owned)}
              >
                <Icon path={icons.check} size={11} />
              </button>
            )}
          </li>
        ))}
      </ul>
    </section>
  );
}

function ChapterCard({
  chapter,
  rows,
  ticks,
  built,
  open,
  onToggle,
  onTick,
  onChoose,
  choices,
  color,
}: {
  chapter: StoryChapter;
  rows: VisibleStep[];
  ticks: Record<string, true>;
  built: Record<string, number>;
  open: boolean;
  onToggle: () => void;
  onTick: (id: string) => void;
  onChoose: (lockId: string, value: string) => void;
  choices: Record<string, string>;
  color: string;
}) {
  const steps = rows.filter((r) => r.chapter.id === chapter.id);
  const doneCount = steps.filter((r) => stepIsDone(r.step, ticks, built)).length;
  return (
    <article className="surface overflow-hidden">
      <button type="button" className="story-chapter-head" aria-expanded={open} onClick={onToggle}>
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
      {open && (
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
                  done={stepIsDone(row.step, ticks, built)}
                  onTick={() => onTick(row.step.id)}
                  onChoose={onChoose}
                  selected={row.step.choice ? choices[row.step.choice.lock] : undefined}
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
    </article>
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
        Each piece has a full questline above. Tick here or in the chapter — it is the same box. Do not skip Ms. A.
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
