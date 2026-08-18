import { useEffect, useRef, useState } from "react";
import { matchTasks, CONFIDENT, type Candidate, type OcrMatch } from "../lib/ocr-match";
import { OcrError, readImage, type OcrProgress } from "../lib/ocr";
import { Icon, icons } from "./ui";

/**
 * Reading a trader's task list off a screenshot.
 *
 * An alternative route into the same tick boxes, not a replacement for them.
 * The panel proposes; the player disposes. Nothing is staged until they press
 * the button, every suggestion is a checkbox they can clear, and anything the
 * reader saw but could not place is printed rather than dropped — someone who
 * can see "it read 'Ballistic Analysis' and didn't know it" understands what
 * happened, where a silent miss just looks broken.
 *
 * Confidence decides what starts ticked, never what gets applied. A strong
 * match is pre-ticked to save a click; a weak one is listed unticked so taking
 * it costs a deliberate action rather than an oversight.
 */
export default function ScreenshotImport({
  trader,
  candidates,
  alreadyStaged,
  onApply,
}: {
  trader: string;
  /** This trader's tasks — the closed set a garbled line is matched against. */
  candidates: Candidate[];
  alreadyStaged: (id: string) => boolean;
  onApply: (ids: string[]) => void;
}) {
  const [open, setOpen] = useState(false);
  const [busy, setBusy] = useState<OcrProgress | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [matches, setMatches] = useState<OcrMatch[] | null>(null);
  const [unmatched, setUnmatched] = useState<string[]>([]);
  const [picked, setPicked] = useState<Record<string, boolean>>({});
  const [readCount, setReadCount] = useState(0);
  const fileInput = useRef<HTMLInputElement>(null);

  /* A new trader means new candidates; the last one's reading is meaningless. */
  useEffect(() => {
    setMatches(null);
    setUnmatched([]);
    setPicked({});
    setError(null);
    setReadCount(0);
  }, [trader]);

  const clear = () => {
    setMatches(null);
    setUnmatched([]);
    setPicked({});
  };

  const run = async (files: FileList | null) => {
    if (!files?.length) return;
    // Copied out immediately: the caller clears the input's value straight
    // after calling this, which empties the live FileList before the awaits
    // below get to it — and the count then read as zero.
    const chosenFiles = Array.from(files);
    setError(null);
    setBusy({ phase: "loading", ratio: null });

    try {
      /*
       * Several screenshots are read as one list. A trader panel rarely fits on
       * one screen, and joining the text before matching means a name split
       * across the seam of two shots still has both halves available.
       */
      let text = "";
      for (const file of chosenFiles) {
        text += `${await readImage(file, setBusy)}\n`;
      }

      const result = matchTasks(text, candidates);
      setMatches(result.matches);
      setUnmatched(result.unmatched);
      setPicked(
        Object.fromEntries(
          result.matches
            .filter((m) => !alreadyStaged(m.id))
            .map((m) => [m.id, m.score >= CONFIDENT]),
        ),
      );
      setReadCount(chosenFiles.length);
    } catch (err) {
      setError(err instanceof OcrError ? err.message : "That screenshot could not be read.");
      setMatches(null);
    } finally {
      setBusy(null);
    }
  };

  const chosen = matches?.filter((m) => picked[m.id]) ?? [];

  return (
    <section className="surface-2 mt-3 p-3">
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
          <span className="block text-[0.8125rem] font-medium">
            Read it from a screenshot instead
          </span>
          <span
            className="mt-0.5 block text-[0.7rem] leading-snug"
            style={{ color: "var(--text-faint)" }}
          >
            Screenshot {trader}&rsquo;s task list and let it find the names. You check the result
            before anything is ticked.
          </span>
        </span>
      </button>

      {open && (
        <div className="mt-3">
          <div className="flex flex-wrap items-center gap-2">
            <button
              type="button"
              className="btn"
              disabled={!!busy}
              onClick={() => fileInput.current?.click()}
            >
              {busy ? "Reading…" : matches ? "Read more screenshots" : "Choose screenshots"}
            </button>
            <input
              ref={fileInput}
              type="file"
              accept="image/*"
              multiple
              className="sr-only"
              aria-label={`Screenshots of ${trader}'s task list`}
              onChange={(e) => {
                void run(e.target.files);
                // Cleared so picking the same file twice still fires a change.
                e.target.value = "";
              }}
            />
            <span className="text-[0.7rem]" style={{ color: "var(--text-faint)" }}>
              {/* Said plainly, because "upload" is what everybody will assume. */}
              Stays on your machine — nothing is uploaded.
            </span>
          </div>

          {busy && (
            <div className="mt-3">
              <p className="text-[0.75rem]" style={{ color: "var(--text-dim)" }}>
                {busy.phase === "loading"
                  ? "Starting the text reader (a few megabytes, once per visit)…"
                  : "Reading the screenshot…"}
              </p>
              <div
                className="mt-1.5 h-1 w-full overflow-hidden rounded-full"
                style={{ background: "var(--panel-2)" }}
              >
                <div
                  className="h-full rounded-full transition-[width] duration-200"
                  style={{
                    width: busy.ratio === null ? "35%" : `${Math.round(busy.ratio * 100)}%`,
                    background: "var(--accent)",
                    opacity: busy.ratio === null ? 0.5 : 1,
                  }}
                />
              </div>
            </div>
          )}

          {error && (
            <p className="mt-3 text-[0.75rem] leading-relaxed" style={{ color: "var(--danger)" }}>
              {error}
            </p>
          )}

          {matches && !busy && (
            <div className="mt-3">
              <p className="text-[0.75rem]" style={{ color: "var(--text-dim)" }}>
                Found <strong style={{ color: "var(--text)" }}>{matches.length}</strong> of{" "}
                {trader}&rsquo;s tasks in {readCount} screenshot{readCount === 1 ? "" : "s"}. Tick
                the ones actually in your list.
              </p>

              {matches.length === 0 && (
                <p className="mt-2 text-[0.75rem] leading-relaxed" style={{ color: "var(--text-faint)" }}>
                  Nothing matched. Check the shot shows {trader}&rsquo;s task names and that the
                  text is not too small — a full-screen grab of the task list works best.
                </p>
              )}

              <ul className="mt-2 space-y-1">
                {matches.map((m) => {
                  const staged = alreadyStaged(m.id);
                  return (
                    <li key={m.id}>
                      <label
                        className="surface flex cursor-pointer items-center gap-2.5 p-2"
                        style={staged ? { opacity: 0.6 } : undefined}
                      >
                        <input
                          type="checkbox"
                          className="flex-none"
                          disabled={staged}
                          checked={!staged && !!picked[m.id]}
                          onChange={(e) => setPicked((p) => ({ ...p, [m.id]: e.target.checked }))}
                        />
                        <span className="min-w-0 flex-1">
                          <span className="block text-[0.8125rem] font-medium">{m.name}</span>
                          {/* What it actually read, when that differs — so a
                              wrong guess is explicable rather than mysterious. */}
                          {m.line.toLowerCase() !== m.name.toLowerCase() && (
                            <span
                              className="block text-[0.68rem]"
                              style={{ color: "var(--text-faint)" }}
                            >
                              read as “{m.line}”
                            </span>
                          )}
                        </span>
                        {staged ? (
                          <span className="chip flex-none">already ticked</span>
                        ) : m.score < CONFIDENT ? (
                          <span className="chip flex-none" title="A loose match — worth checking">
                            unsure
                          </span>
                        ) : null}
                      </label>
                    </li>
                  );
                })}
              </ul>

              {unmatched.length > 0 && (
                <details className="mt-2">
                  <summary
                    className="cursor-pointer text-[0.7rem]"
                    style={{ color: "var(--text-faint)" }}
                  >
                    {unmatched.length} line{unmatched.length === 1 ? "" : "s"} it read but could not
                    place
                  </summary>
                  <p
                    className="mt-1 text-[0.68rem] leading-relaxed"
                    style={{ color: "var(--text-faint)" }}
                  >
                    Mostly interface text. If one of these is a real task name, add it by hand in
                    the list below.
                  </p>
                  <p className="mt-1 flex flex-wrap gap-1">
                    {unmatched.slice(0, 24).map((line, i) => (
                      <span key={`${line}-${i}`} className="chip">
                        {line}
                      </span>
                    ))}
                  </p>
                </details>
              )}

              {matches.length > 0 && (
                <div className="mt-3 flex flex-wrap items-center gap-2">
                  <button
                    type="button"
                    className="btn is-active"
                    disabled={chosen.length === 0}
                    onClick={() => {
                      onApply(chosen.map((m) => m.id));
                      clear();
                    }}
                  >
                    Mark {chosen.length || "none"} active
                  </button>
                  <button type="button" className="btn btn-ghost" onClick={clear}>
                    Discard
                  </button>
                  <span className="text-[0.7rem]" style={{ color: "var(--text-faint)" }}>
                    You can still change any of them in the list below.
                  </span>
                </div>
              )}
            </div>
          )}
        </div>
      )}
    </section>
  );
}
