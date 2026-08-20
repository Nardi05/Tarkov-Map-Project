import { useEffect, useRef } from "react";
import { Icon, icons } from "./ui";

/**
 * The keyboard shortcuts, and the sheet that lists them.
 *
 * A map you use with one hand while the other is on a mouse wants keys, and a
 * set of shortcuts nobody can discover may as well not exist — hence `?`, the
 * convention every app that has shortcuts uses, and a hint in the corner the
 * first time round.
 */
export interface Shortcut {
  keys: string[];
  label: string;
}

export const SHORTCUTS: Shortcut[] = [
  { keys: ["/"], label: "Search" },
  { keys: ["0"], label: "Reset map zoom" },
  { keys: ["F"], label: "Fullscreen" },
  { keys: ["H"], label: "Hide the interface" },
  { keys: ["["], label: "Hide or show the side panel" },
  { keys: ["L"], label: "Layers panel" },
  { keys: ["T"], label: "Tasks panel" },
  { keys: ["S"], label: "Settings panel" },
  { keys: ["Esc"], label: "Close what is open" },
  { keys: ["?"], label: "This list" },
];

/**
 * True when a keystroke belongs to whatever the user is typing in.
 *
 * Without this, searching a task list for "flash" would trip Fullscreen,
 * Layers, Settings and Hide-panel on the way through. Includes contentEditable
 * and select, both of which swallow keys meaningfully.
 */
export function isTypingInto(target: EventTarget | null): boolean {
  const el = target as HTMLElement | null;
  if (!el) return false;
  if (el.isContentEditable) return true;
  return ["INPUT", "TEXTAREA", "SELECT"].includes(el.tagName);
}

/** `/` focuses the page search box, the same convention as GitHub and Slack. */
export function useSlashSearch() {
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key !== "/" || e.metaKey || e.ctrlKey || e.altKey) return;
      if (isTypingInto(e.target)) return;
      const box = document.querySelector<HTMLInputElement>("[data-search]");
      if (!box) return;
      e.preventDefault();
      box.focus();
      box.select();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);
}

export default function ShortcutHelp({
  onClose,
  canFullscreen = true,
}: {
  onClose: () => void;
  /** iOS Safari cannot put an element fullscreen, so `F` is left off there. */
  canFullscreen?: boolean;
}) {
  const ref = useRef<HTMLDivElement>(null);
  const opener = useRef<Element | null>(null);

  /* Focus moves in so Escape and Tab belong to the dialog, not the map. */
  useEffect(() => {
    opener.current = document.activeElement;
    ref.current?.focus();
    const returnTo = opener.current;
    return () => {
      // Back where it came from, so `?` twice in a row leaves the keyboard
      // exactly where it started rather than at the top of the document.
      if (returnTo instanceof HTMLElement && document.contains(returnTo)) {
        returnTo.focus({ preventScroll: true });
      }
    };
  }, []);

  /*
   * Tab is kept inside the dialog. It is modal — `aria-modal` promises as much
   * — and a Tab that walked out of it onto the map behind would be a promise
   * the markup makes and the behaviour breaks.
   */
  const onKeyDown = (event: React.KeyboardEvent) => {
    if (event.key === "Escape") {
      event.stopPropagation();
      onClose();
      return;
    }
    if (event.key !== "Tab") return;
    const focusable = ref.current?.querySelectorAll<HTMLElement>(
      'button, [href], input, select, textarea, [tabindex]:not([tabindex="-1"])',
    );
    if (!focusable?.length) return;
    const first = focusable[0];
    const last = focusable[focusable.length - 1];
    if (event.shiftKey && document.activeElement === first) {
      event.preventDefault();
      last.focus();
    } else if (!event.shiftKey && document.activeElement === last) {
      event.preventDefault();
      first.focus();
    }
  };

  return (
    <div
      className="fixed inset-0 z-[1200] grid place-items-center p-4"
      style={{ background: "rgba(4,7,10,.6)" }}
      onClick={onClose}
    >
      <div
        ref={ref}
        role="dialog"
        aria-modal="true"
        aria-label="Keyboard shortcuts"
        tabIndex={-1}
        className="surface animate-in w-full max-w-sm p-4 outline-none"
        style={{ boxShadow: "var(--shadow)" }}
        onClick={(e) => e.stopPropagation()}
        onKeyDown={onKeyDown}
      >
        <div className="mb-3 flex items-center justify-between gap-2">
          <h2 className="text-sm font-semibold">Keyboard shortcuts</h2>
          <button
            type="button"
            className="btn btn-ghost btn-icon"
            aria-label="Close"
            onClick={onClose}
          >
            <Icon path={icons.close} size={16} />
          </button>
        </div>

        <dl className="space-y-1.5">
          {SHORTCUTS.filter((s) => canFullscreen || s.label !== "Fullscreen").map((s) => (
            <div key={s.label} className="flex items-center justify-between gap-3">
              <dt className="text-[0.8125rem]" style={{ color: "var(--text-dim)" }}>
                {s.label}
              </dt>
              <dd className="flex flex-none gap-1">
                {s.keys.map((k) => (
                  <kbd
                    key={k}
                    className="rounded px-1.5 py-0.5 text-[0.7rem] font-medium"
                    style={{
                      border: "1px solid var(--line)",
                      background: "var(--panel-2)",
                      minWidth: "1.6rem",
                      textAlign: "center",
                    }}
                  >
                    {k}
                  </kbd>
                ))}
              </dd>
            </div>
          ))}
        </dl>

        <p className="mt-3 text-[0.7rem] leading-snug" style={{ color: "var(--text-faint)" }}>
          Shortcuts pause while you are typing, so searching for “flash” will not send you
          fullscreen.
        </p>
      </div>
    </div>
  );
}
