import { useEffect } from "react";
import { useStore } from "../store";
import { Icon, icons } from "./ui";

const SHOW_FOR_MS = 10_000;

/**
 * "Marked N earlier tasks done behind your active quests" — with Undo.
 *
 * Marking one quest active can now tick a dozen others done without being
 * asked. That is right far more often than not (a trader will not hand over a
 * quest before its chain is finished), but a change that size should never be
 * silent, and should be one press to take back.
 */
export default function FillNotice() {
  const notice = useStore((s) => s.fillNotice);
  const undo = useStore((s) => s.undoLastFill);
  const dismiss = useStore((s) => s.dismissFillNotice);

  useEffect(() => {
    if (!notice) return;
    const id = window.setTimeout(dismiss, SHOW_FOR_MS);
    return () => window.clearTimeout(id);
  }, [notice, dismiss]);

  if (!notice) return null;
  const n = notice.ids.length;

  return (
    <div className="fill-notice" role="status" aria-live="polite">
      <span className="fill-notice-icon" aria-hidden="true">
        <Icon path={icons.check} size={14} />
      </span>
      <p className="min-w-0 flex-1">
        Marked {n} earlier task{n === 1 ? "" : "s"} done behind your active quests.
      </p>
      <button type="button" className="btn btn-sm flex-none" onClick={undo}>
        Undo
      </button>
      <button
        type="button"
        className="btn btn-ghost btn-icon flex-none"
        aria-label="Dismiss"
        onClick={dismiss}
      >
        <Icon path={icons.close} size={14} />
      </button>
    </div>
  );
}
