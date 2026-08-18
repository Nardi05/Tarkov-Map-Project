import { useEffect, useState } from "react";

/**
 * A text input that types instantly but only publishes when you pause.
 *
 * Both search boxes on this site drive genuinely expensive work. The quest
 * dashboard recomputes lock reasons across a 511-task graph; the map's task
 * search lives in the store, so every keystroke re-filtered the markers and
 * rebuilt the whole quest layer on the canvas. Either way the input was
 * repainting a screen's worth of work per character, and typing felt sticky.
 *
 * Returns the immediate value to bind to the input, so the caret never lags,
 * and calls `onSettle` once the typing stops.
 */
export function useDebouncedInput(
  committed: string,
  onSettle: (value: string) => void,
  delay = 160,
) {
  const [draft, setDraft] = useState(committed);

  /*
   * Follow the committed value when it changes from somewhere else — a "clear
   * filters" button, or switching maps. Comparing first matters: assigning on
   * every render would fight the user's own typing.
   */
  useEffect(() => {
    setDraft((current) => (current === committed ? current : committed));
  }, [committed]);

  useEffect(() => {
    if (draft === committed) return;
    const id = setTimeout(() => onSettle(draft), delay);
    return () => clearTimeout(id);
    // `onSettle` is a fresh closure each render for most callers; depending on
    // it would restart the timer on every keystroke and defeat the debounce.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [draft, committed, delay]);

  return [draft, setDraft] as const;
}
