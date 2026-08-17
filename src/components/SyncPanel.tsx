import { useState } from "react";
import {
  fetchProgress,
  looksLikeToken,
  parsePasted,
  toImport,
  TrackerError,
  type ImportResult,
} from "../lib/tarkov-tracker";
import { useStore } from "../store";
import type { Progression } from "../types";
import { Icon, icons } from "./ui";

/**
 * Bringing an existing wipe into the site.
 *
 * Two routes, both client-side: a TarkovTracker token, or a pasted export for
 * anyone who would rather not hand a credential to a fan site. There is no
 * third route for people who use neither, and that is fine — the dashboard's
 * search and "+ before" get a profile seeded in about a minute, which is the
 * honest alternative to guessing.
 */
export default function SyncPanel({ progression }: { progression: Progression | null }) {
  const storedToken = useStore((s) => s.trackerToken);
  const setTrackerToken = useStore((s) => s.setTrackerToken);
  const importTaskStatus = useStore((s) => s.importTaskStatus);
  const setProfile = useStore((s) => s.setProfile);
  const mode = useStore((s) => s.profile.mode);

  const [open, setOpen] = useState(false);
  const [token, setToken] = useState(storedToken ?? "");
  // On by default: re-syncing after a session is the normal case, and the
  // token is read-only progression scope in the player's own browser. The
  // checkbox is right there, and "Forget token" removes it.
  const [remember, setRemember] = useState(true);
  const [paste, setPaste] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [result, setResult] = useState<(ImportResult & { mode: string }) | null>(null);

  const apply = (imported: ImportResult) => {
    importTaskStatus(imported.taskStatus);
    if (imported.level) setProfile("level", imported.level);
    if (imported.faction) setProfile("faction", imported.faction);
    setResult({ ...imported, mode: mode === "pve" ? "PvE" : "PvP" });
    setError(null);
  };

  const knownTasks = new Set(Object.keys(progression?.tasks ?? {}));

  const syncFromApi = async () => {
    setError(null);
    setResult(null);
    if (!looksLikeToken(token)) {
      setError("That does not look like a token. Paste the value itself, without “Bearer”.");
      return;
    }
    setBusy(true);
    try {
      const data = await fetchProgress(token);
      apply(toImport(data, knownTasks));
      setTrackerToken(remember ? token.trim() : null);
    } catch (err) {
      setError(err instanceof TrackerError ? err.message : "The import failed unexpectedly.");
    } finally {
      setBusy(false);
    }
  };

  const syncFromPaste = () => {
    setError(null);
    setResult(null);
    try {
      apply(toImport(parsePasted(paste), knownTasks));
      setPaste("");
    } catch (err) {
      setError(err instanceof TrackerError ? err.message : "That paste could not be read.");
    }
  };

  return (
    <section className="surface mt-4 p-3">
      <button
        type="button"
        className="flex w-full items-start gap-2 text-left"
        aria-expanded={open}
        onClick={() => setOpen((v) => !v)}
      >
        <span
          className="mt-0.5 flex-none transition-transform"
          style={{ color: "var(--text-faint)", transform: open ? undefined : "rotate(-90deg)" }}
        >
          <Icon path={icons.chevron} size={16} />
        </span>
        <span className="min-w-0">
          <span className="block text-sm font-semibold">Already mid-wipe? Import your progress</span>
          <span
            className="mt-0.5 block text-[0.7rem] leading-snug"
            style={{ color: "var(--text-faint)" }}
          >
            Pull everything you have finished from TarkovTracker in one step, instead of ticking it
            by hand.
          </span>
        </span>
      </button>

      {open && (
        <div className="mt-3 space-y-4">
          <div>
            <h3 className="text-[0.7rem] font-semibold uppercase tracking-[0.09em]" style={{ color: "var(--text-dim)" }}>
              With a TarkovTracker token
            </h3>
            <p className="mt-1 text-[0.72rem] leading-relaxed" style={{ color: "var(--text-faint)" }}>
              Create one under Settings → API on{" "}
              <a
                className="underline"
                href="https://tarkovtracker.io/settings/"
                target="_blank"
                rel="noreferrer noopener"
              >
                tarkovtracker.io
              </a>{" "}
              with the <em>read progression</em> permission. The request goes from your browser
              straight to them — this site has no server in the path and never sees the token.
            </p>

            <div className="mt-2 flex flex-wrap items-center gap-2">
              <input
                className="input"
                style={{ maxWidth: "22rem" }}
                type="password"
                autoComplete="off"
                spellCheck={false}
                placeholder="API token"
                value={token}
                onChange={(e) => setToken(e.target.value)}
                aria-label="TarkovTracker API token"
              />
              <button type="button" className="btn" disabled={busy} onClick={syncFromApi}>
                {busy ? "Importing…" : "Import"}
              </button>
              {storedToken && (
                <button
                  type="button"
                  className="btn btn-ghost text-[0.72rem]"
                  onClick={() => {
                    setTrackerToken(null);
                    setToken("");
                    setRemember(false);
                  }}
                >
                  Forget token
                </button>
              )}
            </div>

            <label className="mt-2 flex items-center gap-2 text-[0.72rem]" style={{ color: "var(--text-dim)" }}>
              <input
                type="checkbox"
                checked={remember}
                onChange={(e) => setRemember(e.target.checked)}
              />
              Keep the token in this browser so re-syncing is one click
            </label>
          </div>

          <div>
            <h3 className="text-[0.7rem] font-semibold uppercase tracking-[0.09em]" style={{ color: "var(--text-dim)" }}>
              Or paste an export
            </h3>
            <p className="mt-1 text-[0.72rem] leading-relaxed" style={{ color: "var(--text-faint)" }}>
              Any JSON with a <code>tasksProgress</code> array — a TarkovTracker export, or the
              response from their API.
            </p>
            <textarea
              className="input mt-2 font-mono text-[0.7rem]"
              rows={3}
              placeholder='{"data":{"tasksProgress":[…]}}'
              value={paste}
              onChange={(e) => setPaste(e.target.value)}
              aria-label="Pasted progress export"
            />
            <button
              type="button"
              className="btn mt-2"
              disabled={!paste.trim()}
              onClick={syncFromPaste}
            >
              Import pasted
            </button>
          </div>

          {error && (
            <p className="text-[0.75rem] leading-relaxed" style={{ color: "var(--danger)" }}>
              {error}
            </p>
          )}

          {result && (
            <div
              className="surface-2 p-3 text-[0.75rem] leading-relaxed"
              style={{ color: "var(--text-dim)" }}
            >
              <p>
                Imported <strong style={{ color: "var(--text)" }}>{result.matched}</strong> finished
                task{result.matched === 1 ? "" : "s"} into your {result.mode} progress
                {result.displayName ? ` from ${result.displayName}` : ""}
                {result.level ? `, at level ${result.level}` : ""}.
              </p>
              {result.unknown > 0 && (
                <p className="mt-1">
                  {result.unknown} finished task{result.unknown === 1 ? "" : "s"} had an id this
                  site's data doesn't know — most likely quests removed or renamed since.
                </p>
              )}
              {result.failed > 0 && (
                <p className="mt-1">
                  {result.failed} failed task{result.failed === 1 ? "" : "s"} left alone: there is
                  nowhere here to record a failure, and marking them done would be a lie.
                </p>
              )}
              <p className="mt-1">
                Nothing you ticked yourself was overwritten. TarkovTracker records what is finished,
                not what you have accepted at a trader — so mark your current tasks active below and
                the maps will draw exactly those.
              </p>
            </div>
          )}
        </div>
      )}
    </section>
  );
}
