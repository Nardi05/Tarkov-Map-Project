import { useMemo } from "react";
import { LAYERS } from "../lib/layers";
import { swatchSvg } from "../lib/marker-icons";
import { href, onNavClick } from "../lib/router";
import { useStore, useStory, useTaskStatus } from "../store";
import { Card, Icon, icons, Term } from "./ui";

/**
 * What the site shows somebody on their first visit.
 *
 * The problem this solves: everything here is useful *once you have told it
 * something*. An untouched dashboard ranks tasks nobody has, the map draws no
 * quests because none are ticked, and the item tracker counts against an empty
 * stash. Before this, a first-time player saw all three and had no way to know
 * that the blankness was a question being asked of them.
 *
 * So: a short checklist that names the four things worth doing, ticks the ones
 * already done, and goes away — either when they are all done or when it is
 * dismissed. It is not a modal and it is not a tour. Nobody wants either.
 */

interface Step {
  id: string;
  label: string;
  hint: string;
  href: string;
  done: boolean;
}

function useFirstSteps(): Step[] {
  const taskStatus = useTaskStatus();
  const story = useStory();
  const lastMap = useStore((s) => s.lastMap);
  const level = useStore((s) => s.profile.level);

  return useMemo(
    () => [
      {
        id: "level",
        label: "Set your player level",
        hint: "Tasks are gated on it, so the plan is guesswork until it is right.",
        href: href.settings(),
        done: level > 1,
      },
      {
        id: "quests",
        label: "Tell it which quests you have",
        hint: "Tick what is in your trader list. It works out everything behind them.",
        href: href.setup(),
        done: Object.keys(taskStatus).length > 0,
      },
      {
        id: "map",
        label: "Open a map",
        hint: "Your active quests appear on it — spawns, extracts and keys too.",
        href: href.maps(),
        done: Boolean(lastMap),
      },
      {
        id: "story",
        label: "Pick an ending to aim at",
        hint: "Optional. Savior, Survivor, Debtor or Fallen, each with its own path.",
        href: href.story(),
        done: Boolean(story.target),
      },
    ],
    [level, taskStatus, lastMap, story.target],
  );
}

/**
 * The checklist itself.
 *
 * Renders nothing once every step is done or the player has dismissed it, so
 * the caller does not have to know the rules — it can simply place it.
 */
export function FirstSteps() {
  const steps = useFirstSteps();
  const dismissed = useStore((s) => s.ui.firstStepsDismissed);
  const setUiFlag = useStore((s) => s.setUiFlag);

  const remaining = steps.filter((s) => !s.done).length;
  if (dismissed || remaining === 0) return null;

  const done = steps.length - remaining;

  return (
    <Card
      className="animate-in"
      title="Get set up"
      hint={
        <>
          Four things make the rest of the site yours rather than a demo.{" "}
          <span className="tabular-nums">
            {done} of {steps.length} done.
          </span>
        </>
      }
      action={
        <button
          type="button"
          className="btn btn-ghost btn-icon"
          aria-label="Hide the setup checklist"
          title="Hide"
          onClick={() => setUiFlag("firstStepsDismissed", true)}
        >
          <Icon path={icons.close} size={15} />
        </button>
      }
    >
      <ul className="checklist">
        {steps.map((step) => (
          <li key={step.id}>
            <a
              className="check-item"
              href={step.href}
              onClick={onNavClick(step.href)}
              data-done={step.done}
            >
              <span className="check-mark" aria-hidden="true">
                <Icon path={icons.check} size={12} />
              </span>
              <span className="min-w-0 flex-1">
                <span className="block text-[0.85rem] font-medium">{step.label}</span>
                <span className="mt-0.5 block text-meta">{step.hint}</span>
              </span>
              {!step.done && (
                <span className="flex-none faint" aria-hidden="true">
                  <Icon path={icons.forward} size={15} />
                </span>
              )}
            </a>
          </li>
        ))}
      </ul>
    </Card>
  );
}

/**
 * The map's vocabulary, in one card.
 *
 * Colour says *who*, shape says *what* — the single rule that makes every map
 * on the site readable. It was previously hidden inside a collapsed `details`
 * at the bottom of the map list, which is the last place somebody who needs it
 * would look.
 */
const PRIMER_LAYERS = [
  "pmc-spawns",
  "scav-spawns",
  "pmc-extracts",
  "transits",
  "quests",
  "keys",
  "boss-spawns",
  "hazards",
];

export function MapLegend({ limit = 6 }: { limit?: number }) {
  const items = PRIMER_LAYERS.slice(0, limit)
    .map((id) => LAYERS.find((l) => l.id === id))
    .filter((l): l is (typeof LAYERS)[number] => Boolean(l));

  return (
    <ul className="legend">
      {items.map((layer) => (
        <li key={layer.id} className="legend-item">
          <span
            className="mt-0.5 flex-none"
            aria-hidden="true"
            dangerouslySetInnerHTML={{ __html: swatchSvg(layer.shape, layer.color, 20) }}
          />
          <div className="min-w-0">
            <p className="text-[0.8125rem] font-medium">{layer.label}</p>
            <p className="mt-0.5 text-[0.72rem] leading-snug faint">{layer.hint}</p>
          </div>
        </li>
      ))}
    </ul>
  );
}

/** The legend wrapped in its explanation, for the maps page. */
export function MapPrimer() {
  return (
    <Card
      title="How to read a map"
      hint={
        <>
          Colour is <em>who</em> it belongs to. Shape is <em>what</em> it is — so a blue square is
          a <Term id="pmc" /> <Term id="extract">extract</Term> on every map on the site.
        </>
      }
    >
      <MapLegend limit={8} />
    </Card>
  );
}
