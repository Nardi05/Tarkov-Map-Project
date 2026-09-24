import { useMemo, useState } from "react";
import { href, navigate, onNavClick } from "../lib/router";
import {
  STORY,
  chaptersForSetup,
  choiceConflicts,
  effectiveChoices,
  endingById,
  mapLabel,
  outcomeLabel,
  type SetupChapter,
  type StoryEndingId,
} from "../lib/story";
import { useStore, useStory } from "../store";
import PageShell from "./PageShell";
import { Callout, EmptyState, Icon, icons, Tick } from "./ui";

/**
 * Story setup: which ending, which choices are already locked in, and which
 * chapters are behind you.
 *
 * Separate from the task setup because the story advances on its own track —
 * somebody deep into their trader lists can be at chapter one, and the other
 * way round. Like the task walkthrough, nothing is written until Finish, and
 * it only ever adds: ticks made on the story page are never removed here.
 */

const STEP_TITLES = ["Ending", "Choices made", "Chapters done", "Save"];

export default function StorySetup() {
  const story = useStory();
  const importStory = useStore((s) => s.importStory);
  const setEntry = useStore((s) => s.setEntry);

  const [step, setStep] = useState(0);
  const [target, setTarget] = useState<StoryEndingId | null>(
    endingById(story.target)?.id ?? null,
  );
  const [choices, setChoices] = useState<Record<string, string>>(story.choices);
  const [chapters, setChapters] = useState<Set<string>>(new Set());
  const [finished, setFinished] = useState(false);

  const ending = endingById(target);
  const planned = useMemo(() => effectiveChoices(ending, choices), [ending, choices]);
  const available = useMemo(() => chaptersForSetup(target, planned), [target, planned]);

  /* Chapters already fully ticked on the story page. Shown done, not re-asked. */
  const alreadyDone = useMemo(
    () =>
      new Set(
        available
          .filter((row) => row.stepIds.every((id) => story.ticks[id]))
          .map((row) => row.chapter.id),
      ),
    [available, story.ticks],
  );

  const chosen = available.filter((row) => chapters.has(row.chapter.id));
  const newTicks = chosen.flatMap((row) => row.stepIds).filter((id) => !story.ticks[id]);
  const conflicts = ending ? choiceConflicts(ending, choices) : [];

  const toggleChapter = (id: string) =>
    setChapters((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });

  const choose = (lockId: string, value: string | null) =>
    setChoices((prev) => {
      const next = { ...prev };
      if (value) next[lockId] = value;
      else delete next[lockId];
      return next;
    });

  const finish = () => {
    importStory({ target, choices, ticks: chosen.flatMap((row) => row.stepIds) });
    setEntry("tracker");
    setFinished(true);
  };

  const last = STEP_TITLES.length - 1;

  if (finished) {
    return (
      <Shell step={last} done>
        <h1 className="display text-2xl sm:text-3xl">Story set up</h1>
        <p className="mt-2 max-w-xl text-sm leading-relaxed muted">
          {ending
            ? `Aiming for ${ending.name}. `
            : "No ending picked yet — the story page will ask when you are ready. "}
          {newTicks.length
            ? `${newTicks.length} step${newTicks.length === 1 ? "" : "s"} marked done.`
            : "Nothing new marked done."}{" "}
          Maps now show the story steps that happen on them.
        </p>
        <div className="mt-4 flex flex-wrap gap-2">
          <a
            className="btn is-active"
            href={href.story(ending?.id)}
            onClick={onNavClick(href.story(ending?.id))}
          >
            {ending ? `Open the ${ending.name} guide` : "Open the story"}
          </a>
          <a className="btn" href={href.dashboard()} onClick={onNavClick(href.dashboard())}>
            Open the dashboard
          </a>
          <button type="button" className="btn" onClick={() => navigate(href.setup())}>
            Set up tasks too
          </button>
        </div>
      </Shell>
    );
  }

  return (
    <Shell step={step}>
      {step === 0 && (
        <>
          <h1 className="display text-2xl sm:text-3xl">Set up your story</h1>
          <p className="mt-3 max-w-2xl text-[0.95rem] leading-relaxed muted">
            The story is tracked apart from trader tasks. Pick the ending you are going for, tell
            it the choices you have already made, and tick the chapters behind you. You can change
            any of it later on the story page.
          </p>
          <div className="mt-5 grid gap-2 sm:grid-cols-2">
            {STORY.endings.map((row) => (
              <button
                key={row.id}
                type="button"
                className={target === row.id ? "story-lock-btn is-on" : "story-lock-btn"}
                aria-pressed={target === row.id}
                onClick={() => setTarget(row.id)}
              >
                <span className="block text-[0.66rem] font-semibold uppercase tracking-[0.1em] opacity-80">
                  {outcomeLabel(row.outcome)} · {row.difficulty.label}
                </span>
                <span className="mt-0.5 block text-base font-semibold">{row.name}</span>
                <span className="mt-0.5 block text-[0.75rem] font-normal opacity-85">
                  {row.tagline}
                </span>
              </button>
            ))}
            <button
              type="button"
              className={target === null ? "story-lock-btn is-on sm:col-span-2" : "story-lock-btn sm:col-span-2"}
              aria-pressed={target === null}
              onClick={() => setTarget(null)}
            >
              <span className="block font-semibold">Not decided yet</span>
              <span className="mt-0.5 block text-[0.75rem] font-normal opacity-85">
                You can still mark the chapters every ending shares.
              </span>
            </button>
          </div>
        </>
      )}

      {step === 1 && (
        <>
          <h1 className="text-2xl font-semibold tracking-tight">Choices you have made</h1>
          <p className="mt-2 max-w-2xl text-[0.9rem] leading-relaxed muted">
            These are permanent in game. Only record the ones you have actually reached —
            {ending ? ` the option ${ending.name} needs is marked.` : " leave the rest as not reached."}
          </p>
          {conflicts.length > 0 && (
            <Callout tone="danger" className="mt-4" icon={icons.info}>
              {conflicts.map((c) => (
                <p key={c.lock.id}>
                  <b className="font-semibold">{c.lock.name}:</b> you picked {c.recordedLabel}, but{" "}
                  {ending!.name} needs {c.neededLabel}.
                </p>
              ))}
            </Callout>
          )}
          <div className="mt-4 grid gap-3">
            {STORY.locks.map((lock) => (
              <article key={lock.id} className="surface-2 p-3">
                <p className="kicker">{lock.name}</p>
                <p className="mt-1 text-[0.8rem] leading-relaxed muted">{lock.prompt}</p>
                <div className="mt-2 flex flex-col gap-1.5">
                  {lock.options.map((opt) => (
                    <button
                      key={opt.id}
                      type="button"
                      className={choices[lock.id] === opt.id ? "story-lock-btn is-on" : "story-lock-btn"}
                      data-want={ending?.choices[lock.id] === opt.id || undefined}
                      aria-pressed={choices[lock.id] === opt.id}
                      onClick={() => choose(lock.id, opt.id)}
                    >
                      <span className="block font-semibold">
                        {opt.label}
                        {ending?.choices[lock.id] === opt.id && (
                          <span className="chip chip-accent ml-2">{ending.name}</span>
                        )}
                      </span>
                      <span className="mt-0.5 block text-[0.72rem] font-normal opacity-85">
                        {opt.hint}
                      </span>
                    </button>
                  ))}
                  <button
                    type="button"
                    className={!choices[lock.id] ? "story-lock-btn is-on" : "story-lock-btn"}
                    aria-pressed={!choices[lock.id]}
                    onClick={() => choose(lock.id, null)}
                  >
                    <span className="block font-semibold">Not reached yet</span>
                  </button>
                </div>
              </article>
            ))}
          </div>
        </>
      )}

      {step === 2 && (
        <>
          <h1 className="text-2xl font-semibold tracking-tight">Chapters you have finished</h1>
          <p className="mt-2 max-w-2xl text-[0.9rem] leading-relaxed muted">
            Tick a chapter to mark every step in it done
            {ending ? ` on the ${ending.name} path` : ""}. Half-finished ones are easier to tick
            step by step on the story page.
          </p>
          {available.length === 0 ? (
            <EmptyState title="No chapters to show" hint="Go back and pick an ending." />
          ) : (
            <>
              <ChapterList
                title="Main story"
                rows={available.filter((r) => !r.chapter.storyline)}
                chosen={chapters}
                alreadyDone={alreadyDone}
                onToggle={toggleChapter}
              />
              <ChapterList
                title="Evidence storylines"
                rows={available.filter((r) => r.chapter.storyline)}
                chosen={chapters}
                alreadyDone={alreadyDone}
                onToggle={toggleChapter}
              />
            </>
          )}
        </>
      )}

      {step === 3 && (
        <>
          <h1 className="text-2xl font-semibold tracking-tight">Ready to save</h1>
          <dl className="surface mt-4 divide-y p-0" style={{ borderColor: "var(--line-soft)" }}>
            <SummaryRow label="Ending" value={ending ? ending.name : "Not decided"} />
            <SummaryRow
              label="Choices recorded"
              value={`${Object.keys(choices).length} of ${STORY.locks.length}`}
            />
            <SummaryRow
              label="Chapters to mark done"
              value={`${chosen.length} (${newTicks.length} new step${newTicks.length === 1 ? "" : "s"})`}
            />
          </dl>
          <p className="mt-3 text-meta">
            Nothing already ticked on the story page is removed.
          </p>
        </>
      )}

      <footer className="mt-6 flex flex-wrap items-center gap-2 border-t pt-4" style={{ borderColor: "var(--line)" }}>
        <button type="button" className="btn" disabled={step === 0} onClick={() => setStep((s) => s - 1)}>
          Back
        </button>
        {step < last ? (
          <button type="button" className="btn btn-primary" onClick={() => setStep((s) => s + 1)}>
            Next
          </button>
        ) : (
          <button type="button" className="btn btn-primary" onClick={finish}>
            Finish
          </button>
        )}
        {step > 0 && step < last && (
          <button type="button" className="btn" onClick={finish}>
            Save and finish
          </button>
        )}
        <a className="btn btn-ghost ml-auto text-[0.72rem]" href={href.story()} onClick={onNavClick(href.story())}>
          Cancel
        </a>
      </footer>
    </Shell>
  );
}

function Shell({ step, done, children }: { step: number; done?: boolean; children: React.ReactNode }) {
  return (
    <PageShell
      back={{ to: href.story(), label: "Story" }}
      aside={
        <span className="text-[0.72rem] tabular-nums faint">
          {done ? "Done" : `Step ${step + 1} of ${STEP_TITLES.length} · ${STEP_TITLES[step]}`}
        </span>
      }
    >
      <div
        className="mb-6 h-1.5 w-full overflow-hidden rounded-full"
        style={{ background: "var(--panel-2)" }}
        role="progressbar"
        aria-valuenow={step + 1}
        aria-valuemin={1}
        aria-valuemax={STEP_TITLES.length}
        aria-label="Story setup progress"
      >
        <div
          className="h-full rounded-full transition-[width] duration-200"
          style={{
            width: `${((done ? STEP_TITLES.length : step + 1) / STEP_TITLES.length) * 100}%`,
            background: "var(--accent)",
          }}
        />
      </div>
      {children}
    </PageShell>
  );
}

function ChapterList({
  title,
  rows,
  chosen,
  alreadyDone,
  onToggle,
}: {
  title: string;
  rows: SetupChapter[];
  chosen: Set<string>;
  alreadyDone: Set<string>;
  onToggle: (id: string) => void;
}) {
  if (!rows.length) return null;
  return (
    <section className="mt-5">
      <h2 className="kicker">{title}</h2>
      <ul className="mt-2 space-y-1">
        {rows.map(({ chapter, stepIds }) => {
          const done = alreadyDone.has(chapter.id);
          return (
            <li key={chapter.id} className="surface-2 flex items-start gap-2.5 p-2.5">
              {done ? (
                <span className="tick" data-on="true" aria-hidden="true">
                  <Icon path={icons.check} size={11} />
                </span>
              ) : (
                <Tick
                  checked={chosen.has(chapter.id)}
                  label={`Mark ${chapter.name} done`}
                  onChange={() => onToggle(chapter.id)}
                />
              )}
              <div className="min-w-0 flex-1">
                <p className="text-[0.85rem] font-medium">
                  {chapter.storyline ? "" : `${chapter.number}. `}
                  {chapter.name}
                  {done && <span className="chip ml-2">already ticked</span>}
                </p>
                <p className="mt-0.5 text-[0.7rem] faint">
                  {stepIds.length} step{stepIds.length === 1 ? "" : "s"}
                  {chapter.maps.length ? ` · ${chapter.maps.map(mapLabel).join(", ")}` : ""}
                </p>
              </div>
            </li>
          );
        })}
      </ul>
    </section>
  );
}

function SummaryRow({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex items-baseline justify-between gap-3 px-3.5 py-2.5">
      <dt className="text-[0.8rem] muted">{label}</dt>
      <dd className="text-[0.9rem] font-semibold">{value}</dd>
    </div>
  );
}
