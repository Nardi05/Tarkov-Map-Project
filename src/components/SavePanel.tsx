import { useRef, useState } from "react";
import { buildSave, parseSave, saveFileName, SaveFileError, type ParsedSave } from "../lib/save-file";
import { useStore } from "../store";
import { Icon, icons } from "./ui";

/**
 * Backing progress up and moving it between devices.
 *
 * Progress lives in localStorage: one browser, one machine, and gone if the
 * cache is cleared. The TarkovTracker sync used to paper over that; without it
 * this is the honest replacement, and it has the advantage of not depending on
 * anyone else's server still being up.
 *
 * Restoring replaces rather than merges — a save is a complete picture of a
 * moment, and folding it into whatever is already here would produce a state
 * that never existed on either machine. Since that can destroy work, the file
 * is parsed and *described* first, and nothing is written until the numbers
 * have been read and confirmed.
 */
export default function SavePanel({ compact = false }: { compact?: boolean } = {}) {
  const profile = useStore((s) => s.profile);
  const progress = useStore((s) => s.progress);
  const restoreProgress = useStore((s) => s.restoreProgress);

  const fileInput = useRef<HTMLInputElement>(null);
  const [pending, setPending] = useState<(ParsedSave & { name: string }) | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [done, setDone] = useState<string | null>(null);

  const counts = {
    pvp: Object.keys(progress.pvp.taskStatus).length,
    pve: Object.keys(progress.pve.taskStatus).length,
    season: Object.keys(progress.season.taskStatus).length,
  };
  const hasAnything = counts.pvp + counts.pve + counts.season > 0;

  const download = () => {
    const blob = new Blob([JSON.stringify(buildSave(profile, progress), null, 1)], {
      type: "application/json",
    });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = saveFileName(profile.mode);
    a.click();
    // Revoking immediately can cancel the download in some browsers; a tick is
    // enough for the click to have been handed off.
    setTimeout(() => URL.revokeObjectURL(url), 1000);
    setDone(`Saved ${a.download}`);
    setError(null);
  };

  const pick = async (file: File | undefined) => {
    setError(null);
    setDone(null);
    setPending(null);
    if (!file) return;
    try {
      setPending({ ...parseSave(await file.text()), name: file.name });
    } catch (err) {
      setError(err instanceof SaveFileError ? err.message : "That file could not be read.");
    }
  };

  const confirmRestore = () => {
    if (!pending) return;
    restoreProgress(pending.progress, pending.profile ?? undefined);
    const total =
      pending.counts.pvp.tasks + pending.counts.pve.tasks + pending.counts.season.tasks;
    setPending(null);
    setDone(`Restored ${total} task${total === 1 ? "" : "s"} from ${pending.name}.`);
  };

  /*
   * `compact` is the version shown inside the "nothing tracked yet" panel: no
   * heading, and no offer to save an empty profile — just the way back in for
   * someone who has a file from another browser.
   */
  return (
    <section className={compact ? "" : "surface mt-4 p-3"}>
      {!compact && (
        <>
          <h2 className="text-sm font-semibold">Back up or move your progress</h2>
          <p className="mt-0.5 text-[0.72rem] leading-relaxed" style={{ color: "var(--text-faint)" }}>
            Everything is stored in this browser only, so clearing site data loses it. Save a file
            to keep a copy, or to carry a wipe over to another device.
          </p>
        </>
      )}
      {compact && (
        <p className="text-[0.72rem] leading-relaxed" style={{ color: "var(--text-faint)" }}>
          Already set this up on another device? Bring the file over.
        </p>
      )}

      <div className={`flex flex-wrap items-center gap-2 ${compact ? "mt-2 justify-center" : "mt-3"}`}>
        {!compact && (
          <button type="button" className="btn" disabled={!hasAnything} onClick={download}>
            Save to a file
          </button>
        )}
        <button type="button" className="btn" onClick={() => fileInput.current?.click()}>
          Restore from a file
        </button>
        <input
          ref={fileInput}
          type="file"
          accept="application/json,.json"
          className="sr-only"
          onChange={(e) => {
            void pick(e.target.files?.[0]);
            // Cleared so picking the same file twice still fires a change.
            e.target.value = "";
          }}
        />
        {!compact && (
          <span className="text-[0.7rem]" style={{ color: "var(--text-faint)" }}>
            {counts.pvp} PvP · {counts.season} Season · {counts.pve} PvE tracked
          </span>
        )}
      </div>

      {pending && (
        <div className="surface-2 mt-3 p-3">
          <p className="text-[0.78rem] leading-relaxed" style={{ color: "var(--text-dim)" }}>
            <strong style={{ color: "var(--text)" }}>{pending.name}</strong> holds{" "}
            {pending.counts.pvp.tasks} PvP, {pending.counts.season.tasks} Season and{" "}
            {pending.counts.pve.tasks} PvE tasks
            {pending.profile?.level ? `, at level ${pending.profile.level}` : ""}.
          </p>
          <p className="mt-1 text-[0.78rem] leading-relaxed" style={{ color: "var(--danger)" }}>
            {/* Named plainly. A restore is the one action here that can destroy
                a wipe's worth of work, so the count that is about to be
                overwritten is stated rather than implied. */}
            This replaces everything you have now — {counts.pvp} PvP, {counts.season} Season and{" "}
            {counts.pve} PvE tasks —
            and cannot be undone.
          </p>
          <div className="mt-2 flex flex-wrap gap-2">
            <button
              type="button"
              className="btn"
              style={{ color: "var(--danger)" }}
              onClick={confirmRestore}
            >
              Replace my progress
            </button>
            <button type="button" className="btn btn-ghost" onClick={() => setPending(null)}>
              Cancel
            </button>
          </div>
        </div>
      )}

      {error && (
        <p className="mt-2 text-[0.75rem] leading-relaxed" style={{ color: "var(--danger)" }}>
          {error}
        </p>
      )}

      {done && (
        <p
          className="mt-2 flex items-center gap-1.5 text-[0.75rem]"
          style={{ color: "var(--text-dim)" }}
        >
          <Icon path={icons.check} size={14} />
          {done}
        </p>
      )}
    </section>
  );
}
