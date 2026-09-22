import { href, navigate } from "../lib/router";
import type { RaidPick } from "../lib/next-raid";
import { Icon, icons } from "./ui";

/** How many task names a card lists before it starts counting instead. */
const NAME_CAP = 6;

/**
 * Ranked "queue this map" list, built from active tasks.
 *
 * The names used to be joined into one sentence, which on Customs meant a
 * twenty-seven-item run-on paragraph that told you nothing you could act on —
 * the card's job is "queue here", not "here is your whole quest log". Six
 * names and a count answers the question and stays the same height on every
 * card, so the row reads as a ranking rather than a wall.
 */
export default function NextRaid({
  picks,
  emptyHint,
}: {
  picks: RaidPick[];
  emptyHint?: string;
}) {
  if (picks.length === 0) {
    return (
      <p className="text-meta">
        {emptyHint ?? "Tick a task active and this will tell you which map to queue."}
      </p>
    );
  }

  return (
    <ul className="grid grid-cols-1 gap-2.5 sm:grid-cols-2">
      {picks.map((pick, i) => {
        const best = i === 0 && pick.active.length > 0;
        const shown = pick.active.slice(0, NAME_CAP);
        const extra = pick.active.length - shown.length;

        return (
          <li key={pick.map.normalizedName}>
            <a
              href={href.map(pick.map.normalizedName)}
              onClick={(e) => {
                if (e.metaKey || e.ctrlKey || e.shiftKey || e.button !== 0) return;
                e.preventDefault();
                navigate(href.map(pick.map.normalizedName));
              }}
              className="surface-2 map-card flex h-full flex-col gap-2 p-3.5"
            >
              <span className="flex items-center justify-between gap-2">
                <span className="text-sm font-semibold">{pick.map.name}</span>
                <span className={best ? "badge badge-accent flex-none" : "badge flex-none"}>
                  {best ? "best raid" : `#${i + 1}`}
                </span>
              </span>

              {shown.length > 0 ? (
                <span className="flex flex-wrap gap-1">
                  {shown.map((t) => (
                    <span key={t.id} className="chip max-w-full truncate">
                      {t.name}
                    </span>
                  ))}
                  {extra > 0 && <span className="chip chip-accent">+{extra} more</span>}
                </span>
              ) : (
                <span className="text-meta">No active tasks here — documents only</span>
              )}

              <span className="mt-auto flex items-center gap-1.5 pt-1 text-[0.68rem] faint">
                {pick.active.length > 0 && (
                  <span className="tabular-nums">
                    {pick.active.length} active task{pick.active.length === 1 ? "" : "s"}
                  </span>
                )}
                {pick.active.length > 0 && pick.documents > 0 && <span aria-hidden="true">·</span>}
                {pick.documents > 0 && (
                  <span className="tabular-nums">
                    {pick.documents} document spawn{pick.documents === 1 ? "" : "s"}
                  </span>
                )}
                <span className="ml-auto inline-flex items-center gap-1">
                  Open map
                  <Icon path={icons.forward} size={12} />
                </span>
              </span>
            </a>
          </li>
        );
      })}
    </ul>
  );
}
