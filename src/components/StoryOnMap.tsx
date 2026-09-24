import { useMemo, useState } from "react";
import { useHideoutData } from "../lib/data";
import { href, onNavClick } from "../lib/router";
import { endingById, hideoutLevels, storyStepsOnMap } from "../lib/story";
import { useHideout, useStore, useStory } from "../store";
import { Icon, icons, Tick } from "./ui";

/**
 * The story tracker's contribution to a map: what your target ending still
 * needs doing here. Story steps carry a named location rather than
 * coordinates, so they are listed beside the map instead of pinned on it.
 */
export default function StoryOnMap({ map }: { map: string }) {
  const story = useStory();
  const hideout = useHideout();
  const stations = useHideoutData().data?.stations;
  const toggleStoryTick = useStore((s) => s.toggleStoryTick);
  const [open, setOpen] = useState(true);

  const ending = endingById(story.target);
  const rows = useMemo(
    () => storyStepsOnMap(story, map, hideoutLevels(stations, hideout)),
    [story, map, stations, hideout],
  );

  if (!ending || rows.length === 0) return null;

  return (
    <section className="story-on-map mb-2">
      <button
        type="button"
        className="story-on-map-head"
        aria-expanded={open}
        onClick={() => setOpen((v) => !v)}
      >
        <Icon path={icons.book} size={14} />
        <span className="min-w-0 flex-1 truncate text-left">
          Story here · {ending.name}
        </span>
        <span className="chip">{rows.length}</span>
        <span style={{ transform: open ? "rotate(180deg)" : undefined, display: "flex" }}>
          <Icon path={icons.chevron} size={13} />
        </span>
      </button>
      {open && (
        <>
          <ul className="mt-1.5 space-y-1">
            {rows.map(({ step, chapter }) => (
              <li key={step.id} className="surface-2 flex items-start gap-2 p-2">
                <Tick
                  checked={false}
                  label={`Mark "${step.title}" done`}
                  onChange={() => toggleStoryTick(step.id)}
                />
                <div className="min-w-0 flex-1">
                  <p className="text-[0.78rem] font-medium leading-snug">{step.title}</p>
                  <p className="mt-0.5 text-[0.68rem] leading-snug faint">
                    {step.location ? `${step.location} · ` : ""}
                    {chapter.name}
                  </p>
                </div>
              </li>
            ))}
          </ul>
          <a
            className="mt-1.5 inline-block text-[0.7rem] underline underline-offset-2 faint"
            href={href.story(ending.id)}
            onClick={onNavClick(href.story(ending.id))}
          >
            Open the {ending.name} guide
          </a>
        </>
      )}
    </section>
  );
}
